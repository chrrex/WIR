'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { Icon } from '../Icon';

export function LikeButton({ contentId, liked, likes, label = 'Gefällt mir' }: { contentId: string; liked: boolean; likes: number; label?: string }) {
  const [s, setS] = useState({ liked, likes });
  return (
    <button className={`btn sm like ${s.liked ? 'on' : ''}`} aria-pressed={s.liked}
      onClick={async () => setS(await api<{ liked: boolean; likes: number }>(`/content/${contentId}/like`, { method: 'POST' }))}>
      <Icon name={label === 'Herz' ? 'heart' : 'thumb'} size={18} />
      {label === 'Herz' ? <><span className="sr">Herz</span>{s.likes > 0 && s.likes}</> : <>{label}{s.likes ? ` · ${s.likes}` : ''}</>}
    </button>
  );
}
