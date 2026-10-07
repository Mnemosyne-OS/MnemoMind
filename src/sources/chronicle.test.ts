import { describe, it, expect } from 'vitest';
import extractEs from '../fixtures/wiki-extract-es.json?raw';
import { PART_CHARS, chronicles, packSections, sourceLine, splitText } from './chronicle';
import { parsePage } from './wikipedia';
import type { SourceDoc } from './entry';
import { NIMH_LICENCE, OPENSTAX_LICENCE, WIKIPEDIA_LICENCE } from './sourceInfo';

const base = (over: Partial<SourceDoc>): SourceDoc => ({
  source: 'wikipedia', lang: 'en', title: 'Anchoring effect', url: 'https://example.org/x', date: null,
  dateKind: 'revision', licence: WIKIPEDIA_LICENCE, sections: [{ heading: null, level: 0, text: 'Body.' }], ...over,
});

describe('the source line', () => {
  it('Wikipedia: revision, timestamp, licence verbatim, address', () => {
    const line = sourceLine(base({ revid: 42, date: '2026-09-30T11:04:15Z' }));
    expect(line).toBe(`Source: Wikipedia (en), article "Anchoring effect", revision 42 of 2026-09-30T11:04:15Z. Licence: ${WIKIPEDIA_LICENCE}. Check: https://example.org/x`);
  });

  it('a date the source did not give stays ABSENT: no "of", no placeholder, no today', () => {
    const today = new Date().toISOString().slice(0, 10);
    for (const doc of [
      base({}),
      base({ source: 'openstax', licence: OPENSTAX_LICENCE, dateKind: 'commit', chapter: '8. Memory' }),
      base({ source: 'nimh', licence: NIMH_LICENCE, dateKind: 'reviewed' }),
    ]) {
      const line = sourceLine(doc, { id: 'm1' });
      expect(line).not.toMatch(/ of \d|Last commit|Last Reviewed|undefined|null|NaN/);
      expect(line).not.toContain(today);
      expect(line).toContain(`Licence: ${doc.licence}.`);
    }
  });

  it('OpenStax names the book, the chapter, the module and the commit date; NIMH its review month', () => {
    expect(sourceLine(base({ source: 'openstax', licence: OPENSTAX_LICENCE, title: 'How Memory Functions', chapter: '8. Memory', date: '2023-11-21T16:28:04Z' }), { id: 'm82258' }))
      .toContain('chapter "8. Memory", module m82258 "How Memory Functions". Last commit touching the module: 2023-11-21T16:28:04Z.');
    expect(sourceLine(base({ source: 'nimh', title: 'Depression', licence: NIMH_LICENCE, date: 'December 2024' })))
      .toContain('"Depression". Last Reviewed: December 2024.');
  });
});

describe('cutting into memories', () => {
  it('a long page (Sesgo de confirmación, 47 921 characters) becomes several parts, each closed by its source line', () => {
    const doc = parsePage(JSON.parse(extractEs) as Record<string, unknown>, 'es');
    const bodies = chronicles(doc);
    expect(bodies.length).toBeGreaterThanOrEqual(3);
    const line = sourceLine(doc);
    bodies.forEach((b, i) => {
      expect(b.startsWith(`# Wikipedia (es) · Sesgo de confirmación (part ${i + 1}/${bodies.length})`)).toBe(true);
      expect(b.endsWith(line)).toBe(true);
      // Under the host's 50 000-character cut, with room for the title and the line.
      expect(b.length).toBeLessThan(PART_CHARS + 1_000);
    });
    // Every section heading made it into some part.
    const all = bodies.join('\n');
    for (const s of doc.sections) if (s.heading) expect(all).toContain(s.heading);
  });

  it('a short text is one memory without a part number', () => {
    const bodies = chronicles(base({ revid: 1, date: '2026-01-01T00:00:00Z' }));
    expect(bodies).toHaveLength(1);
    expect(bodies[0]!.startsWith('# Wikipedia (en) · Anchoring effect\n')).toBe(true);
  });

  it('nothing is lost when a section is longer than a part', () => {
    const text = Array.from({ length: 4000 }, (_, i) => `word${i}`).join(' ');
    const parts = packSections([{ heading: 'Long', level: 2, text }], 5_000);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((p) => p.length <= 5_000)).toBe(true);
    expect(parts.join(' ').replace(/\s+/g, ' ')).toContain('word0 ');
    expect(parts.join(' ')).toContain('word3999');
    expect(splitText('a b', 10)).toEqual(['a b']);
  });
});
