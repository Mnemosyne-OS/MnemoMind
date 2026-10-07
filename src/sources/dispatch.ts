/**
 * dispatch — which reader lists and reads which source. Kept out of App so
 * the routing (Wikipedia and OpenStax direct, NIMH through the host) is
 * tested with no bridge.
 */
import { OPENSTAX_CHAPTERS, WIKI_ROOTS, type SourceId, type Subdomain } from './catalogue';
import type { Entry, SourceDoc } from './entry';
import type { FetchText, HostFetch } from './net';
import { listCategory, readPage } from './wikipedia';
import { parseCollection, planEntries, readModule, type OpenstaxPlan } from './openstax';
import { listTopics, readTopic } from './nimh';
import { OPENSTAX_COLLECTION_URL, isWikiLang } from './sourceInfo';

/** The network doors a reader may use. */
export interface SourceDeps {
  fetchText: FetchText;
  /** Null when there is no host to ask (outside the shell). */
  hostFetch: HostFetch | null;
}

/** What listing a source gives back. */
export interface ListResult {
  entries: Entry[];
  categories?: string[];
  capped?: boolean;
  /** OpenStax: the plan read, whose licence every module of this list is filed under. */
  plan?: OpenstaxPlan;
}

/** Lists one source of one sub-domain. */
export async function listSource(
  deps: SourceDeps,
  sub: Subdomain,
  source: SourceId,
  lang: string,
  opts: { signal?: AbortSignal; onProgress?: (n: number) => void } = {},
): Promise<ListResult> {
  if (source === 'wikipedia') {
    if (!isWikiLang(lang)) throw new Error('WIKI_LANG_NOT_OFFERED');
    return listCategory(deps.fetchText, lang, WIKI_ROOTS[sub][lang], opts);
  }
  if (source === 'openstax') {
    const plan = parseCollection(await deps.fetchText(OPENSTAX_COLLECTION_URL, opts.signal));
    const entries = planEntries(plan, OPENSTAX_CHAPTERS[sub]);
    opts.onProgress?.(entries.length);
    return { entries, plan };
  }
  if (!deps.hostFetch) throw new Error('NO_HOST');
  const entries = await listTopics(deps.hostFetch, opts.signal);
  opts.onProgress?.(entries.length);
  return { entries };
}

/** The reader of one entry of a listed source. */
export function readerFor(
  deps: SourceDeps,
  source: SourceId,
  lang: string,
  plan: OpenstaxPlan | null,
): (entry: Entry, signal?: AbortSignal) => Promise<SourceDoc> {
  if (source === 'wikipedia') {
    if (!isWikiLang(lang)) throw new Error('WIKI_LANG_NOT_OFFERED');
    return (entry, signal) => readPage(deps.fetchText, lang, entry.id, signal);
  }
  if (source === 'openstax') {
    return async (entry, signal) => {
      if (!plan) throw new Error('OPENSTAX_PLAN_NOT_READ');
      return readModule(deps, entry, plan, signal);
    };
  }
  return async (entry, signal) => {
    if (!deps.hostFetch) throw new Error('NO_HOST');
    return readTopic(deps.hostFetch, entry, signal);
  };
}
