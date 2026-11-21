// 동물 vs 동물 — ARBS 스타일 샌드박스 배틀 진입점
// 배치(3D 탭) · 전투 시뮬레이션 · 카메라 · 이펙트 · UI 연결
import * as THREE from '../vendor/three.module.js';
import {
  CREATURE_BY_ID, ARENA_BY_ID, PRESETS, PRESET_BY_ID, CHALLENGES, CHALLENGE_BY_ID,
  DEFAULT_PLACEMENTS, TUNING, placementCost, WEAPON_BY_ID,
} from './config.js';
import {
  createBattle, step, drainEvents, battleSummary, mvpOf,
} from './sim.js';
import { placeUnits, removeNearest, mirrorTeam, nearestIndex, sanitizeList } from './placement.js';
import { buildAnimalModel, animateRig, triggerAttack, triggerShoot, triggerSkill, triggerHurt } from './models.js';
import { Stage } from './scene.js';
import { Effects } from './effects.js';
import { UI } from './ui.js';
import { Sfx } from './audio.js';

const FIXED = 1 / 60;
const canvas = document.getElementById('scene');
const nameplateRoot = document.getElementById('nameplates');

const clone = (p) => ({ id: p.id, x: p.x, z: p.z, weapon: p.weapon || 'none' });

const app = {
  teams: { blue: DEFAULT_PLACEMENTS.blue.map(clone), red: DEFAULT_PLACEMENTS.red.map(clone) },
  arenaId: DEFAULT_PLACEMENTS.arena,
  mode: 'sandbox',
  activeTeam: 'blue',
  activeCat: 'all',
  selected: 'trex',
  weapon: 'none',
  count: 1,
  free: false,
  eraser: false,
  speed: 1,
  paused: false,
  follow: true,
  sound: true,
  focusUid: null,
  challenge: null,
  maxCleared: 0,
  showChallenges: false,
  showPresets: false,
};

function fatal(message) {
  const el = document.getElementById('loader');
  if (!el) return;
  el.classList.remove('gone', 'hidden');
  el.innerHTML = `<div class="loader-inner"><span>😵</span><b>게임을 시작할 수 없어요</b><small>${message}</small></div>`;
}

/* ───────────────────────────── 저장/복원 ───────────────────────────── */

const SAVE_KEY = 'animal-vs-animal:arbs:v1';

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const d = JSON.parse(raw);
    const blue = sanitizeList(d.blue);
    const red = sanitizeList(d.red).slice(0, Math.max(0, TUNING.MAX_UNITS - blue.length));
    if (blue.length) app.teams.blue = blue;
    if (red.length) app.teams.red = red;
    if (ARENA_BY_ID[d.arena]) app.arenaId = d.arena;
    if (Number.isFinite(d.maxCleared)) app.maxCleared = Math.max(0, Math.min(CHALLENGES.length, d.maxCleared));
  } catch (e) { /* 저장값이 없거나 깨졌으면 기본 배치 */ }
}

