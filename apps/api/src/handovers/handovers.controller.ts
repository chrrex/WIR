import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../common/prisma.service';
import { CurrentUser, RequirePermission, SessionUser } from '../auth/decorators';
import { PolicyService } from '../policy/policy.service';
import { can } from '../policy/engine';
import { AudienceTarget } from '../content/audience.service';
import { ContentService, createPoll, PollInput, PublishAt, toBody } from '../content/content.service';
import { NotificationService } from '../notifications/notification.service';
import { AudienceKeys, toTargets } from '../work/common';
import { AudienceService } from '../content/audience.service';

const SHIFTS = ['Früh', 'Spät', 'Nacht', 'Tag'] as const;
const CreateHandover = z.object({
  /** Empfänger:innen: Gruppen ("G:"), Personen ("U:"), Gesellschaft ("C:") oder alle ("ALL") – frei kombinierbar */
  targets: AudienceKeys,
  shiftLabel: z.enum(SHIFTS),
  shiftDate: z.iso.date().optional(),
  subject: z.string().trim().min(3).max(140),
  text: z.string().trim().min(1).max(6000),
  mentionIds: z.array(z.uuid()).max(10).default([]),
  images: z.array(z.object({ fileId: z.uuid(), altText: z.string().max(200).nullish() })).max(6).default([]),
  poll: PollInput.nullish(),
  publishAt: PublishAt,
});

@Controller('handovers')
export class HandoversController {
  constructor(private readonly prisma: PrismaService, private readonly content: ContentService, private readonly policy: PolicyService, private readonly notifications: NotificationService, private readonly audiences: AudienceService) {}

  @RequirePermission('handovers.read')
  @Get()
  async list(@CurrentUser() me: SessionUser, @Query('group') group?: string) {
    const items = await this.prisma.db.contentItem.findMany({
      where: { type: 'HANDOVER', ...this.content.visibleOrScheduled(me.id), ...(group ? { handover: { groupId: group } } : {}) },
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
    const ctx = await this.policy.loadContext(me.id);
    const audiences = (await this.audiences.newsOptions(ctx)).map((o) => ({ key: o.key, label: o.label, wide: o.wide }));
    const own = ctx.groupIds.filter((g) => !ctx.groupParent.get(g)).map((g) => `G:${g}`);
    return { audiences, defaults: own.filter((k) => audiences.some((a) => a.key === k)).slice(0, 1), shifts: SHIFTS };
  }

  @RequirePermission('handovers.create')
  @Post()
  async create(@CurrentUser() me: SessionUser, @Body(new ZodPipe(CreateHandover)) body: z.infer<typeof CreateHandover>) {
    const ctx = await this.policy.loadContext(me.id);
    const chosen = toTargets(body.targets);
    await this.audiences.assertHandoverTargets(ctx, chosen);
    const author = await this.prisma.db.user.findUniqueOrThrow({ where: { id: me.id }, include: { employeeProfile: true } });
    // Erwähnte Personen bekommen die Übergabe ebenfalls zugestellt
    const mentioned = await this.prisma.db.user.findMany({ where: { id: { in: body.mentionIds }, status: 'ACTIVE' }, select: { id: true } });
    const targets: AudienceTarget[] = [...chosen, ...mentioned.map((u) => ({ type: 'USER' as const, userId: u.id }))];
    // Team der Übergabe (für Filter und Anzeige): erste gewählte Gruppe, sonst das eigene Team
    const firstGroup = chosen.find((t) => t.type === 'GROUP') as { groupId: string } | undefined;
    const groupId = firstGroup?.groupId ?? ctx.groupIds.find((g) => !ctx.groupParent.get(g)) ?? null;
    const group = groupId ? await this.prisma.db.group.findUnique({ where: { id: groupId } }) : null;
    const { item, recipientIds } = await this.content.create({
      type: 'HANDOVER', companyId: group?.companyId ?? author.employeeProfile?.companyId ?? ctx.companyIds[0] ?? null, authorId: me.id, targets,
      attachmentFileIds: body.images.map((i) => ({ fileId: i.fileId, altText: i.altText ?? null })), publishAt: body.publishAt,
      createSubtype: async (tx, id) => {
        await tx.handover.create({ data: { id, groupId, subject: body.subject, body: toBody(body.text), bodyText: body.text, shiftLabel: body.shiftLabel, shiftDate: body.shiftDate ? new Date(body.shiftDate) : new Date() } });
        await tx.mention.createMany({ data: mentioned.map((u) => ({ mentionedUserId: u.id, contentItemId: id })) });
        await createPoll(tx, id, body.poll);
      },
    });
    if (!body.publishAt) await this.content.announce(item.id);
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
      mentions: mentions.map((m) => ({ id: m.mentionedUser.id, name: m.mentionedUser.displayName })), audience: await this.audiences.describe(id), mine: item.authorId === me.id,
      poll: await this.content.poll(me.id, id), ...deco,
    };
  }
}
