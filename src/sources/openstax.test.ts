import { describe, it, expect, vi } from 'vitest';
import collection from '../fixtures/openstax-collection.xml?raw';
import intro from '../fixtures/openstax-m82161.cnxml?raw';
import whatIs from '../fixtures/openstax-m82162.cnxml?raw';
import atom from '../fixtures/openstax-m82161.atom?raw';
import { SHIPPED_TITLES, parseAtomUpdated, parseCollection, parseModule, planEntries, readModule } from './openstax';
import { OPENSTAX_CHAPTERS, OPENSTAX_MEASURED_BY_SUB, SUBDOMAINS } from './catalogue';
import { OPENSTAX_LICENCE } from './sourceInfo';
import type { HostFetch } from './net';

describe('OpenStax plan (recorded collection of 2026-10-04)', () => {
  const plan = parseCollection(collection);

  it('reads the licence verbatim, with its address', () => {
    expect(plan.licence).toBe(OPENSTAX_LICENCE);
    expect(plan.licenceUrl).toBe('http://creativecommons.org/licenses/by-nc-sa/4.0/');
  });

  it('reads 16 chapters and 105 modules, the Preface outside any chapter', () => {
    expect(plan.chapters).toHaveLength(16);
    expect(plan.loose).toEqual(['m82103']);
    expect(plan.chapters.reduce((n, c) => n + c.modules.length, 0) + plan.loose.length).toBe(105);
    expect(plan.chapters[7]).toMatchObject({ number: 8, title: 'Memory' });
  });

  it('every chapter is offered by exactly one sub-domain, and the counts shown match the plan', () => {
    const offered = SUBDOMAINS.flatMap((s) => OPENSTAX_CHAPTERS[s]);
    expect([...offered].sort()).toEqual(plan.chapters.map((c) => c.title).sort());
    for (const sub of SUBDOMAINS) expect(planEntries(plan, OPENSTAX_CHAPTERS[sub]), sub).toHaveLength(OPENSTAX_MEASURED_BY_SUB[sub]);
  });

  it('lists a sub-domain\'s modules with their chapter and the shipped title', () => {
    const entries = planEntries(plan, OPENSTAX_CHAPTERS.memory);
    expect(entries[0]).toMatchObject({ key: 'openstax|en|' + entries[0]!.id, source: 'openstax', lang: 'en', chapter: '6. Learning' });
    expect(entries.every((e) => !e.title.includes('(module'))).toBe(true);
    expect(Object.keys(SHIPPED_TITLES)).toHaveLength(105);
  });

  it('a module the shipped map does not know is listed by its id, never dropped', () => {
    const entries = planEntries({ licence: 'x', licenceUrl: null, loose: [], chapters: [{ number: 1, title: 'Memory', modules: ['m99999'] }] }, ['Memory']);
    expect(entries[0]!.title).toBe('1.0 (module m99999)');
  });

  it('a collection without md:license yields licence null (and a module import is then refused)', async () => {
    const bare = parseCollection(collection.replace(/<md:license[^>]*>[^<]*<\/md:license>/, ''));
    expect(bare.licence).toBeNull();
    await expect(readModule({ fetchText: async () => whatIs, hostFetch: null }, { id: 'm82162' }, bare)).rejects.toThrow('OPENSTAX_NO_LICENCE');
  });
});

describe('OpenStax module text', () => {
  it('keeps the title, the sections, the summary and the glossary; leaves the quiz out', () => {
    const m = parseModule(whatIs);
    expect(m.title).toBe('What Is Psychology?');
    const heads = m.sections.map((s) => s.heading);
    expect(heads).toContain('WHY STUDY PSYCHOLOGY?');
    expect(heads).toContain('Summary');
    expect(heads).toContain('Glossary');
    expect(heads).not.toContain('Review Questions');
    expect(heads).not.toContain('Critical Thinking Questions');
    const all = m.sections.map((s) => s.text).join('\n');
    expect(all).toContain('psychology: scientific study of the mind and behavior');
    expect(all).not.toContain('Why are you taking this course?');
  });

  it('a cross-reference with no words leaves no empty brackets behind', () => {
    const xml = '<document xmlns="http://cnx.rice.edu/cnxml"><title>T</title><content><para id="p">Memory works over time (<link target-id="Figure_08_01_01"/>). Next <link target-id="x"/>, then.</para></content></document>';
    expect(parseModule(xml).sections[0]!.text).toBe('Memory works over time. Next, then.');
  });

  it('leaves figures out: no photo credit enters memory', () => {
    const all = parseModule(intro).sections.map((s) => s.text).join('\n');
    expect(all).toContain('Clive Wearing is an accomplished musician');
    expect(all).not.toContain('credit "background"');
  });

  it('reads the newest commit date of the feed; anything unreadable is null', () => {
    expect(parseAtomUpdated(atom)).toBe('2023-11-21T16:28:04Z');
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(parseAtomUpdated('<html>not a feed')).toBeNull();
    expect(parseAtomUpdated('<feed xmlns="http://www.w3.org/2005/Atom"><updated>soon</updated></feed>')).toBeNull();
  });
});

describe('OpenStax module read', () => {
  const plan = parseCollection(collection);
  const ok: HostFetch = async () => ({ status: 200, body: atom, encoding: 'utf8', truncated: false });

  it('carries the live licence, the chapter and the commit date read through the host', async () => {
    const doc = await readModule({ fetchText: async () => whatIs, hostFetch: ok }, { id: 'm82162', chapter: '1. Introduction to Psychology' }, plan);
    expect(doc).toMatchObject({ source: 'openstax', title: 'What Is Psychology?', date: '2023-11-21T16:28:04Z', dateKind: 'commit', licence: OPENSTAX_LICENCE, chapter: '1. Introduction to Psychology' });
    expect(doc.url).toBe('https://github.com/openstax/osbooks-psychology/blob/main/modules/m82162/index.cnxml');
  });

  it('a refused host (no permission), a cut feed or no host at all leave the date ABSENT, the text still read', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const refused: HostFetch = async () => { throw new Error('PERMISSION_DENIED: vault:read'); };
    const cut: HostFetch = async () => ({ status: 200, body: atom.slice(0, 300), encoding: 'utf8', truncated: true });
    for (const hostFetch of [refused, cut, null]) {
      const doc = await readModule({ fetchText: async () => whatIs, hostFetch }, { id: 'm82162' }, plan);
      expect(doc.date).toBeNull();
      expect(doc.sections.length).toBeGreaterThan(1);
    }
  });
});
