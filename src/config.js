// 동물 vs 동물 — ARBS 스타일 샌드박스 배틀 데이터
// (동물 · 공룡 · 괴수 로스터, 무기, 전장, 프리셋, 챌린지)
// 이 파일은 THREE/DOM 에 의존하지 않는다. tests/smoke.mjs 가 그대로 불러 검증한다.

export const TUNING = {
  ARENA_RADIUS: 49.5,        // 전장 반경 (기존 16.5의 3배 — 거대한 3× 전장)
  DIVIDER: 0,                // 진영 구분선 (x = 0)
  MAX_UNITS_PER_TEAM: 100,   // 한 팀 최대 배치 수 (팀당 100마리 — 블루 100 vs 레드 100 가능)
  MAX_UNITS: 200,            // 전장 전체 최대 배치 수 (두 팀 × 100)
  MAX_TIME: 240,             // 배틀 제한 시간(초) — 초과 시 HP 비율 판정
  SIM_DT: 1 / 60,            // 고정 스텝
  SEPARATION: 1.85,          // 유닛끼리 겹침 방지 거리
  KNOCK_DECAY: 7.5,          // 넉백 감쇠
  BLEED_TICK: 0.5,           // 출혈 피해 주기
  CRIT_MULT: 1.9,
  LOG_LIMIT: 40,
  CAM_FOVS: { phone: 62, tablet: 54, desktop: 46 },
};

/* ──────────────────────── 파티 멀티플레이 (최대 4인) ────────────────────────
   파티를 열면 2~4명이 함께 싸운다. 인원수에 따라 진영(팀)도 2~4개로 나뉜다.
   2명 → 블루/레드 (서/동 반원) · 3명 → 블루/레드/그린 (120° 3분할)
   4명 → 블루/레드/그린/골드 (90° 4분할)
   각자 1인당 예산 60 안에서 자기 진영에만 유닛을 놓는다.                */

export const PARTY = {
  MAX_PLAYERS: 4,
  MIN_PLAYERS: 2,
  BUDGET: 60,          // 1인당 배치 예산
  MAX_UNITS_PER_PLAYER: 40,
};

// 팀 id · 이름 · 색 (진영 틴트/링/이름표에 그대로 쓴다)
export const TEAM_ORDER = ['blue', 'red', 'green', 'gold'];

export const TEAM_DEFS = {
  blue: { id: 'blue', name: '블루', emoji: '🔵', color: 0x3f86ff, css: '#3f86ff', dark: '#1b3f8f' },
  red: { id: 'red', name: '레드', emoji: '🔴', color: 0xff5040, css: '#ff5040', dark: '#7a2018' },
  green: { id: 'green', name: '그린', emoji: '🟢', color: 0x35d47c, css: '#35d47c', dark: '#146b3d' },
  gold: { id: 'gold', name: '골드', emoji: '🟡', color: 0xffbe3f, css: '#ffbe3f', dark: '#7a5410' },
};

export function teamDef(team) {
  return TEAM_DEFS[team] || TEAM_DEFS.blue;
}

export function teamName(team) {
  return teamDef(team).name;
}

// 인원수 → 진영 목록 (2명이면 2팀, 3명이면 3팀, 4명이면 4팀)
export function partyTeams(count) {
  const n = Math.max(PARTY.MIN_PLAYERS, Math.min(PARTY.MAX_PLAYERS, Math.round(count) || PARTY.MIN_PLAYERS));
  return TEAM_ORDER.slice(0, n);
}

export function isTeamId(id) {
  return TEAM_ORDER.indexOf(id) >= 0;
}

// 진영 부채꼴 경계 (라디안). 각도 a = atan2(x, z) 기준.
// 블루는 언제나 서쪽(x<0)을 중심으로 하고, 시계/반시계 방향으로 360/n 씩 나눈다.
//   n=2 → 블루 [-180°,0°) · 레드 [0°,180°)  (기존 좌/우 반원과 동일)
//   n=3 → 블루 서쪽 · 레드 · 그린 120°씩
//   n=4 → 블루 서쪽 · 레드 앞쪽 · 그린 동쪽 · 골드 뒤쪽 90°씩
export const SECTOR_MARGIN = 0.06;   // 경계선에서 살짝 안쪽 (rad)

export function sectorBounds(teams, team) {
  const list = Array.isArray(teams) && teams.length ? teams : ['blue', 'red'];
  const n = list.length;
  const i = Math.max(0, list.indexOf(team));
  const span = (Math.PI * 2) / n;
  const center = -Math.PI / 2 + i * span;
  return { center, span, lo: center - span / 2, hi: center + span / 2, index: i, count: n };
}

export function wrapAngle(a) {
  let v = a;
  while (v > Math.PI) v -= Math.PI * 2;
  while (v <= -Math.PI) v += Math.PI * 2;
  return v;
}

// 각도가 진영 안인지 (경계 여유 포함)
export function angleInSector(teams, team, a, margin = SECTOR_MARGIN) {
  const b = sectorBounds(teams, team);
  const rel = wrapAngle(a - b.lo);          // 0 ~ 2π (lo 기준)
  const t = rel < 0 ? rel + Math.PI * 2 : rel;
  return t >= margin && t <= b.span - margin;
}

// 좌표를 자기 진영 부채꼴 안으로 밀어 넣는다 (가장 가까운 경계로)
export function clampToSector(teams, team, x, z, margin = SECTOR_MARGIN) {
  const list = Array.isArray(teams) && teams.length ? teams : ['blue', 'red'];
  const at = list.indexOf(team);
  let r = Math.hypot(x, z);
  if (at < 0) return { x, z, angle: r < 1e-6 ? 0 : Math.atan2(x, z) };
  const b = sectorBounds(list, team);
  const a = r < 1e-6 ? b.center : Math.atan2(x, z);
  let rel = wrapAngle(a - b.lo);
  let t = rel < 0 ? rel + Math.PI * 2 : rel;   // 경계 lo 기준 0..2π
  const lo = Math.min(margin, b.span / 2);
  const hi = Math.max(lo, b.span - margin);
  if (t < lo) {
    // 앞쪽 lo 로 가는 거리 vs 뒤로 돌아 hi 로 가는 거리
    t = (lo - t) <= (t + (Math.PI * 2 - hi)) ? lo : hi;
  } else if (t > hi) {
    t = (t - hi) <= ((Math.PI * 2 - t) + lo) ? hi : lo;
  }
  const angle = b.lo + t;
  if (r < 1e-6) r = 1.5;
  return { x: Math.sin(angle) * r, z: Math.cos(angle) * r, angle };
}

// 진영 중심 방향(단위 벡터) — 유닛이 바라볼 기본 방향
export function sectorCenterDir(teams, team) {
  const b = sectorBounds(teams, team);
  return { x: Math.sin(b.center), z: Math.cos(b.center) };
}

// 전장·배치 좌표를 몇 배로 늘릴지 (데이터는 기존 좌표로 쓰고 내보낼 때 확대한다)
export const WORLD_SCALE = 3;
const S = (v) => v * WORLD_SCALE;
const scaleList = (list) => list.map((p) => ({ ...p, x: S(p.x), z: S(p.z) }));

export const CATEGORIES = [
  { id: 'all', name: '전체', emoji: '🎯' },
  { id: 'animal', name: '동물', emoji: '🐾' },
  { id: 'dino', name: '공룡', emoji: '🦕' },
  { id: 'monster', name: '괴수', emoji: '👹' },
];

/* ──────────────────────────── 동물 로스터 (15종) ────────────────────────────
   hp/atk/spd/range 는 sim 의 실제 값, atkInterval 은 공격 1회 간격(초).
   skill.kind 는 sim.castSkill 이 해석한다.                                   */

