import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../common/prisma.service';
import { CurrentUser, RequirePermission, SessionUser } from '../auth/decorators';
import { PolicyService } from '../policy/policy.service';
import { ContentService } from './content.service';

const CommentBody = z.object({ text: z.string().min(1).max(2000), mentionIds: z.array(z.uuid()).max(20).default([]) });
const ReportBody = z.object({ reason: z.string().min(3).max(500) });

/** Pfad in der App für einen Inhalt (für Benachrichtigungen). */
export function linkFor(item: { id: string; type: string; post?: { kind: string } | null }) {
  const paths: Record<string, string> = { HANDOVER: 'uebergaben', KNOWLEDGE_ARTICLE: 'wissen', DOCUMENT: 'dokumente', SURVEY: 'umfragen', TASK: 'aufgaben', CHECKLIST_RUN: 'checklisten', IDEA: 'ideen' };
  if (paths[item.type]) return `/${paths[item.type]}/${item.id}`;
  return item.post?.kind === 'SOCIAL' ? `/social/${item.id}` : `/news/${item.id}`;
}

@Controller()
export class ContentController {
  constructor(private readonly content: ContentService, private readonly prisma: PrismaService, private readonly policy: PolicyService) {}

  private async name(userId: string) {
    return (await this.prisma.db.user.findUnique({ where: { id: userId }, select: { displayName: true } }))?.displayName ?? 'Jemand';
  }

  @Post('content/:id/seen')
  @HttpCode(200)
  seen(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.content.markSeen(me.id, id);
  }

  @RequirePermission('reactions.create')
  @Post('content/:id/like')
  @HttpCode(200)
  like(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.content.toggleLike(me.id, id);
  }

  @Get('content/:id/comments')
  async comments(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.content.listComments(me.id, id, await this.policy.loadContext(me.id));
  }

  @RequirePermission('comments.create')
  @Post('content/:id/comments')
  async comment(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(CommentBody)) body: z.infer<typeof CommentBody>) {
    const item = await this.content.getVisible(me.id, id);
    return this.content.addComment(me.id, await this.name(me.id), id, body.text, body.mentionIds, linkFor(item));
  }

  @Delete('comments/:id')
  async deleteComment(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.content.deleteComment(await this.policy.loadContext(me.id), me.id, id);
  }

  @Post('content/:id/report')
  @HttpCode(200)
  async report(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(ReportBody)) body: z.infer<typeof ReportBody>) {
    return this.content.report(me.id, await this.name(me.id), { contentItemId: id }, body.reason);
  }

  @Post('comments/:id/report')
  @HttpCode(200)
  async reportComment(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(ReportBody)) body: z.infer<typeof ReportBody>) {
    return this.content.report(me.id, await this.name(me.id), { commentId: id }, body.reason);
  }

  @Get('content/:id/read-status')
  async readStatus(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string, @Query('details') details?: string) {
    return this.content.readStatus(await this.policy.loadContext(me.id), me.id, id, details === '1');
  }

  @Post('content/:id/remind')
  @HttpCode(200)
  async remind(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string) {
    const item = await this.content.getVisible(me.id, id);
    return this.content.remind(await this.policy.loadContext(me.id), me.id, await this.name(me.id), id, linkFor(item));
  }

  /** Personen für @Erwähnungen in einem Inhalt: nur, wer ihn auch sieht. */
  @Get('content/:id/mentionable')
  async mentionable(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string, @Query('q') q = '') {
    await this.content.getVisible(me.id, id);
    const rows = await this.prisma.db.contentRecipient.findMany({
      where: { contentItemId: id, removedAt: null, userId: { not: me.id }, user: { status: 'ACTIVE', displayName: { contains: q, mode: 'insensitive' } } },
      include: { user: { select: { id: true, displayName: true } } },
      take: 8,
    });
    return rows.map((r) => ({ id: r.user.id, name: r.user.displayName }));
  }
}

