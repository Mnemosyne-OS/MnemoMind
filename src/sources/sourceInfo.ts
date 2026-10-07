/**
 * sourceInfo — where each source lives and what its licence says, as the
 * source says it (doc 135 §3bis). Pure constants, no import: the screen, the
 * written files and the vault read them from here so they cannot drift apart.
 *
 * ⛔ Licences are COPIED, never summarised and never judged (fiche
 * `mnemolaw-source-licences-are-tonys-call`). The cartridge ships no content:
 * the person's machine fetches each text from its source, on a gesture.
 */

/** Honest identification for the Wikimedia APIs (their User-Agent policy). */
export const API_USER_AGENT = 'MnemoMind/0.1 (Mnemosyne OS cartridge; https://github.com/Mnemosyne-OS)';

// ── Wikipedia ───────────────────────────────────────────────────────────
/** The `rightsinfo.text` field of the API, identical on en/fr/es (measured 2026-10-04). */
export const WIKIPEDIA_LICENCE = 'Creative Commons Attribution-Share Alike 4.0';
/** The page the Wikipedia licence points to. */
export const WIKIPEDIA_LICENCE_URL = 'https://creativecommons.org/licenses/by-sa/4.0/';
/** The Wikipedia languages offered. */
export const WIKI_LANGS = ['en', 'fr', 'es'] as const;
/** One of the Wikipedia languages offered. */
export type WikiLang = (typeof WIKI_LANGS)[number];

/** True for a language the cartridge reads Wikipedia in. */
export function isWikiLang(x: unknown): x is WikiLang {
  return typeof x === 'string' && (WIKI_LANGS as readonly string[]).includes(x);
}

/** The MediaWiki API of one language. */
export function wikiApi(lang: WikiLang): string {
  return `https://${lang}.wikipedia.org/w/api.php`;
}

/** The address of the exact revision a memory was made from. */
export function wikiRevisionUrl(lang: WikiLang, title: string, revid: number): string {
  return `https://${lang}.wikipedia.org/w/index.php?title=${encodeURIComponent(title.replace(/ /g, '_'))}&oldid=${revid}`;
}

// ── OpenStax Psychology 2e ──────────────────────────────────────────────
/** The repository of the textbook. */
export const OPENSTAX_REPO = 'openstax/osbooks-psychology';
/** Raw files of the repository (CORS `*`). */
export const OPENSTAX_RAW = `https://raw.githubusercontent.com/${OPENSTAX_REPO}/main`;
/** The plan of the book: chapters, module ids, licence. */
export const OPENSTAX_COLLECTION_URL = `${OPENSTAX_RAW}/collections/psychology-2e.collection.xml`;
/** The book's page on openstax.org, named in the attribution. */
export const OPENSTAX_BOOK_URL = 'https://openstax.org/details/books/psychology-2e';
/** The licence as doc 135 §3bis.2 recopied it (repository LICENSE and `md:license`). Shown on the tile;
 *  a memory carries the text read LIVE from the collection's `md:license`. */
export const OPENSTAX_LICENCE = 'Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International';

/** The raw CNXML file of one module. */
export function openstaxModuleUrl(id: string): string {
  return `${OPENSTAX_RAW}/modules/${id}/index.cnxml`;
}

/** Where a person reads the module's source file. */
export function openstaxModulePage(id: string): string {
  return `https://github.com/${OPENSTAX_REPO}/blob/main/modules/${id}/index.cnxml`;
}

/** GitHub's commit feed for one module: no API quota, but no CORS either (read through the host). */
export function openstaxModuleFeed(id: string): string {
  return `https://github.com/${OPENSTAX_REPO}/commits/main/modules/${id}/index.cnxml.atom`;
}

// ── NIMH ────────────────────────────────────────────────────────────────
/** The NIMH site (no CORS: read through the host). */
export const NIMH_ORIGIN = 'https://www.nimh.nih.gov';
/** The index of the health topics. */
export const NIMH_TOPICS_URL = `${NIMH_ORIGIN}/health/topics`;
/** The NIMH page the licence sentence is copied from. */
export const NIMH_POLICY_URL = `${NIMH_ORIGIN}/site-info/policies`;
/** Recopied from the NIMH policy page (doc 135 §3bis.2). */
export const NIMH_LICENCE = 'The information on our website and in our materials is in the public domain and may be reused or copied without permission';
