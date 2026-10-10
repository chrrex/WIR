import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../common/prisma.service';
import { CurrentUser, RequirePermission, SessionUser } from '../auth/decorators';
import { PolicyService } from '../policy/policy.service';
import { can } from '../policy/engine';
import { AudienceTarget } from '../content/audience.service';
import { ContentService, toBody } from '../content/content.service';
import { NotificationService } from '../notifications/notification.service';

const SHIFTS = ['Früh', 'Spät', 'Nacht', 'Tag'] as const;
const CreateHandover = z.object({
  groupId: z.uuid(),
  shiftLabel: z.enum(SHIFTS),
  shiftDate: z.iso.date().optional(),
  subject: z.string().trim().min(3).max(140),
  text: z.string().trim().min(1).max(6000),
  mentionIds: z.array(z.uuid()).max(10).default([]),
  images: z.array(z.object({ fileId: z.uuid(), altText: z.string().max(200).nullish() })).max(6).default([]),
});

@Controller('handovers')
export class HandoversController {
  constructor(private readonly prisma: PrismaService, private readonly content: ContentService, private readonly policy: PolicyService, private readonly notifications: NotificationService) {}

  /** Teams, für die die Person Übergaben schreiben darf. */
  private async writableGroups(userId: string) {
    const ctx = await this.policy.loadContext(userId);
    const groups = await this.prisma.db.group.findMany({ where: { isActive: true }, include: { company: true }, orderBy: { name: 'asc' } });
    return groups.filter((g) => ctx.groupIds.includes(g.id) || can(ctx, 'handovers.update_any', { groupId: g.id }));
  }

  @RequirePermission('handovers.read')
  @Get()
  async list(@CurrentUser() me: SessionUser, @Query('group') group?: string) {
    const items = await this.prisma.db.contentItem.findMany({
      where: { type: 'HANDOVER', ...this.content.visibleWhere(me.id), ...(group ? { handover: { groupId: group } } : {}) },
      include: { handover: { include: { group: true } }, author: { select: { displayName: true } } },
      orderBy: { publishedAt: 'desc' },
      take: 60,
    });
    const deco = await this.content.decorate(me.id, items.map((i) => i.id));
    return items.map((i) => ({
      id: i.id, subject: i.handover!.subject, excerpt: i.handover!.bodyText.slice(0, 200), group: i.handover!.group?.name ?? '–', groupId: i.handover!.groupId,
      shiftLabel: i.handover!.shiftLabel, shiftDate: i.handover!.shiftDate, author: i.author?.displayName ?? '–', publishedAt: i.publishedAt, mine: i.authorId === me.id, ...deco(i.id),
    }));
  }

  @RequirePermission('handovers.create')
  @Get('options')
  async options(@CurrentUser() me: SessionUser) {
    return { groups: (await this.writableGroups(me.id)).map((g) => ({ id: g.id, name: g.name })), shifts: SHIFTS };
  }

  @RequirePermission('handovers.create')
  @Post()
  async create(@CurrentUser() me: SessionUser, @Body(new ZodPipe(CreateHandover)) body: z.infer<typeof CreateHandover>) {
    const group = (await this.writableGroups(me.id)).find((g) => g.id === body.groupId);
    if (!group) throw new BadRequestException('Für dieses Team kannst du keine Übergabe schreiben.');
    const author = await this.prisma.db.user.findUniqueOrThrow({ where: { id: me.id } });
    // Erwähnte Personen außerhalb des Teams bekommen die Übergabe ausdrücklich zugestellt
    const mentioned = await this.prisma.db.user.findMany({ where: { id: { in: body.mentionIds }, status: 'ACTIVE' }, select: { id: true } });
    const targets: AudienceTarget[] = [{ type: 'GROUP', groupId: group.id }, ...mentioned.map((u) => ({ type: 'USER' as const, userId: u.id }))];
    const { item, recipientIds } = await this.content.create({
      type: 'HANDOVER', companyId: group.companyId, authorId: me.id, targets,
      attachmentFileIds: body.images.map((i) => ({ fileId: i.fileId, altText: i.altText ?? null })),
      createSubtype: (tx, id) => tx.handover.create({
        data: { id, groupId: group.id, subject: body.subject, body: toBody(body.text), bodyText: body.text, shiftLabel: body.shiftLabel, shiftDate: body.shiftDate ? new Date(body.shiftDate) : new Date() },
      }),
    });
    const mentionSet = new Set(mentioned.map((u) => u.id));
    await this.prisma.db.mention.createMany({ data: [...mentionSet].map((u) => ({ mentionedUserId: u, contentItemId: item.id })) });
    await this.notifications.notify({
      recipientIds: recipientIds.filter((r) => !mentionSet.has(r)), actorId: me.id, eventType: 'handover.new',
      title: `Neue Übergabe ${body.shiftLabel} · ${group.name}`, body: body.subject, linkPath: `/uebergaben/${item.id}`, contentItemId: item.id, dedupeKey: `handover:${item.id}`,
    });
    await this.notifications.notify({
      recipientIds: [...mentionSet], actorId: me.id, eventType: 'mention', title: `${author.displayName} hat dich in einer Übergabe erwähnt`,
      body: body.subject, linkPath: `/uebergaben/${item.id}`, contentItemId: item.id, dedupeKey: `handover-mention:${item.id}`,
    });
    return { id: item.id, recipients: recipientIds.length };
  }

  @RequirePermission('handovers.read')
  @Get(':id')
  async get(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string) {
    const item = await this.content.getVisible(me.id, id);
    if (!item.handover) throw new BadRequestException('Das ist keine Übergabe.');
    const deco = (await this.content.decorate(me.id, [id]))(id);
    const mentions = await this.prisma.db.mention.findMany({ where: { contentItemId: id, commentId: null }, include: { mentionedUser: { select: { id: true, displayName: true } } } });
    return {
      id, subject: item.handover.subject, text: item.handover.bodyText, group: item.handover.group?.name ?? '–', shiftLabel: item.handover.shiftLabel,
      shiftDate: item.handover.shiftDate, publishedAt: item.publishedAt, author: { id: item.author?.id ?? null, name: item.author?.displayName ?? '–' },
      mentions: mentions.map((m) => ({ id: m.mentionedUser.id, name: m.mentionedUser.displayName })), mine: item.authorId === me.id, ...deco,
    };
  }
}
