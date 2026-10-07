/**
 * MnemoMind (doc 135 §3quater): knowledge about the mind in memory, by topic.
 *
 * Two screens, MnemoLaw's shape: the five topics, then one topic with a tile
 * per wired source. The host calls live here; the screens only draw and call
 * back, and the readers and the import live in src/sources (tested alone).
 *
 * Nothing downloads before a gesture. Every long step shows what it measured
 * so far (entries, seconds), never an invented percentage.
 *
 * Where the texts go (Tony, 07/10): a knowledge cartridge never asks for a
 * folder. Each topic is a Memory Pack (`vault.pack.ensure`): the host answers
 * the pack's vault AND the app's folder under the knowledge root the person
 * chose in the Hub. No sandbox vault: nothing here writes outside the packs.
 *
 * 🚨 The library gate: until `state.get` has ANSWERED, the cartridge does not
 * know what is already in memory. It then writes nothing back (one `state.set`
 * of an empty library would erase the real one) and offers no "add" button;
 * the tiles say "reading…" or "unreadable", never "nothing in memory".
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MnemoCartridgeSDK } from './sdk/mnemo-sdk';
import { useI18n } from './i18n/useI18n';
import { translate } from './i18n/strings';
import { SUBDOMAIN_FOLDER, batchKey, type SourceId, type Subdomain } from './sources/catalogue';
import type { Entry } from './sources/entry';
import { HOST_TIMEOUT_MS, errText, fetchText, retrying, type HostFetch, type HostFetchReply } from './sources/net';
import { listSource, readerFor, type SourceDeps } from './sources/dispatch';
import type { OpenstaxPlan } from './sources/openstax';
import {
  EMPTY_LIBRARY, ENTRY_REFUSALS, SPINE, batchOf, importEntry, parseLibrary, recordEntry, runAll, withBatch,
  type HostPort, type LibraryState,
} from './sources/library';
import { useClock } from './ui/useClock';
import { S } from './ui/styles';
import { Home } from './ui/Home';
import { SubdomainView } from './ui/SubdomainView';
import { Footer } from './ui/Footer';
import { defaultWikiLang, type Job, type LibStatus, type ListState, type View } from './ui/types';
import type { WikiLang } from './sources/sourceInfo';

/** The one door to the host: the SDK's `invoke`. Injected in tests, to play a host that refuses. */
export type Invoke = <T = unknown>(action: string, payload?: unknown, timeoutMs?: number) => Promise<T>;

// Must match "name" in mnemo-plugin.json: the host keys the app's packs and durable state on it.
const sdk = new MnemoCartridgeSDK('@mnemosyne-plugins/mnemo-mind');
const sdkInvoke: Invoke = (action, payload, timeoutMs) => sdk.invoke(action, payload, timeoutMs);

/** Every host call that is not paced by the person gets the house deadline (rule 9). */
const HOST_CALL_TIMEOUT_MS = 15_000;
/**
 * `vault.pack.ensure` may create and MOUNT a vault; the host bounds that at
 * 30 s itself, so the cartridge waits a little longer than the host does.
 */
const PACK_CALL_TIMEOUT_MS = 35_000;

/** What `vault.pack.ensure` answers: the pack's vault and the app's folder under the knowledge root. */
interface PackTarget { vault: string; folder: string | null }

/**
 * The cartridge: topics, sources, imports. `invoke` defaults to the real
 * bridge; tests pass a fake one.
 */
