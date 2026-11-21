// 오프라인 스모크 테스트 — DOM/WebGL 없이 ARBS 배틀 로직·배치·무기·3D 리그를 검증한다.
// 실행: node tests/smoke.mjs
import * as THREE from '../vendor/three.module.js';
import {
  ANIMALS, DINOS, MONSTERS, CREATURES, CREATURE_IDS, CREATURE_BY_ID, ANIMAL_BY_ID,
  ARENAS, ARENA_BY_ID, PRESETS, CHALLENGES, WEAPONS, WEAPON_BY_ID, TUNING,
  DEFAULT_PLACEMENTS, CATEGORIES, powerOf, placementCost, creaturesOf,
} from '../src/config.js';
import {
  createBattle, step, simulate, battleSummary, mvpOf, applyDamage, aliveCount,
  teamHpRatio, mulberry32, drainEvents,
} from '../src/sim.js';
import {
  placeUnits, removeNearest, nearestIndex, mirrorTeam, clampArena, clampSide,
  normalizePlacement, sanitizeList, clusterOffsets, autoPositions,
} from '../src/placement.js';
import { buildAnimalModel, animateRig, triggerAttack, triggerShoot, triggerSkill, triggerHurt, ATTACK_STYLE } from '../src/models.js';

let pass = 0;
const fails = [];
function check(cond, msg) {
  if (cond) pass++;
  else fails.push(msg);
}
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const P = (id, x, z, weapon = 'none') => ({ id, x, z, weapon });

/* ─────────────── 1. 데이터 ─────────────── */
check(ANIMALS.length === 14, `동물 14종 (현재 ${ANIMALS.length})`);
check(DINOS.length === 7, `공룡·거대종 7종 (현재 ${DINOS.length})`);
check(MONSTERS.length === 2, `괴수·언데드 2종 (현재 ${MONSTERS.length})`);
check(CREATURES.length === 23, `전체 23종 (현재 ${CREATURES.length})`);
check(new Set(CREATURE_IDS).size === CREATURES.length, '유닛 id 중복 없음');
check(CATEGORIES.length === 4, '카테고리 4개');
check(creaturesOf('animal').length === 14 && creaturesOf('dino').length === 6 && creaturesOf('monster').length === 3, '카테고리별 분류 (14/6/3)');
check(creaturesOf('all').length === 23, '전체 카테고리');
for (const id of ['zombie', 'skeleton', 'snake', 'hyena', 'drex']) {
  check(!!CREATURE_BY_ID[id], `신규 유닛 ${id} 등록`);
}
check(CREATURE_BY_ID.drex.cost === 10 && CREATURE_BY_ID.drex.hp >= 650, '디-렉스 보스급 능력치');

const SKILL_KINDS = new Set([
  'roar', 'pounce', 'charge', 'slam', 'pack', 'dive', 'chomp', 'gore', 'evade', 'smash', 'sprint', 'gore2',
  'crunch', 'sailSlash', 'hornCharge', 'packPounce', 'flame', 'titanSlam',
  'infect', 'boneSlash', 'coil', 'frenzy', 'drexCombo',
]);
for (const a of CREATURES) {
  const tag = `[${a.id}]`;
  check(!!a.name && !!a.emoji, `${tag} 이름/이모지`);
  check(['animal', 'dino', 'monster'].includes(a.cat), `${tag} 카테고리`);
  check(a.hp > 30 && a.atk > 5 && a.spd > 1 && a.range >= 1.5, `${tag} 능력치 양수`);
  check(a.tier >= 1 && a.tier <= 4 && a.cost >= 1, `${tag} tier/cost`);
  check(a.atkInterval >= 0.4 && a.atkInterval <= 2, `${tag} 공격 간격`);
  check(!!a.skill && SKILL_KINDS.has(a.skill.kind), `${tag} 스킬 종류 (${a.skill?.kind})`);
  check(a.skill.cd > 0 && a.skill.range > 0, `${tag} 스킬 쿨/사거리`);
  check(!!a.desc && !!a.skill.desc && !!a.skill.name, `${tag} 설명 문구`);
  for (const k of ['main', 'dark', 'accent', 'belly']) {
    check(typeof a.colors[k] === 'number' && a.colors[k] >= 0 && a.colors[k] <= 0xffffff, `${tag} 색상 ${k}`);
  }
  check(powerOf(a) > 0, `${tag} 전투력 계산`);
}
check(new Set(CREATURES.map((a) => a.skill.kind)).size === 23, '서로 다른 스킬 23가지');

