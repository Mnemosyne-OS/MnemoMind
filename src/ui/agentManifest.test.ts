/**
 * MnemoMind's agent actions (doc 149): the manifest's declaration passes the HOST's own check,
 * every declared action has its handler (a declared action without one would be offered to
 * agents and fail), and the enums and limits it declares are the app's own.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { agentActionsFromManifest } from '../../../infinity-edition/src/main/plugins/cartridgeAgentActions';
import { SUBDOMAINS } from '../sources/catalogue';
import { WIKI_LANGS } from '../sources/sourceInfo';
import { ENTRIES_MAX, SOURCE_IDS } from './mindAgent';

const root = join(__dirname, '..', '..');
const manifest = JSON.parse(readFileSync(join(root, 'mnemo-plugin.json'), 'utf8')) as unknown;
const source = readFileSync(join(root, 'src', 'ui', 'mindAgent.ts'), 'utf8');
const block = source.slice(source.indexOf('// agent-actions:begin'), source.indexOf('// agent-actions:end'));
const handlers = [...block.matchAll(/^ {4}(\w+): (?:async )?\(/gm)].map((m) => m[1]);

function declared() {
  const r = agentActionsFromManifest(manifest);
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

describe("MnemoMind's agent actions", () => {
  it("pass the host's check of the manifest", () => {
    const r = agentActionsFromManifest(manifest);
    expect(r.ok ? 'ok' : r.error).toBe('ok');
  });

  it('every declared action has its handler, and no handler is undeclared', () => {
    expect(handlers.length).toBeGreaterThan(5);
    expect([...handlers].sort()).toEqual(declared().map((a) => a.id).sort());
  });

  it('nothing spends credits', () => {
    expect(declared().filter((a) => a.effect === 'spend')).toEqual([]);
  });

  it('declares the app\'s own topics, sources, languages and limits', () => {
    for (const a of declared()) {
      if (a.params.topic) expect(a.params.topic).toMatchObject({ enum: [...SUBDOMAINS] });
      if (a.params.source) expect(a.params.source).toMatchObject({ enum: [...SOURCE_IDS] });
      if (a.params.lang) expect(a.params.lang).toMatchObject({ enum: [...WIKI_LANGS] });
    }
    expect(declared().find((a) => a.id === 'entries')!.params.limit).toMatchObject({ minimum: 1, maximum: ENTRIES_MAX });
  });
});
