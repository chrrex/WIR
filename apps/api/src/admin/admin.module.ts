import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { ManageController } from './manage.controller';

@Module({ controllers: [AdminController, ManageController], providers: [AdminService] })
export class AdminModule {}