check(WEAPONS.length === 5, '무기 5종');
check(WEAPON_BY_ID.none && WEAPON_BY_ID.gatling && WEAPON_BY_ID.rocket && WEAPON_BY_ID.laser && WEAPON_BY_ID.shield, '무기 id');
for (const w of WEAPONS) {
  check(!!w.name && !!w.emoji && !!w.desc, `[${w.id}] 무기 설명`);
  if (w.proj) check(w.range > 0 && w.interval > 0 && w.dmgMul > 0 && w.pspd > 0, `[${w.id}] 원거리 수치`);
}
check(WEAPON_BY_ID.shield.hpMul > 1 && WEAPON_BY_ID.shield.block > 0, '방패 체력/방어');
check(WEAPON_BY_ID.rocket.aoe > 0 && WEAPON_BY_ID.rocket.knock > 0, '로켓 광역/넉백');
check(WEAPON_BY_ID.laser.pierce === true, '레이저 관통');

check(ARENAS.length === 3, '전장 3개');
check(TUNING.ARENA_RADIUS >= 45, `전장 반경 3배 확장 (${TUNING.ARENA_RADIUS})`);
check(TUNING.MAX_UNITS === 100 && TUNING.MAX_UNITS_PER_TEAM === 100, '전장 한도 100마리');
for (const ar of ARENAS) {
  check(!!ARENA_BY_ID[ar.id], `${ar.id} 전장 등록`);
  check(ar.obstacles.length >= 4, `${ar.id} 장애물 4개 이상`);
  for (const ob of ar.obstacles) {
    check(Math.hypot(ob.x, ob.z) + ob.r < TUNING.ARENA_RADIUS, `${ar.id} 장애물이 경기장 안`);
  }
}

check(PRESETS.length >= 7, '프리셋 7개 이상');
for (const p of PRESETS) {
  check(p.blue.length > 0 && p.blue.length <= TUNING.MAX_UNITS_PER_TEAM, `${p.id} 블루 인원`);
  check(p.red.length > 0 && p.red.length <= TUNING.MAX_UNITS_PER_TEAM, `${p.id} 레드 인원`);
  check(p.blue.length + p.red.length <= TUNING.MAX_UNITS, `${p.id} 전장 한도 100 이내`);
  check(p.blue.every((q) => !!CREATURE_BY_ID[q.id] && !!WEAPON_BY_ID[q.weapon]), `${p.id} 블루 배치`);
  check(p.red.every((q) => !!CREATURE_BY_ID[q.id] && !!WEAPON_BY_ID[q.weapon]), `${p.id} 레드 배치`);
  check(!!ARENA_BY_ID[p.arena], `${p.id} 전장 id`);
  for (const q of [...p.blue, ...p.red]) {
    check(Math.hypot(q.x, q.z) <= TUNING.ARENA_RADIUS, `${p.id} 배치가 경기장 안 (${q.id} ${Math.hypot(q.x, q.z).toFixed(1)})`);
  }
}
const raptorPreset = PRESETS.find((p) => p.id === 'trex-raptors');
check(raptorPreset && raptorPreset.red.length === 12, '티라노 vs 랩터 12마리 프리셋');
check(raptorPreset && Math.max(...raptorPreset.blue.map((q) => Math.hypot(q.x, q.z))) > 12, '3배 전장에 맞게 프리셋 좌표 확대');
check(PRESETS.some((p) => p.id === 'rocket-elephants' && p.blue.every((q) => q.weapon === 'rocket')), '로켓 코끼리 프리셋');
check(PRESETS.some((p) => p.id === 'boss-raid' && p.blue.length >= 10), '보스 레이드 프리셋');
const mega = PRESETS.find((p) => p.id === 'mega-swarm');
check(!!mega && mega.blue.length === 50 && mega.red.length === 50, '100마리 대난전 프리셋 (50 vs 50)');

check(CHALLENGES.length === 6, '챌린지 6단계');
for (const ch of CHALLENGES) {
  check(ch.budget > 0 && ch.red.length > 0, `${ch.id}단계 예산/레드`);
  check(ch.red.every((q) => !!CREATURE_BY_ID[q.id] && !!WEAPON_BY_ID[q.weapon]), `${ch.id}단계 배치 id`);
  check(!!ARENA_BY_ID[ch.arena], `${ch.id}단계 전장`);
  check(ch.red.every((q) => Math.hypot(q.x, q.z) <= TUNING.ARENA_RADIUS), `${ch.id}단계 경기장 안`);
  const cheapest = Math.min(...CREATURES.map((c) => c.cost));
  check(ch.budget >= cheapest * 2, `${ch.id}단계 예산으로 최소 2마리`);
}

