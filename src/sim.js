// 동물 vs 동물 — ARBS 스타일 배틀 시뮬레이션 (순수 로직 · THREE/DOM 의존 없음)
// 브라우저(main.js)와 노드(tests/smoke.mjs)가 똑같은 코드를 돌린다.

import { CREATURE_BY_ID, WEAPON_BY_ID, ARENA_BY_ID, TUNING } from './config.js';
import { normalizePlacement, autoPositions, clampSide } from './placement.js';

export const TEAMS = ['blue', 'red'];

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

function normalizeSide(list, team) {
  if (!Array.isArray(list)) return [];
  const cleaned = list.map(normalizePlacement).filter(Boolean).slice(0, TUNING.MAX_UNITS_PER_TEAM);
  const placed = autoPositions(cleaned, team).map((p) => {
    const c = clampSide(team, p.x, p.z, true);
    return { ...p, x: c.x, z: c.z };
  });
  return placed;
}

export function createBattle(opts = {}) {
  const blue = normalizeSide(opts.blue, 'blue');
  const red = normalizeSide(opts.red, 'red');
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
  };

  spawnTeam(state, blue, 'blue');
  spawnTeam(state, red, 'red');

  if (!blue.length || !red.length) {
    state.over = true;
    state.endReason = 'empty';
    state.winner = blue.length ? 'blue' : red.length ? 'red' : 'draw';
  }
  pushLog(state, { text: `${arena.emoji} ${arena.name} — ${blue.length} vs ${red.length}`, kind: 'system' });
  return state;
}

function spawnTeam(state, list, team) {
  for (const p of list) {
    const def = CREATURE_BY_ID[p.id];
    if (!def) continue;
    state.units.push(makeUnit(state, def, team, p.x, p.z, p.weapon));
  }
}

