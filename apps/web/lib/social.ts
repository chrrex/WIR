export const CATEGORIES: Record<string, string> = {
  GREETINGS: 'Grüße & Momente', MARKETPLACE: 'Biete & Suche', CONGRATULATIONS: 'Glückwünsche', LEISURE: 'Freizeit & Sport', OTHER: 'Sonstiges', THANKS: 'Danke',
};
/** Motive der Danke-Karten (ADR-051) */
export const MOTIF: Record<string, [string, string]> = { HOST: ['🏰', 'Gastgeberschaft'], TEAM: ['🤝', 'Teamgeist'], HELP: ['🙌', 'Hilfsbereitschaft'], GREEN: ['🌱', 'Nachhaltigkeit'], WIR: ['💚', 'Weil Wir Wirkt'], GUEST: ['⭐', 'Gästelob'] };
export interface Kudos { motif: string; source: string | null; team: string | null; private: boolean; to: Array<{ id: string; name: string }>; signers: Array<{ id: string; name: string }>; signed: boolean; forMe: boolean }
export interface SocialPost {
  poll?: import('@/components/content/Extras').Poll | null;
  id: string; title: string; text: string; category: string; intent: 'OFFER' | 'SEARCH' | null; price: string | null; closed: boolean; expiresAt: string | null;
  author: { id: string | null; name: string }; publishedAt: string; mine: boolean; reactions: import('@/components/content/Reactions').Reaction[]; comments: number;
  images: Array<{ fileId: string; altText: string | null }>; canDelete?: boolean; kudos: Kudos | null;
}
