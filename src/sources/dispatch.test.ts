import { describe, it, expect } from 'vitest';
import collection from '../fixtures/openstax-collection.xml?raw';
import { listSource, readerFor } from './dispatch';
import { OPENSTAX_COLLECTION_URL } from './sourceInfo';

describe('dispatch', () => {
  it('reads OpenStax directly (CORS *), never through the host', async () => {
    const asked: string[] = [];
    const res = await listSource({ fetchText: async (url) => { asked.push(url); return collection; }, hostFetch: null }, 'neuro', 'openstax', 'en');
    expect(asked).toEqual([OPENSTAX_COLLECTION_URL]);
    expect(res.entries).toHaveLength(20);
    expect(res.plan?.licence).toBeTruthy();
  });

  it('NIMH without a host is an error that says so', async () => {
    await expect(listSource({ fetchText: async () => '', hostFetch: null }, 'disorders', 'nimh', 'en')).rejects.toThrow('NO_HOST');
    await expect(readerFor({ fetchText: async () => '', hostFetch: null }, 'nimh', 'en', null)({ key: 'k', id: '/health/topics/x', source: 'nimh', lang: 'en', title: 'x' })).rejects.toThrow('NO_HOST');
  });

  it('a Wikipedia language the cartridge does not offer is refused, not read as English', async () => {
    await expect(listSource({ fetchText: async () => '', hostFetch: null }, 'biases', 'wikipedia', 'de')).rejects.toThrow('WIKI_LANG_NOT_OFFERED');
  });

  it('an OpenStax module cannot be read before its plan (and its licence) was', async () => {
    await expect(readerFor({ fetchText: async () => '', hostFetch: null }, 'openstax', 'en', null)({ key: 'k', id: 'm1', source: 'openstax', lang: 'en', title: 'x' })).rejects.toThrow('OPENSTAX_PLAN_NOT_READ');
  });
});
