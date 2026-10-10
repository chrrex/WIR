import { Module } from '@nestjs/common';
import { KnowledgeController } from './knowledge.controller';
import { DocumentsController } from './documents.controller';
import { SearchController } from './search.controller';
import { TasksController } from './tasks.controller';
import { ChecklistsController } from './checklists.controller';
import { SurveysController } from './surveys.controller';
import { IdeasController } from './ideas.controller';
import { ContactsController } from './contacts.controller';

/** Phase 3+4: Wissen, Dokumente, Suche & KI, Aufgaben, Checklisten, Umfragen, Ideen, Kontakte. */
@Module({
  controllers: [KnowledgeController, DocumentsController, SearchController, TasksController, ChecklistsController, SurveysController, IdeasController, ContactsController],
})
export class WorkModule {}
