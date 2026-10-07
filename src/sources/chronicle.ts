/**
 * chronicle — how a text read from a source becomes memories.
 *
 * Every chronicle opens with a title that names the source and the entry and
 * closes with a SOURCE LINE: where the text comes from, its date as the source
 * gives it, its licence verbatim, and the address where it can be checked. A
 * chunk retrieved alone, months later, must still say all of that. A date the
 * source did not give is ABSENT from the line, never replaced by today.
 *
 * Pure: no import beside the source constants.
 */
import type { Entry, Section, SourceDoc } from './entry';
import { OPENSTAX_ATTRIBUTION } from './openstax';

/**
 * Largest body in ONE chronicle. The host cuts a chronicle at 50 000
 * characters without a word (`mnemosyne.ingest` slices); 18 000 is DocWatch's
 * part size (doc 57), the same as MnemoLaw's.
 */
export const PART_CHARS = 18_000;

/** Splits a text into pieces of at most `max` characters, at a blank line, a line break or a space when one is in the second half. */
export function splitText(text: string, max = PART_CHARS): string[] {
  const parts: string[] = [];
  let rest = text;
  while (rest.length > max) {
    const window = rest.slice(0, max);
    const floor = Math.floor(max / 2);
    let cut = window.lastIndexOf('\n\n');
    if (cut < floor) cut = window.lastIndexOf('\n');
    if (cut < floor) cut = window.lastIndexOf(' ');
    if (cut < floor) cut = max;
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  parts.push(rest);
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** A section as text: its heading in markdown, then its body. */
export function sectionText(s: Section): string {
  const head = s.heading ? `${'#'.repeat(Math.min(Math.max(s.level, 2), 6))} ${s.heading}` : '';
  return [head, s.text].filter(Boolean).join('\n\n');
}

/** The bodies of the parts: whole sections packed up to `max`, a section longer than that cut on its own. */
export function packSections(sections: readonly Section[], max = PART_CHARS): string[] {
  const parts: string[] = [];
  let current = '';
  for (const s of sections) {
    const block = sectionText(s);
    if (!block) continue;
    if (block.length > max) {
      if (current) { parts.push(current); current = ''; }
      parts.push(...splitText(block, max));
      continue;
    }
    if (current && current.length + 2 + block.length > max) { parts.push(current); current = ''; }
    current = current ? `${current}\n\n${block}` : block;
  }
  if (current) parts.push(current);
  return parts;
}

/** The name of a source as a memory states it. */
export function sourceLabel(doc: Pick<SourceDoc, 'source' | 'lang'>): string {
  if (doc.source === 'wikipedia') return `Wikipedia (${doc.lang})`;
  if (doc.source === 'openstax') return 'OpenStax Psychology 2e';
  return 'NIMH';
}

/** The title line of a memory: source, then the entry (and its chapter for a textbook module). */
export function chronicleTitle(doc: SourceDoc): string {
  return [sourceLabel(doc), doc.chapter, doc.title].filter(Boolean).join(' · ');
}

/** The closing line of every memory of a document. */
export function sourceLine(doc: SourceDoc, entry?: Pick<Entry, 'id'>): string {
  const licence = `Licence: ${doc.licence}.`;
  const check = `Check: ${doc.url}`;
  if (doc.source === 'wikipedia') {
    const rev = doc.revid !== undefined ? `, revision ${doc.revid}` : '';
    const when = doc.date ? ` of ${doc.date}` : '';
    return `Source: Wikipedia (${doc.lang}), article "${doc.title}"${rev}${when}. ${licence} ${check}`;
  }
  if (doc.source === 'openstax') {
    const where = [doc.chapter ? `chapter "${doc.chapter}"` : '', entry ? `module ${entry.id} "${doc.title}"` : `module "${doc.title}"`].filter(Boolean).join(', ');
    const when = doc.date ? ` Last commit touching the module: ${doc.date}.` : '';
    return `Source: ${OPENSTAX_ATTRIBUTION}. ${where}.${when} ${licence} ${check}`;
  }
  const when = doc.date ? ` Last Reviewed: ${doc.date}.` : '';
  const pub = doc.nimhPublication;
  if (pub) {
    const facts = [pub.number ? `NIH Publication No. ${pub.number}` : '', pub.revised ? `Revised ${pub.revised}` : ''].filter(Boolean).join(', ');
    return `Source: National Institute of Mental Health (NIMH), topic page "${doc.title}"${when ? ` (${when.trim().replace(/\.$/, '')})` : ''} and its publication "${pub.title}"${facts ? ` (${facts})` : ''}. ${licence} Check: ${doc.url} and ${pub.url}`;
  }
  const none = pub === null ? ' No NIMH publication was found for this topic: this memory holds the topic page\'s own text, its navigation left out.' : '';
  return `Source: National Institute of Mental Health (NIMH), "${doc.title}".${when}${none} ${licence} ${check}`;
}

/** The chronicle bodies of a document: one, or one per part, each titled and closed by the source line. */
export function chronicles(doc: SourceDoc, entry?: Pick<Entry, 'id'>): string[] {
  const parts = packSections(doc.sections);
  const title = chronicleTitle(doc);
  const line = sourceLine(doc, entry);
  return parts.map((body, i) => [
    `# ${title}${parts.length > 1 ? ` (part ${i + 1}/${parts.length})` : ''}`,
    '',
    body,
    '',
    line,
  ].join('\n'));
}