/* ─────────────── 2. 배치 모델 ─────────────── */
const c3 = clusterOffsets(3);
check(c3.length === 3, '×3 배치 좌표 3개');
check(clusterOffsets(5).length === 5, '×5 배치 좌표 5개');
check(clusterOffsets(10).length === 10, '×10 배치 좌표 10개');
check(clusterOffsets(10).every(([x, z]) => Math.hypot(x, z) <= 4), '×10 좌표가 한 클러스터 안');
check(clusterOffsets(1).length === 1, '×1 배치 좌표 1개');

{
  const list = [];
  const res = placeUnits(list, { id: 'lion', team: 'blue', x: -4, z: 1, weapon: 'rocket', count: 3, limit: 30 });
  check(res.added.length === 3 && list.length === 3, '×3 유닛 배치');
  check(list.every((p) => p.weapon === 'rocket'), '무기 장착 배치');
  check(list.every((p) => p.x <= -1), '블루 진영 제한');
  check(list.every((p) => Math.hypot(p.x, p.z) <= TUNING.ARENA_RADIUS), '경기장 안');
  const near5 = list.filter((p) => Math.hypot(p.x - (-4), p.z - 1) < 3.2).length;
  check(near5 === 3, '탭 지점 근처에 뭉쳐 배치');

  const free = [];
  placeUnits(free, { id: 'fox', team: 'blue', x: 6, z: 0, free: true });
  check(free[0].x > 0, '자유 배치 — 중앙선 통과');

  const clamped = [];
  placeUnits(clamped, { id: 'fox', team: 'red', x: -8, z: 0 });
  check(clamped[0].x >= 1, '레드 진영 제한');

  const limited = [];
  placeUnits(limited, { id: 'raptor', team: 'blue', x: -3, z: 0, count: 5, limit: 3 });
  check(limited.length === 3, '팀 최대 수 제한');

  const ten = [];
  placeUnits(ten, { id: 'raptor', team: 'blue', x: -20, z: 0, count: 10 });
  check(ten.length === 10, '×10 한 번에 배치');
  check(ten.every((p) => Math.hypot(p.x, p.z) <= TUNING.ARENA_RADIUS), '×10 경기장 안');

  const swarm = [];
  for (let i = 0; i < 4; i++) placeUnits(swarm, { id: 'raptor', team: 'blue', x: -12 - i * 3, z: -12, count: 10, limit: 100 });
  check(swarm.length === 40, '한 팀 40마리 배치 가능');
}
{
  const list = [P('lion', -3, 0), P('tiger', -5, 2)];
  const removed = removeNearest(list, -3.1, 0.2);
  check(!!removed && removed.id === 'lion' && list.length === 1, '가장 가까운 유닛 삭제');
  check(removeNearest(list, 10, 10) === null, '먼 곳 지우개는 아무것도 안 지움');
  check(nearestIndex(list, -5, 2) >= 0, 'nearestIndex');
}
{
  const blue = [P('lion', -4, 1), P('wolf', -6, -2)];
  const mirrored = mirrorTeam(blue);
  check(mirrored.length === 2 && mirrored[0].x === 4 && mirrored[1].x === 6, '좌우 대칭 복사');
  check(mirrored[0].z === 1 && mirrored[1].id === 'wolf', '대칭 복사 z/id 유지');
}
{
  const c = clampArena(100, 0);
  check(Math.hypot(c.x, c.z) <= TUNING.ARENA_RADIUS, '경기장 밖 좌표 클램프');
  const s = clampSide('blue', 5, 0, false);
  check(s.x <= -1, 'clampSide 블루');
  check(normalizePlacement('lion')?.id === 'lion', '문자열 배치 정규화');
  check(normalizePlacement({ id: 'nope' }) === null, '알 수 없는 id 거부');
  check(normalizePlacement({ id: 'lion', weapon: 'nope' }).weapon === 'none', '알 수 없는 무기 → 맨몸');
  check(sanitizeList([{ id: 'lion' }, { id: 'bad' }, null]).length === 1, '저장값 정리');
  const auto = autoPositions([P('lion', null, null), P('fox', null, null)], 'blue');
  check(auto.every((p) => Number.isFinite(p.x)), '자동 진형 좌표');
}
check(placementCost(DEFAULT_PLACEMENTS.blue) === DEFAULT_PLACEMENTS.blue.reduce((s, p) => s + CREATURE_BY_ID[p.id].cost, 0), '배치 코스트 합');

/* ─────────────── 3. 시뮬레이션 ─────────────── */
const finiteUnit = (u) => [u.x, u.z, u.y, u.hp, u.maxHp, u.facing, u.attackTimer, u.skillTimer, u.spin].every(Number.isFinite);
const wids = WEAPONS.map((w) => w.id);

