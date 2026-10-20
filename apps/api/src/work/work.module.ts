import { Module } from '@nestjs/common';
import { KnowledgeController } from './knowledge.controller';
import { DocumentsController } from './documents.controller';
import { SearchController } from './search.controller';
import { TasksController } from './tasks.controller';
import { ChecklistsController } from './checklists.controller';
import { SurveysController } from './surveys.controller';
import { IdeasController } from './ideas.controller';
import { ContactsController } from './contacts.controller';
import { JobsService } from './jobs.service';
import { OnboardingController } from './onboarding.controller';
import { MeetingsController } from './meetings.controller';
import { MeetingsService } from './meetings.service';

/** Phase 3+4: Wissen, Dokumente, Suche & KI, Aufgaben, Checklisten, Umfragen, Ideen, Kontakte, Meetings. */
@Module({
  controllers: [KnowledgeController, DocumentsController, SearchController, TasksController, ChecklistsController, SurveysController, IdeasController, ContactsController, OnboardingController, MeetingsController],
  providers: [JobsService, MeetingsService],
  exports: [MeetingsService],
})
export class WorkModule {}
