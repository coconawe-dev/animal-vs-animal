// 동물 vs 동물 — 절차적 3D 동물 모델 & 애니메이션 리그
// 외부 모델 파일 없이 Three.js 기본 도형만으로 12종의 실루엣을 만든다.

import * as THREE from '../vendor/three.module.js';

const G = {
  sphere: new THREE.SphereGeometry(1, 14, 10),
  sphereLow: new THREE.SphereGeometry(1, 10, 7),
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 12),
  cylLow: new THREE.CylinderGeometry(1, 1, 1, 8),
  leg: new THREE.CylinderGeometry(0.72, 1, 1, 10),
  cone: new THREE.ConeGeometry(1, 1, 10),
  coneLow: new THREE.ConeGeometry(1, 1, 7),
  capsule: new THREE.CapsuleGeometry(0.5, 1, 4, 10),
  torus: new THREE.TorusGeometry(1, 0.22, 6, 16),
  plane: new THREE.PlaneGeometry(1, 1),
};

// 상어 주둥이 — 끝이 바늘처럼 뾰족하지 않고 둥글게 마무리되는 방추형 (밑면 반지름 1 · 길이 1)
const SNOUT_GEO = (() => {
  const pts = [];
  const N = 14;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const r = Math.pow(Math.max(0, 1 - Math.pow(t, 1.8)), 0.62);
    pts.push(new THREE.Vector2(Math.max(0.0001, r), t));
  }
  return new THREE.LatheGeometry(pts, 12);
})();

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color, flatShading: true, roughness: 0.78, metalness: 0.02, ...opts,
  });
}

function add(parent, geo, material, pos, scale, rot, shadow = true) {
  const m = new THREE.Mesh(geo, material);
  if (pos) m.position.set(pos[0], pos[1], pos[2]);
  if (scale) {
    if (typeof scale === 'number') m.scale.setScalar(scale);
    else m.scale.set(scale[0], scale[1], scale[2]);
  }
  if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
  m.castShadow = shadow;
  m.receiveShadow = false;
  parent.add(m);
  return m;
}

// 네 발 다리: 엉덩이/어깨에 피벗을 두고 아래로 뻗는다
function quadLegs(body, material, opts = {}) {
  const { x = 0.32, zf = 0.45, zb = -0.45, len = 0.62, r = 0.11, hoof = null, y = 0 } = opts;
  const legs = [];
  const spots = [
    [x, y, zf, 0], [-x, y, zf, Math.PI], [x, y, zb, Math.PI], [-x, y, zb, 0],
  ];
  spots.forEach(([px, py, pz, phase], i) => {
    const pivot = new THREE.Group();
    pivot.position.set(px, py, pz);
    pivot.rotation.order = 'YXZ';
    body.add(pivot);
    add(pivot, G.leg, material, [0, -len / 2, 0], [r, len, r]);
    if (hoof) add(pivot, G.sphereLow, hoof, [0, -len + r * 0.3, 0.02], [r * 1.25, r * 0.7, r * 1.5]);
    legs.push({ pivot, phase, front: i < 2, left: px > 0 });
  });
  return legs;
}

/* ───────────────────────────── 사자 ───────────────────────────── */
function buildLion(g, m, rig) {
  const body = new THREE.Group();
  body.position.y = 0.94;
  g.add(body); rig.body = body; rig.bodyY = 0.94;

  add(body, G.sphere, m.main, [0, 0.02, -0.02], [0.5, 0.46, 0.88]);
  add(body, G.sphere, m.main, [0, 0.14, 0.46], [0.46, 0.48, 0.4]);
  add(body, G.sphereLow, m.belly, [0, -0.16, 0.12], [0.4, 0.26, 0.62], null, false);

  rig.legs = quadLegs(body, m.main, { x: 0.33, zf: 0.52, zb: -0.46, len: 0.9, r: 0.12 });
  rig.legs.forEach((l) => { if (l.front) l.pivot.position.y = 0.06; });

  const head = new THREE.Group();
  head.position.set(0, 0.48, 0.8);
  body.add(head); rig.head = head;

  add(head, G.sphereLow, m.dark, [0, 0.0, -0.08], [0.46, 0.44, 0.34]);   // 갈기
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    add(head, G.coneLow, m.dark, [Math.cos(a) * 0.4, Math.sin(a) * 0.38, -0.08], [0.14, 0.22, 0.14],
      [Math.PI / 2 + Math.sin(a) * 0.4, 0, -a], false);
  }
  add(head, G.sphere, m.main, [0, 0.02, 0.2], [0.3, 0.29, 0.3]);
  add(head, G.sphere, m.accent, [0, -0.06, 0.42], [0.17, 0.15, 0.2]);   // 주둥이
  const lionJaw = new THREE.Group();
  lionJaw.position.set(0, -0.13, 0.3);
  head.add(lionJaw); rig.jaw = lionJaw;
  add(lionJaw, G.sphereLow, m.belly, [0, 0, 0.12], [0.14, 0.06, 0.18], null, false);
  add(lionJaw, G.box, m.accent, [0, 0.05, 0.22], [0.13, 0.03, 0.07], null, false);
  add(head, G.sphereLow, m.dark, [0, -0.02, 0.58], [0.07, 0.06, 0.06], null, false);
  add(head, G.sphereLow, m.eye, [0.14, 0.1, 0.36], [0.045, 0.05, 0.04], null, false);
  add(head, G.sphereLow, m.eye, [-0.14, 0.1, 0.36], [0.045, 0.05, 0.04], null, false);
  add(head, G.sphereLow, m.main, [0.2, 0.28, 0.02], [0.09, 0.1, 0.06], null, false);
  add(head, G.sphereLow, m.main, [-0.2, 0.28, 0.02], [0.09, 0.1, 0.06], null, false);

  const tail = new THREE.Group();
  tail.position.set(0, 0.18, -0.82);
  body.add(tail); rig.tail = tail;
  add(tail, G.cyl, m.main, [0, 0.12, -0.18], [0.06, 0.55, 0.06], [0.5, 0, 0]);
  const tuft = new THREE.Group(); tuft.position.set(0, 0.34, -0.34); tail.add(tuft); rig.tailTip = tuft;
  add(tuft, G.sphereLow, m.dark, [0, 0.04, -0.02], [0.11, 0.16, 0.11]);
  rig.height = 1.5;
}

/* ───────────────────────────── 호랑이 ───────────────────────────── */
function buildTiger(g, m, rig) {
  const body = new THREE.Group();
  body.position.y = 0.9;
  g.add(body); rig.body = body; rig.bodyY = 0.9;

  add(body, G.sphere, m.main, [0, 0, -0.02], [0.45, 0.44, 0.95]);
  add(body, G.sphere, m.main, [0, 0.1, 0.44], [0.42, 0.44, 0.4]);
  add(body, G.sphereLow, m.belly, [0, -0.2, 0.1], [0.34, 0.2, 0.64], null, false);
  // 검은 줄무늬 (옆면 + 등)
  for (let i = 0; i < 5; i++) {
    const z = 0.52 - i * 0.24;
    const h = 0.26 - Math.abs(z) * 0.06;
    add(body, G.box, m.dark, [0.4, 0.12, z], [0.03, h, 0.07], [0, 0, 0.25], false);
    add(body, G.box, m.dark, [-0.4, 0.12, z], [0.03, h, 0.07], [0, 0, -0.25], false);
    add(body, G.box, m.dark, [0, 0.38, z], [0.5, 0.035, 0.08], [0, 0, 0], false);
  }

  rig.legs = quadLegs(body, m.main, { x: 0.3, zf: 0.52, zb: -0.5, len: 0.88, r: 0.11 });
  rig.legs.forEach((l) => add(l.pivot, G.box, m.dark, [0, -0.4, 0], [0.19, 0.06, 0.19], null, false));

  const head = new THREE.Group();
  head.position.set(0, 0.42, 0.86);
  body.add(head); rig.head = head;
  add(head, G.sphere, m.main, [0, 0, 0], [0.31, 0.29, 0.3]);
  add(head, G.sphere, m.accent, [0, -0.08, 0.24], [0.2, 0.16, 0.2]);
  const tigerJaw = new THREE.Group();
  tigerJaw.position.set(0, -0.11, 0.14);
  head.add(tigerJaw); rig.jaw = tigerJaw;
  add(tigerJaw, G.sphereLow, m.belly, [0, 0, 0.1], [0.13, 0.06, 0.15], null, false);
  add(tigerJaw, G.box, m.accent, [0, 0.04, 0.18], [0.12, 0.03, 0.06], null, false);
  add(head, G.sphereLow, m.belly, [0, -0.14, 0.34], [0.13, 0.1, 0.1], null, false);
  add(head, G.sphereLow, m.eye, [0.15, 0.08, 0.2], [0.045, 0.05, 0.04], null, false);
  add(head, G.sphereLow, m.eye, [-0.15, 0.08, 0.2], [0.045, 0.05, 0.04], null, false);
  add(head, G.coneLow, m.main, [0.2, 0.26, -0.02], [0.1, 0.14, 0.08], [0, 0, -0.3]);
  add(head, G.coneLow, m.main, [-0.2, 0.26, -0.02], [0.1, 0.14, 0.08], [0, 0, 0.3]);
  // 얼굴 줄무늬
  add(head, G.box, m.dark, [0.06, 0.06, 0.29], [0.03, 0.2, 0.03], [0.4, 0, 0.2], false);
  add(head, G.box, m.dark, [-0.06, 0.06, 0.29], [0.03, 0.2, 0.03], [0.4, 0, -0.2], false);

  const tail = new THREE.Group();
  tail.position.set(0, 0.2, -0.85);
  body.add(tail); rig.tail = tail;
  add(tail, G.cyl, m.main, [0, 0.04, -0.24], [0.07, 0.62, 0.07], [1.15, 0, 0]);
  add(tail, G.sphereLow, m.dark, [0, 0.16, -0.5], [0.09, 0.09, 0.12]);
  rig.height = 1.42;
}

/* ───────────────────────────── 코끼리 ───────────────────────────── */
function buildElephant(g, m, rig) {
  const body = new THREE.Group();
  body.position.y = 1.02;
  g.add(body); rig.body = body; rig.bodyY = 1.02;

  add(body, G.sphere, m.main, [0, 0.04, -0.05], [0.72, 0.68, 0.95]);
  add(body, G.sphere, m.main, [0, 0.2, 0.5], [0.62, 0.6, 0.5]);
  add(body, G.sphereLow, m.dark, [0, 0.46, -0.15], [0.62, 0.3, 0.7], null, false);

  rig.legs = quadLegs(body, m.dark, { x: 0.44, zf: 0.55, zb: -0.55, len: 0.86, r: 0.19, hoof: m.accent });
  rig.legs.forEach((l) => { l.pivot.position.y = -0.18; });

  const head = new THREE.Group();
  head.position.set(0, 0.34, 1.0);
  body.add(head); rig.head = head;
  add(head, G.sphere, m.main, [0, 0, 0], [0.4, 0.4, 0.36]);
  // 큰 귀
  const earL = add(head, G.sphereLow, m.dark, [0.4, 0.04, -0.08], [0.07, 0.42, 0.34], [0, 0.4, 0.15]);
  const earR = add(head, G.sphereLow, m.dark, [-0.4, 0.04, -0.08], [0.07, 0.42, 0.34], [0, -0.4, -0.15]);
  rig.ears = [earL, earR];
  // 상아
  add(head, G.cone, m.accent, [0.16, -0.24, 0.3], [0.05, 0.36, 0.05], [0.9, 0, 0.1]);
  add(head, G.cone, m.accent, [-0.16, -0.24, 0.3], [0.05, 0.36, 0.05], [0.9, 0, -0.1]);
  add(head, G.sphereLow, m.eye, [0.2, 0.1, 0.26], [0.05, 0.055, 0.04], null, false);
  add(head, G.sphereLow, m.eye, [-0.2, 0.1, 0.26], [0.05, 0.055, 0.04], null, false);
  // 코 (3마디)
  const trunk = new THREE.Group();
  trunk.position.set(0, -0.1, 0.3);
  head.add(trunk); rig.trunk = trunk;
  const t1 = add(trunk, G.cyl, m.main, [0, -0.2, 0.03], [0.13, 0.42, 0.13], [0.2, 0, 0]);
  const t2 = new THREE.Group(); t2.position.set(0, -0.38, 0.1); trunk.add(t2);
  add(t2, G.cyl, m.main, [0, -0.16, 0], [0.1, 0.34, 0.1], [-0.2, 0, 0]);
  rig.trunkTip = t2;
  add(t2, G.sphereLow, m.dark, [0, -0.32, 0.02], [0.09, 0.08, 0.09], null, false);

  const tail = new THREE.Group();
  tail.position.set(0, 0.24, -0.92);
  body.add(tail); rig.tail = tail;
  add(tail, G.cyl, m.dark, [0, -0.14, -0.04], [0.045, 0.5, 0.045], [0.1, 0, 0]);
  rig.height = 1.75;
}

/* ───────────────────────────── 곰 ───────────────────────────── */
function buildBear(g, m, rig) {
  const body = new THREE.Group();
  body.position.y = 0.88;
  g.add(body); rig.body = body; rig.bodyY = 0.88;

  add(body, G.sphere, m.main, [0, 0, -0.04], [0.56, 0.52, 0.88]);
  add(body, G.sphere, m.main, [0, 0.28, 0.3], [0.5, 0.4, 0.42]);   // 어깨 혹
  add(body, G.sphereLow, m.belly, [0, -0.22, 0.1], [0.4, 0.24, 0.6], null, false);

  rig.legs = quadLegs(body, m.main, { x: 0.38, zf: 0.5, zb: -0.46, len: 0.78, r: 0.16, hoof: m.dark });

  const head = new THREE.Group();
  head.position.set(0, 0.44, 0.72);
  body.add(head); rig.head = head;
  add(head, G.sphere, m.main, [0, 0, 0], [0.34, 0.32, 0.32]);
  add(head, G.sphere, m.accent, [0, -0.1, 0.26], [0.2, 0.16, 0.2]);
  add(head, G.sphereLow, m.dark, [0, -0.06, 0.4], [0.08, 0.06, 0.06], null, false);
  add(head, G.sphereLow, m.eye, [0.15, 0.08, 0.22], [0.045, 0.05, 0.04], null, false);
  add(head, G.sphereLow, m.eye, [-0.15, 0.08, 0.22], [0.045, 0.05, 0.04], null, false);
  add(head, G.sphereLow, m.dark, [0.22, 0.28, -0.02], [0.11, 0.11, 0.07], null, false);
  add(head, G.sphereLow, m.dark, [-0.22, 0.28, -0.02], [0.11, 0.11, 0.07], null, false);

  const tail = new THREE.Group();
  tail.position.set(0, 0.1, -0.8);
  body.add(tail); rig.tail = tail;
  add(tail, G.sphereLow, m.main, [0, 0, -0.06], [0.1, 0.1, 0.1]);
  rig.height = 1.45;
}

/* ───────────────────────────── 늑대 ───────────────────────────── */
function buildWolf(g, m, rig) {
  const body = new THREE.Group();
  body.position.y = 0.82;
  g.add(body); rig.body = body; rig.bodyY = 0.82;

  add(body, G.sphere, m.main, [0, 0, -0.02], [0.38, 0.38, 0.88]);
  add(body, G.sphere, m.main, [0, 0.1, 0.42], [0.36, 0.38, 0.36]);
  add(body, G.sphereLow, m.belly, [0, -0.18, 0.1], [0.3, 0.18, 0.58], null, false);
  add(body, G.sphereLow, m.dark, [0, 0.3, -0.1], [0.28, 0.14, 0.5], null, false);  // 등 털

  rig.legs = quadLegs(body, m.main, { x: 0.26, zf: 0.5, zb: -0.48, len: 0.84, r: 0.09 });

  const head = new THREE.Group();
  head.position.set(0, 0.38, 0.78);
  body.add(head); rig.head = head;
  add(head, G.sphere, m.main, [0, 0, 0], [0.26, 0.25, 0.27]);
  add(head, G.cone, m.accent, [0, -0.06, 0.28], [0.16, 0.34, 0.13], [Math.PI / 2, 0, 0]);  // 주둥이
  const wolfJaw = new THREE.Group();
  wolfJaw.position.set(0, -0.1, 0.16);
  head.add(wolfJaw); rig.jaw = wolfJaw;
  add(wolfJaw, G.box, m.belly, [0, 0, 0.12], [0.11, 0.05, 0.2], null, false);
  add(head, G.sphereLow, m.eye, [0.13, 0.07, 0.16], [0.04, 0.045, 0.035], null, false);
  add(head, G.sphereLow, m.eye, [-0.13, 0.07, 0.16], [0.04, 0.045, 0.035], null, false);
  add(head, G.coneLow, m.main, [0.15, 0.26, -0.04], [0.09, 0.2, 0.07], [-0.1, 0, -0.25]);
  add(head, G.coneLow, m.main, [-0.15, 0.26, -0.04], [0.09, 0.2, 0.07], [-0.1, 0, 0.25]);

  const tail = new THREE.Group();
  tail.position.set(0, 0.14, -0.82);
  body.add(tail); rig.tail = tail;
  add(tail, G.cone, m.main, [0, 0.06, -0.28], [0.12, 0.6, 0.12], [1.35, 0, 0]);
  rig.height = 1.28;
}

/* ───────────────────────────── 독수리 ───────────────────────────── */
function buildEagle(g, m, rig) {
  const body = new THREE.Group();
  body.position.y = 0.62;
  g.add(body); rig.body = body; rig.bodyY = 0.62;

  add(body, G.sphere, m.main, [0, 0, 0], [0.3, 0.34, 0.5], [0.25, 0, 0]);
  add(body, G.sphereLow, m.belly, [0, -0.14, 0.05], [0.24, 0.18, 0.34], null, false);

  rig.legs = quadLegs(body, m.accent, { x: 0.13, zf: 0.16, zb: 0.02, len: 0.44, r: 0.05 });

  // 날개 (접힌 상태 / 펼친 상태)
  const wings = [];
  [1, -1].forEach((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.26, 0.1, 0);
    body.add(pivot);
    const featherMat = m.dark;
    add(pivot, G.sphereLow, m.main, [side * 0.22, 0.02, -0.02], [0.34, 0.1, 0.3], [0, side * 0.1, 0], true);
    for (let i = 0; i < 3; i++) {
      add(pivot, G.sphereLow, featherMat, [side * (0.24 + i * 0.02), -0.01, -0.26 - i * 0.12],
        [0.13, 0.05, 0.2], [0, side * (0.12 + i * 0.1), 0], false);
    }
    wings.push({ pivot, side });
  });
  rig.wings = wings;

  const head = new THREE.Group();
  head.position.set(0, 0.26, 0.4);
  body.add(head); rig.head = head;
  add(head, G.sphere, m.accent, [0, 0, 0], [0.19, 0.19, 0.19]);          // 흰 머리
  add(head, G.cone, m.belly, [0, -0.02, 0.26], [0.09, 0.26, 0.09], [Math.PI / 2, 0, 0]);
  const eagleBeak = new THREE.Group();
  eagleBeak.position.set(0, -0.05, 0.12);
  head.add(eagleBeak); rig.jaw = eagleBeak;
  add(eagleBeak, G.coneLow, m.accent, [0, 0, 0.14], [0.07, 0.2, 0.07], [Math.PI / 2, 0, 0], false);
  add(head, G.sphereLow, m.eye, [0.1, 0.06, 0.12], [0.035, 0.04, 0.03], null, false);
  add(head, G.sphereLow, m.eye, [-0.1, 0.06, 0.12], [0.035, 0.04, 0.03], null, false);

  // 꼬리깃
  const tail = new THREE.Group();
  tail.position.set(0, -0.06, -0.4);
  body.add(tail); rig.tail = tail;
  add(tail, G.box, m.accent, [0, 0, -0.22], [0.24, 0.05, 0.44], [0.1, 0, 0], false);
  rig.height = 1.05;
  rig.air = true;
}

