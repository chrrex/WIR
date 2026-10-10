'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { api } from '@/lib/api';
import { Icon } from '@/components/Icon';
import { ErrorNote, State, useLoad, useSubmit } from '@/components/work';
import { CONTACT_TYPE } from '@/lib/labels';

interface C { id: string; organizationName: string; type: string; categoryId: string | null; category: string | null; contactPerson: string | null; email: string | null; phone: string | null; mobile: string | null;
  emergencyPhone: string | null; isEmergencyContact: boolean; customerNumber: string | null; website: string | null; street: string | null; postalCode: string | null; city: string | null; notes: string | null; isActive: boolean }
const FIELDS: Array<[keyof C, string]> = [['contactPerson', 'Ansprechperson'], ['phone', 'Telefon'], ['mobile', 'Mobil'], ['emergencyPhone', 'Notdienst'], ['email', 'E-Mail'], ['customerNumber', 'Unsere Kundennummer'], ['website', 'Website'], ['street', 'Straße'], ['postalCode', 'PLZ'], ['city', 'Ort']];
const empty = { organizationName: '', type: 'SUPPLIER', categoryId: '', contactPerson: '', email: '', phone: '', mobile: '', emergencyPhone: '', isEmergencyContact: false, customerNumber: '', website: '', street: '', postalCode: '', city: '', notes: '', isActive: true };

function Editor({ value, categories, onDone }: { value: Partial<C> & { id?: string }; categories: Array<{ id: string; name: string }>; onDone: () => void }) {
  const [f, setF] = useState({ ...empty, ...Object.fromEntries(Object.entries(value).map(([k, v]) => [k, v ?? ''])) } as typeof empty & { id?: string });
  const { busy, error, run } = useSubmit();
  const { id, ...body } = f;
  return (
    <form className="card stack" onSubmit={async (e) => { e.preventDefault(); if (await run(() => api(id ? `/contacts/${id}` : '/contacts', { method: id ? 'PUT' : 'POST', json: { ...body, categoryId: body.categoryId || null } }))) onDone(); }}>
      <h2>{id ? 'Kontakt bearbeiten' : 'Neuer Kontakt'}</h2>
      <div className="row wrap">
        <div className="field grow"><label htmlFor="on">Firma / Organisation</label><input id="on" className="input" value={f.organizationName} onChange={(e) => setF({ ...f, organizationName: e.target.value })} required /></div>
        <div className="field"><label htmlFor="ty">Art</label><select id="ty" className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{Object.entries(CONTACT_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div className="field"><label htmlFor="ca">Kategorie</label><select id="ca" className="input" value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}><option value="">–</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
      </div>
      <div className="grid">{FIELDS.map(([k, l]) => <div key={k} className="field"><label htmlFor={`f-${k}`}>{l}</label><input id={`f-${k}`} className="input" value={String(f[k as keyof typeof f] ?? '')} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>)}</div>
      <div className="field"><label htmlFor="no">Hinweise</label><textarea id="no" className="input area" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
      <label className="check"><input type="checkbox" checked={f.isEmergencyContact} onChange={(e) => setF({ ...f, isEmergencyContact: e.target.checked })} />Notdienst (oben anzeigen)</label>
      {id && <label className="check"><input type="checkbox" checked={!f.isActive} onChange={(e) => setF({ ...f, isActive: !e.target.checked })} />Kontakt ausblenden</label>}
      <ErrorNote error={error} />
      <div className="row"><button type="button" className="btn" onClick={onDone}>Abbrechen</button><button className="btn pri" disabled={busy}>Speichern</button></div>
    </form>
  );
}

function Contacts() {
  const [q, setQ] = useState(useSearchParams().get('q') ?? '');
  const { data, error, reload } = useLoad<{ canManage: boolean; categories: Array<{ id: string; name: string }>; contacts: C[] }>(`/contacts?q=${encodeURIComponent(q)}`);
  const [edit, setEdit] = useState<(Partial<C> & { id?: string }) | null>(null);
  if (!data) return <State error={error} loading />;
  const done = () => { setEdit(null); reload(); };
  return (
    <div className="stack-lg">
      <div className="ptitle"><h1>Kontakte</h1>{data.canManage && !edit && <button className="btn pri" onClick={() => setEdit({})}><Icon name="plus" size={18} />Neuer Kontakt</button>}</div>
      {edit && <Editor value={edit} categories={data.categories} onDone={done} />}
      <div className="field"><label htmlFor="cq" className="sr">Kontakte durchsuchen</label><input id="cq" type="search" className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Firma, Person, Ort …" /></div>
      {data.contacts.length === 0 ? <div className="card empty">Keine Kontakte gefunden.</div> : (
        <div className="grid">
          {data.contacts.map((c) => (
            <div key={c.id} className={`card stack-s ${c.isEmergencyContact ? 'emergency' : ''}`}>
              <span className="chips">{c.isEmergencyContact && <span className="chip warn">Notdienst</span>}<span className="chip">{c.category ?? CONTACT_TYPE[c.type]}</span></span>
              <strong>{c.organizationName}</strong>
              {c.contactPerson && <span className="small">{c.contactPerson}</span>}
              {c.emergencyPhone && <a className="btn warn-solid" href={`tel:${c.emergencyPhone.replace(/\s/g, '')}`}>Notdienst {c.emergencyPhone}</a>}
              {c.phone && <a className="lnk" href={`tel:${c.phone.replace(/\s/g, '')}`}>{c.phone}</a>}
              {c.mobile && <a className="lnk" href={`tel:${c.mobile.replace(/\s/g, '')}`}>{c.mobile}</a>}
              {c.email && <a className="lnk" href={`mailto:${c.email}`}>{c.email}</a>}
              {c.customerNumber && <span className="xs muted">Kundennr. {c.customerNumber}</span>}
              {c.notes && <span className="small muted">{c.notes}</span>}
              {data.canManage && <div><button className="btn sm" onClick={() => setEdit(c)}>Bearbeiten</button></div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Page() { return <Suspense><Contacts /></Suspense>; }
