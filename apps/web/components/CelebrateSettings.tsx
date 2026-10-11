'use client';

import { useMe } from '@/lib/me';

const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

/** Geburtstag & Dienstjubiläum (ADR-057): freiwillig, ohne Jahr, jederzeit abschaltbar. */
export function CelebrateSettings({ save }: { save: (patch: Record<string, unknown>, label: string) => void }) {
  const { me } = useMe();
  const s = me?.settings;
  if (!s) return null;
  const [m, d] = (s.birthdayMonthDay ?? '-').split('-');
  const set = (mm: string, dd: string) => mm && dd && save({ birthdayMonthDay: `${mm}-${dd}` }, 'Geburtstag gespeichert');
  return (
    <section className="card stack">
      <h2>Geburtstag & Jubiläum</h2>
      <p className="small muted">Freiwillig: Wenn du magst, erscheinst du an deinem Tag in der Leiste „Heute im Haus“ – ohne Jahr, nur im eigenen Haus.</p>
      <div className="row wrap">
        <div className="field"><label htmlFor="bd-d">Tag</label>
          <select id="bd-d" className="input" value={d ?? ''} onChange={(e) => set(m, e.target.value)}>
            <option value="">–</option>{Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0')).map((x) => <option key={x} value={x}>{Number(x)}.</option>)}
          </select></div>
        <div className="field"><label htmlFor="bd-m">Monat</label>
          <select id="bd-m" className="input" value={m ?? ''} onChange={(e) => set(e.target.value, d || '01')}>
            <option value="">–</option>{MONTHS.map((x, i) => <option key={x} value={String(i + 1).padStart(2, '0')}>{x}</option>)}
          </select></div>
        {s.birthdayMonthDay && <button className="btn sm" onClick={() => save({ birthdayMonthDay: null, showBirthday: false }, 'Geburtstag entfernt')}>Entfernen</button>}
      </div>
      <label className="check"><input type="checkbox" checked={s.showBirthday} disabled={!s.birthdayMonthDay} onChange={(e) => save({ showBirthday: e.target.checked }, e.target.checked ? 'Kolleg:innen sehen deinen Geburtstag' : 'Geburtstag ist privat')} />
        Kolleg:innen dürfen meinen Geburtstag sehen</label>
      <label className="check"><input type="checkbox" checked={s.showWorkAnniversary} onChange={(e) => save({ showWorkAnniversary: e.target.checked }, 'Gespeichert')} />
        Mein Dienstjubiläum darf angezeigt werden</label>
    </section>
  );
}
