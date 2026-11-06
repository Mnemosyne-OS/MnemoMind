/**
 * mindAgent.ts — what an agent may do in MnemoMind (doc 149), as plain functions over the app's
 * own state and its own moves. Declared in `mnemo-plugin.json` › agentActions, served by
 * `MindAgentActions` while the window is open.
 *
 * 🚨 Every move is the one the person's own control makes: a topic opens through `go` (a home
 * tile), a list through `openList` (a source tile's « Open »), an entry through `addOne` (its
 * « Add »), the rest through `addAll` (« Add all »), and Stop is the job line's Stop. The view
 * moves to the topic first, so the person sees the list and the job line.
 *
 * 🗣️ By voice (doc 149 §19) the orb plans a sentence without reading MnemoMind first: a text is
 * named by its title as the person says it (`findNamed`, several matches refused AMBIGUOUS with
 * their titles), and `entries` / `add` / `addAll` take the topic and the list on screen when the
 * sentence names none.
 *
 * Nothing here reads, sums up or comments on a text: these are titles, lists and filing.
 *
 * Refusals throw `CODE: reason`.
 */
import { SUBDOMAINS, WIKI_ROOTS, batchKey, sourcesOf, type SourceId, type Subdomain } from '../sources/catalogue';
import type { Entry } from '../sources/entry';
import { batchOf, subdomainSummary, type LibraryState } from '../sources/library';
import { WIKI_LANGS, isWikiLang, type WikiLang } from '../sources/sourceInfo';
import { findNamed, type Named } from './agentFind';
import { matchTitle } from './listModel';
import type { Job, LibStatus, ListState, View } from './types';

/** How long a call waits for a list or an entry before it answers « still running » (the host gives 60 s). */
export const AGENT_WAIT_MS = 45_000;
/** How many entries one page carries at most: what the manifest declares as `limit`'s maximum. */
export const ENTRIES_MAX = 200;
const ENTRIES_DEFAULT = 30;
export const SOURCE_IDS: readonly SourceId[] = ['wikipedia', 'openstax', 'nimh'];

/** The app's state and its own moves, read fresh at every call. */
export interface MindAgentContext {
  view: View;
  libStatus: LibStatus;
  lib: LibraryState;
  lists: Record<string, ListState>;
  job: Job | null;
  wikiLang: WikiLang;
  go: (next: View) => void;
  setWikiLang: (lang: WikiLang) => void;
  /** The « Retry » of the unreadable-library card. */
  retryLibrary: () => void;
  openList: (sub: Subdomain, source: SourceId, lang: string) => Promise<void>;
  addOne: (sub: Subdomain, source: SourceId, lang: string, entry: Entry) => Promise<void>;
  addAll: (sub: Subdomain, source: SourceId, lang: string) => Promise<void>;
  stop: () => void;
}

/** The promise's end if it comes within `ms`, else `running` (the work goes on and is shown on screen). */
export async function within<T>(p: Promise<T>, ms: number): Promise<{ done: true } | { done: false }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<{ done: false }>((resolve) => { timer = setTimeout(() => resolve({ done: false }), ms); });
  try {
    return await Promise.race([p.then(() => ({ done: true as const })), late]);
  } finally {
    clearTimeout(timer);
  }
}

/** A whole number within bounds, the default when absent. */
export function bounded(v: unknown, min: number, max: number, dflt: number, what: string): number {
  if (v === undefined) return dflt;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) throw new Error(`BAD_ARG: ${what} must be a whole number from ${min} to ${max}`);
  return v;
}

