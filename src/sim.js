// 동물 vs 동물 — ARBS 스타일 배틀 시뮬레이션 (순수 로직 · THREE/DOM 의존 없음)
// 브라우저(main.js)와 노드(tests/smoke.mjs)가 똑같은 코드를 돌린다.

import {
  CREATURE_BY_ID, WEAPON_BY_ID, ARENA_BY_ID, TUNING,
  TEAM_ORDER, teamDef, teamName, sectorCenterDir,
} from './config.js';
import { normalizePlacement, autoPositions, clampSide } from './placement.js';

// 기본 2팀(샌드박스·챌린지) · 파티는 최대 4팀
const TEAMS = ['blue', 'red'];
export { TEAMS };
export const PARTY_TEAMS = TEAM_ORDER;

/* ─────────────────────────── 난수 (시드 고정) ─────────────────────────── */

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const dist2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

function shortenAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/* ─────────────────────────────── 배틀 생성 ─────────────────────────────── */

function normalizeSide(list, team, teams = null) {
  if (!Array.isArray(list)) return [];
  const cleaned = list.map(normalizePlacement).filter(Boolean).slice(0, TUNING.MAX_UNITS_PER_TEAM);
  const placed = autoPositions(cleaned, team, teams).map((p) => {
    const c = clampSide(team, p.x, p.z, true, teams);
    return { ...p, x: c.x, z: c.z };
  });
  return placed;
}

// { blue, red } 또는 { sides: {blue, red, green, gold}, teams: [...] } 둘 다 받는다
function resolveSides(opts) {
  if (opts.sides && typeof opts.sides === 'object') return { ...opts.sides };
  const out = {};
  if (opts.blue !== undefined) out.blue = opts.blue;
  if (opts.red !== undefined) out.red = opts.red;
  return out;
}

export function createBattle(opts = {}) {
  const sidesIn = resolveSides(opts);
  let teams = Array.isArray(opts.teams) && opts.teams.length ? opts.teams.slice() : Object.keys(sidesIn);
  teams = teams.filter((t) => TEAM_ORDER.indexOf(t) >= 0);
  if (!teams.length) teams = ['blue', 'red'];
  const arena = ARENA_BY_ID[opts.arenaId] || ARENA_BY_ID.savanna;
  const seed = opts.seed == null ? 20261121 : opts.seed >>> 0;
  const rng = mulberry32(seed);

  const state = {
    seed, arena, arenaId: arena.id, rng,
    time: 0, over: false, winner: null, endReason: null,
    units: [], projectiles: [], events: [], log: [], logTotal: 0, nextPid: 1, nextUid: 1,
    maxTime: opts.maxTime || TUNING.MAX_TIME,
    stats: { skills: 0, hits: 0, crits: 0, dodges: 0, kills: 0, shots: 0, explosions: 0 },
    mode: opts.mode || 'sandbox',
    challengeId: opts.challengeId || null,
    teams: teams.slice(),   // 이 전장에 참가한 진영 (2~4개)
    teamOut: [],            // 전멸한 진영
    sides: {},              // 진영별 배치 수
    teamSize: teams.length,
  };

  const counts = [];
  for (const team of teams) {
    const list = normalizeSide(sidesIn[team], team, teams);
    state.sides[team] = list.length;
    counts.push(`${teamDef(team).emoji}${list.length}`);
    spawnTeam(state, list, team, teams);
  }

  const present = teams.filter((t) => state.sides[t] > 0);
  if (present.length <= 1) {
    state.over = true;
    state.endReason = 'empty';
    state.winner = present.length === 1 ? present[0] : 'draw';
  }
  pushLog(state, {
    text: `${arena.emoji} ${arena.name} — ${teams.length > 2 ? counts.join(' vs ') : `${state.sides[teams[0]] || 0} vs ${state.sides[teams[1]] || 0}`}`,
    kind: 'system',
  });
  return state;
}

function spawnTeam(state, list, team, teams = null) {
  for (const p of list) {
    const def = CREATURE_BY_ID[p.id];
    if (!def) continue;
    state.units.push(makeUnit(state, def, team, p.x, p.z, p.weapon, teams));
  }
}

function makeUnit(state, def, team, x, z, weaponId, teams = null) {
  const uid = state.nextUid++;
  // 아이템(구조물)은 무기를 달지 않는다
  const w = def.isStructure ? WEAPON_BY_ID.none : (WEAPON_BY_ID[weaponId] || WEAPON_BY_ID.none);
  const maxHp = Math.round(def.hp * (w.hpMul || 1));
  // 시작 방향: 전장 중앙을 바라본다 (2팀이면 기존처럼 블루→동쪽, 레드→서쪽)
  let facing = Math.atan2(-x, -z);
  const tl = Array.isArray(teams) && teams.length ? teams : ['blue', 'red'];
  if (tl.length <= 2) facing = team === 'blue' ? Math.PI / 2 : -Math.PI / 2;
  else if (Math.hypot(x, z) < 0.5) {
    const d = sectorCenterDir(tl, team);
    facing = Math.atan2(d.x, d.z);
  }
  return {
    uid, team, battle: state, id: def.id, def, emoji: def.emoji, name: def.name,
    x, z, y: 0, vx: 0, vz: 0, vy: 0, spin: 0, spinVel: 0,
    facing, aimYaw: facing,
    hp: maxHp, maxHp,
    atk: def.atk, spd: def.spd,
    range: Math.max(def.range, w.range || 0),
    weapon: w, weaponId: w.id,
    ranged: !!(def.ranged || w.proj),
    baseInterval: def.atkInterval,
    // 구조물(아이템): 제자리 고정 · 밀려나지 않음
    isStructure: !!def.isStructure,
    actTimer: 0.6 + state.rng() * 0.8,
    shellTimer: 2.2 + state.rng() * 1.4,
    // 직접 조종(점유) 상태
    possessed: false, ownerPid: null, input: null,
    armor: def.armor || 0,
    kbResist: def.knockResist != null ? def.knockResist : (def.kbResist || 0),
    evasion: def.evasion || 0, crit: def.crit || 0.07,
    attackTimer: 0.35 + state.rng() * 0.35,
    skillTimer: 2.4 + state.rng() * 3.2,
    kitIndex: 0, kitPick: null,
    blinkCd: 1.1 + state.rng() * 1.2,
    targetId: null,
    stun: 0, slow: 0, slowFactor: 1,
    haste: 0, hasteT: 0, speedMul: 1, speedT: 0,
    armorBuff: 0, armorT: 0, dodgeBonus: 0, dodgeT: 0,
    ccImmune: 0, invuln: 0,
    bleeding: [], bleedAccum: 0, bleedTick: 0,
    dash: null, state: 'idle', moving: false,
    dead: false, deadTime: 0, castLock: 0,
    dmgDealt: 0, dmgTaken: 0, kills: 0, skillCasts: 0, hitsLanded: 0,
    spawnTime: 0, lastHitFrom: null, lastSkill: null,
  };
}

/* ───────────────────────────────── 유틸 ───────────────────────────────── */

export function aliveUnits(state, team) {
  return state.units.filter((u) => !u.dead && (!team || u.team === team));
}

export function aliveCount(state, team) {
  let n = 0;
  for (const u of state.units) if (!u.dead && u.team === team) n++;
  return n;
}

export function teamHpRatio(state, team) {
  let hp = 0, max = 0;
  for (const u of state.units) if (u.team === team) { hp += Math.max(0, u.hp); max += u.maxHp; }
  return max ? hp / max : 0;
}

export function unitByUid(state, uid) {
  return state.units.find((u) => u.uid === uid) || null;
}

function emit(state, ev) { state.events.push(ev); }

function pushLog(state, entry) {
  const e = { t: state.time, ...entry };
  state.log.push(e);
  state.logTotal = (state.logTotal || 0) + 1;
  if (state.log.length > TUNING.LOG_LIMIT) state.log.shift();
}

export function drainEvents(state) {
  const out = state.events;
  state.events = [];
  return out;
}

function intervalFor(u) {
  if (u.weapon.proj) return u.weapon.interval / (1 + u.haste);
  return u.baseInterval / (1 + u.haste);
}

function unitSpeed(u, state) {
  let s = u.spd * u.speedMul;
  if (u.slow > 0) s *= 1 - u.slowFactor;
  if (u.def.id === 'wolf') {
    let pack = 0;
    for (const o of state.units) {
      if (o !== u && !o.dead && o.team === u.team && dist2(o.x, o.z, u.x, u.z) < 5) pack++;
    }
    s *= 1 + Math.min(2, pack) * 0.06;
  }
  return Math.max(0.5, s);
}

/* ───────────────────────────── 피해 · 상태이상 ───────────────────────────── */

export function applyDamage(state, src, tgt, raw, opts = {}) {
  if (!tgt || tgt.dead) return 0;
  if (tgt.invuln > 0) return 0;
  const rng = state.rng;

  const evade = clamp(tgt.evasion + tgt.dodgeBonus, 0, 0.85);
  if (!opts.unavoidable && evade > 0 && rng() < evade) {
    state.stats.dodges++;
    emit(state, { type: 'evade', uid: tgt.uid, by: src ? src.uid : null, x: tgt.x, z: tgt.z });
    return 0;
  }

  let dmg = raw;
  // 스파이크 방패: 정면에서 오는 공격을 막는다
  if (tgt.weapon && tgt.weapon.block && src && !opts.pierce) {
    const toSrc = Math.atan2(src.x - tgt.x, src.z - tgt.z);
    if (Math.abs(shortenAngle(toSrc - tgt.facing)) < Math.PI * 0.42) {
      dmg *= 1 - tgt.weapon.block;
      emit(state, { type: 'block', uid: tgt.uid, x: tgt.x, z: tgt.z });
    }
  }
  if (!opts.pierce) {
    const armor = clamp(tgt.armor + tgt.armorBuff, 0, 0.8);
    dmg *= 1 - armor;
  }
  if (opts.crit) { dmg *= TUNING.CRIT_MULT; state.stats.crits++; }
  dmg = Math.max(1, dmg);
  dmg = Math.round(dmg * 10) / 10;

  tgt.hp -= dmg;
  tgt.dmgTaken += dmg;
  tgt.lastHitFrom = src ? src.uid : null;
  state.stats.hits++;
  if (src) src.dmgDealt += dmg;

  emit(state, {
    type: 'hit', uid: tgt.uid, by: src ? src.uid : null, dmg,
    crit: !!opts.crit, x: tgt.x, y: tgt.y + 1.1, z: tgt.z, element: opts.element || 'normal',
  });

  if (tgt.hp <= 0) killUnit(state, tgt, src, dmg);
  return dmg;
}