/* ───────────────────────────── 악어 ───────────────────────────── */
function buildCrocodile(g, m, rig) {
  const body = new THREE.Group();
  body.position.y = 0.42;
  g.add(body); rig.body = body; rig.bodyY = 0.42;

  add(body, G.sphere, m.main, [0, 0, -0.1], [0.42, 0.3, 1.0]);
  add(body, G.sphereLow, m.belly, [0, -0.12, -0.05], [0.34, 0.14, 0.86], null, false);
  // 등 돌기
  for (let i = 0; i < 6; i++) {
    add(body, G.coneLow, m.dark, [0, 0.24, 0.45 - i * 0.22], [0.11, 0.16, 0.1], [-0.2, 0, 0], false);
  }

  rig.legs = quadLegs(body, m.dark, { x: 0.36, zf: 0.42, zb: -0.46, len: 0.42, r: 0.11 });
  rig.legs.forEach((l) => { l.pivot.rotation.z = l.left ? 0.5 : -0.5; });

  const head = new THREE.Group();
  head.position.set(0, 0.06, 0.9);
  body.add(head); rig.head = head;
  add(head, G.sphere, m.main, [0, 0.02, 0.06], [0.28, 0.2, 0.3]);
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.02, 0.2);
  head.add(jaw); rig.jaw = jaw;
  add(head, G.box, m.main, [0, 0.04, 0.42], [0.34, 0.14, 0.62]);          // 위턱
  add(jaw, G.box, m.belly, [0, -0.06, 0.4], [0.3, 0.1, 0.58]);            // 아래턱
  for (let i = 0; i < 4; i++) {
    add(head, G.coneLow, m.accent, [0.14, -0.03, 0.22 + i * 0.14], [0.035, 0.1, 0.035], [Math.PI, 0, 0], false);
    add(head, G.coneLow, m.accent, [-0.14, -0.03, 0.22 + i * 0.14], [0.035, 0.1, 0.035], [Math.PI, 0, 0], false);
  }
  add(head, G.sphereLow, m.eye, [0.16, 0.16, 0.12], [0.055, 0.06, 0.05], null, false);
  add(head, G.sphereLow, m.eye, [-0.16, 0.16, 0.12], [0.055, 0.06, 0.05], null, false);

  const tail = new THREE.Group();
  tail.position.set(0, 0.02, -1.0);
  body.add(tail); rig.tail = tail;
  add(tail, G.cone, m.main, [0, 0, -0.36], [0.26, 0.86, 0.2], [-Math.PI / 2, 0, 0]);
  add(tail, G.coneLow, m.dark, [0, 0.14, -0.2], [0.08, 0.18, 0.08], [-Math.PI / 2, 0, 0], false);
  rig.height = 0.9;
  rig.low = true;
}

/* ───────────────────────────── 코뿔소 ───────────────────────────── */
function buildRhino(g, m, rig) {
  const body = new THREE.Group();
  body.position.y = 0.94;
  g.add(body); rig.body = body; rig.bodyY = 0.94;

  add(body, G.sphere, m.main, [0, 0, -0.04], [0.6, 0.55, 0.94]);
  add(body, G.sphereLow, m.dark, [0, 0.34, -0.1], [0.5, 0.24, 0.7], null, false);   // 등 판
  add(body, G.sphereLow, m.belly, [0, -0.26, 0.05], [0.42, 0.2, 0.6], null, false);

  rig.legs = quadLegs(body, m.dark, { x: 0.4, zf: 0.54, zb: -0.5, len: 0.74, r: 0.17, hoof: m.accent });

  const head = new THREE.Group();
  head.position.set(0, 0.16, 0.9);
  body.add(head); rig.head = head;
  add(head, G.sphere, m.main, [0, 0.02, 0], [0.34, 0.3, 0.3]);
  add(head, G.sphere, m.main, [0, -0.08, 0.24], [0.24, 0.18, 0.24]);
  add(head, G.cone, m.accent, [0, 0.16, 0.3], [0.11, 0.5, 0.11], [0.5, 0, 0]);     // 큰 뿔
  add(head, G.cone, m.accent, [0, 0.0, 0.16], [0.07, 0.2, 0.07], [0.5, 0, 0], false);
  add(head, G.sphereLow, m.eye, [0.16, 0.06, 0.16], [0.04, 0.045, 0.035], null, false);
  add(head, G.sphereLow, m.eye, [-0.16, 0.06, 0.16], [0.04, 0.045, 0.035], null, false);
  add(head, G.coneLow, m.dark, [0.22, 0.26, -0.08], [0.08, 0.16, 0.06], [0, 0, -0.3]);
  add(head, G.coneLow, m.dark, [-0.22, 0.26, -0.08], [0.08, 0.16, 0.06], [0, 0, 0.3]);

  const tail = new THREE.Group();
  tail.position.set(0, 0.1, -0.9);
  body.add(tail); rig.tail = tail;
  add(tail, G.cyl, m.dark, [0, -0.1, -0.06], [0.05, 0.44, 0.05], [0.2, 0, 0]);
  rig.height = 1.6;
}

/* ───────────────────────────── 여우 ───────────────────────────── */
function buildFox(g, m, rig) {
  const body = new THREE.Group();
  body.position.y = 0.68;
  g.add(body); rig.body = body; rig.bodyY = 0.68;

  add(body, G.sphere, m.main, [0, 0, 0], [0.32, 0.33, 0.7]);
  add(body, G.sphereLow, m.belly, [0, -0.14, 0.1], [0.26, 0.16, 0.46], null, false);
  add(body, G.sphere, m.main, [0, 0.08, 0.32], [0.3, 0.3, 0.3]);

  rig.legs = quadLegs(body, m.dark, { x: 0.2, zf: 0.42, zb: -0.4, len: 0.6, r: 0.075 });

  const head = new THREE.Group();
  head.position.set(0, 0.32, 0.62);
  body.add(head); rig.head = head;
  add(head, G.sphere, m.main, [0, 0, 0], [0.24, 0.22, 0.24]);
  add(head, G.cone, m.accent, [0, -0.06, 0.24], [0.14, 0.34, 0.12], [Math.PI / 2, 0, 0]);
  const foxJaw = new THREE.Group();
  foxJaw.position.set(0, -0.09, 0.12);
  head.add(foxJaw); rig.jaw = foxJaw;
  add(foxJaw, G.box, m.belly, [0, 0, 0.1], [0.09, 0.045, 0.17], null, false);
  add(head, G.sphereLow, m.eye, [0.11, 0.06, 0.15], [0.038, 0.045, 0.032], null, false);
  add(head, G.sphereLow, m.eye, [-0.11, 0.06, 0.15], [0.038, 0.045, 0.032], null, false);
  add(head, G.coneLow, m.main, [0.14, 0.26, -0.02], [0.1, 0.26, 0.07], [-0.15, 0, -0.2]);
  add(head, G.coneLow, m.main, [-0.14, 0.26, -0.02], [0.1, 0.26, 0.07], [-0.15, 0, 0.2]);
  add(head, G.sphereLow, m.accent, [0.14, 0.24, 0.02], [0.055, 0.15, 0.04], null, false);
  add(head, G.sphereLow, m.accent, [-0.14, 0.24, 0.02], [0.055, 0.15, 0.04], null, false);

  const tail = new THREE.Group();
  tail.position.set(0, 0.06, -0.68);
  body.add(tail); rig.tail = tail;
  add(tail, G.cone, m.main, [0, -0.06, -0.34], [0.22, 0.78, 0.22], [1.45, 0, 0]);
  add(tail, G.sphereLow, m.accent, [0, 0.0, -0.66], [0.15, 0.16, 0.14], null, false);
  rig.height = 1.1;
}

/* ───────────────────────────── 고릴라 ───────────────────────────── */
function buildGorilla(g, m, rig) {
  const body = new THREE.Group();
  body.position.y = 0.9;
  g.add(body); rig.body = body; rig.bodyY = 0.9;

  add(body, G.capsule, m.main, [0, 0.06, 0], [0.92, 0.7, 0.78], [0.12, 0, 0]);
  add(body, G.sphere, m.main, [0, 0.34, 0.16], [0.6, 0.4, 0.44]);        // 큰 어깨
  add(body, G.sphereLow, m.accent, [0, 0.3, -0.34], [0.34, 0.34, 0.12], null, false);  // 은빛 등

  rig.legs = quadLegs(body, m.main, { x: 0.26, zf: 0.06, zb: -0.34, len: 0.62, r: 0.13 });
  rig.legs.forEach((l) => { l.pivot.position.z += l.front ? 0.2 : 0; });

  // 긴 팔 (너클 워크)
  const arms = [];
  [1, -1].forEach((side) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.42, 0.3, 0.2);
    body.add(shoulder);
    add(shoulder, G.cyl, m.dark, [0, -0.34, 0], [0.13, 0.7, 0.13]);
    add(shoulder, G.sphereLow, m.dark, [0, -0.68, 0.02], [0.15, 0.13, 0.16]);
    add(shoulder, G.sphere, m.main, [0, 0.02, 0], [0.19, 0.19, 0.19]);
    arms.push({ pivot: shoulder, side });
  });
  rig.arms = arms;

  const head = new THREE.Group();
  head.position.set(0, 0.5, 0.36);
  body.add(head); rig.head = head;
  add(head, G.sphere, m.main, [0, 0, 0], [0.28, 0.27, 0.26]);
  add(head, G.sphere, m.dark, [0, -0.1, 0.16], [0.2, 0.14, 0.16]);
  add(head, G.sphereLow, m.eye, [0.1, 0.06, 0.2], [0.035, 0.04, 0.03], null, false);
  add(head, G.sphereLow, m.eye, [-0.1, 0.06, 0.2], [0.035, 0.04, 0.03], null, false);
  add(head, G.sphereLow, m.main, [0, 0.16, -0.1], [0.26, 0.18, 0.2], null, false);  // 정수리

  rig.height = 1.55;
  rig.upright = true;
}

/* ───────────────────────────── 치타 ───────────────────────────── */
function buildCheetah(g, m, rig) {
  const body = new THREE.Group();
  body.position.y = 0.8;
  g.add(body); rig.body = body; rig.bodyY = 0.8;

  add(body, G.sphere, m.main, [0, 0, -0.02], [0.33, 0.34, 0.86]);
  add(body, G.sphereLow, m.belly, [0, -0.16, 0.05], [0.26, 0.16, 0.6], null, false);
  // 점박이
  for (let i = 0; i < 16; i++) {
    const z = 0.55 - (i % 8) * 0.16;
    const side = i < 8 ? 1 : -1;
    const y = 0.16 + ((i * 7) % 5) * 0.05;
    add(body, G.sphereLow, m.dark, [side * 0.33, y, z], [0.028, 0.028, 0.04], null, false);
  }

  rig.legs = quadLegs(body, m.main, { x: 0.24, zf: 0.5, zb: -0.48, len: 0.8, r: 0.08 });

  const head = new THREE.Group();
  head.position.set(0, 0.34, 0.7);
  body.add(head); rig.head = head;
  add(head, G.sphere, m.main, [0, 0, 0], [0.23, 0.22, 0.24]);
  add(head, G.sphere, m.accent, [0, -0.08, 0.2], [0.16, 0.13, 0.16]);
  const cheetahJaw = new THREE.Group();
  cheetahJaw.position.set(0, -0.1, 0.1);
  head.add(cheetahJaw); rig.jaw = cheetahJaw;
  add(cheetahJaw, G.box, m.belly, [0, 0, 0.1], [0.1, 0.04, 0.15], null, false);
  add(head, G.sphereLow, m.eye, [0.11, 0.06, 0.16], [0.038, 0.045, 0.03], null, false);
  add(head, G.sphereLow, m.eye, [-0.11, 0.06, 0.16], [0.038, 0.045, 0.03], null, false);
  add(head, G.box, m.dark, [0.12, 0.02, 0.19], [0.025, 0.16, 0.02], [0.3, 0, 0.15], false);   // 눈물 자국
  add(head, G.box, m.dark, [-0.12, 0.02, 0.19], [0.025, 0.16, 0.02], [0.3, 0, -0.15], false);
  add(head, G.coneLow, m.main, [0.15, 0.2, -0.02], [0.075, 0.16, 0.055], [0, 0, -0.2]);
  add(head, G.coneLow, m.main, [-0.15, 0.2, -0.02], [0.075, 0.16, 0.055], [0, 0, 0.2]);

  const tail = new THREE.Group();
  tail.position.set(0, 0.16, -0.8);
  body.add(tail); rig.tail = tail;
  add(tail, G.cyl, m.main, [0, 0.06, -0.32], [0.05, 0.7, 0.05], [1.2, 0, 0]);
  add(tail, G.sphereLow, m.accent, [0, 0.22, -0.66], [0.07, 0.07, 0.07], null, true);
  rig.height = 1.24;
}

/* ───────────────────────────── 멧돼지 ───────────────────────────── */
function buildBoar(g, m, rig) {
  const body = new THREE.Group();
  body.position.y = 0.7;
  g.add(body); rig.body = body; rig.bodyY = 0.7;

  add(body, G.sphere, m.main, [0, 0, -0.02], [0.5, 0.48, 0.76]);
  add(body, G.sphere, m.main, [0, 0.16, 0.36], [0.44, 0.42, 0.36]);
  add(body, G.sphereLow, m.belly, [0, -0.22, 0.02], [0.38, 0.2, 0.54], null, false);
  // 등 강모
  for (let i = 0; i < 7; i++) {
    add(body, G.coneLow, m.dark, [0, 0.44 - i * 0.01, 0.4 - i * 0.13], [0.06, 0.24, 0.06], [0.25, 0, 0], false);
  }

  rig.legs = quadLegs(body, m.dark, { x: 0.3, zf: 0.38, zb: -0.36, len: 0.52, r: 0.1 });

  const head = new THREE.Group();
  head.position.set(0, 0.18, 0.62);
  body.add(head); rig.head = head;
  add(head, G.sphere, m.main, [0, 0, 0], [0.3, 0.28, 0.28]);
  add(head, G.cyl, m.accent, [0, -0.08, 0.28], [0.13, 0.26, 0.13], [Math.PI / 2, 0, 0]);
  add(head, G.sphereLow, m.dark, [0, -0.08, 0.42], [0.11, 0.09, 0.06], null, false);
  add(head, G.cone, m.accent, [0.16, -0.02, 0.24], [0.05, 0.24, 0.05], [0.4, 0, -0.5]);
  add(head, G.cone, m.accent, [-0.16, -0.02, 0.24], [0.05, 0.24, 0.05], [0.4, 0, 0.5]);
  add(head, G.sphereLow, m.eye, [0.14, 0.1, 0.14], [0.038, 0.042, 0.03], null, false);
  add(head, G.sphereLow, m.eye, [-0.14, 0.1, 0.14], [0.038, 0.042, 0.03], null, false);
  add(head, G.coneLow, m.dark, [0.16, 0.24, -0.04], [0.09, 0.16, 0.07], [0, 0, -0.25]);
  add(head, G.coneLow, m.dark, [-0.16, 0.24, -0.04], [0.09, 0.16, 0.07], [0, 0, 0.25]);

  const tail = new THREE.Group();
  tail.position.set(0, 0.12, -0.72);
  body.add(tail); rig.tail = tail;
  add(tail, G.cyl, m.dark, [0, 0.02, -0.08], [0.04, 0.2, 0.04], [1.2, 0, 0]);
  rig.height = 1.1;
}

/* ───────────────────────────── 티라노사우루스 ───────────────────────────── */
function buildTRex(g, m, rig) {
  const body = new THREE.Group();
  body.position.y = 1.72;
  g.add(body); rig.body = body; rig.bodyY = 1.72;

  add(body, G.sphere, m.main, [0, 0, 0], [0.5, 0.56, 0.86]);
  add(body, G.sphere, m.main, [0, 0.08, 0.52], [0.44, 0.42, 0.42]);
  add(body, G.sphereLow, m.belly, [0, -0.24, 0.06], [0.36, 0.24, 0.66], null, false);
  // 등 능선
  for (let i = 0; i < 4; i++) {
    add(body, G.coneLow, m.dark, [0, 0.46, 0.3 - i * 0.22], [0.1, 0.2, 0.08], [0.2, 0, 0], false);
  }

  // 두 발
  const legs = [];
  [1, -1].forEach((side, i) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.36, -0.16, -0.06);
    pivot.rotation.order = 'YXZ';
    body.add(pivot);
    add(pivot, G.leg, m.main, [0, -0.36, 0], [0.17, 0.76, 0.2]);
    add(pivot, G.leg, m.dark, [0, -0.88, 0.06], [0.085, 0.42, 0.09]);
    add(pivot, G.box, m.dark, [0, -1.1, 0.16], [0.22, 0.11, 0.42]);
    legs.push({ pivot, phase: i * Math.PI, front: false, left: side > 0 });
  });
  rig.legs = legs;

  // 꼬리
  const tail = new THREE.Group();
  tail.position.set(0, 0.14, -0.82);
  body.add(tail); rig.tail = tail;
  add(tail, G.cone, m.main, [0, 0, -0.34], [0.32, 1.0, 0.28], [-Math.PI / 2, 0, 0]);
  const tip = new THREE.Group(); tip.position.set(0, 0, -0.8); tail.add(tip); rig.tailTip = tip;
  add(tip, G.cone, m.dark, [0, 0, -0.34], [0.18, 0.88, 0.15], [-Math.PI / 2, 0, 0]);

  // 머리 · 턱
  const head = new THREE.Group();
  head.position.set(0, 0.42, 0.76);
  body.add(head); rig.head = head;
  add(head, G.sphere, m.main, [0, 0.02, 0.08], [0.31, 0.3, 0.34]);
  add(head, G.box, m.main, [0, 0.04, 0.48], [0.42, 0.34, 0.68]);
  add(head, G.sphereLow, m.accent, [0, 0.12, 0.2], [0.24, 0.16, 0.3], null, false);
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.14, 0.18);
  head.add(jaw); rig.jaw = jaw;
  add(jaw, G.box, m.belly, [0, -0.02, 0.34], [0.38, 0.14, 0.66]);
  for (let i = 0; i < 5; i++) {
    add(head, G.coneLow, m.accent, [0.19, -0.12, 0.26 + i * 0.11], [0.04, 0.13, 0.04], [Math.PI, 0, 0], false);
    add(head, G.coneLow, m.accent, [-0.19, -0.12, 0.26 + i * 0.11], [0.04, 0.13, 0.04], [Math.PI, 0, 0], false);
  }
  add(head, G.sphereLow, m.eye, [0.2, 0.14, 0.16], [0.05, 0.055, 0.045], null, false);
  add(head, G.sphereLow, m.eye, [-0.2, 0.14, 0.16], [0.05, 0.055, 0.045], null, false);
  add(head, G.coneLow, m.dark, [0.16, 0.3, -0.02], [0.06, 0.18, 0.05], [0, 0, -0.3], false);
  add(head, G.coneLow, m.dark, [-0.16, 0.3, -0.02], [0.06, 0.18, 0.05], [0, 0, 0.3], false);

  // 작은 팔
  const arms = [];
  [1, -1].forEach((side) => {
    const sh = new THREE.Group();
    sh.position.set(side * 0.4, -0.08, 0.5);
    body.add(sh);
    add(sh, G.cyl, m.main, [0, -0.12, 0.04], [0.07, 0.28, 0.07], [0.9, 0, 0]);
    add(sh, G.coneLow, m.dark, [0, -0.24, 0.16], [0.05, 0.14, 0.05], [1.6, 0, 0], false);
    arms.push({ pivot: sh, side });
  });
  rig.arms = arms;
  rig.height = 2.55;
}