const ANIMAL_LIST = [
  {
    id: 'lion', name: '사자', emoji: '🦁', cat: 'animal', tier: 3, cost: 4, role: '근접 딜러',
    hp: 172, atk: 20, spd: 3.6, range: 2.7, atkInterval: 0.95,
    colors: { main: 0xd9a44e, dark: 0x8a5a22, accent: 0x5a3416, belly: 0xf0d9a8 },
    scale: 1.0, size: 1.0,
    desc: '포효 한 번으로 전장을 뒤흔드는 백수의 왕.',
    skill: { kind: 'roar', name: '포효 충격파', icon: '📣', cd: 6.6, range: 6.6, radius: 6.6, power: 1.05, stun: 0.85, knock: 6.5,
      desc: '주변 적 전원에게 피해와 기절, 강한 넉백' },
    passive: '기절에 강하다',
  },
  {
    id: 'tiger', name: '호랑이', emoji: '🐯', cat: 'animal', tier: 3, cost: 4, role: '암살자',
    hp: 132, atk: 19, spd: 4.3, range: 2.5, atkInterval: 0.95,
    colors: { main: 0xe08a2a, dark: 0x1c1410, accent: 0x8a4a12, belly: 0xf7ead2 },
    scale: 1.0, size: 1.0,
    desc: '거리를 벌렸다가 단숨에 파고드는 사냥꾼.',
    skill: { kind: 'pounce', name: '급습 도약', icon: '💨', cd: 6.5, range: 9.5, minRange: 0.8, power: 1.95, bleed: 3, bleedTime: 4,
      desc: '멀리서 도약해 2.1배 피해 + 출혈' },
    passive: '도약 직후 잠깐 회피',
  },
  {
    id: 'elephant', name: '코끼리', emoji: '🐘', cat: 'animal', tier: 4, cost: 5, role: '탱커',
    hp: 268, atk: 16, spd: 2.35, range: 3.2, atkInterval: 1.3,
    colors: { main: 0x848b95, dark: 0x5e646c, accent: 0xe8e2d4, belly: 0xa0a7af },
    scale: 1.18, size: 1.25,
    desc: '가장 단단한 몸. 돌진 한 번에 진형이 무너진다.',
    skill: { kind: 'charge', name: '돌진 밀치기', icon: '🌊', cd: 7.4, range: 10, power: 1.75, stun: 0.8, knock: 15, width: 2.6, dash: 9,
      desc: '전방으로 돌진해 밟은 적을 밀쳐내고 기절' },
    passive: '넉백 저항 80%',
    armor: 0.1, kbResist: 0.8,
  },
  {
    id: 'bear', name: '곰', emoji: '🐻', cat: 'animal', tier: 3, cost: 4, role: '브루저',
    hp: 200, atk: 18, spd: 2.8, range: 2.8, atkInterval: 1.15,
    colors: { main: 0x7a4b28, dark: 0x402612, accent: 0xd8b98a, belly: 0xa87a4e },
    scale: 1.06, size: 1.05,
    desc: '묵직한 앞발. 한 대 맞으면 발이 묶인다.',
    skill: { kind: 'slam', name: '강타', icon: '🪵', cd: 5.9, range: 3.2, radius: 4.8, power: 1.4, slow: 0.55, slowTime: 3, knock: 5,
      desc: '앞발 강타로 광역 피해 + 55% 둔화' },
    passive: '피해를 버틴다',
  },
  {
    id: 'wolf', name: '늑대', emoji: '🐺', cat: 'animal', tier: 2, cost: 3, role: '연타',
    hp: 132, atk: 14, spd: 4.6, range: 2.2, atkInterval: 0.85,
    colors: { main: 0x8a8f99, dark: 0x4a4f58, accent: 0x2b2f36, belly: 0xcfd4da },
    scale: 0.92, size: 0.95,
    desc: '물어뜯어 출혈을 쌓고 무리를 몰아붙인다.',
    skill: { kind: 'pack', name: '무리 사냥', icon: '🐾', cd: 5.5, range: 2.9, power: 1.35, bleed: 3.2, bleedTime: 3.5, haste: 0.3, hasteTime: 5,
      desc: '출혈 물기 + 아군 전체 공격속도 +30%' },
    passive: '아군이 붙으면 빨라진다',
    onHitBleed: { dps: 1.6, time: 3 },
  },
  {
    id: 'eagle', name: '독수리', emoji: '🦅', cat: 'animal', tier: 2, cost: 3, role: '원거리',
    hp: 76, atk: 16, spd: 4.6, range: 7.4, atkInterval: 1.28, ranged: true,
    colors: { main: 0x5a3a22, dark: 0x2a1a0e, accent: 0xf2f2f2, belly: 0x8a6a44 },
    scale: 0.95, size: 0.9,
    desc: '하늘에서 깃털을 꽂고, 다가오면 다시 솟아오른다.',
    skill: { kind: 'dive', name: '급강하', icon: '🪶', cd: 5.9, range: 11, power: 2.0, radius: 2.2, knock: 6,
      desc: '하늘로 솟아올라 대상에게 급강하 (2배 피해)' },
    passive: '거리를 유지한다',
  },
  {
    id: 'crocodile', name: '악어', emoji: '🐊', cat: 'animal', tier: 3, cost: 4, role: '방어형',
    hp: 168, atk: 16.5, spd: 2.4, range: 2.7, atkInterval: 1.15,
    colors: { main: 0x4a6b3a, dark: 0x2a3f20, accent: 0xe8e0b0, belly: 0x9aa87a },
    scale: 1.0, size: 1.0,
    desc: '단단한 비늘. 턱에 걸리면 방어구가 무의미하다.',
    skill: { kind: 'chomp', name: '죽음의 악어턱', icon: '🦷', cd: 6.2, range: 3.0, power: 1.85, pierce: true, armorUp: 0.25, armorTime: 4, bleed: 3,
      desc: '방어 무시 2배 피해 + 비늘 방어 강화' },
    passive: '방어력 10%',
    armor: 0.1, kbResist: 0.4,
  },
  {
    id: 'rhino', name: '코뿔소', emoji: '🦏', cat: 'animal', tier: 3, cost: 4, role: '돌격',
    hp: 236, atk: 18.5, spd: 3.1, range: 2.7, atkInterval: 1.15,
    colors: { main: 0x8d939c, dark: 0x5c626b, accent: 0xe6dcc8, belly: 0xa8aeb6 },
    scale: 1.1, size: 1.15,
    desc: '멈출 수 없는 돌파. 기절도 둔화도 통하지 않는다.',
    skill: { kind: 'gore', name: '돌파', icon: '⚡', cd: 7.0, range: 10, power: 2.15, stun: 1.2, knock: 13, dash: 10, width: 2.4,
      desc: '돌진 중 무적의 돌파 — 닿은 적 기절' },
    passive: '돌진 중 상태이상 무시',
    armor: 0.1, kbResist: 0.7,
  },
  {
    id: 'fox', name: '여우', emoji: '🦊', cat: 'animal', tier: 1, cost: 2, role: '회피',
    hp: 94, atk: 14, spd: 5.0, range: 2.0, atkInterval: 0.72,
    colors: { main: 0xd96a28, dark: 0x7a3210, accent: 0xfdf3e4, belly: 0xfdf3e4 },
    scale: 0.9, size: 0.85,
    desc: '작지만 잡히지 않는다. 결정타는 크게.',
    skill: { kind: 'evade', name: '교묘한 회피', icon: '🌀', cd: 6.2, range: 3.4, dodge: 0.6, dodgeTime: 2.6, haste: 0.45, hasteTime: 2.6,
      desc: '2.6초 회피 70% + 공격속도 폭증' },
    passive: '기본 회피 14%',
    evasion: 0.14,
  },
  {
    id: 'gorilla', name: '고릴라', emoji: '🦍', cat: 'animal', tier: 3, cost: 4, role: '광역',
    hp: 188, atk: 20, spd: 2.9, range: 2.8, atkInterval: 1.25,
    colors: { main: 0x2e2a2b, dark: 0x141112, accent: 0x9aa0a6, belly: 0x453f40 },
    scale: 1.06, size: 1.1,
    desc: '지면을 내리쳐 상대 진영을 띄워 버린다.',
    skill: { kind: 'smash', name: '지면 강타', icon: '💥', cd: 7.0, range: 3.4, radius: 5.6, power: 1.8, stun: 1.35, knock: 7,
      desc: '땅을 내리쳐 광역 피해 + 1.35초 기절' },
    passive: '높은 공격력',
  },
  {
    id: 'cheetah', name: '치타', emoji: '🐆', cat: 'animal', tier: 1, cost: 2, role: '속도',
    hp: 96, atk: 15, spd: 5.8, range: 2.1, atkInterval: 0.55, evasion: 0.16,
    colors: { main: 0xe0b25a, dark: 0x2a2018, accent: 0x1a1410, belly: 0xf7ecd2 },
    scale: 0.92, size: 0.9,
    desc: '전장에서 가장 빠른 발. 순간 폭발력이 강하다.',
    skill: { kind: 'sprint', name: '질주', icon: '💫', cd: 4.3, range: 30, speed: 1.85, speedTime: 3.2, haste: 0.55, hasteTime: 4,
      desc: '3.2초 이동속도 1.85배 + 공격속도 +50%' },
    passive: '최고 이동속도',
  },
  {
    id: 'boar', name: '멧돼지', emoji: '🐗', cat: 'animal', tier: 2, cost: 3, role: '근접',
    hp: 150, atk: 16, spd: 3.7, range: 2.3, atkInterval: 1.0,
    colors: { main: 0x554438, dark: 0x2a2018, accent: 0xe9e0cc, belly: 0x6e5a48 },
    scale: 0.96, size: 1.0,
    desc: '엄니로 파고들어 출혈을 남긴다.',
    skill: { kind: 'gore2', name: '엄니 돌진', icon: '🦴', cd: 7.4, range: 7.5, minRange: 1.2, power: 1.15, bleed: 3, bleedTime: 3.5, knock: 7, dash: 6,
      desc: '짧게 돌진해 출혈을 남긴다' },
    passive: '단단한 체력',
    kbResist: 0.3,
    onHitBleed: { dps: 2, time: 3 },
  },
  {
    id: 'hyena', name: '하이에나', emoji: '🐕', cat: 'animal', tier: 2, cost: 3, role: '무리 사냥꾼',
    hp: 140, atk: 16, spd: 4.8, range: 2.2, atkInterval: 0.8,
    colors: { main: 0xb8a878, dark: 0x4a3a24, accent: 0x2a2018, belly: 0xe0d4b0 },
    scale: 0.95, size: 0.95,
    desc: '등이 기울어진 하이에나. 무리로 몰려 물어뜯는다.',
    skill: { kind: 'frenzy', name: '광란의 물기', icon: '🩸', cd: 5.0, range: 2.9, power: 1.25, bleed: 3.2, bleedTime: 3.5, haste: 0.35, hasteTime: 4,
      desc: '출혈 물기 + 무리 전체 공격속도 +35%' },
    passive: '무리와 함께면 빨라진다',
    evasion: 0.06,
  },
  {
    id: 'snake', name: '거대 뱀', emoji: '🐍', cat: 'animal', tier: 3, cost: 5, role: '독사',
    hp: 210, atk: 18, spd: 4.0, range: 3.2, atkInterval: 0.95,
    colors: { main: 0x5a7a3a, dark: 0x2a3a18, accent: 0xe8d86a, belly: 0xa8b87a },
    scale: 1.1, size: 1.05,
    desc: '길게 몸을 늘어뜨리고 독니와 조이기로 옥죈다.',
    skill: { kind: 'coil', name: '독니 조이기', icon: '🌀', cd: 6.2, range: 3.6, power: 1.15, bleed: 3.5, bleedTime: 4, stun: 1.2,
      desc: '독니로 물고 몸을 조여 기절·중독시킨다' },
    passive: '기본 회피 8%',
    evasion: 0.08,
  },
  {
    id: 'mammoth', name: '매머드', emoji: '🦣', cat: 'animal', tier: 4, cost: 9, role: '돌격 탱커',
    hp: 520, atk: 36, spd: 2.7, range: 3.5, atkInterval: 1.3,
    colors: { main: 0x6b4a2f, dark: 0x3a2415, accent: 0xf2e8d4, belly: 0x8f6a44 },
    scale: 1.26, size: 1.5,
    desc: '빙하기의 거대한 털복숭이. 길게 휘어진 엄니로 상대를 들이받아 하늘로 띄운다.',
    skill: { kind: 'tuskQuake', name: '엄니 대지진', icon: '🦣', cd: 8.4, range: 10.5, radius: 4.8, power: 1.75, stun: 1.3, knock: 19, dash: 9.5, width: 2.7,
      desc: '엄니로 전방을 들이받아 띄우고, 착지 지점에 지진을 일으켜 기절시킨다' },
    passive: '넉백 저항 75% · 두꺼운 털',
    armor: 0.12, kbResist: 0.75,
  },
  {
    id: 'king_kong', name: '킹콩', emoji: '🦍', cat: 'animal', tier: 4, cost: 11, role: '거대 영장류',
    hp: 700, atk: 48, spd: 3.2, range: 3.8, atkInterval: 1.3,
    colors: { main: 0x3a2a24, dark: 0x1a1210, accent: 0xc8b8a0, belly: 0x5d4536 },
    scale: 1.4, size: 1.7,
    desc: '고릴라를 아득히 넘어선 거대 영장류. 가슴을 두드려 포효한 뒤 양 주먹으로 땅을 내리찍는다.',
    skill: { kind: 'kongQuake', name: '가슴 두드리기 대지 강타', icon: '🦍', cd: 9.0, range: 5.2, radius: 8.2, power: 2.15, stun: 1.6, knock: 21,
      desc: '가슴을 두드려 포효한 뒤 양 주먹으로 땅을 찍어 광역 넉백·기절' },
    passive: '거대 체력 · 넉백 저항 85%',
    armor: 0.14, kbResist: 0.85,
  },
  {
    id: 'shark', name: '상어', emoji: '🦈', cat: 'animal', tier: 2, cost: 4, role: '출혈 추격자',
    hp: 156, atk: 18, spd: 4.5, range: 2.7, atkInterval: 0.85, evasion: 0.06,
    colors: { main: 0x6f8ea8, dark: 0x2f4356, accent: 0xe8f2f8, belly: 0xcfdde6 },
    scale: 1.02, size: 1.05,
    desc: '등지느러미를 세우고 냄새를 따라 끝까지 물고 늘어진다.',
    skill: { kind: 'bloodFrenzy', name: '혈액 광란', icon: '🩸', cd: 6.4, range: 9, minRange: 0.8, power: 1.55, bleed: 3.6, bleedTime: 4, dash: 7.5, haste: 0.3, hasteTime: 4,
      desc: '피 냄새를 쫓아 돌진해 출혈을 남기고 흥분해 빨라진다' },
    passive: '물린 적을 계속 출혈시킨다',
    onHitBleed: { dps: 1.8, time: 3 },
  },
];

