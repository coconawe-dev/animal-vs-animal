// 동물 vs 동물 — ARBS 스타일 DOM UI (배치 도구 · 유닛 바 · 챌린지 · 전투 HUD)
import {
  CREATURES, CREATURE_BY_ID, CATEGORIES, WEAPONS, WEAPON_BY_ID,
  ARENAS, PRESETS, CHALLENGES, TUNING, animalTierStars, placementCost,
} from './config.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const shortName = (def) => def.short || def.name;

export class UI {
  constructor(app, hooks = {}) {
    this.app = app;
    this.hooks = hooks;
    this.logCount = 0;
    this.bannerNext = null;

    this.el = {
      topbar: $('#topbar'),
      placeBar: $('#place-bar'),
      dock: $('#dock'),
      teamSwitch: $('#team-switch'),
      countBlue: $('#count-blue'), countRed: $('#count-red'),
      weaponRow: $('#weapon-row'), countRow: $('#count-row'),
      eraser: $('#btn-eraser'), undo: $('#btn-undo'), mirror: $('#btn-mirror'),
      clear: $('#btn-clear'), free: $('#btn-free'),
      hint: $('#place-hint'), budget: $('#budget'),
      leaveChallenge: $('#btn-leave-challenge'),
      catRow: $('#cat-row'), unitBar: $('#unit-bar'), detail: $('#detail-line'),
      modeTabs: $('#mode-tabs'), random: $('#btn-random'),
      dockCount: $('#dock-count'), dockTitle: $('#dock-title'), fight: $('#btn-fight'),
      challengePanel: $('#challenge-panel'), challengeList: $('#challenge-list'),
      challengeClose: $('#btn-challenge-close'),
      presetPanel: $('#preset-panel'), presetList: $('#preset-list'),
      presetClose: $('#btn-preset-close'), arenaRow: $('#arena-row'),
      hud: $('#battle-hud'), scoreBlue: $('#score-blue'), scoreRed: $('#score-red'),
      clock: $('#battle-clock'), state: $('#battle-state'),
      hpBlue: $('#hp-blue'), hpRed: $('#hp-red'),
      pause: $('#btn-pause'), speed: $('#btn-speed'), slow: $('#btn-slow'),
      follow: $('#btn-follow'), logBtn: $('#btn-log'), rebuild: $('#btn-rebuild'),
      focusTag: $('#focus-tag'),
      log: $('#battle-log'), logList: $('#log-list'),
      banner: $('#banner'), bannerTitle: $('#banner-title'), bannerSub: $('#banner-sub'),
      bannerMvp: $('#banner-mvp'), bannerCrown: $('#banner-crown'),
      bannerActions: $('.banner-actions'),
      toast: $('#toast'), help: $('#help'), loader: $('#loader'), sound: $('#btn-sound'),
    };

    this.buildCategories();
    this.buildUnitBar();
    this.buildWeapons();
    this.buildChallenges();
    this.buildPresets();
    this.buildArenas();
    this.bind();
    this.render();
  }

  /* ───────────── 배치 도구 ───────────── */

  buildCategories() {
    this.el.catRow.innerHTML = CATEGORIES.map((c) => (
      `<button class="cat" data-cat="${c.id}">${c.emoji} ${c.name}</button>`
    )).join('');
  }

  buildUnitBar() {
    this.el.unitBar.innerHTML = CREATURES.map((a) => {
      const color = '#' + a.colors.main.toString(16).padStart(6, '0');
      return `<button class="ucard" data-id="${a.id}" data-cat="${a.cat}" style="--accent:${color}" aria-label="${a.name}">
        <span class="u-cost">${a.cost}</span>
        <span class="u-emoji">${a.emoji}</span>
        <span class="u-name">${shortName(a)}</span>
        <span class="u-stars">${animalTierStars(a.tier)}</span>
      </button>`;
    }).join('');
  }

  buildWeapons() {
    this.el.weaponRow.innerHTML = WEAPONS.map((w) => (
      `<button class="wchip" data-weapon="${w.id}" title="${w.desc}">${w.emoji} ${w.name}</button>`
    )).join('');
  }