/* ───────────────────────────── 스피노사우루스 ───────────────────────────── */
function buildSpino(g, m, rig) {
  const body = new THREE.Group();
  body.position.y = 1.62;
  g.add(body); rig.body = body; rig.bodyY = 1.62;

  add(body, G.sphere, m.main, [0, 0, 0], [0.48, 0.52, 0.92]);
  add(body, G.sphere, m.main, [0, 0.06, 0.55], [0.42, 0.4, 0.4]);
  add(body, G.sphereLow, m.belly, [0, -0.22, 0.05], [0.34, 0.22, 0.7], null, false);
  // 등돛
  for (let i = 0; i < 8; i++) {
    const z = 0.55 - i * 0.24;
    const h = 0.55 + Math.sin((i / 7) * Math.PI) * 0.5;
    add(body, G.coneLow, m.accent, [0, 0.42 + h * 0.2, z], [0.26, h, 0.075], [0.05, 0, 0], false);
  }

  const legs = [];
  [1, -1].forEach((side, i) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.34, -0.14, -0.04);
    pivot.rotation.order = 'YXZ';
    body.add(pivot);
    add(pivot, G.leg, m.main, [0, -0.36, 0], [0.16, 0.72, 0.18]);
    add(pivot, G.leg, m.dark, [0, -0.84, 0.06], [0.08, 0.4, 0.09]);
    add(pivot, G.box, m.dark, [0, -1.04, 0.16], [0.21, 0.1, 0.4]);
    legs.push({ pivot, phase: i * Math.PI, front: false, left: side > 0 });
  });
  rig.legs = legs;

  const tail = new THREE.Group();
  tail.position.set(0, 0.12, -0.88);
  body.add(tail); rig.tail = tail;
  add(tail, G.cone, m.main, [0, 0, -0.4], [0.3, 1.1, 0.26], [-Math.PI / 2, 0, 0]);
  add(tail, G.coneLow, m.accent, [0, 0.14, -0.5], [0.14, 0.5, 0.08], [-Math.PI / 2, 0, 0], false);

  const head = new THREE.Group();
  head.position.set(0, 0.36, 0.82);
  body.add(head); rig.head = head;
  add(head, G.sphere, m.main, [0, 0.02, 0.06], [0.28, 0.27, 0.32]);
  add(head, G.box, m.main, [0, 0.02, 0.5], [0.34, 0.26, 0.72]);   // 긴 주둥이
  add(head, G.sphereLow, m.accent, [0, 0.18, 0.1], [0.2, 0.12, 0.26], null, false);
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.12, 0.16);
  head.add(jaw); rig.jaw = jaw;
  add(jaw, G.box, m.belly, [0, -0.02, 0.36], [0.3, 0.12, 0.7]);
  for (let i = 0; i < 6; i++) {
    add(head, G.coneLow, m.accent, [0.15, -0.1, 0.28 + i * 0.1], [0.03, 0.1, 0.03], [Math.PI, 0, 0], false);
    add(head, G.coneLow, m.accent, [-0.15, -0.1, 0.28 + i * 0.1], [0.03, 0.1, 0.03], [Math.PI, 0, 0], false);
  }
  add(head, G.sphereLow, m.eye, [0.18, 0.16, 0.16], [0.045, 0.05, 0.04], null, false);
  add(head, G.sphereLow, m.eye, [-0.18, 0.16, 0.16], [0.045, 0.05, 0.04], null, false);

  const arms = [];
  [1, -1].forEach((side) => {
    const sh = new THREE.Group();
    sh.position.set(side * 0.42, -0.04, 0.52);
    body.add(sh);
    add(sh, G.cyl, m.main, [0, -0.16, 0.06], [0.075, 0.34, 0.075], [0.8, 0, 0]);
    add(sh, G.cone, m.accent, [0, -0.3, 0.2], [0.05, 0.26, 0.05], [1.5, 0, 0], false);
    arms.push({ pivot: sh, side });
  });
  rig.arms = arms;
  rig.height = 2.4;
}

/* ───────────────────────────── 트리케라톱스 ───────────────────────────── */
function buildTriceratops(g, m, rig) {
  const body = new THREE.Group();
  body.position.y = 1.0;
  g.add(body); rig.body = body; rig.bodyY = 1.0;

  add(body, G.sphere, m.main, [0, 0, -0.06], [0.66, 0.56, 1.0]);
  add(body, G.sphereLow, m.belly, [0, -0.26, 0.05], [0.5, 0.22, 0.72], null, false);
  add(body, G.sphereLow, m.dark, [0, 0.34, -0.1], [0.5, 0.2, 0.66], null, false);

  rig.legs = quadLegs(body, m.dark, { x: 0.44, zf: 0.54, zb: -0.56, len: 0.76, r: 0.18, hoof: m.accent });

  const head = new THREE.Group();
  head.position.set(0, 0.12, 0.86);
  body.add(head); rig.head = head;
  add(head, G.sphere, m.main, [0, 0, 0.06], [0.34, 0.28, 0.34]);
  add(head, G.sphere, m.accent, [0, -0.08, 0.3], [0.24, 0.18, 0.24]);
  // 프릴
  const frill = add(head, G.cyl, m.accent, [0, 0.16, -0.16], [0.72, 0.08, 0.72], [Math.PI / 2.35, 0, 0]);
  frill.scale.set(0.74, 0.09, 0.74);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 1.2 - Math.PI * 0.6;
    add(head, G.coneLow, m.dark, [Math.sin(a) * 0.66, 0.3 + Math.cos(a) * 0.3, -0.14], [0.075, 0.24, 0.06], [0, 0, -a], false);
  }
  // 세 개의 뿔
  add(head, G.cone, m.accent, [0.22, 0.12, 0.42], [0.065, 0.62, 0.065], [1.15, 0, -0.18]);
  add(head, G.cone, m.accent, [-0.22, 0.12, 0.42], [0.065, 0.62, 0.065], [1.15, 0, 0.18]);
  add(head, G.cone, m.accent, [0, -0.06, 0.5], [0.05, 0.28, 0.05], [1.4, 0, 0]);
  add(head, G.sphereLow, m.eye, [0.24, 0.06, 0.26], [0.045, 0.05, 0.04], null, false);
  add(head, G.sphereLow, m.eye, [-0.24, 0.06, 0.26], [0.045, 0.05, 0.04], null, false);

  const tail = new THREE.Group();
  tail.position.set(0, 0.06, -1.0);
  body.add(tail); rig.tail = tail;
  add(tail, G.cone, m.main, [0, -0.04, -0.3], [0.24, 0.72, 0.22], [-Math.PI / 2, 0, 0]);
  rig.height = 1.85;
}

/* ───────────────────────────── 벨로시랩터 ───────────────────────────── */
function buildRaptor(g, m, rig) {
  const body = new THREE.Group();
  body.position.y = 0.92;
  g.add(body); rig.body = body; rig.bodyY = 0.92;

  add(body, G.sphere, m.main, [0, 0, 0], [0.3, 0.32, 0.62]);
  add(body, G.sphere, m.main, [0, 0.06, 0.36], [0.26, 0.26, 0.28]);
  add(body, G.sphereLow, m.belly, [0, -0.14, 0.04], [0.22, 0.14, 0.46], null, false);
  for (let i = 0; i < 4; i++) {
    add(body, G.coneLow, m.accent, [0, 0.26, 0.28 - i * 0.18], [0.07, 0.14, 0.05], [0.15, 0, 0], false);
  }

  const legs = [];
  [1, -1].forEach((side, i) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.16, -0.06, 0.0);
    pivot.rotation.order = 'YXZ';
    body.add(pivot);
    add(pivot, G.leg, m.main, [0, -0.22, 0], [0.09, 0.46, 0.1]);
    add(pivot, G.leg, m.dark, [0, -0.52, 0.04], [0.05, 0.28, 0.05]);
    add(pivot, G.box, m.dark, [0, -0.67, 0.1], [0.13, 0.07, 0.26]);
    // 낫 발톱
    add(pivot, G.coneLow, m.accent, [0, -0.66, 0.22], [0.03, 0.16, 0.03], [1.9, 0, 0], false);
    legs.push({ pivot, phase: i * Math.PI, front: false, left: side > 0 });
  });
  rig.legs = legs;

  const tail = new THREE.Group();
  tail.position.set(0, 0.06, -0.6);
  body.add(tail); rig.tail = tail;
  add(tail, G.cone, m.main, [0, 0, -0.32], [0.17, 0.78, 0.15], [-Math.PI / 2, 0, 0]);
  add(tail, G.coneLow, m.accent, [0, 0, -0.62], [0.1, 0.4, 0.09], [-Math.PI / 2, 0, 0], false);

  const head = new THREE.Group();
  head.position.set(0, 0.26, 0.52);
  body.add(head); rig.head = head;
  add(head, G.sphere, m.main, [0, 0, 0.02], [0.18, 0.18, 0.24]);
  add(head, G.box, m.main, [0, 0.0, 0.26], [0.17, 0.14, 0.34]);
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.08, 0.1);
  head.add(jaw); rig.jaw = jaw;
  add(jaw, G.box, m.belly, [0, 0, 0.22], [0.15, 0.07, 0.32]);
  add(head, G.sphereLow, m.eye, [0.13, 0.07, 0.1], [0.035, 0.04, 0.03], null, false);
  add(head, G.sphereLow, m.eye, [-0.13, 0.07, 0.1], [0.035, 0.04, 0.03], null, false);

  const arms = [];
  [1, -1].forEach((side) => {
    const sh = new THREE.Group();
    sh.position.set(side * 0.24, -0.02, 0.24);
    body.add(sh);
    add(sh, G.cyl, m.main, [0, -0.12, 0.06], [0.04, 0.24, 0.04], [0.9, 0, 0]);
    add(sh, G.coneLow, m.accent, [0, -0.2, 0.15], [0.025, 0.12, 0.025], [1.6, 0, 0], false);
    arms.push({ pivot: sh, side });
  });
  rig.arms = arms;
  rig.height = 1.35;
}

/* ───────────────────────────── 와이번 ───────────────────────────── */
function buildWyvern(g, m, rig) {
  const body = new THREE.Group();
  body.position.y = 0.95;
  g.add(body); rig.body = body; rig.bodyY = 0.95;

  add(body, G.sphere, m.main, [0, 0, 0], [0.34, 0.36, 0.72]);
  add(body, G.sphereLow, m.belly, [0, -0.16, 0.08], [0.26, 0.18, 0.5], null, false);

  // 날개
  const wings = [];
  [1, -1].forEach((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.28, 0.12, 0.02);
    body.add(pivot);
    add(pivot, G.sphereLow, m.main, [side * 0.62, 0.02, -0.04], [0.72, 0.06, 0.36], [0, side * 0.12, 0], true);
    add(pivot, G.sphereLow, m.dark, [side * 1.05, -0.02, -0.3], [0.46, 0.04, 0.3], [0, side * 0.2, 0], false);
    for (let i = 0; i < 3; i++) {
      add(pivot, G.coneLow, m.accent, [side * (0.5 + i * 0.3), 0.03, -0.34 - i * 0.05], [0.03, 0.34, 0.03], [1.4, 0, side * 0.2], false);
    }
    wings.push({ pivot, side });
  });
  rig.wings = wings;

  const legs = [];
  [1, -1].forEach((side, i) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.2, -0.18, -0.06);
    body.add(pivot);
    add(pivot, G.cyl, m.dark, [0, -0.2, 0.04], [0.06, 0.3, 0.06], [0.4, 0, 0]);
    add(pivot, G.coneLow, m.accent, [0, -0.32, 0.14], [0.04, 0.14, 0.04], [1.7, 0, 0], false);
    legs.push({ pivot, phase: i * Math.PI, front: false, left: side > 0 });
  });
  rig.legs = legs;

  // 목 · 머리
  const head = new THREE.Group();
  head.position.set(0, 0.34, 0.62);
  body.add(head); rig.head = head;
  add(head, G.cyl, m.main, [0, -0.1, -0.18], [0.12, 0.4, 0.12], [1.15, 0, 0]);
  add(head, G.sphere, m.main, [0, 0.02, 0.1], [0.2, 0.18, 0.26]);
  add(head, G.box, m.main, [0, 0.02, 0.34], [0.18, 0.14, 0.34]);
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.08, 0.18);
  head.add(jaw); rig.jaw = jaw;
  add(jaw, G.box, m.belly, [0, 0, 0.16], [0.15, 0.06, 0.3]);
  add(head, G.sphereLow, m.accent, [0.12, 0.1, 0.2], [0.04, 0.045, 0.035], null, false);
  add(head, G.sphereLow, m.accent, [-0.12, 0.1, 0.2], [0.04, 0.045, 0.035], null, false);
  add(head, G.coneLow, m.accent, [0, 0.2, -0.02], [0.05, 0.2, 0.05], [-0.3, 0, 0], false);

  const tail = new THREE.Group();
  tail.position.set(0, 0.02, -0.7);
  body.add(tail); rig.tail = tail;
  add(tail, G.cone, m.main, [0, 0, -0.34], [0.16, 0.86, 0.14], [-Math.PI / 2, 0, 0]);
  add(tail, G.coneLow, m.accent, [0, 0, -0.72], [0.12, 0.34, 0.1], [-Math.PI / 2 - 0.4, 0, 0], false);
  rig.height = 1.9;
  rig.air = true;
}

/* ───────────────────────────── 거대 타이탄 ───────────────────────────── */
function buildTitan(g, m, rig) {
  const body = new THREE.Group();
  body.position.y = 1.45;
  g.add(body); rig.body = body; rig.bodyY = 1.45;

  add(body, G.capsule, m.main, [0, 0.06, 0], [1.1, 0.92, 0.94], [0.1, 0, 0]);
  add(body, G.sphere, m.main, [0, 0.46, 0.18], [0.76, 0.5, 0.54]);
  add(body, G.sphereLow, m.dark, [0, 0.52, -0.34], [0.5, 0.44, 0.16], null, false);
  // 등 판
  for (let i = 0; i < 4; i++) {
    add(body, G.coneLow, m.accent, [0, 0.68 - i * 0.06, -0.2 - i * 0.16], [0.11, 0.3, 0.08], [0.5, 0, 0], false);
  }

  // 다리
  const legs = [];
  [1, -1].forEach((side, i) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.38, -0.18, 0.02);
    body.add(pivot);
    add(pivot, G.leg, m.main, [0, -0.44, 0], [0.22, 0.9, 0.24]);
    add(pivot, G.box, m.dark, [0, -0.9, 0.1], [0.32, 0.16, 0.44]);
    legs.push({ pivot, phase: i * Math.PI, front: false, left: side > 0 });
  });
  rig.legs = legs;

  // 긴 팔
  const arms = [];
  [1, -1].forEach((side) => {
    const sh = new THREE.Group();
    sh.position.set(side * 0.66, 0.36, 0.2);
    body.add(sh);
    add(sh, G.cyl, m.dark, [0, -0.42, 0], [0.17, 0.86, 0.17]);
    add(sh, G.sphereLow, m.dark, [0, -0.84, 0.04], [0.21, 0.17, 0.22]);
    add(sh, G.sphere, m.main, [0, 0.02, 0], [0.26, 0.24, 0.24]);
    arms.push({ pivot: sh, side });
  });
  rig.arms = arms;

  const head = new THREE.Group();
  head.position.set(0, 0.66, 0.42);
  body.add(head); rig.head = head;
  add(head, G.sphere, m.main, [0, 0, 0], [0.34, 0.32, 0.3]);
  add(head, G.sphere, m.dark, [0, -0.12, 0.2], [0.24, 0.18, 0.2]);
  add(head, G.sphereLow, m.accent, [0.12, 0.06, 0.24], [0.07, 0.06, 0.04], null, false);
  add(head, G.sphereLow, m.accent, [-0.12, 0.06, 0.24], [0.07, 0.06, 0.04], null, false);
  add(head, G.coneLow, m.dark, [0.18, 0.28, -0.06], [0.08, 0.28, 0.07], [0, 0, -0.4]);
  add(head, G.coneLow, m.dark, [-0.18, 0.28, -0.06], [0.08, 0.28, 0.07], [0, 0, 0.4]);
  add(head, G.sphereLow, m.dark, [0, 0.3, -0.16], [0.3, 0.14, 0.18], null, false);
  rig.height = 2.7;
  rig.upright = true;
}

/* ───────────────────────────── 장착 무기 ───────────────────────────── */

const WEAPON_MATS = {};
function wmat(key, color, opts) {
  // 리그마다 새 재질 — 리그를 폐기할 때 함께 정리된다 (공유 재질을 dispose 하면 다른 유닛의 재질까지 깨진다)
  return mat(color, opts);
}

export function attachWeapon(rig, weaponId) {
  if (!weaponId || weaponId === 'none') return null;
  if (rig.simple) return null;
  const body = rig.body;
  if (!body) return null;
  const size = Math.max(0.8, rig.def.size || 1);
  const dark = wmat('dark', 0x2b2f38, { metalness: 0.6, roughness: 0.4 });
  const steel = wmat('steel', 0x646c7c, { metalness: 0.7, roughness: 0.3 });
  const hot = wmat('hot', 0xffb347, { metalness: 0.2, roughness: 0.4, emissive: 0x8a3a00, emissiveIntensity: 0.5 });
  const cyan = wmat('cyan', 0x6fe8ff, { metalness: 0.3, roughness: 0.25, emissive: 0x2aa8c8, emissiveIntensity: 1.1 });

  const g = new THREE.Group();
  body.add(g);
  const muzzle = new THREE.Object3D();
  g.add(muzzle);
  rig.muzzle = muzzle;

  if (weaponId === 'gatling') {
    g.position.set(0, 0.42 * size, -0.28 * size);
    add(g, G.box, dark, [0, 0, 0], [0.34, 0.28, 0.42]);
    add(g, G.cyl, steel, [0, 0.02, 0.36], [0.09, 0.62, 0.09], [Math.PI / 2, 0, 0]);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      add(g, G.cyl, steel, [Math.cos(a) * 0.09, 0.02 + Math.sin(a) * 0.09, 0.44], [0.035, 0.6, 0.035], [Math.PI / 2, 0, 0]);
    }
    add(g, G.box, hot, [0.2, 0.02, 0.16], [0.1, 0.12, 0.2], null, false);
    muzzle.position.set(0, 0.02, 0.78);
  } else if (weaponId === 'rocket') {
    g.position.set(0, 0.48 * size, -0.26 * size);
    add(g, G.box, dark, [0, 0, 0], [0.44, 0.3, 0.46]);
    add(g, G.cyl, steel, [0.13, 0.02, 0.3], [0.12, 0.72, 0.12], [Math.PI / 2, 0, 0]);
    add(g, G.cyl, steel, [-0.13, 0.02, 0.3], [0.12, 0.72, 0.12], [Math.PI / 2, 0, 0]);
    add(g, G.cone, hot, [0.13, 0.02, 0.7], [0.11, 0.22, 0.11], [Math.PI / 2, 0, 0], false);
    add(g, G.cone, hot, [-0.13, 0.02, 0.7], [0.11, 0.22, 0.11], [Math.PI / 2, 0, 0], false);
    muzzle.position.set(0, 0.02, 0.8);
  } else if (weaponId === 'laser') {
    g.position.set(0, 0.52 * size, -0.22 * size);
    add(g, G.box, dark, [0, 0, 0], [0.3, 0.3, 0.5]);
    add(g, G.cyl, steel, [0, 0.02, 0.42], [0.1, 0.72, 0.1], [Math.PI / 2, 0, 0]);
    add(g, G.cyl, cyan, [0, 0.02, 0.62], [0.055, 0.3, 0.055], [Math.PI / 2, 0, 0], false);
    add(g, G.sphereLow, cyan, [0, 0.02, 0.82], [0.075, 0.075, 0.075], null, false);
    for (let i = 0; i < 3; i++) {
      add(g, G.box, dark, [0, 0.02, 0.18 + i * 0.14], [0.4, 0.06, 0.05], null, false);
    }
    muzzle.position.set(0, 0.02, 0.9);
  } else if (weaponId === 'shield') {
    g.position.set(0, 0.1 * size, 0.5 * size);
    add(g, G.cyl, steel, [0, 0, 0], [0.62, 0.1, 0.62], [Math.PI / 2, 0, 0]);
    add(g, G.cyl, dark, [0, 0, 0.02], [0.5, 0.14, 0.5], [Math.PI / 2, 0, 0], false);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      add(g, G.cone, steel, [Math.cos(a) * 0.46, Math.sin(a) * 0.46, 0.1], [0.06, 0.26, 0.06], [Math.PI / 2, 0, -a], false);
    }
    add(g, G.sphereLow, hot, [0, 0, 0.12], [0.12, 0.12, 0.08], null, false);
    muzzle.position.set(0, 0, 0.3);
  }
  g.scale.setScalar(0.95 * Math.max(0.85, size));
  g.userData.baseZ = g.position.z;
  rig.weaponId = weaponId;
  rig.weaponNode = g;
  return g;
}