/* ──────────────────────────── 공룡 · 괴수 · 해양 (9종) ──────────────────────────── */

const DINO_LIST = [
  {
    id: 'trex', name: '티라노사우루스', short: '티라노', emoji: '🦖', cat: 'dino', tier: 4, cost: 8, role: '포식자',
    hp: 430, atk: 36, spd: 3.3, range: 3.4, atkInterval: 1.25,
    colors: { main: 0x6d7d45, dark: 0x33401f, accent: 0xe4d7a8, belly: 0xa8b06a },
    scale: 1.3, size: 1.5,
    desc: '거대한 턱과 꼬리 한 방. 무리도 한 번에 쓸어버린다.',
    skill: { kind: 'crunch', name: '죽음의 턱', icon: '🦷', cd: 7.4, range: 5.0, radius: 4.2, power: 1.95, stun: 0.9, knock: 12,
      desc: '앞쪽 적을 물어뜯고 꼬리로 후려쳐 밀어낸다' },
    passive: '거대 체력 · 넉백 저항',
    armor: 0.08, kbResist: 0.5,
  },
  {
    id: 'spino', name: '스피노사우루스', short: '스피노', emoji: '🦕', cat: 'dino', tier: 4, cost: 7, role: '학살자',
    hp: 380, atk: 31, spd: 3.5, range: 3.2, atkInterval: 1.1,
    colors: { main: 0x4a6f8a, dark: 0x22384a, accent: 0xe86a3a, belly: 0xb9cfd8 },
    scale: 1.34, size: 1.4,
    desc: '등의 돛을 세우고 거대한 발톱으로 갈아버린다.',
    skill: { kind: 'sailSlash', name: '돛 베기', icon: '🌊', cd: 6.8, range: 7.2, minRange: 1.0, power: 2.05, bleed: 4.5, bleedTime: 4.5, armorUp: 0.18, armorTime: 5,
      desc: '전방을 갈라 출혈을 남기고 비늘을 세운다' },
    passive: '등돛 방어',
    armor: 0.06, kbResist: 0.45,
  },
  {
    id: 'triceratops', name: '트리케라톱스', short: '트리케', emoji: '🦖', cat: 'dino', tier: 3, cost: 6, role: '돌격 탱커',
    hp: 400, atk: 26, spd: 2.9, range: 3.0, atkInterval: 1.3,
    colors: { main: 0x8a7a4a, dark: 0x4a3f1e, accent: 0xe8dcc0, belly: 0xb8a878 },
    scale: 1.26, size: 1.3,
    desc: '세 개의 뿔과 정면의 골판. 정면에서는 뚫리지 않는다.',
    skill: { kind: 'hornCharge', name: '삼중 뿔 돌격', icon: '🔺', cd: 7.2, range: 9, power: 2.2, stun: 1.1, knock: 16, dash: 10, width: 2.7, armorUp: 0.2, armorTime: 4,
      desc: '뿔로 정면 돌격 — 닿은 적 기절·강한 넉백' },
    passive: '정면 방어 20%',
    armor: 0.2, kbResist: 0.7,
  },
  {
    id: 'raptor', name: '벨로시랩터', short: '랩터', emoji: '🦎', cat: 'dino', tier: 1, cost: 2, role: '무리 사냥',
    hp: 92, atk: 14, spd: 6.2, range: 2.1, atkInterval: 0.55, evasion: 0.1,
    colors: { main: 0x9a7a3a, dark: 0x3a2a14, accent: 0xe8d8a0, belly: 0xd0bc82 },
    scale: 0.96, size: 0.95,
    desc: '혼자서는 약하지만, 열두 마리가 모이면 티라노도 쓰러진다.',
    skill: { kind: 'packPounce', name: '무리 도약', icon: '🐾', cd: 4.6, range: 8, minRange: 1.0, power: 1.5, bleed: 3, bleedTime: 3, haste: 0.25, hasteTime: 3.2,
      desc: '도약해 출혈을 남기고 무리 전체가 빨라진다' },
    passive: '무리와 함께면 더 빠르다',
    evasion: 0.1,
  },
  {
    id: 'wyvern', name: '와이번', short: '와이번', emoji: '🐉', cat: 'dino', tier: 3, cost: 6, role: '비행',
    hp: 210, atk: 24, spd: 4.4, range: 4.2, atkInterval: 1.2, airborne: true,
    colors: { main: 0x7a3a6a, dark: 0x3a1530, accent: 0xff8a4a, belly: 0xc08aa8 },
    scale: 1.28, size: 1.35,
    desc: '낮게 떠서 화염을 뿜고 다시 솟아오른다.',
    skill: { kind: 'flame', name: '화염 브레스', icon: '🔥', cd: 6.0, range: 8.5, radius: 3.2, power: 1.8, burn: 3.2, burnTime: 4, knock: 4,
      desc: '전방에 화염을 뿜어 불태운다' },
    passive: '낮게 난다 · 넉백 저항',
    kbResist: 0.35,
  },
  {
    id: 'titan', name: '거대 타이탄', short: '타이탄', emoji: '🦍', cat: 'monster', tier: 4, cost: 9, role: '보스',
    hp: 600, atk: 40, spd: 2.5, range: 3.6, atkInterval: 1.35,
    colors: { main: 0x4a5a3a, dark: 0x1c2416, accent: 0xc8ff6a, belly: 0x7a8a5a },
    scale: 1.62, size: 1.7,
    desc: '돌연변이로 거대해진 유인원. 지면 강타 한 번에 전장이 뒤집힌다.',
    skill: { kind: 'titanSlam', name: '대지 붕괴', icon: '💥', cd: 9.0, range: 4.6, radius: 7.2, power: 2.1, stun: 1.6, knock: 16,
      desc: '지면을 내리쳐 광역 피해 + 1.6초 기절 + 강한 넉백' },
    passive: '거대 체력 · 최강의 힘',
    armor: 0.16, kbResist: 0.85,
  },
  {
    id: 'drex', name: '디-렉스', short: '디-렉스', emoji: '🦖', cat: 'dino', tier: 4, cost: 10, role: '보스',
    hp: 700, atk: 46, spd: 2.9, range: 3.8, atkInterval: 1.3,
    colors: { main: 0x7a3a3a, dark: 0x2a1414, accent: 0xe8d8b0, belly: 0xb08a6a },
    scale: 1.5, size: 1.65,
    desc: '거대한 머리와 근육질 팔을 가진 돌연변이 렉스. 물어뜯고, 주먹으로 내리친다.',
    skill: { kind: 'drexCombo', name: '포식 콤보', icon: '💥', cd: 8.0, range: 4.6, radius: 5.6, power: 1.7, power2: 1.35, stun: 1.1, knock: 15,
      desc: '거대한 턱으로 물어뜯고 이어서 주먹으로 내리치는 연계기' },
    passive: '거대 체력 · 넉백 저항',
    armor: 0.14, kbResist: 0.8,
  },
  {
    id: 'megalodon', name: '메갈로돈', short: '메갈로돈', emoji: '🦈', cat: 'dino', tier: 4, cost: 9, role: '심해 포식자',
    hp: 520, atk: 42, spd: 3.1, range: 3.6, atkInterval: 1.35,
    colors: { main: 0x4a5f74, dark: 0x1e2b38, accent: 0xf2f7fa, belly: 0x9fb2bf },
    scale: 1.22, size: 1.55,
    desc: '선사시대의 거대 상어. 한 번 물면 살점을 뜯어 삼키고 다시 달려든다.',
    skill: { kind: 'deepBite', name: '심해 포식', icon: '🦷', cd: 8.2, range: 4.4, radius: 3.6, power: 2.1, stun: 0.5, knock: 14, lifesteal: 0.3,
      desc: '거대한 턱으로 뜯어내고, 그 피로 체력을 회복한다' },
    passive: '거대 체력 · 피를 빨아 회복',
    armor: 0.1, kbResist: 0.6,
  },
  {
    id: 'mosasaurus', name: '모사사우르스', short: '모사사', emoji: '🦕', cat: 'dino', tier: 4, cost: 8, role: '해양 포식자',
    hp: 460, atk: 34, spd: 3.7, range: 3.3, atkInterval: 1.15,
    colors: { main: 0x3f7a72, dark: 0x1c3b38, accent: 0xe8d86a, belly: 0x8fc0b4 },
    scale: 1.2, size: 1.5,
    desc: '네 개의 노 젓는 지느러미와 긴 악어 턱. 물결처럼 미끄러져 덮친다.',
    skill: { kind: 'tidalJaw', name: '해일 턱', icon: '🌊', cd: 7.6, range: 9, minRange: 1.5, power: 1.9, stun: 1.2, width: 2.9, dash: 8, knock: 9,
      desc: '거대한 해일처럼 넓게 돌진해 닿은 적을 물고 기절시킨다' },
    passive: '넉백 저항',
    kbResist: 0.45,
  },
];