function killUnit(state, u, src, heavy = 0, opts = {}) {
  if (u.dead) return;
  u.dead = true;
  u.hp = 0;
  u.deadTime = state.time;
  u.dash = null;
  u.state = 'dead';
  u.targetId = null;
  // 죽으면 회전을 즉시 멈춘다 — 옆으로 쓰러진 뒤 그대로 누워 있어야 한다
  u.spin = 0;
  u.spinVel = 0;
  // 무거운 일격 = 몸이 살짝 튕겨 나간다 (회전은 없다)
  if (heavy > 12 && u.def.size < 1.4) {
    u.vy = Math.max(u.vy, 5.6);
    u.vx *= 0.5; u.vz *= 0.5;
  }
  state.stats.kills++;
  if (src) src.kills++;
  emit(state, { type: 'death', uid: u.uid, x: u.x, z: u.z, by: src ? src.uid : null, heavy, selfDestruct: !!opts.selfDestruct });
  pushLog(state, {
    text: opts.selfDestruct
      ? `${u.emoji} ${u.name} 기폭`
      : `${u.emoji} ${u.name} 쓰러짐${src ? ` (${src.emoji} ${src.name})` : ''}`,
    team: u.team, kind: 'death',
  });
}

function knock(state, u, dirX, dirZ, force, opts = {}) {
  if (u.dead || force <= 0) return;
  // 제자리에 박힌 구조물은 밀리지 않는다
  if (u.isStructure) return;
  const resist = clamp(u.kbResist, 0, 0.9);
  const f = force * (1 - resist);
  const l = Math.hypot(dirX, dirZ) || 1;
  u.vx += (dirX / l) * f;
  u.vz += (dirZ / l) * f;
  // 가벼운 유닛은 뜨면서 회전한다
  if (opts.launch !== false && f > 6.5 && u.def.size < 1.32 && u.y <= 0.01) {
    u.vy = Math.max(u.vy, Math.min(7.5, f * 0.3));
    u.spinVel = clamp(f * 0.5, -11, 11) * (state.rng() < 0.5 ? -1 : 1);
    emit(state, { type: 'launch', uid: u.uid, x: u.x, z: u.z, force: f });
  }
}

function addBleed(state, target, src, dps, time) {
  if (!target || target.dead) return;
  target.bleeding.push({ dps, t: time, srcUid: src ? src.uid : null });
  if (target.bleeding.length > 8) target.bleeding.shift();
  emit(state, { type: 'bleedOn', uid: target.uid, x: target.x, z: target.z });
}

function haste(u, amount, time) {
  u.haste = Math.max(u.haste, amount);
  u.hasteT = Math.max(u.hasteT, time);
}

/* ─────────────────────────────── 타겟 선택 ─────────────────────────────── */

function chooseTarget(state, u) {
  let best = null, bestScore = Infinity;
  const allies = aliveUnits(state, u.team);
  for (const e of aliveUnits(state)) {
    if (e.team === u.team) continue;
    const d = dist2(u.x, u.z, e.x, e.z);
    let score = d;
    let onIt = 0;
    for (const a of allies) if (a !== u && a.targetId === e.uid) onIt++;
    score += onIt * (u.ranged ? 5.5 : 3.4);
    score *= 0.82 + 0.36 * (e.hp / e.maxHp);
    if (!u.ranged && d > 30) score += 6;
    if (score < bestScore) { bestScore = score; best = e; }
  }
  return best;
}

function ensureTarget(state, u) {
  let t = u.targetId ? unitByUid(state, u.targetId) : null;
  if (t && !t.dead && t.team !== u.team) return t;
  t = chooseTarget(state, u);
  u.targetId = t ? t.uid : null;
  return t;
}

/* ───────────────────────────────── 이동 ───────────────────────────────── */

function steerMove(state, u, tx, tz, speed, dt, stopAt = 0) {
  let dx = tx - u.x, dz = tz - u.z;
  const len = Math.hypot(dx, dz);
  if (len <= stopAt || len < 0.0001) return false;
  dx /= len; dz /= len;

  for (const o of state.units) {
    if (o === u || o.dead) continue;
    const ox = u.x - o.x, oz = u.z - o.z;
    const od = Math.hypot(ox, oz);
    const want = TUNING.SEPARATION * (o.def.size || 1) * (u.def.size > 1.3 ? 1.25 : 1);
    if (od < want && od > 0.0001) {
      const w = ((want - od) / want) * 1.9;
      dx += (ox / od) * w; dz += (oz / od) * w;
    }
  }

  for (const ob of state.arena.obstacles) {
    const ox = u.x - ob.x, oz = u.z - ob.z;
    const od = Math.hypot(ox, oz);
    const lim = ob.r + 0.85;
    if (od < lim + 1.5 && od > 0.0001) {
      const w = ((lim + 1.5 - od) / 1.5) * 2.3;
      dx += (ox / od) * w; dz += (oz / od) * w;
    }
  }

  const l2 = Math.hypot(dx, dz) || 1;
  u.x += (dx / l2) * speed * dt;
  u.z += (dz / l2) * speed * dt;
  u.moving = true;
  return true;
}

function moveAway(state, u, tx, tz, speed, dt) {
  steerMove(state, u, u.x - (tx - u.x), u.z - (tz - u.z), speed, dt);
}

function resolveCollisions(state, u) {
  for (const ob of state.arena.obstacles) {
    const dx = u.x - ob.x, dz = u.z - ob.z;
    const d = Math.hypot(dx, dz);
    const lim = ob.r + 0.62;
    if (d < lim && d > 0.0001) {
      u.x = ob.x + (dx / d) * lim;
      u.z = ob.z + (dz / d) * lim;
    }
  }
  const r = Math.hypot(u.x, u.z);
  const max = TUNING.ARENA_RADIUS;
  if (r > max) {
    u.x = (u.x / r) * max;
    u.z = (u.z / r) * max;
    u.vx *= 0.4; u.vz *= 0.4;
  }
}

/* ───────────────────────────── 일반 공격 ───────────────────────────── */

function doAttack(state, u, t) {
  const w = u.weapon;
  u.attackTimer = intervalFor(u);
  u.castLock = w.proj ? 0.18 : 0.34;
  u.hitsLanded++;
  u.facing = Math.atan2(t.x - u.x, t.z - u.z);

  if (w.proj === 'laser') { fireLaser(state, u, t); return; }
  if (w.proj) { fireProjectile(state, u, t); return; }

  emit(state, { type: 'attack', uid: u.uid, target: t.uid, ranged: !!u.def.ranged, weapon: 'none' });
  const dmg = u.atk * (0.9 + state.rng() * 0.2);
  const crit = state.rng() < u.crit;
  applyDamage(state, u, t, dmg, { crit });
  const bash = w.bash || 0;
  knock(state, t, t.x - u.x, t.z - u.z, 2.2 + bash * 0.5);
  if (bash > 0) {
    stunUnit(state, t, 0.18);
    emit(state, { type: 'bash', uid: t.uid, x: t.x, z: t.z });
  }
  if (u.def.onHitBleed) addBleed(state, t, u, u.def.onHitBleed.dps, u.def.onHitBleed.time);
}

function fireProjectile(state, u, t) {
  const w = u.weapon;
  const speed = w.pspd || 30;
  const dx = t.x - u.x, dz = t.z - u.z;
  const dd = Math.hypot(dx, dz) || 1;
  const dmg = u.atk * w.dmgMul * (0.9 + state.rng() * 0.2);
  state.projectiles.push({
    pid: state.nextPid++, kind: w.proj, fromUid: u.uid, targetUid: t.uid, team: u.team,
    x: u.x, y: u.y + 1.55, z: u.z,
    vx: (dx / dd) * speed, vz: (dz / dd) * speed, speed,
    dmg, ttl: Math.min(2.2, dd / speed + 0.35),
    aoe: w.aoe || 0, knock: w.knock || 0, color: w.color || 0xffe08a,
    x0: u.x, z0: u.z,
  });
  state.stats.shots++;
  emit(state, {
    type: 'shot', uid: u.uid, kind: w.proj, x: u.x, y: u.y + 1.55, z: u.z,
    tx: t.x, tz: t.z, color: w.color,
  });
}

function fireLaser(state, u, t) {
  const w = u.weapon;
  const dx = t.x - u.x, dz = t.z - u.z;
  const dd = Math.hypot(dx, dz) || 1;
  const ux = dx / dd, uz = dz / dd;
  const len = w.range;
  const ex = u.x + ux * len, ez = u.z + uz * len;
  const dmg = u.atk * w.dmgMul;
  const crit = state.rng() < u.crit;
  state.stats.shots++;
  emit(state, {
    type: 'beam', uid: u.uid, x: u.x, y: u.y + 1.6, z: u.z,
    x2: ex, z2: ez, color: w.color || 0x6fe8ff,
  });
  for (const e of state.units) {
    if (e.dead || e.team === u.team) continue;
    if (pointSegDist(e.x, e.z, u.x, u.z, ex, ez) <= 0.95) {
      applyDamage(state, u, e, dmg, { pierce: true, crit });
      knock(state, e, e.x - u.x, e.z - u.z, 1.8);
    }
  }
}

function updateProjectiles(state, dt) {
  const rng = state.rng;
  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    const p = state.projectiles[i];
    p.ttl -= dt;
    const tgt = unitByUid(state, p.targetUid);

    if (p.kind === 'rocket') {
      // 약한 유도 — 표적이 살아 있으면 방향을 살짝 튼다
      if (tgt && !tgt.dead) {
        const dx = tgt.x - p.x, dz = tgt.z - p.z;
        const dd = Math.hypot(dx, dz) || 1;
        p.vx += ((dx / dd) * p.speed - p.vx) * Math.min(1, dt * 3.2);
        p.vz += ((dz / dd) * p.speed - p.vz) * Math.min(1, dt * 3.2);
        const l = Math.hypot(p.vx, p.vz) || 1;
        p.vx = (p.vx / l) * p.speed; p.vz = (p.vz / l) * p.speed;
      }
    }
    p.x += p.vx * dt;
    p.z += p.vz * dt;

    // 명중 판정 (황금 알은 머리 위로 날아가 착탄 지점에서 터진다)
    let hitUnit = null;
    if (p.kind !== 'egg') {
      for (const e of state.units) {
        if (e.dead || e.team === p.team) continue;
        if (dist2(p.x, p.z, e.x, e.z) < (p.kind === 'rocket' ? 0.95 : 0.7)) { hitUnit = e; break; }
      }
    }
    const hitTarget = tgt && !tgt.dead && dist2(p.x, p.z, tgt.x, tgt.z) < 0.95;
    const outOfArena = Math.hypot(p.x, p.z) > TUNING.ARENA_RADIUS + 2.2;
    let obstacleHit = false;
    for (const ob of state.arena.obstacles) {
      if (dist2(p.x, p.z, ob.x, ob.z) < ob.r * 0.85) { obstacleHit = true; break; }
    }

    if (p.kind === 'rocket' || p.kind === 'egg') {
      const boom = p.ttl <= 0 || outOfArena || obstacleHit || (p.kind === 'rocket' && (hitUnit || hitTarget));
      if (boom) {
        explode(state, p, p.x, p.z);
        state.projectiles.splice(i, 1);
      }
    } else if (hitUnit || hitTarget) {
      const crit = rng() < (p.fromUid ? (unitByUid(state, p.fromUid)?.crit || 0.07) : 0.07);
      applyDamage(state, unitByUid(state, p.fromUid), hitUnit || tgt, p.dmg, { crit });
      emit(state, { type: 'bulletHit', x: p.x, y: p.y, z: p.z, color: p.color });
      state.projectiles.splice(i, 1);
    } else if (p.ttl <= 0 || outOfArena) {
      state.projectiles.splice(i, 1);
      emit(state, { type: 'projectileGone', x: p.x, z: p.z });
    }
  }
}

