// 오프라인 스모크 테스트 — DOM/WebGL 없이 게임 로직과 3D 리그를 검증한다.
// 실행: node tests/smoke.mjs
import * as THREE from '../vendor/three.module.js';
import {
  ANIMALS, ANIMAL_IDS, ANIMAL_BY_ID, ARENAS, ARENA_BY_ID, PRESETS, TUNING, powerOf,
} from '../src/config.js';
import {
  createBattle, step, simulate, battleSummary, mvpOf, applyDamage, aliveCount,
  teamHpRatio, mulberry32,
} from '../src/sim.js';
import { buildAnimalModel, animateRig, triggerAttack, triggerSkill, triggerHurt } from '../src/models.js';

let pass = 0;
const fails = [];
function check(cond, msg) {
  if (cond) pass++;
  else fails.push(msg);
}
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

/* ─────────────── 1. 데이터 ─────────────── */
check(ANIMALS.length >= 10, `동물은 10종 이상이어야 함 (현재 ${ANIMALS.length})`);
check(new Set(ANIMAL_IDS).size === ANIMALS.length, '동물 id 중복 없음');
const SKILL_KINDS = new Set(['roar', 'pounce', 'charge', 'slam', 'pack', 'dive', 'chomp', 'gore', 'evade', 'smash', 'sprint', 'gore2']);
for (const a of ANIMALS) {
  const tag = `[${a.id}]`;
  check(!!a.name && !!a.emoji, `${tag} 이름/이모지`);
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
check(new Set(ANIMALS.map((a) => a.skill.kind)).size >= 10, '서로 다른 스킬 종류 10가지 이상');

check(ARENAS.length >= 3, '전장 3개 이상');
for (const ar of ARENAS) {
  check(!!ARENA_BY_ID[ar.id], `${ar.id} 전장 등록`);
  check(ar.obstacles.length >= 4, `${ar.id} 장애물 4개 이상`);
  for (const ob of ar.obstacles) {
    check(Math.hypot(ob.x, ob.z) + ob.r < TUNING.ARENA_RADIUS, `${ar.id} 장애물이 경기장 안 (${ob.x},${ob.z})`);
  }
}

check(PRESETS.length >= 4, '프리셋 4개 이상');
for (const p of PRESETS) {
  check(p.blue.length > 0 && p.blue.length <= TUNING.MAX_TEAM, `${p.id} 블루 인원`);
  check(p.red.length > 0 && p.red.length <= TUNING.MAX_TEAM, `${p.id} 레드 인원`);
  check(p.blue.every((id) => !!ANIMAL_BY_ID[id]), `${p.id} 블루 동물 id`);
  check(p.red.every((id) => !!ANIMAL_BY_ID[id]), `${p.id} 레드 동물 id`);
  check(!!ARENA_BY_ID[p.arena], `${p.id} 전장 id`);
}

/* ─────────────── 2. 시뮬레이션 ─────────────── */
const finiteUnit = (u) => [u.x, u.z, u.y, u.hp, u.maxHp, u.facing, u.attackTimer, u.skillTimer].every(Number.isFinite);

// 1:1 모든 조합
let pairCount = 0;
const skillSeen = new Set();
let totalTime = 0;
for (const blue of ANIMAL_IDS) {
  for (const red of ANIMAL_IDS) {
    const s = createBattle({ blue: [blue], red: [red], seed: 1337 + pairCount });
    simulate(s, TUNING.SIM_DT, 400);
    totalTime += s.time;
    if (!s.over) fails.push(`[${blue} vs ${red}] 400초 안에 종료되지 않음`);
    check(['blue', 'red', 'draw'].includes(s.winner), `[${blue} vs ${red}] 승자 판정 (${s.winner})`);
    check(s.units.every(finiteUnit), `[${blue} vs ${red}] NaN 없음`);
    const dmg = s.units.map((u) => u.dmgDealt);
    check(dmg.some((d) => d > 0), `[${blue} vs ${red}] 피해 발생`);
    check(s.logTotal > 0, `[${blue} vs ${red}] 로그 생성`);
    for (const u of s.units) if (u.lastSkill) skillSeen.add(u.def.skill.kind);
    pairCount++;
  }
}
check(pairCount === ANIMAL_IDS.length * ANIMAL_IDS.length, '1:1 전 조합 실행');

// 팀 배틀 (프리셋 × 전장)
for (const p of PRESETS) {
  for (const arena of ARENAS) {
    const s = createBattle({ blue: p.blue, red: p.red, arenaId: arena.id, seed: 77 });
    simulate(s, TUNING.SIM_DT, 400);
    check(s.over, `[${p.name} @ ${arena.name}] 종료됨`);
    check(s.units.every(finiteUnit), `[${p.name} @ ${arena.name}] NaN 없음`);
    const sum = battleSummary(s);
    check(sum.blue.length === p.blue.length && sum.red.length === p.red.length, `[${p.name}] 유닛 수 유지`);
    check(sum.stats.skills > 0, `[${p.name} @ ${arena.name}] 필살기 발동`);
    check(!!mvpOf(s), `[${p.name}] MVP 산출`);
  }
}

// 4v4 최대 편성
const s44 = createBattle({ blue: ANIMAL_IDS.slice(0, 4), red: ANIMAL_IDS.slice(4, 8), seed: 909 });
simulate(s44, TUNING.SIM_DT, 400);
check(s44.over, '4v4 종료');
check(s44.units.length === 8, '4v4 유닛 8마리');
check(s44.units.every(finiteUnit), '4v4 NaN 없음');
check(s44.time < TUNING.MAX_TIME + 1, '4v4 제한 시간 내 종료');

// 결정론: 같은 시드 = 같은 결과
const d1 = createBattle({ blue: ['lion', 'eagle'], red: ['tiger', 'boar'], seed: 4242 });
const d2 = createBattle({ blue: ['lion', 'eagle'], red: ['tiger', 'boar'], seed: 4242 });
simulate(d1); simulate(d2);
check(d1.winner === d2.winner && near(d1.time, d2.time), '같은 시드 → 같은 승자/시간');
check(d1.units.every((u, i) => near(u.hp, d2.units[i].hp)), '같은 시드 → 같은 HP');

// 모든 스킬이 실제로 발동하는가
const missing = [...SKILL_KINDS].filter((k) => !skillSeen.has(k));
check(missing.length === 0, `모든 스킬 종류 발동 (미발동: ${missing.join(',')})`);

// 제압 판정 즉시 종료
const fin = createBattle({ blue: ['lion'], red: ['fox'], seed: 5 });
fin.units.filter((u) => u.team === 'red').forEach((u) => applyDamage(fin, fin.units[0], u, 9999, { pierce: true, unavoidable: true }));
step(fin, TUNING.SIM_DT);
check(fin.over && fin.winner === 'blue', '전멸 시 즉시 블루 승리');

// 시간 초과 판정은 남은 HP 비율
const to = createBattle({ blue: ['elephant'], red: ['fox'], seed: 8, maxTime: 2 });
to.units.forEach((u) => { u.atk = 0; });
to.units[1].hp = 10;   // 레드가 체력 열세
simulate(to, TUNING.SIM_DT, 10);
check(to.endReason === 'timeout', '시간 초과 판정 경로');
check(to.winner === 'blue', '시간 초과 시 HP 우세 팀 승리');

// 방어력/회피 계산
const armorTest = createBattle({ blue: ['crocodile'], red: ['lion'], seed: 3 });
const croc = armorTest.units[0];
const lion = armorTest.units[1];
const hpBefore = croc.hp;
applyDamage(armorTest, lion, croc, 100, {});
const taken = hpBefore - croc.hp;
check(taken > 80 && taken < 90, `악어 방어력 13% 적용 (받은 피해 ${taken.toFixed(1)})`);
croc.hp = croc.maxHp;
const pierceTaken = (() => { const b = croc.hp; applyDamage(armorTest, lion, croc, 100, { pierce: true }); return b - croc.hp; })();
check(pierceTaken > taken + 8, `방어 무시 피해가 더 큼 (${pierceTaken.toFixed(1)} > ${taken.toFixed(1)})`);
const foxBattle = createBattle({ blue: ['fox'], red: ['lion'], seed: 9 });
const fox = foxBattle.units[0];
let evaded = 0;
fox.maxHp = 9999; fox.hp = 9999;
for (let i = 0; i < 400; i++) {
  fox.hp = 9999;
  const before = fox.hp;
  applyDamage(foxBattle, foxBattle.units[1], fox, 1, {});
  if (near(fox.hp, before)) evaded++;
}
check(evaded > 20 && evaded < 120, `여우 회피 14% 근처 (400회 중 ${evaded}회)`);

// 경기장 밖으로 나가지 않는다
for (const ar of ARENAS) {
  const s = createBattle({ blue: ['elephant', 'rhino'], red: ['gorilla', 'bear'], arenaId: ar.id, seed: 31 });
  simulate(s);
  const outside = s.units.filter((u) => Math.hypot(u.x, u.z) > TUNING.ARENA_RADIUS + 0.6);
  check(outside.length === 0, `${ar.id} 경기장 이탈 없음`);
  const inObstacle = s.units.filter((u) => ar.obstacles.some((ob) => Math.hypot(u.x - ob.x, u.z - ob.z) < ob.r * 0.8));
  check(inObstacle.length === 0, `${ar.id} 장애물 관통 없음`);
}

/* ─────────────── 3. 3D 리그 ─────────────── */
for (const def of ANIMALS) {
  const rig = buildAnimalModel(def, 'blue');
  rig.group.updateMatrixWorld(true);
  let meshes = 0;
  let materials = 0;
  rig.group.traverse((o) => { if (o.isMesh) { meshes++; if (o.material) materials++; } });
  check(meshes >= 10, `[${def.id}] 메시 10개 이상 (${meshes})`);
  check(materials === meshes, `[${def.id}] 모든 메시에 재질`);
  const box = new THREE.Box3().setFromObject(rig.group);
  const size = new THREE.Vector3();
  box.getSize(size);
  const okBox = [box.min, box.max].every((v) => [v.x, v.y, v.z].every(Number.isFinite));
  check(okBox, `[${def.id}] 바운딩 박스 유효`);
  check(box.min.y > -0.2 && box.min.y < 0.2, `[${def.id}] 발이 지면에 닿음 (min.y=${box.min.y.toFixed(2)})`);
  check(size.y > 0.6 && size.y < 3.2, `[${def.id}] 키 적정 (${size.y.toFixed(2)})`);
  check(size.x > 0.6 && size.x < 4.2, `[${def.id}] 폭 적정 (${size.x.toFixed(2)})`);
  check(size.z > 0.6 && size.z < 4.2, `[${def.id}] 길이 적정 (${size.z.toFixed(2)})`);

  triggerAttack(rig); triggerSkill(rig); triggerHurt(rig);
  let bad = false;
  for (let i = 0; i < 180; i++) {
    animateRig(rig, {
      dt: 1 / 60, moving: i % 3 !== 0, speed: 3.2,
      attack: rig.attack, skill: rig.skill, hurt: rig.hurt, dead: false, air: i > 120,
    });
    if (![rig.group.position.x, rig.group.position.y, rig.group.position.z, rig.group.rotation.y].every(Number.isFinite)) bad = true;
    if (![rig.body.position.y, rig.body.rotation.x].every(Number.isFinite)) bad = true;
  }
  check(!bad, `[${def.id}] 애니메이션 NaN 없음`);

  // 사망 애니메이션
  for (let i = 0; i < 200; i++) animateRig(rig, { dt: 1 / 60, dead: true });
  check(Number.isFinite(rig.group.rotation.z) && rig.group.rotation.z > 0.4, `[${def.id}] 사망 시 쓰러짐`);
  check(rig.matList.every((m) => m.opacity >= 0 && m.opacity <= 1), `[${def.id}] 페이드 불투명도 범위`);
}

const blueRig = buildAnimalModel(ANIMAL_BY_ID.lion, 'blue');
const redRig = buildAnimalModel(ANIMAL_BY_ID.lion, 'red');
check(blueRig.ring.material.color.getHex() !== redRig.ring.material.color.getHex(), '팀 링 색 구분');

/* ─────────────── 4. 성능/결과 요약 ─────────────── */
const t0 = Date.now();
for (let i = 0; i < 40; i++) {
  const s = createBattle({ blue: ANIMAL_IDS.slice(0, 4), red: ANIMAL_IDS.slice(4, 8), seed: i });
  simulate(s);
}
const ms = Date.now() - t0;
check(ms < 8000, `40회 4v4 시뮬레이션 빠름 (${ms}ms)`);

const avgTime = totalTime / pairCount;
console.log(`\n동물 ${ANIMALS.length}종 · 1:1 ${pairCount}판 평균 ${avgTime.toFixed(1)}초 · 4v4 40판 ${ms}ms`);
console.log(`PASS ${pass} · FAIL ${fails.length}`);
if (fails.length) {
  console.log('\n실패 항목:');
  fails.slice(0, 40).forEach((f) => console.log(' - ' + f));
  process.exit(1);
}
console.log('✅ 모든 검사 통과');
