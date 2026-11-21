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
  }

  /* ───────── 피해 숫자 ───────── */
  text(x, y, z, text, { color = '#ffffff', size = 1.0, crit = false, life = 0.95 } = {}) {
    const slot = this.numbers[this.numberIdx];
    this.numberIdx = (this.numberIdx + 1) % this.numbers.length;
    const { canvas, texture, sprite } = slot;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const fs = crit ? 92 : 74;
    ctx.font = `900 ${fs}px "Apple SD Gothic Neo", "Malgun Gothic", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 14;
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
    r.mesh.material.opacity = 0.95;
    r.mesh.visible = true;
    r.life = dur; r.max = dur; r.from = from; r.to = to; r.y = y;
  }

  flash(x, y, z, r = 1.6, color = 0xffe6a0, dur = 0.28) {
    const f = this.flashes[this.flashIdx];
    this.flashIdx = (this.flashIdx + 1) % this.flashes.length;
    f.mesh.position.set(x, y, z);
    f.mesh.scale.setScalar(r);
    f.mesh.material.color.setHex(color);
    f.mesh.material.opacity = 0.65;
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
        mesh = new THREE.Mesh(this.projGeo, this.projMat);
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

  /* ───────── 프레임 갱신 ───────── */
  update(dt) {
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
      r.mesh.material.opacity = Math.max(0, 0.95 * (1 - k) * (1 - k));
      if (r.life <= 0) r.mesh.visible = false;
    }
    // 섬광
    for (const f of this.flashes) {
      if (f.life <= 0) continue;
      f.life -= dt;
      const k = 1 - Math.max(0, f.life) / f.max;
      f.mesh.scale.setScalar(f.r * (1 + k * 0.8));
      f.mesh.material.opacity = Math.max(0, 0.65 * (1 - k));
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
  }

  clear() {
    for (const n of this.numbers) { n.life = 0; n.sprite.visible = false; }
    for (const r of this.rings) { r.life = 0; r.mesh.visible = false; }
    for (const f of this.flashes) { f.life = 0; f.mesh.visible = false; }
    this.parts.length = 0;
    this.partGeo.setDrawRange(0, 0);
    for (const [, mesh] of this.projectileMeshes) this.group.remove(mesh);
    this.projectileMeshes.clear();
  }
}

function easeOut(k) { return 1 - Math.pow(1 - k, 3); }
