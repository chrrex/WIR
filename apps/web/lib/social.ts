export const CATEGORIES: Record<string, string> = {
  GREETINGS: 'Grüße & Momente', MARKETPLACE: 'Biete & Suche', CONGRATULATIONS: 'Glückwünsche', LEISURE: 'Freizeit & Sport', OTHER: 'Sonstiges',
};
export interface SocialPost {
  id: string; title: string; text: string; category: string; intent: 'OFFER' | 'SEARCH' | null; price: string | null; closed: boolean; expiresAt: string | null;
  author: { id: string | null; name: string }; publishedAt: string; mine: boolean; reactions: import('@/components/content/Reactions').Reaction[]; comments: number;
  images: Array<{ fileId: string; altText: string | null }>; canDelete?: boolean;
}
