import { describe, it, expect } from 'vitest';
import topics from '../fixtures/nimh-topics.html?raw';
import depression from '../fixtures/nimh-depression.html?raw';
import depressionPub from '../fixtures/nimh-pub-depression.html?raw';
import anxietyHub from '../fixtures/nimh-anxiety-disorders.html?raw';
import { lastReviewed, listTopics, parsePublication, parseTopicIndex, parseTopicPage, publicationUrl, readTopic } from './nimh';
import { sourceLine } from './chronicle';
import { hostText, type HostFetch, type HostFetchReply } from './net';
import { NIMH_LICENCE } from './sourceInfo';

const reply = (body: string, extra: Partial<HostFetchReply> = {}): HostFetch => async () => ({ status: 200, body, encoding: 'utf8', truncated: false, ...extra });

describe('NIMH topic index (recorded page of 2026-10-04)', () => {
  it('lists the 25 English topics of the article, each once, the Spanish pages left out', () => {
    const list = parseTopicIndex(topics);
    expect(list).toHaveLength(25);
    expect(list[0]).toMatchObject({ id: '/health/topics/anxiety-disorders', title: 'Anxiety Disorders', source: 'nimh', lang: 'en' });
    expect(list.some((e) => e.id.includes('espanol'))).toBe(false);
    expect(new Set(list.map((e) => e.id)).size).toBe(25);
    expect(list.every((e) => e.id.startsWith('/health/topics/'))).toBe(true);
  });

  it('a page without the article is refused, never read as an empty list', () => {
    expect(() => parseTopicIndex('<html><body>Access denied</body></html>')).toThrow('NIMH_INDEX_UNREADABLE');
  });
});

describe('NIMH topic page', () => {
  it('reads the text, the headings and "Last Reviewed" as written; no CSS gets in', () => {
    const page = parseTopicPage(depression);
    expect(page.title).toBe('Depression');
    expect(page.reviewed).toBe('December 2024');
    const heads = page.sections.map((s) => s.heading);
    expect(heads).toContain('What is depression?');
    const all = page.sections.map((s) => s.text).join('\n');
    expect(all).toContain('Everyone feels sad or low sometimes');
    expect(all).not.toContain('display:flex');
    expect(all).not.toContain('.onpage-nav');
    // The page's own table of contents is navigation, not text.
    expect(all).not.toContain('On this page');
    expect(all).not.toContain('Last Reviewed');
  });

  it('a page that does not say when it was reviewed has no date', () => {
    expect(lastReviewed(depression.replace(/Last Reviewed/g, 'Reviewed'))).toBeNull();
  });
});

/** A host that serves recorded pages by address, and 404 for anything else. */
function site(pages: Record<string, string>): { fetch: HostFetch; asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    fetch: async (url) => {
      asked.push(url);
      const body = pages[url];
      return body === undefined ? { status: 404, body: '', encoding: 'utf8', truncated: false } : { status: 200, body, encoding: 'utf8', truncated: false };
    },
  };
}

const NAV = ['Digital shareables', 'Share outreach materials', 'Where can I learn more', 'Find help and support', 'Additional federal resources', 'Why is NIMH studying', 'Reprints', 'For more information'];