/* ──────────────────────────── 괴수 / 언데드 / 신화 (8종) ──────────────────────────── */

const MONSTER_LIST = [
  {
    id: 'zombie', name: '좀비', emoji: '🧟', cat: 'monster', tier: 2, cost: 3, role: '언데드',
    hp: 200, atk: 15, spd: 2.2, range: 2.4, atkInterval: 1.2,
    colors: { main: 0x6d7a4a, dark: 0x38402a, accent: 0xa8b080, belly: 0x8a9466 },
    scale: 1.0, size: 1.0,
    desc: '느리지만 끈질긴 언데드. 뻗은 두 팔로 할퀴고 감염시킨다.',
    skill: { kind: 'infect', name: '감염 물기', icon: '🦠', cd: 5.6, range: 3.0, power: 1.45, bleed: 4, bleedTime: 5, slow: 0.35, slowTime: 3, heal: 18,
      desc: '감염된 물기 — 지속 피해·둔화, 자신의 체력 회복' },
    passive: '넉백 저항',
    kbResist: 0.25,
  },
  {
    id: 'skeleton', name: '스켈레톤', emoji: '💀', cat: 'monster', tier: 2, cost: 3, role: '해골 검사',
    hp: 120, atk: 17, spd: 3.6, range: 2.5, atkInterval: 0.8,
    colors: { main: 0xe8e2d0, dark: 0x8a8474, accent: 0xb8b09a, belly: 0xf2eee0 },
    scale: 1.0, size: 1.0,
    desc: '뼈칼을 든 해골 검사. 빠르게 베고, 뼈는 잘 부러진다.',
    skill: { kind: 'boneSlash', name: '뼈칼 3연격', icon: '🗡️', cd: 4.8, range: 3.2, power: 0.75, strikes: 3, pierce: true,
      desc: '방어를 무시하는 빠른 3연격' },
    passive: '기본 회피 12%',
    evasion: 0.12,
  },
  {
    id: 'leviathan', name: '레비아탄', emoji: '🐉', cat: 'monster', tier: 4, cost: 10, role: '심연의 군주',
    hp: 660, atk: 44, spd: 2.9, range: 3.8, atkInterval: 1.4,
    colors: { main: 0x2a4a6e, dark: 0x0e1a2a, accent: 0x6fe8ff, belly: 0x4a7a9a },
    scale: 1.35, size: 1.75,
    desc: '심해에서 올라온 거대한 바다뱀. 몸부림 한 번에 전장이 휘청인다.',
    skill: { kind: 'abyssVortex', name: '심연의 소용돌이', icon: '🌊', cd: 9.0, range: 5.0, radius: 7.4, power: 1.9, knock: 13, slow: 0.45, slowTime: 3.5,
      desc: '심연의 물길을 일으켜 광역 피해 · 강한 넉백 · 둔화' },
    passive: '거대 체력 · 넉백 저항',
    armor: 0.14, kbResist: 0.8,
  },
  {
    id: 'stone_golem', name: '스톤골렘', short: '골렘', emoji: '🗿', cat: 'monster', tier: 3, cost: 7, role: '바위 수호자',
    hp: 430, atk: 29, spd: 2.1, range: 3.1, atkInterval: 1.5,
    colors: { main: 0x7a7468, dark: 0x3f3a32, accent: 0x9ef07a, belly: 0x9a9488 },
    scale: 1.25, size: 1.42,
    desc: '고대 룬이 새겨진 바위 거인. 주먹을 내리치면 땅이 갈라진다.',
    skill: { kind: 'rockCrush', name: '암석 분쇄', icon: '🪨', cd: 7.8, range: 4.2, radius: 6.4, power: 1.85, stun: 1.5, knock: 9,
      desc: '거대한 바위 주먹을 내리쳐 광역 피해 + 1.5초 기절' },
    passive: '단단한 바위 몸 · 넉백 저항',
    armor: 0.26, kbResist: 0.85,
  },
  {
    id: 'dragon', name: '드래곤', emoji: '🐲', cat: 'monster', tier: 4, cost: 10, role: '하늘의 군주',
    hp: 400, atk: 40, spd: 4.0, range: 4.6, atkInterval: 1.2, airborne: true,
    colors: { main: 0x8a2a2a, dark: 0x3a0f12, accent: 0xffb347, belly: 0xe0a060 },
    scale: 1.35, size: 1.5,
    desc: '네 발과 거대한 날개, 뾰족한 뿔과 꼬리를 가진 진짜 용. 숨결이 전장을 태운다.',
    skill: { kind: 'dragonBreath', name: '용의 브레스', icon: '🔥', cd: 7.2, range: 10, power: 1.9, burn: 3.6, burnTime: 4.5, knock: 5, spread: 0.62,
      desc: '넓은 전방에 불길을 뿜어 태우고 밀어낸다' },
    passive: '높이 난다 · 넉백 저항',
    kbResist: 0.45,
  },
  {
    id: 'hydra', name: '히드라', emoji: '🐍', cat: 'monster', tier: 4, cost: 12, role: '다두룡',
    hp: 600, atk: 40, spd: 3.0, range: 4.6, atkInterval: 1.25,
    colors: { main: 0x2f6b52, dark: 0x14322a, accent: 0x9bf06a, belly: 0x6fa87a },
    scale: 1.3, size: 1.6,
    desc: '목이 셋으로 갈라진 거대한 다두룡. 세 머리가 동시에 맹독을 뿜어 적을 녹인다.',
    skill: { kind: 'tripleVenom', name: '삼두 맹독 브레스', icon: '🐍', cd: 7.6, range: 12, radius: 3.4, spread: 0.34, power: 1.5, bleed: 5, bleedTime: 5, slow: 0.5, slowTime: 3.4,
      desc: '세 머리가 초록·보라 맹독을 뿜어 광역 지속 피해 + 강한 둔화' },
    passive: '거대 체력 · 독에 강하다',
    armor: 0.1, kbResist: 0.6,
  },
  {
    id: 'hero', name: '영웅', emoji: '🦸', cat: 'monster', tier: 4, cost: 13, role: '히어로',
    hp: 560, atk: 44, spd: 4.2, range: 3.0, atkInterval: 0.95,
    colors: { main: 0x2f57c8, dark: 0x17306e, accent: 0xffd24a, belly: 0xe8eefc },
    scale: 1.18, size: 1.12,
    desc: '망토를 휘날리며 빛나는 주먹으로 싸우는 히어로. 강력펀치·연속펀치·어퍼컷을 번갈아 날린다.',
    skill: {
      kind: 'heroPunch', name: '강력펀치', icon: '🦸', cd: 5.2, range: 8.0, radius: 4.2, power: 1.9,
      desc: '강력펀치 · 연속펀치 · 어퍼컷을 전투 중 번갈아 사용한다',
      kit: [
        { id: 'powerPunch', name: '강력펀치', icon: '👊', range: 4.4, radius: 3.4, power: 2.05, knock: 22, stun: 0.4 },
        { id: 'rapidPunch', name: '연속펀치', icon: '🥊', range: 4.0, radius: 2.8, power: 0.46, strikes: 7 },
        { id: 'uppercut', name: '어퍼컷', icon: '☝️', range: 4.0, radius: 3.0, power: 1.7, stun: 1.3, knock: 12 },
      ],
    },
    passive: '방어 12% · 넉백 저항 50%',
    armor: 0.12, kbResist: 0.5,
  },
  {
    id: 'goblin', name: '고블린', emoji: '👺', cat: 'monster', tier: 1, cost: 2, role: '비열한 습격자',
    hp: 84, atk: 13, spd: 5.6, range: 2.0, atkInterval: 0.62, evasion: 0.14, crit: 0.15,
    colors: { main: 0x6fa03a, dark: 0x2e4a18, accent: 0xc8a040, belly: 0xa8c870 },
    scale: 0.92, size: 0.9,
    desc: '작고 빠른 초록 고블린. 몽둥이를 들고 뒤에서 슬쩍 찌른다.',
    skill: { kind: 'sneakStrike', name: '비열한 급습', icon: '🗡️', cd: 4.6, range: 8, minRange: 0.7, power: 1.5, bleed: 3, bleedTime: 3, dash: 6.5, crit: true,
      desc: '달려들어 급소를 찔러 확정 치명타와 출혈을 남긴다' },
    passive: '기본 회피 14% · 치명타 15%',
    evasion: 0.14,
  },
  /* ── 우리가 만든 RPG 게임의 최종 보스 — 강하닭 ──
     깃털 폭풍 · 거대 부리 강타 · 황금 알 폭격을 쿨타임마다 번갈아 쓴다. */
  {
    id: 'strong_chicken', name: '강하닭', short: '강하닭', emoji: '🐔', cat: 'monster', tier: 4, cost: 20, role: '최종 보스',
    hp: 2100, atk: 88, spd: 2.9, range: 4.4, atkInterval: 1.35,
    colors: { main: 0xf2e4c4, dark: 0xe8a24a, accent: 0xffc23a, belly: 0xfaeecf },
    scale: 1.72, size: 1.85,
    desc: '우리가 만든 RPG 게임의 마지막 보스. 황금 왕관을 쓴 거대한 닭으로, 깃털과 부리와 황금 알로 전장을 쓸어버린다.',
    skill: {
      kind: 'featherStorm', name: '깃털 폭풍', icon: '🪶', cd: 5.2, range: 13, radius: 5.8, power: 1.0,
      desc: '깃털 폭풍 · 거대 부리 강타 · 황금 알 폭격을 번갈아 퍼붓는다',
      kit: [
        { id: 'featherStorm', name: '깃털 폭풍', icon: '🪶', radius: 5.8, range: 13, power: 0.95, slow: 0.32, slowTime: 2.6 },
        { id: 'beakSmash', name: '거대 부리 강타', icon: '💥', radius: 6.4, range: 7.6, power: 1.6, stun: 1.2, knock: 16 },
        { id: 'eggBarrage', name: '황금 알 폭격', icon: '🥚', radius: 2.5, range: 17, power: 0.72, count: 4, knock: 9 },
      ],
    },
    passive: '최종 보스의 체력 · 넉백 저항 90%',
    armor: 0.22, kbResist: 0.9,
  },
  /* ── 언더테일의 그 샌즈 ──
     가스터 블래스터 · 뼈 발사 · 뼈 가시를 번갈아 쓰고, 근접 위협에는 잔상을 남기며 순간이동한다. */
  {
    id: 'sans', name: '샌즈', short: '샌즈', emoji: '💀', cat: 'monster', tier: 4, cost: 15, role: '원거리 스킬형',
    hp: 430, atk: 46, spd: 5.0, range: 6.4, atkInterval: 1.0, ranged: true,
    colors: { main: 0x3b6fd4, dark: 0x1b2a4a, accent: 0xffffff, belly: 0xf2f4fa },
    scale: 1.08, size: 1.0,
    desc: '파란 후드에 분홍 슬리퍼를 신은 해골. 왼쪽 눈이 하늘색으로 빛나고, 가스터 블래스터와 뼈로 상대를 몰아간다.',
    skill: {
      kind: 'gasterBlast', name: '가스터 블래스터', icon: '💀', cd: 4.4, range: 15, radius: 5.6, power: 1.55,
      desc: '가스터 블래스터 · 뼈 발사 · 뼈 가시를 번갈아 쓰고, 다가오면 순간이동한다',
      kit: [
        { id: 'gasterBlast', name: '가스터 블래스터', icon: '💀', radius: 1.5, range: 15, power: 1.55 },
        { id: 'boneBarrage', name: '뼈 발사', icon: '🦴', radius: 1.0, range: 15, power: 0.3, count: 8 },
        { id: 'boneSpikes', name: '뼈 가시', icon: '⛏️', radius: 6.4, range: 7.6, power: 1.15, stun: 0.6, slow: 0.42, slowTime: 2 },
      ],
    },
    passive: '기본 회피 24% · 순간이동',
    evasion: 0.24,
    blink: true,
    phase: 1,
  },
  /* ── 샌즈 2페이즈 · 3페이즈 (라스트 브레스) ──
     1페이즈와 같은 가스터/뼈 기술을 쓰되, 페이즈가 올라갈수록 공격력과 체력이 치솟는다.
     3페이즈는 가스터손 펀치 · 불미스러운 공격을 추가로 익힌다. */
  {
    id: 'sans_p2', name: '샌즈 2페이즈', short: '샌즈 P2', emoji: '💀', cat: 'monster', tier: 4, cost: 25, role: '라스트 브레스',
    hp: 680, atk: 82, spd: 5.2, range: 6.6, atkInterval: 0.92, ranged: true,
    colors: { main: 0x3b6fd4, dark: 0x1b2a4a, accent: 0xffffff, belly: 0xf2f4fa },
    scale: 1.1, size: 1.02,
    variantOf: 'sans', phase: 2, blink: true,
    desc: '가슴이 날카롭게 베이고 입가에 피가 번진 샌즈. 왼손에 뼈다귀를 쥐고, 1페이즈와 같은 기술을 훨씬 무겁게 내리친다.',
    skill: {
      kind: 'gasterBlast', name: '가스터 블래스터', icon: '💀', cd: 4.0, range: 15, radius: 5.8, power: 2.1,
      desc: '가스터 블래스터 · 뼈 발사 · 뼈 가시를 1페이즈와 같게 쓰되 위력이 크게 강화됐다',
      kit: [
        { id: 'gasterBlast', name: '가스터 블래스터', icon: '💀', radius: 1.8, range: 15, power: 2.1 },
        { id: 'boneBarrage', name: '뼈 발사', icon: '🦴', radius: 1.0, range: 15, power: 0.46, count: 10 },
        { id: 'boneSpikes', name: '뼈 가시', icon: '⛏️', radius: 6.8, range: 8.0, power: 1.55, stun: 0.7, slow: 0.45, slowTime: 2.2 },
      ],
    },
    passive: '기본 회피 26% · 순간이동 · 강화된 공격력',
    evasion: 0.26,
  },
  {
    id: 'sans_p3', name: '샌즈 3페이즈', short: '샌즈 P3', emoji: '💀', cat: 'monster', tier: 4, cost: 50, role: '최종 보스',
    hp: 2100, atk: 115, spd: 5.4, range: 7.0, atkInterval: 0.86, ranged: true,
    colors: { main: 0x3b6fd4, dark: 0x1b2a4a, accent: 0xffffff, belly: 0xf2f4fa },
    scale: 1.12, size: 1.04,
    variantOf: 'sans', phase: 3, blink: true,
    desc: '두개골이 깨지고 눈이 새까맣게 변 샌즈. 등 뒤로 가스터의 그림자가 드리우고, 가스터손 펀치와 불미스러운 공격까지 퍼붓는다.',
    skill: {
      kind: 'gasterBlast', name: '가스터 블래스터', icon: '💀', cd: 3.4, range: 16, radius: 6.2, power: 2.3,
      desc: '가스터 블래스터·뼈 발사·뼈 가시에 가스터손 펀치·불미스러운 공격까지 다섯 기술을 돌려 쓴다',
      kit: [
        { id: 'gasterBlast', name: '가스터 블래스터', icon: '💀', radius: 2.0, range: 16, power: 2.3 },
        { id: 'boneBarrage', name: '뼈 발사', icon: '🦴', radius: 1.0, range: 16, power: 0.5, count: 12 },
        { id: 'boneSpikes', name: '뼈 가시', icon: '⛏️', radius: 7.0, range: 8.4, power: 1.7, stun: 0.8, slow: 0.5, slowTime: 2.4 },
        { id: 'gasterHandPunch', name: '가스터손 펀치', icon: '🖐️', radius: 4.4, range: 12, power: 1.85, stun: 1.5, knock: 24 },
        { id: 'rudeAttack', name: '불미스러운 공격', icon: '🖕', radius: 3.0, range: 16, power: 1.15, count: 5, slow: 0.5, slowTime: 2.4 },
      ],
    },
    passive: '체력 2100 (강하닭과 동급) · 회피 30% · 순간이동 · 5가지 기술',
    evasion: 0.3, armor: 0.12, kbResist: 0.6,
  },
];