/* ───────────────────────────── 좀비 ───────────────────────────── */
function buildZombie(g, m, rig) {
  const body = new THREE.Group();
  body.position.y = 1.02;
  g.add(body); rig.body = body; rig.bodyY = 1.02;

  add(body, G.capsule, m.main, [0, 0, 0], [0.56, 0.66, 0.44], [0.06, 0, 0]);
  add(body, G.box, m.dark, [0, -0.14, 0.02], [0.64, 0.5, 0.5], null, false);   // 낡은 옷
  add(body, G.sphereLow, m.belly, [0, -0.18, 0.24], [0.3, 0.2, 0.2], null, false);
  add(body, G.sphereLow, m.dark, [0.2, 0.24, 0.05], [0.14, 0.16, 0.12], null, false);  // 어깨 뼈

  const head = new THREE.Group();
  head.position.set(0, 0.56, 0.12);
  body.add(head); rig.head = head;
  add(head, G.sphereLow, m.main, [0, 0, 0], [0.3, 0.31, 0.3]);
  add(head, G.sphereLow, m.belly, [0, -0.08, 0.24], [0.16, 0.13, 0.14], null, false);
  add(head, G.sphereLow, m.dark, [0.11, 0.08, 0.24], [0.055, 0.06, 0.04], null, false);
  add(head, G.sphereLow, m.dark, [-0.11, 0.08, 0.24], [0.055, 0.06, 0.04], null, false);
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.14, 0.16);
  head.add(jaw); rig.jaw = jaw;
  add(jaw, G.box, m.belly, [0, 0, 0.12], [0.18, 0.07, 0.2], null, false);

  // 앞으로 뻗은 두 팔
  rig.arms = [];
  [1, -1].forEach((side) => {
    const piv = new THREE.Group();
    piv.position.set(side * 0.37, 0.32, 0.06);
    body.add(piv);
    add(piv, G.cyl, m.main, [0, -0.06, 0.3], [0.12, 0.66, 0.12], [Math.PI / 2, 0, 0]);
    add(piv, G.cyl, m.dark, [0, -0.06, 0.66], [0.09, 0.42, 0.09], [Math.PI / 2, 0, 0], false);
    add(piv, G.sphereLow, m.main, [0, -0.06, 0.9], [0.15, 0.1, 0.16], null, false);
    rig.arms.push({ pivot: piv, side });
  });

  rig.legs = [];
  [1, -1].forEach((side, i) => {
    const piv = new THREE.Group();
    piv.position.set(side * 0.21, -0.42, 0);
    body.add(piv);
    add(piv, G.leg, m.dark, [0, -0.3, 0], [0.12, 0.6, 0.12]);
    add(piv, G.box, m.dark, [0, -0.58, 0.12], [0.2, 0.1, 0.3], null, false);
    rig.legs.push({ pivot: piv, phase: i * Math.PI, front: false, left: side > 0 });
  });
  rig.height = 2.05;
}

/* ───────────────────────────── 스켈레톤 ───────────────────────────── */
function buildSkeleton(g, m, rig) {
  const body = new THREE.Group();
  body.position.y = 1.05;
  g.add(body); rig.body = body; rig.bodyY = 1.05;

  add(body, G.cyl, m.main, [0, 0, 0], [0.11, 0.95, 0.11], [0, 0, 0]);          // 척추
  for (let i = 0; i < 3; i++) {
    add(body, G.box, m.accent, [0, 0.24 - i * 0.22, 0], [0.52 - i * 0.03, 0.07, 0.3], null, false);  // 갈비 3줄
    add(body, G.box, m.main, [0.26, 0.22 - i * 0.2, 0.02], [0.06, 0.24, 0.07], [0, 0, -0.2], false);
    add(body, G.box, m.main, [-0.26, 0.22 - i * 0.2, 0.02], [0.06, 0.24, 0.07], [0, 0, 0.2], false);
  }
  add(body, G.box, m.main, [0, -0.38, 0], [0.36, 0.14, 0.22], null, false);    // 골반

  const head = new THREE.Group();
  head.position.set(0, 0.62, 0.04);
  body.add(head); rig.head = head;
  add(head, G.sphereLow, m.main, [0, 0, 0], [0.25, 0.27, 0.26]);
  add(head, G.box, m.accent, [0, -0.13, 0.1], [0.3, 0.12, 0.3], null, false);   // 턱뼈
  add(head, G.sphereLow, m.dark, [0.1, 0.04, 0.18], [0.055, 0.065, 0.04], null, false);
  add(head, G.sphereLow, m.dark, [-0.1, 0.04, 0.18], [0.055, 0.065, 0.04], null, false);
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.16, 0.12);
  head.add(jaw); rig.jaw = jaw;
  add(jaw, G.box, m.accent, [0, 0, 0.1], [0.24, 0.06, 0.24], null, false);

  // 팔 + 뼈칼
  rig.arms = [];
  [1, -1].forEach((side) => {
    const piv = new THREE.Group();
    piv.position.set(side * 0.28, 0.32, 0.02);
    body.add(piv);
    add(piv, G.cyl, m.main, [0, -0.26, 0.02], [0.055, 0.52, 0.055], [0.15, 0, 0]);
    add(piv, G.sphereLow, m.accent, [0, -0.54, 0.06], [0.08, 0.08, 0.08], null, false);
    const arm = { pivot: piv, side };
    if (side > 0) {
      const sword = new THREE.Group();
      sword.position.set(0, -0.58, 0.1);
      sword.rotation.x = 0.5;
      piv.add(sword);
      add(sword, G.box, m.belly, [0, -0.05, 0.55], [0.07, 0.03, 1.05], null, false);  // 칼날
      add(sword, G.box, m.accent, [0, -0.05, 0.12], [0.24, 0.06, 0.1], null, false);   // 가드
      add(sword, G.cyl, m.dark, [0, -0.05, -0.1], [0.05, 0.26, 0.05], [Math.PI / 2, 0, 0], false);
      arm.sword = true;
    }
    rig.arms.push(arm);
  });

  rig.legs = [];
  [1, -1].forEach((side, i) => {
    const piv = new THREE.Group();
    piv.position.set(side * 0.16, -0.44, 0);
    body.add(piv);
    add(piv, G.cyl, m.main, [0, -0.32, 0], [0.055, 0.66, 0.055]);
    add(piv, G.box, m.dark, [0, -0.66, 0.1], [0.16, 0.08, 0.26], null, false);
    rig.legs.push({ pivot: piv, phase: i * Math.PI, front: false, left: side > 0 });
  });
  rig.height = 2.15;
}

/* ───────────────────────────── 거대 뱀 ───────────────────────────── */
function buildSnake(g, m, rig) {
  const body = new THREE.Group();
  body.position.y = 0.42;
  g.add(body); rig.body = body; rig.bodyY = 0.42;

  // 몸통 마디
  for (let i = 0; i < 5; i++) {
    const z = 0.55 - i * 0.44;
    const r = 0.34 - i * 0.03;
    add(body, G.sphereLow, i % 2 ? m.main : m.dark, [0, 0, z], [r, r * 0.86, r * 1.25], null, i < 2);
  }
  // 세워진 목
  add(body, G.cyl, m.main, [0, 0.32, 0.7], [0.17, 0.7, 0.17], [0.85, 0, 0]);
  add(body, G.sphereLow, m.dark, [0, 0.12, 0.5], [0.2, 0.14, 0.22], null, false);
  // 꼬리 (마디 애니메이션)
  let tailParent = body;
  let tz = -1.55;
  for (let i = 0; i < 3; i++) {
    const seg = new THREE.Group();
    seg.position.set(0, 0, i === 0 ? tz : -0.42);
    tailParent.add(seg);
    add(seg, G.cone, m.main, [0, 0, -0.22], [0.2 - i * 0.045, 0.5, 0.18 - i * 0.04], [-Math.PI / 2, 0, 0], false);
    tailParent = seg;
  }
  rig.tail = body.children[body.children.length - 1];
  rig.tailTip = tailParent;

  const head = new THREE.Group();
  head.position.set(0, 0.66, 0.98);
  body.add(head); rig.head = head;
  add(head, G.sphereLow, m.main, [0, 0, 0], [0.3, 0.24, 0.34]);
  add(head, G.sphereLow, m.dark, [0, 0.12, 0.0], [0.22, 0.1, 0.28], null, false);   // 두건
  add(head, G.sphereLow, m.accent, [0.11, 0.08, 0.18], [0.045, 0.05, 0.04], null, false);
  add(head, G.sphereLow, m.accent, [-0.11, 0.08, 0.18], [0.045, 0.05, 0.04], null, false);
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.12, 0.14);
  head.add(jaw); rig.jaw = jaw;
  add(jaw, G.box, m.belly, [0, 0, 0.15], [0.22, 0.07, 0.3], null, false);
  add(head, G.coneLow, m.belly, [0.08, -0.14, 0.22], [0.028, 0.15, 0.028], [Math.PI, 0, 0], false);
  add(head, G.coneLow, m.belly, [-0.08, -0.14, 0.22], [0.028, 0.15, 0.028], [Math.PI, 0, 0], false);

  rig.legs = [];
  rig.height = 1.4;
}

/* ───────────────────────────── 하이에나 ───────────────────────────── */
function buildHyena(g, m, rig) {
  const body = new THREE.Group();
  body.position.y = 0.86;
  g.add(body); rig.body = body; rig.bodyY = 0.86;

  add(body, G.sphere, m.main, [0, 0.02, 0], [0.36, 0.36, 0.86], [-0.1, 0, 0]);
  add(body, G.sphere, m.main, [0, 0.2, 0.44], [0.38, 0.38, 0.34]);   // 높은 어깨
  add(body, G.sphereLow, m.belly, [0, -0.18, 0.06], [0.28, 0.16, 0.56], null, false);
  add(body, G.sphereLow, m.dark, [0, 0.32, 0.1], [0.26, 0.16, 0.4], null, false);  // 갈기
  for (let i = 0; i < 10; i++) {
    const z = 0.45 - (i % 5) * 0.22;
    const side = i < 5 ? 1 : -1;
    const y = 0.14 + ((i * 5) % 3) * 0.06;
    add(body, G.sphereLow, m.dark, [side * 0.32, y, z], [0.035, 0.035, 0.05], null, false);
  }

  rig.legs = quadLegs(body, m.main, { x: 0.26, zf: 0.5, zb: -0.5, len: 0.82, r: 0.09 });

  const head = new THREE.Group();
  head.position.set(0, 0.4, 0.72);
  body.add(head); rig.head = head;
  add(head, G.sphere, m.main, [0, 0, 0], [0.28, 0.27, 0.3]);
  add(head, G.sphere, m.accent, [0, -0.08, 0.24], [0.18, 0.15, 0.2]);
  add(head, G.sphereLow, m.dark, [0, -0.02, 0.4], [0.07, 0.06, 0.06], null, false);
  add(head, G.sphereLow, m.dark, [0.13, 0.1, 0.15], [0.045, 0.05, 0.04], null, false);
  add(head, G.sphereLow, m.dark, [-0.13, 0.1, 0.15], [0.045, 0.05, 0.04], null, false);
  add(head, G.coneLow, m.main, [0.18, 0.28, -0.04], [0.09, 0.26, 0.07], [-0.1, 0, -0.25]);
  add(head, G.coneLow, m.main, [-0.18, 0.28, -0.04], [0.09, 0.26, 0.07], [-0.1, 0, 0.25]);
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.12, 0.16);
  head.add(jaw); rig.jaw = jaw;
  add(jaw, G.box, m.belly, [0, 0, 0.14], [0.16, 0.07, 0.28], null, false);

  const tail = new THREE.Group();
  tail.position.set(0, 0.06, -0.82);
  body.add(tail); rig.tail = tail;
  add(tail, G.cone, m.main, [0, 0.08, -0.24], [0.1, 0.5, 0.1], [1.4, 0, 0], false);
  rig.height = 1.55;
}

/* ───────────────────────────── 디-렉스 ───────────────────────────── */
function buildDRex(g, m, rig) {
  const body = new THREE.Group();
  body.position.y = 1.95;
  g.add(body); rig.body = body; rig.bodyY = 1.95;

  add(body, G.sphere, m.main, [0, 0, 0], [0.56, 0.6, 0.95]);
  add(body, G.sphere, m.main, [0, 0.14, 0.6], [0.5, 0.46, 0.46]);
  add(body, G.sphereLow, m.belly, [0, -0.26, 0.1], [0.4, 0.26, 0.7], null, false);
  for (let i = 0; i < 5; i++) {
    add(body, G.coneLow, m.dark, [0, 0.52, 0.3 - i * 0.22], [0.1, 0.22, 0.08], [0.2, 0, 0], false);
  }

  rig.legs = [];
  [1, -1].forEach((side, i) => {
    const piv = new THREE.Group();
    piv.position.set(side * 0.4, -0.18, -0.08);
    body.add(piv);
    add(piv, G.leg, m.main, [0, -0.42, 0], [0.2, 0.88, 0.23]);
    add(piv, G.leg, m.dark, [0, -1.02, 0.06], [0.1, 0.46, 0.1]);
    add(piv, G.box, m.dark, [0, -1.27, 0.16], [0.25, 0.12, 0.46]);
    rig.legs.push({ pivot: piv, phase: i * Math.PI, front: false, left: side > 0 });
  });

  // 거대한 근육질 팔
  rig.arms = [];
  [1, -1].forEach((side) => {
    const sh = new THREE.Group();
    sh.position.set(side * 0.72, 0.16, 0.5);
    body.add(sh);
    add(sh, G.cyl, m.main, [0, -0.22, 0.1], [0.2, 0.66, 0.2], [0.5, 0, 0]);
    add(sh, G.cyl, m.dark, [0, -0.56, 0.26], [0.15, 0.5, 0.15], [0.8, 0, 0]);
    add(sh, G.sphereLow, m.dark, [0, -0.82, 0.42], [0.24, 0.2, 0.24]);       // 주먹
    for (let c = 0; c < 3; c++) {
      add(sh, G.coneLow, m.accent, [side * (c - 1) * 0.11, -0.94, 0.52], [0.04, 0.24, 0.04], [1.9, 0, 0], false);
    }
    rig.arms.push({ pivot: sh, side });
  });

  // 돔형 머리 + 큰 턱
  const head = new THREE.Group();
  head.position.set(0, 0.46, 0.84);
  body.add(head); rig.head = head;
  add(head, G.sphere, m.main, [0, 0.08, 0.04], [0.36, 0.38, 0.36]);
  add(head, G.sphereLow, m.dark, [0, 0.32, -0.1], [0.3, 0.16, 0.26], null, false); // 돔 크레스트
  add(head, G.box, m.main, [0, 0.0, 0.46], [0.5, 0.38, 0.66]);
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.16, 0.2);
  head.add(jaw); rig.jaw = jaw;
  add(jaw, G.box, m.belly, [0, 0, 0.32], [0.44, 0.15, 0.6]);
  for (let i = 0; i < 6; i++) {
    add(head, G.coneLow, m.accent, [0.23, -0.16, 0.24 + i * 0.1], [0.045, 0.15, 0.045], [Math.PI, 0, 0], false);
    add(head, G.coneLow, m.accent, [-0.23, -0.16, 0.24 + i * 0.1], [0.045, 0.15, 0.045], [Math.PI, 0, 0], false);
  }
  add(head, G.sphereLow, m.eye, [0.24, 0.14, 0.2], [0.055, 0.06, 0.05], null, false);
  add(head, G.sphereLow, m.eye, [-0.24, 0.14, 0.2], [0.055, 0.06, 0.05], null, false);
  add(head, G.coneLow, m.dark, [0.2, 0.36, 0.0], [0.07, 0.24, 0.06], [0, 0, -0.35]);
  add(head, G.coneLow, m.dark, [-0.2, 0.36, 0.0], [0.07, 0.24, 0.06], [0, 0, 0.35]);

  const tail = new THREE.Group();
  tail.position.set(0, 0.16, -0.9);
  body.add(tail); rig.tail = tail;
  add(tail, G.cone, m.main, [0, 0, -0.45], [0.34, 1.15, 0.28], [-Math.PI / 2, 0, 0]);
  const tip = new THREE.Group(); tip.position.set(0, 0, -0.9); tail.add(tip); rig.tailTip = tip;
  add(tip, G.cone, m.dark, [0, 0, -0.36], [0.19, 0.9, 0.16], [-Math.PI / 2, 0, 0]);
  rig.height = 3.2;
}

/* ── 상어류 꼬리지느러미: 위-뒤로 긴 윗날개, 아래-뒤로 짧은 아랫날개로 된 세로 초승달 판 ── */
function caudalFin(parent, material, s = 1) {
  const sh = new THREE.Shape();
  sh.moveTo(0.09 * s, 0);                                          // 꼬리뿌리(뾰족한 앞) — 꼬리자루에 박힌다
  sh.quadraticCurveTo(0.0 * s, 0.24 * s, -0.40 * s, 0.52 * s);     // 윗날개 앞날 → 위-뒤 끝
  sh.quadraticCurveTo(-0.21 * s, 0.22 * s, -0.24 * s, 0.02 * s);   // 윗날개 뒷날 (오목한 안쪽)
  sh.quadraticCurveTo(-0.21 * s, -0.14 * s, -0.36 * s, -0.30 * s); // 아랫날개 뒷날 → 아래-뒤 끝
  sh.quadraticCurveTo(-0.10 * s, -0.15 * s, 0.09 * s, 0);          // 아랫날개 앞날
  sh.closePath();
  const geo = new THREE.ExtrudeGeometry(sh, {
    depth: 0.03 * s, bevelEnabled: true, bevelThickness: 0.01 * s, bevelSize: 0.02 * s,
    bevelSegments: 2, curveSegments: 10,
  });
  geo.translate(0, 0, -0.015 * s);  // 두께 중심 맞춤
  geo.rotateY(-Math.PI / 2);        // 옆면(Y-Z)에 세워진 납작한 판으로
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  parent.add(mesh);
  return mesh;
}

/* ───────────────────────────── 상어 ───────────────────────────── */
function buildShark(g, m, rig) {
  const body = new THREE.Group();
  body.position.y = 0.34;
  g.add(body); rig.body = body; rig.bodyY = 0.34;

  // 유선형 몸통
  add(body, G.sphere, m.main, [0, 0, 0], [0.34, 0.36, 1.1]);
  add(body, G.sphereLow, m.belly, [0, -0.12, 0.06], [0.24, 0.17, 0.74], null, false);

  // 등지느러미 · 작은 등지느러미 두 개
  add(body, G.coneLow, m.dark, [0, 0.36, -0.08], [0.1, 0.52, 0.3], [-0.55, 0, 0]);
  add(body, G.coneLow, m.dark, [0, 0.28, -0.62], [0.06, 0.2, 0.16], [-0.7, 0, 0], false);
  // 배지느러미 (옆구리가 아니라 배 아래에서 뒤-아래로)
  add(body, G.coneLow, m.dark, [0.17, -0.21, -0.42], [0.04, 0.11, 0.09], [-2.3, 0, -0.5], false);
  add(body, G.coneLow, m.dark, [-0.17, -0.21, -0.42], [0.04, 0.11, 0.09], [-2.3, 0, 0.5], false);

  // 가슴지느러미 (지면 가까이)
  add(body, G.sphereLow, m.dark, [0.44, -0.14, 0.26], [0.36, 0.05, 0.19], [0, 0.34, -0.22]);
  add(body, G.sphereLow, m.dark, [-0.44, -0.14, 0.26], [0.36, 0.05, 0.19], [0, -0.34, 0.22]);

  // 꼬리: 몸통 뒤에서 가늘어지는 꼬리자루 + 세로 초승달 꼬리지느러미
  const tail = new THREE.Group();
  tail.position.set(0, 0.05, -0.8);
  body.add(tail); rig.tail = tail;
  add(tail, G.coneLow, m.main, [0, 0, -0.14], [0.19, 0.48, 0.22], [-Math.PI / 2, 0, 0], false);
  const tip = new THREE.Group();
  tip.position.set(0, 0, -0.35);
  tail.add(tip); rig.tailTip = tip;
  caudalFin(tip, m.dark, 1);

  // 머리: 몸통에서 바로 이어지는 쐐기형 주둥이 (앞으로 갈수록 납작해지고 둥글게 마무리된다)
  const head = new THREE.Group();
  head.position.set(0, -0.02, 1.02);
  body.add(head); rig.head = head;
  add(head, SNOUT_GEO, m.main, [0, 0, -0.465], [0.27, 0.885, 0.3], [Math.PI / 2, 0, 0]);

  // 아가리: 주둥이 아래 검은 입 테두리 + 흰 아래턱
  add(head, G.sphereLow, m.dark, [0, -0.09, 0.15], [0.055, 0.022, 0.11], [-0.3, 0, 0], false);
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.02, -0.1);
  head.add(jaw); rig.jaw = jaw;
  // 아래턱: 턱 관절에서 앞으로 뽑은 판 — 닫으면 주둥이 아래에 딱 붙는다
  add(jaw, G.sphereLow, m.main, [0, -0.1, 0.12], [0.065, 0.026, 0.12], [-0.28, 0, 0], false);

  // 이빨: 아가리 테두리에 짧게 붙어 있는 톱니
  for (let i = 0; i < 3; i++) {
    const zz = 0.235 - i * 0.045;
    const xx = 0.034 - i * 0.002;
    add(head, G.coneLow, m.accent, [xx, -0.104, zz], [0.01, 0.026, 0.01], [Math.PI - 0.05, 0, -0.03], false);
    add(head, G.coneLow, m.accent, [-xx, -0.104, zz], [0.01, 0.026, 0.01], [Math.PI - 0.05, 0, 0.03], false);
    add(jaw, G.coneLow, m.accent, [xx * 0.8, -0.075, zz - 0.06], [0.009, 0.022, 0.009], [0.08, 0, -0.03], false);
    add(jaw, G.coneLow, m.accent, [-xx * 0.8, -0.075, zz - 0.06], [0.009, 0.022, 0.009], [0.08, 0, 0.03], false);
  }
  add(head, G.sphereLow, m.eye, [0.128, 0.05, -0.05], [0.021, 0.028, 0.023], null, false);
  add(head, G.sphereLow, m.eye, [-0.128, 0.05, -0.05], [0.021, 0.028, 0.023], null, false);
  add(head, G.sphereLow, m.eye, [-0.19, 0.055, 0.03], [0.036, 0.044, 0.032], null, false);
  // 아가미 틈
  for (let i = 0; i < 3; i++) {
    add(body, G.box, m.dark, [0.29, 0.02, 0.46 - i * 0.09], [0.02, 0.18, 0.025], [0, 0, 0.12], false);
    add(body, G.box, m.dark, [-0.29, 0.02, 0.46 - i * 0.09], [0.02, 0.18, 0.025], [0, 0, -0.12], false);
  }
  rig.height = 1.15;
}

