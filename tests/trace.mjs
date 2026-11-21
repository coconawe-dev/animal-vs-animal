// 개발용 단일 배틀 추적
import { createBattle, step } from '../src/sim.js';

const [a, b] = process.argv.slice(2);
const g = createBattle({ blue: [a], red: [b], seed: 101 });
let t = 0;
while (!g.over && t < 60) {
  step(g, 1 / 60); t += 1 / 60;
  if (Math.round(t * 60) % 30 === 0) {
    const u = g.units;
    console.log(t.toFixed(1), u.map((x) => `${x.id}:${x.hp.toFixed(0)} hp pos(${x.x.toFixed(1)},${x.z.toFixed(1)}) st=${x.state} atk=${x.attackTimer.toFixed(2)} lock=${x.castLock.toFixed(2)} hits=${x.hitsLanded} sk=${x.skillCasts}`).join(' | '));
  }
}
console.log('winner', g.winner, 't', g.time.toFixed(1), 'dmg', g.units.map((u) => `${u.id} dealt ${u.dmgDealt.toFixed(0)} hits ${u.hitsLanded} skills ${u.skillCasts}`));
