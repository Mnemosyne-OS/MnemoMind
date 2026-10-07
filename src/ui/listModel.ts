/**
 * listModel — the pure half of the entry list, kept out of the .tsx so that
 * file exports a component and nothing else (Fast Refresh).
 */

/** Rows drawn at most; the rest is counted on screen, never hidden silently. */
export const SHOWN = 150;

/** Accent- and case-blind title match, every word of the query required. */
export function matchTitle(title: string, query: string): boolean {
  const fold = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const hay = fold(title);
  return fold(query).split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}
