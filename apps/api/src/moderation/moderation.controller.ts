import { Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CurrentUser, RequirePermission, SessionUser } from '../auth/decorators';

/** Kleines Moderationsteam bearbeitet Meldungen (ADR-037). Meldende bleiben anonym. */
@Controller('moderation')
export class ModerationController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  @RequirePermission('social.moderate')
  @Get('reports')
  async list() {
    const reports = await this.prisma.db.contentReport.findMany({
      where: { status: 'OPEN' },
      orderBy: { createdAt: 'asc' },
      include: {
        contentItem: { include: { post: true, handover: true, author: { select: { displayName: true } } } },
        comment: { include: { author: { select: { displayName: true } }, contentItem: { include: { post: true, handover: true } } } },
      },
      take: 100,
    });
    return reports.map((r) => {
      const item = r.contentItem ?? r.comment?.contentItem;
      const kind = r.comment ? 'Kommentar' : item?.post?.kind === 'SOCIAL' ? 'Social-Beitrag' : item?.type === 'HANDOVER' ? 'Übergabe' : 'News';
      const link = !item ? null : item.type === 'HANDOVER' ? `/uebergaben/${item.id}` : item.post?.kind === 'SOCIAL' ? `/social/${item.id}` : `/news/${item.id}`;
      return {
        id: r.id, kind, reason: r.reason, createdAt: r.createdAt, link,
        title: item?.post?.title ?? item?.handover?.subject ?? '–',
        excerpt: r.comment ? r.comment.bodyText.slice(0, 200) : (item?.post?.bodyText ?? item?.handover?.bodyText ?? '').slice(0, 200),
        author: r.comment ? r.comment.author?.displayName ?? '–' : r.contentItem?.author?.displayName ?? '–',
      };
    });
  }

  @RequirePermission('social.moderate')
  @Post('reports/:id/hide')
  @HttpCode(200)
  async hide(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string) {
    const r = await this.prisma.db.contentReport.findUnique({ where: { id } });
    if (!r) throw new NotFoundException();
    if (r.commentId) await this.prisma.db.comment.update({ where: { id: r.commentId }, data: { deletedAt: new Date(), bodyText: '', body: {} } });
    if (r.contentItemId) await this.prisma.db.contentItem.update({ where: { id: r.contentItemId }, data: { status: 'DEACTIVATED' } });
    await this.prisma.db.contentReport.updateMany({
      where: { status: 'OPEN', OR: [{ id }, ...(r.contentItemId ? [{ contentItemId: r.contentItemId }] : []), ...(r.commentId ? [{ commentId: r.commentId }] : [])] },
      data: { status: 'RESOLVED', resolvedById: me.id, resolvedAt: new Date() },
    });
    await this.audit.log({ actorId: me.id, action: 'moderation.hidden', entityType: r.commentId ? 'comment' : 'content_item', entityId: r.commentId ?? r.contentItemId });
    return { ok: true };
  }

  @RequirePermission('social.moderate')
  @Post('reports/:id/dismiss')
  @HttpCode(200)
  async dismiss(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.prisma.db.contentReport.update({ where: { id }, data: { status: 'DISMISSED', resolvedById: me.id, resolvedAt: new Date() } });
    await this.audit.log({ actorId: me.id, action: 'moderation.dismissed', entityType: 'content_report', entityId: id });
    return { ok: true };
  }
}
