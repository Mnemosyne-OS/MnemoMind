/**
 * library — what the person put in memory, where it lives, and how it gets there.
 *
 * Two copies, two jobs (same as MnemoLaw, doc 134 §3.3):
 *  - one JSON file per entry in the app's folder under the knowledge root
 *    (the host answers it with `vault.pack.ensure`; the person is never asked
 *    for a folder), filed by sub-domain and source, next to an ATTRIBUTION.md
 *    (CC BY-SA wants the attribution where the text lives);
 *  - one chronicle per part in the topic's Memory Pack vault, each closed by
 *    its source line: what the chat reads once the person ticks the topic
 *    under Knowledge in its scope.
 *
 * The small index rides in the cartridge's durable state (doc 73, 256 KB):
 * ONE record per (sub-domain, source, language), never one per page, holding
 * the ids already in memory. That list IS the resume point of "everything":
 * a stopped run starts again at the first entry not yet in it, whatever order
 * the source lists them in next time.
 *
 * The host is reached through a port, so all of this runs in tests with no bridge.
 */
import { SUBDOMAIN_FOLDER, batchKey, type SourceId, type Subdomain } from './catalogue';
import type { Entry, SourceDoc } from './entry';
import { chronicles, sourceLabel, sourceLine } from './chronicle';
import { NIMH_LICENCE, NIMH_POLICY_URL, NIMH_TOPICS_URL, OPENSTAX_COLLECTION_URL, OPENSTAX_LICENCE, WIKIPEDIA_LICENCE, WIKIPEDIA_LICENCE_URL } from './sourceInfo';
import { OPENSTAX_ATTRIBUTION } from './openstax';
import { errText, pause, retrying } from './net';

/** The spine every MnemoMind chronicle is filed under (the vault tile counts it). */
export const SPINE = 'MIND_ENTRY';

/** One source of one sub-domain, as remembered between sessions. */
export interface Batch {
  /** `<sub>|<source>|<lang>`. */
  key: string;
  sub: Subdomain;
  source: SourceId;
  lang: string;
  /** Entry ids whose every part reached the vault. */
  ids: string[];
  /** Entry ids the vault refused at least one part of (counted, tried again next time). */
  failed: string[];
  /** Entry ids the source refused (empty page, not found), counted. */
  refused: string[];
  /** Entries the source listed the last time it was read. Null until listed. */
  total: number | null;
  /** When an entry of this batch last reached memory, ISO. Null = never. */
  lastAt: string | null;
}

/** The durable index: the copy folder and one batch per (topic, source, language). */
export interface LibraryState {
  folder: string | null;
  batches: Batch[];
}

/** A library with nothing in it. Only shown once the stored one has been READ. */
export const EMPTY_LIBRARY: LibraryState = { folder: null, batches: [] };

const SUBS = new Set<string>(['biases', 'disorders', 'schools', 'neuro', 'memory']);
const SOURCES = new Set<string>(['wikipedia', 'openstax', 'nimh']);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** Reads one stored batch; anything unreadable is dropped, never guessed. */
export function parseBatch(v: unknown): Batch | null {
  if (!v || typeof v !== 'object') return null;
  const b = v as Record<string, unknown>;
  if (typeof b.sub !== 'string' || !SUBS.has(b.sub)) return null;
  if (typeof b.source !== 'string' || !SOURCES.has(b.source)) return null;
  if (typeof b.lang !== 'string' || !b.lang) return null;
  return {
    key: batchKey(b.sub as Subdomain, b.source as SourceId, b.lang),
    sub: b.sub as Subdomain,
    source: b.source as SourceId,
    lang: b.lang,
    ids: strings(b.ids),
    failed: strings(b.failed),
    refused: strings(b.refused),
    total: typeof b.total === 'number' && Number.isFinite(b.total) && b.total >= 0 ? b.total : null,
    lastAt: typeof b.lastAt === 'string' && b.lastAt ? b.lastAt : null,
  };
}

/** Reads the stored library. `state.get` answers `{ state: { library }, updatedAt }` (MnemoLaw's trap); the bare shape is accepted too. */
export function parseLibrary(raw: unknown): LibraryState {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const holder = (r.state && typeof r.state === 'object' ? r.state : r) as Record<string, unknown>;
  const lib = (holder.library && typeof holder.library === 'object' ? holder.library : {}) as Record<string, unknown>;
  return {
    folder: typeof lib.folder === 'string' && lib.folder ? lib.folder : null,
    batches: Array.isArray(lib.batches) ? lib.batches.map(parseBatch).filter((b): b is Batch => b !== null) : [],
  };
}

/** A batch with nothing in memory yet. */
export function newBatch(sub: Subdomain, source: SourceId, lang: string): Batch {
  return { key: batchKey(sub, source, lang), sub, source, lang, ids: [], failed: [], refused: [], total: null, lastAt: null };
}

/** The batch of a source, or a new empty one. */
export function batchOf(lib: LibraryState, sub: Subdomain, source: SourceId, lang: string): Batch {
  return lib.batches.find((b) => b.key === batchKey(sub, source, lang)) ?? newBatch(sub, source, lang);
}

