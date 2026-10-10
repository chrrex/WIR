import type { Branding } from './api';

/** Setzt die Design-Tokens der Gesellschaft (ADR-034/039). */
export function applyBranding(b: Branding | null) {
  const root = document.documentElement;
  if (!b) return;
  root.style.setProperty('--brand', b.primaryColor);
  root.style.setProperty('--nav-bg', b.surfaceColor);
  root.dataset.brand = b.logoKey;
}

export function applySettings(s: { theme: string; fontScalePercent: number; reducedMotion: boolean } | null) {
  const root = document.documentElement;
  if (!s) return;
  if (s.theme === 'LIGHT') root.dataset.theme = 'light';
  else if (s.theme === 'DARK') root.dataset.theme = 'dark';
  else delete root.dataset.theme;
  root.style.setProperty('--fs', `${(16 * s.fontScalePercent) / 100}px`);
  root.dataset.motion = s.reducedMotion ? 'reduced' : 'full';
}
