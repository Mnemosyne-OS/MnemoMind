/**
 * SubdomainView — one sub-domain: a tile per wired source, the running job,
 * and what the last gesture did. Every action goes back up to App.
 */
import { useState } from 'react';
import { S } from './styles';
import { SourceTile } from './SourceTile';
import { remainingSeconds, formatDuration } from './eta';
import type { Job, ListState, SourceActions, T } from './types';
import { batchKey, sourcesOf, type Subdomain } from '../sources/catalogue';
import { batchOf, type LibraryState } from '../sources/library';
import type { WikiLang } from '../sources/sourceInfo';

/** One sub-domain: a tile per wired source, the running import, and what the last gesture did. */
export function SubdomainView(props: {
  t: T;
  lang: string;
  sub: Subdomain;
  lib: LibraryState;
  /** The vault is ready AND the library was read: only then can anything be added. */
  canWrite: boolean;
  lists: Record<string, ListState>;
  job: Job | null;
  now: number;
  notice: string[];
  wikiLang: WikiLang;
  onWikiLang: (lang: WikiLang) => void;
  onBack: () => void;
  actions: SourceActions;
}) {
  const { t, lang, sub, job, now } = props;
  const [openKey, setOpenKey] = useState<string | null>(null);
  const seconds = job ? Math.max(0, Math.round((now - job.startedAt) / 1000)) : 0;

  return (
    <>
      <button style={S.link} disabled={!!job && job.kind !== 'list'} onClick={props.onBack}>{t('nav.back')}</button>
      <div style={S.countryName}>{t(`home.sub.${sub}` as const)}</div>

      {job && job.kind !== 'list' && (
        <section style={S.card} aria-live="polite">
          <div>
            {job.kind === 'one' && t('job.reading', { title: job.title, s: seconds })}
            {job.kind === 'all' && (() => {
              const line = t('job.all', { done: job.done.toLocaleString(lang), todo: job.todo.toLocaleString(lang), elapsed: formatDuration(seconds) });
              const left = remainingSeconds(job.done, job.todo, (now - job.startedAt) / 1000);
              return left === null ? line : `${line} · ${t('job.eta', { left: formatDuration(left) })}`;
            })()}
          </div>
          <button style={S.ghost} onClick={props.actions.onStop}>{t('job.stop')}</button>
        </section>
      )}

      {props.notice.length > 0 && <section style={S.card} role="status">{props.notice.map((n, i) => <div key={i}>{n}</div>)}</section>}

      {sourcesOf(sub).map((source) => {
        const srcLang = source === 'wikipedia' ? props.wikiLang : 'en';
        const key = batchKey(sub, source, srcLang);
        return (
          <SourceTile
            key={source}
            t={t}
            lang={lang}
            sub={sub}
            source={source}
            srcLang={srcLang}
            {...(source === 'wikipedia' ? { onWikiLang: props.onWikiLang } : {})}
            batch={batchOf(props.lib, sub, source, srcLang)}
            list={props.lists[key]}
            open={openKey === key}
            onToggle={() => setOpenKey(openKey === key ? null : key)}
            job={job}
            now={now}
            canWrite={props.canWrite}
            actions={props.actions}
          />
        );
      })}
      <p style={S.small}>{t('chat.hint')}</p>
    </>
  );
}
