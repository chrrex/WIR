import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

export interface AuditEntry {
  actorId?: string | null;
  actorType?: 'USER' | 'SYSTEM' | 'INTEGRATION';
  companyId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  /** Keine Inhaltsdaten, keine Codes oder Passwörter (siehe AuditLog im Schema). */
  metadata?: Record<string, unknown>;
}

/** Append-only Audit-Log für sicherheitsrelevante Aktionen. */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(e: AuditEntry) {
    await this.prisma.db.auditLog.create({
      data: {
        actorId: e.actorId ?? null,
        actorType: e.actorType ?? (e.actorId ? 'USER' : 'SYSTEM'),
        companyId: e.companyId ?? null,
        action: e.action,
        entityType: e.entityType,
        entityId: e.entityId ?? null,
        metadata: (e.metadata ?? undefined) as never,
      },
    });
  }
}
