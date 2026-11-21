// 동물 vs 동물 — 게임 진입점 (무대 · 시뮬레이션 · UI 연결)
import * as THREE from '../vendor/three.module.js';
import {
  ANIMALS, ANIMAL_BY_ID, ARENA_BY_ID, DEFAULT_TEAMS, PRESETS, TUNING,
} from './config.js';
import {
  createBattle, step, drainEvents, battleSummary, mvpOf, aliveCount,
} from './sim.js';
import { buildAnimalModel, animateRig, triggerAttack, triggerSkill, triggerHurt } from './models.js';
import { Stage } from './scene.js';
import { Effects } from './effects.js';
import { UI } from './ui.js';
import { Sfx } from './audio.js';

const FIXED = 1 / 60;
const canvas = document.getElementById('scene');
const nameplateRoot = document.getElementById('nameplates');

const app = {
  teams: { blue: DEFAULT_TEAMS.blue.slice(), red: DEFAULT_TEAMS.red.slice() },
  arenaId: DEFAULT_TEAMS.arena,
  mode: 'team',
  activeTeam: 'blue',
  speed: 1,
  paused: false,
  follow: true,
  sound: true,
};

const stage = new Stage(canvas);
const effects = new Effects(stage.scene);
const sfx = new Sfx();

let battle = null;
let views = [];
const viewByUid = new Map();
let phase = 'preview';     // preview | battle | ended
let logSeen = 0;
let fpsAccum = 0, fpsFrames = 0, downgraded = false;
let userZoomed = false;

const SK_COLORS = {
  roar: 0xffd166, pounce: 0x7ee8ff, charge: 0xffb066, slam: 0xc98a52,
  smash: 0xff9a3c, pack: 0x8fe36a, dive: 0xbfe8ff, chomp: 0x9ee06a,
  gore: 0xc08bff, evade: 0x6fe8d8, sprint: 0xffe066, gore2: 0xffb0a0,
};

const ui = new UI(app, {
  onTeamsChange: () => {
    if (phase === 'preview') refreshPreview();
  },
  onArenaChange: (id) => {
    stage.setArena(ARENA_BY_ID[id] || ARENA_BY_ID.savanna);
    if (phase === 'preview') refreshPreview();
  },
  onStart: () => startBattle(),
  onRematch: () => { startBattle(); },
  onRebuild: () => backToBuilder(),
  onPause: () => togglePause(),
  onSpeed: () => cycleSpeed(),
  onFollow: () => {
    app.follow = !app.follow;
    ui.setFollow(app.follow);
    ui.toast(app.follow ? '🎥 자동 추적 켜짐' : '🎥 자동 추적 꺼짐');
  },
  onToggleSound: () => {
    app.sound = !app.sound;
    sfx.init();
    sfx.setEnabled(app.sound);
    ui.setSound(app.sound);
  },
});

/* ────────────────────────────── 뷰 관리 ────────────────────────────── */

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
    v.el?.remove();
  }
  views = [];
  viewByUid.clear();
  nameplateRoot.innerHTML = '';
}

function createNameplate(u) {
  const el = document.createElement('div');
  el.className = `np ${u.team}`;
  el.innerHTML = `<span class="np-name">${u.emoji} ${u.name}</span><span class="np-bar"><i></i></span>`;
  nameplateRoot.appendChild(el);
  return { el, bar: el.querySelector('i'), name: el.querySelector('.np-name') };
}

function buildViews() {
  clearViews();
  for (const u of battle.units) {
    const rig = buildAnimalModel(u.def, u.team);
    rig.group.position.set(u.x, 0, u.z);
    rig.group.rotation.y = u.facing;
    stage.scene.add(rig.group);
    const v = {
      u, rig, el: createNameplate(u),
      x: u.x, z: u.z, lastX: u.x, lastZ: u.z,
      bar: null,
    };
    v.bar = v.el.bar;
    views.push(v);
    viewByUid.set(u.uid, v);
  }
}