/** The topic, source and language of a call, checked against what the topic offers. */
export function resolveSource(args: Record<string, unknown>, wikiLang: WikiLang): { sub: Subdomain; source: SourceId; lang: string; key: string } {
  const sub = args.topic;
  if (typeof sub !== 'string' || !(SUBDOMAINS as readonly string[]).includes(sub)) throw new Error(`NOT_FOUND: no topic "${String(sub)}"; topics: ${SUBDOMAINS.join(', ')}`);
  const source = args.source;
  const offered = sourcesOf(sub as Subdomain);
  if (typeof source !== 'string' || !offered.includes(source as SourceId)) throw new Error(`NOT_FOUND: topic ${sub} has no source "${String(source)}"; its sources: ${offered.join(', ')}`);
  let lang: string;
  if (source === 'wikipedia') {
    if (args.lang !== undefined && !isWikiLang(args.lang)) throw new Error(`BAD_ARG: Wikipedia is read in ${WIKI_LANGS.join(', ')}`);
    lang = (args.lang as WikiLang | undefined) ?? wikiLang;
  } else {
    if (args.lang !== undefined && args.lang !== 'en') throw new Error(`BAD_ARG: ${source} is read in English only (lang en)`);
    lang = 'en';
  }
  return { sub: sub as Subdomain, source: source as SourceId, lang, key: batchKey(sub as Subdomain, source as SourceId, lang) };
}

/**
 * The topic and list a call means, the screen filling what the sentence leaves out: the topic on
 * screen, and the one list read under it (Wikipedia's in the screen's language). Several lists
 * are refused with their names, never one taken.
 */
export function resolveOnScreen(
  args: Record<string, unknown>,
  c: Pick<MindAgentContext, 'view' | 'lists' | 'wikiLang'>,
): { sub: Subdomain; source: SourceId; lang: string; key: string } {
  let topic = args.topic;
  if (topic === undefined) {
    if (c.view.kind !== 'sub') throw new Error(`NO_LIST: no topic is on screen; name one (${SUBDOMAINS.join(', ')}) or call listSource`);
    topic = c.view.sub;
  }
  if (typeof topic !== 'string' || !(SUBDOMAINS as readonly string[]).includes(topic)) throw new Error(`NOT_FOUND: no topic "${String(topic)}"; topics: ${SUBDOMAINS.join(', ')}`);
  if (args.source !== undefined) return resolveSource({ ...args, topic }, c.wikiLang);
  const sub = topic as Subdomain;
  const open = sourcesOf(sub)
    .map((source) => resolveSource({ topic: sub, source, ...(source === 'wikipedia' && args.lang !== undefined ? { lang: args.lang } : {}) }, c.wikiLang))
    .filter((r) => c.lists[r.key]?.kind === 'ready');
  if (open.length === 1) return open[0]!;
  if (open.length > 1) throw new Error(`AMBIGUOUS: several lists of ${sub} are open: ${open.map((r) => r.source).join(', ')}; say which source`);
  throw new Error(`NO_LIST: no list of ${sub} is open; call listSource with a source (${sourcesOf(sub).join(', ')})`);
}

/** A job, as an agent reads it. */
export function jobLine(job: Job | null) {
  if (!job) return null;
  const seconds = Math.max(0, Math.round((Date.now() - job.startedAt) / 1000));
  if (job.kind === 'list') return { kind: 'listing', source: job.key, read: job.n, seconds };
  if (job.kind === 'one') return { kind: 'adding one', source: job.key, title: job.title, seconds };
  return { kind: 'adding all', source: job.key, done: job.done, todo: job.todo, seconds };
}

