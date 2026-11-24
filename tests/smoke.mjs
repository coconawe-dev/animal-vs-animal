// 오프라인 스모크 테스트 — DOM/WebGL 없이 ARBS 배틀 로직·배치·무기·3D 리그를 검증한다.
// 실행: node tests/smoke.mjs
import fs from 'node:fs';
import * as THREE from '../vendor/three.module.js';
import {
  ANIMALS, DINOS, MONSTERS, CREATURES, CREATURE_IDS, CREATURE_BY_ID, ANIMAL_BY_ID,
  ARENAS, ARENA_BY_ID, PRESETS, CHALLENGES, WEAPONS, WEAPON_BY_ID, TUNING,
  DEFAULT_PLACEMENTS, CATEGORIES, powerOf, placementCost, creaturesOf, SANS_PHASES,
  PARTY, TEAM_ORDER, TEAM_DEFS, teamDef, partyTeams, sectorBounds, clampToSector,
  ITEMS, ITEM_IDS, ITEM_BY_ID, PLACEABLES, ELEMENT_GOLEMS, ELEMENT_GOLEM_IDS, GOLEM_CARD,
  VARIANT_CARDS, variantOptionsOf, variantIdsOf, isVariant, isVariantCard,
} from '../src/config.js';
import {
  createBattle, step, simulate, battleSummary, mvpOf, applyDamage, aliveCount,
  teamHpRatio, mulberry32, drainEvents, forceEndBattle,
  possessUnit, releasePossession, possessedUnit, setUnitInput,
  chooseTarget, ensureTarget, RETARGET_MARGIN,
} from '../src/sim.js';
import {
  placeUnits, removeNearest, nearestIndex, mirrorTeam, clampArena, clampSide,
  normalizePlacement, sanitizeList, clusterOffsets, autoPositions,
  costOf, affordableCount, reclampList,
} from '../src/placement.js';
import { PartySession, PHASE, SNAPSHOT_HZ, packEvent, unpackEvent, makeLoopback, sleep } from '../src/party.js';
import { MemoryHub, Net, makeRoomCode, normalizeRoomCode, isValidRoomCode, encodeMsg, decodeMsg } from '../src/net.js';
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
check(ANIMALS.length === 17, `동물 17종 (현재 ${ANIMALS.length})`);
check(DINOS.length === 9, `공룡·거대종 9종 (현재 ${DINOS.length})`);
check(MONSTERS.length === 17, `괴수·언데드 17종 (현재 ${MONSTERS.length})`);
check(CREATURES.length === 43, `전체 43종 (현재 ${CREATURES.length})`);
check(new Set(CREATURE_IDS).size === CREATURES.length, '유닛 id 중복 없음');
check(CATEGORIES.length === 5, '카테고리 5개 (아이템 탭 추가)');
check(CATEGORIES.some((c) => c.id === 'item' && c.emoji === '💣' && c.name === '아이템'), '💣 아이템 카테고리 탭');
check(creaturesOf('animal').length === 17 && creaturesOf('dino').length === 8 && creaturesOf('monster').length === 18, '카테고리별 분류 (17/8/18)');
check(creaturesOf('item').length === 5 && creaturesOf('item').every((i) => i.isStructure), '아이템 카테고리 5종');
check(creaturesOf('all').length === PLACEABLES.length && PLACEABLES.length === 49, '전체 카테고리 49종 (43 + 아이템 5 + 원소 골렘 카드 1)');
for (const id of ['zombie', 'skeleton', 'snake', 'hyena', 'drex']) {
  check(!!CREATURE_BY_ID[id], `기존 유닛 ${id} 등록`);
}
for (const id of ['shark', 'megalodon', 'mosasaurus', 'leviathan', 'stone_golem', 'dragon', 'goblin']) {
  check(!!CREATURE_BY_ID[id], `신규 유닛 ${id} 등록`);
}
check(CREATURE_BY_ID.drex.cost === 10 && CREATURE_BY_ID.drex.hp >= 650, '디-렉스 보스급 능력치');
check(CREATURE_BY_ID.shark.cat === 'animal' && CREATURE_BY_ID.megalodon.cat === 'dino' && CREATURE_BY_ID.mosasaurus.cat === 'dino', '신규 해양 유닛 카테고리');
check(CREATURE_BY_ID.leviathan.cost === 10 && CREATURE_BY_ID.dragon.cost === 10 && CREATURE_BY_ID.goblin.cost === 2, '신규 유닛 비용');
check(CREATURE_BY_ID.stone_golem.armor >= 0.2 && CREATURE_BY_ID.stone_golem.hp >= 400, '스톤골렘 단단한 방어');
check(CREATURE_BY_ID.leviathan.hp > CREATURE_BY_ID.dragon.hp, '레비아탄이 드래곤보다 단단함');
for (const id of ['strong_chicken', 'sans']) {
  check(!!CREATURE_BY_ID[id], `신규 유닛 ${id} 등록`);
}
check(CREATURE_BY_ID.strong_chicken.cost === 20 && CREATURE_BY_ID.strong_chicken.cat === 'monster', '강하닭 — 코스트 20 괴수');
check(CREATURE_BY_ID.strong_chicken.hp > CREATURE_BY_ID.leviathan.hp * 2 && CREATURE_BY_ID.strong_chicken.atk > CREATURE_BY_ID.leviathan.atk * 1.5,
  '강하닭 — 10코스트보다 훨씬 강한 체력·공격력');
check(CREATURE_BY_ID.strong_chicken.skill.kit.length === 3 && CREATURE_BY_ID.strong_chicken.skill.kit.map((k) => k.id).join(',') === 'featherStorm,beakSmash,eggBarrage',
  '강하닭 — 깃털 폭풍 · 거대 부리 강타 · 황금 알 폭격');
check(CREATURE_BY_ID.sans.cost === 15 && CREATURE_BY_ID.sans.cat === 'monster' && CREATURE_BY_ID.sans.ranged === true, '샌즈 — 코스트 15 원거리 괴수');
check(CREATURE_BY_ID.sans.hp < CREATURE_BY_ID.strong_chicken.hp && CREATURE_BY_ID.sans.evasion >= 0.2, '샌즈 — 낮은 체력 · 높은 회피');
check(CREATURE_BY_ID.sans.skill.kit.length === 3 && CREATURE_BY_ID.sans.skill.kit.map((k) => k.id).join(',') === 'gasterBlast,boneBarrage,boneSpikes',
  '샌즈 — 가스터 블래스터 · 뼈 발사 · 뼈 가시');

/* ── 샌즈 1·2·3페이즈 (라스트 브레스) ── */
for (const id of ['sans_p2', 'sans_p3']) check(!!CREATURE_BY_ID[id], `샌즈 페이즈 유닛 ${id} 등록`);
check(SANS_PHASES.length === 3 && SANS_PHASES.map((p) => p.id).join(',') === 'sans,sans_p2,sans_p3', '샌즈 페이즈 3단계');
check(CREATURE_BY_ID.sans.cost === 15 && CREATURE_BY_ID.sans_p2.cost === 25 && CREATURE_BY_ID.sans_p3.cost === 50, '페이즈 코스트 15·25·50');
check(CREATURE_BY_ID.sans_p2.atk > CREATURE_BY_ID.sans.atk * 1.5 && CREATURE_BY_ID.sans_p2.hp > CREATURE_BY_ID.sans.hp, '2페이즈 — 같은 기술, 훨씬 강한 공격력');
check(CREATURE_BY_ID.sans_p2.skill.kit.map((k) => k.id).join(',') === 'gasterBlast,boneBarrage,boneSpikes', '2페이즈 — 1페이즈와 같은 기술 구성');
check(CREATURE_BY_ID.sans_p3.hp === CREATURE_BY_ID.strong_chicken.hp, '3페이즈 — 체력이 강하닭과 동급 (2100)');
// 3페이즈 대미지 소폭 하향 (atk 115 → 95, 스킬 배율 약 15%↓) — 체력·방어·회피·코스트는 그대로
check(CREATURE_BY_ID.sans_p3.atk >= 92 && CREATURE_BY_ID.sans_p3.atk <= 95, `3페이즈 — 공격력만 소폭 하향 (${CREATURE_BY_ID.sans_p3.atk})`);
check(CREATURE_BY_ID.sans_p3.atk > CREATURE_BY_ID.sans_p2.atk * 1.1, '3페이즈 — 2페이즈보다는 여전히 강한 공격력');
check(CREATURE_BY_ID.sans_p3.skill.power <= 2.0
  && CREATURE_BY_ID.sans_p3.skill.kit.find((k) => k.id === 'gasterBlast').power <= 2.0
  && CREATURE_BY_ID.sans_p3.skill.kit.find((k) => k.id === 'gasterHandPunch').power <= 1.6,
  '3페이즈 — 강화 스킬 대미지 배율 소폭 하향');
check(CREATURE_BY_ID.sans_p3.cost === 50 && CREATURE_BY_ID.sans_p3.hp === 2100
  && CREATURE_BY_ID.sans_p3.evasion === 0.3 && CREATURE_BY_ID.sans_p3.armor === 0.12,
  '3페이즈 — 코스트·체력·방어·회피는 그대로');
check(CREATURE_BY_ID.sans_p3.skill.kit.length === 5
  && CREATURE_BY_ID.sans_p3.skill.kit.map((k) => k.id).join(',') === 'gasterBlast,boneBarrage,boneSpikes,gasterHandPunch,rudeAttack',
  '3페이즈 — 2페이즈 기술 + 가스터손 펀치 + 불미스러운 공격');
check(CREATURE_BY_ID.sans_p3.evasion >= CREATURE_BY_ID.sans.evasion && CREATURE_BY_ID.sans_p3.armor > 0, '3페이즈 — 높은 회피/생존력');
check(CREATURE_BY_ID.sans_p2.variantOf === 'sans' && CREATURE_BY_ID.sans_p3.phase === 3, '페이즈 변종 표시');
check([CREATURE_BY_ID.sans, CREATURE_BY_ID.sans_p2, CREATURE_BY_ID.sans_p3].every((d) => d.blink === true), '세 페이즈 모두 순간이동');

/* ── 신규 4종 — 매머드 · 히드라 · 킹콩 · 영웅 ── */
for (const id of ['mammoth', 'hydra', 'king_kong', 'hero']) check(!!CREATURE_BY_ID[id], `신규 유닛 ${id} 등록`);
check(CREATURE_BY_ID.mammoth.cost >= 8 && CREATURE_BY_ID.mammoth.cost <= 9 && CREATURE_BY_ID.mammoth.cat === 'animal', '매머드 — 동물 8~9코스트');
check(CREATURE_BY_ID.hydra.cost >= 11 && CREATURE_BY_ID.hydra.cost <= 12 && CREATURE_BY_ID.hydra.cat === 'monster', '히드라 — 괴수 11~12코스트');
check(CREATURE_BY_ID.king_kong.cost >= 10 && CREATURE_BY_ID.king_kong.cost <= 12 && CREATURE_BY_ID.king_kong.hp > CREATURE_BY_ID.gorilla.hp * 3,
  '킹콩 — 고릴라보다 훨씬 거대한 영장류');
check(CREATURE_BY_ID.hero.cost >= 12 && CREATURE_BY_ID.hero.cost <= 14, '영웅 — 12~14코스트');
check(CREATURE_BY_ID.hero.skill.kit.map((k) => k.name).join(',') === '강력펀치,연속펀치,어퍼컷', '영웅 — 강력펀치·연속펀치·어퍼컷 3스킬');
check(CREATURE_BY_ID.mammoth.skill.kind === 'tuskQuake' && CREATURE_BY_ID.hydra.skill.kind === 'tripleVenom'
  && CREATURE_BY_ID.king_kong.skill.kind === 'kongQuake' && CREATURE_BY_ID.hero.skill.kind === 'heroPunch', '신규 4종 스킬 종류');

