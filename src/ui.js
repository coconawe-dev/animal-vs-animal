// 동물 vs 동물 — ARBS 스타일 DOM UI (배치 도구 · 유닛 바 · 챌린지 · 전투 HUD)
import {
  CREATURE_BY_ID, CATEGORIES, WEAPONS, WEAPON_BY_ID, PLACEABLES,
  ARENAS, PRESETS, CHALLENGES, TUNING, animalTierStars, placementCost,
  PARTY, TEAM_ORDER, teamDef, partyTeams, SANS_PHASES, isVariant, phaseIdsOf, variantOptionsOf,
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
      phaseRow: $('#phase-row'),
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
      // 파티 멀티
      partyPanel: $('#party-panel'), partySetup: $('#party-setup'), partyRoom: $('#party-room'),
      partyNick: $('#party-nick'), partyCodeInput: $('#party-code'),
      partyHost: $('#btn-party-host'), partyJoin: $('#btn-party-join'),
      partyClose: $('#btn-party-close'), partyStatus: $('#party-status'),
      partyRoomCode: $('#party-room-code'), partyRoster: $('#party-roster'),
      partyCopy: $('#btn-party-copy'), partyLeave: $('#btn-party-leave'),
      partyReady: $('#btn-party-ready'), partyStart: $('#btn-party-start'),
      partyRoomStatus: $('#party-room-status'),
      scoreBar: $('#score-bar'), hpRow: $('#team-hp-row'),
      partyFab: $('#party-fab'),
      unitAction: $('#unit-action'), unitActionName: $('#unit-action-name'),
      possessBtn: $('#btn-possess'),
      possessHud: $('#possess-hud'), releasePossess: $('#btn-release-possess'),
      possessAttack: $('#btn-possess-attack'), possessSkill: $('#btn-possess-skill'),
      possessSkillCd: $('#possess-skill-cd'), joyZone: $('#joy-zone'), joyKnob: $('#joy-knob'),
    };
    this._hud = { score: {}, hp: {} };
    this._switchSig = '';
    this._hudSig = '';;
    this._cacheHudRefs();

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
    // 샌즈 1·2·3페이즈 · 원소 골렘 5원소는 카드 하나로 묶고, 고르면 아래에 선택 버튼이 열린다
    this.el.unitBar.innerHTML = PLACEABLES.filter((a) => !isVariant(a)).map((a) => {
      const color = '#' + a.colors.main.toString(16).padStart(6, '0');
      const opts = variantOptionsOf(a);
      const badge = a.badge || (opts ? '1·2·3' : '');
      return `<button class="ucard${a.isStructure ? ' item' : ''}" data-id="${a.id}" data-cat="${a.cat}" style="--accent:${color}" aria-label="${a.name}">
        <span class="u-cost">${a.cost}</span>
        ${badge ? `<span class="u-phases">${badge}</span>` : ''}
        ${a.isStructure ? '<span class="u-item">고정</span>' : ''}
        <span class="u-emoji">${a.emoji}</span>
        <span class="u-name">${shortName(a)}</span>
        <span class="u-stars">${animalTierStars(a.tier)}</span>
      </button>`;
    }).join('');
  }

  // 선택된 유닛이 샌즈/원소 골렘이면 변종 선택 버튼을 보여 준다
  renderPhaseRow() {
    const row = this.el.phaseRow;
    if (!row) return;
    const a = this.app;
    const def = CREATURE_BY_ID[a.selected];
    const opts = variantOptionsOf(def);
    if (!opts) {
      if (this._phaseSig !== '') { this._phaseSig = ''; row.innerHTML = ''; }
      row.classList.add('hidden');
      return;
    }
    if (this._phaseSig !== (def.variantOf || def.id)) {
      this._phaseSig = def.variantOf || def.id;
      row.innerHTML = opts.map((p) => (
        `<button class="pchip" data-phase="${p.id}" title="${p.note}"${p.color ? ` style="--pcolor:${p.color}"` : ''}>`
        + `<b>${p.emoji ? p.emoji + ' ' : ''}${p.label}</b><i>${p.cost}</i><small>${p.note}</small></button>`
      )).join('');
    }
    row.classList.remove('hidden');
    $$('#phase-row .pchip').forEach((b) => b.classList.toggle('on', b.dataset.phase === a.selected));
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
      const cardDef = CREATURE_BY_ID[card.dataset.id];
      const opts = variantOptionsOf(cardDef);
      // 변종 카드(원소 골렘)는 첫 원소로 바로 선택된다 — 샌즈 카드는 자기 자신이 1페이즈
      this.app.selected = opts ? opts[0].id : card.dataset.id;
      this.app.eraser = false;
      this.render();
      this.hooks.onSelectUnit?.(this.app.selected);
    });

    this.el.catRow.addEventListener('click', (e) => {
      const b = e.target.closest('.cat');
      if (!b) return;
      this.app.activeCat = b.dataset.cat;
      this.render();
    });

    this.el.phaseRow?.addEventListener('click', (e) => {
      const b = e.target.closest('[data-phase]');
      if (!b) return;
      this.app.selected = b.dataset.phase;
      this.app.eraser = false;
      this.render();
      this.hooks.onSelectUnit?.(b.dataset.phase);
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
      if (this.app.mode === 'party' && b.dataset.team !== this.app.activeTeam) {
        this.toast('파티에서는 내 진영에만 배치합니다');
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
      } else if (mode === 'party') {
        this.app.showChallenges = false;
        this.openParty();
        this.render();
      } else {
        this.app.showChallenges = false;
        this.el.challengePanel.classList.add('hidden');
        this.hideParty();
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

    // ── 파티 멀티 ──
    this.el.partyClose.addEventListener('click', () => {
      this.hideParty();
      if (this.app.mode === 'party' && !this.app.partyInRoom) this.hooks.onMode?.('sandbox');
    });
    this.el.partyNick?.addEventListener('input', () => { this.app.partyNick = this.el.partyNick.value; });
    this.el.partyHost.addEventListener('click', () => {
      const nick = (this.el.partyNick?.value || '').trim() || '플레이어';
      this.app.partyNick = nick;
      this.hooks.onPartyHost?.(nick);
    });
    this.el.partyJoin.addEventListener('click', () => {
      const nick = (this.el.partyNick?.value || '').trim() || '플레이어';
      this.app.partyNick = nick;
      this.hooks.onPartyJoin?.(this.el.partyCodeInput.value, nick);
    });
    this.el.partyLeave.addEventListener('click', () => this.hooks.onPartyLeave?.());
    this.el.partyCopy.addEventListener('click', () => this.hooks.onPartyCopy?.());
    this.el.partyReady.addEventListener('click', () => this.hooks.onPartyReady?.());
    this.el.partyStart.addEventListener('click', () => this.hooks.onPartyStart?.());
    this.el.partyFab?.addEventListener('click', () => {
      this.openParty();
      if (this._partyState) this.renderParty(this._partyState);
      this.hooks.onPartyOpen?.();
    });

    $('#btn-help').addEventListener('click', () => this.el.help.classList.remove('hidden'));
    $('#btn-help-close').addEventListener('click', () => this.el.help.classList.add('hidden'));
    this.el.sound.addEventListener('click', () => this.hooks.onToggleSound?.());

    // ── 유닛 직접 조종 ──
    this.el.possessBtn?.addEventListener('click', () => this.hooks.onPossess?.());
    this.el.releasePossess?.addEventListener('click', () => this.hooks.onReleasePossess?.());
    const hold = (btn, fn) => {
      if (!btn) return;
      const on = (e) => { e.preventDefault(); btn.classList.add('held'); fn(true); };
      const off = () => { btn.classList.remove('held'); fn(false); };
      btn.addEventListener('pointerdown', on);
      btn.addEventListener('pointerup', off);
      btn.addEventListener('pointercancel', off);
      btn.addEventListener('pointerleave', off);
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    };
    hold(this.el.possessAttack, (v) => this.hooks.onAttackHold?.(v));
    hold(this.el.possessSkill, (v) => this.hooks.onSkillHold?.(v));
  }

  /* ───────────── HUD 참조 캐시 ───────────── */

  _cacheHudRefs() {
    this.el.clock = $('#battle-clock');
    this.el.state = $('#battle-state');
    this._hud = { score: {}, hp: {} };
    for (const t of TEAM_ORDER) {
      const s = $(`#score-${t}`);
      const h = $(`#hp-${t}`);
      if (s) this._hud.score[t] = s;
      if (h) this._hud.hp[t] = h;
    }
  }

  // 전투 HUD 점수 바를 진영 수에 맞춰 다시 그린다 (2~4팀)
  buildScoreBar(teams) {
    const list = Array.isArray(teams) && teams.length ? teams : ['blue', 'red'];
    const sig = list.join(',');
    if (sig === this._hudSig) { this._cacheHudRefs(); return; }
    this._hudSig = sig;
    const half = Math.ceil(list.length / 2);
    const left = list.slice(0, half);
    const right = list.slice(half);
    const chip = (team, flip) => {
      const def = teamDef(team);
      const dot = '<span class="team-dot"></span>';
      return `<div class="team-score ${team}">${flip ? '' : dot}`
        + `<b id="score-${team}">0</b><small>${def.name}</small>${flip ? dot : ''}</div>`;
    };
    this.el.scoreBar.innerHTML = `<div class="score-side">${left.map((t) => chip(t, false)).join('')}</div>`
      + '<div class="clock-box"><span id="battle-clock">0:00</span><i id="battle-state">전투 중</i></div>'
      + `<div class="score-side">${right.slice().reverse().map((t) => chip(t, true)).join('')}</div>`;
    this.el.scoreBar.classList.toggle('multi', list.length > 2);
    this.el.hpRow.innerHTML = list.map((t) => `<div class="team-hp ${t}"><i id="hp-${t}"></i></div>`).join('');
    this._cacheHudRefs();
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
    const party = a.mode === 'party';

    // 모드
    $$('[data-mode]').forEach((b) => b.classList.toggle('active', b.dataset.mode === a.mode));
    this.el.challengePanel.classList.toggle('hidden', !(a.mode === 'challenge' && a.showChallenges));

    // 진영 스위치 (파티에서는 내 진영 하나만)
    this.renderTeamSwitch();
    $$('[data-team]').forEach((b) => b.classList.toggle('on', b.dataset.team === a.activeTeam));
    if (this.el.countBlue) this.el.countBlue.textContent = teams.blue.length;
    if (this.el.countRed) this.el.countRed.textContent = teams.red.length;
    const teamLine = party
      ? `${partyTeams(a.partyTeamCount || 2).map((t) => `${teamDef(t).emoji}${(teams[t] || []).length}`).join(' · ')}`
      : `🔵 ${teams.blue.length} · 🔴 ${teams.red.length}`;
    const totalUnits = (party ? partyTeams(a.partyTeamCount || 2) : ['blue', 'red'])
      .reduce((s, t) => s + (teams[t] || []).length, 0);
    // 전장 상한: 두 팀 × 팀당 한도 (파티는 참가 인원 수만큼)
    const cap = Math.min(
      TUNING.MAX_UNITS,
      TUNING.MAX_UNITS_PER_TEAM * (party ? partyTeams(a.partyTeamCount || 2).length : 2),
    );
    this.el.dockCount.textContent = `${teamLine} · 팀당 ${TUNING.MAX_UNITS_PER_TEAM} · Σ ${totalUnits}/${cap}`;

    // 수량
    $$('[data-count]').forEach((b) => b.classList.toggle('on', Number(b.dataset.count) === a.count));
    // 무기
    $$('[data-weapon]').forEach((b) => b.classList.toggle('on', b.dataset.weapon === a.weapon));
    // 카테고리
    $$('.cat').forEach((b) => b.classList.toggle('on', b.dataset.cat === a.activeCat));
    const selDef = CREATURE_BY_ID[a.selected];
    const selRoot = selDef ? (selDef.variantOf || selDef.id) : a.selected;
    $$('.ucard').forEach((c) => {
      const show = a.activeCat === 'all' || c.dataset.cat === a.activeCat;
      c.classList.toggle('hide', !show);
      c.classList.toggle('sel', c.dataset.id === a.selected || c.dataset.id === selRoot);
    });
    this.renderPhaseRow();
    // 전장
    $$('[data-arena]').forEach((b) => b.classList.toggle('on', b.dataset.arena === a.arenaId));
    // 도구
    this.el.eraser.classList.toggle('on', !!a.eraser);
    this.el.free.classList.toggle('on', !!a.free);

    // 힌트
    const teamTxt = `${teamDef(a.activeTeam).emoji} ${teamDef(a.activeTeam).name}`;
    if (a.eraser) this.el.hint.textContent = `${teamTxt} 지우개 — 지울 유닛을 탭하세요`;
    else {
      const hd = CREATURE_BY_ID[a.selected];
      const what = hd ? hd.emoji + ' ' + shortName(hd) : '유닛';
      const verb = hd && hd.isStructure ? '설치' : '배치';
      this.el.hint.textContent = `${teamTxt} · ${what} ${a.count > 1 ? `×${a.count}` : ''} — 땅을 탭해 ${verb}`;
    }

    // 예산 (챌린지 · 파티 60)
    if (a.mode === 'challenge' && a.challenge) {
      this.el.budget.classList.remove('hidden');
      this.el.budget.innerHTML = `예산 <b class="${budgetInfo.left < 0 ? 'over' : ''}">${budgetInfo.left}</b> / ${budgetInfo.budget}`;
      this.el.leaveChallenge.classList.remove('hidden');
      this.el.dockTitle.textContent = `${a.challenge.id}. ${a.challenge.name}`;
    } else if (party) {
      this.el.budget.classList.remove('hidden');
      this.el.budget.innerHTML = `🏳️ ${teamDef(a.activeTeam).name} · 예산 <b class="${budgetInfo.left < 0 ? 'over' : ''}">${budgetInfo.left}</b> / ${PARTY.BUDGET}`;
      this.el.leaveChallenge.classList.add('hidden');
      this.el.dockTitle.textContent = `🌐 파티 · ${partyTeams(a.partyTeamCount || 2).length}팀`;
    } else {
      this.el.budget.classList.add('hidden');
      this.el.leaveChallenge.classList.add('hidden');
      this.el.dockTitle.textContent = a.free ? '자유 배치' : '진영 배치';
    }

    // 상세
    const def = CREATURE_BY_ID[a.selected];
    // 아이템(구조물)에는 무기를 달지 않는다 — 무기 줄을 숨긴다
    this.el.weaponRow.closest('.pb-row')?.classList.toggle('hidden', !!def?.isStructure);
    if (def) {
      const w = WEAPON_BY_ID[a.weapon] || WEAPON_BY_ID.none;
      const hp = Math.round(def.hp * (def.isStructure ? 1 : (w.hpMul || 1)));
      const range = Math.max(def.range, def.isStructure ? 0 : (w.range || 0));
      const atkTxt = def.isStructure && !def.atk ? '💚 아군 지원' : `⚔️ ${def.atk}`;
      this.el.detail.innerHTML = `<b>${def.emoji} ${def.name}</b> · ${def.role} · 코스트 ${def.cost}`
        + `<span class="d-stats">❤️ ${hp} · ${atkTxt} · 🎯 ${range} · ${def.skill.icon} ${def.skill.name}</span>`
        + `<span class="d-skill">${def.skill.desc}${a.weapon !== 'none' && !def.isStructure ? ` · <i>${w.emoji} ${w.name}</i>` : ''}</span>`;
    }

    // 시작 버튼 (파티에서는 패널의 준비/시작 버튼을 쓴다)
    const b = teams.blue.length;
    const r = teams.red.length;
    const overBudget = budgetInfo.left < 0;
    const noStage = a.mode === 'challenge' && !a.challenge;
    const ok = b > 0 && r > 0 && !overBudget && !noStage;
    this.el.fight.classList.toggle('hidden', party);
    this.el.fight.disabled = !ok;
    if (party) this.el.fight.textContent = '파티 준비';
    else if (noStage) this.el.fight.textContent = '챌린지 단계를 선택하세요';
    else if (!b || !r) this.el.fight.textContent = '두 팀 모두 유닛을 배치하세요';
    else if (overBudget) this.el.fight.textContent = `예산 초과 · ${-budgetInfo.left} 줄이세요`;
    else this.el.fight.textContent = `⚔️ ${b} vs ${r} 배틀 시작`;

    // 챌린지 목록 갱신
    this.buildChallenges();
  }

  budgetState() {
    const a = this.app;
    if (a.mode === 'party') {
      const used = placementCost(a.teams[a.activeTeam] || []);
      return { budget: PARTY.BUDGET, used, left: PARTY.BUDGET - used };
    }
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

  /* ───────────── 진영 스위치 ───────────── */

  renderTeamSwitch() {
    const a = this.app;
    const party = a.mode === 'party';
    const sig = party ? `party:${a.activeTeam}` : 'duo';
    if (sig !== this._switchSig) {
      this._switchSig = sig;
      if (party) {
        const def = teamDef(a.activeTeam);
        this.el.teamSwitch.innerHTML = `<button data-team="${a.activeTeam}" class="on">`
          + `<span class="dot" style="background:${def.css};box-shadow:0 0 7px ${def.css}"></span>`
          + `내 진영 ${def.name} <b id="count-${a.activeTeam}">0</b></button>`;
      } else {
        this.el.teamSwitch.innerHTML = '<button data-team="blue" class="on"><span class="dot blue"></span>블루 <b id="count-blue">0</b></button>'
          + '<button data-team="red"><span class="dot red"></span>레드 <b id="count-red">0</b></button>';
      }
      this.el.countBlue = $('#count-blue');
      this.el.countRed = $('#count-red');
    }
  }

  /* ───────────── 파티 멀티 패널 ───────────── */

  openParty() {
    this.el.partyPanel.classList.remove('hidden');
    this.updatePartyFab(this._partyState);
    this.el.challengePanel.classList.add('hidden');
    this.el.presetPanel?.classList.add('hidden');
    this.app.showPresets = false;
    if (this.app.partyNick && this.el.partyNick) this.el.partyNick.value = this.app.partyNick;
  }

  // 패널을 닫아도 방에 들어와 있으면 작은 칩으로 남겨 둔다
  hideParty() { this.el.partyPanel.classList.add('hidden'); this.updatePartyFab(this._partyState); }

  updatePartyFab(p) {
    const fab = this.el.partyFab;
    if (!fab) return;
    const inRoom = !!(p && p.roomCode && p.phase && p.phase !== 'idle');
    const open = !this.el.partyPanel.classList.contains('hidden');
    fab.classList.toggle('hidden', !inRoom || open);
    if (!inRoom) return;
    const mine = p.players.find((x) => x.me);
    const label = p.phase === 'battle' || p.phase === 'end' ? '전투 중'
      : p.myReady ? '준비됨' : `배치 ${p.myUsed}/${p.budget}`;
    fab.textContent = `🌐 ${p.roomCode} · ${p.players.length}/${p.maxPlayers} · ${label}`;
    if (mine) fab.style.borderColor = mine.color;
  }

  setPartyStatus(text) {
    if (this.el.partyStatus) this.el.partyStatus.innerHTML = text || '';
    if (this.el.partyRoomStatus) this.el.partyRoomStatus.innerHTML = text || '';
  }

  // p = PartySession.snapshotState()
  // 주의: 이 함수는 상태를 그릴 뿐, 패널을 여닫지 않는다.
  //       (몹을 소환하거나 다른 참가자가 배치할 때마다 창이 다시 펼쳐지던 버그 방지)
  renderParty(p) {
    this._partyState = p;
    this.updatePartyFab(p);           // 접혀 있으면 칩 숫자만 조용히 갱신
    if (!p) return;
    const inRoom = !!p.roomCode && p.phase && p.phase !== 'idle';
    this.el.partySetup.classList.toggle('hidden', inRoom);
    this.el.partyRoom.classList.toggle('hidden', !inRoom);
    if (!inRoom) {
      this.setPartyStatus(p.status || '파티를 열면 초대 링크를 복사해 친구에게 보낼 수 있습니다.');
      return;
    }
    this.el.partyRoomCode.textContent = p.roomCode;
    this.el.partyCopy.classList.toggle('hidden', !p.isHost);

    const rows = [];
    for (const pl of p.players) {
      const def = teamDef(pl.team);
      const label = pl.me ? `${pl.nick} (나)` : pl.nick;
      const tags = `${def.emoji} ${def.name} · 유닛 ${pl.count} · 예산 ${pl.used}/${pl.budget}`;
      const state = pl.stale ? '<span class="pr-state stale">연결 끊김</span>'
        : pl.ready ? '<span class="pr-state ready">준비</span>'
        : '<span class="pr-state wait">배치 중</span>';
      rows.push(`<div class="pr-row ${pl.me ? 'me' : ''} ${pl.stale ? 'is-stale' : ''}" style="--tc:${def.css}">`
        + '<span class="pr-dot"></span>'
        + `<div class="pr-body"><b>${this._esc(label)}${pl.host ? ' 👑' : ''}</b><small>${tags}</small></div>`
        + state + '</div>');
    }
    for (let i = p.players.length; i < p.maxPlayers; i++) {
      rows.push('<div class="pr-empty">친구를 기다리는 중…</div>');
    }
    this.el.partyRoster.innerHTML = rows.join('');

    this.el.partyReady.textContent = p.myReady ? '✅ 준비됨 · 취소' : '✅ 준비 완료';
    this.el.partyReady.classList.toggle('on', !!p.myReady);
    this.el.partyReady.disabled = p.phase === 'battle' || p.phase === 'end';

    this.el.partyStart.classList.toggle('hidden', !p.isHost);
    this.el.partyStart.disabled = !p.canStart;
    this.el.partyStart.textContent = p.canStart
      ? `⚔️ ${p.teamCount}팀 배틀 시작`
      : (p.players.length < 2 ? '친구를 기다리는 중' : '모두 준비되면 시작');

    this.setPartyStatus(p.status || `${p.players.length}/${p.maxPlayers}명 · ${p.teamCount}팀 · 1인당 예산 ${p.budget}`);
    this.updatePartyFab(p);
  }

  _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
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
    this.hideUnitAction();
    this.setPossess(false);
    this.logCount = 0;
    this.el.logList.innerHTML = '';
  }

  buildBattle(state) {
    this.el.logList.innerHTML = '';
    this.logCount = 0;
    const teams = state && state.teams && state.teams.length ? state.teams : ['blue', 'red'];
    this.buildScoreBar(teams);
  }

  updateBattle(state) {
    const teams = state.teams && state.teams.length ? state.teams : ['blue', 'red'];
    this.buildScoreBar(teams);
    const hpPct = (team) => {
      let hp = 0, max = 0;
      for (const u of state.units) {
        if (u.team !== team) continue;
        hp += Math.max(0, u.hp); max += u.maxHp;
      }
      return max ? Math.round((hp / max) * 100) : 0;
    };
    for (const team of teams) {
      const alive = state.units.filter((u) => u.team === team && !u.dead).length;
      const sEl = this._hud.score[team];
      if (sEl && sEl.textContent !== String(alive)) sEl.textContent = alive;
      const hEl = this._hud.hp[team];
      if (hEl) hEl.style.width = `${hpPct(team)}%`;
    }

    const t = Math.floor(state.time);
    const clock = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    if (this.el.clock && this.el.clock.textContent !== clock) this.el.clock.textContent = clock;
  }

  setPaused(paused) {
    this.el.pause.textContent = paused ? '▶' : '⏸';
    this.el.pause.classList.toggle('warn', paused);
    if (this.el.state) this.el.state.textContent = paused ? '일시정지' : '전투 중';
  }

  setSpeed(speed) {
    this.el.speed.textContent = `${speed}×`;
    this.el.speed.classList.toggle('on', speed > 1);
    this.el.slow.classList.toggle('on', speed < 1);
    if (this.el.state) this.el.state.textContent = speed < 1 ? '슬로우 모션' : speed > 1 ? '배속' : '전투 중';
  }

  setFollow(on) { this.el.follow.classList.toggle('on', on); }

  setFocusTag(text) {
    if (!text) { this.el.focusTag.classList.add('hidden'); return; }
    this.el.focusTag.textContent = text;
    this.el.focusTag.classList.remove('hidden');
  }

  /* ───────────── 유닛 직접 조종 ───────────── */

  // 전투 중 유닛을 탭했을 때 뜨는 유닛 추적 바 (🎮 직접 조종 버튼)
  showUnitAction(u) {
    if (!this.el.unitAction || !u) return;
    this.el.unitActionName.textContent = `${u.emoji} ${u.def.short || u.name}`;
    this.el.unitAction.classList.remove('hidden');
    const can = !u.isStructure;
    this.el.possessBtn.classList.toggle('hidden', !can);
    if (!can) this.el.unitActionName.textContent += ' · 조종 불가';
  }

  hideUnitAction() { this.el.unitAction?.classList.add('hidden'); }

  setPossess(on, unit = null) {
    const hud = this.el.possessHud;
    if (!hud) return;
    hud.classList.toggle('hidden', !on);
    this.app.possessing = !!on;
    if (on) {
      this.hideUnitAction();
      if (this.el.possessSkill) this.el.possessSkill.dataset.skill = unit?.def?.skill?.name || '스킬';
    } else if (this.el.possessSkillCd) {
      this.el.possessSkillCd.textContent = '';
    }
    this.updatePossess({ skillCd: 0, attackCd: 0 });
  }

  updatePossess({ skillCd = 0, attackCd = 0 } = {}) {
    if (!this.el.possessSkill) return;
    const cooling = skillCd > 0.05;
    this.el.possessSkill.classList.toggle('cooling', cooling);
    this.el.possessAttack.classList.toggle('cooling', attackCd > 0.05);
    if (this.el.possessSkillCd) {
      this.el.possessSkillCd.textContent = cooling
        ? `${skillCd.toFixed(1)}s`
        : (this.app.possessing ? (this.el.possessSkill.dataset.skill || '준비') : '');
    }
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
      const def = win && win !== 'draw' ? teamDef(win) : null;
      const multi = (summary.teams && summary.teams.length > 2) || !!opts.party;
      this.el.bannerCrown.textContent = win === 'draw' ? '⚖️' : '👑';
      this.el.bannerTitle.textContent = win === 'draw' ? '무승부!'
        : (multi ? `${def.emoji} ${def.name} 팀 최후의 승리!` : `${def.emoji} ${def.name} 팀 승리!`);
      const secs = summary.time;
      this.el.bannerSub.textContent = summary.reason === 'timeout'
        ? `시간 종료 · 남은 체력으로 판정 (${secs.toFixed(1)}초)`
        : `${secs.toFixed(1)}초 만에 전투 종료`;
      $('#btn-rematch').textContent = opts.party ? '🔁 다시 배치' : '🔁 다시 배틀';
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