function explode(state, p, x, z) {
  state.stats.explosions++;
  emit(state, { type: 'explosion', x, y: 0.8, z, r: p.aoe || 2.6, color: p.color || 0xff8a4a, uid: p.fromUid });
  const src = unitByUid(state, p.fromUid);
  areaBurst(state, src, x, z, p.aoe || 2.6, p.dmg, 0.25, p.knock || 10, null, { launch: true });
}

/* ─────────────────────────────── 대시/돌진 ─────────────────────────────── */

function startDash(u, opts) {
  const state = u.battle;
  u.dash = {
    vx: opts.vx, vz: opts.vz, remain: opts.dist, total: opts.dist,
    width: opts.width || 1.5, dmg: opts.dmg, stun: opts.stun || 0,
    knock: opts.knock || 0, hit: new Set(), pierce: !!opts.pierce,
    kind: opts.kind, aoe: opts.aoe || 0, bleed: opts.bleed || 0, bleedTime: opts.bleedTime || 0,
    crit: !!opts.crit,
    land: opts.land || null, landStun: opts.landStun || 0, landKnock: opts.landKnock || 0,
    landPower: opts.landPower || 0,
    stopOnObstacle: opts.stopOnObstacle !== false,
  };
  u.ccImmune = opts.immune ? 0.6 : 0;
  u.invuln = opts.invuln ? 0.35 : 0;
  u.state = 'skill';
  emit(state, { type: 'dashStart', uid: u.uid, kind: opts.kind, x: u.x, z: u.z });
}

function updateDash(state, u, dt) {
  const dash = u.dash;
  const step = Math.hypot(dash.vx, dash.vz) * dt;
  const ax = u.x, az = u.z;
  const nx = u.x + dash.vx * dt, nz = u.z + dash.vz * dt;

  if (dash.stopOnObstacle) {
    for (const ob of state.arena.obstacles) {
      if (dist2(nx, nz, ob.x, ob.z) < ob.r + 0.7) {
        dash.remain = 0;
        u.x = ax; u.z = az;
        emit(state, { type: 'dashStop', uid: u.uid, x: u.x, z: u.z });
        return;
      }
    }
  }
  u.x = nx; u.z = nz;
  dash.remain -= step;
  u.facing = Math.atan2(dash.vx, dash.vz);

  for (const e of state.units) {
    if (e.dead || e.team === u.team || dash.hit.has(e.uid)) continue;
    const d = pointSegDist(e.x, e.z, ax, az, u.x, u.z);
    if (d <= dash.width + 0.55) {
      dash.hit.add(e.uid);
      applyDamage(state, u, e, dash.dmg, { pierce: dash.pierce, crit: !!dash.crit });
      knock(state, e, e.x - ax, e.z - az, dash.knock);
      if (dash.stun > 0) stunUnit(state, e, dash.stun);
      if (dash.bleed > 0) addBleed(state, e, u, dash.bleed, dash.bleedTime);
      emit(state, { type: 'dashHit', uid: u.uid, target: e.uid, x: e.x, z: e.z });
    }
  }

  if (dash.remain <= 0) {
    if (dash.kind === 'dive') {
      u.y = 0;
      areaBurst(state, u, u.x, u.z, dash.aoe || 2.2, dash.dmg * 0.5, 0.3, dash.knock * 0.5);
      emit(state, { type: 'diveLand', uid: u.uid, x: u.x, z: u.z });
    } else if (dash.land === 'tuskQuake') {
      // 매머드 — 들이받은 뒤 착지 지점에 지진 (높이 띄우고 주변 기절)
      const r = dash.aoe || 4.8;
      areaBurst(state, u, u.x, u.z, r, dash.dmg * (dash.landPower || 1.4), dash.landStun, dash.landKnock, null, { launch: true });
      emit(state, { type: 'tuskQuakeLand', uid: u.uid, x: u.x, z: u.z, r });
      emit(state, { type: 'quake', x: u.x, z: u.z, r, big: true });
    }
    u.dash = null;
    u.state = 'idle';
    u.castLock = 0.3;
  } else if (dash.kind === 'dive') {
    u.y = Math.max(0.4, 2.0 * (dash.remain / dash.total));
  }
}

function pointSegDist(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az;
  const wx = px - ax, wz = pz - az;
  const len2 = vx * vx + vz * vz;
  let t = len2 > 0 ? (wx * vx + wz * vz) / len2 : 0;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (ax + vx * t), pz - (az + vz * t));
}

function stunUnit(state, u, time) {
  if (u.dead || u.ccImmune > 0) return;
  u.stun = Math.max(u.stun, time);
  emit(state, { type: 'stun', uid: u.uid, time });
}

function slowUnit(state, u, factor, time) {
  if (u.dead || u.ccImmune > 0) return;
  u.slow = Math.max(u.slow, time);
  u.slowFactor = Math.max(u.slowFactor, factor);
  emit(state, { type: 'slow', uid: u.uid });
}

// 샌즈 — 근접 위협에서 잔상을 남기며 뒤로 순간이동한다
function tryBlink(state, u) {
  if (u.blinkCd > 0 || u.dash || u.stun > 0) return;
  let best = null, bd = Infinity;
  for (const e of state.units) {
    if (e.dead || e.team === u.team) continue;
    const dd = dist2(u.x, u.z, e.x, e.z);
    if (dd < bd) { bd = dd; best = e; }
  }
  if (!best || bd > 3.8) return;
  const ax = u.x - best.x, az = u.z - best.z;
  const l = Math.hypot(ax, az) || 1;
  let nx = u.x + (ax / l) * 6.2, nz = u.z + (az / l) * 6.2;
  const r = Math.hypot(nx, nz);
  const max = TUNING.ARENA_RADIUS - 2.5;
  if (r > max) { nx = (nx / r) * max; nz = (nz / r) * max; }
  emit(state, { type: 'blink', uid: u.uid, x: u.x, z: u.z, x2: nx, z2: nz });
  u.x = nx; u.z = nz;
  u.facing = Math.atan2(best.x - u.x, best.z - u.z);
  u.blinkCd = 3.6;
  u.invuln = Math.max(u.invuln, 0.3);
  u.dodgeBonus = Math.max(u.dodgeBonus, 0.3);
  u.dodgeT = Math.max(u.dodgeT, 0.35);
}

function areaBurst(state, u, x, z, radius, dmg, stun = 0, knockForce = 0, exclude = null, opts = {}) {
  emit(state, { type: 'burst', x, z, r: radius, uid: u ? u.uid : null, kind: u ? u.def.skill.kind : 'generic' });
  for (const e of state.units) {
    if (e.dead || e === u || e === exclude) continue;
    if (u && e.team === u.team) continue;
    const d = dist2(x, z, e.x, e.z);
    if (d <= radius + 0.5) {
      applyDamage(state, u, e, dmg, opts.pierce ? { pierce: true } : {});
      if (stun > 0) stunUnit(state, e, stun);
      if (knockForce > 0) knock(state, e, e.x - x, e.z - z, knockForce, { launch: opts.launch });
    }
  }
}

// 전방 부채꼴 범위 (티라노 턱 등)
function coneBurst(state, u, radius, spread, dmg, opts = {}) {
  emit(state, { type: 'burst', x: u.x, z: u.z, r: radius, uid: u.uid, kind: u.def.skill.kind });
  for (const e of state.units) {
    if (e.dead || e.team === u.team) continue;
    const d = dist2(u.x, u.z, e.x, e.z);
    if (d > radius + 0.6) continue;
    const ang = Math.atan2(e.x - u.x, e.z - u.z);
    if (Math.abs(shortenAngle(ang - u.facing)) > spread) continue;
    applyDamage(state, u, e, dmg, {});
    if (opts.stun) stunUnit(state, e, opts.stun);
    if (opts.knock) knock(state, e, e.x - u.x, e.z - u.z, opts.knock);
    if (opts.bleed) addBleed(state, e, u, opts.bleed, opts.bleedTime || 3);
  }
}

function countEnemiesIn(state, u, radius, cx = u.x, cz = u.z) {
  let n = 0;
  for (const e of state.units) {
    if (e.dead || e.team === u.team) continue;
    if (dist2(cx, cz, e.x, e.z) <= radius + 0.4) n++;
  }
  return n;
}

/* ─────────────────────────────── 스킬 ─────────────────────────────── */

/* ─────────── 세 가지 기술을 번갈아 쓰는 보스 (강하닭 · 샌즈) ─────────── */

