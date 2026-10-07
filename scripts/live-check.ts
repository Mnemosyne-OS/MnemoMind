/**
 * live-check — lists every Wikipedia category MnemoMind reads, through the
 * cartridge's own reader, and prints what each holds. A measurement, not a
 * test: it needs the network. Usage: npx vite-node scripts/live-check.ts
 */
import { SUBDOMAINS, WIKI_ROOTS } from '../src/sources/catalogue';
import { WIKI_LANGS } from '../src/sources/sourceInfo';
import { listCategory } from '../src/sources/wikipedia';
import { API_USER_AGENT } from '../src/sources/sourceInfo';
import type { FetchText } from '../src/sources/net';

// Node's fetch sends no browser User-Agent; Wikimedia answers 429 to an anonymous one.
const fetchText: FetchText = async (url, signal, headers) => {
  const res = await fetch(url, { signal, headers: { ...headers, 'User-Agent': API_USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP_${res.status}`);
  return res.text();
};

for (const sub of SUBDOMAINS) {
  for (const lang of WIKI_LANGS) {
    const root = WIKI_ROOTS[sub][lang];
    const res = await listCategory(fetchText, lang, root);
    console.log(`${sub} ${lang} "${root.category}" depth ${root.depth}: ${res.entries.length} pages from ${res.categories.length} categories${res.capped ? ' (CAPPED)' : ''}; e.g. ${res.entries.slice(0, 4).map((e) => e.title).join(' | ')}`);
  }
}
