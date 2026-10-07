/**
 * nimh — the mental-health topics of the US National Institute of Mental
 * Health (doc 135 §3bis.2), read through the host: the site sends no CORS
 * header (measured 2026-10-04), so the cartridge asks `social.fetch`.
 *
 * Unit = one topic of https://www.nimh.nih.gov/health/topics (25 English
 * topics; `/espanol/` pages are left out, Spanish is not verified here).
 *
 * 🪤 A topic page is a HUB: one paragraph of definition, then navigation
 * ("Where can I learn more…", "Digital shareables", "Find help and support").
 * The real text (types, symptoms, diagnosis, treatment) is in the
 * publication. Measured on the 25 topics, 2026-10-04: six have a publication
 * at `/health/publications/<same slug>` (bipolar disorder, borderline
 * personality disorder, depression, eating disorders, PTSD, schizophrenia);
 * the others link only a "-listing" page or several sub-publications, none of
 * which can be called THE publication of the topic without guessing. So:
 *  - with a publication: the hub's definition + the publication's text;
 *  - without: the hub's own text with its navigation sections removed (for
 *    a hub like "anxiety disorders" that leaves the definition alone; for one
 *    like "mental health medications", whose page IS the text, all of it),
 *    and the memory SAYS no publication was found.
 *
 * Dates as the pages write them: the hub's "Last Reviewed: December 2024"
 * (a month, never padded to a day), the publication's "Revised 2024".
 */
import { NIMH_LICENCE, NIMH_ORIGIN, NIMH_TOPICS_URL } from './sourceInfo';
import { entryKey, type Entry, type Section, type SourceDoc } from './entry';
import { hostText, type HostFetch } from './net';

function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

function clean(s: string | null | undefined): string {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}