/* 미리보기: 두 팀이 마주 보는 대형 */
function layoutPreview() {
  for (const u of battle.units) {
    const same = battle.units.filter((o) => o.team === u.team);
    const i = same.indexOf(u);
    const n = same.length;
    const t = n === 1 ? 0 : (i / (n - 1) - 0.5) * 1.45;
    const side = u.team === 'blue' ? -1 : 1;
    const rad = 7.2;
    u.x = side * Math.cos(t) * rad * 0.92;
    u.z = Math.sin(t) * rad;
    u.facing = Math.atan2(-u.x, -u.z);
    u.state = 'idle';
  }
}

function refreshPreview() {
  if (phase !== 'preview') return;
  battle = createBattle({ blue: app.teams.blue, red: app.teams.red, arenaId: app.arenaId, seed: 1 });
  layoutPreview();
  buildViews();
  effects.clear();
}

/* ────────────────────────────── 배틀 진행 ────────────────────────────── */

function startBattle() {
  if (!app.teams.blue.length || !app.teams.red.length) return;
  sfx.init();
  const arena = ARENA_BY_ID[app.arenaId] || ARENA_BY_ID.savanna;
  battle = createBattle({
    blue: app.teams.blue, red: app.teams.red, arenaId: app.arenaId,
    seed: (Math.random() * 1e9) | 0,
  });
  buildViews();
  effects.clear();
  logSeen = 0;
  phase = 'battle';
  app.paused = false;
  userZoomed = false;
  app.speed = 1;
  ui.hideBanner();
  ui.hideBuilder();
  ui.showBattleUI();
  ui.setPaused(false);
  ui.setSpeed(1);
  ui.setFollow(app.follow);
  ui.buildStrips(battle);
  ui.el.logList.innerHTML = '';
  const aspect = (canvas.clientWidth || 1) / (canvas.clientHeight || 1);
  const base = battle.units.length <= 2 ? 24 : battle.units.length <= 4 ? 29 : 34;
  stage.camGoal.dist = base * (aspect < 0.7 ? 1.15 : 1);
  stage.camGoal.phi = 0.88;
  stage.camGoal.target.set(0, 1.4, 0);
  syncLog();
}

function backToBuilder() {
  phase = 'preview';
  ui.hideBanner();
  ui.hideBattleUI();
  ui.showBuilder();
  refreshPreview();
  const aspect = (canvas.clientWidth || 1) / (canvas.clientHeight || 1);
  stage.camGoal.dist = 34 * (aspect < 0.7 ? 1.12 : 1);
  stage.camGoal.phi = 0.95;
}

function togglePause() {
  if (phase !== 'battle') return;
  app.paused = !app.paused;
  ui.setPaused(app.paused);
}

function cycleSpeed() {
  app.speed = app.speed === 1 ? 2 : 1;
  ui.setSpeed(app.speed);
  ui.setPaused(app.paused);
}

