'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Kudos, MOTIF } from '@/lib/social';

/** Kleine, eigene Illustrationen je Motiv (ADR-052) – flach, in den Motivfarben. */
export function KudosArt({ motif }: { motif: string }) {
  const art: Record<string, React.ReactNode> = {
    HOST: <>
      <rect width="320" height="150" fill="#F6EEDB" /><circle cx="262" cy="38" r="18" fill="#E9C46A" />
      <path d="M0 150V118Q80 92 160 108T320 112V150Z" fill="#C9B37E" />
      <path d="M96 118V70h14v-12h10v12h22V52h-6l13-20 13 20h-6v18h22V58h10v12h14v48Z" fill="#8A6A2E" />
      <path d="M148 32v-14l12 5-12 5" fill="#A04050" /><rect x="140" y="88" width="16" height="30" rx="8" fill="#F6EEDB" />
      <rect x="112" y="80" width="8" height="10" rx="2" fill="#F6EEDB" /><rect x="176" y="80" width="8" height="10" rx="2" fill="#F6EEDB" />
    </>,
    TEAM: <>
      <rect width="320" height="150" fill="#E3E8F2" />
      {[[110, '#9FB2D6'], [210, '#9FB2D6'], [160, '#1E3560']].map(([x, c]) => <g key={x as number} fill={c as string}><circle cx={x as number} cy="62" r="20" /><path d={`M${(x as number) - 34} 150v-30a34 34 0 0 1 68 0v30Z`} /></g>)}
      <path d="M160 26c-4-6-13-4-13 3 0 6 13 13 13 13s13-7 13-13c0-7-9-9-13-3z" fill="#A04050" />
    </>,
    HELP: <>
      <rect width="320" height="150" fill="#F6E6E9" />
      <path d="M160 128C108 96 92 70 104 50c11-18 38-16 56 6 18-22 45-24 56-6 12 20-4 46-56 78z" fill="#8A3443" />
      {[[70, 40], [250, 46], [84, 110], [240, 108]].map(([x, y]) => <path key={x} d={`M${x} ${y - 9}l3 6 6 3-6 3-3 6-3-6-6-3 6-3z`} fill="#D98C9A" />)}
    </>,
    GREEN: <>
      <rect width="320" height="150" fill="#E4F0E2" /><rect y="122" width="320" height="28" fill="#8C6B4A" />
      {[90, 160, 230].map((x, i) => <g key={x}><path d={`M${x} 122v-${40 + i * 12}`} stroke="#3D6B2A" strokeWidth="4" />
        <path d={`M${x} ${100 - i * 8}c-26-2-34-20-30-30 18 0 30 12 30 30z`} fill="#5E9A3E" /><path d={`M${x} ${92 - i * 10}c24-4 32-22 26-32-16 2-28 14-26 32z`} fill="#3D6B2A" /></g>)}
    </>,
    WIR: <>
      <rect width="320" height="150" fill="#E9EDDD" />
      <text x="160" y="104" textAnchor="middle" fontSize="78" fontWeight="800" letterSpacing="14" fill="#6B7A3E" fontFamily="system-ui, sans-serif">WIR</text>
      <path d="M262 40c-5-8-17-5-17 4 0 8 17 17 17 17s17-9 17-17c0-9-12-12-17-4z" fill="#A04050" />
    </>,
    GUEST: <>
      <rect width="320" height="150" fill="#FBF5E8" />
      <path d="M70 30h180a16 16 0 0 1 16 16v44a16 16 0 0 1-16 16H130l-26 22v-22H70a16 16 0 0 1-16-16V46a16 16 0 0 1 16-16z" fill="#fff" stroke="#E2C98E" strokeWidth="3" />
      {[0, 1, 2, 3, 4].map((i) => <path key={i} transform={`translate(${104 + i * 28} 68)`} d="M0-13l3.8 8 8.7 1.1-6.4 6 1.7 8.6L0 6.4-7.8 10.7-6.1 2.1l-6.4-6 8.7-1.1z" fill="#D9A21B" />)}
    </>,
  };
  return <svg viewBox="0 0 320 150" className="kart" aria-hidden="true" focusable="false">{art[motif] ?? art.WIR}</svg>;
}

