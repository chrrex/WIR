'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Icon } from '@/components/Icon';
import { Cat, Folders, within } from '@/components/Folders';
import { ReadChip, useReadCounts } from '@/components/content/ReadStatus';
import { State, useLoad, day } from '@/components/work';
import { TYPE_LABEL } from '@/lib/labels';

interface A { id: string; title: string; type: string; categoryId: string; version: number; updatedAt: string; author: string; status: string; requiresAck: boolean; acknowledged: boolean }
interface Data { canCreate: boolean; canManage: boolean; categories: Cat[]; articles: A[]; mine: A[]; review: A[] }

export default function Knowledge() {
  const { data, error, reload } = useLoad<Data>('/knowledge');
  const [folder, setFolder] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const counts = useReadCounts((data?.articles ?? []).map((a) => a.id));
  if (!data) return <State error={error} loading />;
  const cats = data.categories;
  const term = q.trim().toLowerCase();
  const list = term ? data.articles.filter((a) => a.title.toLowerCase().includes(term)) : data.articles.filter((a) => a.categoryId === folder);
  const open = data.articles.filter((a) => a.requiresAck && !a.acknowledged).length;
  const Row = ({ a, meta }: { a: A; meta?: React.ReactNode }) => (
    <Link href={`/wissen/${a.id}`} className="card listitem">
      <span className={`udot ${a.requiresAck && !a.acknowledged ? 'warn' : 'off'}`} aria-label={a.requiresAck && !a.acknowledged ? 'Bestätigung offen' : undefined} />
      <span className="grow">
        <span className="row wrap gap-s"><span className="chip info">{TYPE_LABEL[a.type] ?? a.type}</span><strong className="title">{a.title}</strong></span>
        <span className="block muted small">{meta ?? <>{term && `${cats.find((c) => c.id === a.categoryId)?.path ?? ''} · `}Version {a.version} · {day(a.updatedAt)}{a.requiresAck && (a.acknowledged ? ' · bestätigt' : ' · bitte bestätigen')} <ReadChip c={counts[a.id]} /></>}</span>
      </span>
    </Link>
  );
  return (
    <div className="stack-lg">
      <div className="ptitle"><h1>Wissen & SOPs</h1>{data.canCreate && <Link className="btn pri" href="/wissen/neu"><Icon name="plus" size={18} />Neuer Eintrag</Link>}</div>
      {open > 0 && <div className="note info">{open} Artikel {open === 1 ? 'wartet' : 'warten'} auf deine Bestätigung „Gelesen und verstanden“.</div>}
      {data.review.length > 0 && (
        <section className="stack-s">
          <h2 className="h-sub">Zur Prüfung ({data.review.length})</h2>
          <div className="list">{data.review.map((a) => <Row key={a.id} a={a} meta={`von ${a.author} · eingereicht ${day(a.updatedAt)}`} />)}</div>
        </section>
      )}
      {data.mine.length > 0 && (
        <section className="stack-s">
          <h2 className="h-sub">Meine Einträge in Arbeit</h2>
          <div className="list">{data.mine.map((a) => <Row key={a.id} a={a} meta={a.status === 'DRAFT' ? 'wartet auf Freigabe durch die Teamleitung' : 'nicht freigegeben – bitte überarbeiten'} />)}</div>
        </section>
      )}
      <div className="field"><label htmlFor="kq" className="sr">Wissen durchsuchen</label><input id="kq" type="search" className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="In allen Artikeln suchen …" /></div>
      {!term && <Folders cats={cats} folder={folder} setFolder={setFolder} canManage={data.canManage} base="/knowledge/categories" onChange={reload}
        count={(id) => data.articles.filter((a) => within(cats, a.categoryId, id)).length} />}
      {list.length > 0 ? <div className="list">{list.map((a) => <Row key={a.id} a={a} />)}</div>
        : (term || (folder && !cats.some((c) => c.parentId === folder))) && <div className="card empty">{term ? 'Nichts gefunden.' : 'In dieser Kategorie gibt es noch keine Artikel.'}</div>}
    </div>
  );
}
