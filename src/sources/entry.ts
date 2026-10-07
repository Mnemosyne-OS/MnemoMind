/**
 * entry — the shapes every reader produces, whatever its source.
 * Types only (plus one key builder), so the readers do not import each other.
 */
import type { SourceId } from './catalogue';

/** One unit a person can put in memory: a Wikipedia page, an OpenStax module, a NIMH topic. */
export interface Entry {
  /** `<source>|<lang>|<id>`, unique across the cartridge. */
  key: string;
  /** Wikipedia pageid, OpenStax module id, NIMH topic path. */
  id: string;
  source: SourceId;
  lang: string;
  title: string;
  /** OpenStax: the chapter the module sits in. */
  chapter?: string;
  /** Wikipedia: the page length in bytes (`prop=info`), when the API gave it. */
  bytes?: number;
}

/** One block of a text, under its heading. The lead of a page has no heading. */
export interface Section {
  heading: string | null;
  /** 2 for `##`, 3 for `###`… 0 for the lead. */
  level: number;
  text: string;
}

/** A text read from its source, with everything its source line needs. */
export interface SourceDoc {
  source: SourceId;
  lang: string;
  /** The title as the source gives it (a redirect resolved to its target). */
  title: string;
  /** Where a person checks the text: the exact revision, the module file, the page. */
  url: string;
  /** The date the source gives, as it gives it (ISO timestamp, ISO day, or "December 2024"). Null = not found, never invented. */
  date: string | null;
  /** What the date is: a revision timestamp, the last commit touching the file, or a "Last Reviewed" mention. */
  dateKind: 'revision' | 'commit' | 'reviewed';
  /** Wikipedia: the revision id read. */
  revid?: number;
  /** The licence as the source states it, verbatim. */
  licence: string;
  chapter?: string;
  sections: Section[];
  /** NIMH: the topic's publication whose text follows the hub's definition. Null = looked for, none found. */
  nimhPublication?: NimhPublication | null;
}

/** An NIMH publication as its page states it; a missing date or number stays null. */
export interface NimhPublication {
  title: string;
  url: string;
  /** "2024" as in "Revised 2024". */
  revised: string | null;
  /** "24-MH-8079". */
  number: string | null;
}

/** The unique key of an entry: `<source>|<lang>|<id>`. */
export function entryKey(source: SourceId, lang: string, id: string): string {
  return `${source}|${lang}|${id}`;
}