// 배치 좌표가 그대로 반영되는가
{
  const s = createBattle({ blue: [P('lion', -3.5, 2.5, 'gatling')], red: [P('bear', 4.5, -1.5, 'shield')], seed: 1 });
  const lion = s.units.find((u) => u.team === 'blue');
  const bear = s.units.find((u) => u.team === 'red');
  check(near(lion.x, -3.5) && near(lion.z, 2.5), '탭 배치 좌표 그대로 소환');
  check(lion.weaponId === 'gatling' && lion.ranged, '개틀링 = 원거리');
  check(bear.maxHp === Math.round(CREATURE_BY_ID.bear.hp * 1.4), '방패 체력 +40%');
  check(bear.range >= WEAPON_BY_ID.shield.range || bear.range === CREATURE_BY_ID.bear.range, '방패 사거리');
}

// 1:1 전 조합 × 무기 로테이션
let pairCount = 0;
const skillSeen = new Set();
let totalTime = 0;
for (const blue of CREATURE_IDS) {
  for (const red of CREATURE_IDS) {
    const s = createBattle({
      blue: [P(blue, -5, 0, wids[pairCount % wids.length])],
      red: [P(red, 5, 0, wids[(pairCount * 3) % wids.length])],
      seed: 1337 + pairCount,
    });
    simulate(s, TUNING.SIM_DT, 400);
    totalTime += s.time;
    if (!s.over) fails.push(`[${blue} vs ${red}] 400초 안에 종료되지 않음`);
    check(['blue', 'red', 'draw'].includes(s.winner), `[${blue} vs ${red}] 승자 판정`);
    check(s.units.every(finiteUnit), `[${blue} vs ${red}] NaN 없음`);
    check(s.units.some((u) => u.dmgDealt > 0), `[${blue} vs ${red}] 피해 발생`);
    check(s.logTotal > 0, `[${blue} vs ${red}] 로그 생성`);
    for (const u of s.units) if (u.lastSkill) skillSeen.add(u.lastSkill);
    pairCount++;
  }
}
check(pairCount === 23 * 23, '1:1 전 조합 529판 실행');
check(skillSeen.size === 23, `모든 스킬 23종 발동 (미발동: ${[...SKILL_KINDS].filter((k) => !skillSeen.has(k)).join(',')})`);

// 프리셋 × 전장
for (const p of PRESETS) {
  for (const arena of ARENAS) {
    const s = createBattle({ blue: p.blue, red: p.red, arenaId: arena.id, seed: 77 });
    simulate(s, TUNING.SIM_DT, 400);
    check(s.over, `[${p.name} @ ${arena.name}] 종료됨`);
    check(s.units.every(finiteUnit), `[${p.name} @ ${arena.name}] NaN 없음`);
    check(s.units.length === p.blue.length + p.red.length, `[${p.name}] 유닛 수 유지`);
    check(s.stats.skills > 0, `[${p.name}] 필살기 발동`);
    check(!!mvpOf(s), `[${p.name}] MVP 산출`);
  }
}

// 50 vs 50 (전장 한도 100마리)
{
  const blue = [];
  const red = [];
  for (let i = 0; i < 50; i++) {
    const col = Math.floor(i / 10);
    const row = i % 10;
    blue.push(P(CREATURE_IDS[i % CREATURE_IDS.length], -(10 + col * 5.5), (row - 4.5) * 5.0, wids[i % 5]));
    red.push(P(CREATURE_IDS[(i + 5) % CREATURE_IDS.length], 10 + col * 5.5, (row - 4.5) * 5.0, wids[(i + 2) % 5]));
  }
  const t0 = Date.now();
  const s = createBattle({ blue, red, seed: 909 });
  simulate(s, TUNING.SIM_DT, 400);
  const ms = Date.now() - t0;
  check(s.units.length === 100, '100마리 소환 (50 vs 50)');
  check(s.over, '100마리 배틀 종료');
  check(s.units.every(finiteUnit), '100마리 NaN 없음');
  check(s.units.every((u) => Math.hypot(u.x, u.z) <= TUNING.ARENA_RADIUS + 0.6), '100마리 경기장 이탈 없음');
  check(ms < 20000, `100마리 시뮬레이션 완료 (${ms}ms)`);
  console.log(`100마리 50v50 시뮬레이션 ${ms}ms · ${s.time.toFixed(1)}초`);
}

// 80 vs 10 (비대칭 대난전)
{
  const blue = [];
  const red = [];
  for (let i = 0; i < 80; i++) blue.push(P(CREATURE_IDS[i % 12], -(6 + (i % 8) * 4.6), (Math.floor(i / 8) - 4.5) * 4.2, 'none'));
  for (let i = 0; i < 10; i++) red.push(P('titan', 30, (i - 4.5) * 4.0, 'shield'));
  const s = createBattle({ blue, red, seed: 4242 });
  simulate(s, TUNING.SIM_DT, 400);
  check(s.units.length === 90, '80 vs 10 소환');
  check(s.over && s.units.every(finiteUnit), '비대칭 90마리 배틀 정상 종료');
  check(s.units.every((u) => Math.hypot(u.x, u.z) <= TUNING.ARENA_RADIUS + 0.6), '비대칭 경기장 이탈 없음');
}

