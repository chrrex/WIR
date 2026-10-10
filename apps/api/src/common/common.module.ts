import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { FeatureService } from './feature.service';
import { AuditService } from '../audit/audit.service';
import { PolicyService } from '../policy/policy.service';
import { NotificationService } from '../notifications/notification.service';
import { AudienceService } from '../content/audience.service';
import { ContentService } from '../content/content.service';

const SHARED = [PrismaService, FeatureService, AuditService, PolicyService, NotificationService, AudienceService, ContentService];

@Global()
@Module({ providers: SHARED, exports: SHARED })
export class CommonModule {}
