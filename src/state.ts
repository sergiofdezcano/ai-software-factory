import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RunState } from './types.ts';

export function initialState(): RunState {
  return { step: 'spec', specRevisions: 0, buildRounds: 0, paused: false };
}

// Estado y evidencia de una ejecución en runs/<app>-<issue>/.
export class RunStore {
  constructor(readonly dir: string) {}

  private get stateFile() {
    return join(this.dir, 'state.json');
  }

  load(): RunState {
    if (!existsSync(this.stateFile)) return initialState();
    return JSON.parse(readFileSync(this.stateFile, 'utf8')) as RunState;
  }

  save(state: RunState): void {
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(this.stateFile, JSON.stringify(state, null, 2));
  }

  // Guarda un artefacto de auditoría con prefijo numérico creciente.
  artifact(name: string, content: unknown): string {
    mkdirSync(this.dir, { recursive: true });
    const last = readdirSync(this.dir)
      .map((f) => Number.parseInt(f.slice(0, 3), 10))
      .filter((n) => !Number.isNaN(n))
      .reduce((a, b) => Math.max(a, b), 0);
    const file = join(this.dir, `${String(last + 1).padStart(3, '0')}-${name}`);
    writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
    return file;
  }

  // Coste y tiempo de cada llamada a un agente, leídos de los artefactos *-output.json.
  // claude -p da total_cost_usd; codex exec no da coste (usd: null).
  costs() {
    const agents = existsSync(this.dir)
      ? readdirSync(this.dir)
          .filter((f) => /^\d{3}-.+-output\.json$/.test(f))
          .sort()
          .map((f) => {
            const o = JSON.parse(readFileSync(join(this.dir, f), 'utf8')) as { agent: string; ms: number; raw: string };
            const m = /"total_cost_usd":\s*([\d.]+)/.exec(o.raw ?? '');
            return { role: f.slice(4, -'-output.json'.length), agent: o.agent, ms: o.ms, usd: m ? Number(m[1]) : null };
          })
      : [];
    const usd = Math.round(agents.reduce((a, r) => a + (r.usd ?? 0), 0) * 100) / 100;
    const ms = agents.reduce((a, r) => a + r.ms, 0);
    const unpriced = agents.filter((r) => r.usd === null).length;
    const note = unpriced ? ` (sin contar ${unpriced} llamada${unpriced > 1 ? 's' : ''} a Codex, que no informa de coste)` : '';
    return { agents, usd, ms, summary: `Coste: ${usd.toFixed(2)} $ en ${Math.round(ms / 60000)} min${note}` };
  }
}