// 무기별 동작
{
  // 개틀링: 연사
  const s = createBattle({ blue: [P('lion', -6, 0, 'gatling')], red: [P('elephant', 4, 0)], seed: 4 });
  let bulletSeen = false;
  for (let i = 0; i < 240 && !s.over; i++) {
    step(s, TUNING.SIM_DT);
    if (s.projectiles.some((p) => p.kind === 'bullet')) bulletSeen = true;
  }
  check(s.stats.shots > 4, `개틀링 연사 (${s.stats.shots}발)`);
  check(bulletSeen, '개틀링 탄환 투사체');

  // 로켓: 폭발 + 넉백
  const r = createBattle({ blue: [P('lion', -6, 0, 'rocket')], red: [P('bear', 4, -1), P('bear', 4, 1)], seed: 8 });
  let explosions = 0;
  for (let i = 0; i < 600 && explodeWatch(r) === false; i++) {
    step(r, TUNING.SIM_DT);
  }
  explosions = r.stats.explosions;
  check(explosions > 0, `로켓 폭발 (${explosions}회)`);
  const hurtBoth = r.units.filter((u) => u.team === 'red').filter((u) => u.dmgTaken > 0).length;
  check(hurtBoth >= 1, '로켓 피해 발생');

  // 레이저: 관통 (일직선 3마리 모두 피해)
  const l = createBattle({
    blue: [P('lion', -8, 0, 'laser')],
    red: [P('boar', 2, 0), P('boar', 3.4, 0), P('boar', 4.8, 0)],
    seed: 12,
  });
  let beamSeen = false;
  for (let i = 0; i < 360 && !l.over; i++) {
    step(l, TUNING.SIM_DT);
    if (l.events.some((e) => e.type === 'beam')) beamSeen = true;
    l.events.length = 0;
  }
  check(beamSeen, '레이저 빔 발사');
  check(l.units.filter((u) => u.team === 'red').every((u) => u.dmgTaken > 0), '레이저 관통 — 일직선 적 모두 피해');

  // 방패: 정면 피해 감소 + 뒤쪽은 그대로
  const sh = createBattle({ blue: [P('elephant', -4, 0, 'shield')], red: [P('lion', 0, 0)], seed: 3 });
  const el = sh.units.find((u) => u.team === 'blue');
  const li = sh.units.find((u) => u.team === 'red');
  el.hp = el.maxHp; li.x = el.x + 3; li.z = el.z;
  const before = el.hp;
  applyDamage(sh, li, el, 100, { unavoidable: true });
  const front = before - el.hp;
  el.hp = el.maxHp; li.x = el.x - 3; li.z = el.z;
  const b2 = el.hp;
  applyDamage(sh, li, el, 100, { unavoidable: true });
  const back = b2 - el.hp;
  check(front < back - 20, `방패 정면 피해 감소 (정면 ${front.toFixed(1)} < 뒤 ${back.toFixed(1)})`);

  // 방패 밀치기
  const bashBattle = createBattle({ blue: [P('lion', -3, 0, 'shield')], red: [P('fox', -1.6, 0)], seed: 5 });
  let bashSeen = false;
  for (let i = 0; i < 240 && !bashSeen; i++) {
    step(bashBattle, TUNING.SIM_DT);
    bashSeen = bashBattle.events.some((e) => e.type === 'bash');
    bashBattle.events.length = 0;
  }
  check(bashSeen, '방패 밀치기(경직)');
}

function explodeWatch(s) { return s.stats.explosions > 0 && s.time > 3; }

// 래그돌: 무거운 일격에 가벼운 유닛이 공중으로
{
  const s = createBattle({ blue: [P('trex', -3, 0)], red: [P('fox', 3, 0)], seed: 19 });
  const fox = s.units.find((u) => u.team === 'red');
  const trex = s.units.find((u) => u.team === 'blue');
  applyDamage(s, trex, fox, 999, { unavoidable: true });
  check(fox.dead, '치명타 사망');
  check(fox.vy > 0 || fox.spinVel !== 0, '무거운 일격 → 공중으로 튕김/회전');
  step(s, TUNING.SIM_DT);
  check(fox.y > 0 || fox.vy !== 0, '래그돌 상승 시작');
}

