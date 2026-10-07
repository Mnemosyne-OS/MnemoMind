import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ATTRIBUTION_FILE, EMPTY_LIBRARY, importEntry, newBatch, parseLibrary, recordEntry, runAll, subdomainSummary, withBatch,
  type Batch, type HostPort,
} from './library';
import type { Entry, SourceDoc } from './entry';
import { NIMH_LICENCE, OPENSTAX_LICENCE, WIKIPEDIA_LICENCE } from './sourceInfo';

const entry = (id: string): Entry => ({ key: `wikipedia|en|${id}`, id, source: 'wikipedia', lang: 'en', title: `Page ${id}` });
const doc = (title: string): SourceDoc => ({
  source: 'wikipedia', lang: 'en', title, url: `https://en.wikipedia.org/w/index.php?title=${title}&oldid=1`, date: '2026-10-01T00:00:00Z',
  dateKind: 'revision', revid: 1, licence: WIKIPEDIA_LICENCE, sections: [{ heading: null, level: 0, text: `Text of ${title}.` }],
});

function memPort() {
  const files = new Map<string, string>();
  const ingested: { content: string; sourceRef: string }[] = [];
  const port: HostPort & { failIngest?: (n: number) => boolean } = {
    writeFile: async (path, content) => { files.set(path, content); return { success: true }; },
    mkdir: async () => ({ success: true }),
    ingest: async (e) => {
      if (port.failIngest?.(ingested.length)) throw new Error('VAULT_REFUSED');
      ingested.push(e);
    },
  };
  return { port, files, ingested };
}

const noWait = async () => undefined;

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('the stored library', () => {
  it('reads the shape `state.get` really answers ({ state: { library } })', () => {
    const b = { ...newBatch('biases', 'wikipedia', 'fr'), ids: ['1', '2'], lastAt: '2026-10-04T10:00:00.000Z' };
    const lib = parseLibrary({ state: { library: { folder: 'C:\\x\\MnemoMind', batches: [b] } }, updatedAt: 1 });
    expect(lib.folder).toBe('C:\\x\\MnemoMind');
    expect(lib.batches[0]).toMatchObject({ key: 'biases|wikipedia|fr', ids: ['1', '2'] });
  });

  it('drops what it cannot read instead of guessing', () => {
    const lib = parseLibrary({ state: { library: { folder: 3, batches: [{ sub: 'astrology', source: 'wikipedia', lang: 'en' }, { sub: 'neuro', source: 'x', lang: 'en' }, null] } } });
    expect(lib).toEqual(EMPTY_LIBRARY);
    expect(parseLibrary(undefined)).toEqual(EMPTY_LIBRARY);
  });

  it('nothing in memory is zero entries and NO date, not a date of today', () => {
    expect(subdomainSummary(EMPTY_LIBRARY, 'neuro')).toEqual({ entries: 0, lastAt: null });
    const lib = withBatch(withBatch(EMPTY_LIBRARY, { ...newBatch('neuro', 'wikipedia', 'en'), ids: ['1'], lastAt: '2026-10-01T00:00:00Z' }),
      { ...newBatch('neuro', 'openstax', 'en'), ids: ['m1', 'm2'], lastAt: '2026-10-03T00:00:00Z' });
    expect(subdomainSummary(lib, 'neuro')).toEqual({ entries: 3, lastAt: '2026-10-03T00:00:00Z' });
  });

  it('a whole run of everything stays far under the 256 KB of durable state', () => {
    let lib = EMPTY_LIBRARY;
    for (const sub of ['biases', 'disorders', 'schools', 'neuro', 'memory'] as const) {
      for (const lang of ['en', 'fr', 'es']) lib = withBatch(lib, { ...newBatch(sub, 'wikipedia', lang), ids: Array.from({ length: 400 }, (_, i) => String(70_000_000 + i)) });
    }
    expect(JSON.stringify({ library: lib }).length).toBeLessThan(150_000);
  });

  it('records an outcome once, moving an id between lists', () => {
    let b = newBatch('memory', 'nimh', 'en');
    b = recordEntry(b, 'x', 'failed', '2026-10-04T00:00:00Z');
    expect(b.lastAt).toBeNull();
    b = recordEntry(b, 'x', 'whole', '2026-10-04T01:00:00Z');
    b = recordEntry(b, 'x', 'whole', '2026-10-04T02:00:00Z');
    expect(b).toMatchObject({ ids: ['x'], failed: [], lastAt: '2026-10-04T02:00:00Z' });
  });
});