function saveState() {
  try {
    const prev = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null') || {};
    const data = {
      maxCleared: app.maxCleared,
      arena: app.mode === 'challenge' ? (prev.arena || DEFAULT_PLACEMENTS.arena) : app.arenaId,
    };
    // 챌린지 중에는 챌린지용 배치가 샌드박스 저장을 덮어쓰지 않게 한다
    if (app.mode === 'challenge') {
      if (Array.isArray(prev.blue)) data.blue = prev.blue;
      if (Array.isArray(prev.red)) data.red = prev.red;
    } else {
      data.blue = app.teams.blue.map(clone);
      data.red = app.teams.red.map(clone);
    }
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (e) { /* 사파리 프라이빗 모드 등 — 무시 */ }
}

/* ───────────────────────────── 무대 · 도구 ───────────────────────────── */

let stage;
try {
  stage = new Stage(canvas);
} catch (err) {
  fatal('이 브라우저에서 3D 그래픽(WebGL)을 사용할 수 없습니다.<br>사파리/크롬 최신 버전으로 다시 열어 주세요.');
  throw err;
}
const effects = new Effects(stage.scene);
const sfx = new Sfx();

let battle = null;
let views = [];
const viewByUid = new Map();
let phase = 'preview';     // preview | battle | ended
let logSeen = 0;
let fpsAccum = 0, fpsFrames = 0, downgraded = false;
let userZoomed = false;
const history = [];
const sandboxBackup = { teams: null, arena: null, mode: 'sandbox' };

/* ───────────────────────────── UI ───────────────────────────── */

loadSave();

const ui = new UI(app, {
  onStart: () => startBattle(),
  onRematch: () => startBattle(),
  onRebuild: () => backToBuilder(),
  onPause: () => togglePause(),
  onSpeed: () => {
    app.speed = app.speed === 2 ? 1 : 2;
    ui.setSpeed(app.speed);
    ui.setPaused(app.paused);
  },
  onSlow: () => {
    app.speed = app.speed === 0.5 ? 1 : 0.5;
    ui.setSpeed(app.speed);
    ui.setPaused(app.paused);
  },
  onFollow: () => {
    app.follow = !app.follow;
    if (!app.follow) app.focusUid = null;
    ui.setFollow(app.follow);
    ui.setFocusTag(null);
    ui.toast(app.follow ? '🎥 자동 추적 켜짐' : '🎥 자동 추적 꺼짐');
  },
  onToggleSound: () => {
    app.sound = !app.sound;
    sfx.init();
    sfx.setEnabled(app.sound);
    ui.setSound(app.sound);
  },
  onSelectUnit: () => {},
  onWeapon: (id) => {
    const w = WEAPON_BY_ID[id];
    if (w) ui.toast(`${w.emoji} ${w.name} — ${w.desc}`);
  },
  onTeamChange: () => updateGhostColor(),
  onUndo: () => {
    if (!history.length) { ui.toast('되돌릴 배치가 없습니다'); return; }
    const snap = history.pop();
    app.teams.blue = snap.blue;
    app.teams.red = snap.red;
    afterPlacementChange(false);
    ui.toast('↩️ 되돌림');
  },
  onClear: (team) => {
    if (app.mode === 'challenge' && team !== 'blue') { ui.toast('챌린지에서는 블루 팀만 편집합니다'); return; }
    if (!app.teams[team].length) return;
    pushHistory();
    app.teams[team] = [];
    afterPlacementChange(false);
    ui.toast(`${team === 'blue' ? '🔵 블루' : '🔴 레드'} 팀을 비웠습니다`);
  },
  onMirror: (team) => {
    if (app.mode === 'challenge') { ui.toast('챌린지에서는 대칭 복사를 쓸 수 없습니다'); return; }
    const target = team === 'blue' ? 'red' : 'blue';
    if (!app.teams[team].length) { ui.toast('복사할 배치가 없습니다'); return; }
    pushHistory();
    app.teams[target] = mirrorTeam(app.teams[team]);
    afterPlacementChange(false);
    ui.toast(`⇄ ${team === 'blue' ? '블루' : '레드'} 배치를 ${target === 'blue' ? '블루' : '레드'}에 대칭 복사`);
  },
  onMode: (mode) => {
    if (mode === 'challenge') {
      app.showChallenges = true;
      ui.openChallenges();
    } else {
      leaveChallenge();
    }
  },
  onChallenge: (stageDef) => enterChallenge(stageDef),
  onLeaveChallenge: () => leaveChallenge(),
  onNextStage: (id) => {
    const next = CHALLENGE_BY_ID[id];
    if (next) enterChallenge(next);
  },
  onRandom: () => {
    // 프리셋 패널 토글은 UI가 담당한다
    ui.el.challengePanel?.classList.add('hidden');
  },
  onPreset: (id) => applyPreset(id),
  onArena: (id) => {
    app.arenaId = id;
    stage.setArena(ARENA_BY_ID[id] || ARENA_BY_ID.savanna);
    saveState();
    if (phase === 'preview') { refreshPreview(); ui.render(); }
  },
});

/* ───────────────────────────── 뷰 관리 ───────────────────────────── */

function disposeRig(rig) {
  rig.group.traverse((o) => {
    if (o.material) {
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      ms.forEach((m) => m.dispose?.());
    }
  });
}

function clearViews() {
  for (const v of views) {
    stage.scene.remove(v.rig.group);
    disposeRig(v.rig);
    v.el?.el?.remove();
  }
  views = [];
  viewByUid.clear();
  nameplateRoot.innerHTML = '';
}

function createNameplate(u) {
  const el = document.createElement('div');
  el.className = `np ${u.team}`;
  const def = u.def;
  el.innerHTML = `<span class="np-name">${u.emoji} ${def.short || def.name}</span><span class="np-bar"><i></i></span>`;
  nameplateRoot.appendChild(el);
  return { el, bar: el.querySelector('i'), name: el.querySelector('.np-name') };
}

function buildViews(units) {
  clearViews();
  const many = units.length > 18;
  const simple = units.length > 44;
  nameplateRoot.classList.toggle('many', many);
  if (many && stage.sun) stage.sun.shadow.mapSize.set(1024, 1024);
  if (units.length > 60) {
    stage.renderer.setPixelRatio(Math.min(1.4, window.devicePixelRatio || 1));
    if (stage.sun) stage.sun.castShadow = false;
  } else if (stage.sun) {
    stage.sun.castShadow = true;
  }
  for (const u of units) {
    const rig = buildAnimalModel(u.def, u.team, { weapon: u.weaponId, lowDetail: many, simple });
    rig.group.position.set(u.x, 0, u.z);
    rig.group.rotation.y = u.facing;
    stage.scene.add(rig.group);
    const v = {
      u, rig, el: createNameplate(u),
      x: u.x, z: u.z, lastX: u.x, lastZ: u.z, bar: null,
      hover: 0,
    };
    v.bar = v.el.bar;
    views.push(v);
    viewByUid.set(u.uid, v);
  }
}

function refreshPreview() {
  if (phase !== 'preview') return;
  battle = createBattle({
    blue: app.teams.blue, red: app.teams.red, arenaId: app.arenaId, seed: 1,
  });
  buildViews(battle.units);
  effects.clear();
  ui.buildBattle?.(battle);
}

function afterPlacementChange(refresh = true) {
  saveState();
  refreshPreview();
  if (phase === 'preview') {
    stage.camGoal.dist = previewFit();
    stage.camGoal.target.set(0, 1.0, 0);
  }
  ui.render();
}

/* ───────────────────────────── 배치 ───────────────────────────── */

function pushHistory() {
  history.push({
    blue: app.teams.blue.map(clone),
    red: app.teams.red.map(clone),
  });
  if (history.length > 40) history.shift();
}

function teamColor(team) { return team === 'blue' ? 0x3f86ff : 0xff5040; }

function updateGhostColor() {
  const color = app.eraser ? 0xff8a3a : teamColor(app.activeTeam);
  if (stage.ghost && stage.ghost.visible) {
    stage.ghostMat.color.setHex(color);
    stage.ghostDiscMat.color.setHex(color);
  }
}

function ndcFromEvent(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
    y: -((e.clientY - rect.top) / rect.height) * 2 + 1,
  };
}

