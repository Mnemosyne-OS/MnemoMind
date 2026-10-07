import { describe, it, expect } from 'vitest';
import categoryFr from '../fixtures/wiki-category-fr.json?raw';
import extractEn from '../fixtures/wiki-extract-en.json?raw';
import extractFr from '../fixtures/wiki-extract-fr.json?raw';
import extractEs from '../fixtures/wiki-extract-es.json?raw';
import redirectFr from '../fixtures/wiki-extract-redirect-fr.json?raw';
import rightsinfo from '../fixtures/wiki-rightsinfo.txt?raw';
import subcatsEs from '../fixtures/wiki-subcats-es.json?raw';
import forgetting from '../fixtures/wiki-extract-forgetting-curve-en.json?raw';
import { LIST_CAP, listCategory, normaliseExtract, parseExtract, parseMemberPages, parsePage, parseSubcats, readPage } from './wikipedia';
import { WIKIPEDIA_LICENCE } from './sourceInfo';
import { WIKI_ROOTS } from './catalogue';
import type { FetchText } from './net';

const json = (s: string) => JSON.parse(s) as Record<string, unknown>;
const extractOf = (s: string) => ((json(s).query as { pages: { extract: string }[] }).pages[0]!.extract);

describe('Wikipedia listing (recorded answers of 2026-10-04)', () => {
  it('reads the 50 pages of one answer, no redirect, article namespace only', () => {
    const pages = parseMemberPages(json(categoryFr));
    expect(pages).toHaveLength(50);
    expect(pages[0]).toMatchObject({ pageid: 78919, title: 'Biais cognitif' });
    expect(pages.every((p) => typeof p.length === 'number')).toBe(true);
  });

  it('drops a redirect and a page outside the article namespace', () => {
    const pages = parseMemberPages({ query: { pages: [
      { pageid: 1, ns: 0, title: 'Real' },
      { pageid: 2, ns: 0, title: 'Old name', redirect: true },
      { pageid: 3, ns: 2, title: 'Utilisateur:Draft' },
    ] } });
    expect(pages.map((p) => p.title)).toEqual(['Real']);
  });

  it('reads the sub-categories of the es disorders root, the excluded one among them', () => {
    const subs = parseSubcats(json(subcatsEs));
    expect(subs).toHaveLength(14);
    expect(subs).toContain('Categoría:Personas con trastornos mentales');
  });

  it('walks one level, skips the excluded sub-category, follows continuation, keeps each page once', async () => {
    const asked: string[] = [];
    const fetchText: FetchText = async (url) => {
      const u = new URL(url);
      asked.push(u.searchParams.get('gcmtitle') ?? u.searchParams.get('cmtitle') ?? '');
      expect(u.searchParams.get('origin')).toBe('*');
      if (u.searchParams.get('list') === 'categorymembers') return subcatsEs;
      const cat = u.searchParams.get('gcmtitle');
      if (cat === 'Categoría:Trastornos mentales' && !u.searchParams.get('gcmcontinue')) {
        return JSON.stringify({ continue: { gcmcontinue: 'next', continue: 'gcmcontinue||' }, query: { pages: [{ pageid: 1, ns: 0, title: 'Trastorno mental' }] } });
      }
      if (cat === 'Categoría:Trastornos mentales') return JSON.stringify({ query: { pages: [{ pageid: 2, ns: 0, title: 'Demencia' }] } });
      return JSON.stringify({ query: { pages: [{ pageid: 1, ns: 0, title: 'Trastorno mental' }, { pageid: 9, ns: 0, title: `Página de ${cat}` }] } });
    };
    const res = await listCategory(fetchText, 'es', WIKI_ROOTS.disorders.es);
    expect(res.categories).toHaveLength(14); // root + 13 (one excluded)
    expect(res.categories).not.toContain('Categoría:Personas con trastornos mentales');
    expect(asked).not.toContain('Categoría:Personas con trastornos mentales');
    expect(res.entries.filter((e) => e.id === '1')).toHaveLength(1);
    expect(res.entries.map((e) => e.title)).toContain('Demencia');
    expect(res.entries[0]!.key).toBe(`wikipedia|es|${res.entries[0]!.id}`);
  });

  it('a non-2xx is an error, never an empty list', async () => {
    const fetchText: FetchText = async () => { throw new Error('HTTP_403'); };
    await expect(listCategory(fetchText, 'en', WIKI_ROOTS.biases.en)).rejects.toThrow('HTTP_403');
  });
});