  buildChallenges() {
    const maxCleared = this.app.maxCleared || 0;
    this.el.challengeList.innerHTML = CHALLENGES.map((c) => {
      const locked = c.id > maxCleared + 1;
      const cleared = c.id <= maxCleared;
      return `<button class="stage ${locked ? 'locked' : ''} ${cleared ? 'cleared' : ''}" data-stage="${c.id}">
        <span class="st-emoji">${locked ? '🔒' : c.emoji}</span>
        <span class="st-body"><b>${c.id}. ${c.name}</b><small>예산 ${c.budget} · 레드 ${c.red.length}마리</small></span>
        <span class="st-state">${cleared ? '✓' : locked ? '' : '▶'}</span>
      </button>`;
    }).join('');
  }

  buildPresets() {
    if (!this.el.presetList) return;
    this.el.presetList.innerHTML = PRESETS.map((p) => (
      `<button class="stage" data-preset="${p.id}">
        <span class="st-emoji">${p.emoji}</span>
        <span class="st-body"><b>${p.name}</b><small>${p.desc || ''} · 🔵${p.blue.length} 🔴${p.red.length}</small></span>
        <span class="st-state">▶</span>
      </button>`
    )).join('');
  }

  buildArenas() {
    if (!this.el.arenaRow) return;
    this.el.arenaRow.innerHTML = ARENAS.map((a) => (
      `<button class="chip arena" data-arena="${a.id}">${a.emoji} ${a.name}</button>`
    )).join('');
  }

  bind() {
    this.el.unitBar.addEventListener('click', (e) => {
      const card = e.target.closest('.ucard');
      if (!card) return;
      this.app.selected = card.dataset.id;
      this.app.eraser = false;
      this.render();
      this.hooks.onSelectUnit?.(card.dataset.id);
    });

    this.el.catRow.addEventListener('click', (e) => {
      const b = e.target.closest('.cat');
      if (!b) return;
      this.app.activeCat = b.dataset.cat;
      this.render();
    });

    this.el.weaponRow.addEventListener('click', (e) => {
      const b = e.target.closest('.wchip');
      if (!b) return;
      this.app.weapon = b.dataset.weapon;
      this.render();
      this.hooks.onWeapon?.(b.dataset.weapon);
    });

    this.el.countRow.addEventListener('click', (e) => {
      const b = e.target.closest('[data-count]');
      if (!b) return;
      this.app.count = Number(b.dataset.count);
      this.render();
    });

    this.el.teamSwitch.addEventListener('click', (e) => {
      const b = e.target.closest('[data-team]');
      if (!b) return;
      if (this.app.mode === 'challenge' && b.dataset.team !== 'blue') {
        this.toast('챌린지에서는 블루 팀만 배치합니다');
        return;
      }
      this.app.activeTeam = b.dataset.team;
      this.app.eraser = false;
      this.render();
      this.hooks.onTeamChange?.(b.dataset.team);
    });

    this.el.eraser.addEventListener('click', () => {
      this.app.eraser = !this.app.eraser;
      this.render();
    });
    this.el.free.addEventListener('click', () => {
      this.app.free = !this.app.free;
      this.render();
      this.toast(this.app.free ? '자유 배치 켜짐 — 중앙선을 넘어도 됩니다' : '진영 배치로 돌아갑니다');
    });
    this.el.undo.addEventListener('click', () => this.hooks.onUndo?.());
    this.el.clear.addEventListener('click', () => this.hooks.onClear?.(this.app.activeTeam));
    this.el.mirror.addEventListener('click', () => this.hooks.onMirror?.(this.app.activeTeam));

    this.el.presetList?.addEventListener('click', (e) => {
      const b = e.target.closest('[data-preset]');
      if (!b) return;
      this.el.presetPanel.classList.add('hidden');
      this.app.showPresets = false;
      this.hooks.onPreset?.(b.dataset.preset);
    });
    this.el.presetClose?.addEventListener('click', () => {
      this.el.presetPanel.classList.add('hidden');
      this.app.showPresets = false;
    });
    this.el.arenaRow?.addEventListener('click', (e) => {
      const b = e.target.closest('[data-arena]');
      if (!b) return;
      this.hooks.onArena?.(b.dataset.arena);
    });

    this.el.modeTabs.addEventListener('click', (e) => {
      const b = e.target.closest('[data-mode]');
      if (!b) return;
      const mode = b.dataset.mode;
      this.app.mode = mode;
      if (mode === 'challenge') {
        this.app.showChallenges = true;
        this.openChallenges();
      } else {
        this.app.showChallenges = false;
        this.el.challengePanel.classList.add('hidden');
        this.render();
      }
      this.hooks.onMode?.(mode);
    });
    this.el.random.addEventListener('click', () => {
      this.app.showPresets = !this.app.showPresets;
      this.el.presetPanel?.classList.toggle('hidden', !this.app.showPresets);
      this.hooks.onRandom?.();
    });

    this.el.challengeList.addEventListener('click', (e) => {
      const b = e.target.closest('.stage');
      if (!b) return;
      const stage = CHALLENGES.find((c) => c.id === Number(b.dataset.stage));
      if (!stage) return;
      if (b.classList.contains('locked')) { this.toast('🔒 이전 단계를 먼저 클리어하세요'); return; }
      this.hooks.onChallenge?.(stage);
    });
    this.el.challengeClose.addEventListener('click', () => this.closeChallenges());
    this.el.leaveChallenge.addEventListener('click', () => this.hooks.onLeaveChallenge?.());

    this.el.fight.addEventListener('click', () => {
      if (this.el.fight.disabled) return;
      this.hooks.onStart?.();
    });
    $('#btn-rematch').addEventListener('click', () => {
      if (this.bannerNext != null) { this.hooks.onNextStage?.(this.bannerNext); this.bannerNext = null; return; }
      this.hooks.onRematch?.();
    });
    $('#btn-back').addEventListener('click', () => this.hooks.onRebuild?.());

    this.el.pause.addEventListener('click', () => this.hooks.onPause?.());
    this.el.speed.addEventListener('click', () => this.hooks.onSpeed?.());
    this.el.slow.addEventListener('click', () => this.hooks.onSlow?.());
    this.el.follow.addEventListener('click', () => this.hooks.onFollow?.());
    this.el.logBtn.addEventListener('click', () => this.toggleLog());
    $('#btn-log-close').addEventListener('click', () => this.toggleLog(false));
    this.el.rebuild.addEventListener('click', () => this.hooks.onRebuild?.());

    $('#btn-help').addEventListener('click', () => this.el.help.classList.remove('hidden'));
    $('#btn-help-close').addEventListener('click', () => this.el.help.classList.add('hidden'));
    this.el.sound.addEventListener('click', () => this.hooks.onToggleSound?.());
  }

