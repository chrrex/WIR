import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { AuditService } from '../audit/audit.service';
import { PolicyService } from '../policy/policy.service';

@Global()
@Module({ providers: [PrismaService, AuditService, PolicyService], exports: [PrismaService, AuditService, PolicyService] })
export class CommonModule {}