function endBattle() {
  phase = 'ended';
  const summary = battleSummary(battle);
  const mvp = mvpOf(battle);
  sfx.victory();
  ui.showBanner(summary, mvp);
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

/* ────────────────────────────── 이벤트 처리 ────────────────────────────── */

function handleEvent(ev) {
  const target = viewByUid.get(ev.uid);
  switch (ev.type) {
    case 'attack': {
      if (target) triggerAttack(target.rig);
      break;
    }
    case 'hit': {
      const crit = !!ev.crit;
      effects.damage(ev.x, ev.y, ev.z, ev.dmg, { crit, dot: ev.dot });
      if (!ev.dot) {
        effects.burst(ev.x, ev.y - 0.5, ev.z, crit ? 0xffd54a : 0xffbb7a, crit ? 16 : 8, crit ? 5.5 : 3.6);
        if (target) {
          triggerHurt(target.rig);
          effects.slash(ev.x, ev.y - 0.15, ev.z, Math.random() * 6, crit ? 2 : 1.4, crit ? 0xfff0c0 : 0xffe8d0);
        }
        if (crit) { sfx.crit(); stage.shake = Math.max(stage.shake, 0.14); }
        else if (ev.dmg > 24) { sfx.hit(true); stage.shake = Math.max(stage.shake, 0.06); }
        else sfx.hit(false);
      }
      break;
    }
    case 'evade': {
      effects.evade(ev.x, 1.9, ev.z);
      if (target) effects.ring(ev.x, ev.z, 0.6, 1.5, 0x8fe3ff, 0.32);
      break;
    }
    case 'skill': {
      if (target) triggerSkill(target.rig);
      const color = SK_COLORS[ev.kind] || 0xffd166;
      const def = ANIMAL_BY_ID[ev.uid ? battle.units.find((u) => u.uid === ev.uid)?.id : ''] || null;
      effects.ring(ev.x, ev.z, 0.7, def ? (def.skill.radius || 3) * 1.15 : 3.4, color, 0.5);
      effects.flash(ev.x, 1.5, ev.z, 1.5, color, 0.3);
      effects.burst(ev.x, 1.3, ev.z, color, 14, 4.2);
      effects.text(ev.x, 2.9, ev.z, ev.name || '', { color: '#ffe3a0', size: 0.62, life: 1.1 });
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
      effects.ring(ev.x, ev.z, Math.max(1, (ev.r || 4) * 0.25), (ev.r || 4) * 1.1, color, 0.42);
      effects.dust(ev.x, ev.z, ev.type === 'quake' ? 22 : 12, 0xcfc0a0);
      stage.shake = Math.max(stage.shake, ev.type === 'quake' ? 0.4 : 0.22);
      break;
    }
    case 'dashStart': {
      sfx.whoosh();
      break;
    }
    case 'dashHit': {
      effects.burst(ev.x, 1.0, ev.z, 0xffe0a0, 10, 4);
      break;
    }
    case 'takeoff': {
      effects.ring(ev.x, ev.z, 0.6, 3, 0xcfeaff, 0.4);
      break;
    }
    case 'diveLand': {
      effects.ring(ev.x, ev.z, 0.8, 4.2, 0xcfeaff, 0.5);
      effects.dust(ev.x, ev.z, 14, 0xe8f2ff);
      stage.shake = Math.max(stage.shake, 0.2);
      break;
    }
    case 'chomp': {
      effects.flash(ev.x, 1.2, ev.z, 1.2, 0x9ee06a, 0.25);
      break;
    }
    case 'buff': {
      if (target) {
        effects.ring(target.u.x, target.u.z, 0.5, 1.8, 0x8fe36a, 0.45);
      }
      break;
    }
    case 'stun': {
      if (target) effects.flash(target.u.x, 2.0, target.u.z, 0.8, 0xffe066, 0.25);
      break;
    }
    case 'death': {
      effects.burst(ev.x, 1.0, ev.z, 0xff8a5c, 26, 6);
      effects.dust(ev.x, ev.z, 14);
      effects.ring(ev.x, ev.z, 0.5, 3.2, 0xff6a4a, 0.6);
      sfx.death();
      stage.shake = Math.max(stage.shake, 0.32);
      break;
    }
    case 'end': {
      endBattle();
      break;
    }
    default: break;
  }
}

/* ────────────────────────────── 프레임 갱신 ────────────────────────────── */

function updateViews(dt, adt) {
  const w = canvas.clientWidth || 1;
  const h = canvas.clientHeight || 1;
  const cam = stage.camera;
  for (const v of views) {
    const u = v.u;
    const k = 1 - Math.exp(-dt * 24);
    v.x += (u.x - v.x) * k;
    v.z += (u.z - v.z) * k;
    const rig = v.rig;
    rig.group.position.set(v.x, u.y, v.z);
    rig.group.rotation.y += shortestAngle(u.facing - rig.group.rotation.y) * Math.min(1, dt * 14);

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
      air: u.y > 0.35,
    });

    // 이름표
    const el = v.el.el;
    if (u.dead) {
      el.classList.add('dead');
    } else {
      el.classList.remove('dead');
      const tmp = tmpVec.set(u.x, u.y + rig.height * 0.92 + 0.42, u.z).project(cam);
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

const tmpVec = new THREE.Vector3();
function shortestAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function fitDistance() {
  const alive = battle.units.filter((u) => !u.dead);
  if (alive.length < 2) return 26;
  let maxD = 0;
  for (const a of alive) {
    for (const b of alive) {
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      if (d > maxD) maxD = d;
    }
  }
  const aspect = (canvas.clientWidth || 1) / (canvas.clientHeight || 1);
  const narrow = aspect < 0.7 ? 1.25 : aspect < 0.95 ? 1.08 : 1;
  return Math.max(20, Math.min(58, (maxD * 1.2 + 17) * narrow));
}

function focusPoint() {
  let x = 0, z = 0, n = 0;
  for (const u of battle.units) {
    if (u.dead) continue;
    x += u.x; z += u.z; n++;
  }
  if (!n) return new THREE.Vector3(0, 1.2, 0);
  return tmpFocus.set(x / n, 1.3, z / n);
}
const tmpFocus = new THREE.Vector3();

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
      while (acc >= FIXED && guard < 14) {
        step(battle, FIXED);
        acc -= FIXED;
        guard++;
      }
    }
    const evs = drainEvents(battle);
    for (const ev of evs) handleEvent(ev);
    syncLog();
    ui.updateBattle(battle);
  }

  const adt = app.paused ? 0 : dt * (phase === 'battle' ? app.speed : 1);
  updateViews(dt, adt);
  effects.update(app.paused ? 0 : dt * (phase === 'battle' ? app.speed : 1));

  const follow = phase === 'battle' && app.follow ? focusPoint() : null;
  if (phase === 'battle' && !userZoomed && battle) {
    stage.camGoal.dist += (fitDistance() - stage.camGoal.dist) * Math.min(1, dt * 0.9);
  }
  stage.update(dt, { follow, autoRotate: phase === 'preview' });

  // 품질 자동 조정 (한 번만)
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

