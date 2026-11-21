// 동물 vs 동물 — 게임 데이터 (동물 능력치 · 스킬 · 전장 · 프리셋)
// 이 파일은 THREE에 의존하지 않는다. tests/smoke.mjs 가 그대로 불러 검증한다.

export const TUNING = {
  ARENA_RADIUS: 15.0,        // 전장 반경 (유닛 중심 이동 한계)
  MAX_TEAM: 4,               // 한 팀 최대 유닛 수
  MAX_TIME: 120,             // 배틀 제한 시간(초) — 초과 시 HP 비율 판정
  SIM_DT: 1 / 60,            // 고정 스텝
  SEPARATION: 2.35,          // 유닛끼리 겹침 방지 거리
  KNOCK_DECAY: 7.5,          // 넉백 감쇠
  BLEED_TICK: 0.5,           // 출혈 피해 주기
  CRIT_MULT: 1.9,
  LOG_LIMIT: 40,
};

/* ──────────────────────────── 동물 로스터 (12종) ────────────────────────────
   hp/atk/spd/range 는 sim 의 실제 값, atkInterval 은 공격 1회 간격(초).
   skill.kind 는 sim.castSkill 이 해석한다.                                   */

export const ANIMALS = [
  {
    id: 'lion', name: '사자', emoji: '🦁', tier: 3, cost: 4, role: '근접 딜러',
    hp: 172, atk: 20, spd: 3.6, range: 2.7, atkInterval: 0.95,
    colors: { main: 0xd9a44e, dark: 0x8a5a22, accent: 0x5a3416, belly: 0xf0d9a8 },
    scale: 1.0,
    desc: '포효 한 번으로 전장을 뒤흔드는 백수의 왕.',
    skill: { kind: 'roar', name: '포효 충격파', icon: '📣', cd: 8.5, range: 6.6, radius: 6.6, power: 1.2, stun: 1.15, knock: 8.5,
      desc: '주변 적 전원에게 피해와 기절, 강한 넉백' },
    passive: '기절에 강하다',
  },
  {
    id: 'tiger', name: '호랑이', emoji: '🐯', tier: 3, cost: 4, role: '암살자',
    hp: 126, atk: 21, spd: 4.3, range: 2.5, atkInterval: 0.95,
    colors: { main: 0xe08a2a, dark: 0x1c1410, accent: 0x8a4a12, belly: 0xf7ead2 },
    scale: 1.0,
    desc: '거리를 벌렸다가 단숨에 파고드는 사냥꾼.',
    skill: { kind: 'pounce', name: '급습 도약', icon: '💨', cd: 7.0, range: 9.5, minRange: 3.6, power: 2.1, bleed: 4.5, bleedTime: 4,
      desc: '멀리서 도약해 2.1배 피해 + 출혈' },
    passive: '도약 직후 잠깐 회피',
  },
  {
    id: 'elephant', name: '코끼리', emoji: '🐘', tier: 4, cost: 5, role: '탱커',
    hp: 268, atk: 16, spd: 2.35, range: 3.2, atkInterval: 1.3,
    colors: { main: 0x9aa0a8, dark: 0x6b7178, accent: 0xe8e2d4, belly: 0xb6bcc2 },
    scale: 1.18,
    desc: '가장 단단한 몸. 돌진 한 번에 진형이 무너진다.',
    skill: { kind: 'charge', name: '돌진 밀치기', icon: '🌊', cd: 9.5, range: 10, power: 1.75, stun: 0.8, knock: 15, width: 2.6, dash: 9,
      desc: '전방으로 돌진해 밟은 적을 밀쳐내고 기절' },
    passive: '넉백 저항 80%',
    armor: 0.1, kbResist: 0.8,
  },
  {
    id: 'bear', name: '곰', emoji: '🐻', tier: 3, cost: 4, role: '브루저',
    hp: 214, atk: 19, spd: 2.8, range: 2.8, atkInterval: 1.15,
    colors: { main: 0x7a4b28, dark: 0x402612, accent: 0xd8b98a, belly: 0xa87a4e },
    scale: 1.06,
    desc: '묵직한 앞발. 한 대 맞으면 발이 묶인다.',
    skill: { kind: 'slam', name: '강타', icon: '🪵', cd: 7.5, range: 3.2, radius: 4.8, power: 1.5, slow: 0.55, slowTime: 3, knock: 5,
      desc: '앞발 강타로 광역 피해 + 55% 둔화' },
    passive: '피해를 버틴다',
  },
  {
    id: 'wolf', name: '늑대', emoji: '🐺', tier: 2, cost: 3, role: '연타',
    hp: 132, atk: 14, spd: 4.6, range: 2.2, atkInterval: 0.85,
    colors: { main: 0x8a8f99, dark: 0x4a4f58, accent: 0x2b2f36, belly: 0xcfd4da },
    scale: 0.92,
    desc: '물어뜯어 출혈을 쌓고 무리를 몰아붙인다.',
    skill: { kind: 'pack', name: '무리 사냥', icon: '🐾', cd: 7.0, range: 2.9, power: 1.35, bleed: 3.2, bleedTime: 3.5, haste: 0.3, hasteTime: 5,
      desc: '출혈 물기 + 아군 전체 공격속도 +30%' },
    passive: '아군이 붙으면 빨라진다',
    onHitBleed: { dps: 1.6, time: 3 },
  },
  {
    id: 'eagle', name: '독수리', emoji: '🦅', tier: 2, cost: 3, role: '원거리',
    hp: 76, atk: 14.5, spd: 4.6, range: 7.4, atkInterval: 1.28, ranged: true,
    colors: { main: 0x5a3a22, dark: 0x2a1a0e, accent: 0xf2f2f2, belly: 0x8a6a44 },
    scale: 0.95,
    desc: '하늘에서 깃털을 꽂고, 다가오면 다시 솟아오른다.',
    skill: { kind: 'dive', name: '급강하', icon: '🪶', cd: 7.5, range: 11, power: 2.0, radius: 2.2, knock: 6,
      desc: '하늘로 솟아올라 대상에게 급강하 (2배 피해)' },
    passive: '거리를 유지한다',
  },
  {
    id: 'crocodile', name: '악어', emoji: '🐊', tier: 3, cost: 4, role: '방어형',
    hp: 178, atk: 17, spd: 2.4, range: 2.7, atkInterval: 1.15,
    colors: { main: 0x4a6b3a, dark: 0x2a3f20, accent: 0xe8e0b0, belly: 0x9aa87a },
    scale: 1.0,
    desc: '단단한 비늘. 턱에 걸리면 방어구가 무의미하다.',
    skill: { kind: 'chomp', name: '죽음의 악어턱', icon: '🦷', cd: 8.0, range: 3.0, power: 2.0, pierce: true, armorUp: 0.25, armorTime: 4, bleed: 3,
      desc: '방어 무시 2배 피해 + 비늘 방어 강화' },
    passive: '방어력 13%',
    armor: 0.13, kbResist: 0.4,
  },
  {
    id: 'rhino', name: '코뿔소', emoji: '🦏', tier: 3, cost: 4, role: '돌격',
    hp: 228, atk: 17, spd: 3.1, range: 2.7, atkInterval: 1.15,
    colors: { main: 0x8d939c, dark: 0x5c626b, accent: 0xe6dcc8, belly: 0xa8aeb6 },
    scale: 1.1,
    desc: '멈출 수 없는 돌파. 기절도 둔화도 통하지 않는다.',
    skill: { kind: 'gore', name: '돌파', icon: '⚡', cd: 9.0, range: 10, power: 1.85, stun: 1.2, knock: 13, dash: 10, width: 2.4,
      desc: '돌진 중 무적의 돌파 — 닿은 적 기절' },
    passive: '돌진 중 상태이상 무시',
    armor: 0.1, kbResist: 0.7,
  },
  {
    id: 'fox', name: '여우', emoji: '🦊', tier: 1, cost: 2, role: '회피',
    hp: 94, atk: 14, spd: 5.0, range: 2.0, atkInterval: 0.72,
    colors: { main: 0xd96a28, dark: 0x7a3210, accent: 0xfdf3e4, belly: 0xfdf3e4 },
    scale: 0.9,
    desc: '작지만 잡히지 않는다. 결정타는 크게.',
    skill: { kind: 'evade', name: '교묘한 회피', icon: '🌀', cd: 8.0, range: 3.4, dodge: 0.6, dodgeTime: 2.6, haste: 0.45, hasteTime: 2.6,
      desc: '2.6초 회피 70% + 공격속도 폭증' },
    passive: '기본 회피 14%',
    evasion: 0.14,
  },
  {
    id: 'gorilla', name: '고릴라', emoji: '🦍', tier: 3, cost: 4, role: '광역',
    hp: 198, atk: 22, spd: 2.9, range: 2.8, atkInterval: 1.25,
    colors: { main: 0x2e2a2b, dark: 0x141112, accent: 0x9aa0a6, belly: 0x453f40 },
    scale: 1.06,
    desc: '지면을 내리쳐 상대 진영을 띄워 버린다.',
    skill: { kind: 'smash', name: '지면 강타', icon: '💥', cd: 9.0, range: 3.4, radius: 5.6, power: 1.8, stun: 1.35, knock: 7,
      desc: '땅을 내리쳐 광역 피해 + 1.35초 기절' },
    passive: '높은 공격력',
  },
  {
    id: 'cheetah', name: '치타', emoji: '🐆', tier: 1, cost: 2, role: '속도',
    hp: 96, atk: 15, spd: 5.8, range: 2.1, atkInterval: 0.55, evasion: 0.16,
    colors: { main: 0xe0b25a, dark: 0x2a2018, accent: 0x1a1410, belly: 0xf7ecd2 },
    scale: 0.92,
    desc: '전장에서 가장 빠른 발. 순간 폭발력이 강하다.',
    skill: { kind: 'sprint', name: '질주', icon: '💫', cd: 5.5, range: 30, speed: 1.85, speedTime: 3.2, haste: 0.55, hasteTime: 4,
      desc: '3.2초 이동속도 1.85배 + 공격속도 +50%' },
    passive: '최고 이동속도',
  },
  {
    id: 'boar', name: '멧돼지', emoji: '🐗', tier: 2, cost: 3, role: '근접',
    hp: 160, atk: 17, spd: 3.7, range: 2.3, atkInterval: 1.0,
    colors: { main: 0x554438, dark: 0x2a2018, accent: 0xe9e0cc, belly: 0x6e5a48 },
    scale: 0.96,
    desc: '엄니로 파고들어 출혈을 남긴다.',
    skill: { kind: 'gore2', name: '엄니 돌진', icon: '🦴', cd: 7.5, range: 7.5, minRange: 3, power: 1.6, bleed: 4, bleedTime: 3.5, knock: 7, dash: 6,
      desc: '짧게 돌진해 출혈을 남긴다' },
    passive: '단단한 체력',
    kbResist: 0.3,
    onHitBleed: { dps: 2, time: 3 },
  },
];

