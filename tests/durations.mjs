import { createBattle, simulate } from '../src/sim.js';
import { PRESETS } from '../src/config.js';
for (const p of PRESETS) {
  const times = [];
  let wins = { blue: 0, red: 0, draw: 0 };
  for (let i = 0; i < 12; i++) {
    const s = createBattle({ blue: p.blue, red: p.red, arenaId: p.arena, seed: i * 31 + 5 });
    simulate(s);
    times.push(s.time); wins[s.winner]++;
  }
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  console.log(p.name.padEnd(16), '평균', avg.toFixed(1) + '초', '최소', Math.min(...times).toFixed(1), '최대', Math.max(...times).toFixed(1), JSON.stringify(wins));
}
