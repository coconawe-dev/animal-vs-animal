// 동물 vs 동물 — DOM UI (편성 · HUD · 기록 · 결과)
import { ANIMALS, ANIMAL_BY_ID, ARENAS, ARENA_BY_ID, PRESETS, TUNING, animalTierStars, powerOf } from './config.js';

const $ = (sel) => document.querySelector(sel);
const MAX_TEAM = TUNING.MAX_TEAM;

export class UI {
  constructor(app, hooks = {}) {
    this.app = app;
    this.hooks = hooks;
    this.activeTeam = 'blue';
    this.logCount = 0;
    this.units = [];
    this.lastDetail = null;

    this.el = {
      builder: $('#builder'), roster: $('#roster'), detail: $('#detail'),
      slotsBlue: $('#slots-blue'), slotsRed: $('#slots-red'),
      countBlue: $('#count-blue'), countRed: $('#count-red'),
      powerBlue: $('#power-blue'), powerRed: $('#power-red'),
      presetRow: $('#preset-row'), arenaRow: $('#arena-row'), modeRow: $('#mode-row'),
      fight: $('#btn-fight'), random: $('#btn-random'),
      hud: $('#battle-hud'), strip: $('#team-strip'), stripBlue: $('#strip-blue'), stripRed: $('#strip-red'),
      scoreBlue: $('#score-blue'), scoreRed: $('#score-red'), clock: $('#battle-clock'), state: $('#battle-state'),
      pause: $('#btn-pause'), speed: $('#btn-speed'), follow: $('#btn-follow'), logBtn: $('#btn-log'),
      log: $('#battle-log'), logList: $('#log-list'), rebuild: $('#btn-rebuild'),
      banner: $('#banner'), bannerTitle: $('#banner-title'), bannerSub: $('#banner-sub'),
      bannerMvp: $('#banner-mvp'), bannerCrown: $('#banner-crown'),
      toast: $('#toast'), help: $('#help'), loader: $('#loader'), sound: $('#btn-sound'),
    };

    this.buildRoster();
    this.buildPresets();
    this.buildArenas();
    this.bind();
    this.render();
  }

  /* ───────────── 편성 화면 ───────────── */

  buildRoster() {
    const html = ANIMALS.map((a) => {
      const c = '#' + a.colors.main.toString(16).padStart(6, '0');
      return `<button class="card" data-id="${a.id}" style="--accent:${c}" aria-label="${a.name}">
        <span class="card-emoji">${a.emoji}</span>
        <span class="card-name">${a.name}</span>
        <span class="card-tier">${animalTierStars(a.tier)}</span>
        <span class="card-stats"><i>HP ${a.hp}</i><i>ATK ${a.atk}</i></span>
        <span class="card-badge hidden"></span>
      </button>`;
    }).join('');
    this.el.roster.innerHTML = html;
  }

  buildPresets() {
    this.el.presetRow.innerHTML = PRESETS.map((p) => (
      `<button class="chip" data-preset="${p.id}">${p.emoji} ${p.name}</button>`
    )).join('');
  }

  buildArenas() {
    this.el.arenaRow.innerHTML = ARENAS.map((a) => (
      `<button class="chip" data-arena="${a.id}">${a.emoji} ${a.name}</button>`
    )).join('');
  }