function castChickenKit(state, u, target, s, k) {
  const rng = state.rng;
  const atk = u.atk;
  const tx = target ? target.x : u.x + Math.sin(u.facing) * 6;
  const tz = target ? target.z : u.z + Math.cos(u.facing) * 6;

  if (k.id === 'featherStorm') {
    // 적들 위로 황금·흰 깃털이 쏟아지며 광역 피해
    emit(state, { type: 'featherRain', uid: u.uid, x: tx, z: tz, r: k.radius });
    areaBurst(state, u, tx, tz, k.radius, atk * k.power, 0, 3, null, {});
    for (const e of state.units) {
      if (!e.dead && e.team !== u.team && dist2(tx, tz, e.x, e.z) <= k.radius + 0.5) {
        slowUnit(state, e, k.slow, k.slowTime);
      }
    }
    if (countEnemiesIn(state, u, k.radius * 0.85) > 0) {
      emit(state, { type: 'featherRain', uid: u.uid, x: u.x, z: u.z, r: k.radius * 0.85 });
      areaBurst(state, u, u.x, u.z, k.radius * 0.85, atk * k.power * 0.5, 0, 2);
    }
  } else if (k.id === 'beakSmash') {
    // 전방 넓은 범위를 내리찍어 기절 + 강넉백
    u.facing = Math.atan2(tx - u.x, tz - u.z);
    coneBurst(state, u, k.radius, Math.PI * 0.58, atk * k.power, { stun: k.stun, knock: k.knock });
    emit(state, { type: 'beakSlam', uid: u.uid, x: u.x, z: u.z, r: k.radius, ang: u.facing });
    emit(state, { type: 'quake', x: u.x, z: u.z, r: k.radius, big: true });
  } else if (k.id === 'eggBarrage') {
    // 황금 알 여러 개를 포물선으로 발사해 착탄 지점에서 광역 폭발
    const count = k.count || 4;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rng() * 0.8;
      const rr = 1.4 + rng() * 2.8;
      const ex = tx + Math.sin(a) * rr, ez = tz + Math.cos(a) * rr;
      const dx = ex - u.x, dz = ez - u.z;
      const dd = Math.hypot(dx, dz) || 1;
      const speed = 24;
      state.projectiles.push({
        pid: state.nextPid++, kind: 'egg', fromUid: u.uid, targetUid: null, team: u.team,
        x: u.x, y: 3.1, z: u.z,
        vx: (dx / dd) * speed, vz: (dz / dd) * speed, speed,
        dmg: atk * k.power, ttl: Math.min(2.6, dd / speed + 0.05),
        aoe: k.radius || 2.5, knock: k.knock || 9, color: 0xffd24a,
        x0: u.x, z0: u.z,
      });
    }
    state.stats.shots++;
    emit(state, { type: 'eggLaunch', uid: u.uid, x: u.x, z: u.z, tx, tz });
  }
  void s;
}

function castSansKit(state, u, target, s, k) {
  const rng = state.rng;
  const atk = u.atk;
  const tx = target ? target.x : u.x + Math.sin(u.facing) * 8;
  const tz = target ? target.z : u.z + Math.cos(u.facing) * 8;
  const ang = Math.atan2(tx - u.x, tz - u.z);

  if (k.id === 'gasterBlast') {
    // 샌즈 옆 공중에 해골 블래스트를 소환해 굵은 하늘색 레이저를 발사 (관통)
    const side = rng() < 0.5 ? 1 : -1;
    const bx = u.x + Math.sin(ang + Math.PI / 2) * 2.0 * side;
    const bz = u.z + Math.cos(ang + Math.PI / 2) * 2.0 * side;
    const len = 30;
    const ex = bx + Math.sin(ang) * len, ez = bz + Math.cos(ang) * len;
    emit(state, { type: 'gasterBlast', uid: u.uid, x: bx, z: bz, ang, len, tx, tz });
    state.stats.shots++;
    for (const e of state.units) {
      if (e.dead || e.team === u.team) continue;
      if (pointSegDist(e.x, e.z, bx, bz, ex, ez) <= (k.radius || 1.5)) {
        applyDamage(state, u, e, atk * k.power, { pierce: true, element: 'cyan' });
        knock(state, e, e.x - bx, e.z - bz, 3.5);
      }
    }
  } else if (k.id === 'boneBarrage') {
    // 날카로운 뼈 다발을 연사
    const count = k.count || 8;
    for (let i = 0; i < count; i++) {
      const spread = (i - (count - 1) / 2) * 0.075 + (rng() - 0.5) * 0.03;
      const a = ang + spread;
      const speed = 34 + i * 1.4;
      state.projectiles.push({
        pid: state.nextPid++, kind: 'bone', fromUid: u.uid, targetUid: null, team: u.team,
        x: u.x + Math.sin(a) * 0.7, y: u.y + 1.3, z: u.z + Math.cos(a) * 0.7,
        vx: Math.sin(a) * speed, vz: Math.cos(a) * speed, speed,
        dmg: atk * k.power, ttl: 0.95, aoe: 0, knock: 1.5,
        color: i % 3 === 0 ? 0x9ff4ff : 0xf2f7ff,
        x0: u.x, z0: u.z,
      });
    }
    state.stats.shots++;
    emit(state, { type: 'boneBarrage', uid: u.uid, x: u.x, z: u.z, ang, count });
  } else if (k.id === 'boneSpikes') {
    // 바닥에서 뼈 가시가 솟아오른다
    areaBurst(state, u, u.x, u.z, k.radius, atk * k.power, k.stun, 7);
    for (const e of state.units) {
      if (!e.dead && e.team !== u.team && dist2(u.x, u.z, e.x, e.z) <= k.radius + 0.5) {
        slowUnit(state, e, k.slow, k.slowTime);
      }
    }
    emit(state, { type: 'boneSpikes', uid: u.uid, x: u.x, z: u.z, r: k.radius });
  } else if (k.id === 'gasterHandPunch') {
    // 가스터손 펀치 — 손바닥에 검은 구멍이 뚫린 거대 해골 손 두 개가 번갈아/동시에 내려찍는다
    const pts = [];
    if (target) pts.push({ x: target.x, z: target.z });
    // 두 번째 손은 목표 외 다른 적을 노린다 (없으면 목표 주변)
    let second = null;
    let sd = Infinity;
    for (const e of state.units) {
      if (e.dead || e.team === u.team || e === target) continue;
      const dd = dist2(tx, tz, e.x, e.z);
      if (dd < sd) { sd = dd; second = e; }
    }
    if (second && sd <= (k.range || 12)) pts.push({ x: second.x, z: second.z });
    else if (target) pts.push({ x: tx + Math.sin(ang + Math.PI / 2) * 2.6, z: tz + Math.cos(ang + Math.PI / 2) * 2.6 });
    pts.forEach((pt, i) => {
      emit(state, { type: 'gasterHand', uid: u.uid, x: pt.x, z: pt.z, i, side: i % 2 === 0 ? 1 : -1, r: k.radius });
      areaBurst(state, u, pt.x, pt.z, k.radius, atk * k.power, k.stun, k.knock, null, { launch: true });
    });
    emit(state, { type: 'quake', x: pts[0] ? pts[0].x : tx, z: pts[0] ? pts[0].z : tz, r: k.radius, big: true });
    state.stats.shots++;
  } else if (k.id === 'rudeAttack') {
    // 불미스러운 공격 — 가운뎃손가락을 치켜든 픽셀 손들이 사방에 떠올라 적을 조준해 폭발한다
    const count = k.count || 5;
    const pool = state.units
      .filter((e) => !e.dead && e.team !== u.team && dist2(u.x, u.z, e.x, e.z) <= (k.range || 16))
      .sort((a, b) => dist2(tx, tz, a.x, a.z) - dist2(tx, tz, b.x, b.z))
      .slice(0, count);
    if (!pool.length && target) pool.push(target);
    pool.forEach((e, i) => {
      emit(state, { type: 'rudeAttack', uid: u.uid, x: e.x, z: e.z, i, count });
      const dmg = applyDamage(state, u, e, atk * k.power, { element: 'poison' });
      if (dmg > 0) {
        knock(state, e, e.x - u.x, e.z - u.z, 8, { launch: true });
        slowUnit(state, e, k.slow || 0.5, k.slowTime || 2.4);
      }
      if (dist2(e.x, e.z, tx, tz) < k.radius + 0.5) {
        areaBurst(state, u, e.x, e.z, k.radius * 0.8, atk * k.power * 0.35, 0, 4);
      }
    });
    if (target) {
      emit(state, {
        type: 'rudeText', uid: u.uid, x: tx, z: tz, text: '🖕 불미스러운 공격!',
      });
    }
    state.stats.shots++;
  }
  void s;
}

function skillReady(state, u) {
  return u.skillTimer <= 0 && !u.dash;
}

// 직접 조종에서 표적이 없을 때 쓰는 가상 표적 — 피해는 받지 않는다(invuln)
function dummyTarget(u) {
  return {
    uid: -1, team: null, dead: false,
    x: u.x + Math.sin(u.facing) * 5, z: u.z + Math.cos(u.facing) * 5, y: 0,
    vx: 0, vz: 0, vy: 0, spin: 0, spinVel: 0, facing: 0, aimYaw: 0, moving: false,
    hp: 1, maxHp: 1, atk: 0, spd: 0, range: 0, weapon: null, weaponId: 'none',
    ranged: false, armor: 0, armorBuff: 0, armorT: 0, kbResist: 0, evasion: 0,
    dodgeBonus: 0, dodgeT: 0, stun: 0, slow: 0, slowFactor: 1, ccImmune: 0,
    invuln: 99, castLock: 0, bleeding: [], bleedAccum: 0, bleedTick: 0,
    isStructure: false, possessed: false, deadTime: 0,
    def: { size: 1, skill: {}, hp: 1 }, dmgDealt: 0, dmgTaken: 0, kills: 0, skillCasts: 0,
    battle: u.battle,
  };
}

