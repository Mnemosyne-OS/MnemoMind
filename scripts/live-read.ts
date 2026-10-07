/**
 * live-read — reads one real entry of each source through the cartridge's
 * readers and prints what would enter memory. A measurement, not a test.
 * NIMH is fetched straight from Node here (no CORS in Node), standing in for
 * the host's social.fetch. Usage: npx vite-node scripts/live-read.ts
 */
import { JSDOM } from 'jsdom';
import { API_USER_AGENT, OPENSTAX_COLLECTION_URL } from '../src/sources/sourceInfo';
import type { FetchText, HostFetch } from '../src/sources/net';
import { readPage } from '../src/sources/wikipedia';
import { parseCollection, readModule } from '../src/sources/openstax';
import { listTopics, readTopic } from '../src/sources/nimh';
import { chronicles } from '../src/sources/chronicle';

(globalThis as { DOMParser?: unknown }).DOMParser = new JSDOM().window.DOMParser;
const fetchText: FetchText = async (url, signal, headers) => {
  const res = await fetch(url, { signal, headers: { ...headers, 'User-Agent': API_USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP_${res.status}`);
  return res.text();
};
const hostFetch: HostFetch = async (url) => {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  return { status: res.status, body: await res.text(), encoding: 'utf8', truncated: false };
};
const show = (label: string, bodies: string[]) => {
  console.log(`\n=== ${label}: ${bodies.length} part(s), sizes ${bodies.map((b) => b.length).join('/')}`);
  console.log(bodies[0]!.slice(0, 500));
  console.log('…');
  console.log(bodies[bodies.length - 1]!.slice(-420));
};

const wiki = await readPage(fetchText, 'fr', '78919');
show('Wikipedia fr pageid 78919', chronicles(wiki));
const plan = parseCollection(await fetchText(OPENSTAX_COLLECTION_URL));
const mem = plan.chapters.find((c) => c.title === 'Memory')!;
const mod = await readModule({ fetchText, hostFetch }, { id: mem.modules[1]!, chapter: `${mem.number}. ${mem.title}` }, plan);
show(`OpenStax ${mem.modules[1]}`, chronicles(mod, { id: mem.modules[1]! }));
const topics = await listTopics(hostFetch);
console.log(`\nNIMH: ${topics.length} topics`);
for (const id of ['/health/topics/schizophrenia', '/health/topics/anxiety-disorders', '/health/topics/mental-health-medications']) {
  const t = await readTopic(hostFetch, { id });
  show(`NIMH ${id} (reviewed: ${t.date})`, chronicles(t));
}
