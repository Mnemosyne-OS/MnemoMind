/**
 * agentFind — a text of an open list named the way a person says it (doc 149).
 * Copied from Vitrine Studio's matcher (cartridges never import each other).
 * The orb plans a spoken sentence in ONE model call and never reads MnemoMind
 * first, so « ajoute l'effet de halo » reaches `add` with the words « effet de
 * halo », never a Wikipedia page id. An id still works (other agents read
 * `entries` first).
 *
 * 🚨 Several matches are REFUSED with their names (AMBIGUOUS), never the first
 *    one taken: the refusal is what the orb's second planner call reads to
 *    pick the right one. No match is refused with the names that exist.
 *
 * @module ui/agentFind
 */

/** Lower case, accents off, œ/æ spelled out. */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae');
}

/**
 * Words that carry no name: articles and the words a sentence wraps a name in.
 * 🪤 Matched BEFORE the accents come off: folded, « thé » is « the » (Bol à thé).
 */
const FILLER = new Set([
  'le', 'la', 'les', 'l', 'un', 'une', 'des', 'de', 'du', 'd', 'mon', 'ma', 'mes', 'ce', 'cette', 'ces', 'et', 'en', 'au', 'aux', 'à', 'sur',
  'the', 'a', 'an', 'of', 'my', 'and', 'on', 'about', 'el', 'los', 'las', 'del', 'mi', 'y', 'sobre',
  // The words a sentence wraps a title in.
  'texte', 'textes', 'text', 'texts', 'texto', 'article', 'articles', 'artículo', 'page', 'pages', 'página', 'entrée', 'entry', 'entries', 'fiche', 'module',
  // 🪤 Kind words that change place between languages: the English list says « Halo effect »,
  // the person says « l'effet de halo »; « Confirmation bias » is « biais de confirmation ».
  'effet', 'effets', 'effect', 'effects', 'efecto', 'efectos', 'biais', 'bias', 'biases', 'sesgo', 'sesgos',
]);

/** The words of a name, folded, fillers out, a plural « s »/« x » off so « vases » finds « vase ». */
export function nameWords(s: string): string[] {
  return s.normalize('NFC').toLowerCase().split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w && !FILLER.has(w))
    .map((w) => fold(w))
    .map((w) => (w.length > 3 ? w.replace(/[sx]$/, '') : w));
}

export interface Named<T> { item: T; id: string; names: string[]; label: string }

const LIST_MAX = 12;
const listed = (labels: string[]) => {
  const unique = [...new Set(labels)];
  return unique.length > LIST_MAX ? `${unique.slice(0, LIST_MAX).join(', ')} (+${unique.length - LIST_MAX})` : unique.join(', ');
};

/**
 * The one item `ref` names: its id; else the item whose words hold every word
 * of `ref`. `kind` names the error (NO_PIECE, NO_SCENE…) and the noun said.
 */
export function findNamed<T>(entries: ReadonlyArray<Named<T>>, ref: string, kind: { code: string; noun: string }): T {
  const raw = ref.trim();
  if (!raw) throw new Error(`BAD_ARG: name the ${kind.noun}`);
  const byId = entries.find((e) => e.id === raw);
  if (byId) return byId.item;
  const asked = nameWords(raw);
  const all = entries.map((e) => e.label);
  if (!asked.length) throw new Error(`${kind.code}: "${raw}" names no ${kind.noun}; ${kind.noun}s: ${listed(all) || 'none'}`);
  // The whole name said as written wins over a partial match (« Vase » against « Vase » and « Vase bleu »).
  const whole = entries.filter((e) => e.names.some((n) => nameWords(n).join(' ') === asked.join(' ')));
  if (whole.length === 1) return whole[0]!.item;
  const hits = entries.filter((e) => {
    const have = new Set(e.names.flatMap(nameWords));
    return asked.every((w) => have.has(w));
  });
  if (hits.length === 1) return hits[0]!.item;
  if (hits.length > 1) throw new Error(`AMBIGUOUS: "${raw}" names several ${kind.noun}s: ${listed(hits.map((e) => e.label))}; say which`);
  throw new Error(`${kind.code}: no ${kind.noun} named "${raw}"; ${kind.noun}s: ${listed(all) || 'none'}`);
}