function tryCastSkill(state, u, target, d, opts = {}) {
  if (!u.def.skill || !skillReady(state, u)) return false;
  const s = u.def.skill;
  const rng = state.rng;
  // 강하닭·샌즈: 세 가지 기술을 순서대로 돌려 쓴다 (이번에 나갈 기술을 먼저 고른다)
  const kitSkill = s.kit && s.kit.length ? s.kit[(u.kitIndex || 0) % s.kit.length] : null;
  const castRange = kitSkill ? (kitSkill.range || s.range) : s.range;
  const castName = kitSkill ? kitSkill.name : s.name;

  if (opts.force) {
    // 직접 조종: 위치 조건은 무시하고 쿨타임만 확인한다.
    // 표적이 없으면 바라보는 방향의 가상 지점을 향해 기술을 쓴다.
    if (!target) {
      target = dummyTarget(u);
      d = 5;
    }
  } else switch (s.kind) {
    case 'featherStorm':
    case 'gasterBlast': {
      if (!target) return false;
      if (kitSkill && kitSkill.id === 'boneSpikes') {
        if (countEnemiesIn(state, u, castRange) < 1) return false;
      }
      if (d > castRange + 0.8) return false;
      break;
    }
    case 'roar':
    case 'slam':
    case 'smash':
    case 'titanSlam': {
      const r = s.radius || u.range;
      if (d > r + 1.2 || countEnemiesIn(state, u, r) < 1) return false;
      break;
    }
    case 'crunch': {
      if (d > s.range + 1.0 || countEnemiesIn(state, u, s.range) < 1) return false;
      break;
    }
    case 'pounce':
    case 'gore2':
    case 'packPounce':
    case 'sailSlash':
    case 'bloodFrenzy':
    case 'sneakStrike': {
      if (d < (s.minRange || 0.8) || d > s.range) return false;
      break;
    }
    case 'tidalJaw': {
      if (d > s.range || d < 2.0) return false;
      break;
    }
    case 'deepBite':
    case 'dragonBreath': {
      if (d > s.range + 0.7 || !target) return false;
      break;
    }
    case 'abyssVortex':
    case 'rockCrush': {
      const r = s.radius || u.range;
      if (d > r + 1.2 || countEnemiesIn(state, u, r) < 1) return false;
      break;
    }
    case 'charge':
    case 'gore':
    case 'hornCharge': {
      if (d > s.range || d < 2.2) return false;
      break;
    }
    case 'pack':
    case 'chomp':
    case 'dive':
    case 'flame':
    case 'infect':
    case 'frenzy':
    case 'boneSlash':
    case 'coil': {
      if (d > s.range || !target) return false;
      break;
    }
    case 'drexCombo': {
      if (d > s.range + 0.7 || !target) return false;
      break;
    }
    case 'tuskQuake': {
      if (d > s.range || d < 2.2) return false;
      break;
    }
    case 'tripleVenom': {
      if (d > s.range + 0.7 || !target) return false;
      break;
    }
    case 'kongQuake': {
      const r = s.radius || u.range;
      if (d > r + 1.2 || countEnemiesIn(state, u, r) < 1) return false;
      break;
    }
    case 'heroPunch': {
      if (!target || d > castRange + 1.0) return false;
      break;
    }
    case 'evade': {
      if (u.hp > u.maxHp * 0.82 && countEnemiesIn(state, u, 4.6) < 1) return false;
      break;
    }
    case 'sprint': break;
    default: return false;
  }

  u.skillTimer = s.cd * (0.92 + rng() * 0.16);
  u.skillCasts++;
  u.lastSkill = s.kind;
  u.kitPick = kitSkill;
  if (kitSkill) u.kitIndex = ((u.kitIndex || 0) + 1) % s.kit.length;
  u.state = 'skill';
  u.castLock = 0.4;
  state.stats.skills++;

  emit(state, { type: 'skill', uid: u.uid, kind: s.kind, name: castName, x: u.x, z: u.z, team: u.team });
  pushLog(state, { text: `${u.emoji} ${u.name} 「${castName}」`, team: u.team, kind: 'skill' });

  const dirX = target ? target.x - u.x : Math.sin(u.facing);
  const dirZ = target ? target.z - u.z : Math.cos(u.facing);
  const dirLen = Math.hypot(dirX, dirZ) || 1;

  switch (s.kind) {
    case 'featherStorm':
      castChickenKit(state, u, target, s, kitSkill);
      break;
    case 'gasterBlast':
      castSansKit(state, u, target, s, kitSkill);
      break;
    case 'roar': {
      areaBurst(state, u, u.x, u.z, s.radius, u.atk * s.power, s.stun, s.knock);
      u.dodgeBonus = 0.15; u.dodgeT = 0.6;
      break;
    }
    case 'slam': {
      areaBurst(state, u, u.x, u.z, s.radius, u.atk * s.power, 0, s.knock);
      for (const e of state.units) {
        if (!e.dead && e.team !== u.team && dist2(u.x, u.z, e.x, e.z) <= s.radius + 0.4) slowUnit(state, e, s.slow, s.slowTime);
      }
      break;
    }
    case 'smash': {
      areaBurst(state, u, u.x, u.z, s.radius, u.atk * s.power, s.stun, s.knock);
      emit(state, { type: 'quake', x: u.x, z: u.z, r: s.radius });
      break;
    }
    case 'titanSlam': {
      areaBurst(state, u, u.x, u.z, s.radius, u.atk * s.power, s.stun, s.knock, null, { launch: true });
      emit(state, { type: 'quake', x: u.x, z: u.z, r: s.radius, big: true });
      break;
    }
    case 'crunch': {
      coneBurst(state, u, s.radius, Math.PI * 0.46, u.atk * s.power, { stun: s.stun, knock: s.knock });
      emit(state, { type: 'tail', uid: u.uid, x: u.x, z: u.z });
      break;
    }
    case 'pounce': {
      const dist = Math.max(1.2, d - 1.3);
      startDash(u, {
        vx: ((target.x - u.x) / d) * 26, vz: ((target.z - u.z) / d) * 26,
        dist, width: 1.4, dmg: u.atk * s.power, bleed: s.bleed, bleedTime: s.bleedTime,
        knock: 3, kind: 'pounce', invuln: true,
      });
      u.dodgeBonus = 0.2; u.dodgeT = 0.55;
      break;
    }
    case 'packPounce': {
      const dist = Math.max(1.2, d - 1.0);
      startDash(u, {
        vx: ((target.x - u.x) / d) * 27, vz: ((target.z - u.z) / d) * 27,
        dist, width: 1.3, dmg: u.atk * s.power, bleed: s.bleed, bleedTime: s.bleedTime,
        knock: 2.5, kind: 'packPounce', invuln: true,
      });
      for (const a of aliveUnits(state, u.team)) {
        if (a !== u && dist2(a.x, a.z, u.x, u.z) <= 6.5) {
          haste(a, s.haste, s.hasteTime);
          emit(state, { type: 'buff', uid: a.uid, kind: 'haste' });
        }
      }
      break;
    }
    case 'charge':
    case 'gore':
    case 'hornCharge': {
      const dist = s.dash || 9;
      const fast = s.kind === 'gore' ? 19 : s.kind === 'hornCharge' ? 17 : 15;
      startDash(u, {
        vx: (dirX / dirLen) * fast,
        vz: (dirZ / dirLen) * fast,
        dist, width: s.width || 2.4, dmg: u.atk * s.power, stun: s.stun,
        knock: s.knock, kind: s.kind, immune: s.kind !== 'charge',
      });
      if (s.armorUp) {
        u.armorBuff = Math.max(u.armorBuff, s.armorUp);
        u.armorT = s.armorTime || 4;
      }
      emit(state, { type: 'quakeLine', x: u.x, z: u.z, dx: dirX / dirLen, dz: dirZ / dirLen, len: dist, kind: s.kind });
      break;
    }
    case 'gore2': {
      const dist = Math.min(s.dash || 6, Math.max(2, d - 0.5));
      startDash(u, {
        vx: (dirX / dirLen) * 17, vz: (dirZ / dirLen) * 17, dist,
        width: 1.3, dmg: u.atk * s.power, bleed: s.bleed, bleedTime: s.bleedTime,
        knock: s.knock, kind: 'gore2',
      });
      break;
    }
    case 'sailSlash': {
      const dist = Math.min(7, Math.max(2, d - 0.4));
      startDash(u, {
        vx: (dirX / dirLen) * 20, vz: (dirZ / dirLen) * 20, dist,
        width: 2.0, dmg: u.atk * s.power, bleed: s.bleed, bleedTime: s.bleedTime,
        knock: 4, kind: 'sailSlash', pierce: true,
      });
      u.armorBuff = Math.max(u.armorBuff, s.armorUp || 0.15);
      u.armorT = s.armorTime || 5;
      emit(state, { type: 'buff', uid: u.uid, kind: 'armor' });
      break;
    }
    case 'pack': {
      if (target) {
        applyDamage(state, u, target, u.atk * s.power, {});
        addBleed(state, target, u, s.bleed, s.bleedTime);
        knock(state, target, target.x - u.x, target.z - u.z, 2);
      }
      for (const a of aliveUnits(state, u.team)) {
        if (dist2(a.x, a.z, u.x, u.z) <= 7.5 || a === u) {
          haste(a, s.haste, s.hasteTime);
          emit(state, { type: 'buff', uid: a.uid, kind: 'haste' });
        }
      }
      emit(state, { type: 'aura', uid: u.uid, r: 7.5, kind: 'pack' });
      break;
    }
    case 'chomp': {
      if (target) {
        applyDamage(state, u, target, u.atk * s.power, { pierce: s.pierce });
        addBleed(state, target, u, s.bleed, 3.5);
        knock(state, target, target.x - u.x, target.z - u.z, 1.5);
        emit(state, { type: 'chomp', uid: u.uid, target: target.uid, x: target.x, z: target.z });
      }
      u.armorBuff = Math.max(u.armorBuff, s.armorUp);
      u.armorT = s.armorTime;
      emit(state, { type: 'buff', uid: u.uid, kind: 'armor' });
      break;
    }
    case 'flame': {
      // 대상 지점에 화염을 뿌린다
      const fx = target ? target.x : u.x + (dirX / dirLen) * s.range * 0.7;
      const fz = target ? target.z : u.z + (dirZ / dirLen) * s.range * 0.7;
      emit(state, { type: 'flame', uid: u.uid, x: u.x, z: u.z, tx: fx, tz: fz, r: s.radius, color: 0xff7a3a });
      areaBurst(state, u, fx, fz, s.radius, u.atk * s.power, 0, s.knock);
      for (const e of state.units) {
        if (e.dead || e.team === u.team) continue;
        if (dist2(fx, fz, e.x, e.z) <= s.radius + 0.5) addBleed(state, e, u, s.burn, s.burnTime);
      }
      break;
    }
    case 'infect': {
      if (target) {
        applyDamage(state, u, target, u.atk * s.power, {});
        addBleed(state, target, u, s.bleed, s.bleedTime);
        slowUnit(state, target, s.slow, s.slowTime);
      }
      u.hp = Math.min(u.maxHp, u.hp + (s.heal || 0));
      emit(state, { type: 'heal', uid: u.uid, x: u.x, z: u.z, amount: s.heal || 0 });
      break;
    }
    case 'boneSlash': {
      if (target) {
        for (let i = 0; i < (s.strikes || 3); i++) {
          applyDamage(state, u, target, u.atk * s.power, { pierce: !!s.pierce });
          emit(state, { type: 'slash', uid: u.uid, target: target.uid, x: target.x, z: target.z, i });
        }
        knock(state, target, target.x - u.x, target.z - u.z, 2);
      }
      break;
    }
    case 'coil': {
      if (target) {
        applyDamage(state, u, target, u.atk * s.power, {});
        addBleed(state, target, u, s.bleed, s.bleedTime);
        stunUnit(state, target, s.stun);
        emit(state, { type: 'coil', uid: u.uid, target: target.uid, x: target.x, z: target.z });
      }
      break;
    }
    case 'frenzy': {
      if (target) {
        applyDamage(state, u, target, u.atk * s.power, {});
        addBleed(state, target, u, s.bleed, s.bleedTime);
        knock(state, target, target.x - u.x, target.z - u.z, 2.4);
      }
      for (const a of aliveUnits(state, u.team)) {
        if (a === u || dist2(a.x, a.z, u.x, u.z) <= 9) {
          haste(a, s.haste, s.hasteTime);
          emit(state, { type: 'buff', uid: a.uid, kind: 'haste' });
        }
      }
      emit(state, { type: 'aura', uid: u.uid, r: 9, kind: 'frenzy' });
      break;
    }
    case 'drexCombo': {
      // 1타: 거대한 턱으로 물어뜯기
      coneBurst(state, u, s.radius * 0.72, Math.PI * 0.5, u.atk * s.power, { stun: s.stun, knock: s.knock * 0.5 });
      // 2타: 주먹을 내리치는 광역 강타
      areaBurst(state, u, u.x, u.z, s.radius, u.atk * s.power2, s.stun * 0.6, s.knock, null, { launch: true });
      emit(state, { type: 'quake', x: u.x, z: u.z, r: s.radius, big: true });
      emit(state, { type: 'drexCombo', uid: u.uid, x: u.x, z: u.z });
      break;
    }
    case 'dive': {
      const dist = Math.max(1.5, d - 1.2);
      startDash(u, {
        vx: (dirX / dirLen) * 24, vz: (dirZ / dirLen) * 24, dist,
        width: 1.2, dmg: u.atk * s.power, aoe: s.radius, knock: s.knock,
        kind: 'dive', stopOnObstacle: false, invuln: true,
      });
      u.y = 1.8;
      emit(state, { type: 'takeoff', uid: u.uid, x: u.x, z: u.z });
      break;
    }
    case 'bloodFrenzy': {
      const dist = Math.min(s.dash || 7.5, Math.max(2, d - 0.5));
      startDash(u, {
        vx: (dirX / dirLen) * 18, vz: (dirZ / dirLen) * 18, dist,
        width: 1.35, dmg: u.atk * s.power, bleed: s.bleed, bleedTime: s.bleedTime,
        knock: 3.5, kind: 'bloodFrenzy',
      });
      haste(u, s.haste || 0.3, s.hasteTime || 4);
      emit(state, { type: 'buff', uid: u.uid, kind: 'haste' });
      break;
    }
    case 'deepBite': {
      const before = state.stats.hits;
      coneBurst(state, u, s.range, Math.PI * 0.5, u.atk * s.power, { stun: s.stun, knock: s.knock });
      const bites = Math.max(1, Math.min(3, state.stats.hits - before));
      const heal = Math.round(u.atk * s.power * (s.lifesteal || 0.3) * bites);
      u.hp = Math.min(u.maxHp, u.hp + heal);
      emit(state, { type: 'heal', uid: u.uid, x: u.x, z: u.z, amount: heal });
      emit(state, { type: 'chomp', uid: u.uid, target: target ? target.uid : null, x: target ? target.x : u.x, z: target ? target.z : u.z });
      break;
    }
    case 'tidalJaw': {
      const dist = Math.min(s.dash || 8, Math.max(2.5, d - 1.0));
      startDash(u, {
        vx: (dirX / dirLen) * 18, vz: (dirZ / dirLen) * 18, dist,
        width: s.width || 2.9, dmg: u.atk * s.power, stun: s.stun,
        knock: s.knock, kind: 'tidalJaw', aoe: (s.width || 2.9) * 1.2,
      });
      emit(state, { type: 'tidalWave', uid: u.uid, x: u.x, z: u.z, dx: dirX / dirLen, dz: dirZ / dirLen, len: dist, w: s.width || 2.9 });
      break;
    }
    case 'abyssVortex': {
      areaBurst(state, u, u.x, u.z, s.radius, u.atk * s.power, 0, s.knock, null, { launch: true });
      for (const e of state.units) {
        if (!e.dead && e.team !== u.team && dist2(u.x, u.z, e.x, e.z) <= s.radius + 0.5) slowUnit(state, e, s.slow, s.slowTime);
      }
      emit(state, { type: 'vortex', uid: u.uid, x: u.x, z: u.z, r: s.radius });
      break;
    }
    case 'rockCrush': {
      areaBurst(state, u, u.x, u.z, s.radius, u.atk * s.power, s.stun, s.knock);
      emit(state, { type: 'rockCrush', uid: u.uid, x: u.x, z: u.z, r: s.radius });
      emit(state, { type: 'quake', x: u.x, z: u.z, r: s.radius, big: true });
      break;
    }
    case 'dragonBreath': {
      const fx = target ? target.x : u.x + (dirX / dirLen) * s.range * 0.6;
      const fz = target ? target.z : u.z + (dirZ / dirLen) * s.range * 0.6;
      emit(state, { type: 'flame', uid: u.uid, x: u.x, z: u.z, tx: fx, tz: fz, r: 3.6, color: 0xff5a1a });
      coneBurst(state, u, s.range, s.spread || 0.62, u.atk * s.power, { knock: s.knock, bleed: s.burn, bleedTime: s.burnTime });
      break;
    }
    case 'sneakStrike': {
      const dist = Math.min(s.dash || 6.5, Math.max(1.5, d - 0.4));
      startDash(u, {
        vx: (dirX / dirLen) * 19, vz: (dirZ / dirLen) * 19, dist,
        width: 1.2, dmg: u.atk * s.power, bleed: s.bleed, bleedTime: s.bleedTime,
        knock: 2, kind: 'sneakStrike', crit: !!s.crit,
      });
      break;
    }
    case 'tuskQuake': {
      // 매머드 — 긴 엄니로 전방을 들이받고 착지 지점에 지진
      const dist = Math.min(s.dash || 9.5, Math.max(3, d - 1.0));
      startDash(u, {
        vx: (dirX / dirLen) * 20, vz: (dirZ / dirLen) * 20, dist,
        width: s.width || 2.7, dmg: u.atk * s.power * 0.7, stun: s.stun * 0.5,
        knock: s.knock * 0.55, kind: 'tuskQuake', aoe: s.radius,
        land: 'tuskQuake', landStun: s.stun, landKnock: s.knock, landPower: 1.35,
      });
      emit(state, { type: 'quakeLine', x: u.x, z: u.z, dx: dirX / dirLen, dz: dirZ / dirLen, len: dist, kind: 'tuskQuake' });
      break;
    }
    case 'tripleVenom': {
      // 히드라 — 세 머리가 동시에 초록·보라 맹독을 뿜는다
      if (target) u.facing = Math.atan2(target.x - u.x, target.z - u.z);
      const lanes = [-1, 0, 1];
      const spread = s.spread || 0.34;
      for (const lane of lanes) {
        const a = u.facing + lane * spread;
        emit(state, { type: 'tripleVenom', uid: u.uid, x: u.x, z: u.z, ang: a, lane, r: s.range });
        for (const e of state.units) {
          if (e.dead || e.team === u.team) continue;
          const dd = dist2(u.x, u.z, e.x, e.z);
          if (dd > s.range + 0.6) continue;
          const ea = Math.atan2(e.x - u.x, e.z - u.z);
          const tol = 0.16 + 0.4 / Math.max(3, dd);
          if (Math.abs(shortenAngle(ea - a)) > tol) continue;
          applyDamage(state, u, e, u.atk * s.power * 0.95, { element: 'poison' });
          addBleed(state, e, u, s.bleed, s.bleedTime);
          slowUnit(state, e, s.slow, s.slowTime);
        }
      }
      break;
    }
    case 'kongQuake': {
      // 킹콩 — 가슴을 두드려 포효한 뒤 양 주먹으로 땅을 내리찍는다
      emit(state, { type: 'chestBeat', uid: u.uid, x: u.x, z: u.z });
      areaBurst(state, u, u.x, u.z, s.radius, u.atk * s.power, s.stun, s.knock, null, { launch: true });
      emit(state, { type: 'quake', x: u.x, z: u.z, r: s.radius, big: true });
      break;
    }
    case 'heroPunch': {
      // 영웅 — 강력펀치 · 연속펀치 · 어퍼컷을 돌려 쓴다
      const hk = kitSkill || s;
      const style = hk.id || 'powerPunch';
      if (!target) break;
      u.facing = Math.atan2(target.x - u.x, target.z - u.z);
      if (style === 'rapidPunch') {
        const strikes = hk.strikes || 7;
        let landed = 0;
        const comboTx = target.x;
        const comboTz = target.z;
        for (let i = 0; i < strikes; i++) {
          if (!target || target.dead) break;
          emit(state, { type: 'heroStrike', uid: u.uid, x: target.x, z: target.z, i, style: 'rapid' });
          applyDamage(state, u, target, u.atk * hk.power, {});
          landed++;
        }
        // 주변 적에게도 파편 피해
        coneBurst(state, u, hk.radius, Math.PI * 0.5, u.atk * hk.power * 1.6, { knock: 3 });
        emit(state, { type: 'heroCombo', uid: u.uid, x: comboTx, z: comboTz, count: landed });
      } else if (style === 'uppercut') {
        applyDamage(state, u, target, u.atk * hk.power, {});
        stunUnit(state, target, hk.stun || 1.2);
        knock(state, target, target.x - u.x, target.z - u.z, hk.knock || 10, { launch: true });
        target.vy = Math.max(target.vy, 9.5);
        emit(state, { type: 'heroStrike', uid: u.uid, x: target.x, z: target.z, i: 0, style: 'uppercut' });
        emit(state, { type: 'quake', x: u.x, z: u.z, r: hk.radius || 3, big: false });
      } else {
        applyDamage(state, u, target, u.atk * hk.power, {});
        knock(state, target, target.x - u.x, target.z - u.z, hk.knock || 20, { launch: true });
        if (hk.stun) stunUnit(state, target, hk.stun);
        areaBurst(state, u, target.x, target.z, (hk.radius || 3) * 0.7, u.atk * hk.power * 0.3, 0, 4);
        emit(state, { type: 'heroStrike', uid: u.uid, x: target.x, z: target.z, i: 0, style: 'power' });
      }
      break;
    }
    case 'evade': {
      u.dodgeBonus = s.dodge; u.dodgeT = s.dodgeTime;
      haste(u, s.haste, s.hasteTime);
      emit(state, { type: 'buff', uid: u.uid, kind: 'dodge' });
      break;
    }
    case 'sprint': {
      u.speedMul = Math.max(u.speedMul, s.speed);
      u.speedT = Math.max(u.speedT, s.speedTime);
      haste(u, s.haste, s.hasteTime);
      emit(state, { type: 'buff', uid: u.uid, kind: 'sprint' });
      break;
    }
    default: break;
  }
  return true;
}