/** Replaces a batch in the library, or adds it. */
export function withBatch(lib: LibraryState, batch: Batch): LibraryState {
  return { ...lib, batches: [...lib.batches.filter((b) => b.key !== batch.key), batch] };
}

/** What a home tile says: entries in memory for a sub-domain, and when the last one arrived. */
export function subdomainSummary(lib: LibraryState, sub: Subdomain): { entries: number; lastAt: string | null } {
  const mine = lib.batches.filter((b) => b.sub === sub);
  const lastAt = mine.map((b) => b.lastAt).filter((d): d is string => !!d).sort().pop() ?? null;
  return { entries: mine.reduce((n, b) => n + b.ids.length, 0), lastAt };
}

/** Records the outcome of one entry in its batch. */
export function recordEntry(batch: Batch, id: string, outcome: 'whole' | 'failed' | 'refused', at: string): Batch {
  const without = (list: string[]) => list.filter((x) => x !== id);
  const add = (list: string[]) => [...without(list), id];
  return {
    ...batch,
    ids: outcome === 'whole' ? add(batch.ids) : batch.ids,
    failed: outcome === 'failed' ? add(batch.failed) : without(batch.failed),
    refused: outcome === 'refused' ? add(batch.refused) : without(batch.refused),
    lastAt: outcome === 'whole' ? at : batch.lastAt,
  };
}

/** Joins a folder and a name with the separator the folder already uses. */
export function joinPath(folder: string, file: string): string {
  const sep = folder.includes('\\') && !folder.includes('/') ? '\\' : '/';
  return folder.replace(/[\\/]+$/, '') + sep + file;
}

/** A readable file name, unique per entry: the title, then the id. */
export function entryFileName(entry: Pick<Entry, 'id' | 'title'>): string {
  const safe = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const title = safe(entry.title).slice(0, 80) || 'entry';
  const id = safe(entry.id).slice(-60) || 'x';
  return `${title}--${id}.json`;
}

/** The attribution file written at the root of the copy folder. */
export const ATTRIBUTION_FILE = 'ATTRIBUTION.md';

/** The attribution of every source, as written into ATTRIBUTION.md. */
export function attributionText(): string {
  return [
    '# Texts in this folder',
    '',
    'These files were downloaded by MnemoMind. Each file names its source, its date and its licence.',
    '',
    '## Wikipedia (English, French, Spanish), by category',
    '',
    `- Licence (the API's rightsinfo field): ${WIKIPEDIA_LICENCE} (${WIKIPEDIA_LICENCE_URL})`,
    '- Each file names the article, the revision read, and its address. The text is the article as Wikipedia contributors wrote it.',
    '',
    `## OpenStax, Psychology 2e (${OPENSTAX_COLLECTION_URL})`,
    '',
    `- Attribution: ${OPENSTAX_ATTRIBUTION}`,
    `- Licence (the collection's md:license): ${OPENSTAX_LICENCE}`,
    '',
    `## National Institute of Mental Health (${NIMH_TOPICS_URL})`,
    '',
    `- Licence (${NIMH_POLICY_URL}): ${NIMH_LICENCE}`,
    '',
    'MnemoMind gives no medical advice.',
    '',
  ].join('\n');
}

/** The host operations an import needs. */
export interface HostPort {
  writeFile(path: string, content: string): Promise<{ success: boolean; error?: string }>;
  mkdir(path: string): Promise<{ success: boolean; error?: string }>;
  ingest(entry: { vault: string; content: string; sourceRef: string }): Promise<void>;
}

/** What one import did. */
export interface EntryResult {
  /** `stopped` = a Stop cut the entry: nothing is recorded, it is read again next time. */
  outcome: 'whole' | 'failed' | 'stopped';
  parts: number;
  inVault: number;
  file: string;
}

/**
 * Writes the entry's file and the attribution, then its chronicles one by
 * one. A failed file write stops (nothing would be on disk to read back). An
 * entry counts as in memory only when EVERY part landed: half a page cited as
 * if it were whole is worse than a page missing.
 *
 * A Stop that arrives before the copy is written writes NOTHING (no file of an
 * entry the vault never saw); one that arrives between two parts reports
 * `stopped`, never `failed`: the vault refused nothing.
 */