  /* ───────────── 렌더 ───────────── */

  setMode(mode, challenge = null) {
    this.app.mode = mode;
    this.app.challenge = challenge;
    this.render();
  }

  render() {
    const a = this.app;
    const teams = a.teams;
    const budgetInfo = this.budgetState();

    // 모드
    $$('[data-mode]').forEach((b) => b.classList.toggle('active', b.dataset.mode === a.mode));
    this.el.challengePanel.classList.toggle('hidden', !(a.mode === 'challenge' && a.showChallenges));

    // 팀
    $$('[data-team]').forEach((b) => b.classList.toggle('on', b.dataset.team === a.activeTeam));
    this.el.countBlue.textContent = teams.blue.length;
    this.el.countRed.textContent = teams.red.length;
    this.el.dockCount.textContent = `🔵 ${teams.blue.length} · 🔴 ${teams.red.length}`;

    // 수량
    $$('[data-count]').forEach((b) => b.classList.toggle('on', Number(b.dataset.count) === a.count));
    // 무기
    $$('[data-weapon]').forEach((b) => b.classList.toggle('on', b.dataset.weapon === a.weapon));
    // 카테고리
    $$('.cat').forEach((b) => b.classList.toggle('on', b.dataset.cat === a.activeCat));
    $$('.ucard').forEach((c) => {
      const show = a.activeCat === 'all' || c.dataset.cat === a.activeCat;
      c.classList.toggle('hide', !show);
      c.classList.toggle('sel', c.dataset.id === a.selected);
    });
    // 전장
    $$('[data-arena]').forEach((b) => b.classList.toggle('on', b.dataset.arena === a.arenaId));
    // 도구
    this.el.eraser.classList.toggle('on', !!a.eraser);
    this.el.free.classList.toggle('on', !!a.free);

    // 힌트
    const teamTxt = a.activeTeam === 'blue' ? '🔵 블루' : '🔴 레드';
    if (a.eraser) this.el.hint.textContent = `${teamTxt} 지우개 — 지울 유닛을 탭하세요`;
    else {
      const def = CREATURE_BY_ID[a.selected];
      this.el.hint.textContent = `${teamTxt} · ${def ? def.emoji + ' ' + shortName(def) : '유닛'} ${a.count > 1 ? `×${a.count}` : ''} — 땅을 탭해 배치`;
    }

    // 예산 (챌린지)
    if (a.mode === 'challenge' && a.challenge) {
      this.el.budget.classList.remove('hidden');
      this.el.budget.innerHTML = `예산 <b class="${budgetInfo.left < 0 ? 'over' : ''}">${budgetInfo.left}</b> / ${budgetInfo.budget}`;
      this.el.leaveChallenge.classList.remove('hidden');
      this.el.dockTitle.textContent = `${a.challenge.id}. ${a.challenge.name}`;
    } else {
      this.el.budget.classList.add('hidden');
      this.el.leaveChallenge.classList.add('hidden');
      this.el.dockTitle.textContent = a.free ? '자유 배치' : '진영 배치';
    }

    // 상세
    const def = CREATURE_BY_ID[a.selected];
    if (def) {
      const w = WEAPON_BY_ID[a.weapon];
      const hp = Math.round(def.hp * (w.hpMul || 1));
      const range = Math.max(def.range, w.range || 0);
      this.el.detail.innerHTML = `<b>${def.emoji} ${def.name}</b> · ${def.role} · 코스트 ${def.cost}`
        + `<span class="d-stats">❤️ ${hp} · ⚔️ ${def.atk} · 🎯 ${range} · ${def.skill.icon} ${def.skill.name}</span>`
        + `<span class="d-skill">${def.skill.desc}${a.weapon !== 'none' ? ` · <i>${w.emoji} ${w.name}</i>` : ''}</span>`;
    }

    // 시작 버튼
    const b = teams.blue.length;
    const r = teams.red.length;
    const overBudget = budgetInfo.left < 0;
    const noStage = a.mode === 'challenge' && !a.challenge;
    const ok = b > 0 && r > 0 && !overBudget && !noStage;
    this.el.fight.disabled = !ok;
    if (noStage) this.el.fight.textContent = '챌린지 단계를 선택하세요';
    else if (!b || !r) this.el.fight.textContent = '두 팀 모두 유닛을 배치하세요';
    else if (overBudget) this.el.fight.textContent = `예산 초과 · ${-budgetInfo.left} 줄이세요`;
    else this.el.fight.textContent = `⚔️ ${b} vs ${r} 배틀 시작`;

    // 챌린지 목록 갱신
    this.buildChallenges();
  }