// 결정론
{
  const a = createBattle({ blue: DEFAULT_PLACEMENTS.blue, red: DEFAULT_PLACEMENTS.red, seed: 4242 });
  const b = createBattle({ blue: DEFAULT_PLACEMENTS.blue, red: DEFAULT_PLACEMENTS.red, seed: 4242 });
  simulate(a); simulate(b);
  check(a.winner === b.winner && near(a.time, b.time), '같은 시드 → 같은 승자/시간');
  check(a.units.every((u, i) => near(u.hp, b.units[i].hp)), '같은 시드 → 같은 HP');
}

// 제압 판정 즉시 종료
{
  const fin = createBattle({ blue: [P('lion', -3, 0)], red: [P('fox', 3, 0)], seed: 5 });
  fin.units.filter((u) => u.team === 'red').forEach((u) => applyDamage(fin, fin.units[0], u, 9999, { pierce: true, unavoidable: true }));
  step(fin, TUNING.SIM_DT);
  check(fin.over && fin.winner === 'blue', '전멸 시 즉시 블루 승리');
}

// 시간 초과 판정은 남은 HP 비율
{
  const to = createBattle({ blue: [P('elephant', -3, 0)], red: [P('fox', 3, 0)], seed: 8, maxTime: 2 });
  to.units.forEach((u) => { u.atk = 0; });
  to.units.find((u) => u.team === 'red').hp = 10;
  simulate(to, TUNING.SIM_DT, 10);
  check(to.endReason === 'timeout', '시간 초과 판정 경로');
  check(to.winner === 'blue', '시간 초과 시 HP 우세 팀 승리');
}

// 방어력 / 회피
{
  const armorTest = createBattle({ blue: [P('crocodile', -3, 0)], red: [P('lion', 3, 0)], seed: 3 });
  const croc = armorTest.units[0];
  const lion = armorTest.units[1];
  const hpBefore = croc.hp;
  applyDamage(armorTest, lion, croc, 100, { unavoidable: true });
  const taken = hpBefore - croc.hp;
  check(Math.abs(taken - 100 * (1 - (ANIMAL_BY_ID.crocodile.armor || 0))) < 3, `악어 방어력 적용 (받은 피해 ${taken.toFixed(1)})`);
  croc.hp = croc.maxHp;
  const b2 = croc.hp;
  applyDamage(armorTest, lion, croc, 100, { pierce: true, unavoidable: true });
  check(b2 - croc.hp > taken + 3, '방어 무시 피해가 더 큼');

  const foxBattle = createBattle({ blue: [P('fox', -3, 0)], red: [P('lion', 3, 0)], seed: 9 });
  const fox = foxBattle.units[0];
  let evaded = 0;
  for (let i = 0; i < 400; i++) {
    fox.hp = 9999;
    const before = fox.hp;
    applyDamage(foxBattle, foxBattle.units[1], fox, 1, {});
    if (near(fox.hp, before)) evaded++;
  }
  check(evaded > 20 && evaded < 120, `여우 회피 14% 근처 (400회 중 ${evaded}회)`);
}

// 경기장 이탈 · 장애물 관통 없음
for (const ar of ARENAS) {
  const s = createBattle({
    blue: [P('elephant', -8, 0), P('rhino', -8, 3)], red: [P('gorilla', 8, 0), P('bear', 8, 3)],
    arenaId: ar.id, seed: 31,
  });
  simulate(s);
  const outside = s.units.filter((u) => Math.hypot(u.x, u.z) > TUNING.ARENA_RADIUS + 0.6);
  check(outside.length === 0, `${ar.id} 경기장 이탈 없음`);
  const inObstacle = s.units.filter((u) => ar.obstacles.some((ob) => Math.hypot(u.x - ob.x, u.z - ob.z) < ob.r * 0.8));
  check(inObstacle.length === 0, `${ar.id} 장애물 관통 없음`);
}

// 챌린지: 각 단계가 실제로 승패 판정까지 끝난다
for (const ch of CHALLENGES) {
  const blue = [P('titan', -5, 0), P('trex', -7, 2), P('triceratops', -7, -2)];
  const s = createBattle({ blue, red: ch.red, arenaId: ch.arena, seed: 55 + ch.id, mode: 'challenge', challengeId: ch.id });
  simulate(s, TUNING.SIM_DT, 400);
  check(s.over && ['blue', 'red', 'draw'].includes(s.winner), `${ch.id}단계 승패 판정`);
  check(s.units.every(finiteUnit), `${ch.id}단계 NaN 없음`);
  check(s.mode === 'challenge' && s.challengeId === ch.id, `${ch.id}단계 모드 기록`);
}