describe('putting one entry in memory', () => {
  it('writes the copy and the attribution, then one chronicle per part with its source line', async () => {
    const { port, files, ingested } = memPort();
    const res = await importEntry(port, { folder: 'C:\\D\\MnemoMind', vault: 'APP_X', sub: 'biases', entry: entry('7'), doc: doc('Anchoring effect') });
    expect(res).toMatchObject({ outcome: 'whole', parts: 1, inVault: 1 });
    expect(res.file).toBe('C:\\D\\MnemoMind\\Cognitive biases\\Wikipedia (en)\\page-7--7.json');
    const copy = JSON.parse(files.get(res.file)!) as Record<string, unknown>;
    expect(copy).toMatchObject({ title: 'Anchoring effect', licence: WIKIPEDIA_LICENCE, date: '2026-10-01T00:00:00Z', revid: 1 });
    const attribution = files.get(`C:\\D\\MnemoMind\\${ATTRIBUTION_FILE}`)!;
    for (const lic of [WIKIPEDIA_LICENCE, OPENSTAX_LICENCE, NIMH_LICENCE]) expect(attribution).toContain(lic);
    expect(ingested[0]!.sourceRef).toBe('wikipedia|en|7#1');
    expect(ingested[0]!.content).toMatch(/Licence: Creative Commons Attribution-Share Alike 4\.0\. Check: https:/);
  });

  it('an entry with ONE refused part is not counted as in memory', async () => {
    const { port } = memPort();
    port.failIngest = (n) => n === 1;
    const long: SourceDoc = { ...doc('Long'), sections: [{ heading: 'A', level: 2, text: 'x'.repeat(17_000) }, { heading: 'B', level: 2, text: 'y'.repeat(17_000) }] };
    const res = await importEntry(port, { folder: '/d', vault: 'V', sub: 'neuro', entry: entry('9'), doc: long });
    expect(res).toMatchObject({ outcome: 'failed', parts: 2, inVault: 1 });
  });

  it('a file that cannot be written stops before anything enters the vault', async () => {
    const { port, ingested } = memPort();
    port.writeFile = async () => ({ success: false, error: 'EACCES' });
    await expect(importEntry(port, { folder: '/d', vault: 'V', sub: 'neuro', entry: entry('1'), doc: doc('X') })).rejects.toThrow('WRITE_FAILED: EACCES');
    expect(ingested).toHaveLength(0);
  });
});

describe('putting everything in memory', () => {
  const entries = ['1', '2', '3', '4'].map(entry);

  it('skips what is already in memory, counts what the source refuses, and goes on', async () => {
    const { port, ingested } = memPort();
    const saved: Batch[] = [];
    const start = { ...newBatch('biases', 'wikipedia', 'en'), ids: ['1'] };
    const end = await runAll({
      read: async (e) => { if (e.id === '3') throw new Error('WIKI_PAGE_EMPTY'); return doc(e.title); },
      port, folder: '/d', vault: 'V', save: async (b) => { saved.push(b); }, wait: noWait,
    }, entries, start);
    expect(end.ids).toEqual(['1', '2', '4']);
    expect(end.refused).toEqual(['3']);
    expect(end.total).toBe(4);
    expect(ingested.map((i) => i.sourceRef)).toEqual(['wikipedia|en|2#1', 'wikipedia|en|4#1']);
    expect(saved.at(-1)).toEqual(end);
  });

  it('a failure that is not about one entry ends the run, says why, and keeps what was done', async () => {
    const { port } = memPort();
    const saved: Batch[] = [];
    const run = runAll({
      read: async (e) => { if (e.id === '2') throw new Error('PERMISSION_DENIED: vault:read'); return doc(e.title); },
      port, folder: '/d', vault: 'V', save: async (b) => { saved.push(b); }, wait: noWait,
    }, entries, newBatch('disorders', 'nimh', 'en'));
    await expect(run).rejects.toThrow('PERMISSION_DENIED');
    expect(saved.at(-1)!.ids).toEqual(['1']);
  });

  it('a stop mid-entry does not record that entry: the next run reads it again', async () => {
    const { port } = memPort();
    const ctrl = new AbortController();
    const end = await runAll({
      read: async (e) => { if (e.id === '2') ctrl.abort(); return doc(e.title); },
      port, folder: '/d', vault: 'V', save: async () => undefined, signal: ctrl.signal, wait: noWait,
    }, entries, newBatch('memory', 'wikipedia', 'en'));
    expect(end.ids).toEqual(['1']);
  });

  it('a rate limit is tried again before it counts', async () => {
    const { port } = memPort();
    let calls = 0;
    const end = await runAll({
      read: async (e) => { if (e.id === '1' && calls++ === 0) throw new Error('HTTP_429'); return doc(e.title); },
      port, folder: '/d', vault: 'V', save: async () => undefined, wait: noWait,
    }, [entry('1')], newBatch('memory', 'wikipedia', 'en'));
    expect(end.ids).toEqual(['1']);
  });
});