/* 샌즈 페이즈 선택 (유닛 카드 하나 → 1·2·3페이즈 버튼) */
export const SANS_PHASES = [
  { id: 'sans', phase: 1, label: '1페이즈', cost: 15, note: '기본 샌즈' },
  { id: 'sans_p2', phase: 2, label: '2페이즈', cost: 25, note: '공격력 강화' },
  { id: 'sans_p3', phase: 3, label: '3페이즈', cost: 50, note: '체력 2100 · 5기술' },
];
export const SANS_PHASE_IDS = SANS_PHASES.map((p) => p.id);

// 유닛 카드에 하나로 묶어 보여줄 변종 (샌즈 1·2·3페이즈)
export function isVariant(def) {
  return !!(def && def.variantOf);
}

export function phaseIdsOf(def) {
  if (!def) return null;
  const root = def.variantOf || def.id;
  if (root !== 'sans') return null;
  return SANS_PHASE_IDS;
}

export const ANIMALS = ANIMAL_LIST;
export const DINOS = DINO_LIST;
export const MONSTERS = MONSTER_LIST;
export const CREATURES = [...ANIMAL_LIST, ...DINO_LIST, ...MONSTER_LIST];
export const CREATURE_BY_ID = Object.fromEntries(CREATURES.map((a) => [a.id, a]));
export const CREATURE_IDS = CREATURES.map((a) => a.id);
export const ANIMAL_BY_ID = Object.fromEntries(ANIMAL_LIST.map((a) => [a.id, a]));
export const ANIMAL_IDS = ANIMAL_LIST.map((a) => a.id);

