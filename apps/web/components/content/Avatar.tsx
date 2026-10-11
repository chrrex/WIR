'use client';
/* eslint-disable @next/next/no-img-element */

import { useState } from 'react';
import { initials } from '@/lib/time';

const TONES = ['t1', 't2', 't3', 't4', 't5'];
/** Profilfoto, wenn vorhanden (per Personen-ID) – sonst Initialen. `v` erzwingt nach dem Hochladen ein neues Laden. */
export function Avatar({ name, id, v, size = 'm' }: { name: string; id?: string | null; v?: number; size?: 's' | 'm' | 'l' }) {
  const [failed, setFailed] = useState<string | null>(null);
  const src = id ? `/api/v1/files/avatar/${id}${v ? `?v=${v}` : ''}` : null;
  if (src && failed !== src) return <img className={`av av-${size}`} src={src} alt="" onError={() => setFailed(src)} />;
  const tone = TONES[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % TONES.length];
  return <span className={`av av-${size} ${tone}`} aria-hidden="true">{initials(name)}</span>;
}