/* ───────────────────────────── 메갈로돈 ───────────────────────────── */
function buildMegalodon(g, m, rig) {
  const body = new THREE.Group();
  body.position.y = 0.62;
  g.add(body); rig.body = body; rig.bodyY = 0.62;

  // 육중한 몸통
  add(body, G.sphere, m.main, [0, 0, 0], [0.58, 0.56, 1.35]);
  add(body, G.sphereLow, m.belly, [0, -0.24, 0.05], [0.46, 0.3, 1.1], null, false);
  add(body, G.sphere, m.main, [0, 0.06, 1.02], [0.4, 0.36, 0.55]);

  // 거대 등지느러미
  add(body, G.coneLow, m.dark, [0, 0.5, -0.05], [0.14, 0.72, 0.42], [-0.5, 0, 0]);
  add(body, G.coneLow, m.dark, [0, 0.42, -0.72], [0.08, 0.3, 0.2], [-0.7, 0, 0], false);
  // 배지느러미 (옆구리가 아니라 배 아래에서 뒤-아래로)
  add(body, G.coneLow, m.dark, [0.24, -0.42, -0.62], [0.07, 0.18, 0.14], [-2.2, 0, -0.4], false);
  add(body, G.coneLow, m.dark, [-0.24, -0.42, -0.62], [0.07, 0.18, 0.14], [-2.2, 0, 0.4], false);

  // 커다란 가슴지느러미
  add(body, G.sphereLow, m.dark, [0.72, -0.28, 0.3], [0.58, 0.07, 0.28], [0, 0.36, -0.2]);
  add(body, G.sphereLow, m.dark, [-0.72, -0.28, 0.3], [0.58, 0.07, 0.28], [0, -0.36, 0.2]);

  // 강력한 꼬리: 두꺼운 꼬리자루 + 거대한 초승달 꼬리지느러미
  const tail = new THREE.Group();
  tail.position.set(0, 0.1, -0.9);
  body.add(tail); rig.tail = tail;
  add(tail, G.coneLow, m.main, [0, 0, -0.29], [0.32, 0.66, 0.38], [-Math.PI / 2, 0, 0], false);
  const tip = new THREE.Group();
  tip.position.set(0, 0, -0.57);
  tail.add(tip); rig.tailTip = tip;
  caudalFin(tip, m.dark, 1.55);

  // 거대한 턱
  const head = new THREE.Group();
  head.position.set(0, -0.04, 1.28);
  body.add(head); rig.head = head;
  add(head, G.box, m.main, [0, 0.02, 0.16], [0.5, 0.32, 0.5]);
  add(head, G.sphereLow, m.accent, [0, 0.14, 0.1], [0.26, 0.12, 0.32], null, false);
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.16, 0.06);
  head.add(jaw); rig.jaw = jaw;
  add(jaw, G.box, m.belly, [0, 0.01, 0.28], [0.44, 0.13, 0.62]);
  for (let i = 0; i < 5; i++) {
    add(head, G.coneLow, m.accent, [0.2, -0.12, 0.12 + i * 0.1], [0.045, 0.16, 0.045], [Math.PI, 0, 0], false);
    add(head, G.coneLow, m.accent, [-0.2, -0.12, 0.12 + i * 0.1], [0.045, 0.16, 0.045], [Math.PI, 0, 0], false);
  }
  add(head, G.sphereLow, m.eye, [0.22, 0.12, 0.02], [0.05, 0.055, 0.04], null, false);
  add(head, G.sphereLow, m.eye, [-0.22, 0.12, 0.02], [0.05, 0.055, 0.04], null, false);
  for (let i = 0; i < 4; i++) {
    add(body, G.box, m.dark, [0.52, 0.02, 0.6 - i * 0.1], [0.025, 0.26, 0.03], [0, 0, 0.1], false);
    add(body, G.box, m.dark, [-0.52, 0.02, 0.6 - i * 0.1], [0.025, 0.26, 0.03], [0, 0, -0.1], false);
  }
  rig.height = 1.7;
}

/* ───────────────────────────── 모사사우르스 ───────────────────────────── */
function buildMosasaurus(g, m, rig) {
  const body = new THREE.Group();
  body.position.y = 0.78;
  g.add(body); rig.body = body; rig.bodyY = 0.78;

  // 길게 이어진 해양 파충류 몸통 (3마디)
  add(body, G.sphere, m.main, [0, 0, 0.16], [0.42, 0.44, 0.78]);
  add(body, G.sphere, m.main, [0, -0.02, -0.66], [0.36, 0.38, 0.62]);
  add(body, G.sphereLow, m.belly, [0, -0.2, 0.1], [0.34, 0.24, 1.0], null, false);
  // 등 돌기
  for (let i = 0; i < 6; i++) {
    add(body, G.coneLow, m.dark, [0, 0.36 - i * 0.02, 0.5 - i * 0.22], [0.06, 0.2, 0.1], [-0.35, 0, 0], false);
  }

  // 네 개의 노 지느러미
  add(body, G.sphereLow, m.dark, [0.52, -0.16, 0.42], [0.42, 0.06, 0.22], [0, 0.4, -0.25]);
  add(body, G.sphereLow, m.dark, [-0.52, -0.16, 0.42], [0.42, 0.06, 0.22], [0, -0.4, 0.25]);
  add(body, G.sphereLow, m.dark, [0.42, -0.16, -0.42], [0.32, 0.05, 0.18], [0, 0.2, -0.2]);
  add(body, G.sphereLow, m.dark, [-0.42, -0.16, -0.42], [0.32, 0.05, 0.18], [0, -0.2, 0.2]);

  // 긴 꼬리 · 꼬리지느러미
  const tail = new THREE.Group();
  tail.position.set(0, 0, -1.16);
  body.add(tail); rig.tail = tail;
  add(tail, G.cone, m.main, [0, 0, -0.34], [0.22, 0.8, 0.2], [-Math.PI / 2, 0, 0]);
  add(tail, G.coneLow, m.dark, [0, 0.22, -0.6], [0.08, 0.4, 0.12], [0.5, 0, 0], false);
  const tip = new THREE.Group(); tip.position.set(0, 0, -0.7); tail.add(tip); rig.tailTip = tip;

  // 긴 악어 턱
  const head = new THREE.Group();
  head.position.set(0, 0.06, 0.94);
  body.add(head); rig.head = head;
  add(head, G.sphere, m.main, [0, 0, 0.06], [0.26, 0.22, 0.3]);
  add(head, G.box, m.main, [0, 0.02, 0.5], [0.3, 0.2, 0.66]);
  add(head, G.sphereLow, m.accent, [0, 0.14, 0.28], [0.16, 0.08, 0.24], null, false);
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.1, 0.2);
  head.add(jaw); rig.jaw = jaw;
  add(jaw, G.box, m.belly, [0, 0.01, 0.36], [0.26, 0.1, 0.68]);
  for (let i = 0; i < 6; i++) {
    add(head, G.coneLow, m.accent, [0.13, -0.06, 0.22 + i * 0.1], [0.03, 0.12, 0.03], [Math.PI, 0, 0], false);
    add(head, G.coneLow, m.accent, [-0.13, -0.06, 0.22 + i * 0.1], [0.03, 0.12, 0.03], [Math.PI, 0, 0], false);
  }
  add(head, G.sphereLow, m.eye, [0.16, 0.1, 0.12], [0.045, 0.05, 0.04], null, false);
  add(head, G.sphereLow, m.eye, [-0.16, 0.1, 0.12], [0.045, 0.05, 0.04], null, false);
  add(head, G.coneLow, m.dark, [0.14, 0.22, -0.04], [0.05, 0.16, 0.05], [0, 0, -0.3], false);
  add(head, G.coneLow, m.dark, [-0.14, 0.22, -0.04], [0.05, 0.16, 0.05], [0, 0, 0.3], false);
  rig.height = 1.45;
}

/* ───────────────────────────── 레비아탄 ───────────────────────────── */
function buildLeviathan(g, m, rig) {
  const body = new THREE.Group();
  body.position.y = 1.15;
  g.add(body); rig.body = body; rig.bodyY = 1.15;

  // 심해 바다벰 — 아래로 감긴 몸통
  add(body, G.sphereLow, m.main, [0, -0.62, -0.1], [0.72, 0.4, 0.78]);
  add(body, G.capsule, m.main, [0, 0.1, 0], [0.78, 0.86, 0.72], [0.1, 0, 0]);
  add(body, G.sphereLow, m.belly, [0, -0.1, 0.24], [0.5, 0.34, 0.4], null, false);
  // 빛나는 등지느러미
  for (let i = 0; i < 5; i++) {
    const y = 0.42 - i * 0.24;
    add(body, G.coneLow, m.accent, [0, y, -0.42 + i * 0.02], [0.08, 0.34, 0.24], [1.1, 0, 0], false);
  }
  add(body, G.sphereLow, m.accent, [0.44, 0.02, 0.1], [0.3, 0.05, 0.2], [0, 0.5, 0.2], false);
  add(body, G.sphereLow, m.accent, [-0.44, 0.02, 0.1], [0.3, 0.05, 0.2], [0, -0.5, -0.2], false);

  // 바닥을 받치는 지느러미
  add(body, G.sphereLow, m.dark, [0.46, -0.86, 0.02], [0.34, 0.06, 0.26], [0, 0.2, -0.1]);
  add(body, G.sphereLow, m.dark, [-0.46, -0.86, 0.02], [0.34, 0.06, 0.26], [0, -0.2, 0.1]);

  // 긴 목 · 뱀 머리
  const head = new THREE.Group();
  head.position.set(0, 0.98, 0.44);
  body.add(head); rig.head = head;
  add(head, G.cyl, m.main, [0, -0.34, -0.26], [0.18, 0.72, 0.18], [0.75, 0, 0]);
  add(head, G.sphere, m.main, [0, 0.02, 0.1], [0.28, 0.24, 0.34]);
  add(head, G.box, m.main, [0, 0.0, 0.42], [0.28, 0.18, 0.44]);
  add(head, G.sphereLow, m.accent, [0, 0.12, 0.26], [0.14, 0.08, 0.24], null, false);
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.1, 0.14);
  head.add(jaw); rig.jaw = jaw;
  add(jaw, G.box, m.belly, [0, 0.0, 0.32], [0.24, 0.09, 0.5]);
  for (let i = 0; i < 4; i++) {
    add(head, G.coneLow, m.accent, [0.12, -0.07, 0.2 + i * 0.09], [0.028, 0.12, 0.028], [Math.PI, 0, 0], false);
    add(head, G.coneLow, m.accent, [-0.12, -0.07, 0.2 + i * 0.09], [0.028, 0.12, 0.028], [Math.PI, 0, 0], false);
  }
  add(head, G.sphereLow, m.accent, [0.15, 0.12, 0.14], [0.05, 0.05, 0.04], null, false);
  add(head, G.sphereLow, m.accent, [-0.15, 0.12, 0.14], [0.05, 0.05, 0.04], null, false);
  // 뿔
  add(head, G.coneLow, m.accent, [0.16, 0.26, -0.04], [0.06, 0.3, 0.05], [0.2, 0, -0.4]);
  add(head, G.coneLow, m.accent, [-0.16, 0.26, -0.04], [0.06, 0.3, 0.05], [0.2, 0, 0.4]);

  // 긴 꼬리
  const tail = new THREE.Group();
  tail.position.set(0, -0.42, -0.62);
  body.add(tail); rig.tail = tail;
  add(tail, G.cone, m.main, [0, 0, -0.5], [0.26, 1.05, 0.2], [-Math.PI / 2 - 0.25, 0, 0]);
  add(tail, G.sphereLow, m.accent, [0, 0.0, -1.0], [0.24, 0.08, 0.26], [0, 0, 0], false);
  const tip = new THREE.Group(); tip.position.set(0, 0, -0.94); tail.add(tip); rig.tailTip = tip;
  rig.height = 2.4;
}

/* ───────────────────────────── 스톤골렘 ───────────────────────────── */
function buildStoneGolem(g, m, rig) {
  const body = new THREE.Group();
  body.position.y = 1.05;
  g.add(body); rig.body = body; rig.bodyY = 1.05;

  // 바위 덩어리 몸통
  add(body, G.box, m.main, [0, 0.06, 0], [1.18, 0.96, 0.82], [0, 0, 0]);
  add(body, G.box, m.dark, [0, 0.38, 0.02], [0.96, 0.4, 0.7], [0.06, 0.1, 0]);
  add(body, G.sphereLow, m.main, [0.3, 0.5, 0.22], [0.34, 0.3, 0.3]);
  add(body, G.sphereLow, m.main, [-0.3, 0.5, 0.22], [0.34, 0.3, 0.3]);
  add(body, G.sphereLow, m.dark, [0.02, 0.1, 0.44], [0.34, 0.3, 0.2], null, false);
  // 빛나는 룬
  add(body, G.box, m.accent, [0, 0.1, 0.42], [0.1, 0.34, 0.03], null, false);
  add(body, G.box, m.accent, [0.16, 0.3, 0.42], [0.1, 0.04, 0.03], null, false);
  add(body, G.box, m.accent, [-0.16, -0.06, 0.42], [0.1, 0.04, 0.03], null, false);

  // 짧은 바위 다리
  rig.legs = quadLegs(body, m.dark, { x: 0.4, zf: 0.22, zb: -0.24, len: 0.62, r: 0.2 });
  rig.legs.forEach((l) => { l.pivot.position.x += l.left ? 0.06 : -0.06; });

  // 거대한 주먹
  const arms = [];
  [1, -1].forEach((side) => {
    const sh = new THREE.Group();
    sh.position.set(side * 0.72, 0.4, 0.02);
    body.add(sh);
    add(sh, G.box, m.dark, [0, -0.36, 0], [0.32, 0.72, 0.3]);
    add(sh, G.box, m.main, [0, -0.82, 0.02], [0.5, 0.44, 0.48]);
    add(sh, G.sphereLow, m.accent, [0, -0.82, 0.26], [0.06, 0.06, 0.05], null, false);
    arms.push({ pivot: sh, side });
  });
  rig.arms = arms;

  const head = new THREE.Group();
  head.position.set(0, 0.78, 0.14);
  body.add(head); rig.head = head;
  add(head, G.box, m.main, [0, 0, 0], [0.56, 0.46, 0.5]);
  add(head, G.box, m.dark, [0, -0.06, 0.22], [0.4, 0.18, 0.1], null, false);
  add(head, G.box, m.accent, [0.13, 0.1, 0.24], [0.09, 0.07, 0.04], null, false);
  add(head, G.box, m.accent, [-0.13, 0.1, 0.24], [0.09, 0.07, 0.04], null, false);
  add(head, G.box, m.dark, [0, 0.26, -0.02], [0.62, 0.1, 0.5], null, false);
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.16, 0.12);
  head.add(jaw); rig.jaw = jaw;
  add(jaw, G.box, m.dark, [0, 0, 0.08], [0.38, 0.1, 0.24], null, false);
  rig.height = 2.2;
  rig.upright = true;
}

/* ───────────────────────────── 드래곤 ───────────────────────────── */
function buildDragon(g, m, rig) {
  const body = new THREE.Group();
  body.position.y = 1.3;
  g.add(body); rig.body = body; rig.bodyY = 1.3;

  add(body, G.sphere, m.main, [0, 0, 0.02], [0.4, 0.42, 0.86]);
  add(body, G.sphereLow, m.belly, [0, -0.18, 0.1], [0.3, 0.22, 0.66], null, false);
  // 등 가시
  for (let i = 0; i < 5; i++) {
    add(body, G.coneLow, m.dark, [0, 0.4, 0.4 - i * 0.22], [0.07, 0.24, 0.1], [0.15, 0, 0], false);
  }

  // 거대한 날개
  const wings = [];
  [1, -1].forEach((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.32, 0.18, 0.02);
    body.add(pivot);
    add(pivot, G.sphereLow, m.main, [side * 0.58, 0.05, -0.06], [0.62, 0.07, 0.38], [0, side * 0.12, 0]);
    add(pivot, G.sphereLow, m.dark, [side * 0.94, -0.02, -0.34], [0.42, 0.05, 0.3], [0, side * 0.22, 0], false);
    add(pivot, G.sphereLow, m.dark, [side * 0.7, 0.02, 0.28], [0.38, 0.04, 0.2], [0, side * 0.1, 0], false);
    for (let i = 0; i < 3; i++) {
      add(pivot, G.coneLow, m.accent, [side * (0.5 + i * 0.28), 0.04, -0.42 - i * 0.04], [0.03, 0.3, 0.03], [1.4, 0, side * 0.2], false);
    }
    wings.push({ pivot, side });
  });
  rig.wings = wings;

  // 네 발
  const legs = [];
  [[1, 0.34], [-1, 0.34], [1, -0.34], [-1, -0.34]].forEach(([side, z], i) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.34, -0.16, z);
    body.add(pivot);
    add(pivot, G.cyl, m.dark, [0, -0.3, 0], [0.1, 0.6, 0.1]);
    add(pivot, G.box, m.accent, [0, -0.58, 0.08], [0.18, 0.09, 0.28], null, false);
    legs.push({ pivot, phase: i * (Math.PI / 2), front: z > 0, left: side > 0 });
  });
  rig.legs = legs;

  // 긴 목 · 뿔 달린 머리
  const head = new THREE.Group();
  head.position.set(0, 0.62, 0.74);
  body.add(head); rig.head = head;
  add(head, G.cyl, m.main, [0, -0.2, -0.22], [0.15, 0.62, 0.15], [0.9, 0, 0]);
  add(head, G.sphere, m.main, [0, 0.06, 0.12], [0.24, 0.22, 0.3]);
  add(head, G.box, m.main, [0, 0.02, 0.42], [0.24, 0.18, 0.4]);
  add(head, G.sphereLow, m.accent, [0, 0.14, 0.3], [0.12, 0.07, 0.22], null, false);
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.1, 0.16);
  head.add(jaw); rig.jaw = jaw;
  add(jaw, G.box, m.belly, [0, 0, 0.3], [0.2, 0.08, 0.5]);
  for (let i = 0; i < 4; i++) {
    add(head, G.coneLow, m.accent, [0.1, -0.07, 0.26 + i * 0.08], [0.025, 0.1, 0.025], [Math.PI, 0, 0], false);
    add(head, G.coneLow, m.accent, [-0.1, -0.07, 0.26 + i * 0.08], [0.025, 0.1, 0.025], [Math.PI, 0, 0], false);
  }
  add(head, G.sphereLow, m.eye, [0.14, 0.12, 0.16], [0.045, 0.05, 0.035], null, false);
  add(head, G.sphereLow, m.eye, [-0.14, 0.12, 0.16], [0.045, 0.05, 0.035], null, false);
  add(head, G.coneLow, m.dark, [0.13, 0.3, -0.02], [0.06, 0.3, 0.05], [0.15, 0, -0.3]);
  add(head, G.coneLow, m.dark, [-0.13, 0.3, -0.02], [0.06, 0.3, 0.05], [0.15, 0, 0.3]);
  add(head, G.coneLow, m.accent, [0, 0.26, -0.18], [0.05, 0.22, 0.05], [-0.3, 0, 0], false);

  // 가시 달린 꼬리
  const tail = new THREE.Group();
  tail.position.set(0, 0.04, -0.86);
  body.add(tail); rig.tail = tail;
  add(tail, G.cone, m.main, [0, 0, -0.42], [0.2, 0.95, 0.16], [-Math.PI / 2, 0, 0]);
  add(tail, G.coneLow, m.accent, [0, 0.02, -0.92], [0.14, 0.3, 0.1], [-Math.PI / 2 - 0.3, 0, 0], false);
  const tip = new THREE.Group(); tip.position.set(0, 0, -0.86); tail.add(tip); rig.tailTip = tip;
  rig.height = 2.2;
  rig.air = true;
}