function groundFromEvent(e) {
  const n = ndcFromEvent(e);
  return stage.rayGround(n.x, n.y);
}

function challengeLeft() {
  if (app.mode !== 'challenge' || !app.challenge) return Infinity;
  return app.challenge.budget - placementCost(app.teams.blue);
}

function placeAt(x, z) {
  const def = CREATURE_BY_ID[app.selected];
  if (!def) return;
  const team = app.activeTeam;
  if (app.mode === 'challenge' && team !== 'blue') { ui.toast('챌린지에서는 블루 팀만 배치합니다'); return; }
  const list = app.teams[team];
  let count = app.count;

  if (app.mode === 'challenge' && team === 'blue') {
    const left = challengeLeft();
    const affordable = Math.floor(left / def.cost);
    if (affordable <= 0) { ui.toast(`💸 예산이 부족합니다 (남은 ${Math.max(0, left)})`); return; }
    if (count > affordable) {
      count = affordable;
      ui.toast(`예산상 ${count}마리만 배치합니다`);
    }
  }

  pushHistory();
  const total = app.teams.blue.length + app.teams.red.length;
  const room = Math.max(0, TUNING.MAX_UNITS - total);
  const limit = Math.min(TUNING.MAX_UNITS_PER_TEAM, list.length + room);
  const res = placeUnits(list, {
    id: app.selected, team, x, z, weapon: app.weapon,
    count, free: app.free, limit,
  });
  if (!res.added.length) {
    history.pop();
    ui.toast(res.skipped === 'limit' ? `전장 한도는 ${TUNING.MAX_UNITS}마리입니다` : '여기에 놓을 수 없습니다');
    return;
  }
  if (res.skipped === 'limit') ui.toast(`전장 한도 ${TUNING.MAX_UNITS}마리 — 추가하지 못했습니다`);
  afterPlacementChange();
  sfx.ui();
  for (const p of res.added) effects.ring(p.x, p.z, 0.4, def.size > 1.3 ? 2.8 : 1.8, teamColor(team), 0.35);
}

function eraseAt(x, z) {
  const challenge = app.mode === 'challenge';
  const bi = nearestIndex(app.teams.blue, x, z, 2.0);
  const ri = challenge ? -1 : nearestIndex(app.teams.red, x, z, 2.0);
  let removed = null;
  pushHistory();
  if (bi >= 0 && (ri < 0 || Math.hypot(app.teams.blue[bi].x - x, app.teams.blue[bi].z - z)
    <= Math.hypot(app.teams.red[ri].x - x, app.teams.red[ri].z - z))) {
    removed = app.teams.blue.splice(bi, 1)[0];
  } else if (ri >= 0) {
    removed = app.teams.red.splice(ri, 1)[0];
  }
  if (!removed) { history.pop(); return; }
  afterPlacementChange();
  effects.dust(x, z, 8);
  ui.toast('🧽 지움');
}

function applyPreset(id) {
  const p = PRESET_BY_ID[id];
  if (!p) return;
  pushHistory();
  app.mode = 'sandbox';
  app.challenge = null;
  app.teams.blue = p.blue.map(clone);
  app.teams.red = p.red.map(clone);
  app.arenaId = p.arena;
  app.showPresets = false;
  ui.el.presetPanel?.classList.add('hidden');
  ui.setMode('sandbox', null);
  stage.setArena(ARENA_BY_ID[p.arena]);
  if (phase !== 'preview') backToBuilder();
  refreshPreview();
  fitPreviewCamera();
  ui.render();
  saveState();
  ui.toast(`${p.emoji} ${p.name}`);
}

