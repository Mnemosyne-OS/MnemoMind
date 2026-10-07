/**
 * SourceTile — one source of a sub-domain: its size, its licence copied as the
 * source states it, its language, and once opened the list of its entries.
 *
 * The size shown before any download is the one measured on MEASURED_ON and
 * says so; once the list is read, the live count replaces it.
 */
import { S } from './styles';
import { EntryList } from './EntryList';
import { formatDay, type Job, type ListState, type SourceActions, type T } from './types';
import { MEASURED_ON, NIMH_MEASURED_TOPICS, OPENSTAX_CHAPTERS, OPENSTAX_MEASURED_BY_SUB, OPENSTAX_MEASURED_MODULES, WIKI_ROOTS, type SourceId, type Subdomain } from '../sources/catalogue';
import { NIMH_LICENCE, OPENSTAX_LICENCE, WIKIPEDIA_LICENCE, WIKI_LANGS, type WikiLang } from '../sources/sourceInfo';
import type { Batch } from '../sources/library';

/** One source of a sub-domain: size, licence as the source states it, language, and its list once opened. */
export function SourceTile(props: {
  t: T;
  lang: string;
  sub: Subdomain;
  source: SourceId;
  /** The language this tile reads (Wikipedia: chosen; the others: English). */
  srcLang: string;
  onWikiLang?: (lang: WikiLang) => void;
  batch: Batch;
  list: ListState | undefined;
  open: boolean;
  onToggle: () => void;
  job: Job | null;
  now: number;
  canWrite: boolean;
  actions: SourceActions;
}) {
  const { t, lang, sub, source, srcLang, batch, list } = props;
  const day = formatDay(MEASURED_ON, lang);
  const root = source === 'wikipedia' ? WIKI_ROOTS[sub][srcLang as WikiLang] : null;
  // OpenStax: the licence read live from the collection once the list is read; the recopied constant before.
  const liveLicence = list?.kind === 'ready' ? list.listing.licence : undefined;
  const licence = source === 'wikipedia' ? WIKIPEDIA_LICENCE : source === 'openstax' ? liveLicence ?? OPENSTAX_LICENCE : NIMH_LICENCE;
  const size = list?.kind === 'ready'
    ? t('source.sizeLive', { n: list.listing.entries.length.toLocaleString(lang) })
    : source === 'wikipedia' && root ? t('source.sizePages', { n: root.listedPages.toLocaleString(lang), date: day })
      : source === 'openstax' ? t('source.sizeModules', { n: OPENSTAX_MEASURED_MODULES, date: day, mine: OPENSTAX_MEASURED_BY_SUB[sub] })
        : t('source.sizeTopics', { n: NIMH_MEASURED_TOPICS, date: day });
  const subcats = list?.kind === 'ready' && list.listing.categories ? list.listing.categories.length - 1 : null;

  return (
    <section style={S.card} aria-label={t(`source.${source}` as const)}>
      <div style={S.row}>
        <h2 style={S.h2}>{t(`source.${source}` as const)}</h2>
        {batch.ids.length > 0 && <span style={S.small}>{t('source.inMemory', { n: batch.ids.length.toLocaleString(lang) })}</span>}
      </div>
      {source === 'wikipedia' && props.onWikiLang ? (
        <label style={{ ...S.small, display: 'flex', gap: 8, alignItems: 'center' }}>
          {t('source.langPick')}
          <select style={S.input} value={srcLang} disabled={!!props.job} onChange={(e) => props.onWikiLang?.(e.target.value as WikiLang)}>
            {WIKI_LANGS.map((l) => <option key={l} value={l}>{t(`lang.${l}` as const)}</option>)}
          </select>
        </label>
      ) : (
        <div style={S.small}>{t('source.lang', { lang: t('lang.en') })}</div>
      )}
      {root && (
        <div style={S.small}>
          {t('source.category', { category: root.category })}
          {root.depth === 1 && <> · {subcats !== null ? t('source.subcats', { n: subcats }) : t('source.subcats', { n: '…' })}</>}
        </div>
      )}
      {source === 'openstax' && <div style={S.small}>{t('source.chapters', { list: OPENSTAX_CHAPTERS[sub].join(' · ') })}</div>}
      <div style={S.small}>{size}</div>
      <div style={S.small}>{t('source.licence', { licence })}</div>
      {source === 'nimh' && <div style={S.small}>{t('source.viaHost')}</div>}
      {/* Disabled during ANY job: a new listing would take over the Stop button of a running import. */}
      <button style={S.button} disabled={!!props.job} onClick={() => {
        if (!props.open && (!list || list.kind === 'error')) props.actions.onOpenList(source, srcLang);
        props.onToggle();
      }}>
        {props.open ? t('source.close') : t('source.open')}
      </button>
      {props.open && list?.kind === 'loading' && props.job?.kind === 'list' && (
        <div style={{ ...S.row, justifyContent: 'flex-start' }} aria-live="polite">
          <span style={S.muted}>{t('source.loading', { n: props.job.n, s: Math.max(0, Math.round((props.now - props.job.startedAt) / 1000)) })}</span>
          <button style={S.ghost} onClick={props.actions.onStop}>{t('job.stop')}</button>
        </div>
      )}
      {props.open && list?.kind === 'error' && (
        <div style={S.error}>
          {t('source.failed', { why: list.why })}{' '}
          <button style={S.link} onClick={() => props.actions.onOpenList(source, srcLang)}>{t('list.retry')}</button>
        </div>
      )}
      {props.open && list?.kind === 'ready' && (
        <>
          {list.listing.capped && <div style={S.small}>{t('source.capped', { n: list.listing.entries.length })}</div>}
          <EntryList
            t={t}
            lang={lang}
            entries={list.listing.entries}
            batch={batch}
            busy={!!props.job}
            canWrite={props.canWrite}
            onAdd={(e) => props.actions.onAdd(source, srcLang, e)}
            onAddAll={() => props.actions.onAddAll(source, srcLang)}
          />
        </>
      )}
    </section>
  );
}