describe('NIMH: a topic page is a hub, the text is in its publication', () => {
  it('the publication of a topic lives at the same slug', () => {
    expect(publicationUrl('/health/topics/depression')).toBe('https://www.nimh.nih.gov/health/publications/depression');
    expect(publicationUrl('/health/topics/brain-stimulation-therapies/brain-stimulation-therapies')).toBe('https://www.nimh.nih.gov/health/publications/brain-stimulation-therapies');
  });

  it('the publication (recorded 2026-10-04) carries the real text and its revision, its navigation left out', () => {
    const pub = parsePublication(depressionPub);
    const heads = pub.sections.map((s) => s.heading);
    expect(heads).toContain('What are the signs and symptoms of depression?');
    expect(heads).toContain('How is depression treated?');
    expect(heads).toContain('Psychotherapy');
    for (const n of NAV) expect(heads.some((h) => h?.startsWith(n))).toBe(false);
    expect(pub.revised).toBe('2024');
    expect(pub.number).toBe('24-MH-8079');
  });

  it('a topic with a publication = the hub definition + the publication text, no navigation, both dates in the line', async () => {
    const { fetch } = site({
      'https://www.nimh.nih.gov/health/topics/depression': depression,
      'https://www.nimh.nih.gov/health/publications/depression': depressionPub,
    });
    const doc = await readTopic(fetch, { id: '/health/topics/depression' });
    expect(doc).toMatchObject({ source: 'nimh', title: 'Depression', date: 'December 2024', dateKind: 'reviewed', licence: NIMH_LICENCE, url: 'https://www.nimh.nih.gov/health/topics/depression' });
    expect(doc.sections[0]!.heading).toBe('What is depression? (topic page)');
    const all = doc.sections.map((s) => `${s.heading ?? ''}\n${s.text}`).join('\n');
    for (const n of NAV) expect(all).not.toContain(n);
    expect(all).toContain('How is depression diagnosed?');
    expect(all).not.toContain('Download PDF');
    expect(all).not.toContain('En español');
    expect(doc.nimhPublication).toMatchObject({ title: 'Depression', url: 'https://www.nimh.nih.gov/health/publications/depression', revised: '2024', number: '24-MH-8079' });
    const line = sourceLine(doc);
    expect(line).toContain('(Last Reviewed: December 2024)');
    expect(line).toContain('(NIH Publication No. 24-MH-8079, Revised 2024)');
    expect(line).toContain('and https://www.nimh.nih.gov/health/publications/depression');
  });

  it('a topic without a publication keeps the hub text minus navigation, and its memory SAYS no publication was found', async () => {
    const { fetch, asked } = site({ 'https://www.nimh.nih.gov/health/topics/anxiety-disorders': anxietyHub });
    const doc = await readTopic(fetch, { id: '/health/topics/anxiety-disorders' });
    expect(asked).toContain('https://www.nimh.nih.gov/health/publications/anxiety-disorders');
    expect(doc.nimhPublication).toBeNull();
    expect(doc.sections.map((s) => s.heading)).toEqual(['What is anxiety?']);
    expect(sourceLine(doc)).toContain('No NIMH publication was found for this topic');
  });

  it('a publication that fails for another reason than 404 fails the entry, never "no publication"', async () => {
    const hub: HostFetch = async (url) => {
      if (url.endsWith('/topics/depression')) return { status: 200, body: depression, encoding: 'utf8', truncated: false };
      throw new Error('FETCH_TIMEOUT');
    };
    await expect(readTopic(hub, { id: '/health/topics/depression' })).rejects.toThrow('FETCH_TIMEOUT');
  });
});

describe('NIMH through the host', () => {

  it('a truncated body is refused: a prefix is never a page', async () => {
    await expect(readTopic(reply(depression.slice(0, 50_000), { truncated: true }), { id: '/health/topics/depression' })).rejects.toThrow('HOST_FETCH_TRUNCATED');
    await expect(listTopics(reply(topics, { truncated: true }))).rejects.toThrow('HOST_FETCH_TRUNCATED');
  });

  it('a binary body, a non-2xx and a host refusal are errors that say which', async () => {
    await expect(hostText(reply('AAAA', { encoding: 'base64' }), 'https://x')).rejects.toThrow('HOST_FETCH_NOT_TEXT');
    await expect(hostText(reply('', { status: 404 }), 'https://x')).rejects.toThrow('HTTP_404');
    const refused: HostFetch = async () => { throw new Error('PERMISSION_DENIED: vault:read'); };
    await expect(listTopics(refused)).rejects.toThrow('PERMISSION_DENIED');
  });

  it('never asks the host for an address outside the topics', async () => {
    await expect(readTopic(reply(depression), { id: '/site-info/whatever' })).rejects.toThrow('NIMH_NOT_A_TOPIC');
  });
});
