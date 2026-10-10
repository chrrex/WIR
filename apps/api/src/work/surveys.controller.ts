import { BadRequestException, Body, Controller, ConflictException, ForbiddenException, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { z } from 'zod';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../common/prisma.service';
import { CurrentUser, RequirePermission, SessionUser } from '../auth/decorators';
import { PolicyService } from '../policy/policy.service';
import { can } from '../policy/engine';
import { AudienceService } from '../content/audience.service';
import { ContentService, dateOnly } from '../content/content.service';
import { NotificationService } from '../notifications/notification.service';
import { AudienceKeys, primaryCompany, toTargets } from './common';

const Create = z.object({
  title: z.string().trim().min(3).max(140), description: z.string().trim().max(1000).nullish(), anonymous: z.boolean().default(true),
  resultsForAll: z.boolean().default(false), closesAt: z.iso.datetime({ offset: true }).nullish(), audience: AudienceKeys,
  questions: z.array(z.object({ prompt: z.string().trim().min(3).max(300), type: z.enum(['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'SCALE', 'FREE_TEXT']),
    options: z.array(z.string().trim().min(1).max(120)).max(12).default([]), required: z.boolean().default(true) })).min(1).max(20),
});
const Answer = z.object({ answers: z.array(z.object({ questionId: z.uuid(), optionIds: z.array(z.uuid()).max(12).default([]), value: z.number().int().nullish(), text: z.string().trim().max(2000).nullish() })) });

/**
 * Umfragen (ADR-013): Teilnahme und Antwort sind getrennt gespeichert; bei anonymen Umfragen
 * gibt es keine Verbindung zur Person (DB-Trigger). Ergebnisse erst ab min_group_size Antworten.
 */
@Controller('surveys')
export class SurveysController {
  constructor(private readonly prisma: PrismaService, private readonly content: ContentService, private readonly audiences: AudienceService,
    private readonly policy: PolicyService, private readonly notifications: NotificationService) {}

  private isOpen(s: { opensAt: Date | null; closesAt: Date | null }) {
    const now = new Date();
    return (!s.opensAt || s.opensAt <= now) && (!s.closesAt || s.closesAt > now);
  }

  @RequirePermission('surveys.respond')
  @Get()
  async list(@CurrentUser() me: SessionUser) {
    const items = await this.prisma.db.contentItem.findMany({
      where: { type: 'SURVEY', ...this.content.visibleWhere(me.id) }, orderBy: { publishedAt: 'desc' }, take: 50,
      include: { survey: { include: { participations: { where: { userId: me.id } } } }, author: { select: { displayName: true } } },
    });
    return {
      canCreate: can(await this.policy.loadContext(me.id), 'surveys.create'),
      surveys: items.map((i) => ({ id: i.id, title: i.survey!.title, anonymous: i.survey!.isAnonymous, closesAt: i.survey!.closesAt, open: this.isOpen(i.survey!),
        participated: i.survey!.participations.length > 0, mine: i.authorId === me.id, author: i.author?.displayName ?? '–' })),
    };
  }

  @RequirePermission('surveys.create')
  @Get('options')
  async options(@CurrentUser() me: SessionUser) {
    return { audiences: await this.audiences.newsOptions(await this.policy.loadContext(me.id)) };
  }

  @RequirePermission('surveys.respond')
  @Get(':id')
  async get(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string) {
    const item = await this.content.getVisible(me.id, id);
    const s = await this.prisma.db.survey.findUniqueOrThrow({ where: { id }, include: { questions: { orderBy: { sortOrder: 'asc' }, include: { options: { orderBy: { sortOrder: 'asc' } } } }, participations: { where: { userId: me.id } } } });
    return {
      id, title: s.title, description: s.description, anonymous: s.isAnonymous, closesAt: s.closesAt, open: this.isOpen(s), participated: s.participations.length > 0,
      mine: item.authorId === me.id, minGroupSize: s.minGroupSize, audience: await this.audiences.describe(id),
      questions: s.questions.map((q) => ({ id: q.id, prompt: q.prompt, type: q.type, required: q.isRequired, scaleMin: q.scaleMin, scaleMax: q.scaleMax, options: q.options.map((o) => ({ id: o.id, label: o.label })) })),
    };
  }

  @RequirePermission('surveys.create')
  @Post()
  async create(@CurrentUser() me: SessionUser, @Body(new ZodPipe(Create)) b: z.infer<typeof Create>) {
    const targets = toTargets(b.audience);
    await this.audiences.assertNewsTargets(await this.policy.loadContext(me.id), targets);
    for (const q of b.questions) if (q.type.endsWith('CHOICE') && q.options.length < 2) throw new BadRequestException(`„${q.prompt}“ braucht mindestens zwei Antworten.`);
    const { item, recipientIds } = await this.content.create({
      type: 'SURVEY', companyId: await primaryCompany(this.prisma, me.id), authorId: me.id, targets, commentsEnabled: false, reactionsEnabled: false,
      createSubtype: async (tx, id) => {
        await tx.survey.create({ data: { id, title: b.title, description: b.description || null, isAnonymous: b.anonymous, closesAt: b.closesAt ? new Date(b.closesAt) : null,
          resultsVisibility: b.resultsForAll ? 'RECIPIENTS_AFTER_SUBMIT' : 'AUTHOR_ONLY' } });
        for (const [n, q] of b.questions.entries()) {
          await tx.surveyQuestion.create({ data: { surveyId: id, prompt: q.prompt, type: q.type, isRequired: q.required, sortOrder: n,
            scaleMin: q.type === 'SCALE' ? 1 : null, scaleMax: q.type === 'SCALE' ? 5 : null,
            options: { create: q.type.endsWith('CHOICE') ? q.options.map((label, i) => ({ label, sortOrder: i })) : [] } } });
        }
      },
    });
    await this.notifications.notify({ recipientIds, actorId: me.id, eventType: 'survey.new', title: `Umfrage: ${b.title}`, body: b.anonymous ? 'Anonym · dauert nur kurz' : 'Dauert nur kurz', linkPath: `/umfragen/${item.id}`, contentItemId: item.id });
    return { id: item.id };
  }

  @RequirePermission('surveys.respond')
  @Post(':id/responses')
  async respond(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(Answer)) b: z.infer<typeof Answer>) {
    await this.content.getVisible(me.id, id);
    const db = this.prisma.db;
    const s = await db.survey.findUniqueOrThrow({ where: { id }, include: { questions: { include: { options: true } } } });
    if (!this.isOpen(s)) throw new BadRequestException('Diese Umfrage ist geschlossen.');
    const rows: Array<{ questionId: string; optionId?: string; valueNumber?: number; valueText?: string }> = [];
    for (const q of s.questions) {
      const a = b.answers.find((x) => x.questionId === q.id);
      const ids = (a?.optionIds ?? []).filter((o) => q.options.some((opt) => opt.id === o));
      if (q.type === 'SINGLE_CHOICE' && ids.length > 1) throw new BadRequestException('Bitte nur eine Antwort wählen.');
      if (q.type.endsWith('CHOICE')) ids.forEach((optionId) => rows.push({ questionId: q.id, optionId }));
      if (q.type === 'SCALE' && a?.value != null) {
        if (a.value < (q.scaleMin ?? 1) || a.value > (q.scaleMax ?? 5)) throw new BadRequestException('Wert außerhalb der Skala.');
        rows.push({ questionId: q.id, valueNumber: a.value });
      }
      if (q.type === 'FREE_TEXT' && a?.text) rows.push({ questionId: q.id, valueText: a.text });
      if (q.isRequired && !rows.some((r) => r.questionId === q.id)) throw new BadRequestException(`Bitte beantworte: „${q.prompt}“`);
    }
    const day = dateOnly();
    try {
      await db.$transaction([
        db.surveyParticipation.create({ data: { surveyId: id, userId: me.id, submittedOn: day } }),
        db.surveyResponse.create({ data: { surveyId: id, respondentId: s.isAnonymous ? null : me.id, submittedOn: day, answers: { create: rows } } }),
      ]);
    } catch {
      throw new ConflictException('Du hast schon teilgenommen.');
    }
    return { ok: true };
  }

  @RequirePermission('surveys.respond')
  @Get(':id/results')
  async results(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string) {
    const item = await this.content.getVisible(me.id, id);
    const db = this.prisma.db;
    const s = await db.survey.findUniqueOrThrow({ where: { id }, include: { questions: { orderBy: { sortOrder: 'asc' }, include: { options: { orderBy: { sortOrder: 'asc' } }, answers: true } }, participations: { where: { userId: me.id } } } });
    const ctx = await this.policy.loadContext(me.id);
    const allowed = item.authorId === me.id || can(ctx, 'surveys.view_results', { companyId: item.companyId })
      || (s.resultsVisibility === 'RECIPIENTS_AFTER_SUBMIT' && s.participations.length > 0);
    if (!allowed) throw new ForbiddenException('Die Ergebnisse sieht die Person, die die Umfrage gestellt hat.');
    const responses = await db.surveyResponse.count({ where: { surveyId: id } });
    const recipients = await db.contentRecipient.count({ where: { contentItemId: id, removedAt: null, userId: { not: item.authorId ?? undefined } } });
    if (responses < s.minGroupSize) return { responses, recipients, tooFew: true, minGroupSize: s.minGroupSize };
    return {
      responses, recipients, tooFew: false,
      questions: s.questions.map((q) => ({
        id: q.id, prompt: q.prompt, type: q.type,
        options: q.options.map((o) => ({ label: o.label, count: q.answers.filter((a) => a.optionId === o.id).length })),
        average: q.type === 'SCALE' && q.answers.length ? Math.round((q.answers.reduce((n, a) => n + (a.valueNumber ?? 0), 0) / q.answers.length) * 10) / 10 : null,
        // Freitexte in zufälliger Reihenfolge, damit keine Rückschlüsse über die Abgabereihenfolge möglich sind
        texts: q.type === 'FREE_TEXT' ? q.answers.map((a) => a.valueText!).filter(Boolean).sort(() => Math.random() - 0.5) : [],
      })),
    };
  }
}