  bind() {
    this.el.roster.addEventListener('click', (e) => {
      const card = e.target.closest('.card');
      if (!card) return;
      this.addAnimal(card.dataset.id);
    });

    [this.el.slotsBlue, this.el.slotsRed].forEach((row) => {
      row.addEventListener('click', (e) => {
        const slot = e.target.closest('.slot');
        if (!slot) return;
        const team = row.dataset.team;
        this.app.activeTeam = team;
        const idx = Number(slot.dataset.idx);
        if (slot.classList.contains('filled')) {
          this.app.teams[team].splice(idx, 1);
          this.hooks.onTeamsChange?.();
          this.render();
        }
      });
    });

    document.querySelectorAll('.team-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.activeTeam = btn.dataset.team;
        this.app.activeTeam = this.activeTeam;
        this.render();
      });
    });

    this.el.modeRow.addEventListener('click', (e) => {
      const b = e.target.closest('.mode-chip');
      if (!b) return;
      this.setMode(b.dataset.mode);
    });

    this.el.presetRow.addEventListener('click', (e) => {
      const b = e.target.closest('[data-preset]');
      if (!b) return;
      const p = PRESETS.find((x) => x.id === b.dataset.preset);
      if (!p) return;
      this.app.teams.blue = p.blue.slice(0, MAX_TEAM);
      this.app.teams.red = p.red.slice(0, MAX_TEAM);
      this.app.arenaId = p.arena;
      this.app.mode = Math.max(p.blue.length, p.red.length) === 1 ? 'duel' : 'team';
      this.hooks.onTeamsChange?.();
      this.hooks.onArenaChange?.(p.arena);
      this.toast(`${p.emoji} ${p.name}`);
      this.render();
    });

    this.el.arenaRow.addEventListener('click', (e) => {
      const b = e.target.closest('[data-arena]');
      if (!b) return;
      this.app.arenaId = b.dataset.arena;
      this.hooks.onArenaChange?.(b.dataset.arena);
      this.render();
    });

    this.el.random.addEventListener('click', () => this.randomMatch());
    this.el.fight.addEventListener('click', () => {
      if (this.el.fight.disabled) return;
      this.hooks.onStart?.();
    });
    this.el.rebuild.addEventListener('click', () => this.hooks.onRebuild?.());
    $('#btn-rematch').addEventListener('click', () => this.hooks.onRematch?.());
    $('#btn-back').addEventListener('click', () => this.hooks.onRebuild?.());

    this.el.pause.addEventListener('click', () => this.hooks.onPause?.());
    $('#btn-restart').addEventListener('click', () => {
      this.hideBanner();
      this.hooks.onRematch?.();
    });
    this.el.speed.addEventListener('click', () => this.hooks.onSpeed?.());
    this.el.follow.addEventListener('click', () => this.hooks.onFollow?.());
    this.el.logBtn.addEventListener('click', () => this.toggleLog());
    $('#btn-log-close').addEventListener('click', () => this.toggleLog(false));

    $('#btn-help').addEventListener('click', () => this.el.help.classList.remove('hidden'));
    $('#btn-help-close').addEventListener('click', () => this.el.help.classList.add('hidden'));
    this.el.sound.addEventListener('click', () => this.hooks.onToggleSound?.());
  }

  setMode(mode) {
    this.app.mode = mode;
    if (mode === 'duel') {
      this.app.teams.blue = this.app.teams.blue.slice(0, 1);
      this.app.teams.red = this.app.teams.red.slice(0, 1);
    }
    this.hooks.onTeamsChange?.();
    this.render();
  }

  addAnimal(id) {
    const team = this.app.activeTeam;
    const list = this.app.teams[team];
    const max = this.app.mode === 'duel' ? 1 : MAX_TEAM;
    const at = list.indexOf(id);
    if (at >= 0) {
      list.splice(at, 1);
    } else {
      if (list.length >= max) {
        if (max === 1) list.length = 0;
        else { this.toast(`한 팀은 최대 ${max}마리까지!`); return; }
      }
      list.push(id);
    }
    const def = ANIMAL_BY_ID[id];
    this.showDetail(def);
    this.hooks.onTeamsChange?.();
    this.render();
  }

  randomMatch() {
    const ids = ANIMALS.map((a) => a.id);
    const pick = (n) => {
      const pool = ids.slice();
      const out = [];
      for (let i = 0; i < n; i++) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
      return out;
    };
    const n = this.app.mode === 'duel' ? 1 : 2 + Math.floor(Math.random() * 3);
    const n2 = this.app.mode === 'duel' ? 1 : 2 + Math.floor(Math.random() * 3);
    this.app.teams.blue = pick(n);
    this.app.teams.red = pick(n2);
    this.app.arenaId = ARENAS[Math.floor(Math.random() * ARENAS.length)].id;
    this.hooks.onArenaChange?.(this.app.arenaId);
    this.hooks.onTeamsChange?.();
    this.toast('🎲 랜덤 매치!');
    this.render();
  }

  showDetail(def) {
    if (!def) return;
    this.lastDetail = def.id;
    const s = def.skill;
    this.el.detail.innerHTML = `
      <b>${def.emoji} ${def.name} <span style="color:var(--muted);font-weight:600;font-size:9.5px">${def.role} · ${animalTierStars(def.tier)} · 코스트 ${def.cost}</span></b>
      <span class="stat-line">
        <i>❤️ ${def.hp}</i><i>⚔️ ${def.atk}</i><i>💨 ${def.spd}</i><i>🎯 ${def.range}</i>
      </span>
      <span class="skill-line">${s.icon} ${s.name}</span>
      <span>${s.desc} <span style="color:var(--muted-2)">· ${s.cd}초</span></span>`;
  }

  render() {
    const { teams, mode, arenaId } = this.app;
    // 모드 칩
    document.querySelectorAll('.mode-chip').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
    // 팀 버튼
    document.querySelectorAll('.team-btn').forEach((b) => b.classList.toggle('active', b.dataset.team === this.activeTeam));
    this.el.slotsBlue.classList.toggle('active', this.activeTeam === 'blue');
    this.el.slotsRed.classList.toggle('active', this.activeTeam === 'red');

    // 슬롯
    const max = mode === 'duel' ? 1 : MAX_TEAM;
    [['blue', this.el.slotsBlue, teams.blue], ['red', this.el.slotsRed, teams.red]].forEach(([team, row, list]) => {
      let html = '';
      for (let i = 0; i < max; i++) {
        const def = ANIMAL_BY_ID[list[i]];
        html += def
          ? `<button class="slot filled" data-idx="${i}" aria-label="${def.name} 빼기">
               <span class="slot-emoji">${def.emoji}</span>
               <span class="slot-name">${def.name}</span>
               <span class="slot-x">✕</span>
             </button>`
          : `<button class="slot" data-idx="${i}" aria-label="빈 슬롯"><span class="slot-plus">+</span></button>`;
      }
      row.innerHTML = html;
    });

    this.el.countBlue.textContent = teams.blue.length;
    this.el.countRed.textContent = teams.red.length;
    this.el.powerBlue.textContent = teams.blue.reduce((s, id) => s + powerOf(ANIMAL_BY_ID[id]), 0);
    this.el.powerRed.textContent = teams.red.reduce((s, id) => s + powerOf(ANIMAL_BY_ID[id]), 0);

    // 카드 선택 표시
    document.querySelectorAll('.card').forEach((card) => {
      const id = card.dataset.id;
      const inBlue = teams.blue.includes(id);
      const inRed = teams.red.includes(id);
      card.classList.toggle('selected-blue', inBlue && !inRed);
      card.classList.toggle('selected-red', inRed && !inBlue);
      card.classList.toggle('selected-both', inBlue && inRed);
      const badge = card.querySelector('.card-badge');
      badge.classList.remove('hidden', 'blue', 'red', 'both');
      if (inBlue && inRed) { badge.textContent = '🔵🔴'; badge.classList.add('both'); }
      else if (inBlue) { badge.textContent = '블루'; badge.classList.add('blue'); }
      else if (inRed) { badge.textContent = '레드'; badge.classList.add('red'); }
      else badge.classList.add('hidden');
    });

    // 전장
    document.querySelectorAll('[data-arena]').forEach((b) => b.classList.toggle('active', b.dataset.arena === arenaId));

    // 시작 버튼
    const ok = teams.blue.length > 0 && teams.red.length > 0;
    this.el.fight.disabled = !ok;
    this.el.fight.textContent = ok
      ? `⚔️ ${teams.blue.length} vs ${teams.red.length} 배틀 시작`
      : '두 팀 모두 동물을 골라 주세요';

    if (!this.lastDetail) {
      const first = ANIMAL_BY_ID[teams.blue[0]] || ANIMALS[0];
      this.showDetail(first);
    }
  }

  showBuilder() {
    this.el.builder.classList.remove('closed');
    document.body.classList.add('builder-open');
  }
  hideBuilder() {
    this.el.builder.classList.add('closed');
    document.body.classList.remove('builder-open');
  }

  /* ───────────── 전투 HUD ───────────── */

  buildStrips(state) {
    this.units = state.units.slice();
    const make = (u) => `<div class="unit-card ${u.team}" data-uid="${u.uid}">
        <div class="unit-card-top"><span class="unit-card-emoji">${u.emoji}</span><span class="unit-card-name">${u.name}</span></div>
        <div class="hp-track"><i class="hp-fill" style="width:100%"></i></div>
        <div class="unit-card-skill">필살기</div>
      </div>`;
    this.el.stripBlue.innerHTML = this.units.filter((u) => u.team === 'blue').map(make).join('');
    this.el.stripRed.innerHTML = this.units.filter((u) => u.team === 'red').map(make).join('');
    this.cards = new Map();
    [...this.el.stripBlue.children, ...this.el.stripRed.children].forEach((el) => {
      this.cards.set(Number(el.dataset.uid), { el, hp: el.querySelector('.hp-fill'), skill: el.querySelector('.unit-card-skill') });
    });
  }

  updateBattle(state) {
    const b = state.units.filter((u) => u.team === 'blue' && !u.dead).length;
    const r = state.units.filter((u) => u.team === 'red' && !u.dead).length;
    this.el.scoreBlue.textContent = b;
    this.el.scoreRed.textContent = r;
    const t = Math.floor(state.time);
    this.el.clock.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;

    for (const u of state.units) {
      const card = this.cards?.get(u.uid);
      if (!card) continue;
      const ratio = Math.max(0, u.hp / u.maxHp);
      card.hp.style.width = `${(ratio * 100).toFixed(1)}%`;
      card.el.classList.toggle('dead', u.dead);
      if (u.dead) {
        card.skill.textContent = '전투불능';
        card.skill.classList.remove('ready');
      } else if (u.skillTimer <= 0) {
        card.skill.textContent = `${u.def.skill.icon} 준비`;
        card.skill.classList.add('ready');
      } else {
        card.skill.textContent = `${u.def.skill.icon} ${u.skillTimer.toFixed(1)}s`;
        card.skill.classList.remove('ready');
      }
    }
  }

  setPaused(paused) {
    this.el.pause.textContent = paused ? '▶' : '⏸';
    this.el.pause.classList.toggle('warn', paused);
    this.el.state.textContent = paused ? '일시정지' : '전투 중';
  }

  setSpeed(speed) {
    this.el.speed.textContent = `${speed}×`;
    this.el.speed.classList.toggle('on', speed > 1);
  }

  setFollow(on) {
    this.el.follow.classList.toggle('on', on);
  }

  setSound(on) {
    this.el.sound.textContent = on ? '🔊' : '🔇';
    this.el.sound.classList.toggle('off', !on);
  }

  showBattleUI() {
    this.el.hud.classList.remove('hidden');
    this.el.strip.classList.remove('hidden');
  }

  hideBattleUI() {
    this.el.hud.classList.add('hidden');
    this.el.strip.classList.add('hidden');
    this.el.log.classList.add('hidden');
    this.logCount = 0;
    this.el.logList.innerHTML = '';
  }

  toggleLog(force) {
    const show = force == null ? this.el.log.classList.contains('hidden') : force;
    this.el.log.classList.toggle('hidden', !show);
    this.el.logBtn.classList.toggle('on', show);
  }

  pushLog(entry) {
    const li = document.createElement('li');
    li.className = entry.kind || '';
    const t = Math.floor(entry.t || 0);
    li.innerHTML = `<time>${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}</time><span>${entry.text}</span>`;
    this.el.logList.appendChild(li);
    this.logCount++;
    while (this.el.logList.children.length > 40) this.el.logList.firstElementChild.remove();
    this.el.logList.scrollTop = this.el.logList.scrollHeight;
  }

  /* ───────────── 결과 ───────────── */

  showBanner(summary, mvp) {
    const win = summary.winner;
    this.el.bannerCrown.textContent = win === 'draw' ? '⚖️' : '👑';
    this.el.bannerTitle.textContent = win === 'draw'
      ? '무승부!'
      : `${win === 'blue' ? '🔵 블루' : '🔴 레드'} 팀 승리!`;
    const secs = summary.time;
    this.el.bannerSub.textContent = summary.reason === 'timeout'
      ? `시간 종료 · 남은 체력으로 판정 (${secs.toFixed(1)}초)`
      : `${secs.toFixed(1)}초 만에 전투 종료`;
    this.el.bannerMvp.innerHTML = mvp
      ? `<div class="mvp-row"><span>${mvp.emoji}</span><span>${mvp.name}</span><span style="color:var(--gold);font-size:10px">MVP</span></div>
         <div class="mvp-stats">피해 ${Math.round(mvp.dmgDealt)} · 처치 ${mvp.kills} · 필살기 ${mvp.skillCasts}회</div>`
      : '';
    this.el.banner.classList.remove('hidden');
  }

  hideBanner() { this.el.banner.classList.add('hidden'); }

  toast(msg) {
    const t = this.el.toast;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.classList.remove('show'), 1700);
  }

  hideLoader() {
    this.el.loader.classList.add('gone');
    setTimeout(() => this.el.loader.classList.add('hidden'), 520);
  }
}
