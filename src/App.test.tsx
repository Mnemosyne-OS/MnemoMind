import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App, { type Invoke } from './App';
import collection from './fixtures/openstax-collection.xml?raw';
import whatIs from './fixtures/openstax-m82162.cnxml?raw';

const PACK_FOLDER = 'D:/Knowledge/mnemo-mind';
const PACK_VAULT = 'kp-mnemo-mind-memory-and-learning';

/**
 * A host: answers the topic's Memory Pack (or refuses it with `packError`),
 * accepts every write, and serves `stateGet` as the cartridge's own state.
 */
function fakeHost(stateGet: () => Promise<unknown>, packError?: string) {
  const calls: { action: string; payload: unknown; timeoutMs?: number }[] = [];
  const invoke = (async (action: string, payload?: unknown, timeoutMs?: number) => {
    calls.push({ action, payload, timeoutMs });
    if (action === 'state.get') return stateGet();
    if (action === 'vault.pack.ensure') {
      if (packError) throw new Error(packError);
      return { vault: PACK_VAULT, folder: PACK_FOLDER, created: true };
    }
    if (action === 'dialog.mkdir' || action === 'dialog.writeFile') return { success: true };
    return undefined;
  }) as Invoke;
  return { invoke, calls };
}

/** The web: the OpenStax collection, then one module for every module read. */
function fakeWeb() {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    return new Response(url.includes('/collections/') ? collection : whatIs, { status: 200 });
  });
}

afterEach(() => { vi.restoreAllMocks(); });

describe('App, with a host whose state.get fails', () => {
  it('says the record is unreadable, offers to read it again, writes NOTHING back', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const stateGet = vi.fn().mockRejectedValue(new Error('Host did not reply to "state.get" within 15s'));
    const host = fakeHost(stateGet);
    render(<App invoke={host.invoke} />);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/could not read what it already put in memory/));
    expect(screen.getAllByText('What is in memory could not be read')).toHaveLength(5);
    expect(screen.queryByText('Nothing in memory yet')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Read it again'));
    await waitFor(() => expect(stateGet).toHaveBeenCalledTimes(2));
    expect(host.calls.some((c) => c.action === 'state.set')).toBe(false);
  });

  it('reading a list with the record unread sends no state.set, and nothing can be added', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(collection, { status: 200 }));
    const host = fakeHost(() => Promise.reject(new Error('STATE_UNREADABLE')));
    render(<App invoke={host.invoke} />);
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Memory and learning'));
    const tile = screen.getByRole('region', { name: 'OpenStax · Psychology 2e' });
    fireEvent.click(tile.querySelector('button')!);
    await waitFor(() => expect(screen.getByText(/entries in the list now/)).toBeInTheDocument());
    for (const b of screen.getAllByText('Add to memory')) expect(b).toBeDisabled();
    expect(host.calls.some((c) => c.action === 'state.set')).toBe(false);
  });
});

describe('App, booting', () => {
  it('opens no vault and asks for no folder before a gesture', async () => {
    const host = fakeHost(async () => ({ state: { library: { folder: null, batches: [] } } }));
    render(<App invoke={host.invoke} />);
    await waitFor(() => expect(screen.getAllByText('Nothing in memory yet')).toHaveLength(5));
    expect(host.calls.map((c) => c.action)).toEqual(['state.get']);
    expect(screen.getByText('Copies are kept in your knowledge folder from the first addition.')).toBeInTheDocument();
  });

  it('every host call that is not paced by the person carries a deadline', async () => {
    const host = fakeHost(async () => ({ state: { library: { folder: null, batches: [] } } }));
    render(<App invoke={host.invoke} />);
    await waitFor(() => expect(host.calls.length).toBeGreaterThanOrEqual(1));
    for (const c of host.calls) expect(c.timeoutMs, c.action).toBe(15_000);
  });
});

describe('App, adding an entry', () => {
  /** Opens Memory and learning, reads the OpenStax list, adds its first entry. */
  async function addFirstOpenstax() {
    fireEvent.click(screen.getByText('Memory and learning'));
    const tile = screen.getByRole('region', { name: 'OpenStax · Psychology 2e' });
    fireEvent.click(tile.querySelector('button')!);
    await waitFor(() => expect(screen.getAllByText('Add to memory')[0]).toBeEnabled());
    fireEvent.click(screen.getAllByText('Add to memory')[0]!);
  }

  it('never opens a folder dialog: writes under the pack folder, ingests into the pack vault', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    fakeWeb();
    // A library saved by an older version still names the folder the person once picked.
    const host = fakeHost(async () => ({ state: { library: { folder: 'C:/Users/me/Documents/MnemoMind', batches: [] } } }));
    render(<App invoke={host.invoke} />);
    await waitFor(() => expect(screen.getAllByText('Nothing in memory yet')).toHaveLength(5));
    await addFirstOpenstax();
    await waitFor(() => expect(host.calls.some((c) => c.action === 'mnemosyne.ingest')).toBe(true));
    await waitFor(() => expect(screen.getByText(/is in memory/)).toBeInTheDocument());

    expect(host.calls.some((c) => c.action === 'dialog.selectFolder')).toBe(false);
    const ensure = host.calls.find((c) => c.action === 'vault.pack.ensure');
    expect(ensure?.payload).toEqual({ pack: 'Memory and learning', lexicalOnly: false });
    expect(ensure?.timeoutMs).toBeGreaterThan(30_000);
    const written = host.calls.filter((c) => c.action === 'dialog.writeFile' || c.action === 'dialog.mkdir')
      .map((c) => (c.payload as { filePath?: string; dirPath?: string }));
    expect(written.length).toBeGreaterThan(0);
    for (const w of written) expect(w.filePath ?? w.dirPath).toMatch(/^D:\/Knowledge\/mnemo-mind\//);
    for (const c of host.calls.filter((x) => x.action === 'mnemosyne.ingest')) {
      expect((c.payload as { vault: string }).vault).toBe(PACK_VAULT);
    }
    // The footer now names the pack folder, not the old one.
    expect(screen.getByText(`Copies are kept in ${PACK_FOLDER}`)).toBeInTheDocument();
  });

  it('with no knowledge folder chosen yet, says to choose it in the Hub and writes nothing', async () => {
    fakeWeb();
    const host = fakeHost(async () => ({ state: { library: { folder: null, batches: [] } } }), 'NO_KNOWLEDGE_ROOT');
    render(<App invoke={host.invoke} />);
    await waitFor(() => expect(screen.getAllByText('Nothing in memory yet')).toHaveLength(5));
    await addFirstOpenstax();
    await waitFor(() => expect(screen.getByText('Choose where knowledge goes in the Hub that just opened, then try again.')).toBeInTheDocument());
    for (const action of ['dialog.selectFolder', 'dialog.writeFile', 'dialog.mkdir', 'mnemosyne.ingest']) {
      expect(host.calls.some((c) => c.action === action), action).toBe(false);
    }
  });
});