/* ── 원소 골렘 5종 — 카드 1장 + 5원소 선택 (모두 코스트 5) ── */
{
  check(ELEMENT_GOLEMS.length === 5 && ELEMENT_GOLEM_IDS.join(',') === 'golem_fire,golem_water,golem_grass,golem_electric,golem_ice',
    '원소 골렘 — 불·물·풀·전기·얼음 5원소 순서');
  check(ELEMENT_GOLEMS.every((g) => CREATURE_BY_ID[g.id] && CREATURE_BY_ID[g.id].element === g.element), '원소 골렘 — 원소 표시');
  check(ELEMENT_GOLEM_IDS.every((id) => CREATURE_BY_ID[id].cost === 5), '원소 골렘 — 모두 코스트 5');
  check(ELEMENT_GOLEM_IDS.every((id) => CREATURE_BY_ID[id].variantOf === 'golem_elemental'), '원소 골렘 — 카드 하나로 묶임');
  check(VARIANT_CARDS.length === 1 && VARIANT_CARDS[0].id === 'golem_elemental' && GOLEM_CARD.badge === '5원소', '원소 골렘 카드 배지 5원소');
  check(GOLEM_CARD.cardOnly === true && isVariantCard(GOLEM_CARD), '원소 골렘 카드는 선택용 껍데기');
  check(!CREATURES.some((c) => c.id === 'golem_elemental'), '카드는 유닛 목록에 없다');
  check(isVariant(CREATURE_BY_ID.golem_fire) && !isVariant(CREATURE_BY_ID.golem_elemental), '변종 표시');
  check(variantOptionsOf(CREATURE_BY_ID.golem_elemental).length === 5
    && variantIdsOf(CREATURE_BY_ID.golem_elemental)[4] === 'golem_ice', '카드 → 5원소 선택지');
  check(ELEMENT_GOLEM_IDS.every((id) => CREATURE_BY_ID[id].cat === 'monster' && CREATURE_BY_ID[id].tier === 3), '원소 골렘 — 괴수 / 티어 3');
  check(ELEMENT_GOLEM_IDS.every((id) => CREATURE_BY_ID[id].hp >= 400 && CREATURE_BY_ID[id].atk >= 30
    && CREATURE_BY_ID[id].kbResist >= 0.7 && CREATURE_BY_ID[id].armor > 0), '원소 골렘 — 정예 바위 체급');
  check(CREATURE_BY_ID.golem_fire.skill.kind === 'fireNova' && CREATURE_BY_ID.golem_fire.skill.burn > 0, '불 골렘 — 화염 폭발/화상');
  check(CREATURE_BY_ID.golem_water.skill.kind === 'tidalCrush' && CREATURE_BY_ID.golem_water.skill.knock >= 20
    && CREATURE_BY_ID.golem_water.skill.slow > 0, '물 골렘 — 해일 강타/강넉백/둔화');
  check(CREATURE_BY_ID.golem_grass.skill.kind === 'vineGrasp' && CREATURE_BY_ID.golem_grass.skill.heal > 0
    && CREATURE_BY_ID.golem_grass.skill.stun > 0, '풀 골렘 — 덩굴 속박 + 자연 재생');
  check(CREATURE_BY_ID.golem_electric.skill.kind === 'chainStorm' && CREATURE_BY_ID.golem_electric.skill.chain >= 3
    && CREATURE_BY_ID.golem_electric.skill.stun > 0, '전기 골렘 — 연쇄 감전/기절');
  check(CREATURE_BY_ID.golem_ice.skill.kind === 'frostStorm' && CREATURE_BY_ID.golem_ice.skill.stun > 0
    && CREATURE_BY_ID.golem_ice.skill.slow >= 0.5, '얼음 골렘 — 서리 폭풍/빙결');
  const empty = [];
  const res = placeUnits(empty, { id: 'golem_elemental', team: 'blue', x: -10, z: 0 });
  check(res.added.length === 0 && empty.length === 0 && res.skipped === 'card', '원소 골렘 카드는 직접 배치되지 않는다');
  const placed = [];
  const r5 = placeUnits(placed, { id: 'golem_ice', team: 'blue', x: -10, z: 0 });
  check(r5.added.length === 1 && placed[0].id === 'golem_ice', '원소 골렘 선택 후 배치');
}
check(['mammoth', 'hydra', 'king_kong', 'hero'].every((id) => CREATURE_BY_ID[id].cost <= PARTY.BUDGET), '신규 4종 모두 파티 예산 이내');