export function creaturesOf(cat) {
  return cat && cat !== 'all' ? CREATURES.filter((a) => a.cat === cat) : CREATURES;
}

/* ──────────────────────────────── 무기 ──────────────────────────────── */

export const WEAPONS = [
  { id: 'none', name: '맨몸', emoji: '✊', desc: '무기 없이 본연의 힘으로 싸운다', },
  { id: 'gatling', name: '개틀링건', emoji: '🔫', desc: '초당 7발 연사 · 사거리 7.6',
    range: 7.6, interval: 0.14, dmgMul: 0.2, proj: 'bullet', pspd: 36, color: 0xffe08a },
  { id: 'rocket', name: '로켓 런처', emoji: '🚀', desc: '광역 폭발 + 강한 넉백 · 사거리 11.5',
    range: 11.5, interval: 2.0, dmgMul: 1.55, proj: 'rocket', pspd: 15, aoe: 3.0, knock: 13, color: 0xff8a4a },
  { id: 'laser', name: '레이저 캐논', emoji: '⚡', desc: '관통하는 고위력 광선 · 사거리 9.6',
    range: 9.6, interval: 1.5, dmgMul: 1.1, proj: 'laser', pspd: 60, pierce: true, color: 0x6fe8ff },
  { id: 'shield', name: '스파이크 방패', emoji: '🛡️', desc: '체력 +40% · 정면 피해 40% 감소 · 밀치기',
    hpMul: 1.4, block: 0.4, bash: 8, color: 0xc8d0e0 },
];

export const WEAPON_BY_ID = Object.fromEntries(WEAPONS.map((w) => [w.id, w]));

// 배치된 유닛의 실효 능력치 (UI 표시에 사용)
export function statsWithWeapon(def, weaponId) {
  const w = WEAPON_BY_ID[weaponId] || WEAPON_BY_ID.none;
  const hp = Math.round(def.hp * (w.hpMul || 1));
  const range = Math.max(def.range, w.range || 0);
  return { hp, atk: def.atk, range, weapon: w };
}

/* ──────────────────────────────── 전장 ──────────────────────────────── */

