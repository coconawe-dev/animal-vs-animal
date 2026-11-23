// 무작위 편성 퍼즈 테스트 — 드문 크래시/NaN/정지 상태를 찾는다.
// 유닛 수·무기·배치 좌표를 무작위로 섞어 ARBS 샌드박스 조건을 흉내 낸다.
import { createBattle, simulate, step, possessUnit, releasePossession, setUnitInput } from '../src/sim.js';
import { CREATURE_IDS, WEAPONS, ARENAS, TUNING, ITEM_IDS } from '../src/config.js';

const wids = WEAPONS.map((w) => w.id);
let seed = 7;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

function side(team, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const x = (rnd() * 2 - 1) * (TUNING.ARENA_RADIUS + 2);
    const z = (rnd() * 2 - 1) * (TUNING.ARENA_RADIUS + 2);
    out.push({
      id: pick(CREATURE_IDS),
      x: team === 'blue' ? -Math.abs(x) - 1 : Math.abs(x) + 1,
      z,
      weapon: rnd() < 0.45 ? pick(wids) : 'none',
    });
  }
  return out;
}

let fails = 0, maxT = 0, draws = 0, timeouts = 0, maxUnits = 0;
const N = 600;
for (let i = 0; i < N; i++) {
  const bn = 1 + Math.floor(rnd() * 10);
  const rn = 1 + Math.floor(rnd() * 10);
  const arena = pick(ARENAS).id;
  const s = createBattle({ blue: side('blue', bn), red: side('red', rn), arenaId: arena, seed: (rnd() * 1e9) | 0 });
  maxUnits = Math.max(maxUnits, s.units.length);
  simulate(s, 1 / 60, 300);
  if (!s.over) { fails++; console.log('종료 안 됨', i); continue; }
  if (s.endReason === 'timeout') timeouts++;
  if (s.winner === 'draw') draws++;
  maxT = Math.max(maxT, s.time);
  for (const u of s.units) {
    if (![u.x, u.z, u.y, u.hp, u.facing, u.spin].every(Number.isFinite)) { fails++; console.log('NaN', u.id); }
    if (Math.hypot(u.x, u.z) > TUNING.ARENA_RADIUS + 0.6) { fails++; console.log('경기장 이탈', u.id); }
  }
  if (s.units.every((u) => u.dmgDealt === 0) && s.time > 5) { fails++; console.log('전투 없음', i); }
}

// 60마리 풀 배치도 몇 번
for (let k = 0; k < 5; k++) {
  const s = createBattle({ blue: side('blue', 30), red: side('red', 30), arenaId: pick(ARENAS).id, seed: 1000 + k });
  simulate(s, 1 / 60, 300);
  maxUnits = Math.max(maxUnits, s.units.length);
  if (!s.over) { fails++; console.log('60마리 종료 안 됨'); }
  for (const u of s.units) {
    if (![u.x, u.z, u.y, u.hp].every(Number.isFinite)) { fails++; console.log('60마리 NaN', u.id); }
  }
}

// 100마리(50 vs 50) · 비대칭(80 vs 10) 대난전
for (let k = 0; k < 4; k++) {
  const s = createBattle({ blue: side('blue', 50), red: side('red', 50), arenaId: pick(ARENAS).id, seed: 2000 + k });
  simulate(s, 1 / 60, 360);
  maxUnits = Math.max(maxUnits, s.units.length);
  if (!s.over) { fails++; console.log('100마리 종료 안 됨'); }
  for (const u of s.units) {
    if (![u.x, u.z, u.y, u.hp, u.spin].every(Number.isFinite)) { fails++; console.log('100마리 NaN', u.id); }
    if (Math.hypot(u.x, u.z) > TUNING.ARENA_RADIUS + 0.6) { fails++; console.log('100마리 이탈', u.id); }
  }
}
for (let k = 0; k < 3; k++) {
  const s = createBattle({ blue: side('blue', 80), red: side('red', 10), arenaId: pick(ARENAS).id, seed: 3000 + k });
  simulate(s, 1 / 60, 360);
  maxUnits = Math.max(maxUnits, s.units.length);
  if (!s.over) { fails++; console.log('80 vs 10 종료 안 됨'); }
  if (!s.units.every((u) => [u.x, u.z, u.hp].every(Number.isFinite))) { fails++; console.log('80 vs 10 NaN'); }
}

// 전장 아이템 + 직접 조종 퍼즈 — 구조물이 섞여도 NaN/정지/이탈이 없어야 한다
let itemFails = 0;
for (let k = 0; k < 40; k++) {
  const blue = side('blue', 2 + Math.floor(rnd() * 4));
  const red = side('red', 2 + Math.floor(rnd() * 4));
  for (let i = 0; i < 1 + Math.floor(rnd() * 3); i++) {
    blue.push({ id: pick(ITEM_IDS), x: -(3 + rnd() * 30), z: (rnd() * 2 - 1) * 30, weapon: 'none' });
    red.push({ id: pick(ITEM_IDS), x: (3 + rnd() * 30), z: (rnd() * 2 - 1) * 30, weapon: 'none' });
  }
  const s = createBattle({ blue, red, arenaId: pick(ARENAS).id, seed: 5000 + k });
  maxUnits = Math.max(maxUnits, s.units.length);
  const mob = s.units.find((u) => !u.isStructure);
  if (mob) {
    possessUnit(s, mob.uid);
    for (let i = 0; i < 300 && !s.over; i++) {
      if (i % 24 === 0) {
        setUnitInput(mob, {
          mx: rnd() * 2 - 1, mz: rnd() * 2 - 1, yaw: rnd() * Math.PI * 2,
          atk: rnd() < 0.6, sk: rnd() < 0.3,
        });
      }
      step(s, 1 / 60);
    }
    releasePossession(s);
  }
  simulate(s, 1 / 60, 300);
  if (!s.over) { itemFails++; console.log('아이템 배틀 종료 안 됨', k); }
  for (const u of s.units) {
    if (![u.x, u.z, u.y, u.hp, u.facing, u.aimYaw].every(Number.isFinite)) { itemFails++; console.log('아이템 NaN', u.id); }
    if (Math.hypot(u.x, u.z) > TUNING.ARENA_RADIUS + 0.6) { itemFails++; console.log('아이템 이탈', u.id); }
    if (u.isStructure && (u.spd !== 0 || u.kbResist !== 1)) { itemFails++; console.log('구조물 이동', u.id); }
  }
}
fails += itemFails;

console.log(`\n${N}판 + 100마리/비대칭 난전 + 아이템/조종 40판 — 실패 ${fails} · 최장 ${maxT.toFixed(1)}초 · 무승부 ${draws} · 시간초과 ${timeouts} · 최대 ${maxUnits}마리`);
if (fails) process.exit(1);