/** The topic pages linked from the index's article, in page order, each once. */
export function parseTopicIndex(html: string): Entry[] {
  const article = parseHtml(html).querySelector('article');
  if (!article) throw new Error('NIMH_INDEX_UNREADABLE');
  const seen = new Set<string>();
  const out: Entry[] = [];
  for (const a of Array.from(article.querySelectorAll('a[href]'))) {
    const href = (a.getAttribute('href') ?? '').split(/[?#]/)[0]!.replace(/^https:\/\/www\.nimh\.nih\.gov/, '');
    if (!href.startsWith('/health/topics/') || href.includes('/espanol')) continue;
    if (seen.has(href)) continue;
    const title = clean(a.textContent);
    if (!title) continue;
    seen.add(href);
    out.push({ key: entryKey('nimh', 'en', href), id: href, source: 'nimh', lang: 'en', title });
  }
  if (out.length === 0) throw new Error('NIMH_INDEX_EMPTY');
  return out;
}

/** "Last Reviewed: December 2024" (the month as written), or null when the page does not say. */
export function lastReviewed(html: string): string | null {
  const m = /Last Reviewed:?\s*(?:<\/strong>)?\s*([A-Z][a-z]+\s+\d{4}|\d{4}-\d{2}-\d{2})/.exec(html);
  return m ? m[1]!.replace(/\s+/g, ' ') : null;
}

/** A publication's "Revised 2024" (or "Revised June 2024"), as written, or null. */
export function revised(html: string): string | null {
  const m = />\s*Revised\s+((?:[A-Z][a-z]+\s+)?\d{4})\s*</.exec(html);
  return m ? m[1]!.replace(/\s+/g, ' ') : null;
}

/** "NIH Publication No. 24-MH-8079", or null. */
export function publicationNumber(html: string): string | null {
  const m = /NIH Publication No\.?\s*([0-9A-Z-]+)/.exec(html);
  return m ? m[1]! : null;
}

/**
 * Sections that are navigation, not text: links to more pages, research
 * news, outreach kits, the help line block, and a publication's reprint
 * notice. Matched on a level-2 heading; their sub-sections go with them.
 */
export const NAV_SECTIONS: readonly RegExp[] = [
  /^Where can I learn more/i,
  /^How can I learn more/i,
  /^Why is NIMH studying/i,
  /^How is NIMH research/i,
  /^Explore clinical trials/i,
  /^What are clinical trials and why are they important/i,
  /^Share outreach materials/i,
  /^Find help and support/i,
  /^Additional federal resources/i,
  /^For more information/i,
  /^Reprints/i,
];

/** Removes the navigation sections (and everything under them). */
export function dropNavigation(sections: readonly Section[]): Section[] {
  const out: Section[] = [];
  let droppingBelow: number | null = null;
  for (const s of sections) {
    if (droppingBelow !== null && s.level > droppingBelow) continue;
    droppingBelow = null;
    if (s.heading && NAV_SECTIONS.some((re) => re.test(s.heading!))) { droppingBelow = s.level; continue; }
    out.push(s);
  }
  return out;
}

/** A publication's tool links at its top ("Download PDF", "En español"): buttons, not text. */
const PAGE_TOOLS = /^(Download PDF|En español|Order a free hardcopy|Print)$/i;

const BLOCKS = new Set(['P', 'LI', 'H2', 'H3', 'H4', 'BLOCKQUOTE', 'TD', 'DT', 'DD']);

/** An NIMH article (hub or publication) as sections: h2/h3 open a section, paragraphs and list items fill it. Navigation is NOT removed here. */
export function parseArticle(html: string): { title: string; sections: Section[] } {
  const doc = parseHtml(html);
  const article = doc.querySelector('article');
  if (!article) throw new Error('NIMH_PAGE_UNREADABLE');
  // Style and script go BEFORE any text is read; the page's own table of contents is navigation.
  article.querySelectorAll('style, script, noscript, nav, form, .onpage-nav, svg, img').forEach((n) => n.remove());
  const title = clean(doc.querySelector('h1')?.textContent) || clean(doc.querySelector('title')?.textContent);
  if (!title) throw new Error('NIMH_PAGE_UNTITLED');
  const sections: Section[] = [{ heading: null, level: 0, text: '' }];
  for (const el of Array.from(article.querySelectorAll('h2, h3, h4, p, li, blockquote, td, dt, dd'))) {
    // A block inside another block (a <p> in an <li>) is read once, by its outer block.
    let inner = false;
    for (let up = el.parentElement; up && up !== article; up = up.parentElement) if (BLOCKS.has(up.tagName)) { inner = true; break; }
    if (inner) continue;
    const text = clean(el.textContent);
    if (!text) continue;
    if (/^H[234]$/.test(el.tagName)) {
      sections.push({ heading: text, level: Number(el.tagName[1]), text: '' });
    } else if (/^Last Reviewed/i.test(text) || PAGE_TOOLS.test(text)) {
      continue;
    } else {
      sections[sections.length - 1]!.text += `${el.tagName === 'LI' ? '- ' : ''}${text}\n${el.tagName === 'LI' ? '' : '\n'}`;
    }
  }
  return { title, sections: sections.map((s) => ({ ...s, text: s.text.trim() })) };
}

/** Keeps sections with text, and an empty heading only when deeper sections follow it. */
function compact(sections: readonly Section[]): Section[] {
  return sections.filter((s, i) => s.text.length > 0 || (s.level > 0 && sections[i + 1] !== undefined && sections[i + 1]!.level > s.level));
}

/** A topic hub: its definition ("What is …?"), its text without navigation, and its review date. */
export function parseTopicPage(html: string): { title: string; definition: Section | null; sections: Section[]; reviewed: string | null } {
  const page = parseArticle(html);
  const sections = compact(dropNavigation(page.sections));
  if (!sections.some((s) => s.text.length > 0)) throw new Error('NIMH_PAGE_EMPTY');
  const definition = sections.find((s) => s.heading !== null && /^What (is|are)\b/i.test(s.heading) && s.text.length > 0) ?? null;
  return { title: page.title, definition, sections, reviewed: lastReviewed(html) };
}

/** A publication: its text without navigation, its revision year and its number. */
export function parsePublication(html: string): { title: string; sections: Section[]; revised: string | null; number: string | null } {
  const page = parseArticle(html);
  const sections = compact(dropNavigation(page.sections));
  if (!sections.some((s) => s.text.length > 0)) throw new Error('NIMH_PAGE_EMPTY');
  return { title: page.title, sections, revised: revised(html), number: publicationNumber(html) };
}

/** Lists the topics through the host. */
export async function listTopics(hostFetch: HostFetch, signal?: AbortSignal): Promise<Entry[]> {
  return parseTopicIndex(await hostText(hostFetch, NIMH_TOPICS_URL, signal));
}

/** The address of a topic's own publication: same slug under /health/publications/. */
export function publicationUrl(topicId: string): string {
  const slug = topicId.replace(/\/+$/, '').split('/').pop()!;
  return `${NIMH_ORIGIN}/health/publications/${slug}`;
}

/**
 * Reads one topic through the host: the hub, then its publication. A
 * publication answering 404 means "none"; any other failure of that second
 * read fails the entry (it would otherwise be filed as "no publication",
 * which would be false).
 */
export async function readTopic(hostFetch: HostFetch, entry: Pick<Entry, 'id'>, signal?: AbortSignal): Promise<SourceDoc> {
  if (!entry.id.startsWith('/health/topics/')) throw new Error('NIMH_NOT_A_TOPIC');
  const url = `${NIMH_ORIGIN}${entry.id}`;
  const hub = parseTopicPage(await hostText(hostFetch, url, signal));
  const pubUrl = publicationUrl(entry.id);
  let pubHtml: string | null = null;
  try {
    pubHtml = await hostText(hostFetch, pubUrl, signal);
  } catch (err) {
    if (!(err instanceof Error && err.message === 'HTTP_404')) throw err;
  }
  const base = { source: 'nimh' as const, lang: 'en', title: hub.title, url, date: hub.reviewed, dateKind: 'reviewed' as const, licence: NIMH_LICENCE };
  if (pubHtml === null) {
    return { ...base, sections: hub.sections, nimhPublication: null };
  }
  const pub = parsePublication(pubHtml);
  const lead: Section[] = hub.definition ? [{ ...hub.definition, heading: `${hub.definition.heading} (topic page)`, level: 2 }] : [];
  return {
    ...base,
    sections: [...lead, ...pub.sections],
    nimhPublication: { title: pub.title, url: pubUrl, revised: pub.revised, number: pub.number },
  };
}