/* ───────────────────────────── 프리셋 · 챌린지 ───────────────────────────── */

function applyChallengeStage(stageDef) {
  app.mode = 'challenge';
  app.challenge = stageDef;
  app.activeTeam = 'blue';
  app.teams.blue = [];
  app.teams.red = stageDef.red.map(clone);
  app.arenaId = stageDef.arena;
  stage.setArena(ARENA_BY_ID[stageDef.arena]);
  app.showChallenges = false;
  history.length = 0;
  ui.setMode('challenge', stageDef);
  if (phase !== 'preview') backToBuilder();
  refreshPreview();
  fitPreviewCamera();
  ui.render();
  ui.toast(`⚔️ ${stageDef.id}단계 · 예산 ${stageDef.budget}${stageDef.desc ? ' — ' + stageDef.desc : ''}`);
}

function enterChallenge(stageDef) {
  if (!stageDef) return;
  if (stageDef.id > app.maxCleared + 1) { ui.toast('🔒 이전 단계를 먼저 클리어하세요'); return; }
  // 샌드박스로 돌아올 때 복원할 배치 백업 (첫 단계 진입 때 한 번만)
  if (!app.challenge) {
    sandboxBackup.teams = { blue: app.teams.blue.map(clone), red: app.teams.red.map(clone) };
    sandboxBackup.arena = app.arenaId;
  }
  applyChallengeStage(stageDef);
}

function leaveChallenge() {
  app.mode = 'sandbox';
  app.challenge = null;
  app.showChallenges = false;
  if (sandboxBackup.teams) {
    app.teams.blue = sandboxBackup.teams.blue.map(clone);
    app.teams.red = sandboxBackup.teams.red.map(clone);
  }
  if (sandboxBackup.arena) app.arenaId = sandboxBackup.arena;
  stage.setArena(ARENA_BY_ID[app.arenaId]);
  ui.setMode('sandbox', null);
  if (phase !== 'preview') backToBuilder();
  refreshPreview();
  fitPreviewCamera();
  ui.render();
  saveState();
}

/* ───────────────────────────── 배틀 진행 ───────────────────────────── */

function fitDistance() {
  const alive = (battle?.units || []).filter((u) => !u.dead);
  if (alive.length < 2) return 20;
  let maxD = 0;
  for (const a of alive) {
    for (const b of alive) {
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      if (d > maxD) maxD = d;
    }
  }
  const aspect = (canvas.clientWidth || 1) / (canvas.clientHeight || 1);
  let narrow = 1;
  if (aspect < 0.52) narrow = 2.45;
  else if (aspect < 0.68) narrow = 2.2;
  else if (aspect < 0.85) narrow = 1.6;
  else if (aspect < 0.98) narrow = 1.15;
  return Math.max(11, Math.min(64, (maxD * 0.62 + 8.4) * narrow));
}

function fitPreviewCamera() {
  stage.camGoal.dist = previewFit();
  stage.camGoal.phi = 0.86;
  stage.camGoal.theta = 0.32;
  stage.camGoal.target.set(0, 1.0, 0);
}

function previewFit() {
  const aspect = (canvas.clientWidth || 1) / (canvas.clientHeight || 1);
  return Math.min(70, fitDistance() * (aspect < 1 ? 1.12 : 1.3));
}

function startBattle() {
  if (!app.teams.blue.length || !app.teams.red.length) return;
  if (app.mode === 'challenge' && app.challenge) {
    const left = challengeLeft();
    if (left < 0) { ui.toast('예산을 초과했습니다'); return; }
  }
  sfx.init();
  battle = createBattle({
    blue: app.teams.blue, red: app.teams.red, arenaId: app.arenaId,
    seed: (Math.random() * 1e9) | 0,
    mode: app.mode, challengeId: app.challenge?.id || null,
  });
  buildViews(battle.units);
  effects.clear();
  logSeen = 0;
  phase = 'battle';
  app.paused = false;
  app.focusUid = null;
  userZoomed = false;
  app.speed = 1;
  ui.hideBanner();
  ui.hideBuilder();
  stage.setFocusShift(0, 0);
  ui.showBattleUI();
  ui.setPaused(false);
  ui.setSpeed(1);
  ui.setFollow(app.follow);
  ui.setFocusTag(null);
  ui.buildBattle(battle);
  stage.camGoal.dist = fitDistance();
  stage.camGoal.phi = 0.7;
  stage.camGoal.target.set(0, 1.1, 0);
  syncLog();
  saveState();
  ui.toast(`⚔️ ${app.teams.blue.length} vs ${app.teams.red.length} 배틀 시작!`);
}

function backToBuilder() {
  phase = 'preview';
  ui.hideBanner();
  ui.hideBattleUI();
  ui.showBuilder();
  refreshPreview();
  fitPreviewCamera();
  updateFraming();
}

function togglePause() {
  if (phase !== 'battle') return;
  app.paused = !app.paused;
  ui.setPaused(app.paused);
}