/* ───────────────────────────── 고블린 ───────────────────────────── */
function buildGoblin(g, m, rig) {
  const def = rig.def;
  const body = new THREE.Group();
  body.position.y = 0.62;
  g.add(body); rig.body = body; rig.bodyY = 0.62;

  // 작고 구부정한 몸
  add(body, G.capsule, m.main, [0, 0.02, 0], [0.42, 0.5, 0.36], [0.22, 0, 0]);
  add(body, G.sphereLow, m.belly, [0, -0.14, 0.16], [0.26, 0.2, 0.16], null, false);
  add(body, G.sphereLow, m.dark, [0, -0.06, -0.2], [0.2, 0.18, 0.1], null, false);

  // 짧은 다리
  rig.legs = [];
  [1, -1].forEach((side, i) => {
    const piv = new THREE.Group();
    piv.position.set(side * 0.16, -0.26, 0.02);
    body.add(piv);
    add(piv, G.cyl, m.dark, [0, -0.2, 0], [0.08, 0.4, 0.08]);
    add(piv, G.box, m.accent, [0, -0.4, 0.08], [0.14, 0.08, 0.22], null, false);
    rig.legs.push({ pivot: piv, phase: i * Math.PI, front: false, left: side > 0 });
  });

  // 팔 + 몽둥이
  rig.arms = [];
  [1, -1].forEach((side) => {
    const piv = new THREE.Group();
    piv.position.set(side * 0.28, 0.16, 0.02);
    body.add(piv);
    add(piv, G.cyl, m.main, [0, -0.2, 0.02], [0.06, 0.4, 0.06], [0.2, 0, 0]);
    add(piv, G.sphereLow, m.main, [0, -0.4, 0.06], [0.075, 0.07, 0.075], null, false);
    const arm = { pivot: piv, side };
    if (side > 0) {
      const club = new THREE.Group();
      club.position.set(0, -0.42, 0.1);
      club.rotation.x = 0.6;
      piv.add(club);
      add(club, G.cyl, m.dark, [0, 0, 0.22], [0.04, 0.46, 0.04], [Math.PI / 2, 0, 0], false);
      add(club, G.sphereLow, m.accent, [0, 0, 0.5], [0.1, 0.1, 0.12], null, false);
      for (let i = 0; i < 3; i++) {
        add(club, G.coneLow, m.dark, [Math.cos(i * 2.1) * 0.08, 0.06, 0.54], [0.025, 0.08, 0.025], [0.6, 0, 0], false);
      }
      arm.sword = true;
    }
    rig.arms.push(arm);
  });

  // 큰 머리 · 뾰족귀 · 코
  const head = new THREE.Group();
  head.position.set(0, 0.36, 0.12);
  body.add(head); rig.head = head;
  add(head, G.sphere, m.main, [0, 0, 0], [0.3, 0.27, 0.28]);
  add(head, G.sphereLow, m.accent, [0, -0.06, 0.22], [0.16, 0.1, 0.14], null, false);
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.14, 0.12);
  head.add(jaw); rig.jaw = jaw;
  add(jaw, G.box, m.belly, [0, 0, 0.1], [0.18, 0.05, 0.16], null, false);
  for (let i = 0; i < 2; i++) {
    add(head, G.coneLow, m.accent, [0.06 + i * 0.05, -0.1, 0.2], [0.018, 0.06, 0.018], [Math.PI, 0, 0], false);
    add(head, G.coneLow, m.accent, [-0.06 - i * 0.05, -0.1, 0.2], [0.018, 0.06, 0.018], [Math.PI, 0, 0], false);
  }
  add(head, G.sphereLow, m.eye, [0.12, 0.06, 0.18], [0.05, 0.05, 0.04], null, false);
  add(head, G.sphereLow, m.eye, [-0.12, 0.06, 0.18], [0.05, 0.05, 0.04], null, false);
  // 뾰족한 귀
  add(head, G.coneLow, m.main, [0.3, 0.12, -0.02], [0.09, 0.34, 0.06], [0.2, 0, -1.1]);
  add(head, G.coneLow, m.main, [-0.3, 0.12, -0.02], [0.09, 0.34, 0.06], [0.2, 0, 1.1]);
  add(head, G.sphereLow, m.dark, [0, 0.24, -0.06], [0.2, 0.08, 0.16], null, false);
  rig.height = 1.15;
  rig.upright = true;
  void def;
}

/* ───────────────────────────── 강하닭 (RPG 최종 보스) ───────────────────────────── */
function buildStrongChicken(g, m, rig) {
  const combMat = mat(0xd83a3a, { roughness: 0.58, emissive: 0x5a0a0a, emissiveIntensity: 0.35 });
  const beakMat = mat(0xffc23a, { roughness: 0.36, metalness: 0.24, emissive: 0x6a3a00, emissiveIntensity: 0.25 });
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xffe08a, emissive: 0xffa020, emissiveIntensity: 1.15, roughness: 0.3, metalness: 0.85, flatShading: true,
  });
  const wattlMat = mat(0xc8323a, { roughness: 0.62, emissive: 0x4a0608, emissiveIntensity: 0.3 });
  rig.matList.push(combMat, beakMat, goldMat, wattlMat);

  const body = new THREE.Group();
  body.position.y = 1.12;
  g.add(body); rig.body = body; rig.bodyY = 1.12;

  // 거대하고 통통한 몸통 · 가슴 깃 · 등 깃
  add(body, G.sphere, m.main, [0, 0, 0], [0.7, 0.72, 0.78]);
  add(body, G.sphere, m.belly, [0, -0.06, 0.34], [0.54, 0.58, 0.44]);
  add(body, G.sphereLow, m.main, [0, 0.2, -0.24], [0.56, 0.4, 0.56], null, false);
  add(body, G.sphereLow, m.main, [0, 0.34, -0.06], [0.36, 0.2, 0.58], null, false);

  // 굵은 닭다리 + 황금 발톱
  rig.legs = [];
  [1, -1].forEach((side, i) => {
    const piv = new THREE.Group();
    piv.position.set(side * 0.3, -0.46, 0);
    body.add(piv);
    add(piv, G.leg, m.dark, [0, -0.26, 0], [0.17, 0.56, 0.17]);
    add(piv, G.box, m.dark, [0, -0.55, 0.1], [0.3, 0.12, 0.4], null, false);
    for (let k = -1; k <= 1; k++) {
      const claw = add(piv, G.cone, goldMat, [k * 0.09, -0.6, 0.34], [0.045, 0.2, 0.045], [Math.PI / 2.1, 0, 0], false);
      claw.castShadow = false;
    }
    rig.legs.push({ pivot: piv, phase: i * Math.PI, front: false, left: side > 0 });
  });

  // 날개 (작은 밑동 + 여러 겹 깃털)
  rig.wingFlap = [];
  const wingMat = mat(0xeeddb4, { roughness: 0.86 });
  rig.matList.push(wingMat);
  [1, -1].forEach((side) => {
    const piv = new THREE.Group();
    piv.position.set(side * 0.58, 0.18, 0.04);
    body.add(piv);
    add(piv, G.sphereLow, wingMat, [side * 0.02, -0.04, 0], [0.1, 0.2, 0.32]);
    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      const f = add(piv, G.coneLow, i % 2 ? goldMat : m.main,
        [side * (0.07 + t * 0.02), -0.08 - t * 0.16, -0.3 + t * 0.26],
        [0.1 + t * 0.02, 0.5 - t * 0.08, 0.07], [0.62 + t * 0.2, 0, side * -0.4], false);
      f.castShadow = false;
    }
    rig.wingFlap.push({ pivot: piv, side });
  });

  // 부채꼴 꼬리깃
  const tail = new THREE.Group();
  tail.position.set(0, 0.24, -0.66);
  body.add(tail); rig.tail = tail;
  for (let i = 0; i < 7; i++) {
    const a = (i / 6 - 0.5) * 1.35;
    const f = add(tail, G.cone, i % 2 ? goldMat : m.main,
      [Math.sin(a) * 0.24, 0.3 + Math.cos(a) * 0.16, -0.14 - Math.cos(a) * 0.14],
      [0.15, 0.72, 0.07], [-0.66 - Math.cos(a) * 0.32, 0, -Math.sin(a) * 0.55], false);
    f.castShadow = false;
  }

  // 목 · 머리
  const head = new THREE.Group();
  head.position.set(0, 0.76, 0.48);
  body.add(head); rig.head = head;
  add(head, G.cyl, m.main, [0, -0.22, -0.02], [0.26, 0.52, 0.26], [0.14, 0, 0]);
  add(head, G.sphere, m.main, [0, 0, 0], [0.38, 0.38, 0.36]);
  add(head, G.sphereLow, m.belly, [0, -0.08, 0.2], [0.3, 0.24, 0.24], null, false);

  // 붉은 벼슬
  for (let i = 0; i < 4; i++) {
    const c = add(head, G.sphereLow, combMat, [0, 0.34 + Math.sin(i * 0.9) * 0.05, 0.16 - i * 0.12], [0.1, 0.17, 0.09], null, false);
    c.castShadow = false;
  }

  // 눈 · 눈썹
  add(head, G.sphereLow, m.accent, [0.18, 0.07, 0.28], [0.1, 0.11, 0.09], null, false);
  add(head, G.sphereLow, m.accent, [-0.18, 0.07, 0.28], [0.1, 0.11, 0.09], null, false);
  add(head, G.sphereLow, m.eye, [0.2, 0.07, 0.34], [0.055, 0.06, 0.05], null, false);
  add(head, G.sphereLow, m.eye, [-0.2, 0.07, 0.34], [0.055, 0.06, 0.05], null, false);
  const browL = add(head, G.box, combMat, [0.19, 0.2, 0.3], [0.15, 0.05, 0.06], [0, 0, -0.36], false);
  const browR = add(head, G.box, combMat, [-0.19, 0.2, 0.3], [0.15, 0.05, 0.06], [0, 0, 0.36], false);
  browL.castShadow = false; browR.castShadow = false;

  // 날카로운 황금 부리
  add(head, G.cone, beakMat, [0, -0.03, 0.46], [0.2, 0.4, 0.16], [Math.PI / 2, Math.PI / 4, 0]);
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.14, 0.34);
  head.add(jaw); rig.jaw = jaw;
  add(jaw, G.cone, beakMat, [0, -0.02, 0.12], [0.15, 0.3, 0.11], [Math.PI / 2, Math.PI / 4, 0], false);
  // 육수
  add(jaw, G.sphereLow, wattlMat, [0.06, -0.13, 0.06], [0.06, 0.12, 0.06], null, false);
  add(jaw, G.sphereLow, wattlMat, [-0.06, -0.13, 0.06], [0.06, 0.12, 0.06], null, false);

  // 황금 왕관
  const crown = new THREE.Group();
  crown.position.set(0, 0.4, -0.02);
  head.add(crown);
  add(crown, G.cyl, goldMat, [0, 0, 0], [0.24, 0.11, 0.24], null, false);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    add(crown, G.coneLow, goldMat, [Math.cos(a) * 0.2, 0.14, Math.sin(a) * 0.2], [0.055, 0.2, 0.055], null, false);
  }

  // 발밑 황금 오라
  const aura = new THREE.Mesh(
    new THREE.RingGeometry(0.9, 1.24, 32),
    new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.24, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  aura.rotation.x = -Math.PI / 2;
  aura.position.y = -1.06;
  body.add(aura);
  rig.auraRing = aura;

  rig.height = 2.5;
  rig.glowScale = 0.42;
}

