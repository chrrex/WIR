import { Module } from '@nestjs/common';
import { ContentController } from './content.controller';
import { NewsController } from '../news/news.controller';
import { SocialController } from '../social/social.controller';
import { HandoversController } from '../handovers/handovers.controller';
import { NotificationsController } from '../notifications/notifications.controller';
import { ChatController, ChatRetentionJob } from '../chat/chat.controller';
import { FilesController } from '../files/files.controller';
import { ModerationController } from '../moderation/moderation.controller';
import { PeopleController } from '../people/people.controller';
import { TranslateController } from '../translate/translate.controller';
import { TranslateService } from '../translate/translate.service';

/** Phase 2: Kommunikation – News, Social, Übergaben, Kommentare, Benachrichtigungen, Chat, Bilder. */
@Module({
  controllers: [ContentController, NewsController, SocialController, HandoversController, NotificationsController, ChatController, FilesController, ModerationController, PeopleController, TranslateController],
  providers: [ChatRetentionJob, TranslateService],
})
export class ContentModule {}
