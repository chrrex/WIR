import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

/** Einmal-Codes: 6 Ziffern, Anzeige als „482 913“. */
export function generateOneTimeCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export function formatOneTimeCode(code: string): string {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

export function normalizeOneTimeCode(input: string): string {
  return input.replace(/\D/g, '');
}

/**
 * Codes werden nie im Klartext gespeichert (ADR-011). HMAC mit Server-Geheimnis,
 * gebunden an die Person – so ist derselbe Code bei zwei Personen kein Konflikt
 * und ein Datenbank-Abzug allein reicht nicht zum Durchprobieren.
 */
export function hashOneTimeCode(userId: string, code: string, secret: string): string {
  return createHmac('sha256', secret).update(`${userId}:${normalizeOneTimeCode(code)}`).digest('hex');
}

export function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
