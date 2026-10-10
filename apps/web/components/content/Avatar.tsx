import { initials } from '@/lib/time';

const TONES = ['t1', 't2', 't3', 't4', 't5'];
export function Avatar({ name, size = 'm' }: { name: string; size?: 's' | 'm' }) {
  const tone = TONES[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % TONES.length];
  return <span className={`av av-${size} ${tone}`} aria-hidden="true">{initials(name)}</span>;
}
