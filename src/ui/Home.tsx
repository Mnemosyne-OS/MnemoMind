/**
 * Home — one tile per sub-domain. Each says which sources fill it and how
 * much of it is already in memory, read from the cartridge's durable state.
 * Nothing in memory reads "Nothing in memory yet", never "0 entries".
 */
import { S } from './styles';
import { formatDay, type LibStatus, type T } from './types';
import { SUBDOMAINS, sourcesOf, type Subdomain } from '../sources/catalogue';
import { subdomainSummary, type LibraryState } from '../sources/library';

const ICON: Record<Subdomain, string> = { biases: '🎭', disorders: '🩺', schools: '🏛️', neuro: '🧬', memory: '📚' };

/** The home screen: one tile per sub-domain, with what is in memory once the library has been read. */
export function Home({ t, lang, lib, libStatus, onOpen }: {
  t: T;
  lang: string;
  lib: LibraryState;
  libStatus: LibStatus;
  onOpen: (sub: Subdomain) => void;
}) {
  return (
    <>
      <p style={S.p}>{t('home.lead')}</p>
      <div style={S.grid}>
        {SUBDOMAINS.map((sub) => {
          const sum = subdomainSummary(lib, sub);
          return (
            <button key={sub} style={S.countryCard} onClick={() => onOpen(sub)}>
              <span style={{ fontSize: 28, lineHeight: 1 }} aria-hidden="true">{ICON[sub]}</span>
              <span style={S.countryName}>{t(`home.sub.${sub}` as const)}</span>
              <span style={S.small}>{t('home.sources', { list: sourcesOf(sub).map((s) => t(`source.${s}` as const)).join(' · ') })}</span>
              <span style={S.small}>
                {libStatus.kind === 'loading' ? t('home.reading')
                  : libStatus.kind === 'error' ? t('home.unreadable')
                    : sum.entries === 0 || !sum.lastAt ? t('home.nothingYet') : t('home.inMemory', { n: sum.entries.toLocaleString(lang), date: formatDay(sum.lastAt, lang) })}
              </span>
            </button>
          );
        })}
      </div>
      <p style={S.small}>{t('chat.hint')}</p>
    </>
  );
}
