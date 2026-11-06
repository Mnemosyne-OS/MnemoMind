import { describe, expect, it } from 'vitest';
import { findNamed, nameWords, type Named } from './agentFind';

const text = (id: string, title: string): Named<string> => ({ item: id, id, names: [title], label: title });
const TEXTS = [text('1', 'Halo effect'), text('2', 'Biais de confirmation'), text('3', 'Mémoire de travail'), text('4', 'Mémoire'), text('5', 'Reverse halo effect')];
const kind = { code: 'NO_TEXT', noun: 'text' };

describe('a text named the way a person says it', () => {
  it('folds case, accents, fillers, kind words and a plural', () => {
    expect(nameWords("l'Effet de HALO")).toEqual(['halo']);
    expect(nameWords('Confirmation bias')).toEqual(['confirmation']);
    expect(nameWords('les mémoires')).toEqual(['memoire']);
  });

  it('an id, the whole title, or every word of it, in either language order', () => {
    expect(findNamed(TEXTS, '2', kind)).toBe('2');
    expect(findNamed(TEXTS, "l'effet de halo", kind)).toBe('1');
    expect(findNamed(TEXTS, 'le biais de confirmation', kind)).toBe('2');
    // « Mémoire » is a whole title: it wins over the texts that hold the word.
    expect(findNamed(TEXTS, 'la mémoire', kind)).toBe('4');
    expect(findNamed(TEXTS, 'memoire travail', kind)).toBe('3');
  });

  it('several matches are refused with their titles, never the first taken', () => {
    expect(() => findNamed(TEXTS, 'reverse', kind)).not.toThrow();
    expect(() => findNamed([TEXTS[2]!, TEXTS[4]!, text('6', 'Travail de deuil')], 'travail', kind))
      .toThrow('AMBIGUOUS: "travail" names several texts: Mémoire de travail, Travail de deuil; say which');
  });

  it('no match is refused with the titles that exist', () => {
    expect(() => findNamed(TEXTS, 'dissonance', kind)).toThrow('NO_TEXT: no text named "dissonance"; texts: Halo effect, Biais de confirmation, Mémoire de travail, Mémoire, Reverse halo effect');
    expect(() => findNamed(TEXTS, '', kind)).toThrow(/^BAD_ARG/);
    expect(() => findNamed([], 'halo', kind)).toThrow('texts: none');
  });
});
