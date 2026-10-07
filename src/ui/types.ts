/**
 * Shared types of the MnemoMind screens. Types only (plus two pure helpers),
 * so the .tsx files keep exporting components alone (Fast Refresh).
 */
import type { Key, Lang } from '../i18n/strings';
import type { SourceId, Subdomain } from '../sources/catalogue';
import type { Entry } from '../sources/entry';
import type { WikiLang } from '../sources/sourceInfo';

/** The translator handed down from App. */
export type T = (key: Key, vars?: Record<string, string | number>) => string;

/** Which screen is shown. */
export type View = { kind: 'home' } | { kind: 'sub'; sub: Subdomain };

/** A long step in progress, shown with what it measured so far. `key` = the batch it belongs to. */
export type Job =
  | { kind: 'list'; key: string; startedAt: number; n: number }
  | { kind: 'one'; key: string; startedAt: number; title: string }
  | { kind: 'all'; key: string; startedAt: number; done: number; todo: number };

/** Whether the durable library has been read: until it is, nothing is written and nothing can be added. */
export type LibStatus =
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'error'; why: string };

/** What a source's list looks like once read. */
export interface Listing {
  entries: Entry[];
  /** Wikipedia: every category read, root first. */
  categories?: string[];
  capped?: boolean;
  /** OpenStax: the licence read live from the collection's md:license. */
  licence?: string;
}

/** One source's list: not opened, being read, failed (with why), or read. */
export type ListState =
  | { kind: 'loading' }
  | { kind: 'error'; why: string }
  | { kind: 'ready'; listing: Listing };

/** Callbacks a source acts through, all owned by App. */
export interface SourceActions {
  onOpenList: (source: SourceId, lang: string) => void;
  onAdd: (source: SourceId, lang: string, entry: Entry) => void;
  onAddAll: (source: SourceId, lang: string) => void;
  onStop: () => void;
}

/** The Wikipedia language offered first: the interface's, when Wikipedia is read in it, else English. */
export function defaultWikiLang(lang: Lang): WikiLang {
  return lang === 'fr' || lang === 'es' ? lang : 'en';
}

/** A day as the interface's language writes it; an unreadable date is shown as written, never replaced. */
export function formatDay(iso: string, lang: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // 🪤 A bare day (`2026-10-04`) parses as UTC midnight: formatted in local time
  // it reads as October 3 anywhere west of Greenwich. A day stays the day written.
  const dayOnly = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  return d.toLocaleDateString(lang, { year: 'numeric', month: 'long', day: 'numeric', ...(dayOnly ? { timeZone: 'UTC' } : {}) });
}