/* ───────────────────────────── 샌즈 (언더테일) ───────────────────────────── */
function buildSans(g, m, rig) {
  const boneMat = mat(0xf8f8f2, { roughness: 0.55 });
  const sockMat = mat(0xf7f7fb, { roughness: 0.7 });
  const slipperMat = mat(0xff9ec4, { roughness: 0.72 });
  const hoodTrim = mat(0xf4f4f8, { roughness: 0.85 });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0x9ff4ff });
  rig.matList.push(boneMat, sockMat, slipperMat, hoodTrim);

  const body = new THREE.Group();
  body.position.y = 0.98;
  g.add(body); rig.body = body; rig.bodyY = 0.98;

  // 파란 후드 재킷 · 흰 셔츠 · 지퍼
  add(body, G.box, m.main, [0, 0.02, -0.02], [0.58, 0.54, 0.38]);
  add(body, G.box, m.main, [0, 0.06, 0.02], [0.62, 0.34, 0.3], null, false);
  add(body, G.box, boneMat, [0, 0.0, 0.17], [0.22, 0.44, 0.05], null, false);
  add(body, G.box, m.dark, [0, 0.0, 0.21], [0.03, 0.46, 0.03], null, false);
  add(body, G.box, m.dark, [0, 0.24, 0.19], [0.3, 0.05, 0.04], null, false);
  // 목의 하얀 털 후드 칼라 · 등 뒤 후드
  add(body, G.sphereLow, hoodTrim, [0, 0.28, -0.08], [0.34, 0.13, 0.28]);
  add(body, G.sphereLow, m.main, [0, 0.32, -0.2], [0.34, 0.28, 0.22], null, false);
  add(body, G.torus, hoodTrim, [0, 0.3, 0.0], [0.19, 0.19, 0.16], [Math.PI / 2, 0, 0], false);

  // 흰 줄무늬 검은 반바지
  add(body, G.box, m.dark, [0, -0.32, 0.02], [0.5, 0.28, 0.38]);
  add(body, G.box, boneMat, [0, -0.32, 0.2], [0.12, 0.05, 0.02], null, false);
  add(body, G.box, boneMat, [0.26, -0.32, 0.02], [0.02, 0.06, 0.36], null, false);
  add(body, G.box, boneMat, [-0.26, -0.32, 0.02], [0.02, 0.06, 0.36], null, false);

  // 다리 · 흰 양말 · 분홍 슬리퍼
  rig.legs = [];
  [1, -1].forEach((side, i) => {
    const piv = new THREE.Group();
    piv.position.set(side * 0.15, -0.44, 0);
    body.add(piv);
    add(piv, G.cyl, sockMat, [0, -0.16, 0], [0.085, 0.34, 0.085]);
    add(piv, G.box, slipperMat, [0, -0.36, 0.08], [0.19, 0.1, 0.34], null, false);
    rig.legs.push({ pivot: piv, phase: i * Math.PI, front: false, left: side > 0 });
  });

  // 팔 (파란 소매 · 해골 손)
  rig.arms = [];
  [1, -1].forEach((side) => {
    const piv = new THREE.Group();
    piv.position.set(side * 0.34, 0.18, 0.02);
    body.add(piv);
    add(piv, G.cyl, m.main, [0, -0.2, 0], [0.12, 0.42, 0.12]);
    add(piv, G.sphereLow, boneMat, [0, -0.42, 0.03], [0.1, 0.1, 0.09], null, false);
    for (let f = 0; f < 3; f++) {
      add(piv, G.box, boneMat, [-0.05 + f * 0.05, -0.5, 0.05], [0.025, 0.09, 0.03], null, false);
    }
    rig.arms.push({ pivot: piv, side });
  });

  // 동그란 해골 머리
  const head = new THREE.Group();
  head.position.set(0, 0.64, 0.06);
  body.add(head); rig.head = head;
  add(head, G.sphere, boneMat, [0, 0, 0], [0.36, 0.4, 0.34]);
  add(head, G.sphereLow, boneMat, [0, -0.1, 0.12], [0.28, 0.2, 0.26], null, false);
  // 검은 눈구멍
  add(head, G.sphereLow, m.eye, [0.13, 0.06, 0.28], [0.1, 0.13, 0.06], null, false);
  add(head, G.sphereLow, m.eye, [-0.13, 0.06, 0.28], [0.1, 0.13, 0.06], null, false);
  // 빛나는 시안 왼쪽 눈
  const eyeGlow = add(head, G.sphereLow, glowMat, [-0.13, 0.06, 0.33], [0.055, 0.07, 0.03], null, false);
  rig.eyeGlow = eyeGlow;
  // 코 · 장난기 있는 웃는 입
  add(head, G.sphereLow, m.eye, [0, -0.04, 0.34], [0.045, 0.035, 0.03], null, false);
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.14, 0.12);
  head.add(jaw); rig.jaw = jaw;
  add(jaw, G.box, m.eye, [0, 0, 0.16], [0.3, 0.1, 0.1], null, false);
  for (let i = 0; i < 5; i++) {
    add(jaw, G.box, boneMat, [-0.12 + i * 0.06, 0.05, 0.2], [0.04, 0.06, 0.03], null, false);
    add(jaw, G.box, boneMat, [-0.12 + i * 0.06, -0.05, 0.2], [0.04, 0.06, 0.03], null, false);
  }

  /* ── 라스트 브레스 페이즈 장식 ── */
  const phase = (rig.def && rig.def.phase) || 1;
  if (phase >= 2) {
    const woundMat = mat(0x8e1420, { roughness: 0.5, emissive: 0x6a0712, emissiveIntensity: 0.65 });
    const bloodMat = mat(0xa81c26, { roughness: 0.45, emissive: 0x5a0510, emissiveIntensity: 0.5 });
    rig.matList.push(woundMat, bloodMat);
    // 가슴을 가로지르는 선명한 붉은 대각선 베인 상처
    add(body, G.box, woundMat, [0.02, 0.06, 0.2], [0.055, 0.52, 0.035], [0, 0, 0.62], false);
    add(body, G.box, bloodMat, [-0.07, -0.1, 0.21], [0.035, 0.26, 0.03], [0, 0, 0.62], false);
    // 입가에 번진 피
    add(head, G.sphereLow, bloodMat, [0.17, -0.23, 0.23], [0.06, 0.045, 0.045], null, false);
    add(head, G.box, bloodMat, [0.2, -0.3, 0.19], [0.028, 0.14, 0.026], null, false);
    // 왼손에 쥔 뼈다귀
    const arm = (rig.arms || []).find((a) => a.side === -1) || (rig.arms || [])[0];
    if (arm) {
      add(arm.pivot, G.cyl, boneMat, [0, -0.62, 0.12], [0.032, 0.42, 0.032], [0.5, 0, 0], false);
      add(arm.pivot, G.sphereLow, boneMat, [0, -0.42, 0.02], [0.055, 0.05, 0.055], null, false);
      add(arm.pivot, G.sphereLow, boneMat, [0, -0.82, 0.24], [0.058, 0.05, 0.058], null, false);
    }
  }
  if (phase >= 3) {
    // 두개골 왼쪽 위가 깨져 금이 간 상처
    const crackMat = mat(0x1a1416, { roughness: 0.95 });
    const chipMat = mat(0x0b0909, { roughness: 0.95 });
    rig.matList.push(crackMat, chipMat);
    add(head, G.sphereLow, chipMat, [-0.17, 0.34, 0.16], [0.11, 0.08, 0.09], null, false);
    add(head, G.box, crackMat, [-0.06, 0.3, 0.27], [0.03, 0.2, 0.02], [0, 0, 0.62], false);
    add(head, G.box, crackMat, [-0.14, 0.16, 0.29], [0.025, 0.16, 0.02], [0, 0, -0.5], false);
    add(head, G.box, crackMat, [0.0, 0.12, 0.3], [0.022, 0.12, 0.02], [0, 0, 0.3], false);
    // 눈이 새까맣게 변다 (시안 빛이 꺼진다)
    if (rig.eyeGlow) { rig.eyeGlow.visible = false; rig.eyeGlow = null; }
    add(head, G.sphereLow, chipMat, [0.13, 0.06, 0.3], [0.11, 0.14, 0.06], null, false);
    add(head, G.sphereLow, chipMat, [-0.13, 0.06, 0.3], [0.11, 0.14, 0.06], null, false);
    // 등 뒤로 드리우는 반투명 가스터 그림자
    const ghostMat = new THREE.MeshStandardMaterial({
      color: 0x16222e, flatShading: true, roughness: 0.85, metalness: 0.05,
      transparent: true, opacity: 0.44, emissive: 0x2a7f96, emissiveIntensity: 0.35,
    });
    rig.matList.push(ghostMat);
    const ghost = new THREE.Group();
    ghost.position.set(0, 0.46, -0.5);
    body.add(ghost); rig.ghost = ghost;
    add(ghost, G.sphereLow, ghostMat, [0, 0.14, 0], [0.56, 0.7, 0.3], null, false);
    add(ghost, G.sphere, ghostMat, [0, 0.56, 0.06], [0.3, 0.34, 0.3], null, false);
    add(ghost, G.coneLow, ghostMat, [0.24, 0.72, 0.06], [0.07, 0.3, 0.07], [0, 0, -0.5], false);
    add(ghost, G.coneLow, ghostMat, [-0.24, 0.72, 0.06], [0.07, 0.3, 0.07], [0, 0, 0.5], false);
    const ghostEye = new THREE.MeshBasicMaterial({ color: 0x9ff4ff, transparent: true, opacity: 0.75 });
    add(ghost, G.sphereLow, ghostEye, [0.11, 0.6, 0.3], [0.05, 0.06, 0.03], null, false);
    add(ghost, G.sphereLow, ghostEye, [-0.11, 0.6, 0.3], [0.05, 0.06, 0.03], null, false);
    // 발밑 푸른/붉은 오라
    const aura = new THREE.Mesh(
      new THREE.RingGeometry(0.66, 0.92, 30),
      new THREE.MeshBasicMaterial({ color: 0x7fe0ff, transparent: true, opacity: 0.26, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    aura.rotation.x = -Math.PI / 2;
    aura.position.y = -0.98;
    body.add(aura);
    rig.auraRing = aura;
    rig.glowScale = 0.38;
  }

  rig.height = 2.1;
  rig.upright = true;
  if (rig.glowScale == null) rig.glowScale = 0.62;
}

/* ───────────────────────────── 매머드 ───────────────────────────── */
function buildMammoth(g, m, rig) {
  const tuskMat = mat(0xf6efdc, { roughness: 0.5, metalness: 0.08 });
  const furMat = mat(0x4e3624, { roughness: 0.96 });
  rig.matList.push(tuskMat, furMat);

  const body = new THREE.Group();
  body.position.y = 1.16;
  g.add(body); rig.body = body; rig.bodyY = 1.16;

  // 거대한 털복숭이 몸통 · 어깨 혹
  add(body, G.sphere, m.main, [0, 0.02, -0.12], [0.88, 0.82, 1.12]);
  add(body, G.sphere, m.main, [0, 0.3, 0.46], [0.66, 0.6, 0.56]);
  add(body, G.sphereLow, m.belly, [0, -0.3, 0.05], [0.52, 0.24, 0.8], null, false);
  // 털 다발 (몸통을 덮는 덥수룩한 털)
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    add(body, G.sphereLow, furMat,
      [Math.cos(a) * 0.62, -0.2 + Math.sin(a * 2.1) * 0.42, -0.1 + Math.sin(a) * 0.72],
      [0.26, 0.2, 0.26], null, false);
  }

  rig.legs = quadLegs(body, m.dark, { x: 0.5, zf: 0.6, zb: -0.62, len: 0.78, r: 0.22, hoof: m.accent });
  rig.legs.forEach((l) => { l.pivot.position.y = -0.2; });

  const head = new THREE.Group();
  head.position.set(0, 0.42, 1.0);
  body.add(head); rig.head = head;
  add(head, G.sphere, m.main, [0, 0.02, 0], [0.48, 0.46, 0.44]);
  add(head, G.sphereLow, furMat, [0, 0.34, -0.06], [0.42, 0.24, 0.4], null, false);
  // 큰 귀
  const earL = add(head, G.sphereLow, m.dark, [0.5, 0.08, -0.08], [0.08, 0.38, 0.3], [0, 0.5, 0.2]);
  const earR = add(head, G.sphereLow, m.dark, [-0.5, 0.08, -0.08], [0.08, 0.38, 0.3], [0, -0.5, -0.2]);
  rig.ears = [earL, earR];
  add(head, G.sphereLow, m.eye, [0.22, 0.1, 0.28], [0.05, 0.055, 0.04], null, false);
  add(head, G.sphereLow, m.eye, [-0.22, 0.1, 0.28], [0.05, 0.055, 0.04], null, false);

  // 길게 앞으로 휘어 올라간 하얀 엄니 2개 (마디를 이어 굽힌다)
  [1, -1].forEach((side) => {
    const root = new THREE.Group();
    root.position.set(side * 0.26, -0.3, 0.24);
    root.rotation.set(-0.52, 0, side * -0.24);
    head.add(root);
    add(root, G.cyl, tuskMat, [0, -0.38, 0], [0.085, 0.72, 0.085]);
    const seg = new THREE.Group();
    seg.position.set(0, -0.74, 0);
    seg.rotation.x = -0.85;
    root.add(seg);
    add(seg, G.cyl, tuskMat, [0, -0.32, 0], [0.068, 0.62, 0.068]);
    const tip = new THREE.Group();
    tip.position.set(0, -0.63, 0);
    tip.rotation.x = -0.9;
    seg.add(tip);
    add(tip, G.cone, tuskMat, [0, -0.3, 0], [0.062, 0.66, 0.062]);
  });

  // 긴 코 (3마디)
  const trunk = new THREE.Group();
  trunk.position.set(0, -0.14, 0.36);
  head.add(trunk); rig.trunk = trunk;
  add(trunk, G.cyl, m.main, [0, -0.24, 0.04], [0.14, 0.5, 0.14], [0.18, 0, 0]);
  const t2 = new THREE.Group();
  t2.position.set(0, -0.46, 0.1);
  trunk.add(t2);
  add(t2, G.cyl, m.main, [0, -0.2, 0], [0.11, 0.42, 0.11], [-0.15, 0, 0]);
  rig.trunkTip = t2;
  add(t2, G.sphereLow, m.dark, [0, -0.4, 0.02], [0.1, 0.09, 0.1], null, false);

  const tail = new THREE.Group();
  tail.position.set(0, 0.26, -1.16);
  body.add(tail); rig.tail = tail;
  add(tail, G.cyl, m.dark, [0, -0.18, -0.04], [0.06, 0.5, 0.06], [0.12, 0, 0]);
  add(tail, G.sphereLow, furMat, [0, -0.42, -0.04], [0.11, 0.14, 0.11], null, false);

  rig.height = 2.15;
}

/* ───────────────────────────── 히드라 ───────────────────────────── */
function buildHydra(g, m, rig) {
  const scaleMat = mat(0x25523c, { roughness: 0.62 });
  const venomMat = mat(0x9bf06a, { emissive: 0x4aff8a, emissiveIntensity: 0.6, roughness: 0.4 });
  const purpleMat = mat(0x7a3aa8, { emissive: 0x9f4aff, emissiveIntensity: 0.5, roughness: 0.4 });
  rig.matList.push(scaleMat, venomMat, purpleMat);

  const body = new THREE.Group();
  body.position.y = 0.98;
  g.add(body); rig.body = body; rig.bodyY = 0.98;

  add(body, G.sphere, m.main, [0, 0, -0.2], [0.64, 0.5, 0.92]);
  add(body, G.sphereLow, m.belly, [0, -0.24, -0.16], [0.46, 0.2, 0.76], null, false);
  for (let i = 0; i < 8; i++) {
    add(body, G.sphereLow, scaleMat, [0, 0.3 - (i % 2) * 0.12, 0.5 - i * 0.18], [0.16, 0.1, 0.16], null, false);
  }

  rig.legs = quadLegs(body, m.dark, { x: 0.44, zf: 0.38, zb: -0.52, len: 0.68, r: 0.15 });
  rig.legs.forEach((l) => { l.pivot.position.y = -0.14; });

  // 목 세 개 — 가운데 목이 rig.head
  rig.necks = [];
  rig.heads = [];
  const NECKS = [
    { x: -0.44, tilt: -1, s: 0.92, mat: purpleMat },
    { x: 0, tilt: 0, s: 1.0, mat: venomMat },
    { x: 0.44, tilt: 1, s: 0.92, mat: purpleMat },
  ];
  NECKS.forEach((n) => {
    const neck = new THREE.Group();
    neck.position.set(n.x, 0.28, 0.42);
    neck.rotation.set(-0.06, 0, n.tilt * 0.34);
    body.add(neck);
    add(neck, G.cyl, m.dark, [0, 0.3, 0.06], [0.15, 0.7, 0.15], [-0.32, 0, 0]);
    add(neck, G.cyl, m.main, [0, 0.68, 0.24], [0.12, 0.52, 0.12], [-0.62, 0, 0]);
    for (let k = 0; k < 3; k++) {
      add(neck, G.sphereLow, scaleMat, [n.tilt * 0.06, 0.22 + k * 0.26, 0.1 + k * 0.09], [0.18, 0.12, 0.18], null, false);
    }
    const head = new THREE.Group();
    head.position.set(0, 0.9, 0.46);
    head.rotation.set(0.45, 0, 0);
    neck.add(head);
    add(head, G.sphere, m.main, [0, 0, 0], [0.27 * n.s, 0.24 * n.s, 0.3 * n.s]);
    add(head, G.cone, n.mat, [0, -0.05, 0.32], [0.17 * n.s, 0.4 * n.s, 0.15 * n.s], [Math.PI / 2, 0, 0], false);
    add(head, G.sphereLow, m.eye, [0.13, 0.09, 0.16], [0.05, 0.055, 0.04], null, false);
    add(head, G.sphereLow, m.eye, [-0.13, 0.09, 0.16], [0.05, 0.055, 0.04], null, false);
    for (let t = 0; t < 4; t++) {
      add(head, G.coneLow, m.accent, [-0.09 + t * 0.06, -0.14, 0.3], [0.026, 0.1, 0.026], [Math.PI, 0, 0], false);
    }
    // 목 뒤 프릴
    add(head, G.sphereLow, m.dark, [0, 0.16, -0.12], [0.25, 0.18, 0.12], null, false);
    const jaw = new THREE.Group();
    jaw.position.set(0, -0.15, 0.12);
    head.add(jaw);
    add(jaw, G.box, m.belly, [0, 0, 0.16], [0.17, 0.06, 0.26], null, false);
    if (n.tilt === 0) { rig.head = head; rig.jaw = jaw; }
    rig.necks.push(neck);
    rig.heads.push(head);
  });

  const tail = new THREE.Group();
  tail.position.set(0, -0.02, -0.92);
  body.add(tail); rig.tail = tail;
  add(tail, G.cone, m.main, [0, 0, -0.5], [0.24, 1.1, 0.2], [-Math.PI / 2, 0, 0]);
  add(tail, G.sphereLow, scaleMat, [0, 0, -1.02], [0.14, 0.1, 0.14], null, false);

  rig.height = 2.2;
}

/* ───────────────────────────── 킹콩 ───────────────────────────── */
function buildKingKong(g, m, rig) {
  const hairMat = mat(0x1c1410, { roughness: 0.96 });
  const scarMat = mat(0xc8b8a0, { roughness: 0.72 });
  rig.matList.push(hairMat, scarMat);

  const body = new THREE.Group();
  body.position.y = 1.6;
  g.add(body); rig.body = body; rig.bodyY = 1.6;

  // 거대한 가슴 · 어깨 · 등
  add(body, G.sphere, m.main, [0, 0.1, 0.02], [1.02, 0.96, 0.78]);
  add(body, G.sphere, m.main, [0, 0.62, -0.06], [0.9, 0.5, 0.7]);
  add(body, G.sphereLow, m.belly, [0, 0.04, 0.5], [0.6, 0.62, 0.32], null, false);
  for (let i = 0; i < 7; i++) {
    add(body, G.sphereLow, hairMat, [Math.cos(i * 1.1) * 0.42, 0.6 - (i % 3) * 0.34, 0.46], [0.19, 0.15, 0.14], null, false);
  }

  // 짧고 굵은 다리
  rig.legs = [];
  [1, -1].forEach((side, i) => {
    const piv = new THREE.Group();
    piv.position.set(side * 0.44, -0.56, 0.04);
    body.add(piv);
    add(piv, G.leg, m.dark, [0, -0.34, 0], [0.26, 0.72, 0.26]);
    add(piv, G.box, m.accent, [0, -0.72, 0.12], [0.34, 0.16, 0.5], null, false);
    rig.legs.push({ pivot: piv, phase: i * Math.PI, front: false, left: side > 0 });
  });

  // 긴 팔 + 거대한 주먹
  rig.arms = [];
  [1, -1].forEach((side) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.8, 0.42, 0.04);
    body.add(shoulder);
    add(shoulder, G.sphere, m.main, [0, 0, 0], [0.36, 0.34, 0.34]);
    add(shoulder, G.cyl, m.dark, [side * 0.08, -0.5, 0], [0.21, 1.0, 0.21], [0, 0, side * -0.1]);
    add(shoulder, G.sphere, m.dark, [side * 0.16, -1.0, 0.04], [0.31, 0.3, 0.31]);
    add(shoulder, G.sphereLow, m.accent, [side * 0.16, -1.02, 0.28], [0.2, 0.16, 0.1], null, false);
    rig.arms.push({ pivot: shoulder, side });
  });

  const head = new THREE.Group();
  head.position.set(0, 0.94, 0.3);
  body.add(head); rig.head = head;
  add(head, G.sphere, m.main, [0, 0, 0], [0.43, 0.4, 0.4]);
  add(head, G.sphereLow, m.dark, [0, -0.18, 0.28], [0.3, 0.22, 0.24]);
  add(head, G.box, m.dark, [0, 0.2, 0.3], [0.56, 0.14, 0.14], [0.1, 0, 0], false);
  add(head, G.sphereLow, m.eye, [0.15, 0.08, 0.32], [0.055, 0.06, 0.045], null, false);
  add(head, G.sphereLow, m.eye, [-0.15, 0.08, 0.32], [0.055, 0.06, 0.045], null, false);
  add(head, G.sphereLow, m.main, [0, 0.36, -0.04], [0.38, 0.16, 0.34], null, false);
  add(head, G.box, scarMat, [0.24, 0.06, 0.26], [0.04, 0.2, 0.03], [0, 0, 0.5], false);
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.22, 0.14);
  head.add(jaw); rig.jaw = jaw;
  add(jaw, G.sphereLow, m.belly, [0, -0.02, 0.16], [0.2, 0.08, 0.2], null, false);
  for (let i = 0; i < 4; i++) {
    add(jaw, G.coneLow, m.accent, [-0.12 + i * 0.08, 0.07, 0.26], [0.03, 0.12, 0.03], null, false);
  }

  rig.height = 3.0;
  rig.upright = true;
}

/* ───────────────────────────── 영웅 ───────────────────────────── */
function buildHero(g, m, rig) {
  const capeMat = mat(0xc0202e, { roughness: 0.82, side: THREE.DoubleSide });
  const goldMat = mat(0xffd24a, { roughness: 0.34, metalness: 0.65, emissive: 0x6a4a00, emissiveIntensity: 0.18 });
  const skinMat = mat(0xf0c9a0, { roughness: 0.7 });
  const fistMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  rig.matList.push(capeMat, goldMat, skinMat);

  const body = new THREE.Group();
  body.position.y = 1.36;
  g.add(body); rig.body = body; rig.bodyY = 1.36;

  // 갑옷 상체 · 벨트 · 가슴 엠블럼
  add(body, G.box, m.main, [0, 0.16, 0], [0.66, 0.68, 0.42]);
  add(body, G.box, m.dark, [0, 0.02, 0.03], [0.6, 0.3, 0.4], null, false);
  add(body, G.sphereLow, goldMat, [0, 0.3, 0.24], [0.15, 0.15, 0.05], null, false);
  add(body, G.box, goldMat, [0, -0.22, 0], [0.62, 0.12, 0.42], null, false);
  add(body, G.box, m.accent, [0, 0.16, -0.2], [0.5, 0.5, 0.06], null, false);

  // 다리 · 장화
  rig.legs = [];
  [1, -1].forEach((side, i) => {
    const piv = new THREE.Group();
    piv.position.set(side * 0.18, -0.32, 0);
    body.add(piv);
    add(piv, G.box, m.dark, [0, -0.3, 0], [0.23, 0.6, 0.24]);
    add(piv, G.box, goldMat, [0, -0.6, 0.06], [0.26, 0.14, 0.36], null, false);
    rig.legs.push({ pivot: piv, phase: i * Math.PI, front: false, left: side > 0 });
  });

  // 망토 (꼬리 슬롯을 빌려 흔들린다)
  const cape = new THREE.Group();
  cape.position.set(0, 0.34, -0.22);
  body.add(cape); rig.tail = cape;
  add(cape, G.box, capeMat, [0, -0.56, -0.08], [0.84, 1.2, 0.06], [0.16, 0, 0], false);
  add(cape, G.box, m.accent, [0, 0.05, -0.02], [0.5, 0.1, 0.1], null, false);

  // 팔 · 빛나는 주먹
  rig.arms = [];
  [1, -1].forEach((side) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.42, 0.32, 0);
    body.add(shoulder);
    add(shoulder, G.sphere, m.main, [0, 0, 0], [0.21, 0.21, 0.21]);
    add(shoulder, G.cyl, m.dark, [0, -0.28, 0], [0.12, 0.5, 0.12]);
    add(shoulder, G.sphere, fistMat, [0, -0.56, 0.02], [0.17, 0.17, 0.17]);
    add(shoulder, G.sphereLow, goldMat, [0, -0.44, 0.02], [0.13, 0.07, 0.13], null, false);
    rig.arms.push({ pivot: shoulder, side });
  });

  // 머리 (가면 · 눈 슬릿 · 턱)
  const head = new THREE.Group();
  head.position.set(0, 0.64, 0.02);
  body.add(head); rig.head = head;
  add(head, G.sphere, skinMat, [0, -0.02, 0.02], [0.26, 0.27, 0.25]);
  add(head, G.sphereLow, m.main, [0, 0.04, 0.02], [0.285, 0.25, 0.27], null, false);
  add(head, G.box, m.dark, [0, 0.05, 0.22], [0.34, 0.1, 0.1], null, false);
  add(head, G.sphereLow, fistMat, [0.09, 0.05, 0.25], [0.05, 0.035, 0.03], null, false);
  add(head, G.sphereLow, fistMat, [-0.09, 0.05, 0.25], [0.05, 0.035, 0.03], null, false);
  add(head, G.sphere, skinMat, [0, -0.16, 0.13], [0.15, 0.1, 0.12], null, false);
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.22, 0.1);
  head.add(jaw); rig.jaw = jaw;
  add(jaw, G.box, m.dark, [0, 0, 0.04], [0.14, 0.05, 0.06], null, false);

  rig.height = 2.05;
  rig.upright = true;
}

