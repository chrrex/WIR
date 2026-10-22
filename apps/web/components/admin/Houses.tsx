'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { contrastWithWhite } from '@/lib/brand';
import { useMe } from '@/lib/me';
import { MODULE_LABEL } from '@/lib/permissions';
import { ErrorNote, useLoad, useSubmit } from '@/components/work';

interface B { displayName: string; primaryColor: string; surfaceColor: string | null; footerText: string | null; logoRequiresWhite: boolean }
interface C { id: string; name: string; kind: string; disabledModules: string[]; readListVisibility: string; canBrand: boolean; branding: B | null }

/** Einstellungen je Haus (ADR-055): Module, Lesestatus-Sichtbarkeit, Auftritt – ohne Entwickler:in. */
export function Houses() {
  const { data, error, reload } = useLoad<C[]>('/admin/companies');
  const { data: o } = useLoad<{ modules: string[] }>('/admin/options');
  if (!data || !o) return <ErrorNote error={error} />;
  return <section className="stack">{data.map((c) => <House key={c.id} c={c} modules={o.modules} onSaved={reload} />)}</section>;
}

function House({ c, modules, onSaved }: { c: C; modules: string[]; onSaved: () => void }) {
  const { refresh } = useMe();
  const [off, setOff] = useState(c.disabledModules);
  const [vis, setVis] = useState(c.readListVisibility);
  const [b, setB] = useState<B | null>(c.branding);
  const [saved, setSaved] = useState(false);
  const { busy, error, run } = useSubmit();
  const ratio = b ? contrastWithWhite(b.primaryColor) : 5;
  async function save() {
    const r = await run(() => api(`/admin/companies/${c.id}`, { method: 'PATCH', json: { disabledModules: off, readListVisibility: vis, ...(c.canBrand && b ? { branding: { displayName: b.displayName, primaryColor: b.primaryColor, surfaceColor: b.surfaceColor || null, footerText: b.footerText || null } } : {}) } }));
    if (r) { setSaved(true); setTimeout(() => setSaved(false), 2500); onSaved(); void refresh(); }
  }
  const id = (k: string) => `${k}-${c.id}`;
  return (
    <form className="card stack" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <h2>{c.name}</h2>
      <fieldset className="stack-s"><legend className="label">Module</legend>
        <p className="small muted">Abgeschaltete Module verschwinden aus dem Menü – für alle, die nur in dieser Gesellschaft arbeiten. Inhalte bleiben erhalten.</p>
        <div className="checks">{modules.map((m) => (
          <label key={m} className="check"><input type="checkbox" checked={!off.includes(m)} onChange={(e) => setOff(e.target.checked ? off.filter((x) => x !== m) : [...off, m])} />{MODULE_LABEL[m] ?? m}</label>
        ))}</div>
      </fieldset>
      <div className="field"><label htmlFor={id('vis')}>Wer sieht beim Lesestatus die Namen?</label>
        <select id={id('vis')} className="input" value={vis} onChange={(e) => setVis(e.target.value)}>
          <option value="AUTHOR_AND_LEADS">Verfasser:in und Teamleitungen (Standard)</option>
          <option value="ALL_RECIPIENTS">Alle Empfänger:innen – nur nach Betriebsvereinbarung</option>
        </select></div>
      {c.canBrand && b && (
        <fieldset className="stack-s"><legend className="label">Auftritt</legend>
          <div className="grid">
            <div className="field"><label htmlFor={id('dn')}>Name im WIR</label><input id={id('dn')} className="input" value={b.displayName} maxLength={80} onChange={(e) => setB({ ...b, displayName: e.target.value })} /></div>
            <div className="field"><label htmlFor={id('ft')}>Fußzeile</label><input id={id('ft')} className="input" value={b.footerText ?? ''} maxLength={120} onChange={(e) => setB({ ...b, footerText: e.target.value })} /></div>
            <div className="field"><label htmlFor={id('pc')}>Aktionsfarbe (Knöpfe, Links)</label>
              <div className="row"><input type="color" aria-label="Aktionsfarbe wählen" value={b.primaryColor} onChange={(e) => setB({ ...b, primaryColor: e.target.value.toUpperCase() })} /><input id={id('pc')} className="input grow" value={b.primaryColor} pattern="#[0-9A-Fa-f]{6}" onChange={(e) => setB({ ...b, primaryColor: e.target.value })} /></div>
              <span className={`small ${ratio < 4.5 ? 'warn-ink' : 'muted'}`}>Kontrast zu weißer Schrift: {ratio.toFixed(1)} : 1 {ratio < 4.5 ? '– zu hell, bitte dunkler wählen (mind. 4,5 : 1)' : '– gut lesbar'}</span></div>
            <div className="field"><label htmlFor={id('sc')}>Flächenfarbe (Markenfeld, Kopfzeile)</label>
              <div className="row"><input type="color" aria-label="Flächenfarbe wählen" value={b.surfaceColor ?? b.primaryColor} onChange={(e) => setB({ ...b, surfaceColor: e.target.value.toUpperCase() })} /><input id={id('sc')} className="input grow" value={b.surfaceColor ?? ''} placeholder="wie Aktionsfarbe" onChange={(e) => setB({ ...b, surfaceColor: e.target.value })} /></div></div>
          </div>
          <div className="brand-preview" style={{ ['--p' as string]: b.primaryColor, ['--s' as string]: b.surfaceColor || b.primaryColor }}>
            <span className="bp-side">{b.displayName}</span><span className="bp-btn">Knopf</span><span className="bp-link">Link</span>
          </div>
          {b.logoRequiresWhite && <p className="small muted">Das Logo dieses Hauses steht immer auf Weiß (Markenregel).</p>}
          <p className="small muted">Ein neues Logo spielt die IT ein – es muss vorher für den Einsatz auf Weiß bzw. auf Farbfläche geprüft sein.</p>
        </fieldset>
      )}
      <ErrorNote error={error} />
      <div className="row"><button className="btn pri" disabled={busy || (c.canBrand && ratio < 4.5)}>Speichern</button>{saved && <span className="small" role="status">Gespeichert</span>}</div>
    </form>
  );
}
