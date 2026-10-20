import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { WorkModule } from '../work/work.module';

@Module({ imports: [WorkModule], controllers: [DashboardController] })
export class DashboardModule {}
