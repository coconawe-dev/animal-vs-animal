// 동물 vs 동물 — 무대(렌더러·조명·전장·카메라)
import * as THREE from '../vendor/three.module.js';
import { TUNING } from './config.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function rngFrom(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* 바닥 질감: 캔버스로 모래/흙 알갱이를 그려 반복 */
function groundTexture(arena) {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  const base = new THREE.Color(arena.ground);
  ctx.fillStyle = `#${base.getHexString()}`;
  ctx.fillRect(0, 0, size, size);
  const rnd = rngFrom(arena.id.length * 977 + 13);
  for (let i = 0; i < 2200; i++) {
    const a = 0.04 + rnd() * 0.1;
    const light = rnd() > 0.5;
    ctx.fillStyle = light ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
    const r = rnd() * 2.4 + 0.4;
    ctx.beginPath();
    ctx.arc(rnd() * size, rnd() * size, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // 큰 얼룩
  for (let i = 0; i < 26; i++) {
    const g = ctx.createRadialGradient(rnd() * size, rnd() * size, 2, rnd() * size, rnd() * size, 40 + rnd() * 50);
    g.addColorStop(0, `rgba(0,0,0,${0.05 + rnd() * 0.06})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(7, 7);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function gradientSky(top, mid, bottom) {
  const geo = new THREE.SphereGeometry(300, 24, 16);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cTop = new THREE.Color(top), cMid = new THREE.Color(mid), cBot = new THREE.Color(bottom);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 300;
    const t = clamp(y, -1, 1);
    if (t >= 0) tmp.copy(cMid).lerp(cTop, Math.pow(t, 0.65));
    else tmp.copy(cMid).lerp(cBot, Math.pow(-t, 0.55));
    colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false });
  return new THREE.Mesh(geo, mat);
}

function rockMesh(rnd, r, h, color, shadow = false) {
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const s = 0.93 + rnd() * 0.16;
    p.setXYZ(i, p.getX(i) * s, p.getY(i) * s * 0.86, p.getZ(i) * s);
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.94 }));
  m.scale.set(r * 0.92, h * 0.72, r * (0.82 + rnd() * 0.18));
  m.position.y = h * 0.34;
  m.rotation.y = rnd() * Math.PI;
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

function acacia(rnd, scale = 1, shadow = false) {
  const g = new THREE.Group();
  const bark = new THREE.MeshStandardMaterial({ color: 0x5b4226, flatShading: true, roughness: 0.95 });
  const leaf = new THREE.MeshStandardMaterial({ color: 0x4e6b2a, flatShading: true, roughness: 0.9 });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.3, 2.6, 6), bark);
  trunk.position.y = 1.3;
  trunk.rotation.z = (rnd() - 0.5) * 0.2;
  trunk.castShadow = shadow;
  g.add(trunk);
  const canopyY = 2.8;
  for (let i = 0; i < 4; i++) {
    const s = 1.15 + rnd() * 0.7;
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), leaf);
    m.scale.set(s, s * 0.3, s * 0.85);
    m.position.set((rnd() - 0.5) * 1.8, canopyY + rnd() * 0.5, (rnd() - 0.5) * 1.8);
    m.castShadow = shadow;
    g.add(m);
  }
  g.scale.setScalar(scale);
  return g;
}

export class Stage {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(46, 1, 0.1, 800);
    this.cam = { theta: 0.75, phi: 0.92, dist: 40, target: new THREE.Vector3(0, 1.2, 0) };
    this.camGoal = { theta: 0.75, phi: 0.92, dist: 40, target: new THREE.Vector3(0, 1.2, 0) };
    this.shake = 0;
    this.focusShift = 0;
    this.arenaGroup = null;
    this.time = 0;
    this.autoRotate = 0;
    this.resize();
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    this.camera.aspect = aspect;
    // 세로로 긴 화면에서는 시야각을 넓혀 좌우로 더 보이게
    this.camera.fov = aspect < 0.62 ? 62 : aspect < 0.85 ? 56 : 46;
    this.camera.updateProjectionMatrix();
    this.applyFocusShift();
  }

  // 화면 아래/왼쪽 패널에 가리지 않도록 화면 중심을 옮긴다 (x,y 는 화면 비율)
  setFocusShift(y = 0, x = 0) {
    this.focusShift = Math.max(-0.45, Math.min(0.45, y || 0));
    this.focusShiftX = Math.max(-0.45, Math.min(0.45, x || 0));
    this.applyFocusShift();
  }

  applyFocusShift() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    const fy = this.focusShift || 0;
    const fx = this.focusShiftX || 0;
    if (Math.abs(fy) > 0.004 || Math.abs(fx) > 0.004) {
      this.camera.setViewOffset(w, h, -w * fx, h * fy, w, h);
    } else {
      this.camera.clearViewOffset();
    }
  }

  setArena(arena) {
    this.arena = arena;
    if (this.arenaGroup) {
      this.scene.remove(this.arenaGroup);
      disposeTree(this.arenaGroup);
    }
    this.scene.fog = new THREE.Fog(arena.fog, arena.fogNear, arena.fogFar);
    const group = new THREE.Group();
    this.arenaGroup = group;
    this.scene.add(group);

    // 하늘
    this.sky = gradientSky(arena.sky.top, arena.sky.mid, arena.sky.bottom);
    group.add(this.sky);

    const rnd = rngFrom(arena.id.length * 7919 + arena.obstacles.length * 31);

    // 바깥 지형
    const outerGeo = new THREE.CircleGeometry(190, 48);
    const outerMat = new THREE.MeshStandardMaterial({ color: arena.ground2, roughness: 1, flatShading: true });
    const outer = new THREE.Mesh(outerGeo, outerMat);
    outer.rotation.x = -Math.PI / 2;
    outer.position.y = -0.06;
    outer.receiveShadow = true;
    group.add(outer);

    // 경기장 바닥
    const R = TUNING.ARENA_RADIUS;
    const tex = groundTexture(arena);
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(R + 1.6, 96),
      new THREE.MeshStandardMaterial({ map: tex, color: 0xffffff, roughness: 0.96, metalness: 0 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    group.add(floor);

    // 테두리 링 + 낮은 담장
    const rimMat = new THREE.MeshStandardMaterial({
      color: arena.rim, emissive: arena.rim, emissiveIntensity: 0.25, roughness: 0.7, flatShading: true,
    });
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R + 1.5, 0.35, 8, 72), rimMat);
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = 0.12;
    group.add(rim);

    const wallMat = new THREE.MeshStandardMaterial({ color: arena.rim, roughness: 0.9, flatShading: true });
    const seg = 30;
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const w = (Math.PI * 2 * (R + 2.4)) / seg * 0.86;
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.7 + rnd() * 0.5, 1.5), wallMat);
      b.position.set(Math.sin(a) * (R + 3.2), 0.3, Math.cos(a) * (R + 3.2));
      b.rotation.y = a;
      b.castShadow = false; b.receiveShadow = true;
      group.add(b);
    }

    // 장애물
    arena.obstacles.forEach((ob) => {
      const item = this.makeObstacle(ob, arena, rnd);
      item.position.x = ob.x;
      item.position.z = ob.z;
      group.add(item);
    });

    // 경기장 밖 장식
    const decorCount = arena.decor === 'canyon' ? 16 : 24;
    for (let i = 0; i < decorCount; i++) {
      const a = rnd() * Math.PI * 2;
      const rad = R + 6 + rnd() * 34;
      const x = Math.sin(a) * rad, z = Math.cos(a) * rad;
      if (arena.decor === 'savanna') {
        if (rnd() < 0.45) {
          const tree = acacia(rnd, 0.8 + rnd() * 0.7, false);
          tree.position.set(x, 0, z);
          tree.rotation.y = rnd() * 6;
          group.add(tree);
        } else {
          const rock = rockMesh(rnd, 0.8 + rnd() * 2.2, 0.6 + rnd() * 2.4, arena.ground2);
          rock.position.set(x, 0, z);
          group.add(rock);
        }
      } else if (arena.decor === 'canyon') {
        const h = 4 + rnd() * 12;
        const geo = new THREE.CylinderGeometry(1.4 + rnd() * 2.4, 2.4 + rnd() * 3, h, 7, 1);
        const mat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(arena.ground2).offsetHSL(0, 0.02, (rnd() - 0.5) * 0.08),
          roughness: 0.95, flatShading: true,
        });
        const p = new THREE.Mesh(geo, mat);
        p.position.set(x, h / 2 - 0.4, z);
        p.rotation.y = rnd() * 3;
        p.castShadow = false; p.receiveShadow = true;
        group.add(p);
      } else {
        if (rnd() < 0.4) {
          const h = 3 + rnd() * 8;
          const geo = new THREE.ConeGeometry(1.2 + rnd() * 1.6, h, 6);
          const mat = new THREE.MeshStandardMaterial({
            color: 0xe8f4ff, roughness: 0.35, metalness: 0.05, flatShading: true,
            transparent: true, opacity: 0.92,
          });
          const p = new THREE.Mesh(geo, mat);
          p.position.set(x, h / 2, z);
          p.rotation.z = (rnd() - 0.5) * 0.3;
          p.castShadow = false;
          group.add(p);
        } else {
          const rock = rockMesh(rnd, 0.9 + rnd() * 2, 0.5 + rnd() * 1.6, 0xdfeaf4);
          rock.position.set(x, 0, z);
          group.add(rock);
        }
      }
    }

    // 경기장 안 잔디/모래 풀
    const tuftGeo = new THREE.ConeGeometry(0.09, 0.5, 4);
    const tuftMat = new THREE.MeshStandardMaterial({
      color: arena.decor === 'savanna' ? 0xb9a24a : arena.decor === 'tundra' ? 0xeaf6ff : 0xc08f52,
      roughness: 1, flatShading: true,
    });
    const tufts = new THREE.InstancedMesh(tuftGeo, tuftMat, 260);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 260; i++) {
      const a = rnd() * Math.PI * 2;
      const rad = 4 + Math.sqrt(rnd()) * (R + 8);
      dummy.position.set(Math.sin(a) * rad, 0.24, Math.cos(a) * rad);
      dummy.rotation.y = rnd() * 6;
      dummy.rotation.z = (rnd() - 0.5) * 0.5;
      const s = 0.6 + rnd() * 1.1;
      dummy.scale.set(s, s * (0.7 + rnd() * 0.7), s);
      dummy.updateMatrix();
      tufts.setMatrixAt(i, dummy.matrix);
    }
    tufts.castShadow = false;
    tufts.receiveShadow = false;
    group.add(tufts);

    // 떠다니는 입자
    const dustGeo = new THREE.BufferGeometry();
    const n = 180;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = (rnd() - 0.5) * 80;
      arr[i * 3 + 1] = rnd() * 16;
      arr[i * 3 + 2] = (rnd() - 0.5) * 80;
    }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const dustMat = new THREE.PointsMaterial({
      color: arena.decor === 'tundra' ? 0xffffff : 0xffe6b0,
      size: 0.16, transparent: true, opacity: 0.5, depthWrite: false, sizeAttenuation: true,
    });
    this.dust = new THREE.Points(dustGeo, dustMat);
    group.add(this.dust);

    // 조명
    if (this.sun) { this.scene.remove(this.sun); this.scene.remove(this.sun.target); }
    if (this.hemi) this.scene.remove(this.hemi);
    if (this.fill) this.scene.remove(this.fill);
    this.hemi = new THREE.HemisphereLight(arena.sky.mid, arena.ground2, arena.ambient * 1.5);
    this.scene.add(this.hemi);

    const sun = new THREE.DirectionalLight(arena.sun, arena.sunI);
    sun.position.set(arena.sunPos[0], arena.sunPos[1], arena.sunPos[2]);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -24;
    sun.shadow.camera.right = 24;
    sun.shadow.camera.top = 24;
    sun.shadow.camera.bottom = -24;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 120;
    sun.shadow.bias = -0.0012;
    sun.shadow.normalBias = 0.03;
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.sun = sun;

    const fill = new THREE.DirectionalLight(0xffffff, 0.35);
    fill.position.set(-20, 18, -22);
    this.scene.add(fill);
    this.fill = fill;
  }

  makeObstacle(ob, arena, rnd) {
    const g = new THREE.Group();
    if (ob.kind === 'tree') {
      const t = acacia(rnd, 0.95, true);
      g.add(t);
      // 충돌 기둥을 시각적으로도 표시
      const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3520, roughness: 1, flatShading: true });
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.75, 1.2, 7), trunkMat);
      trunk.position.y = 0.6; trunk.castShadow = true;
      g.add(trunk);
    } else if (ob.kind === 'pillar') {
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(arena.ground2).offsetHSL(0, 0.03, 0.02), roughness: 0.95, flatShading: true,
      });
      const p = new THREE.Mesh(new THREE.CylinderGeometry(ob.r * 0.8, ob.r * 1.05, ob.h, 8, 2), mat);
      p.position.y = ob.h / 2;
      p.castShadow = true; p.receiveShadow = true;
      g.add(p);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(ob.r * 0.95, ob.r * 0.8, 0.4, 8), mat);
      cap.position.y = ob.h + 0.15;
      cap.castShadow = true;
      g.add(cap);
    } else if (ob.kind === 'ice') {
      const mat = new THREE.MeshStandardMaterial({
        color: 0xcfeaff, roughness: 0.25, metalness: 0.1, flatShading: true, transparent: true, opacity: 0.9,
      });
      for (let i = 0; i < 3; i++) {
        const h = ob.h * (0.7 + rnd() * 0.5);
        const c = new THREE.Mesh(new THREE.ConeGeometry(ob.r * (0.45 + rnd() * 0.3), h, 5), mat);
        c.position.set((rnd() - 0.5) * ob.r, h / 2, (rnd() - 0.5) * ob.r);
        c.rotation.z = (rnd() - 0.5) * 0.35;
        c.castShadow = true;
        g.add(c);
      }
    } else {
      const rock = rockMesh(rnd, ob.r, ob.h * 0.75, new THREE.Color(arena.ground2).offsetHSL(0, 0.03, -0.07), true);
      g.add(rock);
    }
    return g;
  }

  /* ── 카메라 ── */
  orbit(dx, dy) {
    this.camGoal.theta -= dx * 0.0055;
    this.camGoal.phi = clamp(this.camGoal.phi - dy * 0.0045, 0.22, 1.42);
  }
  zoom(factor) {
    this.camGoal.dist = clamp(this.camGoal.dist * factor, 13, 78);
  }
  setFollowTarget(t) { this.camGoal.target.copy(t); }

  update(dt, { follow = null, autoRotate = false } = {}) {
    this.time += dt;
    if (follow) this.camGoal.target.lerp(follow, Math.min(1, dt * 2.2));
    else if (autoRotate) this.camGoal.target.lerp(new THREE.Vector3(0, 1.2, 0), Math.min(1, dt * 2));
    if (autoRotate) this.camGoal.theta += dt * 0.12;

    const k = Math.min(1, dt * 7);
    this.cam.theta += (this.camGoal.theta - this.cam.theta) * k;
    this.cam.phi += (this.camGoal.phi - this.cam.phi) * k;
    this.cam.dist += (this.camGoal.dist - this.cam.dist) * k;
    this.cam.target.lerp(this.camGoal.target, k);

    const { theta, phi, dist, target } = this.cam;
    const y = Math.sin(phi) * dist;
    const r = Math.cos(phi) * dist;
    let px = target.x + Math.sin(theta) * r;
    let pz = target.z + Math.cos(theta) * r;
    let py = target.y + y;

    if (this.shake > 0.001) {
      px += (Math.random() - 0.5) * this.shake;
      py += (Math.random() - 0.5) * this.shake * 0.7;
      pz += (Math.random() - 0.5) * this.shake;
      this.shake *= Math.pow(0.02, dt);
    }
    this.camera.position.set(px, py, pz);
    this.camera.lookAt(target.x, target.y + 0.4, target.z);

    if (this.dust) this.dust.rotation.y += dt * 0.01;
    if (this.sky) this.sky.position.set(this.camera.position.x, 0, this.camera.position.z);

    this.renderer.render(this.scene, this.camera);
  }
}

function disposeTree(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose?.();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => { if (m.map) m.map.dispose?.(); m.dispose?.(); });
    }
  });
}