  budgetState() {
    const a = this.app;
    if (a.mode === 'challenge' && a.challenge) {
      const budget = a.challenge.budget;
      const used = placementCost(a.teams.blue);
      return { budget, used, left: budget - used };
    }
    return { budget: 0, used: 0, left: 0 };
  }

  setBudgetVisible(v) { this.el.budget.classList.toggle('hidden', !v); }

  openChallenges() {
    this.app.mode = 'challenge';
    this.app.showChallenges = true;
    this.render();
  }

  closeChallenges() {
    this.app.showChallenges = false;
    this.render();
  }

  showBuilder() {
    this.el.placeBar.classList.remove('hidden');
    this.el.dock.classList.remove('closed');
    this.el.topbar.classList.remove('battle');
  }

  hideBuilder() {
    this.el.placeBar.classList.add('hidden');
    this.el.dock.classList.add('closed');
    this.el.topbar.classList.add('battle');
  }

  setTeam(team) { this.app.activeTeam = team; this.render(); }
  setSelected(id) { this.app.selected = id; this.render(); }
  setWeapon(id) { this.app.weapon = id; this.render(); }
  setCount(n) { this.app.count = n; this.render(); }

  /* ───────────── 전투 HUD ───────────── */

  showBattleUI() {
    this.el.hud.classList.remove('hidden');
  }

