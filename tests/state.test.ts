import { describe, it, expect } from 'vitest';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RunStore } from '../src/state.ts';

describe('RunStore', () => {
  it('devuelve el estado inicial si no hay archivo', () => {
    const store = new RunStore(mkdtempSync(join(tmpdir(), 'run-')));
    expect(store.load()).toEqual({ step: 'spec', specRevisions: 0, buildRounds: 0, paused: false });
  });

  it('guarda y vuelve a cargar', () => {
    const store = new RunStore(mkdtempSync(join(tmpdir(), 'run-')));
    const s = store.load();
    s.step = 'build';
    s.buildRounds = 2;
    store.save(s);
    expect(new RunStore(store.dir).load()).toEqual(s);
  });

  it('numera los artefactos en orden y sobrevive a reinicios', () => {
    const store = new RunStore(join(mkdtempSync(join(tmpdir(), 'run-')), 'nested'));
    store.artifact('spec-prompt.md', 'hola');
    store.artifact('spec.json', { a: 1 });
    new RunStore(store.dir).artifact('build.json', { b: 2 });
    const files = readdirSync(store.dir).filter((f) => f !== 'state.json').sort();
    expect(files).toEqual(['001-spec-prompt.md', '002-spec.json', '003-build.json']);
    expect(JSON.parse(readFileSync(join(store.dir, '002-spec.json'), 'utf8'))).toEqual({ a: 1 });
  });

  it('suma coste y tiempo de los agentes; Codex no informa de coste', () => {
    const store = new RunStore(mkdtempSync(join(tmpdir(), 'run-')));
    store.artifact('spec-writer-prompt.md', 'no cuenta');
    store.artifact('spec-writer-output.json', { agent: 'claude:opus', ms: 60000, raw: JSON.stringify({ total_cost_usd: 0.5 }) });
    store.artifact('reviewer-security-output.json', { agent: 'codex:default', ms: 30000, raw: '{}' });
    store.artifact('builder-output.json', { agent: 'claude:opus', ms: 90000, raw: JSON.stringify({ total_cost_usd: 1.25 }) });
    const c = store.costs();
    expect(c.agents).toEqual([
      { role: 'spec-writer', agent: 'claude:opus', ms: 60000, usd: 0.5 },
      { role: 'reviewer-security', agent: 'codex:default', ms: 30000, usd: null },
      { role: 'builder', agent: 'claude:opus', ms: 90000, usd: 1.25 },
    ]);
    expect(c.usd).toBe(1.75);
    expect(c.ms).toBe(180000);
    expect(c.summary).toBe('Coste: 1.75 $ en 3 min (sin contar 1 llamada a Codex, que no informa de coste)');
  });
});