/** Konfetti in den Motivfarben – einmal beim ersten Öffnen einer Karte an dich. */
export function Confetti() {
  const [on, setOn] = useState(true);
  useEffect(() => { const t = setTimeout(() => setOn(false), 3200); return () => clearTimeout(t); }, []);
  const reduced = typeof window !== 'undefined' && (document.documentElement.dataset.motion === 'reduced' || window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  if (!on || reduced) return null;
  const colors = ['#6B7A3E', '#E9C46A', '#A04050', '#1E3560', '#5E9A3E', '#D9A21B'];
  return (
    <div className="confetti" aria-hidden="true">
      {Array.from({ length: 70 }, (_, i) => <i key={i} style={{ left: `${(i * 37) % 100}%`, background: colors[i % colors.length], animationDelay: `${(i % 10) * 0.09}s`, animationDuration: `${2 + (i % 5) * 0.25}s`, transform: `rotate(${i * 29}deg)` }} />)}
    </div>
  );
}

/** Die Danke-Karte als Klappkarte: vorne Motiv, hinten der Text mit Unterschriften. */
export function KudosCard({ k, text, author, id, autoOpen = false }: { k: Kudos; text: string; author: string; id: string; autoOpen?: boolean }) {
  const [back, setBack] = useState(autoOpen);
  const [kk, setK] = useState(k);
  useEffect(() => { if (autoOpen) setBack(true); }, [autoOpen]);
  const [emoji, label] = MOTIF[kk.motif] ?? ['💚', ''];
  const to = [...kk.to.map((t) => t.name), ...(kk.team ? [`Team ${kk.team}`] : [])].join(', ');
  const canSign = !kk.forMe;
  return (
    <div className="stack-s">
      <div className={`kcard m-${kk.motif} ${back ? 'flipped' : ''}`}>
        <div className="kface front" aria-hidden={back} inert={back || undefined} onClick={() => setBack(true)}>
          <KudosArt motif={kk.motif} />
          <div className="kmeta">
            <span className="xs strong">{emoji} {kk.motif === 'GUEST' ? 'Gästelob' : `Danke-Karte · ${label}`}</span>
            <span className="small">an {to}{kk.private && ' · nur für die Bedankten'}</span>
            <button type="button" className="lnk small kflip" onClick={(e) => { e.stopPropagation(); setBack(true); }}>Karte umdrehen ↻</button>
          </div>
        </div>
        <div className="kface back" aria-hidden={!back} inert={!back || undefined} onClick={() => setBack(false)}>
          <p className="ktext">„{text}“</p>
          <p className="small muted">{kk.motif === 'GUEST' ? <>{kk.source ? `aus: ${kk.source} · ` : ''}weitergegeben von {author}</> : <>– {author}</>}</p>
          {kk.signers.length > 0 && <div className="ksigs"><span className="xs muted">Mitunterschrieben von</span><span className="sig">{kk.signers.map((s) => s.name).join(' · ')}</span></div>}
          <button type="button" className="lnk small kflip" onClick={(e) => { e.stopPropagation(); setBack(false); }}>Zurück zur Vorderseite ↻</button>
        </div>
      </div>
      {canSign && (
        <button type="button" className={`btn sm ${kk.signed ? 'on' : ''}`} aria-pressed={kk.signed}
          onClick={() => api<Kudos>(`/social/thanks/${id}/sign`, { method: 'POST' }).then((r) => { setK(r); setBack(true); }).catch(() => null)}>
          ✍️ {kk.signed ? 'Mitunterschrieben' : 'Ich unterschreibe mit'}{kk.signers.length > 0 && ` (${kk.signers.length})`}
        </button>
      )}
    </div>
  );
}
