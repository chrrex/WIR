import { day } from '@/components/work';

export interface Absent { label: string; until: string; note: string | null }

/** „im Urlaub bis 14.10.2026 · Vertretung: Selin A.“ */
export function absentText(a: Absent) {
  return `${a.label} bis ${day(a.until)}${a.note ? ` · ${a.note}` : ''}`;
}

export function AbsentChip({ a }: { a?: Absent | null }) {
  return a ? <span className="chip warn" title={absentText(a)}>{a.label} bis {day(a.until)}</span> : null;
}
