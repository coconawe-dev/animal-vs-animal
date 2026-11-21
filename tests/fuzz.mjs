// 무작위 편성 퍼즈 테스트 — 드문 크래시/NaN/정지 상태를 찾는다
import { createBattle, simulate } from '../src/sim.js';
import { ANIMALS, ARENAS } from '../src/config.js';

const ids = ANIMALS.map((a) => a.id);
let seed = 1;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = (n) => Array.from({ length: n }, () => ids[Math.floor(rnd() * ids.length)]);
let fails = 0, maxT = 0, draws = 0, timeouts = 0;
for (let i = 0; i < 2000; i++) {
  const bn = 1 + Math.floor(rnd() * 4);
  const rn = 1 + Math.floor(rnd() * 4);
  const blue = [...new Set(pick(bn))];
  const red = [...new Set(pick(rn))];
  const arena = ARENAS[Math.floor(rnd() * ARENAS.length)].id;
  const s = createBattle({ blue, red, arenaId: arena, seed: (rnd() * 1e9) | 0 });
  simulate(s, 1 / 60, 300);
  if (!s.over) { fails++; console.log('종료 안 됨', blue, red, arena); continue; }
  if (s.endReason === 'timeout') timeouts++;
  if (s.winner === 'draw') draws++;
  maxT = Math.max(maxT, s.time);
  for (const u of s.units) {
    if (![u.x, u.z, u.hp, u.facing].every(Number.isFinite)) { fails++; console.log('NaN', blue, red, u.id); }
    if (Math.hypot(u.x, u.z) > 15.6) { fails++; console.log('경기장 이탈', u.id, u.x.toFixed(1), u.z.toFixed(1)); }
  }
  if (s.units.every((u) => u.dmgDealt === 0) && s.time > 5) { fails++; console.log('전투 없음', blue, red); }
}
console.log(`\n2000판 — 실패 ${fails} · 최장 ${maxT.toFixed(1)}초 · 무승부 ${draws} · 시간초과 ${timeouts}`);
