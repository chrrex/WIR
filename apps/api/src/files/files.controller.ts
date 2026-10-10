import { BadRequestException, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { Response } from 'express';
import { PrismaService } from '../common/prisma.service';
import { CurrentUser, SessionUser } from '../auth/decorators';
import { ContentService } from '../content/content.service';

const STORAGE_DIR = path.resolve(process.env.STORAGE_DIR ?? path.join(process.cwd(), '.data', 'uploads'));
const MAX_BYTES = 12 * 1024 * 1024;
const OFFICE: Record<string, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

/**
 * Bilder für News, Social, Übergaben und Chat.
 * Jedes Bild wird neu berechnet: Metadaten (z. B. GPS-Ort aus Handyfotos) fallen weg,
 * Größe max. 2000 px, Format WebP. Speicher: lokales Verzeichnis (später S3-kompatibel, EU).
 */
@Controller('files')
export class FilesController {
  constructor(private readonly prisma: PrismaService, private readonly content: ContentService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_BYTES, files: 1 } }))
  async upload(@CurrentUser() me: SessionUser, @UploadedFile() file?: { buffer: Buffer; originalname: string; mimetype: string; size: number }) {
    if (!file) throw new BadRequestException('Keine Datei empfangen.');
    let out: Buffer;
    try {
      const img = sharp(file.buffer, { failOn: 'error', limitInputPixels: 50_000_000 });
      const meta = await img.metadata();
      if (!meta.format || !['jpeg', 'png', 'webp', 'heif', 'gif', 'avif'].includes(meta.format)) throw new Error('format');
      out = await img.rotate().resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
    } catch {
      throw new BadRequestException('Bitte lade ein Foto hoch (JPG, PNG, WebP oder HEIC).');
    }
    return this.save(out, 'image/webp', 'webp', file.originalname, me.id);
  }

  /** Dokumente (PDF, Word, Excel, PowerPoint) – unverändert gespeichert, Typ per Dateikennung geprüft. */
  @Post('document')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024, files: 1 } }))
  async uploadDocument(@CurrentUser() me: SessionUser, @UploadedFile() file?: { buffer: Buffer; originalname: string }) {
    if (!file) throw new BadRequestException('Keine Datei empfangen.');
    const ext = path.extname(file.originalname).slice(1).toLowerCase();
    const isPdf = file.buffer.subarray(0, 5).toString() === '%PDF-';
    const isZip = file.buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    const mime = ext === 'pdf' && isPdf ? 'application/pdf' : isZip ? OFFICE[ext] : undefined;
    if (!mime) throw new BadRequestException('Bitte lade eine PDF-, Word-, Excel- oder PowerPoint-Datei hoch.');
    return this.save(file.buffer, mime, ext, file.originalname, me.id);
  }

  private async save(data: Buffer, mimeType: string, ext: string, name: string, userId: string) {
    const id = randomUUID();
    const rel = path.join(new Date().toISOString().slice(0, 7), `${id}.${ext}`);
    await mkdir(path.join(STORAGE_DIR, path.dirname(rel)), { recursive: true });
    await writeFile(path.join(STORAGE_DIR, rel), data);
    await this.prisma.db.fileObject.create({
      data: {
        id, storageKey: rel, originalFilename: name.slice(0, 200).replace(/[^\w.\- äöüÄÖÜß]/g, '_'), mimeType,
        sizeBytes: BigInt(data.length), checksumSha256: createHash('sha256').update(data).digest('hex'), scanStatus: 'CLEAN', uploadedById: userId,
      },
    });
    return { id, size: data.length };
  }

  @Get(':id')
  async get(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const db = this.prisma.db;
    const fo = await db.fileObject.findFirst({ where: { id, deletedAt: null } });
    if (!fo) throw new NotFoundException();
    let allowed = fo.uploadedById === me.id;
    if (!allowed) {
      const atts = await db.attachment.findMany({ where: { fileObjectId: id } });
      for (const a of atts) {
        if (a.contentItemId) {
          const ok = await db.contentItem.count({ where: { id: a.contentItemId, ...this.content.visibleWhere(me.id) } });
          if (ok) { allowed = true; break; }
        }
        if (a.chatMessageId) {
          const ok = await db.chatParticipant.count({ where: { userId: me.id, leftAt: null, conversation: { messages: { some: { id: a.chatMessageId } } } } });
          if (ok) { allowed = true; break; }
        }
      }
    }
    if (!allowed) {
      // Dokumentversionen und Checklisten-Fotos: sichtbar, wenn der zugehörige Inhalt sichtbar ist
      const visible = this.content.visibleWhere(me.id);
      allowed = (await db.contentItem.count({ where: { AND: [visible, { OR: [{ document: { versions: { some: { fileObjectId: id } } } }, { checklistRun: { items: { some: { photoFileId: id } } } }] }] } })) > 0;
    }
    if (!allowed) throw new NotFoundException();
    // Dokument geöffnet = gelesen (Lesestatus, nur Datum)
    const docVersion = await db.documentVersion.findFirst({ where: { fileObjectId: id }, select: { documentId: true } });
    if (docVersion) await this.content.markSeen(me.id, docVersion.documentId).catch(() => null);
    const data = await readFile(path.join(STORAGE_DIR, fo.storageKey));
    res.setHeader('Content-Type', fo.mimeType);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const inline = fo.mimeType.startsWith('image/') || fo.mimeType === 'application/pdf';
    res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(fo.originalFilename)}`);
    res.end(data);
  }
}
