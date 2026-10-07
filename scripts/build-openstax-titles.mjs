/**
 * build-openstax-titles — the module titles of OpenStax Psychology 2e, shipped
 * with the cartridge so the module list shows real names at once.
 *
 * The plan (collections/psychology-2e.collection.xml) names chapters and
 * module ids only; a module's title lives in the module itself. Fetching 105
 * modules each time someone opens the list would cost ~1.5 MB and a minute,
 * so the titles are read once here. The LIVE plan still decides which modules
 * exist (a module missing from this map is listed by its number), and the
 * title written to memory is always the one read from the module at import.
 *
 * Usage: node scripts/build-openstax-titles.mjs
 */
import { writeFileSync } from 'node:fs';

const BASE = 'https://raw.githubusercontent.com/openstax/osbooks-psychology/main';
const plan = await (await fetch(`${BASE}/collections/psychology-2e.collection.xml`)).text();
const ids = [...plan.matchAll(/<col:module document="(m\d+)"/g)].map((m) => m[1]);
const titles = {};
for (const id of ids) {
  const res = await fetch(`${BASE}/modules/${id}/index.cnxml`);
  if (!res.ok) throw new Error(`${id}: HTTP ${res.status}`);
  const xml = await res.text();
  const m = /<title>([\s\S]*?)<\/title>/.exec(xml);
  if (!m) throw new Error(`${id}: no <title>`);
  titles[id] = m[1].replace(/\s+/g, ' ').trim();
  await new Promise((r) => setTimeout(r, 100));
}
const out = { builtAt: new Date().toISOString().slice(0, 10), source: `${BASE}/collections/psychology-2e.collection.xml`, titles };
writeFileSync(new URL('../src/sources/openstaxTitles.json', import.meta.url), JSON.stringify(out, null, 1) + '\n');
console.log(`${ids.length} modules, ${Object.keys(titles).length} titles`);
