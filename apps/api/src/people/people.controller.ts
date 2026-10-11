import { BadRequestException, Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import type { PrismaClient } from '@wir/db';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../common/prisma.service';
import { CurrentUser, RequirePermission, SessionUser } from '../auth/decorators';
import { PolicyService } from '../policy/policy.service';
import { can, PolicyContext } from '../policy/engine';
import { AudienceService } from '../content/audience.service';
import { dateOnly } from '../content/content.service';
import { AudienceKeys, toTargets } from '../work/common';

export const ABSENCE_LABEL = { ABSENT: 'abwesend', VACATION: 'im Urlaub', BUSINESS_TRIP: 'auf Dienstreise', TRAINING: 'auf Fortbildung' } as const;
export interface AbsenceInfo { type: keyof typeof ABSENCE_LABEL; label: string; from: Date; until: Date; note: string | null }

/** Wer ist heute abwesend? (nur selbst eingetragene Zeiträume, ohne Gründe – ADR-046) */
export async function absencesToday(db: Pick<PrismaClient, 'absence'>, userIds: string[]): Promise<Map<string, AbsenceInfo>> {
  if (!userIds.length) return new Map();
  const today = dateOnly();
  const rows = await db.absence.findMany({ where: { showAsAbsent: true, startsOn: { lte: today }, endsOn: { gte: today }, employeeProfile: { userId: { in: userIds } } }, include: { employeeProfile: { select: { userId: true } } }, orderBy: { endsOn: 'desc' } });
  const map = new Map<string, AbsenceInfo>();
  for (const r of rows) if (!map.has(r.employeeProfile.userId)) map.set(r.employeeProfile.userId, { type: r.type, label: ABSENCE_LABEL[r.type], from: r.startsOn, until: r.endsOn, note: r.note });
  return map;
}

const opt = (max: number) => z.string().trim().max(max).nullish().transform((v) => v || null);
const Profile = z.object({ phoneWork: opt(40), phoneMobile: opt(40), aboutMe: opt(500), email: z.email().max(200).nullish().or(z.literal('')).transform((v) => v || null) });
const Absence = z.object({ type: z.enum(['ABSENT', 'VACATION', 'BUSINESS_TRIP', 'TRAINING']), startsOn: z.iso.date(), endsOn: z.iso.date(), note: opt(140) })
  .refine((a) => a.endsOn >= a.startsOn, 'Das Ende liegt vor dem Beginn.');

/** Personen: Suche, Team-Verzeichnis, Profil – nur dienstliche Angaben, keine privaten Daten. */
@Controller('people')
export class PeopleController {
  constructor(private readonly prisma: PrismaService, private readonly policy: PolicyService, private readonly audiences: AudienceService) {}

  private sameCompanies(ctx: PolicyContext) {
    return { employeeProfile: { companyAssignments: { some: { companyId: { in: ctx.companyIds } } } } };
  }

  /** Personensuche für Chat, Erwähnungen und Empfänger – mit Abwesenheit. */
  @RequirePermission('chat.use')
  @Get()
  async search(@CurrentUser() me: SessionUser, @Query('q') q = '') {
    const ctx = await this.policy.loadContext(me.id);
    const users = await this.prisma.db.user.findMany({
      where: { id: { not: me.id }, status: 'ACTIVE', userType: { not: 'SERVICE' }, displayName: { contains: q.trim().slice(0, 60), mode: 'insensitive' },
        // Ohne Verzeichnisrecht (Externe): nur Personen der eigenen Gesellschaften
        ...(can(ctx, 'employees.directory') ? {} : this.sameCompanies(ctx)) },
      include: { employeeProfile: { select: { jobTitle: true } }, groupMemberships: { include: { group: { select: { name: true } } } } },
      orderBy: { displayName: 'asc' }, take: 12,
    });
    const away = await absencesToday(this.prisma.db, users.map((u) => u.id));
    return users.map((u) => ({ id: u.id, name: u.displayName, job: u.employeeProfile?.jobTitle ?? (u.userType === 'EXTERNAL' ? 'extern' : null), groups: u.groupMemberships.map((m) => m.group.name), absent: away.get(u.id) ?? null }));
  }

  /** Team-Verzeichnis: Kolleg:innen der eigenen Gesellschaften, nach Bereich. */
  @RequirePermission('employees.directory')
  @Get('directory')
  async directory(@CurrentUser() me: SessionUser) {
    const ctx = await this.policy.loadContext(me.id);
    const users = await this.prisma.db.user.findMany({ where: { status: 'ACTIVE', userType: 'EMPLOYEE', ...this.sameCompanies(ctx) },
      include: { employeeProfile: { select: { jobTitle: true } }, groupMemberships: { include: { group: { select: { name: true } } } } }, orderBy: { displayName: 'asc' }, take: 1000 });
    const away = await absencesToday(this.prisma.db, users.map((u) => u.id));
    return users.map((u) => ({ id: u.id, name: u.displayName, job: u.employeeProfile?.jobTitle ?? null, groups: u.groupMemberships.map((m) => m.group.name), lead: u.groupMemberships.some((m) => m.isLead), absent: away.get(u.id) ?? null }));
  }

  /** Wer von diesen Empfänger:innen ist gerade abwesend? (Hinweis beim Schreiben von Übergaben) */
  @RequirePermission('chat.use')
  @Post('absent')
  @HttpCode(200)
  async absent(@Body(new ZodPipe(z.object({ targets: AudienceKeys }))) b: { targets: string[] }) {
    const ids = (await this.audiences.resolve(toTargets(b.targets))).slice(0, 500);
    const away = await absencesToday(this.prisma.db, ids);
    const names = await this.prisma.db.user.findMany({ where: { id: { in: [...away.keys()] } }, select: { id: true, displayName: true } });
    return names.map((u) => ({ id: u.id, name: u.displayName, ...away.get(u.id)! }));
  }

  // ---- Eigenes Profil -------------------------------------------------------

  @Get('me/profile')
  async myProfile(@CurrentUser() me: SessionUser) {
    const u = await this.prisma.db.user.findUniqueOrThrow({ where: { id: me.id }, include: { employeeProfile: { include: { absences: { where: { endsOn: { gte: dateOnly() } }, orderBy: { startsOn: 'asc' } } } } } });
    const p = u.employeeProfile;
    return { email: u.email, phoneWork: p?.phoneWork ?? null, phoneMobile: p?.phoneMobile ?? null, aboutMe: p?.aboutMe ?? null, hasProfile: !!p,
      absences: (p?.absences ?? []).map((a) => ({ id: a.id, type: a.type, label: ABSENCE_LABEL[a.type], from: a.startsOn, until: a.endsOn, note: a.note })) };
  }

  @Put('me/profile')
  async saveProfile(@CurrentUser() me: SessionUser, @Body(new ZodPipe(Profile)) b: z.infer<typeof Profile>) {
    const db = this.prisma.db;
    if (b.email && await db.user.count({ where: { email: b.email, id: { not: me.id } } })) throw new BadRequestException('Diese E-Mail-Adresse ist schon vergeben.');
    await db.user.update({ where: { id: me.id }, data: { email: b.email } });
    await db.employeeProfile.updateMany({ where: { userId: me.id }, data: { phoneWork: b.phoneWork, phoneMobile: b.phoneMobile, aboutMe: b.aboutMe } });
    return this.myProfile(me);
  }

  @Post('me/absences')
  async addAbsence(@CurrentUser() me: SessionUser, @Body(new ZodPipe(Absence)) b: z.infer<typeof Absence>) {
    const p = await this.prisma.db.employeeProfile.findUnique({ where: { userId: me.id } });
    if (!p) throw new BadRequestException('Abwesenheiten gibt es nur für Mitarbeitende.');
    await this.prisma.db.absence.create({ data: { employeeProfileId: p.id, type: b.type, startsOn: new Date(b.startsOn), endsOn: new Date(b.endsOn), note: b.note } });
    return this.myProfile(me);
  }

  @Delete('me/absences/:id')
  async removeAbsence(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.prisma.db.absence.deleteMany({ where: { id, employeeProfile: { userId: me.id } } });
    return this.myProfile(me);
  }

  /** Profil einer Kollegin / eines Kollegen: dienstliche Kontaktdaten, Bereich, Abwesenheiten. */
  @RequirePermission('employees.directory')
  @Get(':id')
  async profile(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string) {
    const ctx = await this.policy.loadContext(me.id);
    const u = await this.prisma.db.user.findFirst({ where: { id, status: 'ACTIVE', ...this.sameCompanies(ctx) }, include: {
      employeeProfile: { include: { company: { select: { name: true } }, absences: { where: { showAsAbsent: true, endsOn: { gte: dateOnly() } }, orderBy: { startsOn: 'asc' }, take: 5 } } },
      groupMemberships: { include: { group: { select: { name: true } } } } } });
    if (!u?.employeeProfile) throw new NotFoundException('Diese Person gibt es nicht im Verzeichnis.');
    const p = u.employeeProfile;
    return {
      id, name: u.displayName, fullName: `${p.firstName} ${p.lastName}`, job: p.jobTitle, company: p.company.name, email: u.email, phoneWork: p.phoneWork, phoneMobile: p.phoneMobile, aboutMe: p.aboutMe,
      groups: u.groupMemberships.map((m) => ({ name: m.group.name, lead: m.isLead })),
      absences: p.absences.map((a) => ({ type: a.type, label: ABSENCE_LABEL[a.type], from: a.startsOn, until: a.endsOn, note: a.note })),
      absent: (await absencesToday(this.prisma.db, [id])).get(id) ?? null,
    };
  }
}