export default function App({ invoke = sdkInvoke }: { invoke?: Invoke } = {}) {
  const { t, lang } = useI18n();
  const [view, setView] = useState<View>({ kind: 'home' });
  const [lib, setLib] = useState<LibraryState>(EMPTY_LIBRARY);
  const [libStatus, setLibStatus] = useState<LibStatus>({ kind: 'loading' });
  const [lists, setLists] = useState<Record<string, ListState>>({});
  const [job, setJob] = useState<Job | null>(null);
  const [notice, setNotice] = useState<string[]>([]);
  const [wikiLang, setWikiLang] = useState<WikiLang | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const libRef = useRef(lib);
  libRef.current = lib;
  const libReadyRef = useRef(false);
  libReadyRef.current = libStatus.kind === 'ready';
  const listsRef = useRef(lists);
  listsRef.current = lists;
  // The OpenStax plan last read: its licence is the one every module is filed under.
  const planRef = useRef<OpenstaxPlan | null>(null);

  const deps: SourceDeps = useMemo(() => {
    // The host's fetch, for sources without CORS. A stop does not cancel the host call; its answer is dropped.
    const hostFetch: HostFetch = async (url, signal) => {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const reply = await invoke<HostFetchReply>('social.fetch', { url }, HOST_TIMEOUT_MS);
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      return reply;
    };
    return { fetchText, hostFetch };
  }, [invoke]);

  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  // ── Where an import goes: the topic's Memory Pack ─────────────────────
  // Pack -> vault and folder, for this window's life (the host answers the same each time).
  const packTargets = useRef(new Map<string, PackTarget>());

  /**
   * The Memory Pack of one topic, named in English so the vault does not change
   * with the app's language. Created on first call, with vectors: these are
   * prose texts asked about in the person's own words. Throws NO_KNOWLEDGE_ROOT
   * when the knowledge folder is not chosen yet (the host then opens the Hub on
   * its Memory Packs tab, which asks).
   */
  const packTarget = useCallback(async (sub: Subdomain): Promise<PackTarget> => {
    const pack = SUBDOMAIN_FOLDER[sub];
    const known = packTargets.current.get(pack);
    if (known) return known;
    const res = await invoke<{ vault?: string; folder?: string }>('vault.pack.ensure', { pack, lexicalOnly: false }, PACK_CALL_TIMEOUT_MS);
    if (!res?.vault) throw new Error('ENSURE_PACK_FAILED');
    const found = { vault: res.vault, folder: typeof res.folder === 'string' && res.folder ? res.folder : null };
    packTargets.current.set(pack, found);
    return found;
  }, [invoke]);

  // ── Boot: the durable library, behind its gate ────────────────────────
  const loadLibrary = useCallback(() => {
    setLibStatus({ kind: 'loading' });
    invoke('state.get', undefined, HOST_CALL_TIMEOUT_MS)
      .then((raw) => {
        if (!aliveRef.current) return;
        const parsed = parseLibrary(raw);
        libRef.current = parsed;
        setLib(parsed);
        setLibStatus({ kind: 'ready' });
      })
      .catch((err) => {
        console.error('[mnemo-mind] state.get failed', err);
        if (aliveRef.current) setLibStatus({ kind: 'error', why: errText(err) });
      });
  }, [invoke]);

  useEffect(() => { loadLibrary(); }, [loadLibrary]);

  // Cancel any running read when the window goes away.
  useEffect(() => () => abortRef.current?.abort(), []);

  const now = useClock(job !== null);

  const saveLib = useCallback(async (next: LibraryState) => {
    // The gate: never write a library that was not read first.
    if (!libReadyRef.current) {
      console.error('[mnemo-mind] library not read: nothing written');
      return;
    }
    setLib(next);
    libRef.current = next;
    try {
      await invoke('state.set', { state: { library: next } }, HOST_CALL_TIMEOUT_MS);
    } catch (err) {
      console.error('[mnemo-mind] state.set failed', err);
      setNotice((n) => [...n, translate(lang, 'import.failed', { why: errText(err) })]);
    }
  }, [invoke, lang]);

  const mkdir = useCallback(async (dirPath: string) => {
    const made = await invoke<{ success?: boolean; error?: string } | undefined>('dialog.mkdir', { dirPath }, HOST_CALL_TIMEOUT_MS);
    // Only an explicit `success: false` is a failure (MnemoLaw's reading of dialog.mkdir).
    return { success: made?.success !== false, ...(made?.error ? { error: made.error } : {}) };
  }, [invoke]);

  /**
   * The pack of a topic and its folder, asked before anything downloads so a
   * missing knowledge folder is said first. The folder is remembered for the
   * footer. An older host that answers no folder is an error, never a guessed
   * path. A folder saved by an older version is never written to again.
   */
  const target = async (sub: Subdomain): Promise<{ vault: string; folder: string }> => {
    const { vault: name, folder } = await packTarget(sub);
    if (!folder) throw new Error('NO_PACK_FOLDER');
    if (libRef.current.folder !== folder) await saveLib({ ...libRef.current, folder });
    return { vault: name, folder };
  };

  /** A failure, worded when it is one the person can act on. */
  const failureText = (err: unknown): string => {
    const why = errText(err);
    return why.includes('NO_KNOWLEDGE_ROOT') ? t('import.noKnowledgeRoot') : t('import.failed', { why });
  };

  const port: HostPort = {
    writeFile: (filePath, content) => invoke<{ success: boolean; error?: string }>('dialog.writeFile', { filePath, content }, HOST_CALL_TIMEOUT_MS),
    mkdir,
    ingest: async (entry) => {
      await invoke('mnemosyne.ingest', { ...entry, spineType: SPINE }, HOST_CALL_TIMEOUT_MS);
    },
  };

  const canWrite = libStatus.kind === 'ready';

  // ── The list of one source ────────────────────────────────────────────
  const openList = async (sub: Subdomain, source: SourceId, srcLang: string) => {
    const key = batchKey(sub, source, srcLang);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const startedAt = Date.now();
    setLists((m) => ({ ...m, [key]: { kind: 'loading' } }));
    setJob({ kind: 'list', key, startedAt, n: 0 });
    try {
      const res = await listSource(deps, sub, source, srcLang, {
        signal: ctrl.signal,
        onProgress: (n) => setJob({ kind: 'list', key, startedAt, n }),
      });
      if (res.plan) planRef.current = res.plan;
      setLists((m) => ({ ...m, [key]: { kind: 'ready', listing: { entries: res.entries, ...(res.categories ? { categories: res.categories } : {}), ...(res.capped ? { capped: true } : {}), ...(res.plan?.licence ? { licence: res.plan.licence } : {}) } } }));
      await saveLib(withBatch(libRef.current, { ...batchOf(libRef.current, sub, source, srcLang), total: res.entries.length }));
    } catch (err) {
      setLists((m) => ({ ...m, [key]: { kind: 'error', why: ctrl.signal.aborted ? t('import.stopped') : errText(err) } }));
    } finally {
      setJob(null);
    }
  };

  // ── One entry, into the folder and the vault ──────────────────────────
  const addOne = async (sub: Subdomain, source: SourceId, srcLang: string, entry: Entry) => {
    if (!libReadyRef.current) return;
    setNotice([]);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const key = batchKey(sub, source, srcLang);
    setJob({ kind: 'one', key, startedAt: Date.now(), title: entry.title });
    try {
      const { vault: packVault, folder } = await target(sub);
      const read = readerFor(deps, source, srcLang, planRef.current);
      let doc;
      try {
        doc = await retrying(() => read(entry, ctrl.signal), ctrl.signal);
      } catch (err) {
        if (!ctrl.signal.aborted && ENTRY_REFUSALS.test(errText(err))) {
          await saveLib(withBatch(libRef.current, recordEntry(batchOf(libRef.current, sub, source, srcLang), entry.id, 'refused', new Date().toISOString())));
        }
        throw err;
      }
      const res = await importEntry(port, { folder, vault: packVault, sub, entry, doc, signal: ctrl.signal });
      if (res.outcome === 'stopped') {
        setNotice([t('import.stopped')]);
        return;
      }
      await saveLib(withBatch(libRef.current, recordEntry(batchOf(libRef.current, sub, source, srcLang), entry.id, res.outcome, new Date().toISOString())));
      const lines = [res.outcome === 'whole'
        ? t('import.done', { title: doc.title, parts: res.parts })
        : t('import.partial', { title: doc.title, inVault: res.inVault, parts: res.parts })];
      if (!doc.date) lines.push(t('import.noDate', { title: doc.title }));
      setNotice(lines);
    } catch (err) {
      setNotice([ctrl.signal.aborted ? t('import.stopped') : failureText(err)]);
    } finally {
      setJob(null);
    }
  };

  // ── Everything not yet in memory, resumable ───────────────────────────
  const addAll = async (sub: Subdomain, source: SourceId, srcLang: string) => {
    if (!libReadyRef.current) return;
    const key = batchKey(sub, source, srcLang);
    const list = listsRef.current[key];
    if (list?.kind !== 'ready') return;
    setNotice([]);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const startedAt = Date.now();
    // The job shows from the first instant (the pack call may create a vault),
    // with the real count still to do, never a placeholder zero.
    const first = new Set(batchOf(libRef.current, sub, source, srcLang).ids);
    setJob({ kind: 'all', key, startedAt, done: 0, todo: list.listing.entries.filter((e) => !first.has(e.id)).length });
    try {
      const { vault: packVault, folder } = await target(sub);
      const start = batchOf(libRef.current, sub, source, srcLang);
      const before = start.ids.length;
      const end = await runAll({
        read: readerFor(deps, source, srcLang, planRef.current),
        port,
        folder,
        vault: packVault,
        signal: ctrl.signal,
        save: (b) => saveLib(withBatch(libRef.current, b)),
        onEntry: (b, done, todo) => {
          setLib((l) => withBatch(l, b));
          setJob({ kind: 'all', key, startedAt, done, todo });
        },
      }, list.listing.entries, start);
      const added = end.ids.length - before;
      setNotice([ctrl.signal.aborted
        ? t('all.stopped', { added: added.toLocaleString(lang) })
        : t('all.finished', { added: added.toLocaleString(lang), failed: end.failed.length.toLocaleString(lang), refused: end.refused.length.toLocaleString(lang) })]);
    } catch (err) {
      setNotice([failureText(err)]);
    } finally {
      setJob(null);
    }
  };

  const go = (next: View) => {
    // Leaving a topic while its list is being read stops that read; an import keeps Back disabled.
    if (job?.kind === 'list') abortRef.current?.abort();
    setNotice([]);
    setView(next);
  };

  return (
    <div style={S.page}>
      <header style={S.header}>
        <div style={S.title}>🧠 MnemoMind</div>
        <div style={S.muted}>{t('app.subtitle')}</div>
      </header>

      {libStatus.kind === 'error' && (
        <section style={S.card} role="alert">
          <div style={S.error}>{t('lib.unreadable', { why: libStatus.why })}</div>
          <button style={S.ghost} onClick={loadLibrary}>{t('lib.retry')}</button>
        </section>
      )}

      {view.kind === 'home' && <Home t={t} lang={lang} lib={lib} libStatus={libStatus} onOpen={(sub) => go({ kind: 'sub', sub })} />}

      {view.kind === 'sub' && (
        <SubdomainView
          t={t}
          lang={lang}
          sub={view.sub}
          lib={lib}
          canWrite={canWrite}
          lists={lists}
          job={job}
          now={now}
          notice={notice}
          wikiLang={wikiLang ?? defaultWikiLang(lang)}
          onWikiLang={setWikiLang}
          onBack={() => go({ kind: 'home' })}
          actions={{
            onOpenList: (source, srcLang) => { void openList(view.sub, source, srcLang); },
            onAdd: (source, srcLang, entry) => { void addOne(view.sub, source, srcLang, entry); },
            onAddAll: (source, srcLang) => { void addAll(view.sub, source, srcLang); },
            onStop: () => abortRef.current?.abort(),
          }}
        />
      )}

      <Footer
        t={t}
        folder={lib.folder}
        onOpenFolder={() => {
          if (!lib.folder) return;
          invoke<{ success?: boolean; error?: string } | undefined>('dialog.openInOS', { filePath: lib.folder }, HOST_CALL_TIMEOUT_MS)
            .then((r) => { if (!r?.success) console.error('[mnemo-mind] open folder refused', r?.error); })
            .catch((err) => console.error('[mnemo-mind] open folder failed', err));
        }}
      />
    </div>
  );
}
