import { Controller, Get, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { CommonModule } from './common/common.module';
import { AuthModule } from './auth/auth.module';
import { AuthGuard } from './auth/auth.guard';
import { MeModule } from './me/me.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { AdminModule } from './admin/admin.module';
import { ContentModule } from './content/content.module';
import { WorkModule } from './work/work.module';
import { Public } from './auth/decorators';

@Controller('health')
class HealthController {
  @Public()
  @Get()
  health() {
    return { ok: true, service: 'wir-api' };
  }
}

@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]), CommonModule, AuthModule, MeModule, DashboardModule, AdminModule, ContentModule, WorkModule],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
