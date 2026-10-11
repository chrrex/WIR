-- Profil: dienstliches Handy (freiwillig, selbst gepflegt); Abwesenheit: kurze Notiz z. B. Vertretung (ADR-046)
ALTER TABLE "employee_profiles" ADD COLUMN "phone_mobile" TEXT;
ALTER TABLE "absences" ADD COLUMN "note" TEXT;
