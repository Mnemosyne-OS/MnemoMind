/**
 * openstax — the OpenStax Psychology 2e textbook, read from its repository
 * (doc 135 §3bis.2).
 *
 * Measured 2026-10-04: raw.githubusercontent.com answers with CORS `*`. The
 * plan is `collections/psychology-2e.collection.xml` (16 chapters, 105
 * modules, the licence in `md:license`); each module is a CNXML file. raw
 * sends no Last-Modified, and the GitHub REST API has a 60-an-hour quota, so
 * the date comes from GitHub's commit feed of the module file
 * (`commits/main/<path>.atom`, no quota, no CORS → read through the host). A
 * feed that cannot be read leaves the date ABSENT, never the import's date.
 *
 * Parsed with DOMParser (the browser's and jsdom's), never with regexes.
 */
import { OPENSTAX_BOOK_URL, openstaxModuleFeed, openstaxModulePage, openstaxModuleUrl } from './sourceInfo';
import { entryKey, type Entry, type Section, type SourceDoc } from './entry';
import { hostText, type FetchText, type HostFetch } from './net';
import shippedTitles from './openstaxTitles.json';

/** One chapter of the book, from the collection plan. */
export interface OpenstaxChapter {
  /** 1-based position in the book. */
  number: number;
  title: string;
  modules: string[];
}

/** The collection plan as read live. */
export interface OpenstaxPlan {
  /** The `md:license` text, verbatim. Null when the collection carries none. */
  licence: string | null;
  licenceUrl: string | null;
  chapters: OpenstaxChapter[];
  /** Modules outside any chapter (the Preface), counted, not offered. */
  loose: string[];
}

function parseXml(text: string, what: string): Document {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) throw new Error(`OPENSTAX_NOT_XML: ${what}`);
  return doc;
}

/** Direct children of an element with a given local name (namespaces ignored). */
function kids(el: Element, name: string): Element[] {
  return Array.from(el.children).filter((c) => c.localName === name);
}

function clean(s: string | null | undefined): string {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}

/** Reads the collection: chapters in order, their module ids, and the licence as written. */
export function parseCollection(text: string): OpenstaxPlan {
  const doc = parseXml(text, 'collection');
  const root = doc.documentElement;
  const meta = kids(root, 'metadata')[0];
  const lic = meta ? kids(meta, 'license')[0] : undefined;
  const content = kids(root, 'content')[0];
  if (!content) throw new Error('OPENSTAX_NO_PLAN');
  const chapters: OpenstaxChapter[] = [];
  const loose: string[] = [];
  for (const child of Array.from(content.children)) {
    if (child.localName === 'module') {
      const id = child.getAttribute('document');
      if (id) loose.push(id);
    } else if (child.localName === 'subcollection') {
      const title = clean(kids(child, 'title')[0]?.textContent);
      const inner = kids(child, 'content')[0];
      const modules = inner ? kids(inner, 'module').map((m) => m.getAttribute('document')).filter((x): x is string => !!x) : [];
      chapters.push({ number: chapters.length + 1, title, modules });
    }
  }
  return {
    licence: lic ? clean(lic.textContent) || null : null,
    licenceUrl: lic?.getAttribute('url') ?? null,
    chapters,
    loose,
  };
}

/** Titles shipped with the cartridge (scripts/build-openstax-titles.mjs), keyed by module id. */
export const SHIPPED_TITLES: Readonly<Record<string, string>> = (shippedTitles as { titles: Record<string, string> }).titles;

/**
 * The entries of the chapters a sub-domain offers. The LIVE plan decides
 * which modules exist; a module the shipped map does not know is listed by
 * its position, and the real title is read from the module at import.
 */
export function planEntries(plan: OpenstaxPlan, chapterTitles: readonly string[]): Entry[] {
  const wanted = new Set(chapterTitles);
  return plan.chapters.filter((c) => wanted.has(c.title)).flatMap((c) => c.modules.map((id, i): Entry => ({
    key: entryKey('openstax', 'en', id),
    id,
    source: 'openstax',
    lang: 'en',
    title: `${c.number}.${i} ${SHIPPED_TITLES[id] ?? `(module ${id})`}`,
    chapter: `${c.number}. ${c.title}`,
  })));
}

/** Sections that are a quiz for the student (questions, sometimes with answers), not the textbook's text. */
export const QUIZ_SECTIONS = ['review-questions', 'critical-thinking', 'personal-application'];
const DROPPED = new Set(['figure', 'media', 'image', 'footnote', 'exercise', 'metadata']);

/** The text of an inline run: words kept, figures and footnotes left out, whitespace collapsed. */
function inline(node: Node): string {
  if (node.nodeType === 3) return node.nodeValue ?? '';
  if (node.nodeType !== 1) return '';
  const el = node as Element;
  if (DROPPED.has(el.localName)) return '';
  if (el.localName === 'newline') return ' ';
  return Array.from(el.childNodes).map(inline).join('');
}

/**
 * Tidies a run of text once its cross-references are gone: a `<link>` to a
 * figure has no words of its own (the publisher prints "Figure 8.2"), so
 * "time (<link/>)." would read "time ()." in memory.
 */
export function tidy(s: string): string {
  return clean(s).replace(/\(\s*\)/g, '').replace(/\s+([.,;:])/g, '$1').replace(/\s{2,}/g, ' ').trim();
}