/* ──────────────────────────── 전장 아이템 (구조물) ────────────────────────────
   지뢰 · 자동 포탑 · 테슬라 코일 · 치유 토템 · 가시 바리케이드.
   모두 spd 0 · knockResist 1.0 으로 제자리에 고정되고, 자기 기능만 주기적으로 한다.  */

function nearestEnemyTo(state, u, range, x = u.x, z = u.z) {
  let best = null, bd = range;
  for (const e of state.units) {
    if (e.dead || e.team === u.team) continue;
    const d = dist2(x, z, e.x, e.z);
    if (d <= bd) { bd = d; best = e; }
  }
  return best;
}

// 포탑 기관총 — 표적을 향해 탄환을 발사한다 (기존 투사체 경로를 그대로 쓴다)
function fireTurretShot(state, u, t) {
  const rng = state.rng;
  u.attackTimer = intervalFor(u);
  u.castLock = Math.max(u.castLock, 0.06);
  u.hitsLanded++;
  u.aimYaw = Math.atan2(t.x - u.x, t.z - u.z);
  u.targetId = t.uid;
  const speed = 38;
  const dx = t.x - u.x, dz = t.z - u.z;
  const dd = Math.hypot(dx, dz) || 1;
  const sx = u.x + Math.sin(u.aimYaw) * 0.55;
  const sz = u.z + Math.cos(u.aimYaw) * 0.55;
  state.projectiles.push({
    pid: state.nextPid++, kind: 'bullet', fromUid: u.uid, targetUid: t.uid, team: u.team,
    x: sx, y: u.y + 1.85, z: sz,
    vx: (dx / dd) * speed, vz: (dz / dd) * speed, speed,
    dmg: u.atk * (0.9 + rng() * 0.2), ttl: Math.min(2.0, dd / speed + 0.3),
    aoe: 0, knock: 0.5, color: 0xffe08a, x0: u.x, z0: u.z,
  });
  state.stats.shots++;
  emit(state, {
    type: 'shot', uid: u.uid, kind: 'bullet', x: sx, y: u.y + 1.85, z: sz,
    tx: t.x, tz: t.z, color: 0xffe08a,
  });
}

