'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { api } from './api';

export interface Badges { news: number; handovers: number; chat: number; notifications: number }
const Ctx = createContext<{ badges: Badges; refresh: () => void }>({ badges: { news: 0, handovers: 0, chat: 0, notifications: 0 }, refresh: () => undefined });

/** Zähler für Menü und Glocke – alle 30 Sekunden und bei jedem Seitenwechsel. */
export function BadgesProvider({ children }: { children: React.ReactNode }) {
  const [badges, setBadges] = useState<Badges>({ news: 0, handovers: 0, chat: 0, notifications: 0 });
  const pathname = usePathname();
  const refresh = useCallback(() => { api<Badges>('/me/badges').then(setBadges).catch(() => null); }, []);
  useEffect(() => { refresh(); }, [refresh, pathname]);
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 30_000);
    return () => clearInterval(t);
  }, [refresh]);
  return <Ctx.Provider value={{ badges, refresh }}>{children}</Ctx.Provider>;
}

export const useBadges = () => useContext(Ctx);
