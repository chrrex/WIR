import { Body, Controller, ForbiddenException, Get, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../common/prisma.service';
import { CurrentUser, RequirePermission, SessionUser } from '../auth/decorators';
import { PolicyService } from '../policy/policy.service';
import { can } from '../policy/engine';
import { primaryCompany } from './common';

const opt = (max: number) => z.string().trim().max(max).nullish().transform((v) => v || null);
const Contact = z.object({
  organizationName: z.string().trim().min(2).max(160), type: z.enum(['SUPPLIER', 'PARTNER', 'MAINTENANCE', 'SERVICE_PROVIDER', 'AUTHORITY', 'OTHER']),
  categoryId: z.uuid().nullish(), contactPerson: opt(120), email: z.email().nullish().or(z.literal('')).transform((v) => v || null), phone: opt(40), mobile: opt(40),
  emergencyPhone: opt(40), isEmergencyContact: z.boolean().default(false), customerNumber: opt(60), website: opt(200), street: opt(160), postalCode: opt(10), city: opt(80),
  notes: opt(1000), isActive: z.boolean().default(true),
});

/** Externe Kontakte (Lieferanten, Dienstleister, Notdienste) – keine privaten Daten von Mitarbeitenden (ADR-024). */
@Controller('contacts')
export class ContactsController {
  constructor(private readonly prisma: PrismaService, private readonly policy: PolicyService) {}

  @RequirePermission('contacts.read')
  @Get()
  async list(@CurrentUser() me: SessionUser, @Query('q') q = '') {
    const ctx = await this.policy.loadContext(me.id);
    const term = q.trim().slice(0, 60);
    const rows = await this.prisma.db.contact.findMany({
      where: { isActive: true, OR: [{ companyId: null }, { companyId: { in: ctx.companyIds } }],
        ...(term ? { AND: [{ OR: ['organizationName', 'contactPerson', 'notes', 'city'].map((f) => ({ [f]: { contains: term, mode: 'insensitive' as const } })) }] } : {}) },
      include: { category: true }, orderBy: [{ isEmergencyContact: 'desc' }, { organizationName: 'asc' }], take: 200,
    });
    const emergency = can(ctx, 'contacts.view_emergency');
    return {
      canManage: can(ctx, 'contacts.manage'),
      categories: (await this.prisma.db.contactCategory.findMany({ orderBy: { sortOrder: 'asc' } })).map((c) => ({ id: c.id, name: c.name })),
      contacts: rows.map(({ category, emergencyPhone, ...c }) => ({ ...c, category: category?.name ?? null, emergencyPhone: emergency ? emergencyPhone : null })),
    };
  }

  @RequirePermission('contacts.manage')
  @Post()
  async create(@CurrentUser() me: SessionUser, @Body(new ZodPipe(Contact)) b: z.infer<typeof Contact>) {
    const c = await this.prisma.db.contact.create({ data: { ...b, categoryId: b.categoryId ?? null, companyId: await primaryCompany(this.prisma, me.id) } });
    return { id: c.id };
  }

  @RequirePermission('contacts.manage')
  @Put(':id')
  async update(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(Contact)) b: z.infer<typeof Contact>) {
    const c = await this.prisma.db.contact.findUnique({ where: { id } });
    if (!c) throw new NotFoundException();
    if (!can(await this.policy.loadContext(me.id), 'contacts.manage', { companyId: c.companyId })) throw new ForbiddenException('Diesen Kontakt darfst du nicht ändern.');
    await this.prisma.db.contact.update({ where: { id }, data: { ...b, categoryId: b.categoryId ?? null } });
    return { id };
  }
}