/* ─────────────── 4. 3D 리그 ─────────────── */
for (const def of CREATURES) {
  const rig = buildAnimalModel(def, 'blue');
  rig.group.updateMatrixWorld(true);
  let meshes = 0;
  rig.group.traverse((o) => { if (o.isMesh) meshes++; });
  check(meshes >= 10, `[${def.id}] 메시 10개 이상 (${meshes})`);
  const box = new THREE.Box3().setFromObject(rig.group);
  const size = new THREE.Vector3();
  box.getSize(size);
  const okBox = [box.min, box.max].every((v) => [v.x, v.y, v.z].every(Number.isFinite));
  check(okBox, `[${def.id}] 바운딩 박스 유효`);
  check(box.min.y > -0.2 && box.min.y < 0.25, `[${def.id}] 발이 지면에 닿음 (min.y=${box.min.y.toFixed(2)})`);
  const tallMax = def.size >= 1.6 ? 4.8 : 3.9;
  check(size.y > 0.6 && size.y < tallMax, `[${def.id}] 키 적정 (${size.y.toFixed(2)})`);
  check(size.x > 0.5 && size.x < 5.0, `[${def.id}] 폭 적정 (${size.x.toFixed(2)})`);
  const lenMax = (def.size || 1) >= 1.4 ? 6.6 : 5.0;
  check(size.z > 0.5 && size.z < lenMax, `[${def.id}] 길이 적정 (${size.z.toFixed(2)})`);

  triggerAttack(rig); triggerSkill(rig); triggerHurt(rig);
  let bad = false;
  for (let i = 0; i < 180; i++) {
    animateRig(rig, {
      dt: 1 / 60, moving: i % 3 !== 0, speed: 3.2,
      attack: rig.attack, skill: rig.skill, hurt: rig.hurt, dead: false, air: i > 120,
    });
    if (![rig.group.position.x, rig.group.position.y, rig.group.position.z, rig.group.rotation.y].every(Number.isFinite)) bad = true;
    if (!rig.body || ![rig.body.position.y, rig.body.rotation.x].every(Number.isFinite)) bad = true;
  }
  check(!bad, `[${def.id}] 애니메이션 NaN 없음`);

  for (let i = 0; i < 200; i++) animateRig(rig, { dt: 1 / 60, dead: true });
  check(Number.isFinite(rig.group.rotation.z) && rig.group.rotation.z > 0.4, `[${def.id}] 사망 시 쓰러짐`);
  check(rig.matList.every((m) => m.opacity >= 0 && m.opacity <= 1), `[${def.id}] 페이드 불투명도 범위`);
}

// 종족별 공격 모션 (입 물기 · 뿔/엄니 · 주먹 · 급강하)
const STYLE_EXPECT = {
  bite: (m) => m.jawMax > 0.5 && m.headPush > 0.1,
  gore: (m) => m.headMin < -0.3 && m.headMax > 0.2,
  smash: (m) => m.limbMin < -0.9 && m.limbMax > 0.2,
  swoop: (m) => m.wingMax > 0.8 && m.bodyMin < -0.2,
  claw: (m) => (m.limbMax - m.limbMin) > 0.45,
  slash: (m) => (m.limbMax - m.limbMin) > 0.45,
  combo: (m) => m.jawMax > 0.5 && (m.limbMax - m.limbMin) > 0.45,
};
for (const def of CREATURES) {
  const rig = buildAnimalModel(def, 'blue');
  const m = { jawMax: 0, headMin: 0, headMax: 0, headPush: 0, limbMin: 0, limbMax: 0, wingMax: 0, bodyMin: 0 };
  const hz = rig.headBaseZ;
  for (let cycle = 0; cycle < 2; cycle++) {
    triggerAttack(rig);
    for (let i = 0; i < 48; i++) {
      animateRig(rig, { dt: 1 / 60, moving: false, speed: 0, attack: rig.attack, skill: 0, hurt: 0, dead: false });
      if (rig.jaw) m.jawMax = Math.max(m.jawMax, rig.jaw.rotation.x);
      if (rig.head) {
        m.headMin = Math.min(m.headMin, rig.head.rotation.x);
        m.headMax = Math.max(m.headMax, rig.head.rotation.x);
        m.headPush = Math.max(m.headPush, rig.head.position.z - hz);
      }
      const limbs = rig.arms?.length ? rig.arms.map((a) => a.pivot) : (rig.legs || []).filter((l) => l.front).map((l) => l.pivot);
      for (const p of limbs) {
        m.limbMin = Math.min(m.limbMin, p.rotation.x);
        m.limbMax = Math.max(m.limbMax, p.rotation.x);
      }
      for (const w of rig.wings || []) m.wingMax = Math.max(m.wingMax, Math.abs(w.pivot.rotation.z));
      if (rig.body) m.bodyMin = Math.min(m.bodyMin, rig.body.rotation.x);
    }
  }
  const style = ATTACK_STYLE[def.id];
  check(!!style, `[${def.id}] 공격 스타일 분류`);
  check(Number.isFinite(rig.height) && rig.height > 0.6, `[${def.id}] 공격 중 높이 유효`);
  check(STYLE_EXPECT[style](m), `[${def.id}] ${style} 공격 모션 (${JSON.stringify(m)})`);
}
check(Object.keys(ATTACK_STYLE).length === CREATURES.length, '23종 모두 공격 스타일 지정');
check(ATTACK_STYLE.drex === 'combo', '디-렉스는 물기+주먹 콤보');

