import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../common/prisma.service';
import { CurrentUser, RequirePermission, SessionUser } from '../auth/decorators';
import { PolicyService } from '../policy/policy.service';
import { can } from '../policy/engine';
import { NotificationService } from '../notifications/notification.service';
import { absencesToday } from '../people/people.controller';

const SendBody = z.object({
  text: z.string().max(4000).default(''),
  mentionIds: z.array(z.uuid()).max(10).default([]),
  imageId: z.uuid().nullish(),
});
const GroupBody = z.object({ title: z.string().trim().min(2).max(80), memberIds: z.array(z.uuid()).min(1).max(100) });
const DirectBody = z.object({ userId: z.uuid() });
const ReadBody = z.object({ messageId: z.uuid() });

/** Reaktionen im Chat (ADR-048) */
export const REACTIONS = ['THUMBS_UP', 'THUMBS_DOWN', 'HEART', 'CELEBRATE'] as const;
const RETENTION_DAYS = 365; // ADR-023: Chat 12 Monate

/** Löscht Chatnachrichten nach 12 Monaten (einmal täglich). */
@Injectable()
export class ChatRetentionJob implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  constructor(private readonly prisma: PrismaService) {}
  onModuleInit() {
    if (process.env.JOBS === 'off' || process.env.NODE_ENV === 'test') return;
    const run = () => this.run().catch((e) => console.error('Chat-Aufbewahrung:', e.message));
    setTimeout(run, 60_000).unref();
    this.timer = setInterval(run, 24 * 3600_000);
    this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  async run() {
    const before = new Date(Date.now() - RETENTION_DAYS * 864e5);
    const r = await this.prisma.db.chatMessage.deleteMany({ where: { createdAt: { lt: before } } });
    return r.count;
  }
}

/**
 * Chat: Inhalte nur für Teilnehmende – keine Admin-Einsicht, nicht in der Suche (ADR-015).
 * 1:1: „gelesen“-Häkchen; Gruppen: nur eigener Ungelesen-Zähler.
 */
@Controller('chat')
export class ChatController {
  constructor(private readonly prisma: PrismaService, private readonly policy: PolicyService, private readonly notifications: NotificationService) {}