export const ANIMAL_BY_ID = Object.fromEntries(ANIMALS.map((a) => [a.id, a]));
export const ANIMAL_IDS = ANIMALS.map((a) => a.id);

/* ──────────────────────────────── 전장 ──────────────────────────────── */

export const ARENAS = [
  {
    id: 'savanna', name: '초원 아레나', emoji: '🌾', tag: '황금빛 초원',
    sky: { top: 0x1d3f6e, mid: 0xf0a860, bottom: 0xf7d9a0 },
    fog: 0xe8c48a, fogNear: 42, fogFar: 105,
    ground: 0x9c8a4a, ground2: 0x7d6d36, rim: 0xb9a866,
    sun: 0xfff0cf, sunPos: [26, 34, 18], sunI: 2.5, ambient: 0.55,
    decor: 'savanna',
    obstacles: [
      { x: -5.9, z: -5.0, r: 1.15, h: 2.2, kind: 'rock' },
      { x: 5.9, z: 5.0, r: 1.15, h: 2.2, kind: 'rock' },
      { x: -5.4, z: 5.6, r: 0.9, h: 1.5, kind: 'rock' },
      { x: 5.4, z: -5.6, r: 0.9, h: 1.5, kind: 'rock' },
      { x: 0, z: -8.4, r: 1.5, h: 3.2, kind: 'tree' },
      { x: 0, z: 8.4, r: 1.5, h: 3.2, kind: 'tree' },
      { x: -9.2, z: 0, r: 1.0, h: 1.9, kind: 'rock' },
      { x: 9.2, z: 0, r: 1.0, h: 1.9, kind: 'rock' },
    ],
  },
  {
    id: 'canyon', name: '사막 협곡', emoji: '🏜️', tag: '붉은 바위 협곡',
    sky: { top: 0x2a1b3a, mid: 0xd0642a, bottom: 0xf0a868 },
    fog: 0xd08a58, fogNear: 38, fogFar: 100,
    ground: 0xb07848, ground2: 0x8d5a34, rim: 0xd9a06a,
    sun: 0xffd2a0, sunPos: [-22, 30, -14], sunI: 2.6, ambient: 0.5,
    decor: 'canyon',
    obstacles: [
      { x: -6.6, z: -4.0, r: 1.4, h: 5.2, kind: 'pillar' },
      { x: 6.6, z: 4.0, r: 1.4, h: 5.2, kind: 'pillar' },
      { x: -6.0, z: 5.4, r: 1.1, h: 3.8, kind: 'pillar' },
      { x: 6.0, z: -5.4, r: 1.1, h: 3.8, kind: 'pillar' },
      { x: 0, z: -8.6, r: 1.6, h: 6.2, kind: 'pillar' },
      { x: 0, z: 8.6, r: 1.6, h: 6.2, kind: 'pillar' },
    ],
  },
  {
    id: 'tundra', name: '설원 경기장', emoji: '❄️', tag: '푸른 얼음 벌판',
    sky: { top: 0x122a4d, mid: 0x6fa8d8, bottom: 0xdceaf6 },
    fog: 0xcfe2f2, fogNear: 40, fogFar: 100,
    ground: 0xd6e6f2, ground2: 0xb8cfe0, rim: 0xf2f9ff,
    sun: 0xe8f4ff, sunPos: [16, 38, -20], sunI: 2.3, ambient: 0.62,
    decor: 'tundra',
    obstacles: [
      { x: -6.2, z: -4.4, r: 1.0, h: 3.2, kind: 'ice' },
      { x: 6.2, z: 4.4, r: 1.0, h: 3.2, kind: 'ice' },
      { x: -5.8, z: 5.0, r: 0.85, h: 2.2, kind: 'ice' },
      { x: 5.8, z: -5.0, r: 0.85, h: 2.2, kind: 'ice' },
      { x: 0, z: -8.2, r: 1.5, h: 3.0, kind: 'rock' },
      { x: 0, z: 8.2, r: 1.5, h: 3.0, kind: 'rock' },
    ],
  },
];