describe('Wikipedia page text', () => {
  it('en: link sections go, the text sections stay', () => {
    const heads = parseExtract(extractOf(extractEn), 'en').map((s) => s.heading);
    expect(heads[0]).toBeNull();
    expect(heads).toContain('Experimental findings');
    expect(heads).not.toContain('See also');
    expect(heads).not.toContain('References');
    expect(heads).not.toContain('External links');
  });

  it('fr: "Notes et références" and "Articles connexes" go', () => {
    const heads = parseExtract(extractOf(extractFr), 'fr').map((s) => s.heading);
    expect(heads).toContain('Études notables');
    expect(heads).not.toContain('Notes et références');
    expect(heads).not.toContain('Articles connexes');
  });

  it('es: the five link sections go, "Historia" and its sub-sections stay', () => {
    const secs = parseExtract(extractOf(extractEs), 'es');
    const heads = secs.map((s) => s.heading);
    for (const gone of ['Véase también', 'Notas', 'Referencias', 'Bibliografía', 'Enlaces externos']) expect(heads).not.toContain(gone);
    expect(heads).toContain('Historia');
    expect(heads).toContain('Investigaciones de Wason en pruebas de hipótesis');
    expect(secs.find((s) => s.heading === 'Historia')!.level).toBe(2);
  });

  it('a page reads with its revision, its date as given, and the address of that revision', () => {
    const doc = parsePage(json(extractEn), 'en');
    expect(doc.title).toBe('Anchoring effect');
    expect(doc.revid).toBe(1377655813);
    expect(doc.date).toBe('2026-09-30T11:04:15Z');
    expect(doc.url).toBe('https://en.wikipedia.org/w/index.php?title=Anchoring_effect&oldid=1377655813');
    expect(doc.licence).toBe(WIKIPEDIA_LICENCE);
  });

  it('a redirect read without following it has no text: refused, never put in memory empty', () => {
    expect(() => parsePage(json(redirectFr), 'fr')).toThrow('WIKI_PAGE_EMPTY');
  });

  it('a page without a revision keeps its date ABSENT', () => {
    const doc = parsePage({ query: { pages: [{ pageid: 1, title: 'X', extract: 'Some text.', canonicalurl: 'https://en.wikipedia.org/wiki/X' }] } }, 'en');
    expect(doc.date).toBeNull();
    expect(doc.revid).toBeUndefined();
    expect(doc.url).toBe('https://en.wikipedia.org/wiki/X');
  });

  it('the licence constant is what the API says on en, fr and es', () => {
    const lines = rightsinfo.trim().split('\n').map((l) => (JSON.parse(l) as { query: { rightsinfo: { text: string } } }).query.rightsinfo.text);
    expect(lines).toEqual([WIKIPEDIA_LICENCE, WIKIPEDIA_LICENCE, WIKIPEDIA_LICENCE]);
  });
});

describe('Wikipedia text clean-up (recorded "Forgetting curve", en, category Memory)', () => {
  const raw = extractOf(forgetting);

  it('the raw text really holds lines of spaces and formula columns (the fixture shows the defect)', () => {
    expect(/\n[ \t]+\n/.test(raw)).toBe(true);
    expect(raw).toContain(String.raw`{\displaystyle b}`);
  });

  it('a line of spaces counts as empty and there is never more than one empty line in a row', () => {
    const text = normaliseExtract(raw);
    expect(/\n[ \t]+\n/.test(text)).toBe(false);
    expect(/[ \t]+\n/.test(text)).toBe(false);
    expect(text).not.toContain('\n\n\n');
  });

  it('lines of spaces outside any formula collapse too', () => {
    expect(normaliseExtract('text\n  \n    \nmore   \n   \n\n\nend')).toBe('text\n\nmore\n\nend');
  });

  it('a formula becomes its LaTeX, never a hole nor a column of symbols', () => {
    const text = normaliseExtract(raw);
    expect(text).toContain(String.raw`$b={\frac {100k}{(\log(t))^{c}+k}}$`);
    expect(text).toContain('Here, $b$ represents');
    expect(text).not.toContain(String.raw`\displaystyle`);
    const all = parseExtract(raw, 'en').map((s) => s.text).join('\n');
    expect(all).toContain(String.raw`$R=e^{-{\frac {t}{S}}},$`);
  });
});

describe('Wikipedia requests', () => {
  it('a page is asked with redirects=1, by its id, from origin *', async () => {
    let asked = '';
    await readPage(async (url) => { asked = url; return extractEn; }, 'en', '751106');
    const u = new URL(asked);
    expect(u.searchParams.get('redirects')).toBe('1');
    expect(u.searchParams.get('pageids')).toBe('751106');
    expect(u.searchParams.get('origin')).toBe('*');
  });

  it('a listing past LIST_CAP stops, keeps LIST_CAP entries, and says it was capped', async () => {
    const many = Array.from({ length: LIST_CAP + 5 }, (_, i) => ({ pageid: i + 1, ns: 0, title: `P${i}` }));
    const res = await listCategory(async () => JSON.stringify({ query: { pages: many } }), 'en', WIKI_ROOTS.biases.en);
    expect(res.capped).toBe(true);
    expect(res.entries).toHaveLength(LIST_CAP);
  });

  it('a listing under the cap is not marked capped', async () => {
    const res = await listCategory(async () => JSON.stringify({ query: { pages: [{ pageid: 1, ns: 0, title: 'A' }] } }), 'en', WIKI_ROOTS.biases.en);
    expect(res.capped).toBe(false);
  });
});
