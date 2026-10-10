import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import type { PrismaService } from '../common/prisma.service';
import type { AudienceTarget } from '../content/audience.service';

/** Zielgruppen aus dem Formular: "ALL", "C:<id>" (Gesellschaft), "G:<id>" (Gruppe). */
export const AudienceKeys = z.array(z.string().regex(/^(ALL|[CG]:[0-9a-f-]{36})$/)).min(1).max(20);

export function toTargets(keys: string[]): AudienceTarget[] {
  return keys.map((k) => (k === 'ALL' ? { type: 'ALL' } : k.startsWith('C:') ? { type: 'COMPANY', companyId: k.slice(2) } : { type: 'GROUP', groupId: k.slice(2) }));
}

/** Hauptgesellschaft einer Person (Eigentümerin neuer Inhalte). */
export async function primaryCompany(prisma: PrismaService, userId: string) {
  const p = await prisma.db.employeeProfile.findUnique({ where: { userId }, select: { companyId: true } });
  if (p) return p.companyId;
  const r = await prisma.db.userRole.findFirst({ where: { userId, companyId: { not: null } }, select: { companyId: true } });
  if (!r?.companyId) throw new BadRequestException('Dir ist keine Gesellschaft zugeordnet.');
  return r.companyId;
}

/** Hochgeladene Datei gehört der Person und ist noch nirgends verwendet. */
export async function assertOwnFreshFile(prisma: PrismaService, userId: string, fileId: string) {
  const f = await prisma.db.fileObject.findFirst({ where: { id: fileId, uploadedById: userId, deletedAt: null }, include: { documentVersions: { take: 1 }, attachments: { take: 1 } } });
  if (!f || f.documentVersions.length || f.attachments.length) throw new BadRequestException('Die Datei fehlt oder wird schon verwendet.');
  return f;
}

export const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'eintrag';
