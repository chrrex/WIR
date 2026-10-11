import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { z } from 'zod';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../common/prisma.service';
import { CurrentUser, SessionUser } from '../auth/decorators';
import { Item, LANGUAGES, TranslateService } from './translate.service';

const Body_ = z.object({
  items: z.array(z.object({ entity: z.enum(['CONTENT_ITEM', 'COMMENT', 'CHAT_MESSAGE']), id: z.uuid(), field: z.enum(['title', 'body']) })).min(1).max(50),
  /** Leichte Sprache statt (nur) Übersetzung */
  plain: z.boolean().optional(),
});

/** Inhalte in die eigene Sprache bzw. in Leichte Sprache (ADR-054). Das Original bleibt unverändert. */
@Controller('translations')
export class TranslateController {
  constructor(private readonly t: TranslateService, private readonly prisma: PrismaService) {}

  @Get('languages')
  languages() {
    return { languages: LANGUAGES, translate: !!this.t.provider.translate, plain: !!this.t.provider.plain };
  }

  @Post()
  @HttpCode(200)
  async run(@CurrentUser() me: SessionUser, @Body(new ZodPipe(Body_)) b: { items: Item[]; plain?: boolean }) {
    const s = await this.prisma.db.userSettings.findUnique({ where: { userId: me.id } });
    return this.t.run(me.id, b.items, s?.locale ?? 'de', b.plain ?? s?.plainLanguage ?? false);
  }
}
