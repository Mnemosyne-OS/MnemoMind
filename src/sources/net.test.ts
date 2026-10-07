import { describe, it, expect, vi, afterEach } from 'vitest';
import { HttpError, MAX_RETRY_AFTER_MS, fetchText, parseRetryAfter, retrying } from './net';

afterEach(() => { vi.restoreAllMocks(); });

describe('retrying', () => {
  it('a page that missed its deadline (TimeoutError) is tried again, not the end of the run', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    let calls = 0;
    const waits: number[] = [];
    const out = await retrying(async () => {
      if (calls++ === 0) throw new DOMException('signal timed out', 'TimeoutError');
      return 'page';
    }, undefined, async (ms) => { waits.push(ms); });
    expect(out).toBe('page');
    expect(calls).toBe(2);
    expect(waits).toEqual([2_000]);
  });

  it('a 429 waits what the server said in Retry-After, not the default backoff', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const waits: number[] = [];
    let calls = 0;
    await retrying(async () => {
      if (calls++ === 0) throw new HttpError(429, 7_000);
      return 'ok';
    }, undefined, async (ms) => { waits.push(ms); });
    expect(waits).toEqual([7_000]);
  });

  it('an error that is not worth a retry is thrown at once: one call, no wait', async () => {
    let calls = 0;
    const wait = vi.fn(async () => undefined);
    await expect(retrying(async () => { calls++; throw new Error('PERMISSION_DENIED: vault:read'); }, undefined, wait)).rejects.toThrow('PERMISSION_DENIED');
    expect(calls).toBe(1);
    expect(wait).not.toHaveBeenCalled();
  });

  it('gives up after two retries and throws the last error', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    let calls = 0;
    await expect(retrying(async () => { calls++; throw new HttpError(503); }, undefined, async () => undefined)).rejects.toThrow('HTTP_503');
    expect(calls).toBe(3);
  });
});

describe('Retry-After', () => {
  it('reads seconds and an HTTP date; absent, unreadable or too long is null', () => {
    expect(parseRetryAfter('5')).toBe(5_000);
    expect(parseRetryAfter('Sun, 04 Oct 2026 10:00:30 GMT', Date.parse('Sun, 04 Oct 2026 10:00:00 GMT'))).toBe(30_000);
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter('soon')).toBeNull();
    expect(parseRetryAfter(String(MAX_RETRY_AFTER_MS / 1000 + 1))).toBeNull();
  });

  it('a direct fetch answering 429 carries the server\'s Retry-After', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('slow down', { status: 429, headers: { 'Retry-After': '3' } }));
    const err = await fetchText('https://en.wikipedia.org/w/api.php').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).message).toBe('HTTP_429');
    expect((err as HttpError).retryAfterMs).toBe(3_000);
  });
});