export async function importEntry(
  port: HostPort,
  args: { folder: string; vault: string; sub: Subdomain; entry: Entry; doc: SourceDoc; signal?: AbortSignal; now?: () => Date },
): Promise<EntryResult> {
  if (args.signal?.aborted) return { outcome: 'stopped', parts: 0, inVault: 0, file: '' };
  const dir = joinPath(joinPath(args.folder, SUBDOMAIN_FOLDER[args.sub]), sourceLabel(args.doc));
  const made = await port.mkdir(dir);
  if (!made.success) throw new Error(`WRITE_FAILED: ${made.error ?? 'unknown'}`);
  const file = joinPath(dir, entryFileName(args.entry));
  const bodies = chronicles(args.doc, args.entry);
  const record = {
    source: args.doc.source,
    lang: args.doc.lang,
    title: args.doc.title,
    ...(args.doc.chapter ? { chapter: args.doc.chapter } : {}),
    url: args.doc.url,
    date: args.doc.date,
    dateKind: args.doc.dateKind,
    ...(args.doc.revid !== undefined ? { revid: args.doc.revid } : {}),
    licence: args.doc.licence,
    sourceLine: sourceLine(args.doc, args.entry),
    importedAt: (args.now ?? (() => new Date()))().toISOString(),
    ...(args.doc.nimhPublication !== undefined ? { nimhPublication: args.doc.nimhPublication } : {}),
    sections: args.doc.sections,
  };
  if (args.signal?.aborted) return { outcome: 'stopped', parts: bodies.length, inVault: 0, file: '' };
  const wrote = await port.writeFile(file, JSON.stringify(record, null, 1));
  if (!wrote.success) throw new Error(`WRITE_FAILED: ${wrote.error ?? 'unknown'}`);
  const attr = await port.writeFile(joinPath(args.folder, ATTRIBUTION_FILE), attributionText());
  if (!attr.success) throw new Error(`WRITE_FAILED: ${attr.error ?? 'unknown'}`);

  let inVault = 0;
  for (let p = 0; p < bodies.length; p++) {
    if (args.signal?.aborted) break;
    try {
      await port.ingest({ vault: args.vault, content: bodies[p]!, sourceRef: `${args.entry.key}#${p + 1}` });
      inVault++;
    } catch (err) {
      console.error('[mnemo-mind] chronicle refused', args.entry.key, p, err);
    }
  }
  const outcome = inVault === bodies.length ? 'whole' : args.signal?.aborted ? 'stopped' : 'failed';
  return { outcome, parts: bodies.length, inVault, file };
}

/** Errors that belong to ONE entry (the source has nothing usable there): counted, and the run goes on. */
export const ENTRY_REFUSALS = /^(WIKI_PAGE_|OPENSTAX_MODULE_EMPTY|OPENSTAX_NOT_A_MODULE|OPENSTAX_NOT_XML|NIMH_PAGE_|NIMH_NOT_A_TOPIC|HTTP_404|HTTP_410)/;
const BETWEEN_MS = 150;

/**
 * Puts every listed entry not yet in memory into memory, in list order, one
 * at a time with a short pause. Saves the batch every `saveEvery` entries and
 * at the end, so a stop or a closed window loses at most that many. A
 * failure that is not about one entry (network down, permission refused)
 * ends the run and is thrown: the screen says why.
 */
export async function runAll(
  deps: {
    read: (entry: Entry, signal?: AbortSignal) => Promise<SourceDoc>;
    port: HostPort;
    folder: string;
    vault: string;
    save: (batch: Batch) => Promise<void>;
    signal?: AbortSignal;
    onEntry?: (batch: Batch, done: number, todo: number, entry: Entry) => void;
    now?: () => Date;
    saveEvery?: number;
    wait?: typeof pause;
  },
  entries: readonly Entry[],
  start: Batch,
): Promise<Batch> {
  const now = deps.now ?? (() => new Date());
  const saveEvery = deps.saveEvery ?? 5;
  const wait = deps.wait ?? pause;
  const done = new Set(start.ids);
  const todo = entries.filter((e) => !done.has(e.id));
  let batch: Batch = { ...start, total: entries.length };
  let sinceSave = 0;
  try {
    for (let i = 0; i < todo.length; i++) {
      if (deps.signal?.aborted) break;
      const entry = todo[i]!;
      let outcome: 'whole' | 'failed' | 'refused' | 'stopped';
      try {
        const doc = await retrying(() => deps.read(entry, deps.signal), deps.signal, wait);
        outcome = (await importEntry(deps.port, { folder: deps.folder, vault: deps.vault, sub: start.sub, entry, doc, signal: deps.signal, now })).outcome;
      } catch (err) {
        if (deps.signal?.aborted) break;
        if (!ENTRY_REFUSALS.test(errText(err))) throw err;
        console.warn('[mnemo-mind] entry refused by its source', entry.key, errText(err));
        outcome = 'refused';
      }
      // An entry cut by a stop is not recorded: it is read again next time.
      if (deps.signal?.aborted || outcome === 'stopped') break;
      batch = recordEntry(batch, entry.id, outcome, now().toISOString());
      deps.onEntry?.(batch, i + 1, todo.length, entry);
      if (++sinceSave >= saveEvery) { sinceSave = 0; await deps.save(batch); }
      if (i + 1 < todo.length) {
        try {
          await wait(BETWEEN_MS, deps.signal);
        } catch (err) {
          // A stop during the pause ends the loop at its next turn; anything else is a real failure.
          if (!deps.signal?.aborted) throw err;
        }
      }
    }
  } finally {
    await deps.save(batch);
  }
  return batch;
}