function walk(el: Element, level: number, out: Section[]): void {
  const add = (s: string) => {
    const t = tidy(s);
    if (t) out[out.length - 1]!.text += `${t}\n\n`;
  };
  for (const child of Array.from(el.children)) {
    const name = child.localName;
    if (name === 'title' || DROPPED.has(name)) continue;
    if (name === 'section') {
      const cls = (child.getAttribute('class') ?? '').split(/\s+/);
      if (cls.some((c) => QUIZ_SECTIONS.includes(c))) continue;
      out.push({ heading: clean(kids(child, 'title')[0]?.textContent) || null, level, text: '' });
      walk(child, level + 1, out);
    } else if (name === 'para') {
      add(inline(child));
    } else if (name === 'list') {
      const title = clean(kids(child, 'title')[0]?.textContent);
      if (title) add(title);
      const items = kids(child, 'item').map((i) => tidy(inline(i))).filter(Boolean);
      if (items.length) out[out.length - 1]!.text += `${items.map((i) => `- ${i}`).join('\n')}\n\n`;
    } else if (name === 'note') {
      const title = clean(kids(child, 'title')[0]?.textContent);
      const before = out[out.length - 1]!.text;
      walk(child, level, out);
      if (title) {
        const last = out[out.length - 1]!;
        if (last.text.length > before.length) last.text = `${before}${title}: ${last.text.slice(before.length)}`;
      }
    } else if (name === 'table') {
      for (const row of Array.from(child.getElementsByTagNameNS('*', 'row'))) {
        const cells = kids(row, 'entry').map((e) => clean(inline(e))).filter(Boolean);
        if (cells.length) out[out.length - 1]!.text += `${cells.join(' | ')}\n`;
      }
      out[out.length - 1]!.text += '\n';
    } else if (child.children.length > 0 && name !== 'equation') {
      walk(child, level, out);
    } else {
      add(inline(child));
    }
  }
}

/** One module as a title and its sections (glossary last). Quiz sections and figures are left out. */
export function parseModule(text: string): { title: string; sections: Section[] } {
  const doc = parseXml(text, 'module');
  const root = doc.documentElement;
  const title = clean(kids(root, 'title')[0]?.textContent);
  const content = kids(root, 'content')[0];
  if (!title || !content) throw new Error('OPENSTAX_NOT_A_MODULE');
  const sections: Section[] = [{ heading: null, level: 0, text: '' }];
  walk(content, 2, sections);
  const glossary = kids(root, 'glossary')[0];
  if (glossary) {
    const lines = kids(glossary, 'definition').map((d) => {
      const term = clean(kids(d, 'term')[0]?.textContent);
      const meaning = clean(kids(d, 'meaning')[0]?.textContent);
      return term && meaning ? `${term}: ${meaning}` : '';
    }).filter(Boolean);
    if (lines.length) sections.push({ heading: 'Glossary', level: 2, text: lines.join('\n') });
  }
  const kept = sections.map((s) => ({ ...s, text: s.text.trim() }));
  const out = kept.filter((s, i) => s.text.length > 0 || (s.level > 0 && kept[i + 1] !== undefined && kept[i + 1]!.level > s.level));
  if (!out.some((s) => s.text.length > 0)) throw new Error('OPENSTAX_MODULE_EMPTY');
  return { title, sections: out };
}

/** The date of the newest commit in a GitHub Atom feed (first entry, else the feed), or null. */
export function parseAtomUpdated(text: string): string | null {
  let doc: Document;
  try {
    doc = parseXml(text, 'atom');
  } catch (err) {
    console.warn('[mnemo-mind] commit feed unreadable', err);
    return null;
  }
  const root = doc.documentElement;
  const entry = kids(root, 'entry')[0];
  const updated = clean((entry ? kids(entry, 'updated')[0] : kids(root, 'updated')[0])?.textContent);
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(updated) ? updated : null;
}

/**
 * Reads one module and, through the host, the date of the last commit that
 * touched it. The licence is the one the LIVE collection states; without it
 * the module is refused, never filed under a licence nobody read.
 */
export async function readModule(
  deps: { fetchText: FetchText; hostFetch: HostFetch | null },
  entry: Pick<Entry, 'id' | 'chapter'>,
  plan: Pick<OpenstaxPlan, 'licence'>,
  signal?: AbortSignal,
): Promise<SourceDoc> {
  if (!plan.licence) throw new Error('OPENSTAX_NO_LICENCE');
  const { title, sections } = parseModule(await deps.fetchText(openstaxModuleUrl(entry.id), signal));
  let date: string | null = null;
  if (deps.hostFetch) {
    try {
      date = parseAtomUpdated(await hostText(deps.hostFetch, openstaxModuleFeed(entry.id), signal));
    } catch (err) {
      if (signal?.aborted) throw err;
      console.warn('[mnemo-mind] commit date not read for', entry.id, err);
    }
  }
  return {
    source: 'openstax',
    lang: 'en',
    title,
    url: openstaxModulePage(entry.id),
    date,
    dateKind: 'commit',
    licence: plan.licence,
    ...(entry.chapter ? { chapter: entry.chapter } : {}),
    sections,
  };
}

/** The attribution OpenStax asks for, in one line. */
export const OPENSTAX_ATTRIBUTION = `OpenStax, Psychology 2e. Access for free at ${OPENSTAX_BOOK_URL}`;