describe('a Stop never leaves a trace of an entry the vault did not take', () => {
  it('a Stop during the read: no file written, the entry neither in memory nor failed', async () => {
    const { port, files, ingested } = memPort();
    const ctrl = new AbortController();
    const end = await runAll({
      read: async (e) => { if (e.id === '2') ctrl.abort(); return doc(e.title); },
      port, folder: '/d', vault: 'V', save: async () => undefined, signal: ctrl.signal, wait: noWait,
    }, [entry('1'), entry('2')], newBatch('memory', 'wikipedia', 'en'));
    expect(end.ids).toEqual(['1']);
    expect(end.failed).toEqual([]);
    expect([...files.keys()].some((f) => f.includes('page-2'))).toBe(false);
    expect(ingested.map((i) => i.sourceRef)).toEqual(['wikipedia|en|1#1']);
  });

  it('a Stop between two parts: reported "stopped", never "failed", and not recorded', async () => {
    const { port } = memPort();
    const ctrl = new AbortController();
    const inner = port.ingest;
    port.ingest = async (e) => { await inner(e); ctrl.abort(); };
    const long: SourceDoc = { ...doc('Long'), sections: [{ heading: 'A', level: 2, text: 'x'.repeat(17_000) }, { heading: 'B', level: 2, text: 'y'.repeat(17_000) }] };
    const res = await importEntry(port, { folder: '/d', vault: 'V', sub: 'neuro', entry: entry('9'), doc: long, signal: ctrl.signal });
    expect(res.outcome).toBe('stopped');
  });

  it('runAll does not record an entry whose import says "stopped"', async () => {
    const ctrl = new AbortController();
    const { port } = memPort();
    const inner = port.ingest;
    port.ingest = async (e) => { await inner(e); ctrl.abort(); };
    const long: SourceDoc = { ...doc('Long'), sections: [{ heading: 'A', level: 2, text: 'x'.repeat(17_000) }, { heading: 'B', level: 2, text: 'y'.repeat(17_000) }] };
    const end = await runAll({
      read: async () => long, port, folder: '/d', vault: 'V', save: async () => undefined, signal: ctrl.signal, wait: noWait,
    }, [entry('9')], newBatch('neuro', 'wikipedia', 'en'));
    expect(end.ids).toEqual([]);
    expect(end.failed).toEqual([]);
  });
});

describe('the resume point is saved as the run goes', () => {
  it('saves every 5 entries and at the end', async () => {
    const { port } = memPort();
    const saved: number[] = [];
    await runAll({
      read: async (e) => doc(e.title), port, folder: '/d', vault: 'V', wait: noWait,
      save: async (b) => { saved.push(b.ids.length); },
    }, Array.from({ length: 12 }, (_, i) => entry(String(i))), newBatch('biases', 'wikipedia', 'en'));
    expect(saved).toEqual([5, 10, 12]);
  });
});

describe('a Stop while the folder is being made', () => {
  it('writes no file and puts nothing in the vault', async () => {
    const { port, files, ingested } = memPort();
    const ctrl = new AbortController();
    port.mkdir = async () => { ctrl.abort(); return { success: true }; };
    const res = await importEntry(port, { folder: '/d', vault: 'V', sub: 'neuro', entry: entry('5'), doc: doc('X'), signal: ctrl.signal });
    expect(res.outcome).toBe('stopped');
    expect(files.size).toBe(0);
    expect(ingested).toHaveLength(0);
  });
});