function makeUnit(state, def, team, x, z, weaponId) {
  const uid = state.nextUid++;
  const w = WEAPON_BY_ID[weaponId] || WEAPON_BY_ID.none;
  const maxHp = Math.round(def.hp * (w.hpMul || 1));
  return {
    uid, team, battle: state, id: def.id, def, emoji: def.emoji, name: def.name,
    x, z, y: 0, vx: 0, vz: 0, vy: 0, spin: 0, spinVel: 0,
    facing: team === 'blue' ? Math.PI / 2 : -Math.PI / 2,
    hp: maxHp, maxHp,
    atk: def.atk, spd: def.spd,
    range: Math.max(def.range, w.range || 0),
    weapon: w, weaponId: w.id,
    ranged: !!(def.ranged || w.proj),
    baseInterval: def.atkInterval,
    armor: def.armor || 0, kbResist: def.kbResist || 0,
    evasion: def.evasion || 0, crit: def.crit || 0.07,
    attackTimer: 0.35 + state.rng() * 0.35,
    skillTimer: 2.4 + state.rng() * 3.2,
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

function killUnit(state, u, src, heavy = 0) {
  if (u.dead) return;
  u.dead = true;
  u.hp = 0;
  u.deadTime = state.time;
  u.dash = null;
  u.state = 'dead';
  u.targetId = null;
  // 무거운 일격 = 공중으로 튕겨 나가며 회전 (래그돌 느낌)
  if (heavy > 12 && u.def.size < 1.4) {
    u.vy = Math.max(u.vy, 5.6);
    u.spinVel = (state.rng() - 0.5) * 14;
    u.vx *= 0.5; u.vz *= 0.5;
  }
  state.stats.kills++;
  if (src) src.kills++;
  emit(state, { type: 'death', uid: u.uid, x: u.x, z: u.z, by: src ? src.uid : null, heavy });
  pushLog(state, {
    text: `${u.emoji} ${u.name} 쓰러짐${src ? ` (${src.emoji} ${src.name})` : ''}`,
    team: u.team, kind: 'death',
  });
}

function knock(state, u, dirX, dirZ, force, opts = {}) {
  if (u.dead || force <= 0) return;
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

    // 명중 판정
    let hitUnit = null;
    for (const e of state.units) {
      if (e.dead || e.team === p.team) continue;
      if (dist2(p.x, p.z, e.x, e.z) < (p.kind === 'rocket' ? 0.95 : 0.7)) { hitUnit = e; break; }
    }
    const hitTarget = tgt && !tgt.dead && dist2(p.x, p.z, tgt.x, tgt.z) < 0.95;
    const outOfArena = Math.hypot(p.x, p.z) > TUNING.ARENA_RADIUS + 2.2;
    let obstacleHit = false;
    for (const ob of state.arena.obstacles) {
      if (dist2(p.x, p.z, ob.x, ob.z) < ob.r * 0.85) { obstacleHit = true; break; }
    }

    if (p.kind === 'rocket') {
      if (hitUnit || hitTarget || p.ttl <= 0 || outOfArena || obstacleHit) {
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
      applyDamage(state, u, e, dash.dmg, { pierce: dash.pierce });
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

function skillReady(state, u) {
  return u.skillTimer <= 0 && !u.dash;
}

function tryCastSkill(state, u, target, d) {
  if (!u.def.skill || !skillReady(state, u)) return false;
  const s = u.def.skill;
  const rng = state.rng;

  switch (s.kind) {
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
    case 'sailSlash': {
      if (d < (s.minRange || 0.8) || d > s.range) return false;
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
    case 'flame': {
      if (d > s.range || !target) return false;
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
  u.state = 'skill';
  u.castLock = 0.4;
  state.stats.skills++;

  emit(state, { type: 'skill', uid: u.uid, kind: s.kind, name: s.name, x: u.x, z: u.z, team: u.team });
  pushLog(state, { text: `${u.emoji} ${u.name} 「${s.name}」`, team: u.team, kind: 'skill' });

  const dirX = target ? target.x - u.x : Math.sin(u.facing);
  const dirZ = target ? target.z - u.z : Math.cos(u.facing);
  const dirLen = Math.hypot(dirX, dirZ) || 1;

  switch (s.kind) {
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
  if (u.attackTimer > 0) u.attackTimer = Math.max(0, u.attackTimer - dt);
  if (u.skillTimer > 0) u.skillTimer = Math.max(0, u.skillTimer - dt);

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
  if (Math.abs(u.spinVel) > 0.05 && (u.y > 0 || u.dead)) {
    u.spin += u.spinVel * dt;
  } else if (!u.dead) {
    u.spin *= Math.max(0, 1 - dt * 6);
    u.spinVel *= Math.max(0, 1 - dt * 3);
  }
}

function actUnit(state, u, dt) {
  if (u.dash) { updateDash(state, u, dt); return; }
  if (u.stun > 0) { u.state = 'stun'; return; }

  const target = ensureTarget(state, u);
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

  const b = aliveCount(state, 'blue');
  const r = aliveCount(state, 'red');
  if (b === 0 || r === 0) {
    state.over = true;
    state.winner = b > 0 ? 'blue' : r > 0 ? 'red' : 'draw';
    state.endReason = 'elimination';
    finish(state);
  } else if (state.time >= state.maxTime) {
    const bh = teamHpRatio(state, 'blue');
    const rh = teamHpRatio(state, 'red');
    state.over = true;
    state.endReason = 'timeout';
    state.winner = Math.abs(bh - rh) < 0.03 ? 'draw' : bh > rh ? 'blue' : 'red';
    finish(state);
  }
  return state;
}

function tickDead(u, dt) {
  if (Math.abs(u.vx) > 0.01 || Math.abs(u.vz) > 0.01) {
    u.x += u.vx * dt; u.z += u.vz * dt;
    const decay = Math.exp(-6 * dt);
    u.vx *= decay; u.vz *= decay;
  }
  if (u.vy !== 0 || u.y > 0) {
    u.vy -= 38 * dt;
    u.y += u.vy * dt;
    if (u.y <= 0) { u.y = 0; u.vy = 0; u.spinVel *= 0.4; }
  }
  if (Math.abs(u.spinVel) > 0.05) u.spin += u.spinVel * dt;
}

function finish(state) {
  const w = state.winner;
  emit(state, { type: 'end', winner: w, reason: state.endReason });
  pushLog(state, {
    text: w === 'draw' ? '⚖️ 무승부' : `${w === 'blue' ? '🔵 블루' : '🔴 레드'} 팀 승리!`,
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
  return {
    winner: state.winner, reason: state.endReason, time: Math.round(state.time * 10) / 10,
    blue: state.units.filter((u) => u.team === 'blue').map(summarizeUnit),
    red: state.units.filter((u) => u.team === 'red').map(summarizeUnit),
    stats: { ...state.stats },
  };
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
