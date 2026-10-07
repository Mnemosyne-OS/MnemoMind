/**
 * wikipedia — one category at a time, through the MediaWiki API (doc 135
 * §3bis.1). Never the dump: it is three years old and Tony does not want the
 * whole encyclopedia (§6).
 *
 * Measured 2026-10-04: `w/api.php?…&origin=*` answers 200 with CORS `*` on
 * en/fr/es, accepts the `Api-User-Agent` header in a preflight, and every page
 * carries its `revid` and the timestamp of its last revision.
 *
 * The text comes from TextExtracts (`prop=extracts&explaintext`), the API's
 * own HTML-to-text pass: plain text with `== Heading ==` lines, no markup to
 * clean by hand. 🪤 It returns a page's FULL text only when one page is asked
 * at a time (several pages = intros only), so a page is read alone.
 * 🪤 A category can hold a redirect: asked by its old title, the API answers
 * an empty extract. The listing drops redirects, and the reader follows
 * `redirects=1`, so the title written to memory is the page actually read.
 */
import { API_USER_AGENT, WIKIPEDIA_LICENCE, wikiApi, wikiRevisionUrl, type WikiLang } from './sourceInfo';
import type { WikiRoot } from './catalogue';
import { entryKey, type Entry, type Section, type SourceDoc } from './entry';
import { pause, retrying, type FetchText } from './net';

/** Above this many pages a listing stops and SAYS it stopped (`capped`), it never shows a silent prefix. */
export const LIST_CAP = 3000;
const PAUSE_MS = 100;
const HEADERS = { 'Api-User-Agent': API_USER_AGENT };

function apiUrl(lang: WikiLang, params: Record<string, string>): string {
  const u = new URL(wikiApi(lang));
  for (const [k, v] of Object.entries({ ...params, format: 'json', formatversion: '2', origin: '*' })) u.searchParams.set(k, v);
  return u.toString();
}

/**
 * One API answer as JSON. `retry` is for the LISTING only: a page read is
 * already retried by its caller (runAll, the single add), and nesting both
 * would turn one hard rate limit into nine attempts.
 */