const ARENA_DATA = [
  {
    id: 'savanna', name: '초원 아레나', emoji: '🌾', tag: '황금빛 초원',
    sky: { top: 0x1d3f6e, mid: 0xf0a860, bottom: 0xf7d9a0 },
    fog: 0xdfc292, fogNear: 42, fogFar: 105,
    ground: 0xb3a15c, ground2: 0x8d7c42, rim: 0xc9b878,
    lineBlue: 0x3f86ff, lineRed: 0xff5040,
    sun: 0xfff0cf, sunPos: [26, 34, 18], sunI: 2.5, ambient: 0.55,
    decor: 'savanna',
    obstacles: [
      { x: -6.8, z: -6.2, r: 1.15, h: 2.2, kind: 'rock' },
      { x: 6.8, z: 6.2, r: 1.15, h: 2.2, kind: 'rock' },
      { x: -6.2, z: 6.8, r: 0.9, h: 1.5, kind: 'rock' },
      { x: 6.2, z: -6.8, r: 0.9, h: 1.5, kind: 'rock' },
      { x: 0, z: -10.0, r: 1.5, h: 3.2, kind: 'tree' },
      { x: 0, z: 10.0, r: 1.5, h: 3.2, kind: 'tree' },
      { x: -10.6, z: 0, r: 1.0, h: 1.9, kind: 'rock' },
      { x: 10.6, z: 0, r: 1.0, h: 1.9, kind: 'rock' },
    ],
  },
  {
    id: 'canyon', name: '사막 협곡', emoji: '🏜️', tag: '붉은 바위 협곡',
    sky: { top: 0x2a1b3a, mid: 0xd0642a, bottom: 0xf0a868 },
    fog: 0xd08a58, fogNear: 42, fogFar: 110,
    ground: 0xb07848, ground2: 0x8d5a34, rim: 0xd9a06a,
    lineBlue: 0x4f9bff, lineRed: 0xff5a3a,
    sun: 0xffd2a0, sunPos: [-22, 30, -14], sunI: 2.6, ambient: 0.5,
    decor: 'canyon',
    obstacles: [
      { x: -7.4, z: -4.6, r: 1.4, h: 5.2, kind: 'pillar' },
      { x: 7.4, z: 4.6, r: 1.4, h: 5.2, kind: 'pillar' },
      { x: -6.8, z: 6.2, r: 1.1, h: 3.8, kind: 'pillar' },
      { x: 6.8, z: -6.2, r: 1.1, h: 3.8, kind: 'pillar' },
      { x: 0, z: -10.2, r: 1.2, h: 3.4, kind: 'pillar' },
      { x: 0, z: 10.2, r: 1.2, h: 3.4, kind: 'pillar' },
    ],
  },
  {
    id: 'tundra', name: '설원 경기장', emoji: '❄️', tag: '푸른 얼음 벌판',
    sky: { top: 0x122a4d, mid: 0x6fa8d8, bottom: 0xdceaf6 },
    fog: 0xcfe2f2, fogNear: 44, fogFar: 110,
    ground: 0xd6e6f2, ground2: 0xb8cfe0, rim: 0xf2f9ff,
    lineBlue: 0x2f7fff, lineRed: 0xff4a3a,
    sun: 0xe8f4ff, sunPos: [16, 38, -20], sunI: 2.3, ambient: 0.62,
    decor: 'tundra',
    obstacles: [
      { x: -7.0, z: -5.0, r: 1.0, h: 3.2, kind: 'ice' },
      { x: 7.0, z: 5.0, r: 1.0, h: 3.2, kind: 'ice' },
      { x: -6.6, z: 5.8, r: 0.85, h: 2.2, kind: 'ice' },
      { x: 6.6, z: -5.8, r: 0.85, h: 2.2, kind: 'ice' },
      { x: 0, z: -9.8, r: 1.5, h: 3.0, kind: 'rock' },
      { x: 0, z: 9.8, r: 1.5, h: 3.0, kind: 'rock' },
    ],
  },
];

export const ARENAS = ARENA_DATA.map((a) => ({
  ...a,
  fogNear: S(a.fogNear),
  fogFar: S(a.fogFar),
  obstacles: a.obstacles.map((o) => ({ ...o, x: S(o.x), z: S(o.z) })),
}));

export const ARENA_BY_ID = Object.fromEntries(ARENAS.map((a) => [a.id, a]));

/* ─────────────────────── 배치 도우미 (프리셋용) ─────────────────────── */

const P = (id, x, z, weapon = 'none') => ({ id, x, z, weapon });

// 한 팀 진영에 n마리를 2~3열 종대로 배치
function cluster(id, n, side, weapon = 'none', opts = {}) {
  const sx = side === 'blue' ? -1 : 1;
  const x0 = opts.x0 || 5.0;
  const dx = opts.dx || 2.7;
  const dz = opts.dz || 2.3;
  const per = opts.per || 6;
  const out = [];
  for (let i = 0; i < n; i++) {
    const col = Math.floor(i / per);
    const row = i % per;
    const count = Math.min(per, n - col * per);
    out.push(P(id, sx * (x0 + col * dx), (row - (count - 1) / 2) * dz, weapon));
  }
  return out;
}

// 여러 종을 한 진영에 줄 맞춰 배치
function lineup(side, list, opts = {}) {
  const sx = side === 'blue' ? -1 : 1;
  const x0 = opts.x0 || 5.5;
  return list.map((it, i) => {
    const id = typeof it === 'string' ? it : it.id;
    const weapon = typeof it === 'string' ? 'none' : (it.weapon || 'none');
    const z = (i - (list.length - 1) / 2) * (opts.dz || 2.9);
    return P(id, sx * (x0 + (i % 2) * (opts.dx || 2.4)), z, weapon);
  });
}

/* ─────────────────────────────── 프리셋 ─────────────────────────────── */

// 100마리 난전용 편성 (한쪽 50마리)
function swarmSide(side) {
  const sx = side === 'blue' ? -1 : 1;
  const ids = side === 'blue'
    ? ['raptor', 'raptor', 'lion', 'wolf', 'raptor', 'bear', 'fox', 'raptor', 'lion', 'cheetah']
    : ['raptor', 'raptor', 'tiger', 'boar', 'raptor', 'crocodile', 'raptor', 'wolf', 'rhino', 'raptor'];
  const guns = ['gatling', 'rocket', 'laser', 'shield'];
  const out = [];
  for (let i = 0; i < 50; i++) {
    const col = Math.floor(i / 13);
    const row = i % 13;
    const count = Math.min(13, 50 - col * 13);
    out.push(P(ids[i % ids.length], sx * (4.4 + col * 2.5), (row - (count - 1) / 2) * 1.65,
      i % 6 === 0 ? guns[i % guns.length] : 'none'));
  }
  return out;
}

