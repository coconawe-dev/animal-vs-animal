// 동물 vs 동물 — 배틀 시뮬레이션 (순수 로직 · THREE/DOM 의존 없음)
// 브라우저(main.js)와 노드(tests/smoke.mjs)가 똑같은 코드를 돌린다.

import { ANIMAL_BY_ID, ARENA_BY_ID, TUNING } from './config.js';

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

export function createBattle(opts = {}) {
  const blue = (opts.blue || []).slice(0, TUNING.MAX_TEAM);
  const red = (opts.red || []).slice(0, TUNING.MAX_TEAM);
  const arena = ARENA_BY_ID[opts.arenaId] || ARENA_BY_ID.savanna;
  const seed = opts.seed == null ? 20261121 : opts.seed >>> 0;
  const rng = mulberry32(seed);

  const state = {
    seed, arena, arenaId: arena.id, rng,
    time: 0, over: false, winner: null, endReason: null,
    units: [], projectiles: [], events: [], log: [], logTotal: 0, nextPid: 1, nextUid: 1,
    maxTime: opts.maxTime || TUNING.MAX_TIME,
    stats: { skills: 0, hits: 0, crits: 0, dodges: 0, kills: 0 },
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

function spawnTeam(state, ids, team) {
  const n = ids.length;
  const sign = team === 'blue' ? -1 : 1;
  ids.forEach((id, i) => {
    const def = ANIMAL_BY_ID[id];
    if (!def) return;
    const z = n === 1 ? 0 : (i - (n - 1) / 2) * 2.7;
    const x = sign * (7.6 + (i % 2) * 1.2);
    const u = makeUnit(state, def, team, x, z);
    state.units.push(u);
  });
}

function makeUnit(state, def, team, x, z) {
  const uid = state.nextUid++;
  return {
    uid, team, battle: state, id: def.id, def, emoji: def.emoji, name: def.name,
    x, z, y: 0, vx: 0, vz: 0, facing: team === 'blue' ? Math.PI / 2 : -Math.PI / 2,
    hp: def.hp, maxHp: def.hp,
    atk: def.atk, spd: def.spd, range: def.range,
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
  return u.baseInterval / (1 + u.haste);
}

function unitSpeed(u, state) {
  let s = u.spd * u.speedMul;
  if (u.slow > 0) s *= 1 - u.slowFactor;
  if (u.def.id === 'wolf') {
    // 늑대 패시브: 아군이 곁에 있으면 빨라진다
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

  // 회피
  const evade = clamp(tgt.evasion + tgt.dodgeBonus, 0, 0.85);
  if (!opts.unavoidable && evade > 0 && rng() < evade) {
    state.stats.dodges++;
    emit(state, { type: 'evade', uid: tgt.uid, by: src ? src.uid : null, x: tgt.x, z: tgt.z });
    return 0;
  }

  let dmg = raw;
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

  if (tgt.hp <= 0) killUnit(state, tgt, src);
  return dmg;
}

function killUnit(state, u, src) {
  if (u.dead) return;
  u.dead = true;
  u.hp = 0;
  u.deadTime = state.time;
  u.dash = null;
  u.state = 'dead';
  state.stats.kills++;
  if (src) src.kills++;
  emit(state, { type: 'death', uid: u.uid, x: u.x, z: u.z, by: src ? src.uid : null });
  pushLog(state, {
    text: `${u.emoji} ${u.name} 쓰러짐${src ? ` (${src.emoji} ${src.name})` : ''}`,
    team: u.team, kind: 'death',
  });
}

function knock(state, u, dirX, dirZ, force) {
  if (u.dead || force <= 0) return;
  const resist = clamp(u.kbResist, 0, 0.9);
  const f = force * (1 - resist);
  const l = Math.hypot(dirX, dirZ) || 1;
  u.vx += (dirX / l) * f;
  u.vz += (dirZ / l) * f;
}

function addBleed(state, target, src, dps, time) {
  if (!target || target.dead) return;
  target.bleeding.push({ dps, t: time, srcUid: src ? src.uid : null });
  if (target.bleeding.length > 6) target.bleeding.shift();
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
    // 다른 아군이 이미 붙은 적은 조금 덜 선호 → 자연스럽게 옆으로 도는 그림
    let onIt = 0;
    for (const a of allies) if (a !== u && a.targetId === e.uid) onIt++;
    score += onIt * (u.def.ranged ? 5.5 : 3.4);
    // 마무리 가능한 적 선호
    score *= 0.82 + 0.36 * (e.hp / e.maxHp);
    // 사거리 밖으로 너무 멀면 가중
    if (!u.def.ranged && d > 30) score += 6;
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

  // 아군·적군끼리 서로 밀어내 겹치지 않게
  for (const o of state.units) {
    if (o === u || o.dead) continue;
    const ox = u.x - o.x, oz = u.z - o.z;
    const od = Math.hypot(ox, oz);
    const want = TUNING.SEPARATION * (o.def.scale > 1.05 ? 1.2 : 1);
    if (od < want && od > 0.0001) {
      const w = ((want - od) / want) * 1.9;
      dx += (ox / od) * w; dz += (oz / od) * w;
    }
  }

  // 장애물 회피
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
  // 장애물 밀어내기
  for (const ob of state.arena.obstacles) {
    const dx = u.x - ob.x, dz = u.z - ob.z;
    const d = Math.hypot(dx, dz);
    const lim = ob.r + 0.62;
    if (d < lim && d > 0.0001) {
      u.x = ob.x + (dx / d) * lim;
      u.z = ob.z + (dz / d) * lim;
    }
  }
  // 전장 경계 (원형)
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
  u.attackTimer = intervalFor(u);
  u.castLock = u.def.ranged ? 0.22 : 0.34;
  u.hitsLanded++;
  emit(state, { type: 'attack', uid: u.uid, target: t.uid, ranged: !!u.def.ranged });

  if (u.def.ranged) {
    const speed = 21;
    const dx = t.x - u.x, dz = t.z - u.z;
    const dd = Math.hypot(dx, dz) || 1;
    state.projectiles.push({
      pid: state.nextPid++, fromUid: u.uid, targetUid: t.uid,
      x: u.x, y: u.y + 1.5, z: u.z, vx: (dx / dd) * speed, vz: (dz / dd) * speed,
      dmg: u.atk * (0.9 + state.rng() * 0.2), ttl: 1.4,
    });
    return;
  }
  const dmg = u.atk * (0.9 + state.rng() * 0.2);
  const crit = state.rng() < u.crit;
  applyDamage(state, u, t, dmg, { crit });
  knock(state, t, t.x - u.x, t.z - u.z, 2.2);
  if (u.def.onHitBleed) addBleed(state, t, u, u.def.onHitBleed.dps, u.def.onHitBleed.time);
}

function updateProjectiles(state, dt) {
  const rng = state.rng;
  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    const p = state.projectiles[i];
    p.ttl -= dt;
    p.x += p.vx * dt; p.z += p.vz * dt;
    const src = unitByUid(state, p.fromUid);
    const tgt = unitByUid(state, p.targetUid);
    let hit = false;
    if (tgt && !tgt.dead && dist2(p.x, p.z, tgt.x, tgt.z) < 0.85) hit = true;
    else if (p.ttl <= 0) hit = false;
    if (hit) {
      const crit = rng() < (src ? src.crit : 0.07);
      applyDamage(state, src, tgt, p.dmg, { crit });
      state.projectiles.splice(i, 1);
    } else if (p.ttl <= 0) {
      state.projectiles.splice(i, 1);
      emit(state, { type: 'projectileGone', x: p.x, z: p.z });
    }
  }
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
  const ax = u.x, az = u.z, ay = u.y;
  const nx = u.x + dash.vx * dt, nz = u.z + dash.vz * dt;

  // 장애물에 막히면 돌진 중단
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

  // 경로상의 적 타격
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

  // 급강하 착지
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

function areaBurst(state, u, x, z, radius, dmg, stun = 0, knockForce = 0, exclude = null) {
  emit(state, { type: 'burst', x, z, r: radius, uid: u ? u.uid : null, kind: u ? u.def.skill.kind : 'generic' });
  for (const e of state.units) {
    if (e.dead || e === u || e === exclude) continue;
    if (u && e.team === u.team) continue;
    const d = dist2(x, z, e.x, e.z);
    if (d <= radius + 0.5) {
      applyDamage(state, u, e, dmg, {});
      if (stun > 0) stunUnit(state, e, stun);
      if (knockForce > 0) knock(state, e, e.x - x, e.z - z, knockForce);
    }
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

function tryCastSkill(state, u, target, d, enemies) {
  if (!u.def.skill || !skillReady(state, u)) return false;
  const s = u.def.skill;
  const rng = state.rng;

  switch (s.kind) {
    case 'roar':
    case 'slam':
    case 'smash': {
      const r = s.radius || u.range;
      if (d > r + 1.2 || countEnemiesIn(state, u, r) < 1) return false;
      break;
    }
    case 'pounce': {
      if (d < s.minRange || d > s.range) return false;
      break;
    }
    case 'gore2': {
      if (d < s.minRange || d > s.range) return false;
      break;
    }
    case 'charge':
    case 'gore': {
      if (d > s.range || d < 2.2) return false;
      break;
    }
    case 'pack':
    case 'chomp': {
      if (d > s.range || !target) return false;
      break;
    }
    case 'dive': {
      if (d > s.range || !target) return false;
      break;
    }
    case 'evade': {
      if (u.hp > u.maxHp * 0.82 && countEnemiesIn(state, u, 4.6) < 1) return false;
      break;
    }
    case 'sprint': {
      // 자기 강화 — 사거리 조건 없이 쿨마다 사용
      break;
    }
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

  const fx = u.x, fz = u.z;
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
    case 'pounce': {
      const dist = Math.max(1.2, d - 1.3);
      startDash(u, {
        vx: ((target.x - u.x) / d) * 26, vz: ((target.z - u.z) / d) * 26,
        dist, width: 1.4, dmg: u.atk * s.power, bleed: s.bleed, bleedTime: s.bleedTime,
        knock: 3, kind: 'pounce', invuln: true,
      });
      u.dodgeBonus = 0.4; u.dodgeT = 0.8;
      break;
    }
    case 'charge':
    case 'gore': {
      const dist = s.dash || 9;
      // 돌진은 대상 방향이 아니라 "조준한 방향"으로 — 코끼리는 관통해서 지나간다
      const dash = {
        vx: (dirX / dirLen) * (s.kind === 'gore' ? 19 : 15),
        vz: (dirZ / dirLen) * (s.kind === 'gore' ? 19 : 15),
        dist, width: s.width || 2.4, dmg: u.atk * s.power, stun: s.stun,
        knock: s.knock, kind: s.kind, immune: s.kind === 'gore',
      };
      startDash(u, dash);
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
  u.lastSkillPos = { x: fx, z: fz };
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

  // 넉백 감쇠 + 적용
  if (Math.abs(u.vx) > 0.01 || Math.abs(u.vz) > 0.01) {
    u.x += u.vx * dt;
    u.z += u.vz * dt;
    const decay = Math.exp(-TUNING.KNOCK_DECAY * dt);
    u.vx *= decay; u.vz *= decay;
    if (Math.abs(u.vx) < 0.05) u.vx = 0;
    if (Math.abs(u.vz) < 0.05) u.vz = 0;
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

  if (u.castLock <= 0 && tryCastSkill(state, u, target, d, null)) return;

  if (u.castLock > 0) {
    u.state = 'attack';
    // 시전 중엔 제자리
    u.moving = false;
    return;
  }

  if (d <= u.range && u.attackTimer <= 0) {
    u.state = 'attack';
    doAttack(state, u, target);
    return;
  }

  const speed = unitSpeed(u, state);
  if (u.def.ranged) {
    if (d < u.range * 0.55) { moveAway(state, u, target.x, target.z, speed, dt); u.state = 'retreat'; }
    else if (d > u.range * 0.95) { steerMove(state, u, target.x, target.z, speed, dt, u.range * 0.9); u.state = 'chase'; }
    else {
      // 사거리 안 — 옆으로 돌며 각을 잡는다
      const perp = desired + Math.PI / 2;
      steerMove(state, u, u.x + Math.sin(perp) * 3, u.z + Math.cos(perp) * 3, speed * 0.65, dt);
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
    if (u.dead) continue;
    u.moving = false;
    tickEffects(state, u, h);
  }
  updateProjectiles(state, h);
  for (const u of state.units) {
    if (u.dead) continue;
    actUnit(state, u, h);
    resolveCollisions(state, u);
  }

  // 승패 판정
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
    kills: u.kills, skills: u.skillCasts,
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
