import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { Home } from './Home';
import { SubdomainView } from './SubdomainView';
import { Footer } from './Footer';
import { translate, type Key } from '../i18n/strings';
import { EMPTY_LIBRARY, newBatch, withBatch } from '../sources/library';
import { NIMH_LICENCE, OPENSTAX_LICENCE, WIKIPEDIA_LICENCE } from '../sources/sourceInfo';
import type { ListState, SourceActions } from './types';
import type { Entry } from '../sources/entry';

const t = (key: Key, vars?: Record<string, string | number>) => translate('en', key, vars);
const actions = (): SourceActions => ({ onOpenList: vi.fn(), onAdd: vi.fn(), onAddAll: vi.fn(), onStop: vi.fn() });
const entries: Entry[] = [
  { key: 'wikipedia|en|1', id: '1', source: 'wikipedia', lang: 'en', title: 'Anchoring effect' },
  { key: 'wikipedia|en|2', id: '2', source: 'wikipedia', lang: 'en', title: 'Confirmation bias' },
];

describe('Home', () => {
  it('shows the five topics, and "nothing yet" (never "0 entries") where nothing is in memory', () => {
    render(<Home t={t} lang="en" lib={EMPTY_LIBRARY} libStatus={{ kind: 'ready' }} onOpen={vi.fn()} />);
    for (const name of ['Cognitive biases', 'Mental disorders', 'Schools of psychology', 'Neuroscience', 'Memory and learning']) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
    expect(screen.getAllByText('Nothing in memory yet')).toHaveLength(5);
    expect(screen.queryByText(/^0 entries/)).not.toBeInTheDocument();
  });

  it('says how many entries a topic holds and when the last one arrived', () => {
    const lib = withBatch(EMPTY_LIBRARY, { ...newBatch('biases', 'wikipedia', 'en'), ids: ['1', '2', '3'], lastAt: '2026-10-04T12:00:00.000Z' });
    const onOpen = vi.fn();
    render(<Home t={t} lang="en" lib={lib} libStatus={{ kind: 'ready' }} onOpen={onOpen} />);
    expect(screen.getByText('3 entries in memory · last on October 4, 2026')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Cognitive biases'));
    expect(onOpen).toHaveBeenCalledWith('biases');
  });
});

describe('a topic, as someone sees it when the host refuses (no bridge, no permission)', () => {
  const view = (lists: Record<string, ListState>, a = actions()) => render(
    <SubdomainView
      t={t} lang="en" sub="disorders" lib={EMPTY_LIBRARY} canWrite={false}
      lists={lists} job={null} now={0} notice={[]} wikiLang="en" onWikiLang={vi.fn()} onBack={vi.fn()} actions={a}
    />,
  );

  it('shows a tile per wired source, each with its licence copied as the source states it', () => {
    view({});
    const wiki = screen.getByRole('region', { name: 'Wikipedia' });
    expect(within(wiki).getByText(`Licence, as the source states it: ${WIKIPEDIA_LICENCE}`)).toBeInTheDocument();
    expect(within(wiki).getByText(/Category read: Category:Mental, behavioural or neurodevelopmental disorders/)).toBeInTheDocument();
    expect(within(wiki).getByText('253 pages listed on October 4, 2026')).toBeInTheDocument();
    const os = screen.getByRole('region', { name: 'OpenStax · Psychology 2e' });
    expect(within(os).getByText(`Licence, as the source states it: ${OPENSTAX_LICENCE}`)).toBeInTheDocument();
    expect(within(os).getByText('105 modules in the book on October 4, 2026, 24 of them in these chapters')).toBeInTheDocument();
    const nimh = screen.getByRole('region', { name: 'NIMH · Health topics' });
    expect(within(nimh).getByText(`Licence, as the source states it: ${NIMH_LICENCE}`)).toBeInTheDocument();
    expect(within(nimh).getByText(/MnemoMind asks Mnemosyne OS to fetch it/)).toBeInTheDocument();
  });

  it('a refused host fetch reads as the reason, with a way to try again', () => {
    const a = actions();
    view({ 'disorders|nimh|en': { kind: 'error', why: 'PERMISSION_DENIED: vault:read' } }, a);
    const nimh = screen.getByRole('region', { name: 'NIMH · Health topics' });
    fireEvent.click(within(nimh).getByText('Open the list'));
    expect(a.onOpenList).toHaveBeenCalledWith('nimh', 'en');
    expect(within(nimh).getByText(/The list could not be read: PERMISSION_DENIED: vault:read/)).toBeInTheDocument();
    expect(within(nimh).getByText('Try again')).toBeInTheDocument();
  });

  it('with the vault refused, a list can be read but nothing can be added', () => {
    const a = actions();
    view({ 'disorders|wikipedia|en': { kind: 'ready', listing: { entries, categories: ['Category:Root', 'Category:A', 'Category:B'] } } }, a);
    const wiki = screen.getByRole('region', { name: 'Wikipedia' });
    fireEvent.click(within(wiki).getByText('Open the list'));
    expect(a.onOpenList).not.toHaveBeenCalled();
    expect(within(wiki).getByText('Anchoring effect')).toBeInTheDocument();
    expect(within(wiki).getByText(/and its 2 sub-categories/)).toBeInTheDocument();
    for (const b of within(wiki).getAllByText('Add to memory')) expect(b).toBeDisabled();
    expect(within(wiki).getByText('Add everything not yet in memory (2)')).toBeDisabled();
  });

  it('the footer offers no folder choice: the knowledge folder before the first addition, then the folder itself', () => {
    const { rerender } = render(<Footer t={t} folder={null} onOpenFolder={vi.fn()} />);
    expect(screen.getByText('Copies are kept in your knowledge folder from the first addition.')).toBeInTheDocument();
    expect(screen.queryByText('Open the folder')).not.toBeInTheDocument();
    const open = vi.fn();
    rerender(<Footer t={t} folder="D:/Knowledge/mnemo-mind" onOpenFolder={open} />);
    fireEvent.click(screen.getByText('Open the folder'));
    expect(open).toHaveBeenCalled();
    expect(screen.queryByText(/Change folder/)).not.toBeInTheDocument();
  });
});

describe('a topic with a ready vault', () => {
  it('filters titles, marks what is in memory, and adds one entry', () => {
    const a = actions();
    const lib = withBatch(EMPTY_LIBRARY, { ...newBatch('biases', 'wikipedia', 'fr'), ids: ['1'] });
    render(
      <SubdomainView
        t={t} lang="en" sub="biases" lib={lib} canWrite
        lists={{ 'biases|wikipedia|fr': { kind: 'ready', listing: { entries: entries.map((e) => ({ ...e, lang: 'fr' })) } } }}
        job={null} now={0} notice={[]} wikiLang="fr" onWikiLang={vi.fn()} onBack={vi.fn()} actions={a}
      />,
    );
    const wiki = screen.getByRole('region', { name: 'Wikipedia' });
    expect(within(wiki).getByText('Category read: Catégorie:Biais cognitif')).toBeInTheDocument();
    fireEvent.click(within(wiki).getByText('Open the list'));
    expect(within(wiki).getByText('Add everything not yet in memory (1)')).toBeEnabled();
    fireEvent.change(within(wiki).getByPlaceholderText('Find an entry'), { target: { value: 'CONFIRM' } });
    expect(within(wiki).queryByText('Anchoring effect')).not.toBeInTheDocument();
    fireEvent.click(within(wiki).getByText('Add to memory'));
    expect(a.onAdd).toHaveBeenCalledWith('wikipedia', 'fr', expect.objectContaining({ id: '2' }));
  });
});

describe('the library gate on the home screen', () => {
  it('while the record is being read, the tiles say so, never "nothing in memory"', () => {
    render(<Home t={t} lang="en" lib={EMPTY_LIBRARY} libStatus={{ kind: 'loading' }} onOpen={vi.fn()} />);
    expect(screen.getAllByText('Reading what is in memory…')).toHaveLength(5);
    expect(screen.queryByText('Nothing in memory yet')).not.toBeInTheDocument();
  });
});

describe('a list being read', () => {
  it('has a Stop, and Back stays usable', () => {
    const a = actions();
    const onBack = vi.fn();
    render(
      <SubdomainView
        t={t} lang="en" sub="neuro" lib={EMPTY_LIBRARY} canWrite
        lists={{ 'neuro|openstax|en': { kind: 'loading' } }}
        job={{ kind: 'list', key: 'neuro|openstax|en', startedAt: 0, n: 3 }} now={4_000} notice={[]} wikiLang="en" onWikiLang={vi.fn()} onBack={onBack} actions={a}
      />,
    );
    fireEvent.click(screen.getByText(t('nav.back')));
    expect(onBack).toHaveBeenCalled();
  });

  it('the opened tile shows the measured progress and a Stop that stops', () => {
    const a = actions();
    const { rerender } = render(
      <SubdomainView t={t} lang="en" sub="neuro" lib={EMPTY_LIBRARY} canWrite lists={{}} job={null} now={0} notice={[]} wikiLang="en" onWikiLang={vi.fn()} onBack={vi.fn()} actions={a} />,
    );
    const os = screen.getByRole('region', { name: 'OpenStax · Psychology 2e' });
    fireEvent.click(within(os).getByText('Open the list'));
    rerender(
      <SubdomainView t={t} lang="en" sub="neuro" lib={EMPTY_LIBRARY} canWrite lists={{ 'neuro|openstax|en': { kind: 'loading' } }}
        job={{ kind: 'list', key: 'neuro|openstax|en', startedAt: 0, n: 3 }} now={4_000} notice={[]} wikiLang="en" onWikiLang={vi.fn()} onBack={vi.fn()} actions={a} />,
    );
    expect(within(os).getByText('Reading the list… 3 entries, 4 s')).toBeInTheDocument();
    fireEvent.click(within(os).getByText('Stop'));
    expect(a.onStop).toHaveBeenCalled();
  });
});

describe('licences on the tiles', () => {
  it('OpenStax shows the licence read live once the list is read, the recopied one before', () => {
    const live = 'Creative Commons Attribution 4.0 International (as read today)';
    render(
      <SubdomainView t={t} lang="en" sub="memory" lib={EMPTY_LIBRARY} canWrite
        lists={{ 'memory|openstax|en': { kind: 'ready', listing: { entries: [], licence: live } } }}
        job={null} now={0} notice={[]} wikiLang="en" onWikiLang={vi.fn()} onBack={vi.fn()} actions={actions()} />,
    );
    const os = screen.getByRole('region', { name: 'OpenStax · Psychology 2e' });
    expect(within(os).getByText(`Licence, as the source states it: ${live}`)).toBeInTheDocument();
    expect(within(os).queryByText(`Licence, as the source states it: ${OPENSTAX_LICENCE}`)).not.toBeInTheDocument();
  });

  it('a capped list says so', () => {
    render(
      <SubdomainView t={t} lang="en" sub="biases" lib={EMPTY_LIBRARY} canWrite
        lists={{ 'biases|wikipedia|en': { kind: 'ready', listing: { entries, capped: true } } }}
        job={null} now={0} notice={[]} wikiLang="en" onWikiLang={vi.fn()} onBack={vi.fn()} actions={actions()} />,
    );
    const wiki = screen.getByRole('region', { name: 'Wikipedia' });
    fireEvent.click(within(wiki).getByText('Open the list'));
    expect(within(wiki).getByText('The list stopped at 2 entries.')).toBeInTheDocument();
  });

  it('the language selector is written in the interface language', () => {
    render(
      <SubdomainView t={(k, v) => translate('fr', k, v)} lang="fr" sub="biases" lib={EMPTY_LIBRARY} canWrite lists={{}}
        job={null} now={0} notice={[]} wikiLang="fr" onWikiLang={vi.fn()} onBack={vi.fn()} actions={actions()} />,
    );
    expect(screen.getByRole('option', { name: 'espagnol' })).toBeInTheDocument();
    expect(screen.getByText('Langue : anglais')).toBeInTheDocument();
  });
});