const SKILL_KINDS = new Set([
  'roar', 'pounce', 'charge', 'slam', 'pack', 'dive', 'chomp', 'gore', 'evade', 'smash', 'sprint', 'gore2',
  'crunch', 'sailSlash', 'hornCharge', 'packPounce', 'flame', 'titanSlam',
  'infect', 'boneSlash', 'coil', 'frenzy', 'drexCombo',
  'bloodFrenzy', 'deepBite', 'tidalJaw', 'abyssVortex', 'rockCrush', 'dragonBreath', 'sneakStrike',
  'featherStorm', 'gasterBlast',
  'tuskQuake', 'tripleVenom', 'kongQuake', 'heroPunch',
  'fireNova', 'tidalCrush', 'vineGrasp', 'chainStorm', 'frostStorm',
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
check(new Set(CREATURES.map((a) => a.skill.kind)).size === 41, '서로 다른 스킬 41가지');

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
check(TUNING.ARENA_RADIUS === 198, `전장 반경 4배 확장 (${TUNING.ARENA_RADIUS})`);
check(TUNING.MAX_UNITS_PER_TEAM === 100 && TUNING.MAX_UNITS === 200, '팀당 100마리 · 전장 전체 200마리 한도');
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
  check(p.blue.length + p.red.length <= TUNING.MAX_UNITS, `${p.id} 전장 한도 200 이내`);
  check(p.blue.every((q) => !!CREATURE_BY_ID[q.id] && !!WEAPON_BY_ID[q.weapon]), `${p.id} 블루 배치`);
  check(p.red.every((q) => !!CREATURE_BY_ID[q.id] && !!WEAPON_BY_ID[q.weapon]), `${p.id} 레드 배치`);
  check(!!ARENA_BY_ID[p.arena], `${p.id} 전장 id`);
  for (const q of [...p.blue, ...p.red]) {
    check(Math.hypot(q.x, q.z) <= TUNING.ARENA_RADIUS, `${p.id} 배치가 경기장 안 (${q.id} ${Math.hypot(q.x, q.z).toFixed(1)})`);
  }
}
const raptorPreset = PRESETS.find((p) => p.id === 'trex-raptors');
check(raptorPreset && raptorPreset.red.length === 12, '티라노 vs 랩터 12마리 프리셋');
check(raptorPreset && Math.max(...raptorPreset.blue.map((q) => Math.hypot(q.x, q.z))) > 40, '넓어진 전장에 맞게 프리셋 좌표 확대');
check(PRESETS.some((p) => p.id === 'rocket-elephants' && p.blue.every((q) => q.weapon === 'rocket')), '로켓 코끼리 프리셋');
check(PRESETS.some((p) => p.id === 'boss-raid' && p.blue.length >= 10), '보스 레이드 프리셋');
check(PRESETS.some((p) => p.id === 'chicken-sans' && p.blue[0].id === 'strong_chicken' && p.red[0].id === 'sans'), '강하닭 vs 샌즈 프리셋');
check(PRESETS.some((p) => p.id === 'lastbreath-p3' && p.blue[0].id === 'sans_p3' && p.red[0].id === 'strong_chicken'), '라스트 브레스 3페이즈 vs 강하닭 프리셋');
check(PRESETS.some((p) => p.id === 'new-units-2026'
  && ['mammoth', 'hydra', 'king_kong', 'hero'].every((id) => p.blue.some((q) => q.id === id))), '신규 4종 쇼케이스 프리셋');
check(PRESETS.some((p) => p.id === 'elemental-golems' && p.blue.length === 5
  && ['golem_fire', 'golem_water', 'golem_grass', 'golem_electric', 'golem_ice'].every((id) => p.blue.some((q) => q.id === id))), '원소 골렘 5종 쇼케잍 프리셋');
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
  // 팀당 100마리 · 두 팀 합계 200마리 한도 (블루 100 vs 레드 100)
  const fill = (team, x0) => {
    const list = [];
    for (let i = 0; i < 10; i++) {
      placeUnits(list, {
        id: 'raptor', team, x: x0, z: -24 + (i % 3) * 5,
        count: 10, limit: TUNING.MAX_UNITS_PER_TEAM,
      });
    }
    return list;
  };
  const limit = TUNING.MAX_UNITS_PER_TEAM;
  const blue = fill('blue', -30);
  check(blue.length === 100, `블루 팀당 100마리 배치 (${blue.length})`);
  const over = placeUnits(blue, { id: 'raptor', team: 'blue', x: -34, z: 20, limit });
  check(over.added.length === 0 && over.skipped === 'limit' && blue.length === 100, '101번째 블루 유닛 차단');
  const red = fill('red', 30);
  check(red.length === 100, `레드 팀당 100마리 배치 (${red.length})`);
  check(blue.length + red.length === 200, '블루 100 + 레드 100 = 200마리');
  const overRed = placeUnits(red, { id: 'raptor', team: 'red', x: 34, z: 20, limit });
  check(overRed.added.length === 0 && overRed.skipped === 'limit', '101번째 레드 유닛 차단');
  check(sanitizeList(Array.from({ length: 130 }, (_, i) => ({ id: 'raptor', x: 0, z: i }))).length === 100, '저장값도 팀당 100마리로 정리');
  const big = createBattle({ blue, red, arenaId: 'savanna', seed: 7 });
  check(big.units.length === 200, `200마리 전장 생성 (${big.units.length})`);
  check(big.units.every((u) => [u.x, u.z, u.y, u.hp].every(Number.isFinite)), '200마리 좌표 유효');
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
check(pairCount === CREATURES.length * CREATURES.length, `1:1 전 조합 ${CREATURES.length ** 2}판 실행`);
check(skillSeen.size === 41, `모든 스킬 41종 발동 (미발동: ${[...SKILL_KINDS].filter((k) => !skillSeen.has(k)).join(',')})`);

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

// 강하닭 · 샌즈 — 세 가지 기술을 번갈아 쓰고 3D 연출용 이벤트를 남긴다
{
  const s = createBattle({ blue: [P('strong_chicken', -6, 0)], red: [P('sans', 6, 0)], seed: 2026 });
  s.units.forEach((u) => { u.hp = u.maxHp = 30000; });   // 두 보스가 세 기술을 모두 보여 줄 시간을 준다
  const seenTypes = new Set();
  const names = new Set();
  for (let i = 0; i < 3600; i++) {                       // 60초
    step(s, TUNING.SIM_DT);
    for (const ev of drainEvents(s)) {
      seenTypes.add(ev.type);
      if (ev.type === 'skill') names.add(ev.name);
    }
  }
  check(names.has('깃털 폭풍') && names.has('거대 부리 강타') && names.has('황금 알 폭격'),
    `강하닭 세 기술 사용 (${[...names].join(',')})`);
  check(names.has('가스터 블래스터') && names.has('뼈 발사') && names.has('뼈 가시'), '샌즈 세 기술 사용');
  for (const t of ['featherRain', 'beakSlam', 'eggLaunch', 'gasterBlast', 'boneBarrage', 'boneSpikes']) {
    check(seenTypes.has(t), `[${t}] 3D 연출 이벤트 발생`);
  }
}
{
  // 샌즈 — 근접 위협을 받으면 잔상을 남기며 뒤로 순간이동
  const s = createBattle({ blue: [P('sans', -2, 0)], red: [P('fox', 1.2, 0)], seed: 5 });
  let blinked = null;
  for (let i = 0; i < 420 && !blinked; i++) {
    step(s, TUNING.SIM_DT);
    blinked = drainEvents(s).find((e) => e.type === 'blink') || null;
  }
  check(!!blinked, '샌즈 순간이동 이벤트');
  if (blinked) {
    check(Math.hypot(blinked.x2 - blinked.x, blinked.z2 - blinked.z) > 4, '순간이동 거리 4 이상');
  }
}
{
  // 강하닭 — 10코스트 최종 병기들을 상대로 우세
  let wins = 0;
  const foes = ['leviathan', 'dragon', 'drex'];
  foes.forEach((foe, i) => {
    const s = createBattle({ blue: [P('strong_chicken', -5, 0)], red: [P(foe, 5, 0)], seed: 301 + i });
    simulate(s, TUNING.SIM_DT, 400);
    if (s.winner === 'blue') wins++;
  });
  check(wins >= 2, `강하닭이 10코스트와의 1:1에서 우세 (${wins}/3)`);
}

/* ── 샌즈 3페이즈 — 가스터손 펀치 · 불미스러운 공격까지 5기술 ── */
{
  const s = createBattle({ blue: [P('sans_p3', -6, 0)], red: [P('strong_chicken', 6, 0)], seed: 2026 });
  s.units.forEach((u) => { u.hp = u.maxHp = 40000; });
  const names = new Set();
  const seenTypes = new Set();
  for (let i = 0; i < 3600; i++) {
    step(s, TUNING.SIM_DT);
    for (const ev of drainEvents(s)) {
      seenTypes.add(ev.type);
      if (ev.type === 'skill') names.add(ev.name);
    }
  }
  check(names.has('가스터손 펀치') && names.has('불미스러운 공격'), `3페이즈 — 신규 2기술 사용 (${[...names].join(',')})`);
  check(names.has('가스터 블래스터') && names.has('뼈 발사') && names.has('뼈 가시'), '3페이즈 — 2페이즈 기술도 함께 사용');
  for (const t of ['gasterHand', 'rudeAttack', 'rudeText']) check(seenTypes.has(t), `[${t}] 3페이즈 3D 연출 이벤트`);
  check(s.units.some((u) => u.id === 'sans_p3' && u.skillCasts >= 5), '3페이즈가 여러 기술을 반복 사용');
}

/* ── 영웅 — 강력펀치 · 연속펀치 · 어퍼컷 ── */
{
  const s = createBattle({ blue: [P('hero', -6, 0)], red: [P('strong_chicken', 6, 0)], seed: 411 });
  s.units.forEach((u) => { u.hp = u.maxHp = 40000; });
  const names = new Set();
  const styles = new Set();
  for (let i = 0; i < 3600; i++) {
    step(s, TUNING.SIM_DT);
    for (const ev of drainEvents(s)) {
      if (ev.type === 'skill') names.add(ev.name);
      if (ev.type === 'heroStrike') styles.add(ev.style);
    }
  }
  check(names.has('강력펀치') && names.has('연속펀치') && names.has('어퍼컷'), `영웅 — 세 가지 펀치 사용 (${[...names].join(',')})`);
  check(styles.has('power') && styles.has('rapid') && styles.has('uppercut'), '영웅 — 펀치별 타격 연출');
}

/* ── 매머드 · 히드라 · 킹콩 스킬 연출 ── */
for (const [id, skillName, evType] of [
  ['mammoth', '엄니 대지진', 'tuskQuakeLand'],
  ['hydra', '삼두 맹독 브레스', 'tripleVenom'],
  ['king_kong', '가슴 두드리기 대지 강타', 'chestBeat'],
]) {
  const s = createBattle({ blue: [P(id, -6, 0)], red: [P('strong_chicken', 6, 0)], seed: 77 });
  s.units.forEach((u) => { u.hp = u.maxHp = 20000; });
  const names = new Set();
  let sawEvent = false;
  for (let i = 0; i < 2400 && !s.over; i++) {
    step(s, TUNING.SIM_DT);
    for (const ev of drainEvents(s)) {
      if (ev.type === 'skill') names.add(ev.name);
      if (ev.type === evType) sawEvent = true;
    }
  }
  check(names.has(skillName), `[${id}] 「${skillName}」 사용`);
  check(sawEvent, `[${id}] [${evType}] 연출 이벤트`);
}
{
  // 매머드 엄니 돌진은 적을 띄우고, 히드라는 맹독 둔화를 남긴다
  const s = createBattle({ blue: [P('mammoth', -4, 0)], red: [P('lion', 2, 0)], seed: 91 });
  s.units.forEach((u) => { u.hp = u.maxHp = 30000; });
  let launched = false;
  for (let i = 0; i < 1800 && !launched; i++) {
    step(s, TUNING.SIM_DT);
    launched = s.units.some((u) => u.team === 'red' && u.y > 0.3);
  }
  check(launched, '매머드 엄니 — 적을 공중으로 띄움');

  const h = createBattle({ blue: [P('hydra', -4, 0)], red: [P('bear', 2, 0)], seed: 92 });
  h.units.forEach((u) => { u.hp = u.maxHp = 30000; });
  let slowed = false;
  for (let i = 0; i < 900 && !slowed; i++) {
    step(h, TUNING.SIM_DT);
    slowed = h.units.some((u) => u.team === 'red' && (u.slow > 0 || u.bleeding.length > 0));
  }
  check(slowed, '히드라 맹독 — 둔화/지속 피해');
}

/* ── 원소 골렘 5종 — 스킬 발동과 원소별 상태이상 ── */
for (const [id, skillName, evType] of [
  ['golem_fire', '화염 폭발', 'golemFire'],
  ['golem_water', '해일 강타', 'golemWave'],
  ['golem_grass', '덩굴 속박', 'golemVine'],
  ['golem_electric', '연쇄 감전', 'golemBolt'],
  ['golem_ice', '서리 폭풍', 'golemFrost'],
]) {
  const s = createBattle({ blue: [P(id, -6, 0)], red: [P('stone_golem', 2, 0), P('bear', 4, 2)], seed: 141 });
  s.units.forEach((u) => { u.hp = u.maxHp = 20000; });
  const names = new Set();
  let fx = 0, bolts = 0, healed = false;
  let burned = false, slowed = false, stunned = false;
  for (let i = 0; i < 2400 && !s.over; i++) {
    step(s, TUNING.SIM_DT);
    for (const ev of drainEvents(s)) {
      if (ev.type === 'skill') names.add(ev.name);
      if (ev.type === evType) fx++;
      if (ev.type === 'golemBolt') bolts++;
      if (ev.type === 'heal') healed = true;
    }
    for (const u of s.units) {
      if (u.team !== 'red') continue;
      if (u.bleeding.length) burned = true;
      if (u.slow > 0) slowed = true;
      if (u.stun > 0) stunned = true;
    }
  }
  check(names.has(skillName), `[${id}] 「${skillName}」 사용`);
  check(fx > 0, `[${id}] [${evType}] 연출 이벤트`);
  if (id === 'golem_fire') check(burned, '🔥 불 골렘 — 화상(지속 피해) 부여');
  if (id === 'golem_water') check(slowed, '💧 물 골렘 — 둔화 부여');
  if (id === 'golem_grass') check(stunned && slowed && healed, '🌿 풀 골렘 — 속박 + 둔화 + 아군 재생');
  if (id === 'golem_electric') check(bolts >= 2 && stunned, '⚡ 전기 골렘 — 여러 적 연쇄 + 기절');
  if (id === 'golem_ice') check(slowed && stunned, '❄️ 얼음 골렘 — 둔화 + 빙결');
}

// 래그돌: 무거운 일격에 가벼운 유닛이 공중으로
{
  const s = createBattle({ blue: [P('trex', -3, 0)], red: [P('fox', 3, 0)], seed: 19 });
  const fox = s.units.find((u) => u.team === 'red');
  const trex = s.units.find((u) => u.team === 'blue');
  applyDamage(s, trex, fox, 999, { unavoidable: true });
  check(fox.dead, '치명타 사망');
  check(fox.vy > 0, '무거운 일격 → 몸이 튕겨 오름');
  check(fox.spin === 0 && fox.spinVel === 0, '사망 즉시 회전 0 (죽은 몹이 돌지 않는다)');
  step(s, TUNING.SIM_DT);
  check(fox.y > 0 || fox.vy !== 0, '래그돌 상승 시작');
}

// 회귀: 사망한 유닛은 계속 돌지 않고 쓰러진 채 정지한다
{
  const s = createBattle({ blue: [P('trex', -4, 0)], red: [P('fox', 3, 0), P('bear', 5, 3)], seed: 23 });
  const fox = s.units.find((u) => u.team === 'red' && u.id === 'fox');
  const trex = s.units.find((u) => u.team === 'blue');
  applyDamage(s, trex, fox, 400, { unavoidable: true });
  let spun = false;
  for (let i = 0; i < 600; i++) {           // 10초
    step(s, TUNING.SIM_DT);
    if (fox.spin !== 0 || fox.spinVel !== 0) spun = true;
  }
  check(!spun, '사망 후 10초간 spin/spinVel 0 유지 (죽은 몹 회전 버그 없음)');
  check(Number.isFinite(fox.spin) && fox.spin === 0, '사망한 유닛 각도 0 으로 고정');
  check(fox.y === 0 && fox.vy === 0, '사망한 유닛은 결국 땅에 내려와 정지');
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

/* ─────────────── 3.5 전장 아이템 (구조물) ─────────────── */
check(ITEMS.length === 5 && ITEM_IDS.join(',') === 'landmine,turret,tesla_coil,healing_totem,spike_barricade', '아이템 5종 등록');
const ITEM_COST = { landmine: 3, turret: 6, tesla_coil: 7, healing_totem: 5, spike_barricade: 4 };
for (const it of ITEMS) {
  const tag = `[${it.id}]`;
  check(it.cat === 'item' && !!ITEM_BY_ID[it.id], `${tag} 아이템 카테고리/등록`);
  check(it.isStructure === true && it.spd === 0 && it.knockResist === 1.0, `${tag} isStructure · spd 0 · knockResist 1.0`);
  check(it.cost === ITEM_COST[it.id], `${tag} 코스트 ${ITEM_COST[it.id]}`);
  check(it.hp > 50 && it.range > 0 && !!it.skill && !!it.skill.name && !!it.skill.desc, `${tag} 능력치/스킬 설명`);
  check(!!it.name && !!it.emoji && !!it.role && !!it.desc, `${tag} 이름/역할/설명`);
  check(it.cost >= 1 && it.cost <= PARTY.BUDGET, `${tag} 파티 예산 안`);
  for (const k of ['main', 'dark', 'accent', 'belly']) check(typeof it.colors[k] === 'number', `${tag} 색상 ${k}`);
}
check(CREATURE_BY_ID.turret === ITEM_BY_ID.turret && CREATURE_BY_ID.landmine === ITEM_BY_ID.landmine, '배치 조회에 아이템 포함');
check(placementCost([{ id: 'turret' }, { id: 'landmine' }, { id: 'healing_totem' }]) === 14, '아이템 예산 합산');

{
  // 1인당 예산(PARTY.BUDGET) 안에서 아이템만으로 편성
  const budget = PARTY.BUDGET;
  const turretCost = CREATURE_BY_ID.turret.cost;
  const fit = Math.floor(budget / turretCost);
  const list = [];
  let guard = 0;
  while (guard++ < 6) {
    const r = placeUnits(list, { id: 'turret', team: 'blue', x: -6 - guard * 5, z: 0, count: fit, budget, limit: 400 });
    if (!r.added.length) break;
  }
  check(list.length === fit && costOf(list) === fit * turretCost, `예산 ${budget} → 포탑 ${fit}기 (${list.length})`);
  const overB = placeUnits(list, { id: 'turret', team: 'blue', x: -8, z: 8, budget, limit: 400 });
  check(overB.added.length === 0 && overB.skipped === 'budget', '예산 초과분은 놓지 않는다');

  // 기존 유닛과 같은 경로로 배치·제거
  const mixed = [];
  placeUnits(mixed, { id: 'tesla_coil', team: 'blue', x: -8, z: 0, count: 2, limit: 99 });
  placeUnits(mixed, { id: 'lion', team: 'blue', x: -4, z: 0, count: 1, limit: 99 });
  check(mixed.length === 3 && mixed.filter((p) => p.id === 'tesla_coil').length === 2, '아이템 + 유닛 혼합 배치');
  check(nearestIndex(mixed, mixed[0].x, mixed[0].z) === 0 && removeNearest(mixed, mixed[0].x, mixed[0].z)?.id === 'tesla_coil', '아이템도 지우개로 제거');
}

{
  // 소환: 무기는 달리지 않고, 제자리 고정 · 넉백 면역
  const s = createBattle({
    blue: [{ id: 'turret', x: -5, z: 0, weapon: 'rocket' }, { id: 'landmine', x: -2, z: 0 }],
    red: [P('elephant', 6, 0)],
    seed: 3,
  });
  const structures = s.units.filter((u) => u.isStructure);
  check(structures.length === 2 && structures.every((u) => u.spd === 0 && u.kbResist === 1), '구조물 — spd 0 · 넉백 저항 1.0');
  check(structures.every((u) => u.weaponId === 'none' && !u.ranged), '구조물 — 무기 없음');
  const turret = s.units.find((u) => u.id === 'turret');
  const x0 = turret.x, z0 = turret.z;
  for (let i = 0; i < 60 * 20 && !s.over; i++) step(s, TUNING.SIM_DT);
  check(turret.x === x0 && turret.z === z0, '구조물은 넉백·밀치기에도 움직이지 않는다');
}

// 💣 지뢰 — 적이 밟으면 광역 폭발 + 강넉백 + 기절, 1회용
{
  const s = createBattle({ blue: [P('landmine', -2, 0)], red: [P('wolf', 3, 0)], seed: 11 });
  const mine = s.units.find((u) => u.id === 'landmine');
  const wolf = s.units.find((u) => u.id === 'wolf');
  const hp0 = wolf.hp;
  let boom = null;
  for (let i = 0; i < 60 * 30 && !boom; i++) {
    step(s, TUNING.SIM_DT);
    boom = drainEvents(s).find((e) => e.type === 'explosion') || null;
  }
  check(!!boom, '지뢰 — 적이 밟으면 폭발');
  if (boom) check(boom.r >= 4 && boom.r <= 6, `지뢰 — 광역 반경 (${boom.r})`);
  check(mine.dead && mine.hp === 0, '지뢰 — 1회용 (폭발 후 소멸)');
  check(wolf.hp < hp0 - 20, `지뢰 — 광역 피해 (${(hp0 - wolf.hp).toFixed(0)})`);
  check(wolf.stun > 0 || wolf.y > 0 || wolf.vx !== 0 || wolf.vz !== 0, '지뢰 — 기절/넉백');
  check(s.units.filter((u) => u.team === 'blue' && !u.dead).length === 0, '지뢰는 아군을 해치지 않고 스스로만 사라진다');
}

// 🗼 자동 포탑 — 기관총 연사 + 주기적 폭발 포격, 포신 조준
{
  const s = createBattle({ blue: [P('turret', -6, 0)], red: [P('bear', 4, 8)], seed: 21 });
  const turret = s.units.find((u) => u.id === 'turret');
  const face0 = turret.facing;
  let aimDev = 0;
  let bullets = 0, shells = 0, boom = false;
  for (let i = 0; i < 60 * 12 && !s.over; i++) {
    step(s, TUNING.SIM_DT);
    aimDev = Math.max(aimDev, Math.abs(turret.aimYaw - face0));
    for (const ev of drainEvents(s)) {
      if (ev.type === 'shot' && ev.kind === 'bullet') bullets++;
      if (ev.type === 'shot' && ev.kind === 'rocket') shells++;
      if (ev.type === 'explosion') boom = true;
    }
  }
  check(bullets > 10, `포탑 — 기관총 연사 (${bullets}발)`);
  check(shells >= 1 && boom, '포탑 — 폭발 포격');
  check(Number.isFinite(turret.aimYaw), '포탑 — 포신 조준각 기록');
  check(aimDev > 0.15, `포탑 — 포신이 적을 향해 회전 (${aimDev.toFixed(2)}rad)`);
  check(Math.abs(turret.facing - face0) < 1e-6, '포탑 — 받침은 고정, 포신만 회전');
  check(s.units.find((u) => u.id === 'bear').dmgTaken > 0, '포탑 — 적에게 피해');
}

// ⚡ 테슬라 코일 — 여러 적 연쇄 번개 + 둔화
{
  const s = createBattle({ blue: [P('tesla_coil', -4, 0)], red: [P('lion', 1, 0), P('lion', 1, 2.4), P('lion', 0, -2.4)], seed: 31 });
  s.units.forEach((u) => { u.hp = u.maxHp = 6000; });
  const arcs = new Set();
  let slowSeen = false;
  for (let i = 0; i < 60 * 8; i++) {
    step(s, TUNING.SIM_DT);
    for (const ev of drainEvents(s)) if (ev.type === 'chainLightning') arcs.add(`${ev.x2.toFixed(1)},${ev.z2.toFixed(1)}`);
    if (s.units.some((u) => u.team === 'red' && u.slow > 0)) slowSeen = true;
  }
  check(arcs.size >= 2, `테슬라 — 여러 적에게 연쇄 (${arcs.size}명)`);
  check(s.units.filter((u) => u.team === 'red' && u.dmgTaken > 0).length >= 2, '테슬라 — 연쇄 피해');
  check(slowSeen, '테슬라 — 둔화');
}

// 💚 치유 토템 — 주변 아군 회복
{
  const s = createBattle({ blue: [P('healing_totem', -20, 0), P('trex', -17, 0)], red: [P('spike_barricade', 34, 0)], seed: 41 });
  const trex = s.units.find((u) => u.id === 'trex');
  const bar = s.units.find((u) => u.id === 'spike_barricade');
  bar.atk = 0;
  trex.hp = Math.round(trex.maxHp * 0.5);
  const hp0 = trex.hp;
  const barHp = bar.hp;
  let pulse = false;
  for (let i = 0; i < 60 * 6 && !s.over; i++) {
    step(s, TUNING.SIM_DT);
    if (drainEvents(s).some((e) => e.type === 'healPulse')) pulse = true;
  }
  check(pulse, '치유 토템 — 치유 파동');
  check(trex.hp > hp0, `치유 토템 — 아군 회복 (${hp0} → ${Math.round(trex.hp)})`);
  check(bar.hp === barHp, '치유 토템 — 적은 회복하지 않는다');
}

// 🧱 가시 바리케이드 — 높은 체력 + 붙은 근접 적에게 가시 피해
{
  const s = createBattle({ blue: [P('spike_barricade', -2, 0)], red: [P('wolf', 2, 0), P('wolf', 1.6, 2)], seed: 51 });
  const bar = s.units.find((u) => u.id === 'spike_barricade');
  const wolves = s.units.filter((u) => u.team === 'red');
  const hp0 = wolves.map((u) => u.hp);
  let spiked = false;
  for (let i = 0; i < 60 * 6 && !s.over; i++) {
    step(s, TUNING.SIM_DT);
    if (drainEvents(s).some((e) => e.type === 'spikeHit')) spiked = true;
  }
  check(bar.maxHp >= 600, '바리케이드 — 높은 체력');
  check(spiked, '바리케이드 — 가시 반격');
  check(wolves.some((u, i) => u.hp < hp0[i]), '바리케이드 — 붙은 적이 피해');
  check(bar.x === -2 && bar.z === 0, '바리케이드 — 제자리 고정');
}

/* ─────────────── 3.6 유닛 직접 조종 (Possession) ─────────────── */
{
  const s = createBattle({ blue: [P('lion', -10, 0)], red: [P('bear', 10, 0)], seed: 71 });
  const lion = s.units.find((u) => u.team === 'blue');
  const bear = s.units.find((u) => u.team === 'red');
  s.units.forEach((u) => { u.hp = u.maxHp = 6000; });

  const p = possessUnit(s, lion.uid);
  check(!!p && lion.possessed && s.possessedUid === lion.uid, '조종 시작');
  check(possessedUnit(s) === lion, '조종 중인 유닛 조회');
  check(possessUnit(s, bear.uid)?.uid === bear.uid && !lion.possessed, '조종 대상 교체 시 이전 유닛 해제');
  possessUnit(s, lion.uid);

  // 입력 방향(yaw 0 = +z)으로 이동
  const x0 = lion.x, z0 = lion.z;
  setUnitInput(lion, { mx: 0, mz: 1, yaw: 0, atk: false, sk: false });
  for (let i = 0; i < 60; i++) step(s, TUNING.SIM_DT);
  check(lion.z > z0 + 1.5, `조종 — 앞으로 이동 (${(lion.z - z0).toFixed(1)})`);
  check(Math.abs(lion.x - x0) < 1.2, '조종 — 옆으로 새지 않는다');

  // 입력이 없으면 AI 처럼 쫓아가지 않는다
  setUnitInput(lion, { mx: 0, mz: 0, yaw: 0, atk: false, sk: false });
  const z1 = lion.z;
  for (let i = 0; i < 120; i++) step(s, TUNING.SIM_DT);
  check(Math.abs(lion.z - z1) < 0.8, '조종 — 입력이 없으면 AI 자동 이동을 하지 않는다');

  // 공격 버튼 → 기본 공격
  lion.x = bear.x - 2; lion.z = bear.z;
  const bhp = bear.hp;
  setUnitInput(lion, { mx: 0, mz: 0, yaw: Math.PI / 2, atk: true, sk: false });
  let atkSeen = false;
  for (let i = 0; i < 90; i++) {
    step(s, TUNING.SIM_DT);
    if (drainEvents(s).some((e) => e.type === 'attack')) atkSeen = true;
  }
  check(bear.hp < bhp, `조종 — 공격 버튼으로 기본 공격 (${Math.round(bhp - bear.hp)})`);
  check(atkSeen, '조종 — 공격 모션/이벤트');

  // 스킬 즉시 발동 + 쿨타임 체크
  lion.skillTimer = 0;
  setUnitInput(lion, { mx: 0, mz: 0, yaw: Math.PI / 2, atk: false, sk: true });
  step(s, TUNING.SIM_DT);
  const casts = lion.skillCasts;
  check(casts >= 1 && lion.lastSkill === 'roar', '조종 — 스킬 즉시 발동');
  check(lion.skillTimer > 1, '조종 — 스킬 쿨타임 시작');
  step(s, TUNING.SIM_DT);
  step(s, TUNING.SIM_DT);
  check(lion.skillCasts === casts, '조종 — 쿨타임 동안 중복 발동 없음');

  releasePossession(s, lion.uid);
  check(!lion.possessed && s.possessedUid === null, '조종 해제');
  // 해제 후에는 다시 AI 가 움직인다
  const z2 = lion.z;
  for (let i = 0; i < 60; i++) step(s, TUNING.SIM_DT);
  check(Math.abs(lion.z - z2) > 0.4 || Math.abs(lion.x - (bear.x - 2)) > 0.4, '조종 해제 후 AI 자동 전투로 복귀');
}
{
  // 표적이 없어도 바라보는 방향으로 스킬이 나가고 NaN 이 없다 (돌진형)
  const s = createBattle({ blue: [P('tiger', -8, 0)], red: [P('bear', 30, 0)], seed: 73 });
  const tiger = s.units.find((u) => u.team === 'blue');
  possessUnit(s, tiger.uid);
  tiger.skillTimer = 0;
  setUnitInput(tiger, { mx: 0, mz: 0, yaw: Math.PI / 2, atk: false, sk: true });
  const x0 = tiger.x;
  for (let i = 0; i < 30; i++) step(s, TUNING.SIM_DT);
  check(tiger.skillCasts >= 1, '조종 — 표적 없이도 스킬 발동');
  check(tiger.x > x0 + 0.8, '조종 — 돌진 스킬이 바라보는 방향으로 나간다');
  check([tiger.x, tiger.z, tiger.y, tiger.hp].every(Number.isFinite), '조종 — 스킬 후 NaN 없음');
  releasePossession(s);
}
{
  // 구조물·죽은 유닛은 조종할 수 없다
  const s = createBattle({ blue: [P('turret', -6, 0), P('fox', -8, 0)], red: [P('trex', 6, 0)], seed: 75 });
  check(possessUnit(s, s.units.find((u) => u.id === 'turret').uid) === null, '아이템(구조물)은 조종할 수 없다');
  const fox = s.units.find((u) => u.id === 'fox');
  applyDamage(s, s.units.find((u) => u.id === 'trex'), fox, 9999, { unavoidable: true });
  check(possessUnit(s, fox.uid) === null, '죽은 유닛은 조종할 수 없다');
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
check(Object.keys(ATTACK_STYLE).length === CREATURES.length, `${CREATURES.length}종 모두 공격 스타일 지정`);
check(ATTACK_STYLE.drex === 'combo', '디-렉스는 물기+주먹 콤보');
check(ATTACK_STYLE.stone_golem === 'smash' && ATTACK_STYLE.goblin === 'slash' && ATTACK_STYLE.dragon === 'swoop', '신규 유닛 공격 모션');
check(ATTACK_STYLE.strong_chicken === 'bite' && ATTACK_STYLE.sans === 'claw', '강하닭·샌즈 공격 모션');

// 원소 골렘 5종 3D 모델 — 가슴 코어가 따로 있어 박동하고, 원소별 장식이 붙는다
for (const def of ELEMENT_GOLEMS.map((g) => CREATURE_BY_ID[g.id])) {
  const rig = buildAnimalModel(def, 'blue');
  check(!!rig.core && !!rig.coreMat, `[${def.id}] 원소 코어`);
  check(rig.arms && rig.arms.length === 2, `[${def.id}] 양팔`);
  check(rig.coreMat.emissiveIntensity > 0.3, `[${def.id}] 코어 발광`);
  const before = rig.core.scale.x;
  for (let i = 0; i < 90; i++) animateRig(rig, { dt: 1 / 60, moving: true, speed: 3, attack: i % 30 === 0 ? 1 : 0, skill: 0, hurt: 0, dead: false });
  check(Math.abs(rig.core.scale.x - before) > 1e-4, `[${def.id}] 코어 박동 애니메이션`);
  rig.group.updateMatrixWorld(true);
  let meshes = 0;
  const box = new THREE.Box3().setFromObject(rig.group);
  rig.group.traverse((o) => { if (o.isMesh) meshes++; });
  check(meshes >= 25, `[${def.id}] 원소 장식 포함 메시 25개 이상 (${meshes})`);
  check(box.min.y > -0.3 && box.min.y < 0.3, `[${def.id}] 지면에 놓임 (${box.min.y.toFixed(2)})`);
  check(box.max.y - box.min.y > 2.0 && box.max.y - box.min.y < 4.2, `[${def.id}] 골렘 높이 적정 (${(box.max.y - box.min.y).toFixed(2)})`);
  check([rig.group.position.x, rig.group.position.y, rig.group.position.z].every(Number.isFinite), `[${def.id}] NaN 없음`);
}

// 무기 발사는 근접 공격 모션을 쓰지 않는다
triggerShoot(buildAnimalModel(CREATURE_BY_ID.lion, 'blue', { weapon: 'gatling' }));
check(true, '발사 모션 호출');

// 전장 아이템 3D 모델
for (const it of ITEMS) {
  const rig = buildAnimalModel(it, 'blue');
  rig.group.updateMatrixWorld(true);
  let meshes = 0;
  rig.group.traverse((o) => { if (o.isMesh) meshes++; });
  check(meshes >= 8, `[${it.id}] 아이템 메시 8개 이상 (${meshes})`);
  const box = new THREE.Box3().setFromObject(rig.group);
  const size = new THREE.Vector3();
  box.getSize(size);
  check([box.min, box.max].every((v) => [v.x, v.y, v.z].every(Number.isFinite)), `[${it.id}] 바운딩 박스 유효`);
  check(box.min.y > -0.3 && box.min.y < 0.3, `[${it.id}] 지면에 놓임 (min.y=${box.min.y.toFixed(2)})`);
  check(size.y > 0.4 && size.y < 3.8, `[${it.id}] 높이 적정 (${size.y.toFixed(2)})`);
  check(size.x > 0.5 && size.x < 5.0, `[${it.id}] 폭 적정 (${size.x.toFixed(2)})`);
  for (let i = 0; i < 120; i++) {
    animateRig(rig, { dt: 1 / 60, moving: false, speed: 0, attack: 0, skill: i === 60 ? 1 : 0, hurt: 0, dead: false });
  }
  check(Number.isFinite(rig.group.rotation.y) && Number.isFinite(rig.group.position.y), `[${it.id}] 애니메이션 NaN 없음`);
  for (let i = 0; i < 120; i++) animateRig(rig, { dt: 1 / 60, dead: true });
  check(Number.isFinite(rig.group.rotation.z), `[${it.id}] 사망 연출 NaN 없음`);
}
{
  const turretRig = buildAnimalModel(ITEM_BY_ID.turret, 'blue');
  const mineRig = buildAnimalModel(ITEM_BY_ID.landmine, 'blue');
  check(!!turretRig.barrel, '포탑 — 회전 포신 리그');
  check(!!mineRig.lamp, '지뢰 — 점멸등 리그');
  check(!!buildAnimalModel(ITEM_BY_ID.tesla_coil, 'blue').coilGlow, '테슬라 — 발광 리그');
  check(!!buildAnimalModel(ITEM_BY_ID.healing_totem, 'blue').coilGlow, '치유 토템 — 발광 리그');
  // 메갈로돈도 상어처럼 유선형 주둥이 (길이 대비 낮은 실루엣)
  const mega = buildAnimalModel(CREATURE_BY_ID.megalodon, 'blue');
  mega.group.updateMatrixWorld(true);
  const mb = new THREE.Box3().setFromObject(mega.group);
  const ms = new THREE.Vector3();
  mb.getSize(ms);
  check(ms.z / ms.y > 2.0, `메갈로돈 — 유선형 실루엣 (${ms.z.toFixed(2)} / ${ms.y.toFixed(2)})`);
}

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

/* ─────────────── 6. 파티 멀티 (2~4팀 · 예산 200 · 4인 루프백) ─────────────── */

// 진영 데이터
check(PARTY.MAX_PLAYERS === 4 && PARTY.BUDGET === 200, '파티 최대 4명 · 1인당 예산 200');
check(TEAM_ORDER.length === 4, '진영 4종');
for (const t of TEAM_ORDER) {
  const d = TEAM_DEFS[t];
  check(!!d && d.color >= 0 && d.color <= 0xffffff && !!d.name && !!d.css, `[${t}] 진영 색/이름`);
  check(/^#[0-9a-f]{6}$/i.test(d.css), `[${t}] css 색상`);
}
check(new Set(TEAM_ORDER.map((t) => TEAM_DEFS[t].color)).size === 4, '진영 색 4가지 모두 다름');
check(partyTeams(2).length === 2 && partyTeams(3).length === 3 && partyTeams(4).length === 4, '2명→2팀 · 3명→3팀 · 4명→4팀');
check(partyTeams(1).length === 2 && partyTeams(9).length === 4, '인원 범위 보정 (2~4팀)');
check(partyTeams(3).join(',') === 'blue,red,green' && partyTeams(4).join(',') === 'blue,red,green,gold', '진영 순서');

// 부채꼴 경계 — 블루는 언제나 서쪽(x<0)
for (const n of [2, 3, 4]) {
  const teams = partyTeams(n);
  teams.forEach((t) => {
    const b = sectorBounds(teams, t);
    check(Math.abs(b.span - (Math.PI * 2) / n) < 1e-9, `${n}팀 [${t}] 부채꼴 각도 ${(360 / n).toFixed(0)}°`);
    const cx = Math.sin(b.center), cz = Math.cos(b.center);
    const p = clampToSector(teams, t, cx * 20, cz * 20);
    check(Math.hypot(p.x - cx * 20, p.z - cz * 20) < 0.2, `${n}팀 [${t}] 중심 방향은 진영 안`);
  });
  const blue = sectorBounds(teams, 'blue');
  check(Math.abs(Math.sin(blue.center) + 1) < 1e-9, `${n}팀 블루 중심 = 서쪽`);
}
{
  // 경계를 넘은 좌표는 가장 가까운 자기 진영으로 밀린다
  const teams3 = partyTeams(3);
  const p = clampToSector(teams3, 'green', -30, 0);
  const b = sectorBounds(teams3, 'green');
  const ang = Math.atan2(p.x, p.z);
  let rel = ang - b.lo;
  while (rel < 0) rel += Math.PI * 2;
  check(rel >= 0 && rel <= b.span + 1e-9, '3팀 그린 진영 밖 좌표 → 경계로 이동');
  check(Math.hypot(p.x, p.z) > 20, '경계로 밀 때 거리 유지');
}
{
  // 3팀 모드에서 자기 진영 밖에는 놓을 수 없다
  const teams4 = partyTeams(4);
  const list = [];
  const byTeam = {};
  for (const t of teams4) {
    const own = [];
    const r = placeUnits(own, {
      id: 'lion', team: t, x: 0, z: 0, count: 5, teams: teams4, budget: PARTY.BUDGET,
    });
    check(r.added.length === 5, `[${t}] 4팀 진영에 5마리 배치`);
    byTeam[t] = own;
    list.push(...own);
  }
  check(list.length === 20, '4팀 × 5마리 = 20마리');
  for (const t of teams4) {
    const mine = byTeam[t];
    const b = sectorBounds(teams4, t);
    mine.forEach((q) => {
      let rel = Math.atan2(q.x, q.z) - b.lo;
      while (rel < 0) rel += Math.PI * 2;
      check(rel >= -1e-6 && rel <= b.span + 1e-6, `[${t}] 놓인 유닛이 자기 부채꼴 안`);
    });
  }
  check(list.every((q) => Math.hypot(q.x, q.z) <= TUNING.ARENA_RADIUS), '4팀 배치가 경기장 안');
}

// 1인당 예산 (PARTY.BUDGET = 200)
{
  const budget = PARTY.BUDGET;
  const lionCost = CREATURE_BY_ID.lion.cost;
  const fit = Math.floor(budget / lionCost);
  const list = [];
  let guard = 0;
  while (guard++ < 12) {
    const res = placeUnits(list, { id: 'lion', team: 'blue', x: -10 - (guard % 6) * 6, z: -20 + Math.floor(guard / 6) * 6, count: 20, budget, limit: 400 });
    if (!res.added.length) break;
  }
  check(list.length === fit && costOf(list) === fit * lionCost, `예산 ${budget} → 사자 ${fit}마리 (${list.length})`);
  check(costOf(list) <= budget, `사용 예산 ${costOf(list)} ≤ ${budget}`);
  check(affordableCount(list, 'lion', budget) === 0, '예산을 다 써서 사자 불가');
  check(affordableCount(list, 'fox', budget) === 0, '남은 0 으로 여우도 불가');
  const over = placeUnits(list, { id: 'titan', team: 'blue', x: -10, z: 5, budget });
  check(over.added.length === 0 && over.skipped === 'budget', '예산 밖 타이탄 거부');

  const half = [];
  placeUnits(half, { id: 'lion', team: 'blue', x: -10, z: 0, count: 20, budget, limit: 400 });
  const left = budget - costOf(half);
  check(costOf(half) === 20 * lionCost, `사자 20마리 = ${20 * lionCost} (${costOf(half)})`);
  check(affordableCount(half, 'lion', budget) === Math.floor(left / lionCost), `남은 ${left} 로 사자 ${Math.floor(left / lionCost)}마리`);
  check(affordableCount(half, 'fox', budget) === Math.floor(left / CREATURE_BY_ID.fox.cost), '남은 예산으로 여우 계산');
  check(affordableCount(half, 'strong_chicken', budget) === Math.floor(left / CREATURE_BY_ID.strong_chicken.cost), '남은 예산으로 강하닭 계산');
}

// 3팀 · 4팀 전투
for (const n of [3, 4]) {
  const teams = partyTeams(n);
  const sides = {};
  teams.forEach((t, i) => {
    const b = sectorBounds(teams, t);
    const dx = Math.sin(b.center), dz = Math.cos(b.center);
    sides[t] = [];
    for (let k = 0; k < 6; k++) {
      const id = CREATURE_IDS[(i * 5 + k) % CREATURE_IDS.length];
      sides[t].push(P(id, dx * (8 + k * 1.6), dz * (8 + k * 1.6), k === 0 ? 'gatling' : 'none'));
    }
  });
  const s = createBattle({ sides, teams, arenaId: 'savanna', seed: 900 + n });
  check(s.teams.length === n, `${n}팀 전투 진영 기록`);
  check(s.units.length === n * 6, `${n}팀 × 6마리 = ${s.units.length}마리`);
  simulate(s, TUNING.SIM_DT, 400);
  check(s.over, `${n}팀 전투 종료`);
  check(teams.includes(s.winner) || s.winner === 'draw', `${n}팀 전투 승자 판정 (${s.winner})`);
  check(s.units.every(finiteUnit), `${n}팀 전투 NaN 없음`);
  check(s.units.every((u) => Math.hypot(u.x, u.z) <= TUNING.ARENA_RADIUS + 0.6), `${n}팀 전투 경기장 이탈 없음`);
  const dmgTeams = new Set(s.units.filter((u) => u.dmgDealt > 0).map((u) => u.team));
  check(dmgTeams.size >= 2, `${n}팀 모두 공격에 참여`);
  const hitTeams = new Set(s.units.filter((u) => u.dmgTaken > 0).map((u) => u.team));
  check(hitTeams.size >= 2, `${n}팀 모두 피해를 받음`);
  const survivors = teams.filter((t) => aliveCount(s, t) > 0);
  check(s.endReason !== 'elimination' || survivors.length <= 1, `${n}팀 전멸 판정 정합`);
  if (s.winner !== 'draw') check(aliveCount(s, s.winner) > 0 || s.endReason === 'timeout', '승리 팀은 살아 있음');
  const sum = battleSummary(s);
  check(sum.teams.length === n && Object.keys(sum.byTeam).length === n, `${n}팀 요약에 진영별 결과`);
  check(teams.every((t) => Array.isArray(sum.byTeam[t]) && sum.byTeam[t].length === 6), `${n}팀 요약 유닛 수`);
  check(!!mvpOf(s), `${n}팀 MVP 산출`);
}

// 3팀 진영은 서로 다른 두 팀을 함께 공격한다 (진짜 3파전)
{
  const teams = partyTeams(3);
  const s = createBattle({
    sides: {
      blue: [P('lion', -12, 0)], red: [P('lion', 8, 6)], green: [P('lion', 8, -6)],
    },
    teams, seed: 31,
  });
  const seen = new Set();
  for (let i = 0; i < 900 && !s.over; i++) {
    step(s, TUNING.SIM_DT);
    for (const u of s.units) {
      if (u.dead || !u.targetId) continue;
      const t = s.units.find((x) => x.uid === u.targetId);
      if (t && t.team !== u.team) seen.add(`${u.team}>${t.team}`);
    }
  }
  check(seen.size >= 2, `3팀이 서로 다른 팀을 노린다 (${[...seen].join(',')})`);
}

// 3팀 시간 초과 판정 (남은 체력 1위)
{
  const teams = partyTeams(3);
  const s = createBattle({
    sides: { blue: [P('elephant', -14, 0)], red: [P('fox', 12, 8)], green: [P('fox', 12, -8)] },
    teams, seed: 5, maxTime: 2,
  });
  s.units.forEach((u) => { u.atk = 0; u.skillTimer = 99; });
  s.units.forEach((u) => { if (u.team !== 'blue') u.hp = u.maxHp * 0.4; });
  simulate(s, TUNING.SIM_DT, 10);
  check(s.endReason === 'timeout', '3팀 시간 초과 판정');
  check(s.winner === 'blue', '3팀 시간 초과 — 체력 우세 팀 승리');
  check(teamHpRatio(s, 'blue') >= teamHpRatio(s, 'red'), '체력 비율 1위가 승자');
}

// 진영이 바뀌어도 배치는 진영 안으로 다시 모인다
{
  const list = [{ id: 'lion', x: 20, z: 0, weapon: 'none' }, { id: 'fox', x: 3, z: 3, weapon: 'none' }];
  const moved = reclampList(list, 'green', partyTeams(4));
  const b = sectorBounds(partyTeams(4), 'green');
  moved.forEach((q) => {
    let rel = Math.atan2(q.x, q.z) - b.lo;
    while (rel < 0) rel += Math.PI * 2;
    check(rel >= -1e-6 && rel <= b.span + 1e-6, '진영 변경 후 재배치');
  });
}

// 넷 — 방 코드 · 패킷
{
  const code = makeRoomCode();
  check(code.length === 4 && isValidRoomCode(code), `방 코드 4자리 (${code})`);
  check(normalizeRoomCode(' ab-cd ') === 'ABCD', '방 코드 정리');
  check(normalizeRoomCode('O0I1') === '', '헷갈리는 문자 제외');
  const m = decodeMsg(encodeMsg('join', { pid: 'x' }));
  check(m && m.t === 'join' && m.p.pid === 'x', '메시지 인코딩/디코딩');
  check(decodeMsg('nope') === null, '깨진 메시지 무시');
}
{
  const ev = { type: 'hit', uid: 3, x: 12.345, z: -4.5, y: 1.1, dmg: 21.5, crit: true, dot: false };
  const back = unpackEvent(packEvent(ev));
  check(back.type === 'hit' && back.uid === 3 && Math.abs(back.x - 12.35) < 0.02 && back.crit === true && back.dot === false, '이벤트 압축 왕복');
  check(packEvent({ type: 'nope' }) === null, '모르는 이벤트는 보내지 않음');

  // 라스트 브레스 · 신규 4종 이벤트도 파티에서 동기화된다
  const hand = unpackEvent(packEvent({ type: 'gasterHand', uid: 9, x: 3.2, z: -1.4, side: -1, i: 1, r: 4.4 }));
  check(hand && hand.type === 'gasterHand' && hand.i === 1 && hand.side === -1, '가스터손 이벤트 압축');
  const rude = unpackEvent(packEvent({ type: 'rudeAttack', uid: 9, x: 1, z: 2, i: 3, count: 5 }));
  check(rude && rude.type === 'rudeAttack' && rude.count === 5, '불미스러운 공격 이벤트 압축');
  const hero = unpackEvent(packEvent({ type: 'heroStrike', uid: 4, x: 0, z: 0, i: 2, style: 'uppercut' }));
  check(hero && hero.type === 'heroStrike' && hero.style === 'uppercut', '영웅 펀치 이벤트 압축');
  const venom = unpackEvent(packEvent({ type: 'tripleVenom', uid: 4, x: 0, z: 0, ang: 1.2, lane: 0, r: 12 }));
  check(venom && venom.type === 'tripleVenom' && Math.abs(venom.ang - 1.2) < 0.02, '히드라 브레스 이벤트 압축');
  for (const t of ['rudeText', 'gasterHand', 'tripleVenom', 'heroStrike', 'heroCombo', 'chestBeat', 'tuskQuakeLand']) {
    check(!!unpackEvent(packEvent({ type: t, uid: 1, x: 1, z: 1, text: '🖕', style: 'power', lane: 0, r: 3, i: 0, count: 2, side: 1 })), `[${t}] 파티 이벤트 등록`);
  }
  // 전장 아이템 연출 이벤트도 파티에서 동기화된다
  const arc = unpackEvent(packEvent({ type: 'chainLightning', uid: 5, x: 1, y: 2.4, z: 2, x2: 6, y2: 1, z2: -3 }));
  check(arc && arc.type === 'chainLightning' && Math.abs(arc.x2 - 6) < 0.02 && Math.abs(arc.z2 + 3) < 0.02, '연쇄 번개 이벤트 압축');
  const healPulse = unpackEvent(packEvent({ type: 'healPulse', uid: 5, x: 1, z: 2, r: 9 }));
  check(healPulse && healPulse.r === 9, '치유 파동 이벤트 압축');
  const spike = unpackEvent(packEvent({ type: 'spikeHit', uid: 5, x: 1, z: 2 }));
  check(spike && spike.uid === 5, '가시 피해 이벤트 압축');
}

/* ── 4인 파티 루프백 ── */
{
  const hub = new MemoryHub();
  const S = makeLoopback(4, { hub });
  const [host, g2, g3, g4] = S;
  check(host.phase === PHASE.IDLE, '시작 전에는 대기 상태');

  const code = await host.host('지우');
  check(host.phase === PHASE.PLACE && host.isHost, '파티 열기 → 배치 단계');
  check(host.playerCount === 1 && host.myTeam === 'blue', '방장은 혼자 시작 (블루)');

  await g2.join(code, '친구2');
  await sleep(40);
  check(host.playerCount === 2 && host.teams.length === 2, '2명 → 2팀');
  check(host.players.get(g2.myPid).team === 'red', '2번째 참가자 = 레드');

  await g3.join(code, '친구3');
  await sleep(40);
  check(host.playerCount === 3 && host.teams.join(',') === 'blue,red,green', '3명 → 3팀');
  check(g3.myTeam === 'green', '3번째 참가자 = 그린');

  await g4.join(code, '친구4');
  await sleep(60);
  check(host.playerCount === 4, '4명 참가');
  check(host.teams.join(',') === 'blue,red,green,gold' && g4.myTeam === 'gold', '4명 → 4팀 (4번째 = 골드)');
  check(g4.playerCount === 4 && g4.teams.length === 4, '손님도 4팀을 본다');

  // 5번째는 거절된다
  const g5 = makeLoopback(1, { hub })[0];
  let joinErr = null;
  try { await g5.join(code, '5번째'); } catch (e) { joinErr = e.message; }
  check(!!joinErr && joinErr.includes('가득'), `5번째 참가 거절 (${joinErr})`);
  check(host.playerCount === 4, '거절 후에도 4명 유지');
  check(g2.net.active && g3.net.active && g4.net.active, '가득 참 거절이 다른 참가자 연결을 끊지 않는다');
  check(g5.net.role === null, '거절당한 참가자는 연결 정리');

  // 예산 200 — 모두 자기 진영에만 놓는다
  const pool = ['lion', 'tiger', 'bear', 'wolf', 'eagle', 'boar'];
  S.forEach((s, i) => {
    const list = [];
    for (let k = 0; k < 9; k++) list.push({ id: pool[(i + k) % pool.length], x: 0, z: 0, weapon: k === 0 ? 'rocket' : 'none' });
    s.setPlacements(list);
  });
  await sleep(80);
  for (const s of S) {
    check(s.playerCount === 4, '모두 4명을 본다');
    check(s.order.every((pid) => s.players.get(pid).placements.length > 0), '모두 배치를 공유');
    check(costOf(s.me.placements) <= PARTY.BUDGET, `[${s.myTeam}] 예산 ${PARTY.BUDGET} 이내 (${costOf(s.me.placements)})`);
  }
  const hostCounts = host.order.map((pid) => host.players.get(pid).placements.length);
  const guestCounts = g4.order.map((pid) => g4.players.get(pid).placements.length);
  check(hostCounts.join(',') === guestCounts.join(','), '배치가 모든 참가자에게 동일하게 보인다');

  check(!host.canStart(), '준비 전에는 시작 불가');
  S.forEach((s) => s.setReady(true));
  await sleep(80);
  check(host.canStart(), '모두 준비 → 시작 가능');
  check(g4.me.ready === true, '손님 준비 상태 전달');

  // 예산을 넘기면 잘라 낸다
  host.setPlacements([...host.me.placements, { id: 'titan', x: 0, z: 0, weapon: 'none' }]);
  await sleep(40);
  check(costOf(host.me.placements) <= PARTY.BUDGET, '예산 초과분은 자동 제거');

  const started = host.requestStart();
  await sleep(60);
  check(started, '방장이 배틀 시작');
  check(host.phase === PHASE.BATTLE && g4.phase === PHASE.BATTLE, '모두 배틀 단계');
  check(!!host.battle && !!g4.battle, '모두 배틀 상태를 받음');
  check(host.battle.units.length === g4.battle.units.length, '유닛 수 동일');
  check(host.battle.units.every((u, i) => u.uid === g4.battle.units[i].uid), '유닛 순서/uid 동일');
  check(host.battle.teams.length === 4, '4팀 전투');

  // 방장이 시뮬레이션 → 손님은 스냅샷으로 따라온다
  let guard = 0;
  let tickErr = null;
  while (!host.battle.over && guard < 20000) {
    simulate(host.battle, 1 / 60, 1 / 60);
    try {
      host.tick(1 / 60);
      g2.tick(1 / 60);
      g3.tick(1 / 60);
      g4.tick(1 / 60);
    } catch (e) { tickErr = String(e && e.message || e); }
    g4.battle.events.length = 0;
    guard++;
  }
  check(tickErr === null, `전투 중 모든 참가자 tick 이 오류 없이 돈다 (${tickErr || 'ok'})`);
  await sleep(150);
  host.tick(1 / 60);
  await sleep(60);
  check(host.battle.over, '4팀 배틀 종료');
  check(g4.battle.over, '손님도 종료 상태를 받음');
  check(g4.battle.winner === host.battle.winner, `승자가 동일 (${host.battle.winner})`);
  const mismatch = host.battle.units.filter((u, i) => {
    const v = g4.battle.units[i];
    return !v || Math.hypot(u.x - v.x, u.z - v.z) > 0.25 || u.dead !== v.dead;
  });
  check(mismatch.length === 0, `손님 화면 위치/사망 동기화 (${mismatch.length} 불일치)`);
  host.teams.forEach((t) => {
    check(aliveCount(host.battle, t) === aliveCount(g4.battle, t), `[${t}] 생존 수 동기화`);
  });
  const hostMvp = mvpOf(host.battle);
  const guestMvp = g4.battle.units.find((u) => u.uid === hostMvp.uid);
  check(Math.round(guestMvp.dmgDealt) === Math.round(hostMvp.dmgDealt), 'MVP 피해량 동기화');
  check(g4.battle.log.length > 1, '손님도 전투 기록을 받는다');

  // 다시 배치
  const ok = host.rematch();
  await sleep(60);
  check(ok && host.phase === PHASE.PLACE && g4.phase === PHASE.PLACE, '다시 배치 단계로');
  check(S.every((s) => s.me.ready === false), '재대결 시 준비 초기화');

  // 중복 메시지 걸러내기 (중계 서버 2개 → 같은 메시지 2번 도착)
  let got = 0;
  host.net.onMessage = () => { got++; };
  const text = encodeMsg('place', { list: [] });
  const stamped = text.slice(0, -1) + ',"f":"OTHER1","s":1}';
  host.net._dispatch(stamped);
  host.net._dispatch(stamped);
  check(got === 1, `같은 메시지 중복 제거 (${got}회 처리)`);
  host.net.onMessage = (m) => host.handle(m);

  // 나가기
  g4.leave();
  await sleep(80);
  check(host.playerCount >= 3, '손님이 나가면 인원이 줄어든다');
  host.leave();
}

// 가만히 있어도 연결이 유지된다 (손님 6초마다 ping · 30초 무응답이면 정리)
{
  const hub = new MemoryHub();
  const [host, guest] = makeLoopback(2, { hub });
  const code = await host.host('방장');
  await guest.join(code, '손님');
  await sleep(50);
  guest.setPlacements([{ id: 'lion', x: 0, z: 0, weapon: 'none' }]);
  await sleep(30);
  for (let i = 0; i < 8; i++) { guest.tick(6); await sleep(15); host.tick(0.2); }
  check(host.playerCount === 2, `조용한 손님이 유지된다 (${host.playerCount}명)`);
  check(host.players.get(guest.myPid).placements.length === 1, '배치도 유지된다');
  // 잠시 끊긴 것(40초)은 남겨 두고 '연결 끊김'으로만 표시한다
  host.players.get(guest.myPid).lastAt = Date.now() - 40000;
  host.tick(0.2);
  await sleep(30);
  check(host.playerCount === 2, '40초 무응답은 방에 남아 있다');
  check(host.players.get(guest.myPid).stale === true, '연결 끊김 표시');
  check(host.snapshotState().players.some((x) => x.stale), 'UI 에 연결 끊김 노출');
  // 3분 넘게 안 돌아오면 정리된다
  host.players.get(guest.myPid).lastAt = Date.now() - 200000;
  host.tick(0.2);
  await sleep(30);
  check(host.playerCount === 1, '3분 무응답 참가자는 정리');
  host.leave();
}

// 2인 파티는 2팀으로 돌아간다
{
  const hub = new MemoryHub();
  const [host, g2] = makeLoopback(2, { hub });
  const code = await host.host('호스트');
  await g2.join(code, '손님');
  await sleep(50);
  check(host.teams.length === 2 && g2.teams.length === 2, '2인 파티 = 2팀');
  check(host.players.get(g2.myPid).team === 'red', '2인 파티 손님 = 레드');
  host.leave();
}

// 회귀: 3명이 들어오면 방장·손님 전원 화면이 3팀(블루·레드·그린)으로 보인다
{
  const hub = new MemoryHub();
  const [host, g2, g3] = makeLoopback(3, { hub });
  const code = await host.host('지우');
  await g2.join(code, '친구2');
  await sleep(50);
  // 2명 상태에서 3번째가 늦게 들어왔을 때 — 기존 손님(g2)도 3팀을 봐야 한다
  await g3.join(code, '친구3');
  await sleep(80);
  const teamsStr = 'blue,red,green';
  check(host.playerCount === 3 && host.teams.join(',') === teamsStr, '방장: 3명 → 3팀');
  check(g2.playerCount === 3 && g2.teams.join(',') === teamsStr, '먼저 들어온 손님: 3명 → 3팀');
  check(g3.playerCount === 3 && g3.teams.join(',') === teamsStr, '늦게 들어온 손님: 3명 → 3팀');
  for (const [i, s] of [[0, host], [1, g2], [2, g3]]) {
    const snap = s.snapshotState();
    check(snap.teamCount === 3 && snap.teams.join(',') === teamsStr, `참가자 ${i + 1} UI 스냅샷 teamCount 3`);
    check(snap.players.length === 3, `참가자 ${i + 1} UI 스냅샷 참가자 3명`);
  }
  check(host.players.get(g2.myPid).team === 'red' && host.players.get(g3.myPid).team === 'green', '진영 배정 블루·레드·그린');
  check(g2.myTeam === 'red' && g3.myTeam === 'green', '손님들 자기 진영 인식');

  // 배치 · 준비 후 시작 — 전투도 3팀으로
  const spots = { blue: [-10, 0], red: [10, 6], green: [10, -6] };
  for (const s of [host, g2, g3]) {
    const [x, z] = spots[s.myTeam];
    s.setPlacements([{ id: 'lion', x, z, weapon: 'none' }]);
    s.setReady(true);
  }
  await sleep(100);
  check(host.canStart(), '3인 전원 준비 → 시작 가능');
  const okStart = host.requestStart();
  await sleep(120);
  check(okStart, '3인 배틀 시작');
  for (const s of [host, g2, g3]) {
    check(s.battle && s.battle.teams.join(',') === teamsStr, '전투도 3팀 동기화');
    check(s.battle.units.length === 3, '3팀 × 1마리 = 3마리');
  }
  // 방장 시뮬 → 손님 스냅샷 동기화 중에도 3팀 유지
  let guard = 0;
  while (!host.battle.over && guard < 20000) {
    simulate(host.battle, 1 / 60, 1 / 60);
    host.tick(1 / 60); g2.tick(1 / 60); g3.tick(1 / 60);
    g2.battle.events.length = 0; g3.battle.events.length = 0;
    guard++;
  }
  await sleep(120); host.tick(1 / 60); await sleep(60);
  check(g3.battle.over && g3.battle.winner === host.battle.winner, '3인 배틀 승자 동기화');
  check(g3.battle.teams.join(',') === teamsStr, '전투 내내 3팀 유지');
  host.leave(); g2.leave(); g3.leave();
}

// 파티: 아이템 동기화 + 손님의 직접 조종 입력이 방장 시뮬레이션에 적용된다
{
  const hub = new MemoryHub();
  const [host, guest] = makeLoopback(2, { hub });
  const code = await host.host('지우');
  await guest.join(code, '친구');
  await sleep(60);
  host.setPlacements([
    { id: 'turret', x: -6, z: 0, weapon: 'none' },
    { id: 'lion', x: -9, z: 0, weapon: 'none' },
  ]);
  guest.setPlacements([
    { id: 'spike_barricade', x: 6, z: 0, weapon: 'none' },
    { id: 'wolf', x: 9, z: 0, weapon: 'none' },
  ]);
  await sleep(80);
  host.setReady(true);
  guest.setReady(true);
  await sleep(80);
  check(host.canStart(), '아이템 배치로도 파티 시작 가능');
  check(host.requestStart(), '아이템 포함 파티 배틀 시작');
  await sleep(120);
  const gUnits = guest.battle.units;
  check(gUnits.length === 4 && gUnits.some((u) => u.id === 'turret') && gUnits.some((u) => u.id === 'spike_barricade'),
    '손님도 아이템 유닛을 받는다');
  check(gUnits.filter((u) => u.isStructure).every((u) => u.spd === 0 && u.kbResist === 1), '손님 화면 구조물 고정');
  check(gUnits.filter((u) => u.isStructure).every((u) => u.weaponId === 'none'), '아이템은 무기를 달지 않는다');

  // 손님이 자기 늑대를 조종 → 방장 시뮬레이션에 입력이 적용된다
  const wolf = host.battle.units.find((u) => u.id === 'wolf');
  guest.control(wolf.uid, { mx: 0, mz: 1, yaw: 0, atk: false, sk: false });
  await sleep(60);
  host.tick(1 / 60);
  const hw = host.battle.units.find((u) => u.uid === wolf.uid);
  check(hw.possessed, '손님 입력 → 방장이 조종 적용');
  // 남의 진영 유닛은 조종할 수 없다
  const lion = host.battle.units.find((u) => u.id === 'lion');
  guest.control(lion.uid, { mz: 1 });
  await sleep(60);
  host.tick(1 / 60);
  check(!host.battle.units.find((u) => u.uid === lion.uid).possessed, '남의 진영 유닛은 조종할 수 없다');
  guest.control(wolf.uid, { release: true });
  await sleep(60);
  host.tick(1 / 60);
  check(!host.battle.units.find((u) => u.uid === wolf.uid).possessed, '손님 조종 해제');

  // 전투 끝까지 오류 없이 돌고 승자가 동기화된다
  let guard = 0;
  let partyErr = null;
  while (!host.battle.over && guard < 20000) {
    try {
      simulate(host.battle, 1 / 60, 1 / 60);
      host.tick(1 / 60);
      guest.tick(1 / 60);
      guest.battle.events.length = 0;
    } catch (err) { partyErr = String((err && err.message) || err); }
    guard++;
  }
  check(partyErr === null, `아이템 파티 배틀이 오류 없이 끝난다 (${partyErr || 'ok'})`);
  await sleep(150);
  host.tick(1 / 60);
  await sleep(90);
  check(guest.battle.over && guest.battle.winner === host.battle.winner, '아이템 파티 승자 동기화');
  host.leave();
  guest.leave();
}

/* ── 8. ⏹ 강제 종료 (즉시 종료 · 승패 판정 · 조종 중 · 파티 동기화) ── */
{
  // ① 전투 중 강제 종료 → 그 자리에서 끝나고 남은 체력 비율로 승자가 난다
  const b = createBattle({ blue: [P('trex', -6, 0), P('raptor', -4, 2)], red: [P('triceratops', 6, 0)], seed: 11 });
  simulate(b, 1 / 60, 1.5);
  check(!b.over, '강제 종료 전에는 전투가 진행 중');
  const tBefore = b.time;
  const forces = drainEvents(b).filter((e) => e.type === 'end').length;
  const ratioBlue = teamHpRatio(b, 'blue');
  const ratioRed = teamHpRatio(b, 'red');
  const expectWin = Math.abs(ratioBlue - ratioRed) >= 0.03
    ? (ratioBlue > ratioRed ? 'blue' : 'red')
    : (aliveCount(b, 'blue') === aliveCount(b, 'red') ? 'draw' : (aliveCount(b, 'blue') > aliveCount(b, 'red') ? 'blue' : 'red'));
  forceEndBattle(b);
  check(b.over === true, '강제 종료 → 즉시 over');
  check(b.forcedEnd === true, '강제 종료 플래그(forcedEnd)');
  check(b.endReason === 'force', `종료 사유 = force (${b.endReason})`);
  check(b.winner === expectWin, `남은 체력 비율로 승자 판정 (${b.winner} / 기대 ${expectWin})`);
  check(Math.abs(b.time - tBefore) < 1e-9, '강제 종료는 시간을 더 흘리지 않는다');
  check(drainEvents(b).filter((e) => e.type === 'end').length === 1 && forces === 0,
    '강제 종료는 end 이벤트를 한 번만 낸다');
  check(b.log.some((l) => l.text.includes('강제 종료')), '전투 기록에 강제 종료 표시');
  check(b.log[b.log.length - 1].kind === 'end', '마지막 기록은 승패 줄');
  const sum = battleSummary(b);
  check(sum.reason === 'force' && sum.forcedEnd === true && sum.winner === b.winner, 'battleSummary 에 강제 종료 판정 반영');
  check(!!mvpOf(b), '강제 종료 후에도 MVP 를 고를 수 있다');
  const again = forceEndBattle(b);
  check(again.winner === b.winner && again.endReason === 'force', '이미 끝난 전투는 판정을 바꾸지 않는다');

  // ② 시간 종료 전에 끝나도 시뮬레이션은 더 돌지 않는다
  const t0 = b.time;
  for (let i = 0; i < 60; i++) step(b, 1 / 60);
  check(b.time === t0, '종료된 전투는 step 해도 시간이 늘지 않는다');
}
{
  // ③ 조종 중 강제 종료 → 조종이 풀리고 그대로 판정된다
  const b = createBattle({ blue: [P('lion', -5, 0)], red: [P('wolf', 5, 0)], seed: 5 });
  simulate(b, 1 / 60, 0.5);
  const lion = b.units.find((u) => u.id === 'lion');
  possessUnit(b, lion.uid, 'p1');
  setUnitInput(lion, { mx: 0, mz: 1, atk: true });
  check(possessedUnit(b)?.uid === lion.uid, '조종 중 상태 확인');
  forceEndBattle(b);
  check(b.over && possessedUnit(b) === null, '조종 중 강제 종료 → 조종 해제');
  check(b.units.every((u) => !u.possessed && u.input === null), '모든 유닛의 조종 입력이 정리된다');
  check(b.winner === 'blue' || b.winner === 'red' || b.winner === 'draw', `조종 중 강제 종료도 승패를 낸다 (${b.winner})`);
}
{
  // ④ 살아 있는 유닛이 없거나 체력이 같으면 무승부
  const b = createBattle({ blue: [P('lion', -5, 0)], red: [P('wolf', 5, 0)], seed: 9 });
  const [bl, rd] = [b.units.find((u) => u.team === 'blue'), b.units.find((u) => u.team === 'red')];
  bl.hp = bl.maxHp * 0.5;
  rd.hp = rd.maxHp * 0.5;
  forceEndBattle(b);
  check(b.winner === 'draw', `체력 비율이 같으면 무승부 (${b.winner})`);

  // 체력이 높은 쪽이 이긴다 (반대 방향도 확인)
  const b2 = createBattle({ blue: [P('lion', -5, 0)], red: [P('wolf', 5, 0)], seed: 9 });
  const [bl2, rd2] = [b2.units.find((u) => u.team === 'blue'), b2.units.find((u) => u.team === 'red')];
  bl2.hp = bl2.maxHp * 0.2;
  rd2.hp = rd2.maxHp * 0.9;
  forceEndBattle(b2);
  check(b2.winner === 'red', `체력이 높은 진영 승리 (${b2.winner})`);
}

// ⑤ 파티: 방장이 강제 종료하면 손님 화면도 함께 끝나고, 손님은 혼자서도 빠져나올 수 있다
{
  const hub = new MemoryHub();
  const [host, guest] = makeLoopback(2, { hub });
  const code = await host.host('지우');
  await guest.join(code, '친구');
  await sleep(60);
  host.setPlacements([P('trex', -6, 0), P('raptor', -4, 2)]);
  guest.setPlacements([P('triceratops', 6, 0), P('wolf', 8, 0)]);
  await sleep(80);
  host.setReady(true);
  guest.setReady(true);
  await sleep(80);
  check(host.requestStart(), '강제 종료 테스트 파티 배틀 시작');
  await sleep(120);
  for (let i = 0; i < 90; i++) {
    simulate(host.battle, 1 / 60, 1 / 60);
    host.tick(1 / 60);
    guest.tick(1 / 60);
    guest.battle.events.length = 0;
  }
  check(!host.battle.over && host.phase === PHASE.BATTLE, '강제 종료 전 파티 전투 진행 중');

  // 손님이 먼저 혼자 빠져나온다 — 방장 시뮬레이션은 계속 돌아간다
  check(guest.forceEndLocal() === true, '손님 forceEndLocal() 성공');
  check(guest.battle.over && guest.battle.endReason === 'force', '손님 화면은 즉시 종료');
  check(guest.phase === PHASE.END, '손님 파티 단계 = 종료');
  check(!host.battle.over && host.phase === PHASE.BATTLE, '손님 강제 종료가 방장 전투를 멈추지 않는다');
  const gWinner = guest.battle.winner;
  await sleep(80);
  host.tick(1 / 60);
  guest.tick(1 / 60);
  check(guest.battle.over && guest.battle.winner === gWinner, '손님은 이후 스냅샷에도 배틀이 되살아나지 않는다');
  check(host.forceEnd() === false || host.battle.over, '강제 종료 이후 중복 호출은 안전');
  host.leave();
  guest.leave();
}
{
  const hub = new MemoryHub();
  const [host, guest] = makeLoopback(2, { hub });
  const code = await host.host('지우');
  await guest.join(code, '친구');
  await sleep(60);
  host.setPlacements([P('lion', -6, 0), P('bear', -4, 2)]);
  guest.setPlacements([P('wolf', 6, 0), P('boar', 8, 0)]);
  await sleep(80);
  host.setReady(true);
  guest.setReady(true);
  await sleep(80);
  host.requestStart();
  await sleep(120);
  for (let i = 0; i < 90; i++) {
    simulate(host.battle, 1 / 60, 1 / 60);
    host.tick(1 / 60);
    guest.tick(1 / 60);
    guest.battle.events.length = 0;
  }
  const ended = [];
  guest.onEnd = (b) => ended.push(b.winner);
  check(host.forceEnd() === true, '방장 forceEnd() 성공');
  check(host.battle.over && host.battle.endReason === 'force', '방장 전투 즉시 종료');
  await sleep(90);
  check(guest.battle.over, '손님 화면도 즉시 종료 (end 동기화)');
  check(ended.length === 1 && ended[0] === host.battle.winner, '손님 결과 배너 콜백이 승자와 함께 한 번 뜨다');
  check(guest.battle.winner === host.battle.winner, `방장·손님 승자 동일 (${host.battle.winner})`);
  check(guest.battle.endReason === 'force', '손님도 강제 종료 판정으로 표시');
  check(guest.battle.forcedEnd === true, '손님 배틀에도 forcedEnd 플래그');
  check(guest.phase === PHASE.END, '손님 파티 단계 = 종료');

  // 패킷이 사라져도 다시 전달된다 — 종료 후 tick 이 종료 스냅샷을 재전송한다
  const sentBefore = host.stats.sent;
  host._lastEndAt = 0;
  host.tick(1 / 60);
  check(host.stats.sent > sentBefore, '종료 후에도 tick 이 종료 스냅샷을 재전송');
  check(host.battle.over && host.battle.winner === guest.battle.winner, '종료 후에도 파티 상태가 유지된다');
  host.leave();
  guest.leave();
}
{
  // ⑥ 소스 배선: main.js 가 버튼 → 조종 해제 · 일시정지 해제 · endBattle · 파티 동기화로 잇는다
  const mainSrc = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const uiSrc = fs.readFileSync(new URL('../src/ui.js', import.meta.url), 'utf8');
  const htmlSrc = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  check(htmlSrc.includes('id="btn-force-end"') && htmlSrc.includes('⏹ 강제 종료'), 'index.html 에 ⏹ 강제 종료 버튼');
  check(/\?v=(\d+)/.test(htmlSrc), 'index.html 캐시 버지닝 ?v= 유지');
  check(uiSrc.includes("$('#btn-force-end')"), 'ui.js 가 강제 종료 버튼을 참조');
  check(/this\.hooks\.onForceEnd\?\.\(\)/.test(uiSrc), 'ui.js 클릭 → onForceEnd 콜백');
  check(/setForceEnd\(true\)/.test(uiSrc) && /setForceEnd\(false\)/.test(uiSrc), 'ui.js 전투 중에만 버튼 표시');
  check(/onForceEnd:\s*\(\)\s*=>\s*forceEndNow\(\)/.test(mainSrc), 'main.js onForceEnd 배선');
  const fn = mainSrc.match(/function forceEndNow\(\)\s*\{([\s\S]*?)\n\}/);
  check(!!fn, 'main.js forceEndNow()');
  const body = fn ? fn[1] : '';
  check(/exitPossession\(true\)/.test(body), '강제 종료 시 조종 해제');
  check(/app\.paused\s*=\s*false/.test(body) && /ui\.setPaused\(false\)/.test(body), '강제 종료 시 일시정지 해제');
  check(/forceEndBattle\(battle\)/.test(body), 'sim.forceEndBattle 호출');
  check(/endBattle\(\)/.test(body), '강제 종료 → endBattle() 결과 배너');
  check(/forceEndLocal\(\)/.test(body) && /forceEnd\(\)/.test(body), '파티 방장/손님 경로 분기');
  check(/if \(phase !== 'battle'\) return;/.test(mainSrc), 'endBattle 은 전투 중에만 동작 (중복 배너 방지)');
  check(/setForceEnd\(false\)/.test(mainSrc), '종료 시 강제 종료 버튼 숨김');
  const partySrc = fs.readFileSync(new URL('../src/party.js', import.meta.url), 'utf8');
  check(/forceEnd\(\)\s*\{/.test(partySrc) && /forceEndLocal\(\)\s*\{/.test(partySrc), 'party.js 방장/손님 강제 종료 API');
  check(/this\._localEnd = true/.test(partySrc), '손님 로컬 종료 상태 기록');
}

/* ── 9. 직접 조종: 공격·스킬 중에도 이동이 막히지 않는다 (무빙어택/무빙샷) ── */
{
  // 조종 유닛을 입력대로 n프레임 움직이며 이동 거리·대시·기절 프레임을 재는 도우미
  const run = (opts) => {
    const b = createBattle({
      blue: [P(opts.id, opts.x ?? -5, opts.z ?? 0)],
      red: [P(opts.foe || 'wolf', opts.foeX ?? 0, opts.foeZ ?? 0)],
      seed: 6,
    });
    const u = b.units.find((x) => x.team === 'blue');
    if (!u) return null;
    possessUnit(b, u.uid);
    u.ccImmune = 99;   // 기절 때문에 멈추는 경우와 구분하려고 스턴 면역으로 둔다
    u.skillTimer = 0;  // 첫 프레임에 바로 스킬을 쓸 수 있게
    u.attackTimer = 0;
    const x0 = u.x, z0 = u.z;
    let dashFrames = 0, skillCasts = 0;
    const frames = opts.frames || 60;
    for (let i = 0; i < frames; i++) {
      setUnitInput(u, {
        mx: opts.mx ?? 0, mz: opts.mz ?? 1,
        atk: !!opts.atk, sk: !!opts.sk && i === 0,
        yaw: opts.yaw ?? 0,
      });
      step(b, 1 / 60);
      if (u.dash) dashFrames++;
      if (u.skillTimer > 0) skillCasts++;
    }
    return { u, x0, z0, dx: u.x - x0, dz: u.z - z0, moved: Math.hypot(u.x - x0, u.z - z0), dashFrames, skillCasts, dead: u.dead };
  };

  // ① 공격을 계속 누르고 있어도 이동 입력대로 전진한다
  for (const id of ['lion', 'trex', 'bear', 'eagle', 'goblin']) {
    const free = run({ id });
    const atk = run({ id, atk: true, foeX: -3.2 });
    check(!!free && !!atk, `[${id}] 조종 실행`);
    if (!free || !atk) continue;
    check(free.moved > 1.5, `[${id}] 이동 입력대로 이동 (${free.moved.toFixed(2)})`);
    check(!atk.dead && atk.moved > 1.5, `[${id}] 공격 중에도 실제로 이동 (${atk.moved.toFixed(2)})`);
    check(atk.moved >= free.moved * 0.9, `[${id}] 공격 모션 중 감속 없음 (${atk.moved.toFixed(2)} / ${free.moved.toFixed(2)})`);
  }

  // ② 공격한 바로 그 프레임에도 이동이 적용된다 (공격이 이동을 덮어쓰지 않는다)
  {
    const b = createBattle({ blue: [P('lion', -5, 0)], red: [P('wolf', -3.2, 0)], seed: 6 });
    const u = b.units.find((x) => x.team === 'blue');
    possessUnit(b, u.uid);
    u.ccImmune = 99;
    setUnitInput(u, { mx: 0, mz: 1, atk: true, sk: false, yaw: 0 });
    const before = { x: u.x, z: u.z };
    step(b, 1 / 60);
    check(u.attackTimer > 0, '공격이 실제로 발동됨');
    check(Math.hypot(u.x - before.x, u.z - before.z) > 0.001, '공격한 같은 프레임에도 이동');
    check(u.moving === true, '공격 중에도 걸음(moving) 상태 유지');
  }

  // ③ 스킬을 쓴 뒤에도 계속 이동한다
  for (const id of ['lion', 'trex', 'bear']) {
    const sk = run({ id, sk: true, foeX: -2.5 });
    check(!!sk && sk.skillCasts > 0, `[${id}] 스킬 발동`);
    if (!sk) continue;
    check(!sk.dead && sk.moved > 1.5, `[${id}] 스킬 사용 후에도 이동 (${sk.moved.toFixed(2)})`);
  }

  // ④ 돌진(대시) 스킬 중에도 플레이어 입력으로 방향을 틀 수 있다
  {
    const base = run({ id: 'rhino', sk: true, yaw: 0, x: 0, z: -8, foeX: 0, foeZ: 0, frames: 45 });
    const steer = run({ id: 'rhino', sk: true, mx: 1, yaw: 0, x: 0, z: -8, foeX: 0, foeZ: 0, frames: 45 });
    check(!!base && base.dashFrames > 0, `돌진 스킬이 실제로 대시를 만든다 (${base ? base.dashFrames : '?'}프레임)`);
    check(!!steer, '돌진 중 조종 실행');
    if (base && steer) {
      check(Math.abs(steer.dx - base.dx) > 0.8, `대시 중 옆 입력으로 방향을 튼다 (${base.dx.toFixed(2)} → ${steer.dx.toFixed(2)})`);
      check(steer.moved > base.moved * 0.95, '대시 중에도 입력 이동이 더해진다');
    }
  }

  // ⑤ 기절 중에는 움직이지 않는다 (조종 중에도 기절은 그대로 적용)
  {
    const b = createBattle({ blue: [P('lion', -5, 0)], red: [P('wolf', 0, 0)], seed: 6 });
    const u = b.units.find((x) => x.team === 'blue');
    possessUnit(b, u.uid);
    u.stun = 0.5;
    const before = { x: u.x, z: u.z };
    for (let i = 0; i < 30; i++) {
      setUnitInput(u, { mx: 0, mz: 1, atk: true, sk: false, yaw: 0 });
      step(b, 1 / 60);
    }
    check(Math.hypot(u.x - before.x, u.z - before.z) < 0.001, '기절 중에는 이동 입력이 통해도 못 움직인다');
    // 기절이 풀리면 바로 다시 움직인다
    const x1 = u.x, z1 = u.z;
    for (let i = 0; i < 45; i++) {
      setUnitInput(u, { mx: 0, mz: 1, atk: false, sk: false, yaw: 0 });
      step(b, 1 / 60);
    }
    check(Math.hypot(u.x - x1, u.z - z1) > 1.0, '기절이 풀리면 즉시 다시 이동');
  }

  // ⑥ 소스 배선: 조종 분기가 대시·기절보다 먼저 잡히고, 이동은 공격 뒤에 적용된다
  {
    const simSrc = fs.readFileSync(new URL('../src/sim.js', import.meta.url), 'utf8');
    const actUnit = simSrc.match(/function actUnit\([^)]*\)\s*\{([\s\S]*?)\n\}/);
    const body = actUnit ? actUnit[1] : '';
    check(/u\.possessed && !u\.dead/.test(body), 'actUnit: 조종 분기를 맨 앞에서 처리');
    check(/if \(u\.dash\) updateDash\(state, u, dt\);\s*\n\s*if \(u\.stun > 0\)/.test(body), '조종 중 대시는 유지하고 기절만 막는다');
    const actPossessed = simSrc.match(/function actPossessed\([^)]*\)\s*\{([\s\S]*?)\n\}/);
    const pos = actPossessed ? actPossessed[1] : '';
    check(/movePossessed\(state, u, mx, mz, yaw, dt\);/.test(pos), 'actPossessed: 이동을 마지막에 적용');
    const moveAt = pos.indexOf('movePossessed(');
    check(moveAt > pos.indexOf('inp.sk') && moveAt > pos.indexOf('inp.atk'), '이동이 스킬·공격 처리 뒤에 온다');
    const move = simSrc.match(/function movePossessed\([^)]*\)\s*\{([\s\S]*?)\n\}/);
    const mbody = move ? move[1] : '';
    check(/const speed = unitSpeed\(u, state\);/.test(mbody) && !/castLock > 0 \? 0\.55/.test(mbody), '조종 이동에 감속(0.55×) 없음');
    check(!/\*\s*0\.55/.test(mbody), '조종 이동 속도에 castLock 감속이 없다');
  }
}

/* ── 10. 타겟 = 늘 가장 가까운 적 (이동 중 더 가까운 적이 나타나면 전환) ── */
{
  const mk = () => {
    const b = createBattle({ blue: [P('lion', -8, 0)], red: [P('wolf', 0, 0), P('boar', 8, 0)], seed: 12 });
    const lion = b.units.find((u) => u.team === 'blue');
    const wolves = b.units.filter((u) => u.team === 'red');
    // 좌표를 테스트용으로 직접 고정한다
    lion.x = -8; lion.z = 0; lion.targetId = null;
    wolves[0].x = 6; wolves[0].z = 0;
    wolves[1].x = -4; wolves[1].z = 0;
    return { b, lion, far: wolves[0], near: wolves[1] };
  };

  // ① chooseTarget — 거리 가중치 없이 순수 최단거리
  {
    const { b, lion, far, near } = mk();
    far.hp = far.maxHp;
    near.hp = near.maxHp * 0.1;   // 예전 점수식은 체력이 낮은 적을 피했다
    check(chooseTarget(b, lion).uid === near.uid, 'chooseTarget = 가장 가까운 적 (HP 가중치 없음)');
    // 동률이면 uid 가 작은 쪽으로 결정적
    far.x = -12; far.z = 0;   // lion(-8) 에서 거리 4
    near.x = -4; near.z = 0;  // 거리 4
    const tie = chooseTarget(b, lion);
    check(tie.uid === Math.min(far.uid, near.uid), '거리 동률이면 uid 작은 적으로 결정');
  }

  // ② 기존 타겟이 살아 있어도 더 가까운 적이 있으면 즉시 전환
  {
    const { b, lion, far, near } = mk();
    lion.targetId = far.uid;
    check(ensureTarget(b, lion).uid === near.uid, '더 가까운 적이 있으면 타겟 전환');
    check(lion.targetId === near.uid, 'u.targetId 가 가장 가까운 적으로 옮겨진다');
  }

  // ③ 걸어가던 중 더 가까운 적이 다가오면 그 적으로 타겟이 옮겨진다
  {
    const { b, lion, far, near } = mk();
    far.x = 2; far.z = 0;    // lion(-8) → 10
    near.x = 40; near.z = 0; // 아주 멀리
    lion.targetId = far.uid;
    for (let i = 0; i < 20; i++) step(b, 1 / 60);
    check(lion.targetId === far.uid, '멀리 있는 적을 향해 이동 중');
    const dBefore = Math.hypot(far.x - lion.x, far.z - lion.z);
    // 더 가까운 적이 앞에 나타난다 (배치·접근)
    near.x = lion.x + 2.5; near.z = lion.z;
    step(b, 1 / 60);
    check(lion.targetId === near.uid, '이동 중 더 가까운 적이 나타나면 타겟 전환');
    // 전환 후에는 새 타겟 쪽으로 간다
    const dNewBefore = Math.hypot(near.x - lion.x, near.z - lion.z);
    for (let i = 0; i < 30; i++) step(b, 1 / 60);
    check(Math.hypot(near.x - lion.x, near.z - lion.z) < dNewBefore, '전환한 적에게 실제로 다가간다');
  }

  // ④ 아주 미세한 거리 차이로는 타겟이 깜박이지 않는다 (히스테리시스)
  {
    const { b, lion, far, near } = mk();
    far.x = -3; far.z = 0;    // lion(-8) → 5
    near.x = -13; near.z = 0; // → 5.1 (0.1 차이)
    lion.targetId = far.uid;
    check(ensureTarget(b, lion).uid === far.uid, `0.1m 차이로는 타겟을 바꾸지 않는다 (margin ${RETARGET_MARGIN})`);
    near.x = -2.5; near.z = 0;  // → 5.5차이? lion(-8)에서 5.0 vs far 5.0
    near.x = -3.5; near.z = 0;  // → 거리 4.5 (0.5 차이)
    check(ensureTarget(b, lion).uid === near.uid, '0.25m 넘게 더 가까우면 타겟을 바꾼다');
  }

  // ⑤ 타겟이 죽으면 가장 가까운 살아있는 적으로
  {
    const { b, lion, far, near } = mk();
    lion.targetId = near.uid;
    near.dead = true; near.hp = 0;
    const t = ensureTarget(b, lion);
    check(t && t.uid === far.uid, '타겟이 죽으면 다음으로 가까운 적 선택');
    far.dead = true; far.hp = 0;
    check(ensureTarget(b, lion) === null, '적이 없으면 타겟 null');
  }

  // ⑥ 실제 전투에서도 타겟은 늘 가장 가까운 적 (소스 배선)
  {
    const simSrc = fs.readFileSync(new URL('../src/sim.js', import.meta.url), 'utf8');
    check(/export function chooseTarget/.test(simSrc), 'chooseTarget 공개(테스트 가능)');
    const ch = simSrc.match(/export function chooseTarget\([^)]*\)\s*\{([\s\S]*?)\n\}/);
    const body = ch ? ch[1] : '';
    check(!/onIt|ranged \? 5\.5|0\.82 \+ 0\.36/.test(body), 'chooseTarget 에 분산·HP 가중치가 없다');
    check(/const d = dist2\(u\.x, u\.z, e\.x, e\.z\);/.test(body), 'chooseTarget 은 순수 거리 비교');
    const en = simSrc.match(/export function ensureTarget\([^)]*\)\s*\{([\s\S]*?)\n\}/);
    const ebody = en ? en[1] : '';
    check(/chooseTarget\(state, u\)/.test(ebody), 'ensureTarget 이 매번 가장 가까운 적을 다시 계산');
    check(/RETARGET_MARGIN/.test(ebody), 'ensureTarget 에 히스테리시스 적용');
  }
}

// 유닛을 소환/삭제할 때 카메라가 자동으로 확대·축소되지 않아야 한다
// (afterPlacementChange 안에서 camGoal을 건드리면 배치할 때마다 줌이 튄다)
{
  const mainSrc = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const m = mainSrc.match(/function afterPlacementChange\([^)]*\)\s*\{([\s\S]*?)\n\}/);
  check(!!m, 'afterPlacementChange()를 main.js에서 찾을 수 있다');
  const body = m ? m[1] : '';
  check(!/camGoal/.test(body), '소환·삭제 후 카메라를 리셋하지 않는다 (afterPlacementChange에 camGoal 없음)');
  check(/fitPreviewCamera\(\)/.test(mainSrc), '프리셋·챌린지·모드 전환용 fitPreviewCamera()는 남아 있다');
  // 마릿수에 따른 자동 화질 강등(블록 모델·픽셀비·그림자)은 없어야 한다
  check(!/simple\s*[,:]\s*units\.length/.test(mainSrc), '마릿수로 단순 모델을 고르지 않는다');
  check(/simple:\s*false/.test(mainSrc) && /lowDetail:\s*false/.test(mainSrc),
    '모든 유닛을 정식 모델로 그린다 (simple/lowDetail 항상 false)');
  check(!/downgraded/.test(mainSrc), 'FPS 기반 자동 화질 저하 코드가 없다');
  check(!/setPixelRatio/.test(mainSrc), '유닛 수로 렌더 해상도를 낮추지 않는다');
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