async function getJson(fetchText: FetchText, url: string, signal?: AbortSignal, retry = true): Promise<Record<string, unknown>> {
  const call = () => fetchText(url, signal, HEADERS);
  const text = retry ? await retrying(call, signal) : await call();
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch (err) {
    throw new Error(`WIKI_NOT_JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!v || typeof v !== 'object') throw new Error('WIKI_NOT_JSON');
  const o = v as Record<string, unknown>;
  if (o.error && typeof o.error === 'object') {
    const e = o.error as { code?: unknown; info?: unknown };
    throw new Error(`WIKI_API_ERROR: ${String(e.code ?? '')} ${String(e.info ?? '')}`.trim());
  }
  return o;
}

interface ListedPage { pageid: number; title: string; length?: number }

/** Reads one page of a `generator=categorymembers` answer: pages that are not redirects. */
export function parseMemberPages(json: Record<string, unknown>): ListedPage[] {
  const q = json.query as { pages?: unknown } | undefined;
  const pages = Array.isArray(q?.pages) ? q!.pages : [];
  const out: ListedPage[] = [];
  for (const p of pages) {
    if (!p || typeof p !== 'object') continue;
    const r = p as Record<string, unknown>;
    if (r.redirect === true || r.missing === true) continue;
    if (typeof r.pageid !== 'number' || typeof r.title !== 'string') continue;
    if (r.ns !== undefined && r.ns !== 0) continue;
    out.push({ pageid: r.pageid, title: r.title, ...(typeof r.length === 'number' ? { length: r.length } : {}) });
  }
  return out;
}

/** The `continue` object of an answer, or null at the end. */
function continuation(json: Record<string, unknown>): Record<string, string> | null {
  const c = json.continue;
  if (!c || typeof c !== 'object') return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(c as Record<string, unknown>)) if (typeof v === 'string') out[k] = v;
  return Object.keys(out).length ? out : null;
}

async function pagesOf(fetchText: FetchText, lang: WikiLang, category: string, signal?: AbortSignal): Promise<ListedPage[]> {
  const out: ListedPage[] = [];
  let cont: Record<string, string> | null = {};
  while (cont) {
    const json = await getJson(fetchText, apiUrl(lang, {
      action: 'query', generator: 'categorymembers', gcmtitle: category.normalize('NFC'),
      gcmnamespace: '0', gcmlimit: '500', prop: 'info', ...cont,
    }), signal);
    out.push(...parseMemberPages(json));
    cont = continuation(json);
    if (out.length > LIST_CAP) break;
    if (cont) await pause(PAUSE_MS, signal);
  }
  return out;
}

/** Sub-category titles of a category (one level). */
export function parseSubcats(json: Record<string, unknown>): string[] {
  const q = json.query as { categorymembers?: unknown } | undefined;
  const list = Array.isArray(q?.categorymembers) ? q!.categorymembers : [];
  return list.flatMap((m) => (m && typeof m === 'object' && typeof (m as { title?: unknown }).title === 'string' ? [(m as { title: string }).title] : []));
}

/** A category listed: its pages, the categories read, and whether the cap stopped it. */
export interface CategoryListing {
  entries: Entry[];
  /** Every category actually read, root first: what the screen names. */
  categories: string[];
  /** True when the listing stopped at LIST_CAP. */
  capped: boolean;
}

/** Lists the pages of a root category (and of its sub-categories at depth 1), redirects dropped, each page once. */
export async function listCategory(
  fetchText: FetchText,
  lang: WikiLang,
  root: WikiRoot,
  opts: { signal?: AbortSignal; onProgress?: (pages: number) => void } = {},
): Promise<CategoryListing> {
  const categories = [root.category];
  if (root.depth === 1) {
    const json = await getJson(fetchText, apiUrl(lang, {
      action: 'query', list: 'categorymembers', cmtitle: root.category.normalize('NFC'),
      cmtype: 'subcat', cmlimit: '500',
    }), opts.signal);
    const skip = new Set((root.exclude ?? []).map((c) => c.normalize('NFC')));
    categories.push(...parseSubcats(json).filter((c) => !skip.has(c.normalize('NFC'))));
  }
  const seen = new Map<number, ListedPage>();
  let capped = false;
  for (const cat of categories) {
    await pause(PAUSE_MS, opts.signal);
    for (const p of await pagesOf(fetchText, lang, cat, opts.signal)) if (!seen.has(p.pageid)) seen.set(p.pageid, p);
    opts.onProgress?.(seen.size);
    if (seen.size > LIST_CAP) { capped = true; break; }
  }
  const collator = new Intl.Collator(lang);
  const entries = [...seen.values()].slice(0, LIST_CAP)
    .sort((a, b) => collator.compare(a.title, b.title))
    .map((p): Entry => ({
      key: entryKey('wikipedia', lang, String(p.pageid)),
      id: String(p.pageid),
      source: 'wikipedia',
      lang,
      title: p.title,
      ...(p.length !== undefined ? { bytes: p.length } : {}),
    }));
  return { entries, categories, capped };
}

/**
 * Link sections that carry no text of their own once the links are gone,
 * per language. Matched on the heading exactly; their sub-sections go too.
 */
export const LINK_SECTIONS: Record<WikiLang, readonly string[]> = {
  en: ['See also', 'References', 'External links', 'Further reading', 'Notes', 'Footnotes', 'Bibliography', 'Sources', 'Citations', 'Notes and references'],
  fr: ['Voir aussi', 'Notes et références', 'Références', 'Notes', 'Articles connexes', 'Liens externes', 'Bibliographie', 'Annexes', 'Sources'],
  es: ['Véase también', 'Referencias', 'Notas', 'Enlaces externos', 'Bibliografía', 'Fuentes', 'Notas y referencias'],
};

const HEADING = /^(={2,6})\s*(.+?)\s*\1\s*$/;

/**
 * A formula as TextExtracts writes it: its MathML tokens one per INDENTED
 * line (`b`, `=`, `100`…), then the LaTeX as `{\displaystyle …}`, then a
 * line of spaces. Measured 2026-10-04 on "Forgetting curve" (en, category
 * Memory): read as is, a formula is a column of single symbols in the middle
 * of the sentence.
 */
const MATH_BLOCK = /[ \t]*\n(?:[ \t]+[^\n]*\n)*?[ \t]+\{\\displaystyle ([^\n]*)\}[ \t]*\n(?:[ \t]*\n)*[ \t]*/g;

/**
 * Normalises a TextExtracts text before it is cut: each formula becomes its
 * LaTeX between `$…$` (the token column is dropped), a line made of spaces
 * counts as empty, and there is never more than one empty line in a row
 * (the raw text holds thousands of `\n  \n    \n` lines that `\n{3,}` alone
 * never sees).
 */
export function normaliseExtract(extract: string): string {
  return extract
    .replace(/\r\n/g, '\n')
    // A formula on its own line (after a line break) stays a paragraph; one inside a sentence stays inline.
    .replace(MATH_BLOCK, (_whole, latex: string, at: number, all: string) => (all[at - 1] === '\n' ? `$${latex.trim()}$\n\n` : ` $${latex.trim()}$ `))
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n');
}

/**
 * Cuts a TextExtracts plain text into sections: the lead, then one per
 * `== Heading ==`. Link sections (and everything under them) are dropped;
 * an empty section is kept only when deeper sections follow it (a chapter
 * heading over its sub-chapters).
 */
export function parseExtract(extract: string, lang: WikiLang): Section[] {
  const drop = new Set(LINK_SECTIONS[lang]);
  const raw: Section[] = [{ heading: null, level: 0, text: '' }];
  for (const line of normaliseExtract(extract).split('\n')) {
    const m = HEADING.exec(line);
    if (m) raw.push({ heading: m[2]!.trim(), level: m[1]!.length, text: '' });
    else raw[raw.length - 1]!.text += `${line}\n`;
  }
  const kept: Section[] = [];
  let droppingBelow: number | null = null;
  for (const s of raw) {
    if (droppingBelow !== null && s.level > droppingBelow) continue;
    droppingBelow = null;
    if (s.heading !== null && drop.has(s.heading)) { droppingBelow = s.level; continue; }
    kept.push({ ...s, text: s.text.replace(/\n{3,}/g, '\n\n').trim() });
  }
  return kept.filter((s, i) => s.text.length > 0 || (kept[i + 1] !== undefined && kept[i + 1]!.level > s.level && s.level > 0));
}

/** Turns the one-page answer of `prop=extracts|revisions|info` into a document, or says why not. */
export function parsePage(json: Record<string, unknown>, lang: WikiLang): SourceDoc {
  const q = json.query as { pages?: unknown } | undefined;
  const page = Array.isArray(q?.pages) ? (q!.pages[0] as Record<string, unknown> | undefined) : undefined;
  if (!page || page.missing === true || page.invalid === true) throw new Error('WIKI_PAGE_MISSING');
  const title = typeof page.title === 'string' ? page.title : null;
  const extract = typeof page.extract === 'string' ? page.extract : '';
  if (!title) throw new Error('WIKI_PAGE_MISSING');
  const sections = parseExtract(extract, lang);
  if (!sections.some((s) => s.text.length > 0)) throw new Error('WIKI_PAGE_EMPTY');
  const rev = Array.isArray(page.revisions) ? (page.revisions[0] as Record<string, unknown> | undefined) : undefined;
  const revid = typeof rev?.revid === 'number' ? rev.revid : undefined;
  const timestamp = typeof rev?.timestamp === 'string' && rev.timestamp ? rev.timestamp : null;
  const plainUrl = typeof page.canonicalurl === 'string' ? page.canonicalurl : `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
  return {
    source: 'wikipedia',
    lang,
    title,
    url: revid !== undefined ? wikiRevisionUrl(lang, title, revid) : plainUrl,
    date: timestamp,
    dateKind: 'revision',
    ...(revid !== undefined ? { revid } : {}),
    licence: WIKIPEDIA_LICENCE,
    sections,
  };
}

/** Reads one page by its id: full text, last revision, canonical address. */
export async function readPage(fetchText: FetchText, lang: WikiLang, pageid: string, signal?: AbortSignal): Promise<SourceDoc> {
  const json = await getJson(fetchText, apiUrl(lang, {
    action: 'query', prop: 'extracts|revisions|info', explaintext: '1', exsectionformat: 'wiki',
    rvprop: 'ids|timestamp', inprop: 'url', pageids: pageid, redirects: '1',
  }), signal, false);
  return parsePage(json, lang);
}