const PRESET_DATA = [
  {
    id: 'trex-raptors', name: '티라노 vs 랩터 12마리', emoji: '🦖⚔️🦎',
    desc: '거대한 포식자 한 마리 vs 열두 마리 무리',
    blue: [P('trex', -5.4, 0)],
    red: cluster('raptor', 12, 'red', 'none', { x0: 4.2, dx: 2.3, dz: 2.2 }),
    arena: 'savanna',
  },
  {
    id: 'rocket-elephants', name: '로켓 코끼리 vs 사자 무리', emoji: '🐘🚀⚔️🦁',
    desc: '로켓을 단 코끼리 2마리 vs 사자 8마리',
    blue: [P('elephant', -6.2, -2.4, 'rocket'), P('elephant', -6.2, 2.4, 'rocket')],
    red: cluster('lion', 8, 'red', 'none', { x0: 4.6, dx: 2.4, dz: 2.4 }),
    arena: 'canyon',
  },
  {
    id: 'dino-war', name: '공룡 대전', emoji: '🦖⚔️🦕',
    desc: '티라노·스피노·트리케 vs 티라노·트리케 무리',
    blue: [
      P('trex', -7.4, 0), P('spino', -6.6, -4.4), P('triceratops', -6.6, 4.4),
      ...cluster('raptor', 4, 'blue', 'none', { x0: 2.6, per: 2, dz: 2.4 }),
    ],
    red: [
      P('trex', 7.4, 0), P('triceratops', 6.6, -4.4), P('triceratops', 6.6, 4.4),
      ...cluster('raptor', 6, 'red', 'none', { x0: 2.6, per: 2, dz: 2.4 }),
    ],
    arena: 'savanna',
  },
  {
    id: 'boss-raid', name: '거대 보스 레이드', emoji: '👹⚔️🐉',
    desc: '무장한 동물 12마리 vs 거대 타이탄 2기와 와이번 2마리',
    blue: [
      ...lineup('blue', [
        { id: 'lion', weapon: 'gatling' }, { id: 'lion', weapon: 'gatling' },
        { id: 'bear', weapon: 'shield' }, { id: 'bear', weapon: 'shield' },
        { id: 'elephant', weapon: 'rocket' }, { id: 'rhino', weapon: 'shield' },
        { id: 'eagle', weapon: 'laser' }, { id: 'eagle', weapon: 'laser' },
        { id: 'wolf', weapon: 'gatling' }, { id: 'wolf', weapon: 'gatling' },
        { id: 'crocodile', weapon: 'laser' }, { id: 'gorilla', weapon: 'rocket' },
      ], { x0: 4.2, dx: 2.4, dz: 2.35 }),
    ],
    red: [
      P('titan', 7.2, -2.4), P('titan', 8.7, 2.4),
      P('wyvern', 5.4, -5.4), P('wyvern', 5.4, 5.4), P('triceratops', 6.4, 0),
    ],
    arena: 'tundra',
  },
  {
    id: 'new-blood', name: '신규 유닛 쇼케이스', emoji: '🧟💀🐍',
    desc: '좀비·스켈레톤·거대 뱀·하이에나·디-렉스 vs 사자·트리케 무리',
    blue: [
      P('zombie', -6.0, -4.2), P('skeleton', -7.2, -1.6), P('snake', -4.8, 1.6),
      P('hyena', -8.0, 0.2), P('drex', -9.2, -3.2),
    ],
    red: [...cluster('lion', 6, 'red', 'none', { x0: 4.8, dz: 2.4 }), P('triceratops', 8.2, 0)],
    arena: 'savanna',
  },
  {
    id: 'mega-swarm', name: '100마리 대난전', emoji: '💥',
    desc: '블루 50 vs 레드 50 — 전장 한도 100마리',
    blue: swarmSide('blue'), red: swarmSide('red'), arena: 'savanna',
  },
  {
    id: 'duel', name: '1:1 라이벌', emoji: '🦁⚔️🐯',
    desc: '한 마리씩 맞붙는 단판 승부',
    blue: [P('lion', -5.2, 0)], red: [P('tiger', 5.2, 0)], arena: 'canyon',
  },
  {
    id: 'balance', name: '3v3 밸런스', emoji: '⚖️',
    desc: '정석 3 대 3',
    blue: lineup('blue', ['lion', 'wolf', 'crocodile'], { x0: 5.6, dz: 3.0 }),
    red: lineup('red', ['bear', 'tiger', 'eagle'], { x0: 5.6, dz: 3.0 }),
    arena: 'tundra',
  },
  {
    id: 'jungle-savanna', name: '정글 vs 사바나', emoji: '🌿⚔️🌾',
    desc: '호랑이·악어·멧돼지 vs 사자·코끼리·치타',
    blue: lineup('blue', ['tiger', 'crocodile', 'boar', 'fox'], { x0: 5.8, dz: 2.7 }),
    red: lineup('red', ['lion', 'elephant', 'cheetah'], { x0: 5.8, dz: 2.9 }),
    arena: 'savanna',
  },
  {
    id: 'chicken-sans', name: '강하닭 vs 샌즈', emoji: '🐔⚔️💀',
    desc: '코스트 20 최종 보스 강하닭 vs 코스트 15 가스터 샌즈 — 깃털·부리·황금 알 대 가스터 블래스터·뼈',
    blue: [P('strong_chicken', -6.4, 0)],
    red: [P('sans', 6.4, 0)],
    arena: 'tundra',
  },
  {
    id: 'lastbreath-p3', name: '라스트 브레스 3페이즈 vs 강하닭', emoji: '💀⚔️🐔',
    desc: '코스트 50 샌즈 3페이즈(가스터손 펀치·불미스러운 공격) vs 코스트 20 강하닭 — 체력 2100 대결',
    blue: [P('sans_p3', -6.4, 0)],
    red: [P('strong_chicken', 6.4, 0)],
    arena: 'tundra',
  },
  {
    id: 'new-units-2026', name: '신규 4종 쇼케이스', emoji: '🦣🐍🦍🦸',
    desc: '매머드·히드라·킹콩·영웅 vs 티라노·트리케·사자·곰',
    blue: lineup('blue', ['mammoth', 'hydra', 'king_kong', 'hero'], { x0: 5.6, dz: 3.4 }),
    red: lineup('red', ['trex', 'triceratops', 'lion', 'bear'], { x0: 5.6, dz: 3.4 }),
    arena: 'savanna',
  },
  {
    id: 'seven-new', name: '신규 7종 쇼케이스', emoji: '🦈🐉🗿',
    desc: '상어·메갈로돈·모사사우르스·레비아탄·스톤골렘·드래곤·고블린 vs 사자 무리',
    blue: lineup('blue', ['shark', 'megalodon', 'mosasaurus', 'leviathan', 'stone_golem', 'dragon', 'goblin'], { x0: 5.4, dx: 2.8, dz: 3.1 }),
    red: lineup('red', ['lion', 'bear', 'tiger', 'triceratops', 'lion'], { x0: 5.4, dz: 3.0 }),
    arena: 'tundra',
  },
];

export const PRESETS = PRESET_DATA.map((p) => ({
  ...p,
  blue: scaleList(p.blue),
  red: scaleList(p.red),
}));

export const PRESET_BY_ID = Object.fromEntries(PRESETS.map((p) => [p.id, p]));

/* ──────────────────────────── 기본 배치 (첫 화면) ──────────────────────────── */

export const DEFAULT_PLACEMENTS = {
  blue: scaleList([
    P('trex', -6.4, 0),
    P('raptor', -3.4, -3.4), P('raptor', -3.4, 0), P('raptor', -3.4, 3.4),
    P('lion', -9.0, 2.4),
  ]),
  red: scaleList([
    P('triceratops', 6.4, 0),
    P('raptor', 3.4, -3.4), P('raptor', 3.4, 0), P('raptor', 3.4, 3.4),
    P('rhino', 9.0, -2.4),
  ]),
  arena: 'savanna',
};

/* ─────────────────────────────── 챌린지 (6단계) ─────────────────────────────── */

const CHALLENGE_DATA = [
  {
    id: 1, name: '랩터의 습격', emoji: '🦎', budget: 10,
    desc: '랩터 다섯 마리가 진형을 노린다. 예산 10으로 막아내라.',
    arena: 'savanna',
    red: cluster('raptor', 5, 'red', 'none', { x0: 5.0, dz: 2.4 }),
    hint: '랩터는 약하지만 빠르다. 단단한 한 마리로 받아쳐 보자.',
  },
  {
    id: 2, name: '늑대 무리', emoji: '🐺', budget: 14,
    desc: '늑대 6마리와 멧돼지 2마리. 무리 사냥에 대비하라.',
    arena: 'savanna',
    red: [...cluster('wolf', 6, 'red', 'none', { x0: 5.2, dz: 2.2 }), P('boar', 8.2, -3.0), P('boar', 8.2, 3.0)],
    hint: '광역 스킬이 있는 유닛이 무리에 강하다.',
  },
  {
    id: 3, name: '티라노 사냥', emoji: '🦖', budget: 20,
    desc: '티라노와 트리케라톱스, 랩터 3마리. 거인을 쓰러뜨려라.',
    arena: 'canyon',
    red: [P('trex', 6.6, 0), P('triceratops', 6.2, 0.2), ...cluster('raptor', 3, 'red', 'none', { x0: 3.6, dz: 2.6 })],
    hint: '티라노는 느리다. 원거리 무기로 거리를 벌려라.',
  },
  {
    id: 4, name: '무장한 맹수', emoji: '🔫', budget: 24,
    desc: '개틀링 곰 2마리, 로켓 사자 2마리, 방패 트리케라톱스.',
    arena: 'tundra',
    red: [
      P('bear', 5.4, -3.0, 'gatling'), P('bear', 5.4, 3.0, 'gatling'),
      P('lion', 8.0, -2.2, 'rocket'), P('lion', 8.0, 2.2, 'rocket'),
      P('triceratops', 6.6, 0, 'shield'),
    ],
    hint: '방패로 정면 피해를 줄이고, 로켓으로 뭉친 적을 노려라.',
  },
  {
    id: 5, name: '뿔의 방벽', emoji: '🦖', budget: 28,
    desc: '트리케라톱스 2마리와 멧돼지 4마리가 정면을 지킨다.',
    arena: 'savanna',
    red: [
      P('triceratops', 6.2, -2.6), P('triceratops', 6.2, 2.6),
      ...cluster('boar', 4, 'red', 'none', { x0: 3.4, dz: 2.6 }),
    ],
    hint: '정면 방어가 강하다. 측면으로 돌거나 레이저로 뚫어라.',
  },
  {
    id: 6, name: '타이탄 최종전', emoji: '👹', budget: 30,
    desc: '거대 타이탄과 와이번 2마리, 트리케라톱스, 레이저 사자.',
    arena: 'tundra',
    red: [
      P('titan', 7.0, 0), P('wyvern', 5.4, -4.8), P('wyvern', 5.4, 4.8),
      P('triceratops', 6.4, 0.2), P('lion', 9.4, 2.6, 'laser'),
    ],
    hint: '타이탄은 넉백이 거의 통하지 않는다. 화력에 화력으로.',
  },
];

export const CHALLENGES = CHALLENGE_DATA.map((c) => ({ ...c, red: scaleList(c.red) }));

export const CHALLENGE_BY_ID = Object.fromEntries(CHALLENGES.map((c) => [c.id, c]));

/* ───────────────────────────────── 유틸 ───────────────────────────────── */

export function animalTierStars(tier) {
  return '★'.repeat(tier) + '☆'.repeat(Math.max(0, 4 - tier));
}

// 유닛의 대략적인 전투력 (UI 표시 · 밸런스 참고)
export function powerOf(a) {
  const dps = (a.atk / a.atkInterval) * (1 + (a.skill.power || 0) * 0.25);
  return Math.round(a.hp * 0.5 + dps * 2.2 + a.spd * 2 + (a.armor || 0) * 160 + (a.evasion || 0) * 120);
}

export function placementCost(list) {
  return (list || []).reduce((s, p) => s + (CREATURE_BY_ID[p.id]?.cost || 0), 0);
}
