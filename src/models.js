// 동물 vs 동물 — 절차적 3D 동물 모델 & 애니메이션 리그
// 외부 모델 파일 없이 Three.js 기본 도형만으로 12종의 실루엣을 만든다.

import * as THREE from '../vendor/three.module.js';

const G = {
  sphere: new THREE.SphereGeometry(1, 14, 10),
  sphereLow: new THREE.SphereGeometry(1, 10, 7),
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 12),
  cylLow: new THREE.CylinderGeometry(1, 1, 1, 8),
  cone: new THREE.ConeGeometry(1, 1, 10),
  coneLow: new THREE.ConeGeometry(1, 1, 7),
  capsule: new THREE.CapsuleGeometry(0.5, 1, 4, 10),
  torus: new THREE.TorusGeometry(1, 0.22, 6, 16),
  plane: new THREE.PlaneGeometry(1, 1),
};

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
    add(pivot, i < 2 ? G.cyl : G.cyl, material, [0, -len / 2, 0], [r, len, r]);
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

  add(head, G.sphereLow, m.dark, [0, 0.0, -0.06], [0.5, 0.48, 0.36]);   // 갈기
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    add(head, G.coneLow, m.dark, [Math.cos(a) * 0.4, Math.sin(a) * 0.38, -0.08], [0.14, 0.22, 0.14],
      [Math.PI / 2 + Math.sin(a) * 0.4, 0, -a], false);
  }
  add(head, G.sphere, m.main, [0, 0.02, 0.16], [0.3, 0.29, 0.3]);
  add(head, G.sphere, m.accent, [0, -0.06, 0.42], [0.17, 0.15, 0.2]);   // 주둥이
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
    const z = 0.5 - i * 0.26;
    const h = 0.4 - Math.abs(z) * 0.1;
    add(body, G.box, m.dark, [0.44, 0.1, z], [0.06, h, 0.1], [0, 0, 0], false);
    add(body, G.box, m.dark, [-0.44, 0.1, z], [0.06, h, 0.1], [0, 0, 0], false);
    add(body, G.box, m.dark, [0, 0.4, z], [0.55, 0.05, 0.1], [0, 0, 0], false);
  }

  rig.legs = quadLegs(body, m.main, { x: 0.3, zf: 0.52, zb: -0.5, len: 0.88, r: 0.11 });
  rig.legs.forEach((l) => add(l.pivot, G.box, m.dark, [0, -0.4, 0], [0.19, 0.06, 0.19], null, false));

  const head = new THREE.Group();
  head.position.set(0, 0.42, 0.86);
  body.add(head); rig.head = head;
  add(head, G.sphere, m.main, [0, 0, 0], [0.31, 0.29, 0.3]);
  add(head, G.sphere, m.accent, [0, -0.08, 0.24], [0.2, 0.16, 0.2]);
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
    add(pivot, G.box, m.main, [side * 0.28, 0, -0.02], [0.56, 0.07, 0.42], [0, side * 0.08, 0], true);
    for (let i = 0; i < 3; i++) {
      add(pivot, G.box, featherMat, [side * (0.52 + i * 0.04), -0.02 - i * 0.01, -0.26 - i * 0.13],
        [0.24, 0.045, 0.24], [0, side * (0.1 + i * 0.12), 0], false);
    }
    wings.push({ pivot, side });
  });
  rig.wings = wings;

  const head = new THREE.Group();
  head.position.set(0, 0.26, 0.4);
  body.add(head); rig.head = head;
  add(head, G.sphere, m.accent, [0, 0, 0], [0.19, 0.19, 0.19]);          // 흰 머리
  add(head, G.cone, m.belly, [0, -0.02, 0.26], [0.09, 0.26, 0.09], [Math.PI / 2, 0, 0]);
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

const BUILDERS = {
  lion: buildLion, tiger: buildTiger, elephant: buildElephant, bear: buildBear,
  wolf: buildWolf, eagle: buildEagle, crocodile: buildCrocodile, rhino: buildRhino,
  fox: buildFox, gorilla: buildGorilla, cheetah: buildCheetah, boar: buildBoar,
};

export const TEAM_TINTS = { blue: 0x3b7bff, red: 0xff4b3b };

export function buildAnimalModel(def, team = 'blue') {
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
    hurt: 0, attack: 0, skill: 0, deadT: -1, height: 1.3,
  };
  (BUILDERS[def.id] || buildLion)(group, mats, rig);

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

  const s = def.scale || 1;
  group.scale.setScalar(s);
  rig.height *= s;

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
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  ring.scale.setScalar(s * (def.id === 'elephant' ? 1.5 : 1));
  group.add(ring);
  rig.ring = ring;

  group.userData.rig = rig;
  return rig;
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
  }
  if (rig.jaw) rig.jaw.rotation.x = atk * 0.55 + sk * 0.35;

  // 날개
  for (const w of rig.wings || []) {
    const flap = Math.sin(rig.t * 13) * 0.55;
    if (air) {
      w.pivot.rotation.z = w.side * (0.15 + flap);
      w.pivot.rotation.y = w.side * 0.15;
    } else {
      w.pivot.rotation.z = w.side * (1.15 + Math.sin(rig.t * 2) * 0.06);
      w.pivot.rotation.y = w.side * -0.5;
    }
  }

  // 팔 (고릴라)
  for (const a of rig.arms || []) {
    const swing = Math.sin(rig.walk + (a.side > 0 ? 0 : Math.PI)) * 0.35 * hurry;
    a.pivot.rotation.x = swing + atk * 0.9 + sk * -1.1;
    a.pivot.rotation.z = a.side * (sk * 0.4);
  }

  // 코 (코끼리)
  if (rig.trunk) {
    rig.trunk.rotation.x = Math.sin(rig.t * 1.3) * 0.12 + sk * -0.5 + atk * 0.2;
    rig.trunk.rotation.z = Math.sin(rig.t * 0.9) * 0.08;
  }
  if (rig.ears) {
    rig.ears.forEach((e, i) => { e.rotation.y = (i ? -1 : 1) * (0.4 + Math.sin(rig.t * 2.2) * 0.12 + sk * 0.4); });
  }

  // 피격/스킬 발광
  const glow = rig.hurt * 0.9 + sk * 0.35;
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

export function triggerAttack(rig) { rig.attack = 1; }
export function triggerSkill(rig) { rig.skill = 1; }
export function triggerHurt(rig) { rig.hurt = 1; }
