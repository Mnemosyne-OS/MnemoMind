/**
 * EntryList — the entries of one source, a search over their titles, and the
 * two gestures: put one entry in memory, or everything not yet in it.
 *
 * Titles only: a question about the content belongs to the chat, which reads
 * the vault. At most SHOWN rows are drawn; the rest is counted, never hidden.
 */
import { useMemo, useState } from 'react';
import { S } from './styles';
import type { T } from './types';
import type { Entry } from '../sources/entry';
import type { Batch } from '../sources/library';
import { SHOWN, matchTitle } from './listModel';

/** The entries of one source: title search, one-entry add, and add-everything. */
export function EntryList({ t, lang, entries, batch, busy, canWrite, onAdd, onAddAll }: {
  t: T;
  lang: string;
  entries: Entry[];
  batch: Batch;
  busy: boolean;
  canWrite: boolean;
  onAdd: (entry: Entry) => void;
  onAddAll: () => void;
}) {
  const [query, setQuery] = useState('');
  const inMemory = useMemo(() => new Set(batch.ids), [batch.ids]);
  const failed = useMemo(() => new Set(batch.failed), [batch.failed]);
  const refused = useMemo(() => new Set(batch.refused), [batch.refused]);
  const matches = useMemo(() => (query.trim() ? entries.filter((e) => matchTitle(e.title, query)) : entries), [entries, query]);
  const todo = entries.filter((e) => !inMemory.has(e.id)).length;
  const disabled = busy || !canWrite;

  return (
    <>
      {todo > 0
        ? <button style={S.button} disabled={disabled} onClick={onAddAll}>{t('all.button', { n: todo.toLocaleString(lang) })}</button>
        : <div style={S.small}>{t('all.none')}</div>}
      <input style={S.input} value={query} placeholder={t('list.filter')} onChange={(e) => setQuery(e.target.value)} />
      <div style={S.small}>{t('list.count', { shown: matches.length.toLocaleString(lang), n: entries.length.toLocaleString(lang) })}</div>
      {query.trim() && matches.length === 0 && <div style={S.muted}>{t('list.none', { q: query.trim() })}</div>}
      <ul style={S.list}>
        {matches.slice(0, SHOWN).map((e) => (
          <li key={e.key} style={S.row}>
            <span>
              {e.title}
              {e.chapter && <span style={S.muted}> · {e.chapter}</span>}
              {inMemory.has(e.id) && <span style={S.muted}> · {t('list.inMemory')}</span>}
              {failed.has(e.id) && <span style={S.error}> · {t('list.failed')}</span>}
              {refused.has(e.id) && <span style={S.muted}> · {t('list.refused')}</span>}
            </span>
            <button style={S.ghost} disabled={disabled} onClick={() => onAdd(e)}>
              {inMemory.has(e.id) ? t('list.again') : t('list.add')}
            </button>
          </li>
        ))}
      </ul>
      {matches.length > SHOWN && <div style={S.small}>{t('list.more', { n: (matches.length - SHOWN).toLocaleString(lang) })}</div>}
    </>
  );
}
