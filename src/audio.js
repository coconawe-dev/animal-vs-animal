// 동물 vs 동물 — WebAudio 합성 효과음 (외부 오디오 파일 없음)
export class Sfx {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.master = null;
    this.lastHit = 0;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      // 노이즈 버퍼 미리 만들기
      const len = this.ctx.sampleRate * 1.2;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { this.ctx = null; }
  }

  setEnabled(v) {
    this.enabled = v;
    if (this.master) this.master.gain.value = v ? 0.5 : 0;
  }

  get ok() { return this.enabled && this.ctx && this.ctx.state === 'running'; }

  noiseBurst({ dur = 0.18, freq = 900, q = 0.8, gain = 0.4, type = 'lowpass', sweep = null } = {}) {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(60, sweep), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.02);
  }

  tone({ freq = 220, freq2 = null, dur = 0.2, gain = 0.22, type = 'sine', delay = 0 } = {}) {
    if (!this.ok) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freq2) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq2), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  hit(heavy = false) {
    const now = performance.now();
    if (now - this.lastHit < 45) return;
    this.lastHit = now;
    this.noiseBurst({ dur: heavy ? 0.2 : 0.12, freq: heavy ? 520 : 1000, gain: heavy ? 0.55 : 0.3, sweep: 180 });
    this.tone({ freq: heavy ? 92 : 150, freq2: 60, dur: 0.14, gain: 0.32, type: 'triangle' });
  }

  crit() {
    this.noiseBurst({ dur: 0.22, freq: 2200, gain: 0.45, sweep: 400 });
    this.tone({ freq: 620, freq2: 240, dur: 0.18, gain: 0.25, type: 'square' });
  }

  whoosh() {
    this.noiseBurst({ dur: 0.3, freq: 380, q: 1.2, gain: 0.26, type: 'bandpass', sweep: 1600 });
  }

  roar() {
    this.tone({ freq: 130, freq2: 58, dur: 0.65, gain: 0.4, type: 'sawtooth' });
    this.tone({ freq: 196, freq2: 82, dur: 0.55, gain: 0.2, type: 'square' });
    this.noiseBurst({ dur: 0.5, freq: 700, gain: 0.24, sweep: 140 });
  }

  slam() {
    this.tone({ freq: 74, freq2: 34, dur: 0.42, gain: 0.5, type: 'sine' });
    this.noiseBurst({ dur: 0.35, freq: 260, gain: 0.42, sweep: 60 });
  }

  skill(kind) {
    if (kind === 'roar' || kind === 'smash' || kind === 'titanSlam' || kind === 'rockCrush' || kind === 'abyssVortex') return this.roar();
    if (kind === 'slam' || kind === 'quake') return this.slam();
    if (kind === 'charge' || kind === 'gore' || kind === 'gore2' || kind === 'hornCharge') return this.whoosh();
    if (kind === 'pounce' || kind === 'packPounce' || kind === 'sailSlash') return this.whoosh();
    if (kind === 'bloodFrenzy' || kind === 'deepBite' || kind === 'tidalJaw' || kind === 'sneakStrike') return this.whoosh();
    if (kind === 'flame' || kind === 'dragonBreath') return this.flame();
    if (kind === 'crunch') return this.boom();
    if (kind === 'gasterBlast') return this.laser();
    if (kind === 'featherStorm') return this.whoosh();
    this.tone({ freq: 520, freq2: 900, dur: 0.16, gain: 0.2, type: 'triangle' });
    this.noiseBurst({ dur: 0.2, freq: 1600, gain: 0.18, sweep: 900 });
  }

  gun(kind) {
    const now = performance.now();
    if (now - (this.lastGun || 0) < 55) return;
    this.lastGun = now;
    if (kind === 'laser') return this.laser();
    if (kind === 'rocket') return this.boom();
    this.noiseBurst({ dur: 0.06, freq: 2600, q: 1.4, gain: 0.16, type: 'bandpass', sweep: 1200 });
    this.tone({ freq: 320, freq2: 160, dur: 0.05, gain: 0.1, type: 'square' });
  }

  gaster() {
    this.laser();
    this.tone({ freq: 96, freq2: 42, dur: 0.6, gain: 0.32, type: 'sawtooth' });
    this.noiseBurst({ dur: 0.45, freq: 2200, q: 1.1, gain: 0.22, type: 'bandpass', sweep: 400 });
  }

  bones() {
    const now = performance.now();
    if (now - (this.lastBone || 0) < 70) return;
    this.lastBone = now;
    this.noiseBurst({ dur: 0.06, freq: 1900, q: 1.6, gain: 0.13, type: 'bandpass', sweep: 900 });
    this.tone({ freq: 280, freq2: 190, dur: 0.05, gain: 0.08, type: 'square' });
  }

  blink() {
    this.tone({ freq: 820, freq2: 2400, dur: 0.14, gain: 0.14, type: 'sine' });
    this.noiseBurst({ dur: 0.16, freq: 2600, q: 1.4, gain: 0.1, type: 'bandpass', sweep: 1400 });
  }

  feather() {
    this.noiseBurst({ dur: 0.32, freq: 900, q: 0.7, gain: 0.1, type: 'bandpass', sweep: 320 });
  }

  laser() {
    if (!this.ok) return;    if (performance.now() - (this.lastLaser || 0) < 90) return;
    this.lastLaser = performance.now();
    this.tone({ freq: 1400, freq2: 260, dur: 0.22, gain: 0.2, type: 'sawtooth' });
    this.noiseBurst({ dur: 0.16, freq: 3200, gain: 0.14, type: 'highpass', sweep: 800 });
  }

  boom() {
    if (!this.ok) return;
    if (performance.now() - (this.lastBoom || 0) < 70) return;
    this.lastBoom = performance.now();
    this.tone({ freq: 120, freq2: 34, dur: 0.5, gain: 0.5, type: 'sine' });
    this.noiseBurst({ dur: 0.45, freq: 480, gain: 0.45, sweep: 60 });
  }

  flame() {
    this.noiseBurst({ dur: 0.4, freq: 1200, q: 0.6, gain: 0.3, type: 'lowpass', sweep: 200 });
  }

  clang() {
    this.tone({ freq: 1800, freq2: 900, dur: 0.1, gain: 0.16, type: 'triangle' });
    this.noiseBurst({ dur: 0.1, freq: 4200, gain: 0.14, type: 'highpass', sweep: 2000 });
  }

  death() {
    this.tone({ freq: 260, freq2: 70, dur: 0.5, gain: 0.3, type: 'sawtooth' });
    this.noiseBurst({ dur: 0.3, freq: 500, gain: 0.25, sweep: 90 });
  }

  ui() { this.tone({ freq: 880, freq2: 1180, dur: 0.07, gain: 0.12, type: 'sine' }); }

  victory() {
    [523, 659, 784, 1046].forEach((f, i) => {
      this.tone({ freq: f, dur: 0.5, gain: 0.2, type: 'triangle', delay: i * 0.11 });
    });
    this.tone({ freq: 261, dur: 1.0, gain: 0.14, type: 'sine', delay: 0.44 });
  }
}