  private async membership(userId: string, conversationId: string) {
    const p = await this.prisma.db.chatParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
      include: { conversation: { include: { participants: { where: { leftAt: null }, include: { user: { select: { id: true, displayName: true, status: true } } } } } } },
    });
    if (!p || p.leftAt) throw new NotFoundException('Diesen Chat gibt es nicht.');
    return p;
  }

  private async unreadFor(userId: string) {
    const parts = await this.prisma.db.chatParticipant.findMany({
      where: { userId, leftAt: null, conversation: { archivedAt: null } },
      include: { lastReadMessage: { select: { createdAt: true } } },
    });
    const counts = new Map<string, number>();
    for (const p of parts) {
      const n = await this.prisma.db.chatMessage.count({
        where: { conversationId: p.conversationId, deletedAt: null, senderId: { not: userId }, createdAt: { gt: p.lastReadMessage?.createdAt ?? p.joinedAt } },
      });
      counts.set(p.conversationId, n);
    }
    return counts;
  }

  @RequirePermission('chat.use')
  @Get()
  async list(@CurrentUser() me: SessionUser) {
    const convs = await this.prisma.db.chatConversation.findMany({
      where: { archivedAt: null, participants: { some: { userId: me.id, leftAt: null } } },
      include: {
        participants: { where: { leftAt: null }, include: { user: { select: { id: true, displayName: true } } } },
        messages: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 1, include: { sender: { select: { displayName: true } } } },
      },
      orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: 100,
    });
    const unread = await this.unreadFor(me.id);
    return convs.map((c) => {
      const other = c.type === 'DIRECT' ? c.participants.find((p) => p.userId !== me.id)?.user : null;
      const last = c.messages[0];
      return {
        id: c.id, type: c.type, title: c.type === 'GROUP' ? c.title : other?.displayName ?? 'Chat', members: c.participants.length,
        last: last ? { text: last.deletedAt ? '' : last.body || '📷 Foto', at: last.createdAt, mine: last.senderId === me.id, sender: last.sender?.displayName ?? null } : null,
        unread: unread.get(c.id) ?? 0,
      };
    });
  }

  @RequirePermission('chat.use')
  @Get('unread')
  async unread(@CurrentUser() me: SessionUser) {
    const counts = await this.unreadFor(me.id);
    return { unread: [...counts.values()].reduce((a, b) => a + b, 0) };
  }

  @RequirePermission('chat.use')
  @Post('direct')
  async direct(@CurrentUser() me: SessionUser, @Body(new ZodPipe(DirectBody)) body: z.infer<typeof DirectBody>) {
    if (body.userId === me.id) throw new BadRequestException('Mit dir selbst kannst du nicht chatten.');
    const other = await this.prisma.db.user.findFirst({ where: { id: body.userId, status: 'ACTIVE' } });
    if (!other) throw new NotFoundException('Diese Person ist nicht erreichbar.');
    const otherCtx = await this.policy.loadContext(other.id);
    if (!can(otherCtx, 'chat.use')) throw new BadRequestException('Diese Person nutzt den Chat nicht.');
    const directKey = [me.id, other.id].sort().join(':');
    const existing = await this.prisma.db.chatConversation.findUnique({ where: { directKey } });
    if (existing) {
      await this.prisma.db.chatParticipant.updateMany({ where: { conversationId: existing.id, userId: me.id }, data: { leftAt: null } });
      return { id: existing.id };
    }
    const c = await this.prisma.db.chatConversation.create({
      data: { type: 'DIRECT', directKey, createdById: me.id, participants: { create: [{ userId: me.id }, { userId: other.id }] } },
    });
    return { id: c.id };
  }

  @RequirePermission('chat.create_group')
  @Post('group')
  async group(@CurrentUser() me: SessionUser, @Body(new ZodPipe(GroupBody)) body: z.infer<typeof GroupBody>) {
    const members = await this.prisma.db.user.findMany({ where: { id: { in: body.memberIds.filter((i) => i !== me.id) }, status: 'ACTIVE' }, select: { id: true } });
    if (!members.length) throw new BadRequestException('Bitte wähle mindestens eine Person.');
    const c = await this.prisma.db.chatConversation.create({
      data: {
        type: 'GROUP', title: body.title, createdById: me.id,
        participants: { create: [{ userId: me.id, role: 'ADMIN' }, ...members.map((m) => ({ userId: m.id }))] },
      },
    });
    return { id: c.id };
  }

  @RequirePermission('chat.use')
  @Get(':id')
  async conversation(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string, @Query('before') before?: string) {
    const p = await this.membership(me.id, id);
    const c = p.conversation;
    const messages = await this.prisma.db.chatMessage.findMany({
      where: { conversationId: id, ...(before ? { createdAt: { lt: new Date(before) } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 60,
      include: { sender: { select: { id: true, displayName: true } }, attachments: { select: { fileObjectId: true } }, reactions: { select: { type: true, userId: true, user: { select: { displayName: true } } } } },
    });
    let otherReadAt: Date | null = null;
    if (c.type === 'DIRECT') {
      const other = await this.prisma.db.chatParticipant.findFirst({
        where: { conversationId: id, userId: { not: me.id } }, include: { lastReadMessage: { select: { createdAt: true } } },
      });
      otherReadAt = other?.lastReadMessage?.createdAt ?? null;
    }
    const other = c.type === 'DIRECT' ? c.participants.find((x) => x.userId !== me.id)?.user : null;
    return {
      id, type: c.type, title: c.type === 'GROUP' ? c.title : other?.displayName ?? 'Chat',
      // Abwesenheiten der anderen (im 1:1 die Person, in Gruppen alle) – Hinweis beim Schreiben (ADR-046)
      absent: [...(await absencesToday(this.prisma.db, c.participants.map((x) => x.userId).filter((u) => u !== me.id))).entries()]
        .map(([uid, a]) => ({ id: uid, name: c.participants.find((x) => x.userId === uid)?.user.displayName ?? '', ...a })),
      members: c.participants.map((x) => ({ id: x.user.id, name: x.user.displayName })),
      messages: messages.reverse().map((m) => ({
        id: m.id, text: m.deletedAt ? null : m.body, deleted: !!m.deletedAt, at: m.createdAt, mine: m.senderId === me.id,
        sender: m.sender ? { id: m.sender.id, name: m.sender.displayName } : null,
        image: m.attachments[0]?.fileObjectId ?? null,
        reactions: REACTIONS.map((type) => { const r = m.reactions.filter((x) => x.type === type); return { type, count: r.length, mine: r.some((x) => x.userId === me.id), names: r.map((x) => x.user.displayName) }; }).filter((r) => r.count),
        // ✓✓ nur im 1:1-Chat (ADR-015)
        readByOther: c.type === 'DIRECT' && m.senderId === me.id && !!otherReadAt && otherReadAt >= m.createdAt,
      })),
    };
  }

  /** Reaktion 👍 👎 ❤️ 🎉 an-/ausschalten (je Person und Art einmal). Nur für Teilnehmende. */
  @RequirePermission('chat.use')
  @Post('messages/:messageId/reactions')
  @HttpCode(200)
  async react(@CurrentUser() me: SessionUser, @Param('messageId', ParseUUIDPipe) messageId: string, @Body(new ZodPipe(z.object({ type: z.enum(REACTIONS) }))) b: { type: (typeof REACTIONS)[number] }) {
    const db = this.prisma.db;
    const m = await db.chatMessage.findUnique({ where: { id: messageId } });
    if (!m || m.deletedAt) throw new NotFoundException();
    await this.membership(me.id, m.conversationId);
    const existing = await db.reaction.findFirst({ where: { chatMessageId: messageId, userId: me.id, type: b.type } });
    if (existing) await db.reaction.delete({ where: { id: existing.id } });
    else await db.reaction.create({ data: { chatMessageId: messageId, userId: me.id, type: b.type } });
    return { ok: true, on: !existing };
  }

  @RequirePermission('chat.use')
  @Post(':id/messages')
  async send(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(SendBody)) body: z.infer<typeof SendBody>) {
    const p = await this.membership(me.id, id);
    const text = body.text.trim();
    if (!text && !body.imageId) throw new BadRequestException('Leere Nachricht.');
    const db = this.prisma.db;
    if (body.imageId) {
      const f = await db.fileObject.findFirst({ where: { id: body.imageId, uploadedById: me.id } });
      if (!f || (await db.attachment.count({ where: { fileObjectId: body.imageId } }))) throw new BadRequestException('Bild nicht gefunden.');
    }
    const memberIds = p.conversation.participants.map((x) => x.userId);
    const mentions = body.mentionIds.filter((m) => memberIds.includes(m) && m !== me.id);
    const msg = await db.chatMessage.create({
      data: {
        conversationId: id, senderId: me.id, body: text,
        mentions: { create: mentions.map((u) => ({ mentionedUserId: u })) },
        ...(body.imageId ? { attachments: { create: { fileObjectId: body.imageId, kind: 'IMAGE' } } } : {}),
      },
    });
    await db.chatConversation.update({ where: { id }, data: { lastMessageAt: msg.createdAt } });
    await db.chatParticipant.update({ where: { conversationId_userId: { conversationId: id, userId: me.id } }, data: { lastReadMessageId: msg.id } });
    if (mentions.length) {
      const sender = p.conversation.participants.find((x) => x.userId === me.id)?.user.displayName ?? 'Jemand';
      // Kein Nachrichteninhalt in der Benachrichtigung – Chat bleibt im Chat
      await this.notifications.notify({ recipientIds: mentions, actorId: me.id, eventType: 'chat.mention', title: `${sender} hat dich im Chat erwähnt`, body: p.conversation.title ?? null, linkPath: `/chat/${id}` });
    }
    return { id: msg.id, at: msg.createdAt };
  }

  @RequirePermission('chat.use')
  @Post(':id/read')
  @HttpCode(200)
  async read(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(ReadBody)) body: z.infer<typeof ReadBody>) {
    await this.membership(me.id, id);
    const msg = await this.prisma.db.chatMessage.findFirst({ where: { id: body.messageId, conversationId: id } });
    if (!msg) throw new NotFoundException();
    const part = await this.prisma.db.chatParticipant.findUnique({ where: { conversationId_userId: { conversationId: id, userId: me.id } }, include: { lastReadMessage: true } });
    if (!part?.lastReadMessage || part.lastReadMessage.createdAt < msg.createdAt) {
      await this.prisma.db.chatParticipant.update({ where: { conversationId_userId: { conversationId: id, userId: me.id } }, data: { lastReadMessageId: msg.id } });
    }
    return { ok: true };
  }

  @RequirePermission('chat.use')
  @Post('messages/:messageId/delete')
  @HttpCode(200)
  async deleteMessage(@CurrentUser() me: SessionUser, @Param('messageId', ParseUUIDPipe) messageId: string) {
    const m = await this.prisma.db.chatMessage.findUnique({ where: { id: messageId } });
    if (!m) throw new NotFoundException();
    if (m.senderId !== me.id) throw new ForbiddenException('Nur eigene Nachrichten.');
    await this.prisma.db.chatMessage.update({ where: { id: messageId }, data: { deletedAt: new Date(), body: '' } });
    return { ok: true };
  }

  @RequirePermission('chat.use')
  @Post(':id/leave')
  @HttpCode(200)
  async leave(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string) {
    const p = await this.membership(me.id, id);
    if (p.conversation.type === 'DIRECT') throw new BadRequestException('Einzelchats kann man nicht verlassen.');
    await this.prisma.db.chatParticipant.update({ where: { conversationId_userId: { conversationId: id, userId: me.id } }, data: { leftAt: new Date() } });
    return { ok: true };
  }
}
