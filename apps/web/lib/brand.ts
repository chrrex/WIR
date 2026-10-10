import type { Branding } from './api';

/** Setzt die Design-Tokens der Gesellschaft (ADR-034/039). */
export function applyBranding(b: Branding | null) {
  const root = document.documentElement;
  if (!b) return;
  root.style.setProperty('--brand', b.primaryColor);
  root.style.setProperty('--nav-bg', b.surfaceColor);
  root.dataset.brand = b.logoKey;
  root.dataset.surface = contrastWithWhite(b.surfaceColor) < 4.5 ? 'low-contrast' : 'ok';
}

/** Kontrastverhältnis von weißer Schrift auf einer Farbe (WCAG 2.x). */
export function contrastWithWhite(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const L = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  return 1.05 / (L + 0.05);
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