// 포탑 폭발 포격 — 유도 포탄이 착탄 지점에서 광역 폭발
function fireTurretShell(state, u, t) {
  const s = u.def.skill;
  const speed = 17;
  const dx = t.x - u.x, dz = t.z - u.z;
  const dd = Math.hypot(dx, dz) || 1;
  state.projectiles.push({
    pid: state.nextPid++, kind: 'rocket', fromUid: u.uid, targetUid: t.uid, team: u.team,
    x: u.x, y: u.y + 1.9, z: u.z,
    vx: (dx / dd) * speed, vz: (dz / dd) * speed, speed,
    dmg: u.atk * s.power, ttl: Math.min(2.2, dd / speed + 0.4),
    aoe: s.radius, knock: s.knock, color: 0xffa040, x0: u.x, z0: u.z,
  });
  state.stats.shots++;
  emit(state, {
    type: 'shot', uid: u.uid, kind: 'rocket', x: u.x, y: u.y + 1.9, z: u.z,
    tx: t.x, tz: t.z, color: 0xffa040,
  });
}

// 지뢰 기폭 — 광역 피해 + 강넉백 + 기절, 그리고 스스로 사라진다(1회용)
function detonateMine(state, u) {
  const s = u.def.skill;
  state.stats.explosions++;
  emit(state, {
    type: 'explosion', x: u.x, y: 0.6, z: u.z, r: s.radius, color: 0xff8a4a, uid: u.uid,
  });
  emit(state, { type: 'quake', x: u.x, z: u.z, r: s.radius, big: true });
  areaBurst(state, u, u.x, u.z, s.radius, u.atk * s.power, s.stun, s.knock, null, { launch: true });
  killUnit(state, u, null, 0, { selfDestruct: true });
}

function actStructure(state, u, dt) {
  u.moving = false;
  u.state = u.castLock > 0 ? 'attack' : 'ready';
  const def = u.def;
  const s = def.skill;

  if (def.id === 'landmine') {
    if (state.time - (u.spawnTime || 0) < 0.6) return;   // 매설(무장) 시간
    const trigger = nearestEnemyTo(state, u, s.range);
    if (!trigger) return;
    u.facing = Math.atan2(trigger.x - u.x, trigger.z - u.z);
    u.aimYaw = u.facing;
    u.targetId = trigger.uid;
    detonateMine(state, u);
    return;
  }

  if (def.id === 'turret') {
    const t = nearestEnemyTo(state, u, def.range);
    if (!t) { u.targetId = null; return; }
    u.targetId = t.uid;
    // 받침은 고정, 포신(aimYaw)만 목표를 향해 돈다
    const aim = Math.atan2(t.x - u.x, t.z - u.z);
    u.aimYaw = shortenAngle(u.aimYaw + shortenAngle(aim - u.aimYaw) * Math.min(1, dt * 7));
    if (u.attackTimer <= 0) fireTurretShot(state, u, t);
    if (u.shellTimer <= 0) {
      u.shellTimer = s.cd * (0.9 + state.rng() * 0.2);
      fireTurretShell(state, u, t);
    }
    return;
  }

  if (def.id === 'tesla_coil') {
    if (u.actTimer > 0) return;
    u.actTimer = s.cd;
    const pool = [];
    for (const e of state.units) {
      if (e.dead || e.team === u.team) continue;
      const d = dist2(u.x, u.z, e.x, e.z);
      if (d <= s.range) pool.push({ e, d });
    }
    if (!pool.length) return;
    pool.sort((a, b) => a.d - b.d);
    const hit = pool.slice(0, s.chain || 4);
    u.state = 'attack';
    u.castLock = Math.max(u.castLock, 0.3);
    state.stats.skills++;
    for (const { e } of hit) {
      u.targetId = e.uid;
      u.facing = Math.atan2(e.x - u.x, e.z - u.z);
      applyDamage(state, u, e, u.atk * s.power, { element: 'electric' });
      slowUnit(state, e, s.slow, s.slowTime);
      emit(state, {
        type: 'chainLightning', uid: u.uid, x: u.x, y: u.y + 2.4, z: u.z,
        x2: e.x, y2: e.y + 1.0, z2: e.z,
      });
    }
    return;
  }

  if (def.id === 'healing_totem') {
    if (u.actTimer > 0) return;
    u.actTimer = s.cd;
    u.state = 'skill';
    u.castLock = Math.max(u.castLock, 0.25);
    emit(state, { type: 'healPulse', uid: u.uid, x: u.x, z: u.z, r: s.radius });
    for (const a of state.units) {
      if (a.dead || a.team !== u.team || a === u) continue;
      if (dist2(u.x, u.z, a.x, a.z) > s.radius) continue;
      const before = a.hp;
      a.hp = Math.min(a.maxHp, a.hp + s.heal);
      const amount = Math.round(a.hp - before);
      if (amount > 0) emit(state, { type: 'heal', uid: a.uid, x: a.x, z: a.z, amount });
    }
    return;
  }

  if (def.id === 'spike_barricade') {
    if (u.actTimer > 0) return;
    u.actTimer = s.cd;
    let any = false;
    for (const e of state.units) {
      if (e.dead || e.team === u.team) continue;
      if (dist2(u.x, u.z, e.x, e.z) > s.range + 0.6) continue;
      any = true;
      u.targetId = e.uid;
      u.facing = Math.atan2(e.x - u.x, e.z - u.z);
      applyDamage(state, u, e, u.atk * (0.9 + state.rng() * 0.2), {});
      knock(state, e, e.x - u.x, e.z - u.z, s.knock || 3);
      emit(state, { type: 'spikeHit', uid: u.uid, x: e.x, z: e.z });
    }
    if (any) { u.state = 'attack'; u.castLock = Math.max(u.castLock, 0.2); }
  }
}

/* ─────────────────────────── 유닛 직접 조종 (Possession) ─────────────────────────── */

export function possessUnit(state, uid, ownerPid = null) {
  if (!state) return null;
  const u = unitByUid(state, uid);
  if (!u || u.dead || u.isStructure) return null;
  for (const o of state.units) {
    if (o !== u && o.possessed) { o.possessed = false; o.input = null; o.ownerPid = null; }
  }
  u.possessed = true;
  u.ownerPid = ownerPid;
  u.input = { mx: 0, mz: 0, atk: false, sk: false, yaw: u.facing };
  u.targetId = null;
  state.possessedUid = u.uid;
  return u;
}

export function releasePossession(state, uid = null) {
  if (!state) return;
  for (const o of state.units) {
    if (!o.possessed) continue;
    if (uid != null && o.uid !== uid) continue;
    o.possessed = false;
    o.input = null;
    o.ownerPid = null;
  }
  if (uid == null || state.possessedUid === uid) state.possessedUid = null;
}

export function possessedUnit(state) {
  if (!state) return null;
  return state.units.find((u) => u.possessed && !u.dead) || null;
}

export function setUnitInput(u, input) {
  if (!u) return;
  u.input = { ...(u.input || {}), ...(input || {}) };
}

function actPossessed(state, u, dt) {
  const inp = u.input || {};
  let mx = clamp(Number(inp.mx) || 0, -1, 1);
  let mz = clamp(Number(inp.mz) || 0, -1, 1);
  const inLen = Math.hypot(mx, mz);
  if (inLen > 1) { mx /= inLen; mz /= inLen; }
  const yaw = Number.isFinite(inp.yaw) ? inp.yaw : u.facing;
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  // yaw 는 카메라가 보는 방향 — 앞으로(mz) · 옆으로(mx)
  const wx = fx * mz - fz * mx;
  const wz = fz * mz + fx * mx;
  const wlen = Math.hypot(wx, wz);

  if (wlen > 0.06) {
    const speed = unitSpeed(u, state) * (u.castLock > 0 ? 0.55 : 1);
    u.x += (wx / wlen) * speed * dt;
    u.z += (wz / wlen) * speed * dt;
    u.moving = true;
    u.state = 'chase';
    const want = Math.atan2(wx, wz);
    u.facing = shortenAngle(u.facing + shortenAngle(want - u.facing) * Math.min(1, dt * 14));
    u.aimYaw = u.facing;
  } else if (u.castLock <= 0) {
    u.facing = shortenAngle(u.facing + shortenAngle(yaw - u.facing) * Math.min(1, dt * 12));
    u.aimYaw = u.facing;
    u.state = 'ready';
  }

  // 스킬 — 쿨타임이 남아 있으면 발동하지 않는다
  if (inp.sk) {
    const s = u.def.skill;
    const reach = Math.max(u.range, (s && s.range) || 0, 10);
    const t = nearestEnemyTo(state, u, reach);
    if (tryCastSkill(state, u, t, t ? dist2(u.x, u.z, t.x, t.z) : 999, { force: true })) {
      u.castLock = Math.max(u.castLock, 0.2);
    }
  }

  // 기본 공격 — 가까운 적이 없으면 바라보는 방향으로 휘두른다
  if (inp.atk && !u.dash && u.attackTimer <= 0) {
    const t = nearestEnemyTo(state, u, u.range + 0.6);
    if (t) {
      u.targetId = t.uid;
      doAttack(state, u, t);
    } else {
      u.attackTimer = intervalFor(u) * 0.5;
      u.castLock = Math.max(u.castLock, 0.14);
      u.hitsLanded++;
      emit(state, { type: 'attack', uid: u.uid, target: null, ranged: !!u.def.ranged, weapon: u.weaponId });
    }
  }
}