function endBattle() {
  phase = 'ended';
  const summary = battleSummary(battle);
  const mvp = mvpOf(battle);
  sfx.victory();

  let opts = {};
  if (app.mode === 'challenge' && app.challenge) {
    const won = summary.winner === 'blue';
    const id = app.challenge.id;
    if (won && id > app.maxCleared) {
      app.maxCleared = Math.min(CHALLENGES.length, id);
      saveState();
      ui.buildChallenges();
    }
    opts = {
      challenge: { ...app.challenge, id },
      hasNext: won ? CHALLENGES.some((c) => c.id === id + 1) : false,
    };
  }

  ui.showBanner(summary, mvp, opts);
  ui.el.state.textContent = '전투 종료';
  if (mvp) {
    const v = viewByUid.get(mvp.uid);
    if (v) {
      effects.ring(mvp.x, mvp.z, 1, 4.5, 0xffd166, 1.1);
      effects.burst(mvp.x, 1.4, mvp.z, 0xffd166, 26, 5);
    }
  }
}

function syncLog() {
  if (!battle) return;
  const total = battle.logTotal || battle.log.length;
  if (total <= logSeen) return;
  const fresh = battle.log.slice(Math.max(0, battle.log.length - (total - logSeen)));
  logSeen = total;
  for (const entry of fresh) ui.pushLog(entry);
}

/* ───────────────────────────── 이벤트 처리 ───────────────────────────── */

const SK_COLORS = {
  roar: 0xffd166, pounce: 0x7ee8ff, charge: 0xffb066, slam: 0xc98a52,
  smash: 0xff9a3c, pack: 0x8fe36a, dive: 0xbfe8ff, chomp: 0x9ee06a,
  gore: 0xc08bff, evade: 0x6fe8d8, sprint: 0xffe066, gore2: 0xffb0a0,
  crunch: 0xffc247, sailSlash: 0x6fd8ff, hornCharge: 0xffa03c,
  packPounce: 0x9fe86a, flame: 0xff7a3a, titanSlam: 0xff5a3a,
};

