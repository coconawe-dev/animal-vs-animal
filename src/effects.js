// 동물 vs 동물 — 이펙트 (피해 숫자 · 파편 · 충격파 · 스킬 연출)
import * as THREE from '../vendor/three.module.js';

const TMP = new THREE.Vector3();

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);

    // ── 피해 숫자 스프라이트 풀
    this.numbers = [];
    for (let i = 0; i < 34; i++) {
      const canvas = document.createElement('canvas');
      canvas.width = 256; canvas.height = 128;
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false });
      const sprite = new THREE.Sprite(mat);
      sprite.visible = false;
      sprite.renderOrder = 20;
      this.group.add(sprite);
      this.numbers.push({ sprite, canvas, texture, life: 0, max: 1, vy: 0, kind: 'dmg' });
    }
    this.numberIdx = 0;

    // ── 파편 (Points)
    const MAX = 420;
    this.parts = [];
    this.partGeo = new THREE.BufferGeometry();
    this.partPos = new Float32Array(MAX * 3);
    this.partCol = new Float32Array(MAX * 3);
    this.partGeo.setAttribute('position', new THREE.BufferAttribute(this.partPos, 3));
    this.partGeo.setAttribute('color', new THREE.BufferAttribute(this.partCol, 3));
    this.partGeo.setDrawRange(0, 0);
    this.partMat = new THREE.PointsMaterial({
      size: 0.3, vertexColors: true, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });
    this.points = new THREE.Points(this.partGeo, this.partMat);
    this.points.frustumCulled = false;
    this.group.add(this.points);
    this.maxParts = MAX;

    // ── 링 풀
    this.rings = [];
    const ringGeo = new THREE.RingGeometry(0.72, 1, 48);
    for (let i = 0; i < 18; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const mesh = new THREE.Mesh(ringGeo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      this.group.add(mesh);
      this.rings.push({ mesh, life: 0, max: 1, from: 1, to: 4, y: 0.05 });
    }
    this.ringIdx = 0;

    // ── 섬광 (구) 풀
    this.flashes = [];
    const flashGeo = new THREE.SphereGeometry(1, 10, 8);
    for (let i = 0; i < 12; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const mesh = new THREE.Mesh(flashGeo, mat);
      mesh.visible = false;
      this.group.add(mesh);
      this.flashes.push({ mesh, life: 0, max: 0.3, r: 1 });
    }
    this.flashIdx = 0;

    // ── 참격 (평면)
    this.slashes = [];
    const slashGeo = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < 10; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
        depthWrite: false, side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(slashGeo, mat);
      mesh.visible = false;
      this.group.add(mesh);
      this.slashes.push({ mesh, life: 0, max: 0.18 });
    }
    this.slashIdx = 0;

    this.projectileMeshes = new Map();
    this.projGeo = new THREE.ConeGeometry(0.09, 0.62, 5);
    this.projMat = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, flatShading: true, roughness: 0.6 });
    this.bulletGeo = new THREE.SphereGeometry(0.13, 6, 5);
    this.bulletMat = new THREE.MeshBasicMaterial({ color: 0xffe08a });
    this.rocketGeo = new THREE.ConeGeometry(0.16, 0.55, 7);
    this.rocketMat = new THREE.MeshStandardMaterial({ color: 0x55606e, flatShading: true, roughness: 0.5, emissive: 0x662200, emissiveIntensity: 0.6 });

    // ── 레이저 빔 풀
    this.beams = [];
    const beamGeo = new THREE.CylinderGeometry(0.075, 0.075, 1, 6);
    for (let i = 0; i < 8; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0x6fe8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const mesh = new THREE.Mesh(beamGeo, mat);
      mesh.visible = false;
      this.group.add(mesh);
      this.beams.push({ mesh, life: 0, max: 0.22 });
    }
    this.beamIdx = 0;
    this.up = new THREE.Vector3(0, 1, 0);
    this.tmpDir = new THREE.Vector3();

    /* ── 강하닭 깃털 ── */
    this.feathers = [];
    const featherGeo = new THREE.PlaneGeometry(0.16, 0.52);
    for (let i = 0; i < 44; i++) {
      const fm = new THREE.MeshBasicMaterial({
        color: 0xffe9a8, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false,
      });
      const mesh = new THREE.Mesh(featherGeo, fm);
      mesh.visible = false;
      this.group.add(mesh);
      this.feathers.push({ mesh, life: 0, max: 1, vy: -5, drift: 0, spin: 0 });
    }
    this.featherIdx = 0;

    /* ── 가스터 블래스터 해골 ── */
    this.blasters = [];
    for (let i = 0; i < 3; i++) {
      const grp = new THREE.Group();
      const boneMat = new THREE.MeshStandardMaterial({
        color: 0xf7fbff, roughness: 0.42, metalness: 0.05, flatShading: true,
        emissive: 0x2f7f96, emissiveIntensity: 0.16,
      });
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0x9ff4ff });
      const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 9), boneMat);
      cranium.scale.set(0.92, 0.82, 1.0);
      grp.add(cranium);
      // 광대뼈 · 턱 테두리로 해골 느낌을 준다
      const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), boneMat);
      cheek.position.set(0, -0.42, 0.42);
      cheek.scale.set(1.15, 0.5, 0.9);
      grp.add(cheek);
      const snout = new THREE.Mesh(new THREE.ConeGeometry(0.62, 2.1, 6), boneMat);
      snout.rotation.x = Math.PI / 2;
      snout.position.set(0, -0.24, 1.15);
      grp.add(snout);
      const upper = new THREE.Mesh(new THREE.ConeGeometry(0.54, 1.5, 6), boneMat);
      upper.rotation.x = Math.PI / 2;
      upper.position.set(0, 0.3, 1.0);
      grp.add(upper);
      for (const s2 of [-1, 1]) {
        const socket = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), new THREE.MeshBasicMaterial({ color: 0x0a1a22 }));
        socket.position.set(s2 * 0.38, 0.22, 0.6);
        socket.scale.set(1, 1.1, 0.5);
        grp.add(socket);
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), eyeMat);
        eye.position.set(s2 * 0.38, 0.22, 0.78);
        grp.add(eye);
        const horn = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.95, 5), boneMat);
        horn.position.set(s2 * 0.62, 0.72, -0.15);
        horn.rotation.z = -s2 * 0.55;
        grp.add(horn);
        for (let t = 0; t < 3; t++) {
          const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 4), boneMat);
          tooth.position.set(s2 * (0.16 + t * 0.12), -0.42, 1.0 + t * 0.16);
          tooth.rotation.x = Math.PI;
          grp.add(tooth);
        }
      }
      grp.visible = false;
      this.group.add(grp);
      this.blasters.push({ grp, life: 0, max: 0.6 });
    }
    this.blasterIdx = 0;

    /* ── 굵은 빔 ── */
    this.bigBeams = [];
    const bigGeo = new THREE.CylinderGeometry(1, 1, 1, 10);
    for (let i = 0; i < 6; i++) {
      const m = new THREE.MeshBasicMaterial({
        color: 0x9ff4ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const mesh = new THREE.Mesh(bigGeo, m);
      mesh.visible = false;
      this.group.add(mesh);
      this.bigBeams.push({ mesh, life: 0, max: 0.34 });
    }
    this.bigBeamIdx = 0;

    /* ── 뼈 가시 ── */
    this.spikes = [];
    const spikeGeo = new THREE.ConeGeometry(1, 1, 5);
    const spikeMat = new THREE.MeshStandardMaterial({
      color: 0xf8fbff, roughness: 0.45, flatShading: true, emissive: 0x2f6f86, emissiveIntensity: 0.35,
    });
    for (let i = 0; i < 16; i++) {
      const mesh = new THREE.Mesh(spikeGeo, spikeMat.clone());
      mesh.visible = false;
      this.group.add(mesh);
      this.spikes.push({ mesh, life: 0, max: 1, x: 0, z: 0 });
    }
    this.spikeIdx = 0;
    this.time = 0;

    /* ── 황금 알 · 뼈 투사체 지오메트리 ── */
    this.eggGeo = new THREE.SphereGeometry(0.24, 9, 7);
    this.eggMat = new THREE.MeshStandardMaterial({
      color: 0xffd24a, roughness: 0.35, metalness: 0.25, emissive: 0xffa020, emissiveIntensity: 0.55, flatShading: true,
    });
    this.boneMat = new THREE.MeshStandardMaterial({
      color: 0xf4f9ff, roughness: 0.5, flatShading: true, emissive: 0x2a5c70, emissiveIntensity: 0.3,
    });

    /* ── 가스터손 (손바닥에 검은 구멍이 뚫린 거대 해골 손) ── */
    this.gasterHands = [];
    for (let i = 0; i < 4; i++) {
      const grp = new THREE.Group();
      const bone = new THREE.MeshStandardMaterial({
        color: 0xdfe9f2, roughness: 0.45, metalness: 0.04, flatShading: true,
        emissive: 0x2f6f86, emissiveIntensity: 0.1, transparent: true, opacity: 1,
      });
      const knuckleMat = new THREE.MeshStandardMaterial({
        color: 0xb9c9d6, roughness: 0.5, flatShading: true, transparent: true, opacity: 1,
      });
      const palm = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.5, 1.45), bone);
      grp.add(palm);
      const hole = new THREE.Mesh(
        new THREE.CircleGeometry(0.42, 18),
        new THREE.MeshBasicMaterial({ color: 0x04090d, side: THREE.DoubleSide, transparent: true }),
      );
      hole.position.set(0, 0.27, 0);
      hole.rotation.x = -Math.PI / 2;
      grp.add(hole);
      const rim = new THREE.Mesh(
        new THREE.RingGeometry(0.42, 0.54, 18),
        new THREE.MeshBasicMaterial({ color: 0x9ff4ff, side: THREE.DoubleSide, transparent: true }),
      );
      rim.position.set(0, 0.28, 0);
      rim.rotation.x = -Math.PI / 2;
      grp.add(rim);
      // 손가락 — 손등 쪽으로 구부러져 내려찍는 모양
      for (let f = 0; f < 4; f++) {
        const len = f === 3 ? 0.8 : 1.0;
        const knuckle = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), knuckleMat);
        knuckle.position.set(-0.57 + f * 0.38, -0.02, 0.74);
        grp.add(knuckle);
        const finger = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.11, len, 6), bone);
        finger.position.set(-0.57 + f * 0.38, -0.16, 0.82 + len * 0.14);
        finger.rotation.x = 1.28;
        grp.add(finger);
        const tip = new THREE.Mesh(new THREE.SphereGeometry(0.11, 7, 5), bone);
        tip.position.set(-0.57 + f * 0.38, -0.33, 0.82 + len * 0.34);
        grp.add(tip);
      }
      const thumb = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.11, 0.85, 6), bone);
      thumb.position.set(0.95, -0.2, 0.28);
      thumb.rotation.set(1.1, 0, -0.55);
      grp.add(thumb);
      // 손목 뼈
      const wrist = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.42, 0.7), knuckleMat);
      wrist.position.set(0, 0, -1.0);
      grp.add(wrist);
      grp.visible = false;
      this.group.add(grp);
      this.gasterHands.push({ grp, life: 0, max: 0.72 });
    }
    this.gasterHandIdx = 0;

    /* ── 불미스러운 공격 (가운뎃손가락을 든 픽셀 손) ── */
    this.rudeHands = [];
    for (let i = 0; i < 12; i++) {
      const grp = new THREE.Group();
      const a = new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 1 });
      const b = new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 1 });
      const palm = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.5, 0.18), a);
      grp.add(palm);
      // 손목(소매)
      const wrist = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.24, 0.18), b);
      wrist.position.set(0, -0.36, 0);
      grp.add(wrist);
      // 접힌 손가락 (검지 · 약지 · 새끼)
      for (const k of [-1, 1]) {
        const bent = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.24, 0.18), b);
        bent.position.set(k * 0.21, 0.36, 0);
        grp.add(bent);
      }
      const pinky = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.18, 0.18), b);
      pinky.position.set(0.42, 0.33, 0);
      grp.add(pinky);
      // 치켜든 가운뎃손가락
      const mid = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.62, 0.18), a);
      mid.position.set(0, 0.56, 0);
      grp.add(mid);
      const nail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.2), b);
      nail.position.set(0, 0.9, 0);
      grp.add(nail);
      // 엄지
      const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.34, 0.18), b);
      thumb.position.set(-0.4, 0.04, 0);
      thumb.rotation.z = 0.6;
      grp.add(thumb);
      grp.visible = false;
      this.group.add(grp);
      this.rudeHands.push({ grp, life: 0, max: 1.0, matA: a, matB: b, baseY: 2.4, spin: 0 });
    }
    this.rudeHandIdx = 0;
  }

  /* ───────── 강하닭 · 샌즈 스킬 연출 ───────── */
  featherRain(x, z, r = 5.8, count = 26, y0 = 8) {
    for (let i = 0; i < count; i++) {
      const f = this.feathers[this.featherIdx];
      this.featherIdx = (this.featherIdx + 1) % this.feathers.length;
      const a = Math.random() * Math.PI * 2;
      const rr = Math.sqrt(Math.random()) * r;
      f.mesh.position.set(x + Math.cos(a) * rr, y0 + Math.random() * 5, z + Math.sin(a) * rr);
      f.mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      f.mesh.material.color.setHex(Math.random() < 0.4 ? 0xffd24a : 0xffe9a8);
      f.mesh.material.opacity = 0.95;
      f.mesh.visible = true;
      const life = 1.0 + Math.random() * 0.7;
      f.life = life; f.max = life;
      f.vy = -(5 + Math.random() * 4);
      f.drift = (Math.random() - 0.5) * 1.6;
      f.spin = (Math.random() - 0.5) * 5;
    }
    this.ring(x, z, 0.6, r * 1.05, 0xffe9a8, 0.45);
    this.dust(x, z, 8, 0xf0e2b8);
  }

  bigBeam(x1, y1, z1, x2, y2, z2, color = 0x9ff4ff, radius = 0.5, opacity = 0.9, dur = 0.34) {
    const b = this.bigBeams[this.bigBeamIdx];
    this.bigBeamIdx = (this.bigBeamIdx + 1) % this.bigBeams.length;
    const dx = x2 - x1, dy = y2 - y1, dz = z2 - z1;
    const len = Math.hypot(dx, dy, dz) || 1;
    b.mesh.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
    this.tmpDir.set(dx / len, dy / len, dz / len);
    b.mesh.quaternion.setFromUnitVectors(this.up, this.tmpDir);
    b.mesh.scale.set(radius, len, radius);
    b.mesh.material.color.setHex(color);
    b.mesh.material.opacity = opacity;
    b.mesh.visible = true;
    b.life = dur; b.max = dur;
  }

  gasterBlast(x, z, ang = 0, len = 26, color = 0x9ff4ff) {
    const b = this.blasters[this.blasterIdx];
    this.blasterIdx = (this.blasterIdx + 1) % this.blasters.length;
    b.grp.position.set(x, 3.3, z);
    b.grp.rotation.set(0, ang, 0);
    b.grp.scale.setScalar(1.38);
    b.grp.visible = true;
    b.life = 0.6; b.max = 0.6;

    const sx = x + Math.sin(ang) * 2.9, sz = z + Math.cos(ang) * 2.9;
    const ex = x + Math.sin(ang) * len, ez = z + Math.cos(ang) * len;
    this.bigBeam(sx, 3.3, sz, ex, 3.3, ez, color, 0.62, 0.85, 0.4);
    this.bigBeam(sx, 3.3, sz, ex, 3.3, ez, 0xffffff, 0.26, 0.95, 0.32);
    this.flash(sx, 3.35, sz, 2.2, color, 0.26);
    this.flash(ex, 1.6, ez, 2.4, color, 0.3);
    this.ring(ex, ez, 0.8, 4.4, color, 0.45);
    this.burst(ex, 1.2, ez, color, 24, 6.5);
    this.dust(ex, ez, 10, 0xcfeaf6);
  }

  boneBarrage(x, z, ang = 0) {
    this.ring(x, z, 0.5, 2.0, 0xcfeaff, 0.3);
    this.flash(x, 1.7, z, 0.9, 0xcfeaff, 0.18);
    for (let i = 0; i < 5; i++) {
      this.burst(x + Math.sin(ang) * 0.7, 1.4, z + Math.cos(ang) * 0.7, 0xdff4ff, 3, 3.4);
    }
  }

  boneSpikes(x, z, r = 6.4) {
    const n = 10;
    for (let i = 0; i < n; i++) {
      const s = this.spikes[this.spikeIdx];
      this.spikeIdx = (this.spikeIdx + 1) % this.spikes.length;
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
      const rr = 1.2 + Math.random() * r;
      s.x = x + Math.cos(a) * rr;
      s.z = z + Math.sin(a) * rr;
      s.mesh.position.set(s.x, -1.9, s.z);
      s.mesh.rotation.set((Math.random() - 0.5) * 0.5, Math.random() * 3, (Math.random() - 0.5) * 0.5);
      s.mesh.scale.set(0.16 + Math.random() * 0.1, 1.1 + Math.random() * 0.9, 0.16 + Math.random() * 0.1);
      s.mesh.material.opacity = 1;
      s.mesh.material.transparent = true;
      s.mesh.visible = true;
      const life = 0.9 + Math.random() * 0.35;
      s.life = life; s.max = life;
    }
    this.ring(x, z, 0.8, r * 1.02, 0xbfeaff, 0.5);
    this.dust(x, z, 18, 0xcfe6f2);
  }

  blink(x, z, x2, z2) {
    this.ring(x, z, 0.5, 1.9, 0x9ff4ff, 0.34);
    this.burst(x, 1.1, z, 0x9ff4ff, 14, 4.4, { grav: -1 });
    this.text(x, 2.6, z, '순간이동', { color: '#9ff4ff', size: 0.6, life: 0.7 });
    this.flash(x2, 1.7, z2, 1.3, 0x9ff4ff, 0.28);
    this.ring(x2, z2, 0.5, 1.7, 0x9ff4ff, 0.3);
    this.burst(x2, 1.1, z2, 0xdffbff, 10, 3.6, { grav: -1 });
  }

  /* ───────── 라스트 브레스 3페이즈 · 신규 유닛 연출 ───────── */

  // 손바닥에 검은 구멍이 뚫린 거대 가스터 손이 하늘에서 내려찍는다
  gasterHand(x, z, side = 1, r = 4.4) {
    const h = this.gasterHands[this.gasterHandIdx];
    this.gasterHandIdx = (this.gasterHandIdx + 1) % this.gasterHands.length;
    h.grp.position.set(x, 8.2, z);
    h.grp.rotation.set(0.1, side > 0 ? 0.4 : -0.4, side * 0.12);
    h.grp.scale.setScalar(1.35);
    h.grp.visible = true;
    h.grp.traverse((o) => { if (o.material) o.material.opacity = 1; });
    h.life = 0.72; h.max = 0.72;
    h.x = x; h.z = z; h.side = side;
    this.flash(x, 6.4, z, 1.5, 0x9ff4ff, 0.26);
    this.flash(x, 1.0, z, 1.3, 0x9ff4ff, 0.3);
    this.ring(x, z, 0.8, r * 1.05, 0x9ff4ff, 0.5);
    this.ring(x, z, 0.4, r * 0.7, 0xffffff, 0.42);
    this.burst(x, 0.8, z, 0xdff6ff, 20, 7.5);
    this.dust(x, z, 16, 0xbfe6f2);
  }

  // 가운뎃손가락을 치켜든 픽셀 손이 둥둥 떠오른다
  rudeHand(x, z, i = 0) {
    const h = this.rudeHands[this.rudeHandIdx];
    this.rudeHandIdx = (this.rudeHandIdx + 1) % this.rudeHands.length;
    const a = Math.random() * Math.PI * 2;
    const rr = 0.6 + Math.random() * 1.5;
    h.baseY = 2.3 + Math.random() * 0.9;
    h.grp.position.set(x + Math.cos(a) * rr, h.baseY, z + Math.sin(a) * rr);
    // 전장 중앙을 바둪보게 세워 손모양 실루엣이 읽히게 한다
    h.grp.rotation.set(0.08, Math.atan2(-(x + Math.cos(a) * rr), -(z + Math.sin(a) * rr)), (Math.random() - 0.5) * 0.22);
    h.grp.scale.setScalar(1.7 + (i % 3) * 0.2);
    h.grp.visible = true;
    h.matA.opacity = 1; h.matB.opacity = 1;
    h.life = 1.0; h.max = 1.0;
    h.spin = (Math.random() - 0.5) * 2.4;
    h.x = x; h.z = z;
    this.flash(x, h.baseY, z, 1.4, 0xffe066, 0.24);
    this.burst(x, h.baseY, z, 0xffe066, 10, 4.4);
  }

  rudeText(x, z, text = '🖕 불미스러운 공격!') {
    this.text(x, 5.2, z, text, { color: '#ffe066', size: 1.7, life: 1.7 });
    this.ring(x, z, 0.6, 4.6, 0xffe066, 0.6);
    this.dust(x, z, 10, 0xffd166);
  }

  // 히드라 — 세 갈래 맹독 브레스
  venomBreath(x, z, ang = 0, len = 12) {
    const steps = 8;
    const ex = x + Math.sin(ang) * len;
    const ez = z + Math.cos(ang) * len;
    // 굵은 맹독 줄기 (초록 + 보라)
    this.bigBeam(x, 1.7, z, ex, 1.0, ez, 0x7dff5c, 0.46, 0.42, 0.4);
    this.bigBeam(x, 1.5, z, ex, 1.15, ez, 0xa03cff, 0.3, 0.5, 0.34);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const bx = x + Math.sin(ang) * len * t;
      const bz = z + Math.cos(ang) * len * t;
      const col = i % 2 ? 0x7dff5c : 0xa03cff;
      // 피어오르는 독기
      this.burst(bx, 1.1 + t * 0.9, bz, col, 9, 5, { grav: -2.4 });
      this.dust(bx, bz, 3, 0x6f8a4a);
    }
    this.flash(x, 1.7, z, 1.2, 0x7dff5c, 0.24);
    this.ring(x, z, 0.4, 2.2, 0x7dff5c, 0.32);
  }

  // 매머드 — 엄니 돌진이 끝나고 착지한 자리의 지진
  tuskQuakeGround(x, z, r = 4.8) {
    this.ring(x, z, 0.8, r * 1.15, 0xffd9a0, 0.5);
    this.ring(x, z, 0.5, r * 0.8, 0xfff2d0, 0.42);
    this.burst(x, 0.7, z, 0xd9c08a, 26, 7.2);
    this.dust(x, z, 22, 0xe8d9b0);
  }

  // 킹콩 — 가슴 두드리기
  chestBeat(x, y, z) {
    this.ring(x, z, 0.5, 2.6, 0xffb066, 0.45);
    this.flash(x, y, z, 1.5, 0xffb066, 0.26);
    this.burst(x, y, z, 0xffc98a, 12, 4.2);
    this.text(x, y + 1.6, z, '🦍 두근! 두근!', { color: '#ffc98a', size: 0.62, life: 0.8 });
  }

  /* ───────── 전장 아이템 연출 ───────── */

  // 테슬라 코일 — 지그재그 연쇄 번개
  chainLightning(x, z, x2, z2, y = 1.5, y2 = 1.0) {
    const seg = 3;
    let px = x, py = y, pz = z;
    for (let i = 1; i <= seg; i++) {
      const t = i / seg;
      const last = i === seg;
      const jx = last ? x2 : x + (x2 - x) * t + (Math.random() - 0.5) * 1.2;
      const jz = last ? z2 : z + (z2 - z) * t + (Math.random() - 0.5) * 1.2;
      const jy = last ? y2 : y + (y2 - y) * t + (Math.random() - 0.5) * 0.5;
      this.beam(px, py, pz, jx, jy, jz, 0x9fe8ff, 0.16);
      px = jx; py = jy; pz = jz;
    }
    this.flash(x2, y2, z2, 1.0, 0x9fe8ff, 0.22);
    this.burst(x2, y2, z2, 0xd6f6ff, 9, 4.4);
  }

  // 치유 토템 — 초록 치유 파동
  healPulse(x, z, r = 9) {
    this.ring(x, z, 0.6, r, 0x8dff9a, 0.7);
    this.ring(x, z, 0.3, r * 0.62, 0xd6ffd0, 0.55);
    this.flash(x, 1.5, z, 1.6, 0x8dff9a, 0.28);
    this.burst(x, 1.2, z, 0x9dffb0, 18, 3.4, { grav: -3.2 });
  }

  // 가시 바리케이드 · 지뢰 — 짧은 가시 충격
  spikeHit(x, z) {
    this.ring(x, z, 0.35, 1.5, 0xffb09a, 0.3);
    this.burst(x, 0.85, z, 0xffc8a8, 8, 3.4);
  }

  /* ───────── 피해 숫자 ───────── */
  text(x, y, z, text, { color = '#ffffff', size = 1.0, crit = false, life = 0.95 } = {}) {
    const slot = this.numbers[this.numberIdx];
    this.numberIdx = (this.numberIdx + 1) % this.numbers.length;
    const { canvas, texture, sprite } = slot;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let fs = crit ? 92 : 74;
    const font = (size2) => `900 ${size2}px "Apple SD Gothic Neo", "Malgun Gothic", system-ui, sans-serif`;
    ctx.font = font(fs);
    const wide = ctx.measureText(text).width;
    if (wide > 236) fs = Math.max(34, Math.floor(fs * 236 / wide));
    ctx.font = font(fs);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(6, fs * 0.19);
    ctx.strokeStyle = 'rgba(20,12,8,0.85)';
    ctx.strokeText(text, 128, 66);
    ctx.fillStyle = color;
    ctx.fillText(text, 128, 66);
    texture.needsUpdate = true;

    sprite.position.set(x, y, z);
    const s = (crit ? 2.5 : 1.9) * size;
    sprite.scale.set(s, s * 0.5, 1);
    sprite.material.opacity = 1;
    sprite.visible = true;
    slot.life = life;
    slot.max = life;
    slot.vy = crit ? 3.1 : 2.4;
    slot.vx = (Math.random() - 0.5) * 0.9;
    slot.crit = crit;
  }

  damage(x, y, z, amount, { crit = false, dot = false, block = false } = {}) {
    const n = Math.max(1, Math.round(amount));
    if (block) return this.text(x, y, z, '막음', { color: '#9fd0ff', size: 0.75 });
    if (dot) return this.text(x, y, z, `-${n}`, { color: '#c98af7', size: 0.72 });
    this.text(x, y, z, crit ? `${n}!` : `${n}`, {
      color: crit ? '#ffd54a' : '#fff3e0', size: crit ? 1.15 : 0.9, crit,
    });
  }

  evade(x, y, z) {
    this.text(x, y, z, '회피', { color: '#8fe3ff', size: 0.7, life: 0.7 });
  }

  /* ───────── 파편 ───────── */
  burst(x, y, z, color = 0xffcf6b, count = 12, power = 4, opts = {}) {
    const c = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      if (this.parts.length >= this.maxParts) this.parts.shift();
      const a = Math.random() * Math.PI * 2;
      const up = Math.random() * 0.9 + 0.25;
      const sp = power * (0.35 + Math.random() * 0.9);
      this.parts.push({
        x, y, z,
        vx: Math.cos(a) * sp * 0.7, vy: up * sp, vz: Math.sin(a) * sp * 0.7,
        life: 0.4 + Math.random() * 0.5, max: 0.9, r: c.r, g: c.g, b: c.b,
        grav: opts.grav == null ? 11 : opts.grav, size: opts.size || 1,
      });
    }
  }

  dust(x, z, count = 10, color = 0xd8c9a0) {
    this.burst(x, 0.25, z, color, count, 2.6, { grav: 3 });
  }

  /* ───────── 링 · 섬광 · 참격 ───────── */
  ring(x, z, from = 0.5, to = 5, color = 0xffd27a, dur = 0.5, y = 0.08) {
    const r = this.rings[this.ringIdx];
    this.ringIdx = (this.ringIdx + 1) % this.rings.length;
    r.mesh.position.set(x, y, z);
    r.mesh.scale.setScalar(from);
    r.mesh.material.color.setHex(color);
    r.mesh.material.opacity = 0.55;
    r.mesh.visible = true;
    r.life = dur; r.max = dur; r.from = from; r.to = to; r.y = y;
  }

  flash(x, y, z, r = 1.6, color = 0xffe6a0, dur = 0.28) {
    r *= 0.7;
    const f = this.flashes[this.flashIdx];
    this.flashIdx = (this.flashIdx + 1) % this.flashes.length;
    f.mesh.position.set(x, y, z);
    f.mesh.scale.setScalar(r);
    f.mesh.material.color.setHex(color);
    f.mesh.material.opacity = 0.24;
    f.mesh.visible = true;
    f.life = dur; f.max = dur; f.r = r;
  }

  slash(x, y, z, angle = 0, size = 1.5, color = 0xfff0c0) {
    const s = this.slashes[this.slashIdx];
    this.slashIdx = (this.slashIdx + 1) % this.slashes.length;
    s.mesh.position.set(x, y, z);
    s.mesh.rotation.set(0, angle + Math.PI / 2, Math.random() * 0.8);
    s.mesh.scale.set(size, size * 0.55, 1);
    s.mesh.material.color.setHex(color);
    s.mesh.material.opacity = 0.9;
    s.mesh.visible = true;
    s.life = 0.16; s.max = 0.16;
  }

  /* ───────── 투사체 ───────── */
  syncProjectiles(list) {
    const seen = new Set();
    for (const p of list) {
      seen.add(p.pid);
      let mesh = this.projectileMeshes.get(p.pid);
      if (!mesh) {
        const kind = p.kind || 'arrow';
        mesh = kind === 'bullet'
          ? new THREE.Mesh(this.bulletGeo, this.bulletMat)
          : kind === 'rocket'
            ? new THREE.Mesh(this.rocketGeo, this.rocketMat)
            : kind === 'egg'
              ? new THREE.Mesh(this.eggGeo, this.eggMat)
              : kind === 'bone'
                ? this.makeBoneMesh()
                : new THREE.Mesh(this.projGeo, this.projMat);
        mesh.castShadow = false;
        this.group.add(mesh);
        this.projectileMeshes.set(p.pid, mesh);
      }
      mesh.position.set(p.x, p.y, p.z);
      mesh.lookAt(p.x + p.vx, p.y, p.z + p.vz);
      mesh.rotateX(Math.PI / 2);
    }
    for (const [pid, mesh] of this.projectileMeshes) {
      if (!seen.has(pid)) {
        this.group.remove(mesh);
        this.projectileMeshes.delete(pid);
      }
    }
  }

  /* ───────── 레이저 · 폭발 · 화염 ───────── */
  beam(x1, y1, z1, x2, y2, z2, color = 0x6fe8ff, dur = 0.22) {
    const b = this.beams[this.beamIdx];
    this.beamIdx = (this.beamIdx + 1) % this.beams.length;
    const dx = x2 - x1, dy = y2 - y1, dz = z2 - z1;
    const len = Math.hypot(dx, dy, dz) || 1;
    b.mesh.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
    this.tmpDir.set(dx / len, dy / len, dz / len);
    b.mesh.quaternion.setFromUnitVectors(this.up, this.tmpDir);
    b.mesh.scale.set(1, len, 1);
    b.mesh.material.color.setHex(color);
    b.mesh.material.opacity = 0.95;
    b.mesh.visible = true;
    b.life = dur; b.max = dur;
  }

  explosion(x, y, z, r = 3, color = 0xff8a4a) {
    this.flash(x, y + 0.3, z, r * 1.15, color, 0.34);
    this.ring(x, z, r * 0.25, r * 1.5, color, 0.5);
    this.burst(x, y, z, color, Math.min(46, 14 + Math.round(r * 8)), 7);
    this.burst(x, y, z, 0xffe08a, Math.min(24, 8 + Math.round(r * 4)), 5);
    this.dust(x, z, 12, 0x8a7a62);
  }

  flame(x, y, z, r = 3, color = 0xff7a3a) {
    this.flash(x, y, z, r * 0.8, color, 0.3);
    this.ring(x, z, r * 0.3, r * 1.2, color, 0.45);
    this.burst(x, y + 0.2, z, color, 30, 5.5, { grav: -2 });
    this.burst(x, y + 0.2, z, 0xffe066, 14, 4, { grav: -1 });
  }

  /* ───────── 프레임 갱신 ───────── */
  makeBoneMesh() {
    const g = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.86, 6), this.boneMat);
    g.add(shaft);
    for (const y of [-0.43, 0.43]) {
      for (const s of [-1, 1]) {
        const knob = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), this.boneMat);
        knob.position.set(s * 0.07, y, 0);
        g.add(knob);
      }
    }
    return g;
  }

  update(dt) {
    this.time += dt;
    // 숫자
    for (const n of this.numbers) {
      if (n.life <= 0) continue;
      n.life -= dt;
      const k = 1 - n.life / n.max;
      n.sprite.position.y += n.vy * dt;
      n.sprite.position.x += (n.vx || 0) * dt;
      n.vy -= 3.2 * dt;
      n.sprite.material.opacity = Math.max(0, 1 - Math.pow(k, 2.2));
      if (n.life <= 0) n.sprite.visible = false;
    }
    // 파편
    let count = 0;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) { this.parts.splice(i, 1); continue; }
      p.vy -= p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.05) { p.y = 0.05; p.vy *= -0.28; p.vx *= 0.7; p.vz *= 0.7; }
    }
    for (const p of this.parts) {
      if (count >= this.maxParts) break;
      this.partPos[count * 3] = p.x;
      this.partPos[count * 3 + 1] = p.y;
      this.partPos[count * 3 + 2] = p.z;
      const f = Math.max(0, p.life / 0.5);
      this.partCol[count * 3] = p.r * f;
      this.partCol[count * 3 + 1] = p.g * f;
      this.partCol[count * 3 + 2] = p.b * f;
      count++;
    }
    this.partGeo.setDrawRange(0, count);
    this.partGeo.attributes.position.needsUpdate = true;
    this.partGeo.attributes.color.needsUpdate = true;

    // 링
    for (const r of this.rings) {
      if (r.life <= 0) continue;
      r.life -= dt;
      const k = 1 - Math.max(0, r.life) / r.max;
      const s = r.from + (r.to - r.from) * easeOut(k);
      r.mesh.scale.setScalar(s);
      r.mesh.material.opacity = Math.max(0, 0.55 * (1 - k) * (1 - k));
      if (r.life <= 0) r.mesh.visible = false;
    }
    // 섬광
    for (const f of this.flashes) {
      if (f.life <= 0) continue;
      f.life -= dt;
      const k = 1 - Math.max(0, f.life) / f.max;
      f.mesh.scale.setScalar(f.r * (1 + k * 0.8));
      f.mesh.material.opacity = Math.max(0, 0.24 * (1 - k));
      if (f.life <= 0) f.mesh.visible = false;
    }
    // 참격
    for (const s of this.slashes) {
      if (s.life <= 0) continue;
      s.life -= dt;
      const k = 1 - Math.max(0, s.life) / s.max;
      s.mesh.material.opacity = Math.max(0, 0.9 * (1 - k));
      s.mesh.scale.multiplyScalar(1 + dt * 3);
      if (s.life <= 0) s.mesh.visible = false;
    }
    // 빔
    for (const b of this.beams) {
      if (b.life <= 0) continue;
      b.life -= dt;
      const k = 1 - Math.max(0, b.life) / b.max;
      b.mesh.material.opacity = Math.max(0, 0.95 * (1 - k));
      if (b.life <= 0) b.mesh.visible = false;
    }
    // 깃털
    for (const f of this.feathers) {
      if (f.life <= 0) continue;
      f.life -= dt;
      f.mesh.position.y += f.vy * dt;
      f.mesh.position.x += (f.drift + Math.sin(this.time * 2.4 + f.spin) * 0.5) * dt;
      f.mesh.rotation.z += f.spin * dt;
      f.mesh.rotation.x += f.spin * 0.6 * dt;
      f.mesh.material.opacity = Math.max(0, 0.95 * Math.min(1, f.life / 0.35));
      if (f.life <= 0 || f.mesh.position.y < 0.06) { f.mesh.visible = false; f.life = 0; }
    }
    // 해골 블래스터
    for (const b of this.blasters) {
      if (b.life <= 0) continue;
      b.life -= dt;
      const k = 1 - Math.max(0, b.life) / b.max;
      b.grp.position.y = 3.3 + Math.sin(k * Math.PI) * 0.22;
      b.grp.scale.setScalar(1.38 + Math.sin(k * Math.PI) * 0.12);
      b.grp.visible = b.life > 0;
    }
    // 굵은 빔
    for (const b of this.bigBeams) {
      if (b.life <= 0) continue;
      b.life -= dt;
      const k = 1 - Math.max(0, b.life) / b.max;
      b.mesh.material.opacity = Math.max(0, b.mesh.material.opacity * (1 - k * 0.85));
      if (b.life <= 0) b.mesh.visible = false;
    }
    // 뼈 가시
    for (const s of this.spikes) {
      if (s.life <= 0) continue;
      s.life -= dt;
      const k = 1 - Math.max(0, s.life) / s.max;
      const rise = Math.min(1, k / 0.25);
      const fall = Math.max(0, (k - 0.72) / 0.28);
      s.mesh.position.y = -1.9 + rise * 2.5 - fall * 2.2;
      s.mesh.material.opacity = Math.max(0, 1 - fall);
      if (s.life <= 0) s.mesh.visible = false;
    }
    // 가스터손 — 하늘에서 내려찍고 사라진다
    for (const h of this.gasterHands) {
      if (h.life <= 0) continue;
      h.life -= dt;
      const k = 1 - Math.max(0, h.life) / h.max;
      const drop = Math.min(1, k / 0.34);
      const ease = 1 - Math.pow(1 - drop, 3);
      h.grp.position.y = 8.2 - ease * 7.05;
      h.grp.rotation.z = (h.side || 1) * (0.12 + Math.sin(k * Math.PI) * 0.12);
      const fade = k > 0.72 ? Math.max(0, 1 - (k - 0.72) / 0.28) : 1;
      h.grp.traverse((o) => { if (o.material && o.material.transparent) o.material.opacity = fade; });
      if (h.life <= 0) h.grp.visible = false;
    }
    // 불미스러운 공격 — 손들이 떠서 흔들리다 터진다
    for (const h of this.rudeHands) {
      if (h.life <= 0) continue;
      h.life -= dt;
      const k = 1 - Math.max(0, h.life) / h.max;
      h.grp.position.y = h.baseY + Math.sin(this.time * 9 + h.baseY) * 0.12 + k * 0.5;
      h.grp.rotation.y += h.spin * dt;
      const fade = k > 0.6 ? Math.max(0, 1 - (k - 0.6) / 0.4) : 1;
      h.matA.opacity = fade;
      h.matB.opacity = fade;
      if (h.life <= 0) h.grp.visible = false;
    }
  }

  clear() {
    for (const n of this.numbers) { n.life = 0; n.sprite.visible = false; }
    for (const r of this.rings) { r.life = 0; r.mesh.visible = false; }
    for (const f of this.flashes) { f.life = 0; f.mesh.visible = false; }
    for (const b of this.beams) { b.life = 0; b.mesh.visible = false; }
    this.parts.length = 0;
    this.partGeo.setDrawRange(0, 0);
    for (const f of this.feathers) { f.life = 0; f.mesh.visible = false; }
    for (const b of this.blasters) { b.life = 0; b.grp.visible = false; }
    for (const b of this.bigBeams) { b.life = 0; b.mesh.visible = false; }
    for (const s of this.spikes) { s.life = 0; s.mesh.visible = false; }
    for (const h of this.gasterHands) { h.life = 0; h.grp.visible = false; }
    for (const h of this.rudeHands) { h.life = 0; h.grp.visible = false; }
    for (const [, mesh] of this.projectileMeshes) this.group.remove(mesh);
    this.projectileMeshes.clear();
  }
}

function easeOut(k) { return 1 - Math.pow(1 - k, 3); }
