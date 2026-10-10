'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { api, ApiError, Me } from './api';
import { applyBranding, applySettings } from './brand';

interface MeState {
  me: Me | null;
  refresh: () => Promise<void>;
  can: (permission: string) => boolean;
}

const Ctx = createContext<MeState | null>(null);

/** Lädt die angemeldete Person; leitet bei fehlender Anmeldung bzw. ausstehendem Passwortwechsel um. */
export function MeProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  const refresh = useCallback(async () => {
    try {
      const data = await api<Me>('/me');
      applyBranding(data.branding);
      applySettings(data.settings);
      setMe(data);
      if (data.user.mustChangePassword && pathname !== '/passwort') router.replace('/passwort');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) router.replace('/anmelden');
      else throw e;
    }
  }, [router, pathname]);

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const can = useCallback((p: string) => !!me?.permissions.includes(p), [me]);
  return <Ctx.Provider value={{ me, refresh, can }}>{children}</Ctx.Provider>;
}

export function useMe(): MeState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useMe außerhalb von MeProvider');
  return v;
}