function handleEvent(ev) {
  const target = viewByUid.get(ev.uid);
  switch (ev.type) {
    case 'attack': {
      if (target) triggerAttack(target.rig);
      if (ev.ranged) sfx.whoosh();
      break;
    }
    case 'shot': {
      if (target) { triggerShoot(target.rig); sfx.gun(ev.kind); }
      effects.flash(ev.x, ev.y, ev.z, 0.5, ev.color || 0xffe08a, 0.12);
      break;
    }
    case 'beam': {
      if (target) { triggerShoot(target.rig); sfx.laser(); }
      effects.beam(ev.x, ev.y, ev.z, ev.x2, ev.y - 0.2, ev.z2, ev.color || 0x6fe8ff, 0.24);
      effects.flash(ev.x, ev.y, ev.z, 0.8, ev.color || 0x6fe8ff, 0.18);
      stage.shake = Math.max(stage.shake, 0.08);
      break;
    }
    case 'bulletHit': {
      effects.burst(ev.x, ev.y, ev.z, ev.color || 0xffe08a, 6, 3.4);
      break;
    }
    case 'explosion': {
      effects.explosion(ev.x, ev.y, ev.z, ev.r || 3, ev.color || 0xff8a4a);
      sfx.boom();
      stage.shake = Math.max(stage.shake, 0.3);
      break;
    }
    case 'flame': {
      effects.flame(ev.tx, 1.2, ev.tz, ev.r || 3, 0xff7a3a);
      effects.beam(ev.x, 1.6, ev.z, ev.tx, 1.0, ev.tz, 0xff7a3a, 0.3);
      sfx.flame();
      break;
    }
    case 'hit': {
      const crit = !!ev.crit;
      effects.damage(ev.x, ev.y, ev.z, ev.dmg, { crit, dot: ev.dot });
      if (!ev.dot) {
        effects.burst(ev.x, ev.y - 0.5, ev.z, crit ? 0xffd54a : 0xffbb7a, crit ? 15 : 7, crit ? 5.5 : 3.6);
        if (target) {
          triggerHurt(target.rig);
          effects.slash(ev.x, ev.y - 0.15, ev.z, Math.random() * 6, crit ? 2 : 1.4, crit ? 0xfff0c0 : 0xffe8d0);
        }
        if (crit) { sfx.crit(); stage.shake = Math.max(stage.shake, 0.13); }
        else if (ev.dmg > 28) { sfx.hit(true); stage.shake = Math.max(stage.shake, 0.06); }
        else sfx.hit(false);
      }
      break;
    }
    case 'evade': {
      effects.evade(ev.x, 1.9, ev.z);
      if (target) effects.ring(ev.x, ev.z, 0.6, 1.5, 0x8fe3ff, 0.32);
      break;
    }
    case 'block': {
      effects.text(ev.x, 1.9, ev.z, '막음', { color: '#9fd0ff', size: 0.7, life: 0.6 });
      effects.ring(ev.x, ev.z, 0.5, 1.3, 0x9fd0ff, 0.3);
      sfx.clang();
      break;
    }
    case 'bash': {
      if (target) effects.burst(target.u.x, 1.2, target.u.z, 0xc8d0e0, 8, 4);
      break;
    }
    case 'skill': {
      if (target) triggerSkill(target.rig);
      const color = SK_COLORS[ev.kind] || 0xffd166;
      const def = ev.uid ? battle.units.find((u) => u.uid === ev.uid)?.def : null;
      effects.ring(ev.x, ev.z, 0.7, def ? (def.skill.radius || 3) * 1.15 : 3.4, color, 0.5);
      effects.flash(ev.x, 1.5, ev.z, 1.2, color, 0.26);
      effects.burst(ev.x, 1.3, ev.z, color, 8, 3.6);
      effects.text(ev.x, 3.4, ev.z, ev.name || '', { color: '#ffe3a0', size: 0.72, life: 1.1 });
      sfx.skill(ev.kind);
      if (target) {
        target.el.el.classList.add('skill');
        setTimeout(() => target.el?.el.classList.remove('skill'), 900);
      }
      break;
    }
    case 'burst':
    case 'quake': {
      const color = SK_COLORS[ev.kind] || 0xffd166;
      const rr = ev.r || 4;
      effects.ring(ev.x, ev.z, Math.max(1, rr * 0.25), rr * 1.1, color, 0.42);
      effects.dust(ev.x, ev.z, ev.type === 'quake' ? 22 : 12, 0xcfc0a0);
      stage.shake = Math.max(stage.shake, ev.big ? 0.55 : ev.type === 'quake' ? 0.4 : 0.2);
      break;
    }
    case 'tail': {
      effects.ring(ev.x, ev.z, 1.2, 5.2, 0xffc247, 0.44);
      break;
    }
    case 'dashStart': sfx.whoosh(); break;
    case 'dashHit': effects.burst(ev.x, 1.0, ev.z, 0xffe0a0, 10, 4); break;
    case 'takeoff': effects.ring(ev.x, ev.z, 0.6, 3, 0xcfeaff, 0.4); break;
    case 'diveLand': {
      effects.ring(ev.x, ev.z, 0.8, 4.2, 0xcfeaff, 0.5);
      effects.dust(ev.x, ev.z, 14, 0xe8f2ff);
      stage.shake = Math.max(stage.shake, 0.2);
      break;
    }
    case 'chomp': effects.flash(ev.x, 1.2, ev.z, 1.2, 0x9ee06a, 0.25); break;
    case 'buff': {
      if (target) effects.ring(target.u.x, target.u.z, 0.5, 1.8, 0x8fe36a, 0.45);
      break;
    }
    case 'stun': {
      if (target) effects.flash(target.u.x, 2.0, target.u.z, 0.8, 0xffe066, 0.25);
      break;
    }
    case 'launch': {
      if (target) effects.ring(target.u.x, target.u.z, 0.4, 1.6, 0xffd0a0, 0.3);
      break;
    }
    case 'land': {
      effects.dust(ev.x, ev.z, Math.min(14, 4 + Math.round((ev.force || 3) * 1.4)));
      break;
    }
    case 'death': {
      effects.burst(ev.x, 1.0, ev.z, 0xff8a5c, ev.heavy > 12 ? 30 : 20, 6);
      effects.dust(ev.x, ev.z, 12);
      effects.ring(ev.x, ev.z, 0.5, 3.2, 0xff6a4a, 0.6);
      sfx.death();
      stage.shake = Math.max(stage.shake, 0.28);
      break;
    }
    case 'end': endBattle(); break;
    default: break;
  }
}

/* ───────────────────────────── 프레임 갱신 ───────────────────────────── */

const tmpVec = new THREE.Vector3();
const tmpFocus = new THREE.Vector3();

function shortestAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function updateViews(dt, adt) {
  const w = canvas.clientWidth || 1;
  const h = canvas.clientHeight || 1;
  const cam = stage.camera;
  const many = views.length > 18;
  const focusUid = app.focusUid;
  for (const v of views) {
    const u = v.u;
    const k = 1 - Math.exp(-dt * 24);
    v.x += (u.x - v.x) * k;
    v.z += (u.z - v.z) * k;
    const rig = v.rig;
    const hover = u.def.airborne && !u.dead ? 0.62 + Math.sin(performance.now() * 0.003 + u.uid) * 0.1 : 0;
    rig.group.position.set(v.x, u.y + hover, v.z);
    rig.group.rotation.y += shortestAngle(u.facing - rig.group.rotation.y) * Math.min(1, dt * 14);
    rig.group.rotation.x = u.spin || 0;

    const moved = Math.hypot(u.x - v.lastX, u.z - v.lastZ) / Math.max(dt, 0.0001);
    v.lastX = u.x; v.lastZ = u.z;

    animateRig(rig, {
      dt: adt,
      moving: u.moving && !u.dead,
      speed: moved,
      attack: rig.attack,
      skill: rig.skill,
      hurt: rig.hurt,
      dead: u.dead,
      air: u.y > 0.35 || !!u.def.airborne,
    });
    // 사망 연출(animateRig)이 y 를 덮어쓰므로 공중에 뜬 높이를 다시 더한다
    if (u.y > 0) rig.group.position.y += u.y;

    const el = v.el.el;
    const hidePlate = many && app.focusUid !== u.uid;
    el.classList.toggle('hide', hidePlate);
    if (u.dead) {
      el.classList.add('dead');
    } else if (hidePlate) {
      el.classList.remove('dead');
      continue;
    } else {
      el.classList.remove('dead');
      const tmp = tmpVec.set(u.x, u.y + hover + rig.height * 0.92 + 0.42, u.z).project(cam);
      if (tmp.z > 1 || tmp.z < -1) {
        el.style.visibility = 'hidden';
      } else {
        el.style.visibility = 'visible';
        el.style.left = `${(tmp.x * 0.5 + 0.5) * w}px`;
        el.style.top = `${(-tmp.y * 0.5 + 0.5) * h}px`;
        const ratio = Math.max(0, u.hp / u.maxHp);
        v.bar.style.width = `${(ratio * 100).toFixed(1)}%`;
      }
    }
  }
}

function focusPoint() {
  let x = 0, z = 0, n = 0;
  for (const u of battle?.units || []) {
    if (u.dead) continue;
    x += u.x; z += u.z; n++;
  }
  if (!n) return tmpFocus.set(0, 1.2, 0);
  return tmpFocus.set(x / n, 1.3, z / n);
}

let last = performance.now();
let acc = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const rawDt = (now - last) / 1000;
  last = now;
  const dt = Math.min(0.05, Math.max(0.0005, rawDt));

  if (battle && (phase === 'battle' || phase === 'ended')) {
    if (phase === 'battle' && !app.paused && !battle.over) {
      acc += dt * app.speed;
      let guard = 0;
      while (acc >= FIXED && guard < 20) {
        step(battle, FIXED);
        acc -= FIXED;
        guard++;
      }
    }
    const evs = drainEvents(battle);
    for (const ev of evs) handleEvent(ev);
    effects.syncProjectiles(battle.projectiles || []);
    syncLog();
    ui.updateBattle(battle);
  }

  const adt = app.paused ? 0 : dt * (phase === 'battle' ? app.speed : 1);
  updateViews(dt, adt);
  effects.update(app.paused ? 0 : dt * (phase === 'battle' ? app.speed : 1));

  let follow = null;
  if (app.focusUid) {
    const fv = viewByUid.get(app.focusUid);
    if (!fv || fv.u.dead) {
      app.focusUid = null;
      ui.setFocusTag(null);
    }
  }
  if (phase === 'battle' && app.follow) {
    const fv = app.focusUid ? viewByUid.get(app.focusUid) : null;
    follow = fv && !fv.u.dead ? tmpFocus2.set(fv.x, 1.4, fv.z) : focusPoint();
  }
  if (phase === 'battle' && !userZoomed && battle) {
    const want = app.focusUid ? 14 : fitDistance();
    stage.camGoal.dist += (want - stage.camGoal.dist) * Math.min(1, dt * 0.9);
  }
  stage.update(dt, { follow, autoRotate: false });

  if (!downgraded) {
    fpsAccum += dt; fpsFrames++;
    if (fpsAccum > 3) {
      const fps = fpsFrames / fpsAccum;
      if (fps < 34) {
        downgraded = true;
        stage.renderer.setPixelRatio(Math.min(1.35, window.devicePixelRatio || 1));
        if (stage.sun) stage.sun.shadow.mapSize.set(1024, 1024);
      }
      fpsAccum = 0; fpsFrames = 0;
    }
  }
}
const tmpFocus2 = new THREE.Vector3();

/* ───────────────────────────── 입력 ───────────────────────────── */

const pointers = new Map();
let pinchDist = 0;
let tapInfo = null;

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture?.(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) pinchDist = twoFingerDist();
  if (pointers.size === 1) tapInfo = { x: e.clientX, y: e.clientY, moved: 0, t: performance.now() };
}, { passive: true });

