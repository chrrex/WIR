'use client';

import { useSearchParams } from 'next/navigation';
import { api } from './api';

/** Meetings (ADR-061): Texte und „Daraus machen …“ – Formulare vorbefüllen und danach mit dem Punkt verknüpfen. */
export const MEETING_STATUS: Record<string, string> = { PLANNED: 'Punkte sammeln', AGENDA_SET: 'Agenda verteilt', LIVE: 'Läuft gerade', REVIEW: 'Protokoll in Prüfung', LOCKED: 'Festgeschrieben', CANCELLED: 'Fällt aus' };
export const ATTENDANCE: Record<string, string> = { INVITED: 'eingeladen', PRESENT: 'anwesend', ONLINE: 'online', EXCUSED: 'entschuldigt', ABSENT: 'abwesend' };
export const ROLE: Record<string, string> = { LEAD: 'Leitung', MINUTES: 'Protokoll', TIMEKEEPER: 'Zeitwächter:in' };
export const ITEM_STATUS: Record<string, string> = { PROPOSED: 'eingebracht', SET: 'auf der Agenda', DONE: 'besprochen', POSTPONED: 'vertagt', PARKED: 'Parkplatz', MERGED: 'zusammengelegt' };
export const ORIGIN: Record<string, string> = { CARRIED: 'Aus dem letzten Meeting', FOLLOW_UP: 'Wiedervorlage', PARKED: 'Vom Parkplatz', IDEA: 'Idee mit viel Zuspruch' };
export const LINK_KIND: Record<string, string> = { TASK: 'Aufgabe', KNOWLEDGE: 'Wissen/SOP', NEWS: 'News', HANDOVER: 'Übergabe', CHECKLIST: 'Checkliste' };

/** Ziele für „Daraus machen …“ (außer Aufgabe – die entsteht direkt im Meeting). */
export const MAKE = [
  { kind: 'KNOWLEDGE', label: 'Wissen/SOP (Entwurf zur Freigabe)', href: '/wissen/neu' },
  { kind: 'NEWS', label: 'News', href: '/news/neu' },
  { kind: 'HANDOVER', label: 'Übergabe', href: '/uebergaben/neu' },
  { kind: 'CHECKLIST', label: 'Checkliste', href: '/checklisten/neu' },
] as const;

export function makeHref(base: string, itemId: string, title: string, text: string, decisionId?: string) {
  const q = new URLSearchParams({ von: itemId, titel: title.slice(0, 160), text: text.slice(0, 3000), ...(decisionId ? { e: decisionId } : {}) });
  return `${base}?${q}`;
}

/** In Formularen: Vorbefüllung aus dem Meeting und Verknüpfung nach dem Speichern. */
export function useFromMeeting() {
  const p = useSearchParams();
  const von = p.get('von');
  return {
    from: von,
    title: p.get('titel') ?? '',
    text: p.get('text') ?? '',
    /** nach dem Anlegen aufrufen – Fehler beim Verknüpfen blockieren nie */
    link: async (target: { contentItemId?: string; checklistId?: string }) => {
      if (!von) return;
      await api(`/meetings/items/${von}/links`, { method: 'POST', json: { ...target, decisionId: p.get('e') } }).catch(() => null);
    },
  };
}

export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, s) % 60).padStart(2, '0')}`;
export const when = (iso: string) => new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' }).format(new Date(iso));

export interface L { id: string; kind: string; decisionId: string | null; title: string; status: string | null; href: string; assignee?: string | null; dueAt?: string | null }
export interface I {
  id: string; title: string; description: string | null; author: string | null; authorId: string | null; ownerId: string | null; owner: string | null; durationMin: number; status: string;
  confidential: boolean; viewers: Array<{ id: string; name: string }>; notes: string | null; photos: string[]; spentSec: number; running: boolean; sourcePath: string | null; origin: string | null;
  followUpOn: string | null; mergedIntoId: string | null; decisions: Array<{ id: string; text: string }>; links: L[];
}
export interface A { id: string; userId: string | null; name: string; guest: boolean; org: string | null; email: string | null; role: string | null; status: string }
export interface Meeting {
  id: string; title: string; startsAt: string; durationMin: number; location: string | null; onlineUrl: string | null; status: string; agendaDeadline: string | null;
  submittedAt: string | null; submittedBy: string | null; lockedAt: string | null; lockedBy: string | null; retainUntil: string | null; cancelNote: string | null;
  series: { id: string; title: string; rule: string | null; retentionYears: number } | null;
  me: { id: string; lead: boolean; minutes: boolean; timekeeper: boolean; attendee: boolean };
  attendees: A[]; items: I[]; hidden: number;
  previous: { id: string; title: string; startsAt: string; openTasks: L[] } | null;
  parked: Array<{ id: string; title: string; from: string }>; ideas: Array<{ id: string; title: string; likes: number }>;
  addenda: Array<{ id: string; text: string; author: string; at: string }>;
}