  hideBattleUI() {
    this.el.hud.classList.add('hidden');
    this.el.log.classList.add('hidden');
    this.el.focusTag.classList.add('hidden');
    this.logCount = 0;
    this.el.logList.innerHTML = '';
  }

  buildBattle() {
    this.el.logList.innerHTML = '';
    this.logCount = 0;
  }

  updateBattle(state) {
    const b = state.units.filter((u) => u.team === 'blue' && !u.dead).length;
    const r = state.units.filter((u) => u.team === 'red' && !u.dead).length;
    if (this.el.scoreBlue.textContent !== String(b)) this.el.scoreBlue.textContent = b;
    if (this.el.scoreRed.textContent !== String(r)) this.el.scoreRed.textContent = r;

    const t = Math.floor(state.time);
    const clock = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    if (this.el.clock.textContent !== clock) this.el.clock.textContent = clock;

    const hpPct = (list) => {
      let hp = 0, max = 0;
      list.forEach((u) => { hp += Math.max(0, u.hp); max += u.maxHp; });
      return max ? Math.round((hp / max) * 100) : 0;
    };
    this.el.hpBlue.style.width = `${hpPct(state.units.filter((u) => u.team === 'blue'))}%`;
    this.el.hpRed.style.width = `${hpPct(state.units.filter((u) => u.team === 'red'))}%`;
  }

  setPaused(paused) {
    this.el.pause.textContent = paused ? '▶' : '⏸';
    this.el.pause.classList.toggle('warn', paused);
    this.el.state.textContent = paused ? '일시정지' : '전투 중';
  }

  setSpeed(speed) {
    this.el.speed.textContent = `${speed}×`;
    this.el.speed.classList.toggle('on', speed > 1);
    this.el.slow.classList.toggle('on', speed < 1);
    this.el.state.textContent = speed < 1 ? '슬로우 모션' : speed > 1 ? '배속' : '전투 중';
  }

  setFollow(on) { this.el.follow.classList.toggle('on', on); }

  setFocusTag(text) {
    if (!text) { this.el.focusTag.classList.add('hidden'); return; }
    this.el.focusTag.textContent = text;
    this.el.focusTag.classList.remove('hidden');
  }

  setSound(on) {
    this.el.sound.textContent = on ? '🔊' : '🔇';
    this.el.sound.classList.toggle('off', !on);
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

  showBanner(summary, mvp, opts = {}) {
    const win = summary.winner;
    const isChallenge = !!opts.challenge;
    this.bannerNext = null;
    if (isChallenge) {
      if (win === 'blue') {
        this.el.bannerCrown.textContent = '🏆';
        this.el.bannerTitle.textContent = `${opts.challenge.id}단계 클리어!`;
        this.el.bannerSub.textContent = opts.hasNext ? '다음 단계가 열렸습니다.' : '모든 챌린지를 클리어했습니다!';
        if (opts.hasNext) {
          this.bannerNext = opts.challenge.id + 1;
          $('#btn-rematch').textContent = '➡️ 다음 스테이지';
        } else {
          $('#btn-rematch').textContent = '🔁 다시 배틀';
        }
      } else {
        this.el.bannerCrown.textContent = '💀';
        this.el.bannerTitle.textContent = win === 'draw' ? '무승부 — 다시 도전!' : '패배…';
        this.el.bannerSub.textContent = '배치와 무기를 바꿔 다시 도전하세요.';
        $('#btn-rematch').textContent = '🔁 다시 도전';
      }
    } else {
      this.el.bannerCrown.textContent = win === 'draw' ? '⚖️' : '👑';
      this.el.bannerTitle.textContent = win === 'draw' ? '무승부!' : `${win === 'blue' ? '🔵 블루' : '🔴 레드'} 팀 승리!`;
      const secs = summary.time;
      this.el.bannerSub.textContent = summary.reason === 'timeout'
        ? `시간 종료 · 남은 체력으로 판정 (${secs.toFixed(1)}초)`
        : `${secs.toFixed(1)}초 만에 전투 종료`;
      $('#btn-rematch').textContent = '🔁 다시 배틀';
    }

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
    this._toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
  }

  hideLoader() {
    this.el.loader.classList.add('gone');
    setTimeout(() => this.el.loader.classList.add('hidden'), 520);
  }
}
