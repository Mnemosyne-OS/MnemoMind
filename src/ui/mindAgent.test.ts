/**
 * MnemoMind's agent handlers (doc 149): each one goes through the app's own move, shows the
 * topic first, and refuses by name (busy, no list, unknown id, library not read).
 */
import { describe, it, expect, vi } from 'vitest';
import { bounded, mindAgentHandlers, resolveSource, within, type MindAgentContext } from './mindAgent';
import type { Entry } from '../sources/entry';
import type { LibraryState } from '../sources/library';

const entry = (id: string, title: string): Entry => ({ key: `wikipedia|en|${id}`, id, source: 'wikipedia', lang: 'en', title });
const listed = { kind: 'ready' as const, listing: { entries: [entry('1', 'Anchoring'), entry('2', 'Framing effect'), entry('3', 'Halo effect')] } };
const lib = (ids: string[] = [], refused: string[] = []): LibraryState => ({
  folder: 'D:/K/mnemo-mind',
  batches: [{ key: 'biases|wikipedia|en', sub: 'biases', source: 'wikipedia', lang: 'en', ids, failed: [], refused, total: 3, lastAt: null }],
});

function ctx(over: Partial<MindAgentContext> = {}): MindAgentContext {
  return {
    view: { kind: 'home' },
    libStatus: { kind: 'ready' },
    lib: lib(['1']),
    lists: { 'biases|wikipedia|en': listed },
    job: null,
    wikiLang: 'en',
    go: vi.fn(),
    setWikiLang: vi.fn(),
    retryLibrary: vi.fn(),
    openList: vi.fn(async () => undefined),
    addOne: vi.fn(async () => undefined),
    addAll: vi.fn(async () => undefined),
    stop: vi.fn(),
    ...over,
  };
}
const H = (c: MindAgentContext) => mindAgentHandlers(() => c);

describe('resolveSource and bounded', () => {
  it('takes the screen\'s Wikipedia language when none is given, and English for the other sources', () => {
    expect(resolveSource({ topic: 'biases', source: 'wikipedia' }, 'fr')).toMatchObject({ lang: 'fr', key: 'biases|wikipedia|fr' });
    expect(resolveSource({ topic: 'biases', source: 'openstax' }, 'fr')).toMatchObject({ lang: 'en' });
  });
  it('refuses a source the topic does not offer, an unknown topic, and a language a source is not read in', () => {
    expect(() => resolveSource({ topic: 'biases', source: 'nimh' }, 'en')).toThrow(/^NOT_FOUND: .*wikipedia, openstax/);
    expect(() => resolveSource({ topic: 'dreams', source: 'wikipedia' }, 'en')).toThrow(/^NOT_FOUND/);
    expect(() => resolveSource({ topic: 'biases', source: 'openstax', lang: 'fr' }, 'en')).toThrow(/^BAD_ARG/);
    expect(() => resolveSource({ topic: 'biases', source: 'wikipedia', lang: 'de' }, 'en')).toThrow(/^BAD_ARG/);
  });
  it('bounded never takes a negative or oversized number', () => {
    expect(bounded(undefined, 1, 200, 30, 'limit')).toBe(30);
    expect(() => bounded(-1, 1, 200, 30, 'limit')).toThrow(/^BAD_ARG/);
    expect(() => bounded(201, 1, 200, 30, 'limit')).toThrow(/^BAD_ARG/);
    expect(() => bounded(2.5, 1, 200, 30, 'limit')).toThrow(/^BAD_ARG/);
    expect(bounded(200, 1, 200, 30, 'limit')).toBe(200);
  });
  it('within answers running when the work outlasts the wait', async () => {
    vi.useFakeTimers();
    const slow = within(new Promise(() => undefined), 10);
    vi.advanceTimersByTime(11);
    await expect(slow).resolves.toEqual({ done: false });
    vi.useRealTimers();
    await expect(within(Promise.resolve(1), 1000)).resolves.toEqual({ done: true });
  });
});

