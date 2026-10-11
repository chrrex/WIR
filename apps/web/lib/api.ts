/** Kleiner Fetch-Wrapper für die WIR-API (gleicher Ursprung, Session-Cookie). */
export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const res = await fetch(`/api/v1${path}`, {
    credentials: 'same-origin',
    ...rest,
    headers: { ...(json !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message = (data && (Array.isArray(data.message) ? data.message[0] : data.message)) || 'Das hat leider nicht geklappt.';
    throw new ApiError(res.status, res.status === 429 ? 'Zu viele Versuche. Bitte warte kurz.' : message, data?.code);
  }
  return data as T;
}

export interface Branding {
  companyId: string;
  companyName: string;
  companyKind: string;
  displayName: string;
  primaryColor: string;
  surfaceColor: string;
  logoKey: string;
  logoRequiresWhite: boolean;
  footerText: string | null;
}

export interface Me {
  user: { id: string; username: string; displayName: string; userType: string; status: string; mustChangePassword: boolean; validUntil: string | null; hasRecoveryEmail: boolean };
  profile: { firstName: string; lastName: string; jobTitle: string | null } | null;
  groups: Array<{ id: string; name: string; isLead: boolean }>;
  companies: Array<{ id: string; name: string; kind: string }>;
  branding: Branding | null;
  modules: string[];
  permissions: string[];
  settings: { theme: 'SYSTEM' | 'LIGHT' | 'DARK'; fontScalePercent: number; reducedMotion: boolean; highContrast: boolean; mobileNavItems: string[]; quietHoursStart: string | null; quietHoursEnd: string | null; locale: string; autoTranslate: boolean; plainLanguage: boolean; showBirthday: boolean; birthdayMonthDay: string | null; showWorkAnniversary: boolean } | null;
}