export const ARENA_BY_ID = Object.fromEntries(ARENAS.map((a) => [a.id, a]));

/* ─────────────────────────────── 프리셋 ─────────────────────────────── */

export const PRESETS = [
  { id: 'jungle-savanna', name: '정글 vs 사바나', emoji: '🌿⚔️🌾',
    blue: ['tiger', 'crocodile', 'gorilla'], red: ['lion', 'elephant', 'cheetah'], arena: 'savanna' },
  { id: 'beast-giant', name: '맹수 vs 거대동물', emoji: '🐯⚔️🐘',
    blue: ['tiger', 'wolf', 'fox', 'eagle'], red: ['elephant', 'rhino', 'bear'], arena: 'savanna' },
  { id: 'sky-ground', name: '하늘 vs 땅', emoji: '🦅⚔️🐊',
    blue: ['eagle', 'cheetah', 'fox'], red: ['crocodile', 'boar', 'gorilla'], arena: 'canyon' },
  { id: 'duel', name: '1:1 라이벌', emoji: '🦁⚔️🐯',
    blue: ['lion'], red: ['tiger'], arena: 'canyon' },
  { id: 'balance', name: '3v3 밸런스', emoji: '⚖️',
    blue: ['lion', 'wolf', 'crocodile'], red: ['bear', 'tiger', 'eagle'], arena: 'tundra' },
  { id: 'giant', name: '거인 4v4', emoji: '🐘⚔️🦏',
    blue: ['elephant', 'rhino', 'gorilla', 'bear'], red: ['crocodile', 'lion', 'boar', 'tiger'], arena: 'tundra' },
];

/* ──────────────────────────── 기본 편성 (첫 화면) ──────────────────────────── */

export const DEFAULT_TEAMS = {
  blue: ['lion', 'wolf', 'eagle'],
  red: ['tiger', 'elephant', 'crocodile'],
  arena: 'savanna',
};

export function animalTierStars(tier) {
  return '★'.repeat(tier) + '☆'.repeat(Math.max(0, 4 - tier));
}

// 유닛의 대략적인 전투력 (UI 표시 · 밸런스 참고)
export function powerOf(a) {
  const dps = (a.atk / a.atkInterval) * (1 + (a.skill.power || 0) * 0.25);
  return Math.round(a.hp * 0.5 + dps * 2.2 + a.spd * 2 + (a.armor || 0) * 160 + (a.evasion || 0) * 120);
}
