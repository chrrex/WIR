import type { Branding } from '@/lib/api';

/**
 * Logo der Gesellschaft. Markenregel (ADR-039): Ist logoRequiresWhite gesetzt (DKB STIFTUNG),
 * steht das Logo immer auf einer weißen Fläche – auch im Dunkelmodus.
 */
export function Logo({ branding, variant = 'side' }: { branding: Branding | null; variant?: 'side' | 'head' | 'hero' }) {
  if (!branding) return null;
  const alt = branding.displayName;
  if (branding.logoRequiresWhite && variant !== 'hero') {
    // Seitenleiste und mobile Kopfzeile sind bei dieser Marke selbst weiß (ADR-053) – keine extra Fläche nötig
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={`logo-img logo-dkb logo-${variant}`} src={`/brand/${branding.logoKey}.png`} alt={alt} />;
  }
  if (branding.logoRequiresWhite) {
    return (
      <span className={`logo-plate logo-${variant}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/brand/${branding.logoKey}.png`} alt={alt} />
      </span>
    );
  }
  if (branding.logoKey === 'sgl') {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={`logo-img logo-${variant}`} src="/brand/sgl.svg" alt={alt} />;
  }
  return <span className={`logo-text logo-${variant}`}>{alt}</span>;
}

export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={compact ? 'wordmark compact' : 'wordmark'}>
      {/* Wortmarke als Sprechblase (ADR-060) */}
      <span className="wm"><span className="wm-bubble">WIR</span></span>
      {!compact && <span className="wm-sub">Das Mitarbeiterportal</span>}
    </span>
  );
}