/** The handlers `sdk.onAgentActions` serves, over a context read fresh at every call. */
export function mindAgentHandlers(get: () => MindAgentContext) {
  /** The list of a source, read; refused with what to call when it is not. */
  const readyList = (c: MindAgentContext, key: string) => {
    const list = c.lists[key];
    if (!list) throw new Error(`NO_LIST: the list of ${key} is not open; call listSource first`);
    if (list.kind === 'loading') throw new Error(`BUSY: the list of ${key} is still being read; call status`);
    if (list.kind === 'error') throw new Error(`LIST_FAILED: ${list.why}; call listSource again`);
    return list.listing;
  };
  const canAdd = (c: MindAgentContext) => {
    if (c.libStatus.kind === 'loading') throw new Error('NOT_READY: the library of what is already in memory is still being read');
    if (c.libStatus.kind === 'error') throw new Error(`NOT_READY: the library of what is already in memory is unreadable (${c.libStatus.why}); nothing is added until the person retries`);
    if (c.job) throw new Error('BUSY: a list or an import is running; call status, or stop');
  };
  /** The topic on screen, so the person sees the list and the job line. */
  const show = (c: MindAgentContext, sub: Subdomain, lang: string, source: SourceId) => {
    if (c.view.kind !== 'sub' || c.view.sub !== sub) c.go({ kind: 'sub', sub });
    if (source === 'wikipedia' && lang !== c.wikiLang) c.setWikiLang(lang as WikiLang);
  };

  return {
    // agent-actions:begin
    status: () => {
      const c = get();
      return {
        screen: c.view.kind === 'sub' ? { topic: c.view.sub } : 'home',
        library: c.libStatus.kind === 'ready' ? 'read' : c.libStatus.kind === 'loading' ? 'reading' : `unreadable: ${c.libStatus.why}`,
        job: jobLine(c.job),
        folder: c.lib.folder,
        inMemory: c.lib.batches.map((b) => ({
          topic: b.sub, source: b.source, lang: b.lang, entries: b.ids.length, failed: b.failed.length, refused: b.refused.length, listed: b.total, lastAt: b.lastAt,
        })),
      };
    },

    topics: () => {
      const c = get();
      return SUBDOMAINS.map((sub) => ({
        topic: sub,
        sources: sourcesOf(sub).map((source) => (source === 'wikipedia'
          ? { source, langs: [...WIKI_LANGS], category: WIKI_ROOTS[sub][c.wikiLang].category }
          : { source, langs: ['en'] })),
        entriesInMemory: c.libStatus.kind === 'ready' ? subdomainSummary(c.lib, sub).entries : null,
      }));
    },

    openTopic: (args: Record<string, unknown>) => {
      const sub = args.topic;
      if (typeof sub !== 'string' || !(SUBDOMAINS as readonly string[]).includes(sub)) throw new Error(`NOT_FOUND: no topic "${String(sub)}"; topics: ${SUBDOMAINS.join(', ')}`);
      const c = get();
      if (c.job && c.job.kind !== 'list') throw new Error('BUSY: an import is running; stop it first or wait');
      c.go({ kind: 'sub', sub: sub as Subdomain });
      return { shown: sub };
    },

    goHome: () => {
      const c = get();
      // The Back link's own rule: disabled during an import; a list being read stops on leaving.
      if (c.job && c.job.kind !== 'list') throw new Error('BUSY: an import is running; stop it first or wait');
      if (c.view.kind !== 'home') c.go({ kind: 'home' });
      return { shown: 'home' };
    },

    setLanguage: (args: Record<string, unknown>) => {
      const c = get();
      const lang = args.lang;
      if (!isWikiLang(lang)) throw new Error(`BAD_ARG: Wikipedia is read in ${WIKI_LANGS.join(', ')}`);
      // The language box is disabled while anything runs.
      if (c.job) throw new Error('BUSY: a list or an import is running; call status, or stop');
      if (lang !== c.wikiLang) c.setWikiLang(lang);
      return { wikipedia: lang };
    },

    retryLibrary: () => {
      const c = get();
      if (c.libStatus.kind !== 'error') return { retried: false, library: c.libStatus.kind === 'ready' ? 'read' : 'reading' };
      c.retryLibrary();
      return { retried: true, note: 'The record of what is in memory is being read again; call status.' };
    },

    listSource: async (args: Record<string, unknown>) => {
      const c = get();
      const { sub, source, lang, key } = resolveOnScreen(args, c);
      if (c.job) throw new Error('BUSY: a list or an import is running; call status, or stop');
      show(c, sub, lang, source);
      const end = await within(c.openList(sub, source, lang), AGENT_WAIT_MS);
      if (!end.done) return { running: true, note: 'The list is still being read on screen; call status, then entries.' };
      const listing = readyList(get(), key);
      const inMemory = new Set(batchOf(get().lib, sub, source, lang).ids);
      return {
        source: key,
        entries: listing.entries.length,
        ...(listing.capped ? { capped: true } : {}),
        alreadyInMemory: listing.entries.filter((e) => inMemory.has(e.id)).length,
        first: listing.entries.slice(0, ENTRIES_DEFAULT).map((e) => ({ id: e.id, title: e.title, inMemory: inMemory.has(e.id) })),
      };
    },

    entries: (args: Record<string, unknown>) => {
      const c = get();
      const { sub, source, lang, key } = resolveOnScreen(args, c);
      const limit = bounded(args.limit, 1, ENTRIES_MAX, ENTRIES_DEFAULT, 'limit');
      const offset = bounded(args.offset, 0, 1_000_000, 0, 'offset');
      const q = typeof args.query === 'string' ? args.query.trim() : '';
      const listing = readyList(c, key);
      const batch = batchOf(c.lib, sub, source, lang);
      const done = new Set(batch.ids);
      const failed = new Set(batch.failed);
      const refused = new Set(batch.refused);
      // The list box's own match: accents and case off, every word required.
      const matching = q ? listing.entries.filter((e) => matchTitle(e.title, q)) : listing.entries;
      return {
        source: key,
        total: listing.entries.length,
        matching: matching.length,
        entries: matching.slice(offset, offset + limit).map((e) => ({
          id: e.id, title: e.title, ...(e.chapter ? { chapter: e.chapter } : {}),
          state: done.has(e.id) ? 'in memory' : failed.has(e.id) ? 'failed' : refused.has(e.id) ? 'refused by the source' : 'not added',
        })),
      };
    },

    add: async (args: Record<string, unknown>) => {
      const c = get();
      const { sub, source, lang, key } = resolveOnScreen(args, c);
      const listing = readyList(c, key);
      // OpenStax repeats titles (« Introduction » per chapter): its chapter names it too, and labels it.
      const named: Array<Named<Entry>> = listing.entries.map((e) => ({
        item: e, id: e.id, names: e.chapter ? [e.title, e.chapter] : [e.title], label: e.chapter ? `${e.title} (${e.chapter})` : e.title,
      }));
      const entry = findNamed(named, typeof args.entryId === 'string' ? args.entryId : '', { code: 'NO_TEXT', noun: 'text' });
      const id = entry.id;
      canAdd(c);
      show(c, sub, lang, source);
      const end = await within(c.addOne(sub, source, lang, entry), AGENT_WAIT_MS);
      if (!end.done) return { running: true, title: entry.title, note: 'Still being added on screen; call status.' };
      // Done only once the library recorded it in memory; anything else is a refused write.
      const b = batchOf(get().lib, sub, source, lang);
      if (b.ids.includes(id)) return { id, title: entry.title, outcome: 'in memory' };
      const why = b.refused.includes(id) ? 'was refused by the source' : b.failed.includes(id) ? 'reached memory only in part' : 'was not added; the reason is on the person\'s screen';
      throw new Error(`WRITE_FAILED: "${entry.title}" ${why}`);
    },

    addAll: (args: Record<string, unknown>) => {
      const c = get();
      const { sub, source, lang, key } = resolveOnScreen(args, c);
      const listing = readyList(c, key);
      canAdd(c);
      const done = new Set(batchOf(c.lib, sub, source, lang).ids);
      const todo = listing.entries.filter((e) => !done.has(e.id)).length;
      if (todo === 0) throw new Error(`NOTHING_LEFT: every entry of ${key} is already in memory`);
      show(c, sub, lang, source);
      void c.addAll(sub, source, lang);
      return { started: true, source: key, todo, note: 'It runs on screen while MnemoMind stays open; call status for progress, stop to stop.' };
    },

    stop: () => {
      const c = get();
      if (!c.job) return { stopped: false, note: 'nothing is running' };
      c.stop();
      return { stopped: true, was: jobLine(c.job) };
    },
    // agent-actions:end
  };
}

