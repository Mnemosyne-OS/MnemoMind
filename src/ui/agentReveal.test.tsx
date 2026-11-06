/**
 * A job opens its source's tile, whoever started it (doc 149): an agent's list is read where the
 * person can see it, not behind a closed tile.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { SubdomainView } from './SubdomainView';
import { translate, type Key } from '../i18n/strings';
import { EMPTY_LIBRARY } from '../sources/library';

const t = (key: Key, vars?: Record<string, string | number>) => translate('en', key, vars);
const actions = { onOpenList: vi.fn(), onAdd: vi.fn(), onAddAll: vi.fn(), onStop: vi.fn() };
const entries = [{ key: 'wikipedia|en|1', id: '1', source: 'wikipedia' as const, lang: 'en', title: 'Anchoring effect' }];

describe('a job and its tile', () => {
  it('a list started elsewhere opens its tile, and its entries show once read', () => {
    const props = { t, lang: 'en', sub: 'biases' as const, lib: EMPTY_LIBRARY, canWrite: true, now: 0, notice: [], wikiLang: 'en' as const, onWikiLang: vi.fn(), onBack: vi.fn(), actions };
    const { rerender } = render(<SubdomainView {...props} lists={{}} job={null} />);
    const wiki = screen.getByRole('region', { name: 'Wikipedia' });
    expect(within(wiki).getByText('Open the list')).toBeInTheDocument();
    rerender(<SubdomainView {...props} lists={{ 'biases|wikipedia|en': { kind: 'loading' } }} job={{ kind: 'list', key: 'biases|wikipedia|en', startedAt: 0, n: 0 }} />);
    rerender(<SubdomainView {...props} lists={{ 'biases|wikipedia|en': { kind: 'ready', listing: { entries } } }} job={null} />);
    expect(within(wiki).getByText('Anchoring effect')).toBeInTheDocument();
  });
});