canvas.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (p) {
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (tapInfo) tapInfo.moved += Math.hypot(dx, dy);
    if (pointers.size === 1) {
      if (tapInfo && tapInfo.moved > 8) stage.orbit(dx, dy);
    } else if (pointers.size === 2) {
      const d = twoFingerDist();
      if (pinchDist > 0 && d > 0) { stage.zoom(pinchDist / d); userZoomed = true; }
      pinchDist = d;
    }
  }
  // 배치 고스트
  if (phase === 'preview' && pointers.size <= 1) {
    const g = groundFromEvent(e);
    if (g) {
      const def = CREATURE_BY_ID[app.selected];
      let x = g.x, z = g.z;
      if (!app.free && !app.eraser) {
        if (app.activeTeam === 'blue' && x > -1) x = -1;
        if (app.activeTeam === 'red' && x < 1) x = 1;
      }
      const rad = Math.hypot(x, z);
      const max = TUNING.ARENA_RADIUS - 0.8;
      if (rad > max) { x = (x / rad) * max; z = (z / rad) * max; }
      stage.setGhost(x, z, app.eraser ? 0xff8a3a : teamColor(app.activeTeam), def ? Math.max(0.7, def.size * 0.85) : 1);
    }
  }
}, { passive: true });

function twoFingerDist() {
  const arr = [...pointers.values()];
  if (arr.length < 2) return 0;
  return Math.hypot(arr[0].x - arr[1].x, arr[0].y - arr[1].y);
}

function endPointer(e) {
  const wasTap = tapInfo && tapInfo.moved < 10 && performance.now() - tapInfo.t < 700;
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinchDist = 0;
  if (pointers.size === 0) {
    stage.hideGhost();
    tapInfo = null;
  }
  if (!wasTap) { tapInfo = null; return; }
  tapInfo = null;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  handleTap(e);
}

function handleTap(e) {
  if (phase === 'battle' || phase === 'ended') {
    // 유닛 탭 → 그 유닛 따라가기
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    let best = null, bestD = 78;
    for (const v of views) {
      if (v.u.dead) continue;
      const p = tmpVec.set(v.x, v.u.y + 0.9, v.z).project(stage.camera);
      if (p.z > 1 || p.z < -1) continue;
      const sx = (p.x * 0.5 + 0.5) * rect.width;
      const sy = (-p.y * 0.5 + 0.5) * rect.height;
      const d = Math.hypot(sx - px, sy - py);
      if (d < bestD) { bestD = d; best = v; }
    }
    if (best) {
      app.focusUid = best.u.uid;
      app.follow = true;
      ui.setFollow(true);
      ui.setFocusTag(`${best.u.emoji} ${best.u.def.short || best.u.name} 추적 중 · 빈 곳을 탭하면 해제`);
      ui.toast(`🎯 ${best.u.name} 시점`);
      userZoomed = false;
    } else {
      app.focusUid = null;
      ui.setFocusTag(null);
    }
    return;
  }

  if (phase !== 'preview') return;
  const g = groundFromEvent(e);
  if (!g) return;
  if (app.eraser) eraseAt(g.x, g.z);
  else placeAt(g.x, g.z);
}

canvas.addEventListener('pointerup', endPointer, { passive: true });
canvas.addEventListener('pointercancel', (e) => {
  pointers.delete(e.pointerId);
  tapInfo = null;
  stage.hideGhost();
}, { passive: true });
canvas.addEventListener('pointerleave', () => { stage.hideGhost(); }, { passive: true });

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  stage.zoom(e.deltaY > 0 ? 1.08 : 0.93);
  userZoomed = true;
}, { passive: false });

['gesturestart', 'gesturechange', 'gestureend'].forEach((t) => {
  document.addEventListener(t, (e) => e.preventDefault(), { passive: false });
});
document.addEventListener('contextmenu', (e) => e.preventDefault());

function updateFraming() {
  const w = canvas.clientWidth || 1;
  const h = canvas.clientHeight || 1;
  if (phase !== 'preview') { stage.setFocusShift(0, 0); return; }
  // 하단 독에 가리지 않도록, 남은 영역의 중앙에 전장이 오게 화면 중심을 올린다
  const dock = document.getElementById('dock');
  const dockH = dock && !dock.classList.contains('closed') ? dock.getBoundingClientRect().height : 0;
  const shift = Math.max(0, Math.min(0.2, (dockH / h) * 0.5));
  stage.setFocusShift(shift, 0);
}

window.addEventListener('resize', () => { stage.resize(); updateFraming(); });

canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  fatal('그래픽 장치가 잠시 끊겼어요. 페이지를 새로고침 해 주세요.');
});
window.addEventListener('orientationchange', () => setTimeout(() => stage.resize(), 250));

document.addEventListener('visibilitychange', () => {
  if (document.hidden && phase === 'battle' && !app.paused) {
    app.paused = true;
    ui.setPaused(true);
  }
});

/* ───────────────────────────── 시작 ───────────────────────────── */

stage.setArena(ARENA_BY_ID[app.arenaId]);
refreshPreview();
fitPreviewCamera();
updateFraming();
ui.setSound(true);
ui.setSpeed(1);
ui.setFollow(app.follow);
ui.render();
requestAnimationFrame((t) => {
  last = t;
  frame(t);
});
setTimeout(() => ui.hideLoader(), 350);

// 디버그용 (콘솔에서 확인)
window.__game = {
  app, stage, ui, effects,
  get battle() { return battle; },
  get phase() { return phase; },
  placeAt, eraseAt,
};