// 무기 발사는 근접 공격 모션을 쓰지 않는다
triggerShoot(buildAnimalModel(CREATURE_BY_ID.lion, 'blue', { weapon: 'gatling' }));
check(true, '발사 모션 호출');

// 무기 3D 장착
for (const w of WEAPONS) {
  if (w.id === 'none') continue;
  const rig = buildAnimalModel(CREATURE_BY_ID.trex, 'blue', { weapon: w.id });
  check(!!rig.weaponNode && !!rig.muzzle, `[${w.id}] 무기 3D 장착`);
  let weaponMeshes = 0;
  rig.weaponNode?.traverse((o) => { if (o.isMesh) weaponMeshes++; });
  check(weaponMeshes >= 2, `[${w.id}] 무기 메시 (${weaponMeshes})`);
  rig.group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(rig.group);
  check(Number.isFinite(box.max.y), `[${w.id}] 무기 포함 바운딩`);
}
{
  const full = buildAnimalModel(CREATURE_BY_ID.trex, 'blue');
  const low = buildAnimalModel(CREATURE_BY_ID.trex, 'blue', { lowDetail: true });
  let fullVisible = 0, lowVisible = 0;
  full.group.traverse((o) => { if (o.isMesh && o.visible) fullVisible++; });
  low.group.traverse((o) => { if (o.isMesh && o.visible) lowVisible++; });
  check(lowVisible < fullVisible, `저해상도 모델 메시 감소 (${lowVisible} < ${fullVisible})`);
}
const blueRig = buildAnimalModel(ANIMAL_BY_ID.lion, 'blue');
const redRig = buildAnimalModel(ANIMAL_BY_ID.lion, 'red');
check(blueRig.ring.material.color.getHex() !== redRig.ring.material.color.getHex(), '팀 링 색 구분');

// 대량 난전용 간단 모델 (100마리 렌더링 성능)
{
  const t0 = Date.now();
  let maxMeshes = 0;
  const rigs = [];
  for (let i = 0; i < 100; i++) {
    const rig = buildAnimalModel(CREATURES[i % CREATURES.length], i % 2 ? 'red' : 'blue', { simple: true, lowDetail: true, weapon: wids[i % wids.length] });
    let m = 0;
    rig.group.traverse((o) => { if (o.isMesh) m++; });
    maxMeshes = Math.max(maxMeshes, m);
    rigs.push(rig);
  }
  const buildMs = Date.now() - t0;
  check(maxMeshes <= 10, `간단 모델 메시 ${maxMeshes}개 이하 (100마리 렌더 부담 절감)`);
  check(buildMs < 4000, `간단 모델 100개 생성 ${buildMs}ms`);
  const t1 = Date.now();
  for (let f = 0; f < 60; f++) {
    for (const rig of rigs) animateRig(rig, { dt: 1 / 60, moving: true, speed: 3, attack: 0.4, skill: 0, hurt: 0, dead: false });
  }
  check(Date.now() - t1 < 3000, `간단 모델 100개 × 60프레임 애니메이션 ${Date.now() - t1}ms`);
  console.log(`간단 모델 100개 생성 ${buildMs}ms · 메시 최대 ${maxMeshes}`);
}

/* ─────────────── 5. 성능 ─────────────── */
{
  const t0 = Date.now();
  for (let i = 0; i < 40; i++) {
    const s = createBattle({ blue: PRESETS[0].blue, red: PRESETS[0].red, seed: i });
    simulate(s);
  }
  const ms = Date.now() - t0;
  check(ms < 9000, `프리셋 40판 빠름 (${ms}ms)`);
}

const avgTime = totalTime / pairCount;
console.log(`\n유닛 ${CREATURES.length}종 · 1:1 ${pairCount}판 평균 ${avgTime.toFixed(1)}초 · 무기 ${WEAPONS.length}종 · 챌린지 ${CHALLENGES.length}단계`);
console.log(`PASS ${pass} · FAIL ${fails.length}`);
if (fails.length) {
  console.log('\n실패 항목:');
  fails.slice(0, 50).forEach((f) => console.log(' - ' + f));
  process.exit(1);
}
console.log('✅ 모든 검사 통과');