/* ───────────────────────────────── 틱 ───────────────────────────────── */

function tickEffects(state, u, dt) {
  if (u.stun > 0) u.stun = Math.max(0, u.stun - dt);
  if (u.slow > 0) { u.slow = Math.max(0, u.slow - dt); if (u.slow <= 0) u.slowFactor = 1; }
  if (u.hasteT > 0) { u.hasteT -= dt; if (u.hasteT <= 0) u.haste = 0; }
  if (u.speedT > 0) { u.speedT -= dt; if (u.speedT <= 0) u.speedMul = 1; }
  if (u.armorT > 0) { u.armorT -= dt; if (u.armorT <= 0) u.armorBuff = 0; }
  if (u.dodgeT > 0) { u.dodgeT -= dt; if (u.dodgeT <= 0) u.dodgeBonus = 0; }
  if (u.ccImmune > 0) u.ccImmune = Math.max(0, u.ccImmune - dt);
  if (u.invuln > 0) u.invuln = Math.max(0, u.invuln - dt);
  if (u.castLock > 0) u.castLock = Math.max(0, u.castLock - dt);
  if (u.blinkCd > 0) u.blinkCd = Math.max(0, u.blinkCd - dt);
  if (u.attackTimer > 0) u.attackTimer = Math.max(0, u.attackTimer - dt);
  if (u.skillTimer > 0) u.skillTimer = Math.max(0, u.skillTimer - dt);
  if (u.actTimer > 0) u.actTimer = Math.max(0, u.actTimer - dt);
  if (u.shellTimer > 0) u.shellTimer = Math.max(0, u.shellTimer - dt);

  // 출혈
  if (u.bleeding.length) {
    let total = 0;
    for (const b of u.bleeding) { b.t -= dt; total += b.dps; }
    u.bleeding = u.bleeding.filter((b) => b.t > 0);
    if (total > 0) {
      u.hp -= total * dt;
      u.dmgTaken += total * dt;
      u.bleedAccum += total * dt;
      u.bleedTick += dt;
      if (u.bleedTick >= TUNING.BLEED_TICK) {
        u.bleedTick = 0;
        const n = Math.round(u.bleedAccum * 10) / 10;
        u.bleedAccum = 0;
        emit(state, { type: 'hit', uid: u.uid, by: null, dmg: n, dot: true, x: u.x, y: u.y + 1.0, z: u.z });
      }
      if (u.hp <= 0) killUnit(state, u, unitByUid(state, u.lastHitFrom));
    }
  }

  // 넉백 + 공중 회전(래그돌)
  if (Math.abs(u.vx) > 0.01 || Math.abs(u.vz) > 0.01) {
    u.x += u.vx * dt;
    u.z += u.vz * dt;
    const decay = Math.exp(-TUNING.KNOCK_DECAY * dt);
    u.vx *= decay; u.vz *= decay;
    if (Math.abs(u.vx) < 0.05) u.vx = 0;
    if (Math.abs(u.vz) < 0.05) u.vz = 0;
  }
  if (u.vy !== 0 || u.y > 0) {
    u.vy -= 38 * dt;
    u.y += u.vy * dt;
    if (u.y <= 0) {
      u.y = 0;
      if (u.vy < -3.5) emit(state, { type: 'land', uid: u.uid, x: u.x, z: u.z, force: -u.vy });
      u.vy = 0;
      u.spinVel *= 0.35;
    }
  }
  if (!u.dead && Math.abs(u.spinVel) > 0.05 && u.y > 0) {
    u.spin += u.spinVel * dt;
  } else if (!u.dead) {
    u.spin *= Math.max(0, 1 - dt * 6);
    u.spinVel *= Math.max(0, 1 - dt * 3);
  }
}

function actUnit(state, u, dt) {
  if (u.dash) { updateDash(state, u, dt); return; }
  if (u.stun > 0) { u.state = 'stun'; return; }
  // 플레이어가 직접 조종하는 유닛은 AI 이동·자동 공격을 멈춘다
  if (u.possessed) { actPossessed(state, u, dt); return; }
  // 전장 아이템(구조물)은 제자리에서 자기 기능만 한다
  if (u.isStructure) { actStructure(state, u, dt); return; }

  const target = ensureTarget(state, u);
  // 샌즈: 근접 위협을 받으면 잔상을 남기며 뒤로 순간이동
  if (u.def.blink) tryBlink(state, u);
  if (!target) { u.state = 'idle'; return; }
  const d = dist2(u.x, u.z, target.x, target.z);
  const desired = Math.atan2(target.x - u.x, target.z - u.z);
  u.facing = shortenAngle(u.facing + shortenAngle(desired - u.facing) * Math.min(1, dt * 9));

  if (u.castLock <= 0 && tryCastSkill(state, u, target, d)) return;

  if (u.castLock > 0) {
    u.state = 'attack';
    u.moving = false;
    return;
  }

  if (d <= u.range && u.attackTimer <= 0) {
    u.state = 'attack';
    doAttack(state, u, target);
    return;
  }

  const speed = unitSpeed(u, state);
  if (u.ranged) {
    if (d < u.range * 0.4) { moveAway(state, u, target.x, target.z, speed, dt); u.state = 'retreat'; }
    else if (d > u.range * 0.95) { steerMove(state, u, target.x, target.z, speed, dt, u.range * 0.9); u.state = 'chase'; }
    else {
      const perp = desired + Math.PI / 2;
      steerMove(state, u, u.x + Math.sin(perp) * 3, u.z + Math.cos(perp) * 3, speed * 0.5, dt);
      u.state = 'strafe';
    }
  } else {
    if (d > u.range * 0.86) {
      steerMove(state, u, target.x, target.z, speed, dt, u.range * 0.82);
      u.state = 'chase';
    } else {
      u.state = 'ready';
      u.moving = false;
    }
  }
}

export function step(state, dt) {
  if (state.over) return state;
  const h = Math.min(dt, 0.05);
  state.time += h;

  for (const u of state.units) {
    if (u.dead) { tickDead(u, h); continue; }
    u.moving = false;
    tickEffects(state, u, h);
  }
  updateProjectiles(state, h);
  for (const u of state.units) {
    if (u.dead) continue;
    actUnit(state, u, h);
    resolveCollisions(state, u);
  }

  // ── 승패: 마지막까지 살아남은 진영 하나 (2~4팀 공통) ──
  const teams = state.teams || ['blue', 'red'];
  const standing = [];
  for (const t of teams) {
    const n = aliveCount(state, t);
    if (n > 0) standing.push(t);
    else if (!state.teamOut.includes(t)) {
      state.teamOut.push(t);
      if (state.time > 0.2 && (state.sides[t] || 0) > 0) {
        pushLog(state, { text: `${teamDef(t).emoji} ${teamName(t)} 팀 전멸`, kind: 'death', team: t });
      }
    }
  }
  if (standing.length <= 1) {
    state.over = true;
    state.winner = standing.length === 1 ? standing[0] : 'draw';
    state.endReason = 'elimination';
    finish(state);
  } else if (state.time >= state.maxTime) {
    const ranked = standing
      .map((t) => ({ t, r: teamHpRatio(state, t) }))
      .sort((a, b) => b.r - a.r);
    const top = ranked[0];
    const second = ranked[1];
    state.over = true;
    state.endReason = 'timeout';
    state.winner = !top ? 'draw'
      : (second && Math.abs(top.r - second.r) < 0.03) ? 'draw' : top.t;
    finish(state);
  }
  return state;
}

function tickDead(u, dt) {
  // 죽은 유닛은 다시는 돌지 않는다 (쓰러진 자세 그대로 정지)
  u.spin = 0;
  u.spinVel = 0;
  if (Math.abs(u.vx) > 0.01 || Math.abs(u.vz) > 0.01) {
    u.x += u.vx * dt; u.z += u.vz * dt;
    const decay = Math.exp(-6 * dt);
    u.vx *= decay; u.vz *= decay;
  }
  if (u.vy !== 0 || u.y > 0) {
    u.vy -= 38 * dt;
    u.y += u.vy * dt;
    if (u.y <= 0) { u.y = 0; u.vy = 0; }
  }
}

function finish(state) {
  const w = state.winner;
  const def = w && w !== 'draw' ? teamDef(w) : null;
  emit(state, { type: 'end', winner: w, reason: state.endReason });
  pushLog(state, {
    text: (w === 'draw' || !def) ? '⚖️ 무승부' : `${def.emoji} ${def.name} 팀 승리!`,
    kind: 'end', team: w,
  });
}

export function simulate(state, dt = TUNING.SIM_DT, maxSeconds = 400) {
  const limit = Math.ceil(maxSeconds / dt);
  let i = 0;
  while (!state.over && i < limit) { step(state, dt); i++; }
  return state;
}

/* ───────────────────────────── 테스트/UI 도우미 ───────────────────────────── */

export function battleSummary(state) {
  const teams = state.teams || ['blue', 'red'];
  const out = {
    winner: state.winner, reason: state.endReason, time: Math.round(state.time * 10) / 10,
    teams: teams.slice(), teamSize: teams.length,
    blue: state.units.filter((u) => u.team === 'blue').map(summarizeUnit),
    red: state.units.filter((u) => u.team === 'red').map(summarizeUnit),
    stats: { ...state.stats },
  };
  out.byTeam = {};
  for (const t of teams) {
    out.byTeam[t] = state.units.filter((u) => u.team === t).map(summarizeUnit);
  }
  return out;
}

function summarizeUnit(u) {
  return {
    uid: u.uid, id: u.id, name: u.name, alive: !u.dead,
    hp: Math.max(0, Math.round(u.hp)), maxHp: u.maxHp,
    dmg: Math.round(u.dmgDealt), taken: Math.round(u.dmgTaken),
    kills: u.kills, skills: u.skillCasts, weapon: u.weaponId,
  };
}

export function mvpOf(state) {
  let best = null, score = -1;
  for (const u of state.units) {
    const s = u.dmgDealt + u.kills * 40 + (u.dead ? 0 : 30);
    if (s > score) { score = s; best = u; }
  }
  return best;
}