/* ────────────────────────────── 입력 ────────────────────────────── */

const pointers = new Map();
let pinchDist = 0;

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture?.(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) pinchDist = twoFingerDist();
}, { passive: true });

canvas.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  const dx = e.clientX - p.x;
  const dy = e.clientY - p.y;
  p.x = e.clientX; p.y = e.clientY;
  if (pointers.size === 1) {
    stage.orbit(dx, dy);
  } else if (pointers.size === 2) {
    const d = twoFingerDist();
    if (pinchDist > 0 && d > 0) { stage.zoom(pinchDist / d); userZoomed = true; }
    pinchDist = d;
  }
}, { passive: true });

function twoFingerDist() {
  const arr = [...pointers.values()];
  if (arr.length < 2) return 0;
  return Math.hypot(arr[0].x - arr[1].x, arr[0].y - arr[1].y);
}

const endPointer = (e) => {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinchDist = 0;
};
canvas.addEventListener('pointerup', endPointer, { passive: true });
canvas.addEventListener('pointercancel', endPointer, { passive: true });
canvas.addEventListener('pointerleave', endPointer, { passive: true });

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  stage.zoom(e.deltaY > 0 ? 1.08 : 0.93);
  userZoomed = true;
}, { passive: false });

// iOS 제스처(페이지 확대) · 길게 누르기 메뉴 차단
['gesturestart', 'gesturechange', 'gestureend'].forEach((t) => {
  document.addEventListener(t, (e) => e.preventDefault(), { passive: false });
});
document.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('resize', () => stage.resize());
window.addEventListener('orientationchange', () => setTimeout(() => stage.resize(), 250));

document.addEventListener('visibilitychange', () => {
  if (document.hidden && phase === 'battle' && !app.paused) {
    app.paused = true;
    ui.setPaused(true);
  }
});

/* ────────────────────────────── 시작 ────────────────────────────── */

stage.setArena(ARENA_BY_ID[app.arenaId]);
stage.camGoal.dist = 30;
stage.camGoal.phi = 0.95;
refreshPreview();
ui.setSound(true);
requestAnimationFrame((t) => {
  last = t;
  frame(t);
});
setTimeout(() => ui.hideLoader(), 350);

// 디버그용 (콘솔에서 확인)
window.__game = { app, stage, ui, get battle() { return battle; }, get phase() { return phase; } };
