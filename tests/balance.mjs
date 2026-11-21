// 개발용 밸런스 표 (tests/smoke.mjs 아님 · 수동 실행)
import { createBattle, simulate, battleSummary } from '../src/sim.js';
import { ANIMAL_IDS } from '../src/config.js';

const s = createBattle({ blue: ['lion', 'wolf', 'eagle'], red: ['tiger', 'elephant', 'crocodile'], arenaId: 'savanna', seed: 7 });
simulate(s);
console.log(JSON.stringify(battleSummary(s), null, 1));

const wins = {};
const N = 10;
for (const a of ANIMAL_IDS) {
  for (const b of ANIMAL_IDS) {
    if (a === b) continue;
    let wa = 0;
    for (let k = 0; k < N; k++) {
      const g = createBattle({ blue: [a], red: [b], seed: 100 + k * 17 });
      simulate(g);
      if (g.winner === 'blue') wa++;
    }
    wins[a] = wins[a] || {};
    wins[a][b] = wa;
  }
}
console.log('\n1:1 승수 (6판 중)');
for (const a of ANIMAL_IDS) {
  const row = ANIMAL_IDS.filter((b) => b !== a).map((b) => wins[a][b]).join(' ');
  const tot = Object.values(wins[a]).reduce((x, y) => x + y, 0);
  console.log(a.padEnd(10), String(tot).padStart(3), '/ 110  ', row);
}