const BUILDERS = {
  lion: buildLion, tiger: buildTiger, elephant: buildElephant, bear: buildBear,
  wolf: buildWolf, eagle: buildEagle, crocodile: buildCrocodile, rhino: buildRhino,
  fox: buildFox, gorilla: buildGorilla, cheetah: buildCheetah, boar: buildBoar,
  trex: buildTRex, spino: buildSpino, triceratops: buildTriceratops,
  raptor: buildRaptor, wyvern: buildWyvern, titan: buildTitan,
  zombie: buildZombie, skeleton: buildSkeleton, snake: buildSnake,
  hyena: buildHyena, drex: buildDRex,
  shark: buildShark, megalodon: buildMegalodon, mosasaurus: buildMosasaurus,
  leviathan: buildLeviathan, stone_golem: buildStoneGolem, dragon: buildDragon,
  goblin: buildGoblin,
  strong_chicken: buildStrongChicken, sans: buildSans,
  sans_p2: buildSans, sans_p3: buildSans,
  mammoth: buildMammoth, hydra: buildHydra, king_kong: buildKingKong, hero: buildHero,
};

export const TEAM_TINTS = { blue: 0x3b7bff, red: 0xff4b3b, green: 0x35d47c, gold: 0xffbe3f };

// 유닛별 공격 모션 (입 물기 · 뿔/엄니 위로 · 주먹 휘두르기 · 급강하)
export const ATTACK_STYLE = {
  lion: 'bite', tiger: 'bite', wolf: 'bite', fox: 'bite', cheetah: 'bite',
  crocodile: 'bite', trex: 'bite', spino: 'bite', raptor: 'bite', snake: 'bite', hyena: 'bite',
  rhino: 'gore', triceratops: 'gore', boar: 'gore', elephant: 'gore',
  gorilla: 'smash', titan: 'smash', bear: 'smash',
  eagle: 'swoop', wyvern: 'swoop',
  zombie: 'claw', skeleton: 'slash', drex: 'combo',
  shark: 'bite', megalodon: 'bite', mosasaurus: 'bite', leviathan: 'bite',
  stone_golem: 'smash', dragon: 'swoop', goblin: 'slash',
  strong_chicken: 'bite', sans: 'claw', sans_p2: 'claw', sans_p3: 'claw',
  mammoth: 'gore', hydra: 'bite', king_kong: 'smash', hero: 'claw',
};

/* ─────────────────── 대량 난전용 초간단 모델 (드로우 콜 절약) ─────────────────── */

function buildSimple(g, m, rig) {
  const def = rig.def;
  const size = Math.max(0.8, def.size || 1);
  const long = def.cat === 'dino' ? 1.4 : 1.0;
  const body = new THREE.Group();
  body.position.y = 0.6 * size;
  g.add(body); rig.body = body; rig.bodyY = body.position.y;

  add(body, G.sphereLow, m.main, [0, 0, 0], [0.42 * size, 0.4 * size, 0.6 * size * long]);

  const head = new THREE.Group();
  head.position.set(0, 0.28 * size, 0.48 * size * long);
  body.add(head); rig.head = head;
  add(head, G.sphereLow, m.main, [0, 0, 0.06 * size], [0.26 * size, 0.23 * size, 0.26 * size]);
  add(head, G.coneLow, m.accent, [0, -0.03 * size, 0.26 * size], [0.13 * size, 0.24 * size, 0.11 * size], [Math.PI / 2, 0, 0], false);

  // 다리: 네 발은 앞/뒤 한 쌍씩, 두 발 공룡은 두 개
  rig.legs = [];
  const biped = def.cat === 'dino' && ['trex', 'spino', 'raptor', 'wyvern'].includes(def.id);
  if (biped) {
    [1, -1].forEach((side, i) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.22 * size, -0.02 * size, 0);
      body.add(pivot);
      add(pivot, G.leg, m.dark, [0, -0.29 * size, 0], [0.09 * size, 0.6 * size, 0.1 * size]);
      rig.legs.push({ pivot, phase: i * Math.PI, front: false, left: side > 0 });
    });
  } else {
    [1, -1].forEach((side, i) => {
      const pivot = new THREE.Group();
      pivot.position.set(0, -0.02 * size, side * 0.36 * size);
      body.add(pivot);
      add(pivot, G.box, m.dark, [0, -0.3 * size, 0], [0.68 * size, 0.56 * size, 0.13 * size]);
      rig.legs.push({ pivot, phase: i * Math.PI, front: side > 0, left: false });
    });
  }

  const tail = new THREE.Group();
  tail.position.set(0, 0.04 * size, -0.5 * size * long);
  body.add(tail); rig.tail = tail;
  add(tail, G.cone, m.main, [0, 0, -0.28 * size], [0.15 * size, 0.7 * size * long, 0.13 * size], [-Math.PI / 2, 0, 0], false);

  if (def.airborne) {
    rig.wings = [];
    [1, -1].forEach((side) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.24 * size, 0.12 * size, 0);
      body.add(pivot);
      add(pivot, G.sphereLow, m.dark, [side * 0.5 * size, 0, -0.05 * size], [0.55 * size, 0.05 * size, 0.3 * size], null, false);
      rig.wings.push({ pivot, side });
    });
  }

  if (rig.weaponId && rig.weaponId !== 'none') {
    add(body, G.box, wmat('simple', 0x3a3f4a, { metalness: 0.5, roughness: 0.4 }), [0, 0.34 * size, -0.12 * size], [0.3 * size, 0.16 * size, 0.4 * size], null, false);
  }
  rig.height = 1.6 * size;
}

export function buildAnimalModel(def, team = 'blue', opts = {}) {
  const C = def.colors;
  const mats = {
    main: mat(C.main),
    dark: mat(C.dark),
    accent: mat(C.accent, { roughness: 0.62 }),
    belly: mat(C.belly),
    eye: mat(0x120d0a, { roughness: 0.3, metalness: 0.1 }),
  };
  const group = new THREE.Group();
  const rig = {
    group, def, mats, matList: Object.values(mats), t: Math.random() * 6,
    walk: Math.random() * 6, bodyY: 0.8, legs: [], wings: [], arms: [], parts: {},
    hurt: 0, attack: 0, skill: 0, deadT: -1, height: 1.3, recoil: 0,
    weaponId: opts.weapon || 'none', simple: !!opts.simple,
    style: ATTACK_STYLE[def.id] || 'bite', attackT: 0, attackHold: 0,
  };
  (opts.simple ? buildSimple : (BUILDERS[def.id] || buildLion))(group, mats, rig);

  // 발이 지면에 닿도록 몸통 높이를 보정한다 (다리 끝의 최저점 기준)
  group.updateMatrixWorld(true);
  let footY = Infinity;
  for (const leg of rig.legs || []) {
    const b = new THREE.Box3().setFromObject(leg.pivot);
    if (Number.isFinite(b.min.y)) footY = Math.min(footY, b.min.y);
  }
  if (Number.isFinite(footY) && Math.abs(footY) > 0.005) {
    rig.body.position.y -= footY;
    rig.bodyY -= footY;
  }

  group.updateMatrixWorld(true);
  const box0 = new THREE.Box3().setFromObject(group);
  rig.height = Math.max(0.6, box0.max.y - Math.min(0, box0.min.y));
  rig.headBaseZ = rig.head ? rig.head.position.z : 0;
  rig.headBaseY = rig.head ? rig.head.position.y : 0;

  const s = def.scale || 1;
  group.scale.setScalar(s);
  rig.height *= s;

  // 장착 무기
  attachWeapon(rig, opts.weapon || 'none');

  // 유닛이 아주 많을 때: 작은 장식 메시는 숨겨 드로우 콜을 줄인다
  if (opts.lowDetail) {
    group.updateMatrixWorld(true);
    group.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry.computeBoundingSphere?.();
      const rr = (o.geometry.boundingSphere?.radius || 0) * Math.max(o.scale.x, o.scale.y, o.scale.z);
      if (rr < 0.14) o.visible = false;
      o.castShadow = false;
    });
  }

  // 작은 디테일(눈·이빨·점박이)은 그림자 패스에서 제외 — 드로우 콜 절약
  group.traverse((o) => {
    if (!o.isMesh || !o.castShadow) return;
    o.geometry.computeBoundingSphere?.();
    const r = (o.geometry.boundingSphere?.radius || 0) * Math.max(o.scale.x, o.scale.y, o.scale.z);
    if (r < 0.22) o.castShadow = false;
  });

  // 팀 표식: 발밑 링
  const ringGeo = new THREE.RingGeometry(0.62, 0.82, 24);
  const ringMat = new THREE.MeshBasicMaterial({
    color: TEAM_TINTS[team] || 0xffffff, transparent: true, opacity: 0.75,
    side: THREE.DoubleSide, depthWrite: false,
  });
  rig.team = team;
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  ring.scale.setScalar(s * (def.id === 'elephant' ? 1.5 : 1));
  group.add(ring);
  rig.ring = ring;

  group.userData.rig = rig;
  return rig;
}

export function weaponMuzzleWorld(rig, out) {
  if (!rig.muzzle) return null;
  rig.muzzle.getWorldPosition(out);
  return out;
}

/* ───────────────────────────── 애니메이션 ───────────────────────────── */

export function animateRig(rig, s) {
  const { dt = 0.016, moving = false, speed = 0, attack = 0, skill = 0, hurt = 0, dead = false, air = false } = s;
  rig.t += dt;
  if (dead) {
    rig.deadT = rig.deadT < 0 ? 0 : rig.deadT + dt;
    const k = Math.min(1, rig.deadT / 0.9);
    rig.group.rotation.z = (rig.def.id === 'crocodile' ? 0.6 : 1.35) * easeOut(k);
    rig.group.position.y = -0.35 * k;
    const fade = Math.max(0, 1 - Math.max(0, rig.deadT - 1.6) / 1.2);
    rig.matList.forEach((m) => {
      m.transparent = true;
      m.opacity = 0.35 + fade * 0.65;
    });
    if (rig.ring) rig.ring.material.opacity = 0.35 * fade;
    return;
  }
  rig.deadT = -1;
  rig.attack = Math.max(0, (rig.attack || 0) - dt * 4.2);
  rig.hurt = Math.max(0, (rig.hurt || 0) - dt * 3.4);
  rig.skill = Math.max(0, (rig.skill || 0) - dt * 2.2);
  if (rig.recoil > 0 && rig.weaponNode) {
    rig.recoil = Math.max(0, rig.recoil - dt * 5.5);
    const base = rig.weaponNode.userData.baseZ ?? rig.weaponNode.position.z;
    rig.weaponNode.position.z = base - rig.recoil * 0.14;
  }

  const atk = rig.attack;
  const sk = rig.skill;
  const hurry = moving ? 1 : 0;
  rig.walk += dt * (3.2 + Math.min(6, speed) * 1.35) * hurry;

  // 몸통: 걷기 흔들림 + 공격 런지 + 스킬 자세
  const body = rig.body;
  if (body) {
    const bob = Math.sin(rig.walk * 2.1) * 0.035 * hurry + Math.sin(rig.t * 1.7) * 0.012;
    body.position.y = rig.bodyY + bob + atk * 0.05;
    body.position.z = atk * 0.2;
    body.rotation.x = -atk * 0.16 + sk * 0.12 + bob * 0.35;
    body.rotation.y = 0;
    body.rotation.z = Math.sin(rig.walk) * 0.03 * hurry;
    // 스킬 순간 살짝 커졌다 돌아온다
    const pulse = 1 + sk * 0.07;
    body.scale.set(pulse, pulse, pulse);
  }

  // 다리
  for (const leg of rig.legs || []) {
    const swing = Math.sin(rig.walk + leg.phase) * 0.5 * hurry;
    leg.pivot.rotation.x = swing + atk * 0.25 + Math.sin(rig.t * 2 + leg.phase) * 0.03;
  }

  // 꼬리
  if (rig.tail) {
    rig.tail.rotation.y = Math.sin(rig.t * 2.6) * 0.25;
    rig.tail.rotation.x = -sk * 0.3 + Math.sin(rig.t * 1.9) * 0.08;
  }
  if (rig.tailTip) rig.tailTip.rotation.x = Math.sin(rig.t * 3.1) * 0.2;

  // 머리
  if (rig.head) {
    rig.head.rotation.x = -atk * 0.35 + sk * 0.25 + Math.sin(rig.t * 1.5) * 0.03;
    rig.head.rotation.y = Math.sin(rig.t * 0.8) * 0.08;
    rig.head.position.z = rig.headBaseZ;
    rig.head.position.y = rig.headBaseY;
  }
  if (rig.jaw) rig.jaw.rotation.x = atk * 0.55 + sk * 0.35;

  // 날개
  for (const w of rig.wings || []) {
    const flap = Math.sin(rig.t * 13) * 0.55;
    if (air) {
      w.pivot.rotation.z = w.side * (0.15 + flap);
      w.pivot.rotation.y = w.side * 0.15;
    } else {
      w.pivot.rotation.z = w.side * (1.32 + Math.sin(rig.t * 2) * 0.05);
      w.pivot.rotation.y = w.side * -0.75;
    }
  }

  // 팔 (고릴라)
  for (const a of rig.arms || []) {
    const swing = Math.sin(rig.walk + (a.side > 0 ? 0 : Math.PI)) * 0.35 * hurry;
    a.pivot.rotation.x = swing + atk * 0.9 + sk * -1.1;
    a.pivot.rotation.z = a.side * (sk * 0.4);
  }

  // 날개 펄럭임 (강하닭) — rig.wings 와 별개로 부드러운 대기 모션
  for (const w of rig.wingFlap || []) {
    w.pivot.rotation.z = w.side * (0.12 + Math.sin(rig.t * 2.3) * 0.07 + sk * 0.7);
    w.pivot.rotation.y = w.side * (0.1 + Math.sin(rig.t * 1.7) * 0.05);
  }
  // 발밑 황금 오라 (강하닭)
  if (rig.auraRing) {
    rig.auraRing.rotation.z += dt * 0.7;
    rig.auraRing.material.opacity = 0.18 + Math.sin(rig.t * 2.1) * 0.05 + sk * 0.22;
  }
  // 빛나는 시안 눈 (샌즈)
  if (rig.eyeGlow) {
    const g2 = 0.9 + Math.sin(rig.t * 5.2) * 0.16 + sk * 0.7 + hurt * 0.2;
    rig.eyeGlow.scale.set(0.055 * g2, 0.07 * g2, 0.03 * g2);
  }

  // 코 (코끼리)
  if (rig.trunk) {
    rig.trunk.rotation.x = Math.sin(rig.t * 1.3) * 0.12 + sk * -0.5 + atk * 0.2;
    rig.trunk.rotation.z = Math.sin(rig.t * 0.9) * 0.08;
  }
  if (rig.ears) {
    rig.ears.forEach((e, i) => { e.rotation.y = (i ? -1 : 1) * (0.4 + Math.sin(rig.t * 2.2) * 0.12 + sk * 0.4); });
  }

  /* ── 종족별 공격 모션 ── */
  let wind = 0;
  let hit = 0;
  if (rig.attackHold > 0) {
    rig.attackHold = Math.max(0, rig.attackHold - dt);
    rig.attackT += dt;
    const a = Math.min(1, rig.attackT / 0.44);
    wind = a < 0.42 ? a / 0.42 : Math.max(0, 1 - (a - 0.42) / 0.28);
    hit = a < 0.42 ? 0 : Math.sin(Math.min(1, (a - 0.42) / 0.58) * Math.PI);
    const style = rig.style === 'combo' ? (rig.comboMode || 'bite') : (rig.style || 'bite');

    if (style === 'bite') {
      // 입을 크게 벌렸다가 목표물을 물어뜯으며 앞으로 돌진
      if (rig.jaw) rig.jaw.rotation.x = wind * 1.2 + sk * 0.3;
      if (rig.head) {
        rig.head.rotation.x = -wind * 0.12 - hit * 0.6;
        rig.head.position.z = rig.headBaseZ + hit * 0.24;
      }
      if (body) body.position.z = hit * 0.32;
    } else if (style === 'gore') {
      // 머리(뿔·엄니·코)를 아래로 숙였다가 위로 받아올린다
      if (rig.head) {
        rig.head.rotation.x = wind * 0.55 - hit * 0.95;
        rig.head.position.y = rig.headBaseY + hit * 0.1;
      }
      if (body) body.rotation.x = wind * 0.2 - hit * 0.32;
      if (rig.trunk) rig.trunk.rotation.x = wind * 0.8 - hit * 1.25;
    } else if (style === 'smash') {
      // 양팔(앞발)을 크게 들어 내리치는 강타
      if (rig.arms && rig.arms.length) {
        for (const ar of rig.arms) {
          ar.pivot.rotation.x = -1.95 * wind + 0.95 * hit;
          ar.pivot.rotation.z = ar.side * (0.38 * wind - 0.08 * hit);
        }
      } else {
        for (const leg of rig.legs || []) {
          if (leg.front) leg.pivot.rotation.x = -1.35 * wind + 0.85 * hit;
        }
      }
      if (body) body.rotation.x = -0.14 * wind + 0.3 * hit;
      if (rig.head) rig.head.rotation.x = -0.25 * wind + 0.4 * hit;
    } else if (style === 'swoop') {
      // 날개를 활짝 편 뒤 몸을 숙여 급강하 — 부리/발톱으로 낚아챈다
      for (const w of rig.wings || []) {
        w.pivot.rotation.z = w.side * (0.95 + wind * 0.55 - hit * 0.25);
        w.pivot.rotation.y = w.side * (-0.45 * wind + 0.15 * hit);
      }
      if (body) body.rotation.x = -0.45 * wind + 0.58 * hit;
      if (rig.head) rig.head.rotation.x = 0.38 * wind - 0.55 * hit;
      if (rig.jaw) rig.jaw.rotation.x = wind * 0.9;
      for (const leg of rig.legs || []) {
        if (leg.front) leg.pivot.rotation.x = -0.85 * wind + 0.5 * hit;
      }
    } else if (style === 'claw') {
      // 앞으로 뻗은 두 팔을 크게 휘저으며 할퀸다
      for (const ar of rig.arms || []) {
        ar.pivot.rotation.x = -0.9 * wind + 0.35 * hit;
        ar.pivot.rotation.z = ar.side * (0.25 + 0.6 * wind - 1.15 * hit);
      }
      if (body) body.rotation.y = 0.18 * wind - 0.22 * hit;
      if (rig.head) rig.head.rotation.x = -0.15 * wind + 0.25 * hit;
    } else if (style === 'slash') {
      // 뼈칼을 높이 든 뒤 사선으로 내리친다
      const swordArm = (rig.arms || []).find((a) => a.sword) || rig.arms?.[1] || rig.arms?.[0];
      if (swordArm) {
        swordArm.pivot.rotation.x = -2.0 * wind + 1.0 * hit;
        swordArm.pivot.rotation.z = swordArm.side * (0.5 * wind - 0.8 * hit);
      }
      if (body) body.rotation.y = 0.4 * wind - 0.5 * hit;
      if (rig.head) rig.head.rotation.x = -0.2 * wind + 0.35 * hit;
    }
  }

  // 피격/스킬 발광 (큰 유닛은 발광을 줄여 본래 색이 살아 있게)
  const glow = (rig.hurt * 0.9 + sk * 0.35) * (rig.glowScale == null ? 1 : rig.glowScale);
  for (const m of rig.matList) {
    if (m === rig.mats.eye) continue;
    if (glow > 0.02) {
      m.emissive.setHex(rig.hurt > sk ? 0xff4020 : 0xffd27a);
      m.emissiveIntensity = glow;
    } else if (m.emissiveIntensity) {
      m.emissiveIntensity = 0;
    }
  }
  if (rig.ring) {
    rig.ring.material.opacity = 0.35 + (dead ? 0 : 0.32) + sk * 0.3;
  }
}

function easeOut(k) { return 1 - Math.pow(1 - k, 3); }

export function triggerAttack(rig) {
  rig.attack = 1;
  rig.attackT = 0;
  rig.attackHold = 0.46;
  if (rig.style === 'combo') {
    rig.comboCount = (rig.comboCount || 0) + 1;
    rig.comboMode = rig.comboCount % 2 === 1 ? 'bite' : 'smash';
  }
  if (rig.weaponId && rig.weaponId !== 'none') rig.recoil = 1;
}
export function triggerShoot(rig) {
  rig.recoil = 1;
}
export function triggerSkill(rig) { rig.skill = 1; }
export function triggerHurt(rig) { rig.hurt = 1; }