describe('the handlers', () => {
  it('listSource shows the topic, sets the Wikipedia language, reads through openList and counts', async () => {
    const c = ctx({ lists: { 'biases|wikipedia|fr': listed }, lib: { folder: null, batches: [] } });
    const out = await H(c).listSource({ topic: 'biases', source: 'wikipedia', lang: 'fr' });
    expect(c.go).toHaveBeenCalledWith({ kind: 'sub', sub: 'biases' });
    expect(c.setWikiLang).toHaveBeenCalledWith('fr');
    expect(c.openList).toHaveBeenCalledWith('biases', 'wikipedia', 'fr');
    expect(out).toMatchObject({ entries: 3, alreadyInMemory: 0 });
  });

  it('listSource refuses while a job runs, and says a failed list', async () => {
    const busy = ctx({ job: { kind: 'all', key: 'x', startedAt: 0, done: 0, todo: 1 } });
    await expect(H(busy).listSource({ topic: 'biases', source: 'wikipedia' })).rejects.toThrow(/^BUSY/);
    expect(busy.openList).not.toHaveBeenCalled();
    const failed = ctx({ lists: { 'biases|wikipedia|en': { kind: 'error', why: 'HTTP 503' } } });
    await expect(H(failed).listSource({ topic: 'biases', source: 'wikipedia' })).rejects.toThrow(/^LIST_FAILED: HTTP 503/);
  });

  it('entries pages and narrows, with each entry\'s state', () => {
    const c = ctx({ lib: lib(['1'], ['3']) });
    const all = H(c).entries({ topic: 'biases', source: 'wikipedia' });
    expect(all.entries.map((e) => e.state)).toEqual(['in memory', 'not added', 'refused by the source']);
    expect(H(c).entries({ topic: 'biases', source: 'wikipedia', query: 'effect', limit: 1, offset: 1 }).entries).toEqual([{ id: '3', title: 'Halo effect', state: 'refused by the source' }]);
    expect(() => H(ctx({ lists: {} })).entries({ topic: 'biases', source: 'wikipedia' })).toThrow(/^NO_LIST/);
  });

  it('add goes through addOne and answers the outcome the library recorded', async () => {
    const c = ctx({ lib: lib([]) });
    c.addOne = vi.fn(async () => { c.lib = lib(['2']); });
    await expect(H(c).add({ topic: 'biases', source: 'wikipedia', entryId: '2' })).resolves.toEqual({ id: '2', title: 'Framing effect', outcome: 'in memory' });
    expect(c.addOne).toHaveBeenCalledWith('biases', 'wikipedia', 'en', expect.objectContaining({ id: '2' }));
    expect(c.go).toHaveBeenCalledWith({ kind: 'sub', sub: 'biases' });
  });

  it('add refuses an unknown id with the way to find one, a library not read, and a running job', async () => {
    await expect(H(ctx()).add({ topic: 'biases', source: 'wikipedia', entryId: '9' })).rejects.toThrow(/^NO_TEXT: no text named "9"; texts: Anchoring, Framing effect, Halo effect/);
    const unread = ctx({ libStatus: { kind: 'loading' } });
    await expect(H(unread).add({ topic: 'biases', source: 'wikipedia', entryId: '2' })).rejects.toThrow(/^NOT_READY/);
    expect(unread.addOne).not.toHaveBeenCalled();
    const broken = ctx({ libStatus: { kind: 'error', why: 'EIO' } });
    await expect(H(broken).add({ topic: 'biases', source: 'wikipedia', entryId: '2' })).rejects.toThrow(/^NOT_READY: .*EIO/);
    const busy = ctx({ job: { kind: 'one', key: 'x', startedAt: 0, title: 't' } });
    await expect(H(busy).add({ topic: 'biases', source: 'wikipedia', entryId: '2' })).rejects.toThrow(/^BUSY/);
    expect(busy.addOne).not.toHaveBeenCalled();
  });

  it('addAll starts the run with what is left, and refuses when nothing is', () => {
    const c = ctx();
    expect(H(c).addAll({ topic: 'biases', source: 'wikipedia' })).toMatchObject({ started: true, todo: 2 });
    expect(c.addAll).toHaveBeenCalledWith('biases', 'wikipedia', 'en');
    const full = ctx({ lib: lib(['1', '2', '3']) });
    expect(() => H(full).addAll({ topic: 'biases', source: 'wikipedia' })).toThrow(/^NOTHING_LEFT/);
    expect(full.addAll).not.toHaveBeenCalled();
  });

  it('openTopic refuses during an import; stop stops only what runs', () => {
    const busy = ctx({ job: { kind: 'all', key: 'x', startedAt: 0, done: 0, todo: 1 } });
    expect(() => H(busy).openTopic({ topic: 'neuro' })).toThrow(/^BUSY/);
    expect(H(busy).stop()).toMatchObject({ stopped: true });
    expect(busy.stop).toHaveBeenCalled();
    const idle = ctx();
    expect(H(idle).stop()).toMatchObject({ stopped: false });
    expect(idle.stop).not.toHaveBeenCalled();
    expect(H(idle).openTopic({ topic: 'neuro' })).toEqual({ shown: 'neuro' });
  });
});

