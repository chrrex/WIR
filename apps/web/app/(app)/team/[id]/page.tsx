'use client';

import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useMe } from '@/lib/me';
import { Avatar } from '@/components/content/Avatar';
import { absentText } from '@/components/Absent';
import { Back, State, day, useLoad } from '@/components/work';

interface P { id: string; name: string; fullName: string; job: string | null; company: string; email: string | null; phoneWork: string | null; phoneMobile: string | null; aboutMe: string | null;
  groups: Array<{ name: string; lead: boolean }>; absences: Array<{ label: string; from: string; until: string; note: string | null }>; absent: { label: string; until: string; note: string | null } | null }

export default function Person() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can } = useMe();
  const { data: p, error } = useLoad<P>(`/people/${id}`);
  if (!p) return <State error={error} loading back={['/team', 'Zum Team']} />;
  const tel = (n: string) => `tel:${n.replace(/[^\d+]/g, '')}`;
  return (
    <div className="stack-lg narrow-col">
      <Back href="/team" label="Team" />
      <section className="card stack">
        <div className="row"><Avatar name={p.name} id={p.id} size="l" /><div><h1>{p.fullName}</h1><p className="muted">{p.job ?? '–'} · {p.company}</p></div></div>
        {p.absent && <div className="note warn">Heute {absentText(p.absent)}</div>}
        <div className="chips">{p.groups.map((g) => <span key={g.name} className="chip">{g.name}{g.lead && ' · Leitung'}</span>)}</div>
        <dl className="facts">
          {p.email && <><dt>E-Mail</dt><dd><a className="lnk" href={`mailto:${p.email}`}>{p.email}</a></dd></>}
          {p.phoneWork && <><dt>Durchwahl</dt><dd><a className="lnk" href={tel(p.phoneWork)}>{p.phoneWork}</a></dd></>}
          {p.phoneMobile && <><dt>Handy (dienstlich)</dt><dd><a className="lnk" href={tel(p.phoneMobile)}>{p.phoneMobile}</a></dd></>}
        </dl>
        {!p.email && !p.phoneWork && !p.phoneMobile && <p className="small muted">Keine Kontaktdaten hinterlegt.</p>}
        {p.aboutMe && <p>{p.aboutMe}</p>}
        {can('chat.use') && <div><button className="btn pri" onClick={async () => { const c = await api<{ id: string }>('/chat/direct', { method: 'POST', json: { userId: id } }); router.push(`/chat/${c.id}`); }}>Nachricht schreiben</button></div>}
      </section>
      {p.absences.length > 0 && (
        <section className="card stack-s">
          <h2 className="h-sub">Abwesenheiten</h2>
          <ul className="plain stack-s">{p.absences.map((a, i) => <li key={i}>{day(a.from)} – {day(a.until)} · {a.label}{a.note && <span className="muted"> · {a.note}</span>}</li>)}</ul>
        </section>
      )}
    </div>
  );
}
