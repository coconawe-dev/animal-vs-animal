import { createBattle, simulate } from '../src/sim.js';
import { PRESETS } from '../src/config.js';
for (const p of PRESETS) {
  let casts = 0, hits = 0, crits = 0, dodges = 0, kills = 0;
  for (let i = 0; i < 10; i++) {
    const s = createBattle({ blue: p.blue, red: p.red, arenaId: p.arena, seed: i * 7 + 3 });
    simulate(s);
    casts += s.stats.skills; hits += s.stats.hits; crits += s.stats.crits; dodges += s.stats.dodges; kills += s.stats.kills;
  }
  console.log(p.name.padEnd(16), '필살기', (casts/10).toFixed(1), '타격', (hits/10).toFixed(0), '크리', (crits/10).toFixed(1), '회피', (dodges/10).toFixed(1), '처치', (kills/10).toFixed(1));
}