describe('by voice: titles as the person says them, and what is on screen (doc 149 §19)', () => {
  const onScreen = (over: Partial<MindAgentContext> = {}) => ctx({ view: { kind: 'sub', sub: 'biases' }, lib: lib([]), ...over });

  it('add takes a title said in another word order, with no topic or source: the list on screen', async () => {
    const c = onScreen();
    c.addOne = vi.fn(async () => { c.lib = lib(['3']); });
    await expect(H(c).add({ entryId: "l'effet de halo" })).resolves.toEqual({ id: '3', title: 'Halo effect', outcome: 'in memory' });
    expect(c.addOne).toHaveBeenCalledWith('biases', 'wikipedia', 'en', expect.objectContaining({ id: '3' }));
  });

  it('add refuses a title that names several texts, with their titles, and adds nothing', async () => {
    const c = onScreen();
    await expect(H(c).add({ entryId: 'effect' })).rejects.toThrow(/^NO_TEXT/);
    const two = onScreen({ lists: { 'biases|wikipedia|en': { kind: 'ready', listing: { entries: [entry('1', 'Halo effect'), entry('2', 'Reverse halo effect')] } } } });
    // A title said whole wins over the titles that only hold its words.
    two.addOne = vi.fn(async () => { two.lib = lib(['1']); });
    await expect(H(two).add({ entryId: 'halo' })).resolves.toMatchObject({ id: '1' });
    const three = onScreen({ lists: { 'biases|wikipedia|en': { kind: 'ready', listing: { entries: [entry('2', 'Reverse halo effect'), entry('4', 'Horn and halo'), entry('5', 'Halo (iconography)')] } } } });
    await expect(H(three).add({ entryId: 'halo' })).rejects.toThrow('AMBIGUOUS: "halo" names several texts: Reverse halo effect, Horn and halo, Halo (iconography); say which');
    expect(three.addOne).not.toHaveBeenCalled();
  });

  it('OpenStax titles that repeat are told apart by their chapter', async () => {
    const os = (id: string, title: string, chapter: string) => ({ key: `openstax|en|${id}`, id, source: 'openstax' as const, lang: 'en', title, chapter });
    const c = onScreen({ lists: { 'memory|openstax|en': { kind: 'ready', listing: { entries: [os('m1', 'Introduction', 'Memory'), os('m2', 'Introduction', 'Learning')] } } }, view: { kind: 'sub', sub: 'memory' } });
    await expect(H(c).add({ entryId: 'introduction' })).rejects.toThrow(/^AMBIGUOUS: .*Introduction [(]Memory[)], Introduction [(]Learning[)]/);
    c.addOne = vi.fn(async () => { c.lib = { folder: null, batches: [{ key: 'memory|openstax|en', sub: 'memory', source: 'openstax', lang: 'en', ids: ['m2'], failed: [], refused: [], total: 2, lastAt: null }] }; });
    await expect(H(c).add({ entryId: 'introduction learning' })).resolves.toMatchObject({ id: 'm2', outcome: 'in memory' });
  });

  it('a write that did not reach memory is refused, never reported done', async () => {
    const c = onScreen();
    await expect(H(c).add({ entryId: 'Anchoring' })).rejects.toThrow('WRITE_FAILED: "Anchoring" was not added; the reason is on the person\'s screen');
    const refused = onScreen();
    refused.addOne = vi.fn(async () => { refused.lib = lib([], ['1']); });
    await expect(H(refused).add({ entryId: 'anchoring' })).rejects.toThrow(/^WRITE_FAILED: "Anchoring" was refused by the source/);
  });

  it('the list on screen fills a missing source; several open lists are refused by name, none says how to open one', () => {
    expect(H(onScreen()).entries({ query: 'éffect HALO' }).entries).toEqual([{ id: '3', title: 'Halo effect', state: 'not added' }]);
    const both = onScreen({ lists: { 'biases|wikipedia|en': listed, 'biases|openstax|en': listed } });
    expect(() => H(both).entries({})).toThrow('AMBIGUOUS: several lists of biases are open: wikipedia, openstax; say which source');
    expect(H(both).entries({ source: 'openstax' }).source).toBe('biases|openstax|en');
    expect(() => H(onScreen({ lists: {} })).addAll({})).toThrow(/^NO_LIST: no list of biases is open; call listSource/);
    expect(() => H(ctx()).entries({})).toThrow(/^NO_LIST: no topic is on screen/);
  });

  it('listSource takes the topic on screen', async () => {
    const c = onScreen();
    await H(c).listSource({ source: 'wikipedia' });
    expect(c.openList).toHaveBeenCalledWith('biases', 'wikipedia', 'en');
  });

  it('goHome is the Back link: refused during an import, stops nothing itself during a list', () => {
    const c = onScreen();
    expect(H(c).goHome()).toEqual({ shown: 'home' });
    expect(c.go).toHaveBeenCalledWith({ kind: 'home' });
    const busy = onScreen({ job: { kind: 'all', key: 'x', startedAt: 0, done: 0, todo: 1 } });
    expect(() => H(busy).goHome()).toThrow(/^BUSY/);
    expect(busy.go).not.toHaveBeenCalled();
    const listing = onScreen({ job: { kind: 'list', key: 'x', startedAt: 0, n: 0 } });
    H(listing).goHome();
    expect(listing.go).toHaveBeenCalledWith({ kind: 'home' });
  });

  it('setLanguage is the language box: refused while anything runs', () => {
    const c = onScreen();
    expect(H(c).setLanguage({ lang: 'fr' })).toEqual({ wikipedia: 'fr' });
    expect(c.setWikiLang).toHaveBeenCalledWith('fr');
    expect(() => H(c).setLanguage({ lang: 'de' })).toThrow(/^BAD_ARG/);
    const busy = onScreen({ job: { kind: 'list', key: 'x', startedAt: 0, n: 0 } });
    expect(() => H(busy).setLanguage({ lang: 'fr' })).toThrow(/^BUSY/);
    expect(busy.setWikiLang).not.toHaveBeenCalled();
  });

  it('retryLibrary reads again only an unreadable library', () => {
    const ok = onScreen();
    expect(H(ok).retryLibrary()).toEqual({ retried: false, library: 'read' });
    expect(ok.retryLibrary).not.toHaveBeenCalled();
    const broken = onScreen({ libStatus: { kind: 'error', why: 'EIO' } });
    expect(H(broken).retryLibrary()).toMatchObject({ retried: true });
    expect(broken.retryLibrary).toHaveBeenCalled();
  });
});
