/**
 * net — the two ways MnemoMind reaches a source.
 *
 *  - A source that answers with CORS `*` (Wikipedia, raw.githubusercontent.com)
 *    is fetched straight from the cartridge, with a deadline (rule 9).
 *  - A source without CORS (NIMH, GitHub's commit feeds) goes through the
 *    host action `social.fetch` (permission `vault:read`, HTTPS only, 4 MB,
 *    12 s on the host side). Its reply is checked here: a `truncated` body is
 *    a PREFIX and is refused, never parsed as if it were the whole page.
 *
 * Both are injected into the readers as plain functions, so every reader is
 * tested on a recorded response with no network and no bridge.
 */

/** A text fetch with an abort signal: the readers' only door to a CORS source. */
export type FetchText = (url: string, signal?: AbortSignal, headers?: Record<string, string>) => Promise<string>;

/** What the host's `social.fetch` answers in `data` (apps/infinity-edition socialHandlers.ts). */
export interface HostFetchReply {
  status: number;
  body: string;
  encoding: 'utf8' | 'base64';
  truncated: boolean;
  contentType?: string | null;
}

/** The host fetch as the readers see it. It throws on a host refusal (permission, non-2xx, timeout). */
export type HostFetch = (url: string, signal?: AbortSignal) => Promise<HostFetchReply>;

/** Per-request deadline for a direct fetch: a Wikipedia page or a CNXML module is well under 1 MB. */
export const DIRECT_TIMEOUT_MS = 15_000;
/** The host gives up at 12 s (FETCH_TIMEOUT); the bridge waits a little longer so the host's own error arrives first. */
export const HOST_TIMEOUT_MS = 20_000;

/** A GET with a deadline. A non-2xx is an error carrying its status, never an empty text. */
export const fetchText: FetchText = async (url, signal, headers) => {
  const deadline = AbortSignal.timeout(DIRECT_TIMEOUT_MS);
  const res = await fetch(url, { signal: signal ? AbortSignal.any([signal, deadline]) : deadline, ...(headers ? { headers } : {}) });
  if (!res.ok) throw new HttpError(res.status, parseRetryAfter(res.headers.get('retry-after')));
  return res.text();
};

/** A non-2xx answer, with the server's Retry-After when it sent one (a 429 or a 503). */
export class HttpError extends Error {
  constructor(public readonly status: number, public readonly retryAfterMs: number | null = null) {
    super(`HTTP_${status}`);
    this.name = 'HttpError';
  }
}

/** Longest wait a Retry-After may impose before the run gives up instead (2 minutes). */
export const MAX_RETRY_AFTER_MS = 120_000;

/**
 * `Retry-After` in seconds or as an HTTP date, in milliseconds. Absent or
 * unreadable = null (the default backoff applies); above the cap = null too,
 * so the retry gives up rather than freezing the run for an hour.
 */
export function parseRetryAfter(value: string | null, now = Date.now()): number | null {
  if (!value) return null;
  const v = value.trim();
  const ms = /^\d+$/.test(v) ? Number(v) * 1000 : Date.parse(v) - now;
  if (!Number.isFinite(ms) || ms < 0) return null;
  return ms <= MAX_RETRY_AFTER_MS ? ms : null;
}

/**
 * The body of a host fetch as text, or an error that says why not. A cut body
 * (`truncated`), a binary body (`base64`) and a non-2xx status are refused.
 */
export async function hostText(hostFetch: HostFetch, url: string, signal?: AbortSignal): Promise<string> {
  const reply = await hostFetch(url, signal);
  if (!reply || typeof reply !== 'object') throw new Error('HOST_FETCH_NO_REPLY');
  if (reply.status < 200 || reply.status >= 300) throw new Error(`HTTP_${reply.status}`);
  if (reply.truncated) throw new Error('HOST_FETCH_TRUNCATED');
  if (reply.encoding !== 'utf8') throw new Error('HOST_FETCH_NOT_TEXT');
  if (typeof reply.body !== 'string') throw new Error('HOST_FETCH_NO_BODY');
  return reply.body;
}

/** Waits, or rejects at once when the signal fires: the pause between two requests of a long run. */
export function pause(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
    const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
    const onAbort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Errors worth another try: rate limits, server errors, a network blip, and a
 * page that missed its deadline (`AbortSignal.timeout` rejects with a
 * TimeoutError): one slow page must not end "add everything".
 */
const RETRYABLE = /^(HTTP_(429|5\d\d)|TypeError|TimeoutError|Failed to fetch|NetworkError|network)/i;
const RETRY_WAIT_MS = [2_000, 6_000];

/** The error as one line, its name first when the name carries the meaning (TypeError, TimeoutError). */
export function errText(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    const name = String((err as { name?: unknown }).name ?? '');
    const msg = String((err as { message?: unknown }).message ?? '');
    return name === 'TypeError' || name === 'TimeoutError' ? `${name} ${msg}` : msg;
  }
  return String(err);
}

/** Runs `call`, trying again twice (2 s, then 6 s) on a rate limit or a server error. Any other failure is thrown at once. */
export async function retrying<T>(call: () => Promise<T>, signal?: AbortSignal, wait = pause): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await call();
    } catch (err) {
      if (signal?.aborted || attempt >= RETRY_WAIT_MS.length || !RETRYABLE.test(errText(err))) throw err;
      console.warn('[mnemo-mind] request failed, retrying', errText(err));
      const told = err instanceof HttpError ? err.retryAfterMs : null;
      await wait(told ?? RETRY_WAIT_MS[attempt]!, signal);
    }
  }
}
