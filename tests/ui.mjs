// 배치 도구/유닛 바/챌린지/전투 HUD 배선 검증 (jsdom)
// 실행: node tests/ui.mjs   (jsdom 필요: npm i --no-save jsdom)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

let JSDOM;
try {
  ({ JSDOM } = await import('jsdom'));
} catch (e) {
  console.log('SKIP: jsdom 없음 (npm i --no-save jsdom)');
  process.exit(0);
}

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const dom = new JSDOM(html, { url: 'https://example.test/', pretendToBeVisual: true });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Node = dom.window.Node;

const { UI } = await import('../src/ui.js');
const { createBattle, simulate } = await import('../src/sim.js');
const { CREATURES, WEAPONS, CATEGORIES, PRESETS, CHALLENGES, ARENAS, CREATURE_BY_ID, ITEMS, PLACEABLES, PARTY, ELEMENT_GOLEMS } = await import('../src/config.js');

let pass = 0;
const fails = [];
const check = (cond, msg) => { if (cond) pass++; else fails.push(msg); };
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const app = {
  teams: {
    blue: [{ id: 'trex', x: -6, z: 0, weapon: 'none' }, { id: 'raptor', x: -4, z: 2, weapon: 'gatling' }],
    red: [{ id: 'triceratops', x: 6, z: 0, weapon: 'none' }],
  },
  arenaId: 'savanna', mode: 'sandbox', activeTeam: 'blue', activeCat: 'all',
  selected: 'trex', weapon: 'none', count: 1, free: false, eraser: false,
  maxCleared: 2, challenge: null, showChallenges: false,
};
const calls = {
  start: 0, rematch: 0, rebuild: 0, pause: 0, speed: 0, slow: 0, follow: 0,
  undo: 0, clear: [], mirror: [], preset: [], arena: [], mode: [], challenge: [], nextStage: [],
  possess: 0, release: 0, attack: 0, attackOff: 0, skill: 0, skillOff: 0,
};
const ui = new UI(app, {
  onStart: () => calls.start++,
  onRematch: () => calls.rematch++,
  onRebuild: () => calls.rebuild++,
  onPause: () => calls.pause++,
  onSpeed: () => calls.speed++,
  onSlow: () => calls.slow++,
  onFollow: () => calls.follow++,
  onUndo: () => calls.undo++,
  onClear: (t) => calls.clear.push(t),
  onMirror: (t) => calls.mirror.push(t),
  onPreset: (id) => calls.preset.push(id),
  onArena: (id) => calls.arena.push(id),
  onMode: (m) => calls.mode.push(m),
  onChallenge: (s) => calls.challenge.push(s.id),
  onNextStage: (id) => calls.nextStage.push(id),
  onPossess: () => calls.possess++,
  onReleasePossess: () => calls.release++,
  onAttackHold: (on) => { if (on) calls.attack++; else calls.attackOff++; },
  onSkillHold: (on) => { if (on) calls.skill++; else calls.skillOff++; },
});

const CARDS = PLACEABLES.filter((c) => !c.variantOf).length; // 샌즈 페이즈는 카드 하나 / 아이템 5종 포함

/* ── 초기 렌더 ── */
check($$('#unit-bar .ucard').length === CARDS, `유닛 카드 ${CARDS}장 (샌즈 페이즈 3종은 카드 1장)`);
check($$('#weapon-row .wchip').length === WEAPONS.length, '무기 칩 5개');
check($$('#cat-row .cat').length === CATEGORIES.length, '카테고리 탭 5개 (아이템 포함)');
check($$('#preset-list [data-preset]').length === PRESETS.length, '프리셋 목록');
check($$('#arena-row [data-arena]').length === ARENAS.length, '전장 칩');
check($$('#challenge-list .stage').length === CHALLENGES.length, '챌린지 6단계');
check($('#count-blue').textContent === '2', '블루 수 표시');
check($('#count-red').textContent === '1', '레드 수 표시');
check($('#dock-count').textContent.includes('2') && $('#dock-count').textContent.includes('1'), '독 인원 표시');
check($('#dock-count').textContent.includes('Σ 3/200'), '전장 한도 200 표시');
check($('#dock-count').textContent.includes('팀당 100'), '팀당 100마리 표시');
{
  // 팀당 100마리 가득 채운 화면 표시
  const keepB = app.teams.blue;
  const keepR = app.teams.red;
  app.teams.blue = Array.from({ length: 100 }, (_, i) => ({ id: 'raptor', x: -20 + (i % 10), z: -10 + Math.floor(i / 10), weapon: 'none' }));
  app.teams.red = Array.from({ length: 100 }, (_, i) => ({ id: 'raptor', x: 20 - (i % 10), z: -10 + Math.floor(i / 10), weapon: 'none' }));
  ui.render();
  check($('#dock-count').textContent.includes('🔵 100') && $('#dock-count').textContent.includes('🔴 100'), '양 팀 100마리 표시');
  check($('#dock-count').textContent.includes('Σ 200/200'), '전장 200/200 가득 참 표시');
  check($('#btn-fight').textContent.includes('100 vs 100'), '시작 버튼 100 vs 100');
  app.teams.blue = keepB;
  app.teams.red = keepR;
  ui.render();
}
check(!$('#btn-fight').disabled, '양 팀 있으면 시작 가능');
check($('#btn-fight').textContent.includes('2 vs 1'), '시작 버튼 인원 표시');
check($('#place-hint').textContent.includes('블루'), '배치 힌트');
check($('#place-hint').textContent.includes('티라노'), '선택 유닛 힌트');
check($('#detail-line').textContent.includes('티라노사우루스'), '유닛 상세');
check($('#detail-line').textContent.includes('죽음의 턱'), '필살기 표시');

/* ── 유닛 선택 / 카테고리 ── */
$('.ucard[data-id="raptor"]').click();
check(app.selected === 'raptor', '카드 탭 → 유닛 선택');
check($('.ucard[data-id="raptor"]').classList.contains('sel'), '선택 카드 표시');
$('#cat-row [data-cat="dino"]').click();
check(app.activeCat === 'dino', '공룡 카테고리');
check($$('#unit-bar .ucard:not(.hide)').length === 8, '공룡 8종만 표시');
$('#cat-row [data-cat="all"]').click();
check($$('#unit-bar .ucard:not(.hide)').length === CARDS, '전체 표시');

/* ── 무기 / 수량 ── */
$('#weapon-row [data-weapon="rocket"]').click();
check(app.weapon === 'rocket', '로켓 선택');
check($('.wchip[data-weapon="rocket"]').classList.contains('on'), '무기 선택 표시');
check($('#detail-line').textContent.includes('로켓'), '상세에 무기 표시');
$('#count-row [data-count="5"]').click();
check(app.count === 5, '×5 선택');
check($('#place-hint').textContent.includes('×5'), '힌트에 수량');
$('#count-row [data-count="10"]').click();
check(app.count === 10, '×10 선택');
check($('#count-row [data-count="10"]').classList.contains('on'), '×10 표시');
check($('#place-hint').textContent.includes('×10'), '힌트에 ×10');

/* ── 팀 전환 · 도구 ── */
$('#team-switch [data-team="red"]').click();
check(app.activeTeam === 'red', '레드 팀 전환');
check($('#place-hint').textContent.includes('레드'), '레드 힌트');
$('#btn-eraser').click();
check(app.eraser === true && $('#btn-eraser').classList.contains('on'), '지우개 토글');
$('#btn-undo').click();
check(calls.undo === 1, '되돌리기 콜백');
$('#btn-clear').click();
check(calls.clear.length === 1 && calls.clear[0] === 'red', '팀 비우기 콜백');
$('#btn-mirror').click();
check(calls.mirror.length === 1 && calls.mirror[0] === 'red', '대칭 복사 콜백');
$('#btn-free').click();
check(app.free === true && $('#btn-free').classList.contains('on'), '자유 배치 토글');
$('#btn-free').click();
check(app.free === false, '자유 배치 해제');

/* ── 프리셋 패널 ── */
$('#btn-random').click();
check(!$('#preset-panel').classList.contains('hidden'), '프리셋 패널 열림');
$('#preset-list [data-preset="trex-raptors"]').click();
check(calls.preset[0] === 'trex-raptors', '프리셋 선택 콜백');
check($('#preset-panel').classList.contains('hidden'), '프리셋 패널 닫힘');
$('#btn-preset-close').click();
$('#btn-random').click();
$('#btn-preset-close').click();
check($('#preset-panel').classList.contains('hidden'), '프리셋 닫기 버튼');

/* ── 전장 ── */
$('#arena-row [data-arena="tundra"]').click();
check(calls.arena[0] === 'tundra', '전장 선택 콜백');
app.arenaId = 'tundra';
ui.render();
check($('#arena-row [data-arena="tundra"]').classList.contains('on'), '전장 선택 표시');

/* ── 모드 · 챌린지 ── */
$('#mode-tabs [data-mode="challenge"]').click();
check(calls.mode[0] === 'challenge', '챌린지 모드 콜백');
ui.openChallenges();
check(!$('#challenge-panel').classList.contains('hidden'), '챌린지 패널 열림');
check($$('#challenge-list .stage').length === 6, '챌린지 목록');
check($('#challenge-list .stage[data-stage="4"]').classList.contains('locked'), '4단계 잠김 (maxCleared 2)');
check($('#challenge-list .stage[data-stage="3"]') && !$('#challenge-list .stage[data-stage="3"]').classList.contains('locked'), '3단계는 열림');
check($('#challenge-list .stage[data-stage="2"]').classList.contains('cleared'), '2단계 클리어 표시');
$('#challenge-list .stage[data-stage="4"]').click();
check(calls.challenge.length === 0, '잠긴 단계는 선택 안 됨');
check($('#toast').classList.contains('show'), '잠금 토스트');
$('#challenge-list .stage[data-stage="3"]').click();
check(calls.challenge[0] === 3, '열린 단계 선택');
$('#btn-challenge-close').click();
check($('#challenge-panel').classList.contains('hidden'), '챌린지 패널 닫힘');

/* ── 챌린지 모드 예산 ── */
app.mode = 'challenge';
app.challenge = CHALLENGES[0];
app.teams.blue = [{ id: 'trex', x: -5, z: 0, weapon: 'none' }];
ui.render();
check(!$('#budget').classList.contains('hidden'), '예산 표시');
check($('#budget').textContent.includes('2'), `예산 10 - 8 = 2 (${$('#budget').textContent})`);
check(!$('#btn-fight').disabled, '예산 안이면 시작 가능');
app.teams.blue.push({ id: 'trex', x: -7, z: 2, weapon: 'none' });
ui.render();
check($('#budget').textContent.includes('-6'), '예산 초과 표시');
check($('#btn-fight').disabled, '예산 초과 시 시작 불가');
check($('#btn-fight').textContent.includes('초과'), '예산 초과 안내');
check(!$('#btn-leave-challenge').classList.contains('hidden'), '챌린지 나가기 버튼');
ui.hideBuilder();
check($('#place-bar').classList.contains('hidden'), '배치 바 숨김');
check($('#dock').classList.contains('closed'), '독 숨김');
ui.showBuilder();
check(!$('#place-bar').classList.contains('hidden'), '배치 바 표시');

/* ── 시작 ── */
app.mode = 'sandbox';
app.challenge = null;
app.teams.blue = [{ id: 'trex', x: -6, z: 0, weapon: 'none' }, { id: 'raptor', x: -4, z: 2, weapon: 'gatling' }];
app.teams.red = [{ id: 'triceratops', x: 6, z: 0, weapon: 'none' }];
ui.render();
$('#btn-fight').click();
check(calls.start === 1, '배틀 시작 콜백');

/* ── 전투 HUD ── */
const battle = createBattle({ blue: app.teams.blue, red: app.teams.red, arenaId: 'savanna', seed: 3 });
ui.showBattleUI();
ui.buildBattle(battle);
check(!$('#battle-hud').classList.contains('hidden'), 'HUD 표시');
simulate(battle, 1 / 60, 1.2);
ui.updateBattle(battle);
check($('#score-blue').textContent === String(battle.units.filter((u) => u.team === 'blue' && !u.dead).length), '점수 표시');
check($('#battle-clock').textContent === '0:01', '시계 표시');
check($('#hp-blue').style.width !== '', '팀 HP 바');
ui.setSpeed(2);
check($('#btn-speed').textContent === '2×', '배속 표시');
ui.setSpeed(0.5);
check($('#btn-speed').textContent === '0.5×', '슬로우 표시');
check($('#btn-slow').classList.contains('on'), '슬로우 버튼 활성');
check($('#battle-state').textContent.includes('슬로우'), '슬로우 상태 문구');
ui.setPaused(true);
check($('#btn-pause').textContent === '▶', '일시정지 아이콘');
ui.setPaused(false);
check($('#btn-pause').textContent === '⏸', '재생 아이콘');
ui.setFocusTag('🦁 사자 추적 중');
check(!$('#focus-tag').classList.contains('hidden'), '추적 태그');
ui.setFocusTag(null);
check($('#focus-tag').classList.contains('hidden'), '추적 태그 해제');

$('#btn-pause').click();
$('#btn-speed').click();
$('#btn-slow').click();
$('#btn-follow').click();
check(calls.pause === 1 && calls.speed === 1 && calls.slow === 1 && calls.follow === 1, 'HUD 버튼 콜백');

ui.pushLog({ t: 12.4, text: '🦖 티라노 「죽음의 턱」', kind: 'skill' });
ui.pushLog({ t: 130, text: '🔵 블루 팀 승리!', kind: 'end' });
check($$('#log-list li').length === 2, '전투 기록 2줄');
check($('#log-list').textContent.includes('2:10'), '기록 시간 포맷');
ui.toggleLog(true);
check(!$('#battle-log').classList.contains('hidden'), '기록 패널 열림');
ui.toggleLog(false);
check($('#battle-log').classList.contains('hidden'), '기록 패널 닫힘');

/* ── 결과 배너 ── */
const mvp = battle.units[0];
ui.showBanner({ winner: 'blue', reason: 'elimination', time: 12.3 }, mvp);
check(!$('#banner').classList.contains('hidden'), '배너 표시');
check($('#banner-title').textContent.includes('블루'), '승리 문구');
check($('#banner-mvp').textContent.includes(mvp.name), 'MVP 표시');
$('#btn-rematch').click();
check(calls.rematch === 1, '다시 배틀 콜백');
ui.hideBanner();

// 챌린지 승리 → 다음 스테이지 버튼
ui.showBanner({ winner: 'blue', reason: 'elimination', time: 20 }, mvp, {
  challenge: { id: 2, name: '늑대 무리', budget: 14 }, hasNext: true,
});
check($('#btn-rematch').textContent.includes('다음'), '다음 스테이지 버튼');
$('#btn-rematch').click();
check(calls.nextStage[0] === 3, '다음 스테이지 콜백');
ui.hideBanner();

// 챌린지 패배
ui.showBanner({ winner: 'red', reason: 'elimination', time: 20 }, mvp, {
  challenge: { id: 2 }, hasNext: false,
});
check($('#banner-title').textContent.includes('패배'), '패배 문구');
check($('#btn-rematch').textContent.includes('다시 도전'), '다시 도전 버튼');
$('#btn-back').click();
check(calls.rebuild === 1, '배치 바꾸기 콜백');
ui.hideBanner();

ui.setSound(false);
check($('#btn-sound').textContent === '🔇', '음소거 아이콘');

/* ── 도움말 · 로더 ── */
$('#btn-help').click();
check(!$('#help').classList.contains('hidden'), '도움말 열림');
check($('#help').textContent.includes('ARBS'), '도움말 내용');
$('#btn-help-close').click();
check($('#help').classList.contains('hidden'), '도움말 닫힘');
ui.hideLoader();
check($('#loader').classList.contains('gone'), '로더 사라짐');

/* ── 모든 유닛 상세 표시 ── */
for (const a of CREATURES) {
  ui.setSelected(a.id);
  check($('#detail-line').textContent.includes(a.name), `[${a.id}] 상세 표시`);
}
check(CREATURE_BY_ID.titan.name === '거대 타이탄', '타이탄 데이터');

/* ── 샌즈 1·2·3페이즈 선택 ── */
{
  app.mode = 'sandbox';
  app.challenge = null;
  app.activeCat = 'all';
  app.selected = 'trex';
  ui.render();
  check($('#phase-row').classList.contains('hidden'), '샌즈가 아니면 페이즈 버튼 숨김');

  $('.ucard[data-id="sans"]').click();
  check(app.selected === 'sans', '샌즈 카드 선택');
  check(!$('#phase-row').classList.contains('hidden'), '샌즈를 고르면 페이즈 버튼 표시');
  check($$('#phase-row .pchip').length === 3, '페이즈 버튼 3개');
  check($('#phase-row .pchip[data-phase="sans"]').classList.contains('on'), '1페이즈 선택 표시');
  const phaseText = $('#phase-row').textContent;
  check(phaseText.includes('15') && phaseText.includes('25') && phaseText.includes('50'), `페이즈 코스트 15·25·50 (${phaseText})`);
  check($('.ucard[data-id="sans"] .u-phases') !== null, '샌즈 카드에 페이즈 배지');

  $('#phase-row .pchip[data-phase="sans_p3"]').click();
  check(app.selected === 'sans_p3', '3페이즈 선택');
  check($('.ucard[data-id="sans"]').classList.contains('sel'), '페이즈를 바꿔도 샌즈 카드는 선택 상태');
  check($('#phase-row .pchip[data-phase="sans_p3"]').classList.contains('on'), '3페이즈 버튼 활성');
  check($('#detail-line').textContent.includes('샌즈 3페이즈'), '3페이즈 상세 이름');
  check($('#detail-line').textContent.includes('50'), '3페이즈 코스트 50 표시');

  $('#phase-row .pchip[data-phase="sans_p2"]').click();
  check(app.selected === 'sans_p2' && $('#place-hint').textContent.includes('샌즈 P2'), '2페이즈 선택');

  ui.setSelected('trex');
  check($('#phase-row').classList.contains('hidden'), '다른 유닛을 고르면 페이즈 버튼이 다시 숨는다');
  app.selected = 'trex';
  ui.render();
}

/* ── 원소 골렘 — 카드 1장 + 5원소 선택 ── */
{
  app.mode = 'sandbox';
  app.challenge = null;
  app.activeCat = 'monster';
  app.selected = 'trex';
  ui.render();
  check($$('#unit-bar .ucard:not(.hide)').length === CREATURES.filter((c) => c.cat === 'monster' && !c.variantOf).length + 1, '괴수 탭에 괴수 카드 + 원소 골렘 카드');
  const card = $('.ucard[data-id="golem_elemental"]');
  check(card !== null, '원소 골렘 카드');
  check(card.querySelector('.u-phases').textContent === '5원소', '원소 골렘 카드에 5원소 배지');
  check(card.querySelector('.u-cost').textContent === '5', '원소 골렘 카드 코스트 5');
  check(card.querySelector('.u-emoji').textContent === '🪨', '원소 골렘 카드 이모지');
  check($('#phase-row').classList.contains('hidden'), '평소에는 원소 버튼 숨김');

  card.click();
  check(app.selected === 'golem_fire', '원소 골렘 카드 탭 → 첫 원소(불) 선택');
  check(!$('#phase-row').classList.contains('hidden'), '원소 골렘을 고르면 5원소 버튼 표시');
  check($$('#phase-row .pchip').length === 5, '원소 버튼 5개');
  check($('#phase-row .pchip[data-phase="golem_fire"]').classList.contains('on'), '불 원소 선택 표시');
  const rowText = $('#phase-row').textContent;
  check(['불', '물', '풀', '전기', '얼음'].every((t) => rowText.includes(t)), `5원소 버튼 이름 (${rowText})`);
  check($$('#phase-row .pchip i').every((i) => i.textContent === '5'), '5원소 모두 코스트 5');
  check($('.ucard[data-id="golem_elemental"]').classList.contains('sel'), '원소 골렘 카드는 선택 상태');

  $('#phase-row .pchip[data-phase="golem_ice"]').click();
  check(app.selected === 'golem_ice', '얼음 원소 선택');
  check($('#phase-row .pchip[data-phase="golem_ice"]').classList.contains('on'), '얼음 버튼 활성');
  check($('#detail-line').textContent.includes('얼음 골렘'), '원소 골렘 상세 이름');
  check($('#detail-line').textContent.includes('서리 폭풍'), '원소 골렘 상세 스킬');
  check($('#detail-line').textContent.includes('5'), '원소 골렘 상세 코스트');
  check($('#place-hint').textContent.includes('얼음골렘'), '원소 골렘 배치 힌트');

  $('#phase-row .pchip[data-phase="golem_electric"]').click();
  check(app.selected === 'golem_electric' && $('#detail-line').textContent.includes('전기 골렘'), '전기 원소 선택');

  ui.setSelected('trex');
  check($('#phase-row').classList.contains('hidden'), '원소 골렘을 벗어나면 원소 버튼 숨김');
  app.activeCat = 'all';
  app.selected = 'trex';
  ui.render();
}

/* ── 신규 4종 카드 ── */
for (const id of ['mammoth', 'hydra', 'king_kong', 'hero']) {
  const card = $(`.ucard[data-id="${id}"]`);
  check(card !== null, `[${id}] 유닛 카드`);
  ui.setSelected(id);
  check($('#detail-line').textContent.includes(CREATURE_BY_ID[id].name), `[${id}] 상세 표시`);
}

/* ── 챌린지 6단계 표시 ── */
app.maxCleared = 6;
ui.buildChallenges();
check($$('#challenge-list .stage.locked').length === 0, '모두 클리어 시 잠금 없음');
check($$('#challenge-list .stage.cleared').length === 6, '6단계 모두 클리어 표시');

/* ── 💣 전장 아이템 탭 · 카드 ── */
{
  app.mode = 'sandbox';
  app.challenge = null;
  app.activeCat = 'all';
  ui.render();
  check($$(`#unit-bar .ucard[data-cat="item"]`).length === ITEMS.length, `아이템 카드 ${ITEMS.length}장`);
  check($('#cat-row [data-cat="item"]') !== null, '아이템 카테고리 탭');
  $('#cat-row [data-cat="item"]').click();
  check(app.activeCat === 'item', '아이템 탭 선택');
  check($$('#unit-bar .ucard:not(.hide)').length === ITEMS.length, '아이템 5종만 표시');
  for (const it of ITEMS) {
    const card = $(`.ucard[data-id="${it.id}"]`);
    check(card !== null, `[${it.id}] 아이템 카드`);
    check(card.classList.contains('item'), `[${it.id}] 아이템 카드 표시`);
    check(card.querySelector('.u-item') !== null, `[${it.id}] 고정 배지`);
    ui.setSelected(it.id);
    check($('#detail-line').textContent.includes(it.name), `[${it.id}] 상세 표시`);
    check($('#detail-line').textContent.includes(String(it.cost)), `[${it.id}] 코스트 표시`);
  }
  // 아이템은 무기를 달지 않는다 — 무기 줄 숨김
  check($('#weapon-row').closest('.pb-row').classList.contains('hidden'), '아이템 선택 시 무기 줄 숨김');
  check($('#place-hint').textContent.includes('설치'), `아이템 배치 힌트 (${$('#place-hint').textContent})`);
  // 예산 계산에도 포함된다
  app.mode = 'challenge';
  app.challenge = { id: 1, name: '랠터의 습격', budget: 10 };
  app.teams.blue = [{ id: 'turret', x: -5, z: 0, weapon: 'none' }, { id: 'landmine', x: -3, z: 0, weapon: 'none' }];
  ui.render();
  check($('#budget').textContent.includes('1'), `아이템 예산 10 - 9 = 1 (${$('#budget').textContent})`);
  app.mode = 'sandbox';
  app.challenge = null;
  app.teams.blue = [{ id: 'trex', x: -6, z: 0, weapon: 'none' }, { id: 'raptor', x: -4, z: 2, weapon: 'gatling' }];
  ui.setSelected('trex');
  ui.render();
  check(!$('#weapon-row').closest('.pb-row').classList.contains('hidden'), '유닛을 고르면 무기 줄 다시 표시');
}

/* ── 🎮 유닛 직접 조종 UI ── */
{
  ui.showBattleUI();
  const lionLike = { emoji: '🦁', name: '사자', def: { short: '사자', skill: { name: '포효 충격파' } }, isStructure: false };
  ui.showUnitAction(lionLike);
  check(!$('#unit-action').classList.contains('hidden'), '유닛 탭 → 상태/추적 바 표시');
  check($('#unit-action-name').textContent.includes('사자'), '추적 바에 유닛 이름');
  check(!$('#btn-possess').classList.contains('hidden'), '🎮 직접 조종 버튼 표시');
  $('#btn-possess').click();
  check(calls.possess === 1, '직접 조종 버튼 콜백');

  ui.setPossess(true, lionLike);
  check(!$('#possess-hud').classList.contains('hidden'), '조종 HUD 표시');
  check($('#unit-action').classList.contains('hidden'), '조종 중에는 추적 바 숨김');
  check($('#possess-skill-cd').textContent.includes('포효'), '스킬 버튼에 스킬 이름');
  check($('#joy-zone') !== null && $('#joy-knob') !== null, '가상 조이스틱 표시');

  ui.updatePossess({ skillCd: 2.4, attackCd: 0.1 });
  check($('#possess-skill-cd').textContent.includes('2.4'), '스킬 쿨타임 표시');
  check($('#btn-possess-skill').classList.contains('cooling'), '쿨타임 중 스킬 버튼 비활성 표시');
  check($('#btn-possess-attack').classList.contains('cooling'), '공격 쿨타임 표시');
  ui.updatePossess({ skillCd: 0, attackCd: 0 });
  check($('#possess-skill-cd').textContent.includes('포효'), '쿨타임 종료 후 스킬 이름 표시');
  check(!$('#btn-possess-skill').classList.contains('cooling'), '쿨타임 종료 표시');

  $('#btn-possess-attack').dispatchEvent(new dom.window.Event('pointerdown'));
  check(calls.attack === 1, '공격 버튼 누름');
  $('#btn-possess-attack').dispatchEvent(new dom.window.Event('pointerup'));
  check(calls.attackOff === 1, '공격 버튼 뗌');
  $('#btn-possess-skill').dispatchEvent(new dom.window.Event('pointerdown'));
  check(calls.skill === 1, '스킬 버튼 누름');
  $('#btn-possess-skill').dispatchEvent(new dom.window.Event('pointerup'));
  check(calls.skillOff === 1, '스킬 버튼 뗌');

  $('#btn-release-possess').click();
  check(calls.release === 1, '❌ 조종 해제 콜백');

  // 아이템은 조종할 수 없다
  ui.setPossess(false);
  check($('#possess-hud').classList.contains('hidden'), '조종 해제 시 HUD 숨김');
  ui.showUnitAction({ emoji: '💣', name: '지뢰', def: { short: '지뢰' }, isStructure: true });
  check($('#btn-possess').classList.contains('hidden'), '아이템은 조종 버튼 숨김');
  check($('#unit-action-name').textContent.includes('조종 불가'), '아이템 추적 바에 조종 불가 표시');
  ui.hideUnitAction();
  check($('#unit-action').classList.contains('hidden'), '추적 바 숨김');

  ui.setPossess(true, lionLike);
  ui.hideBattleUI();
  check($('#possess-hud').classList.contains('hidden'), '배치로 돌아가면 조종 HUD 숨김');
  ui.showBattleUI();
  ui.buildBattle(battle);
}

/* ── 파티 멀티 UI ── */
const partyCalls = { host: [], join: [], leave: 0, copy: 0, ready: 0, start: 0, mode: [] };
ui.hooks.onPartyHost = (nick) => partyCalls.host.push(nick);
ui.hooks.onPartyJoin = (code, nick) => partyCalls.join.push([code, nick]);
ui.hooks.onPartyLeave = () => partyCalls.leave++;
ui.hooks.onPartyCopy = () => partyCalls.copy++;
ui.hooks.onPartyReady = () => partyCalls.ready++;
ui.hooks.onPartyStart = () => partyCalls.start++;

$('#mode-tabs [data-mode="party"]').click();
check(app.mode === 'party', '파티 탭 → 파티 모드');
check(!$('#party-panel').classList.contains('hidden'), '파티 패널 열림');
check(!$('#party-setup').classList.contains('hidden'), '방 만들기 화면');
check($('#party-panel').textContent.includes('최대'), '최대 인원 안내');
check($('#party-panel').textContent.includes(String(PARTY.BUDGET)), `1인당 예산 ${PARTY.BUDGET} 안내`);
check($('#btn-fight').classList.contains('hidden'), '파티에서는 하단 배틀 버튼 숨김');

ui.el.partyNick.value = '지우';
$('#btn-party-host').click();
check(partyCalls.host.length === 1 && partyCalls.host[0] === '지우', '파티 열기 콜백 (닉네임)');
ui.el.partyCodeInput.value = 'ab-cd';
$('#btn-party-join').click();
check(partyCalls.join.length === 1 && partyCalls.join[0][0] === 'ab-cd', '참가하기 콜백 (방 코드)');

// 방 안 화면 (4명 · 4팀)
const roster4 = [
  { pid: 'a', nick: '지우', team: 'blue', me: true, host: true, ready: true, count: 6, used: 22, budget: 60 },
  { pid: 'b', nick: '친구2', team: 'red', me: false, host: false, ready: true, count: 5, used: 20, budget: 60 },
  { pid: 'c', nick: '친구3', team: 'green', me: false, host: false, ready: false, count: 3, used: 12, budget: 60 },
  { pid: 'd', nick: '친구4', team: 'gold', me: false, host: false, ready: true, count: 7, used: 30, budget: 60 },
];
const partyState = {
  phase: 'place', roomCode: 'K7QM', isHost: true, teams: ['blue', 'red', 'green', 'gold'], teamCount: 4,
  players: roster4, maxPlayers: 4, budget: 60, canStart: false, myTeam: 'blue', myReady: true,
  myPlaced: 6, myUsed: 22, status: '4/4명 · 4팀 · 1인당 예산 60',
};
ui.renderParty(partyState);
check($('#party-setup').classList.contains('hidden'), '방에 들어가면 만들기 화면 숨김');
check(!$('#party-room').classList.contains('hidden'), '방 화면 표시');
check($('#party-room-code').textContent === 'K7QM', '방 코드 표시');
check($$('#party-roster .pr-row').length === 4, '참가자 4명 표시');
check($('#party-roster').textContent.includes('지우'), '내 닉네임');
check($('#party-roster').textContent.includes('그린') || $('#party-roster').textContent.includes('🟢'), '진영 이름 표시');
check($('#party-roster').textContent.includes('22/60'), '개인 예산 사용량 표시');
check($$('#party-roster .pr-state.ready').length === 3, '준비 인원 표시');
check($$('#party-roster .pr-state.wait').length === 1, '대기 인원 표시');
check($('#party-roster .pr-row.me') !== null, '내 줄 강조');
check(!$('#btn-party-start').classList.contains('hidden'), '방장에게 시작 버튼');
check($('#btn-party-start').disabled, '모두 준비 전에는 시작 불가');
check($('#party-room-status').textContent.includes('4팀'), '상태 줄 표시');
check(!$('#btn-party-copy').classList.contains('hidden'), '방장은 초대 링크 버튼');

ui.renderParty({ ...partyState, canStart: true });
check(!$('#btn-party-start').disabled, '모두 준비되면 시작 가능');
check($('#btn-party-start').textContent.includes('4팀'), '시작 버튼에 팀 수');

// 손님 화면
ui.renderParty({ ...partyState, isHost: false, canStart: true, myTeam: 'green', myReady: false, players: roster4.map((p) => ({ ...p, me: p.pid === 'c' })) });
check($('#btn-party-start').classList.contains('hidden'), '손님에게는 시작 버튼 없음');
check($('#btn-party-copy').classList.contains('hidden'), '손님에게는 초대 링크 버튼 없음');
check($('#btn-party-ready').textContent.includes('준비 완료'), '준비 버튼 문구');

$('#btn-party-ready').click();
$('#btn-party-start').click();
$('#btn-party-copy').click();
$('#btn-party-leave').click();
check(partyCalls.ready === 1 && partyCalls.start === 1 && partyCalls.copy === 1 && partyCalls.leave === 1, '파티 버튼 콜백');

// 2인 방 — 빈 자리 안내
ui.renderParty({
  ...partyState, isHost: true, teams: ['blue', 'red'], teamCount: 2, canStart: false,
  players: roster4.slice(0, 2),
});
check($$('#party-roster .pr-row').length === 2, '2인 방 참가자 2명');
check($$('#party-roster .pr-empty').length === 2, '빈 자리 2개 안내');

// 회귀: × 로 접은 파티 창은 몹 소환/상태 갱신으로 다시 펼쳐지지 않는다
{
  ui.renderParty(partyState);                    // 방 화면 (열린 상태)
  $('#btn-party-close').click();                 // 사용자가 직접 접기
  check($('#party-panel').classList.contains('hidden'), '× 로 파티 창 접힘');
  check(!$('#party-fab').classList.contains('hidden'), '접으면 방 코드 칩이 남음');
  check($('#party-fab').textContent.includes('K7QM'), '칩에 방 코드 표시');
  // 유닛을 소환하면 main 이 renderParty(snapshot) 를 다시 호출한다
  ui.renderParty({ ...partyState, myReady: false });
  ui.renderParty({ ...partyState, myReady: false, myUsed: 26, myPlaced: 7 });
  check($('#party-panel').classList.contains('hidden'), '몹 소환/상태 갱신 후에도 파티 창은 접힌 채');
  check($('#party-fab').textContent.includes('26/60'), '접힌 칩 숫자만 조용히 갱신');
  $('#party-fab').click();                       // 칩을 직접 누르면 다시 펼쳐진다
  check(!$('#party-panel').classList.contains('hidden'), '칩 탭 → 파티 창 다시 펼침');
}

// 파티 배치 도구 — 내 진영 하나만 + 예산 60
app.mode = 'party';
app.activeTeam = 'green';
app.partyTeamCount = 4;
app.teams.blue = [{ id: 'lion', x: -10, z: 0, weapon: 'none' }];
app.teams.red = [];
app.teams.green = [{ id: 'tiger', x: 10, z: 8, weapon: 'none' }, { id: 'bear', x: 12, z: 6, weapon: 'none' }];
app.teams.gold = [];
ui.render();
check($$('#team-switch [data-team]').length === 1, '파티에서는 진영 스위치 하나');
check($('#team-switch [data-team="green"]') !== null, '내 진영(그린) 표시');
check($('#place-hint').textContent.includes('그린'), '배치 힌트에 내 진영');
check(!$('#budget').classList.contains('hidden'), '파티 예산 표시');
check($('#budget').textContent.includes(String(PARTY.BUDGET)), `파티 예산 ${PARTY.BUDGET} 표시`);
check($('#budget').textContent.includes('그린'), '예산 줄에 내 진영');
check($('#dock-count').textContent.includes('Σ 3/200'), '파티 전체 유닛 합계');
check($('#btn-fight').classList.contains('hidden'), '파티에서 하단 시작 버튼 숨김');

// 4팀 전투 HUD
const { createBattle: c4 } = await import('../src/sim.js');
const { partyTeams } = await import('../src/config.js');
const teams4 = partyTeams(4);
const sides4 = {};
for (const t of teams4) sides4[t] = [{ id: 'lion', x: 0, z: 0, weapon: 'none' }, { id: 'fox', x: 2, z: 1, weapon: 'none' }];
const battle4 = c4({ sides: sides4, teams: teams4, arenaId: 'savanna', seed: 4 });
ui.showBattleUI();
ui.buildBattle(battle4);
check($('#score-bar').classList.contains('multi'), '4팀 점수 바 표시');
for (const t of teams4) check($(`#score-${t}`) !== null && $(`#hp-${t}`) !== null, `[${t}] 점수·체력 바`);
ui.updateBattle(battle4);
check($('#score-blue').textContent === '2', '블루 점수');
check($('#score-gold').textContent === '2', '골드 점수');
check($('#hp-green').style.width === '100%', '그린 체력 바');
check($('#battle-clock').textContent === '0:00', '전투 시계');

// 4팀 결과 배너
ui.showBanner({ winner: 'green', reason: 'elimination', time: 31.2, teams: teams4 }, battle4.units[0], { party: true });
check($('#banner-title').textContent.includes('그린'), '4팀 승리 문구');
check($('#btn-rematch').textContent.includes('다시 배치'), '파티 다시 배치 버튼');
ui.hideBanner();
ui.setPaused(true);
ui.setSpeed(2);
check($('#battle-state').textContent === '배속', '점수 바 재구성 후 상태 문구');
ui.setSpeed(1);
ui.setPaused(false);

// 3팀 HUD · 파티 화면 표시 (3명 입장 시 모두 3팀으로 보는지)
const teams3 = partyTeams(3);
{
  const battle3 = c4({ sides: { blue: [{ id: 'lion', x: -8, z: 0, weapon: 'none' }], red: [{ id: 'lion', x: 8, z: 6, weapon: 'none' }], green: [{ id: 'lion', x: 8, z: -6, weapon: 'none' }] }, teams: teams3, arenaId: 'savanna', seed: 9 });
  ui.showBattleUI();
  ui.buildBattle(battle3);
  check($('#score-bar').classList.contains('multi'), '3팀 점수 바 표시');
  check($$('#score-bar .team-score').length === 3, '점수 바 칩 3개 (블루·레드·그린)');
  check($$('#team-hp-row .team-hp').length === 3, '체력 바 3개');
  for (const t of teams3) check($(`#score-${t}`) !== null && $(`#hp-${t}`) !== null, `[${t}] 3팀 점수·체력 바`);
  ui.updateBattle(battle3);
  check($('#score-green').textContent === '1', '그린 점수');

  // 파티 배치 화면도 3팀 표시 (app.partyTeamCount = 3)
  app.partyTeamCount = 3;
  app.mode = 'party';
  app.activeTeam = 'green';
  app.teams.green = [{ id: 'lion', x: 10, z: -8, weapon: 'none' }];
  ui.render();
  check($('#dock-title').textContent.includes('3팀'), '하단 타이틀에 3팀');
  check($('#dock-count').textContent.includes('🟢'), '하단 인원 줄에 그린 표시');

  // 파티 패널 3인 상태 — roster가 3명이면 teamCount도 3으로 그려진다
  const roster3 = [
    { pid: 'a', nick: '지우', team: 'blue', me: true, host: true, ready: true, count: 2, used: 8, budget: 60 },
    { pid: 'b', nick: '친구2', team: 'red', me: false, host: false, ready: true, count: 2, used: 8, budget: 60 },
    { pid: 'c', nick: '친구3', team: 'green', me: false, host: false, ready: false, count: 1, used: 4, budget: 60 },
  ];
  ui.renderParty({
    phase: 'place', roomCode: '3TMP', isHost: true, teams: teams3, teamCount: 3,
    players: roster3, maxPlayers: 4, budget: 60, canStart: false, myTeam: 'blue', myReady: true,
    myPlaced: 2, myUsed: 8, status: '3/4명 · 3팀',
  });
  check($$('#party-roster .pr-row').length === 3, '3인 방 참가자 3명 표시');
  check($('#party-room-status').textContent.includes('3팀'), '3인 방 상태 줄에 3팀');
  ui.hideParty();

  app.mode = 'sandbox';
  app.activeTeam = 'blue';
  app.partyTeamCount = 2;
  app.teams.green = [];
  ui.render();
}

// 2팀으로 돌아오기
app.mode = 'sandbox';
app.activeTeam = 'blue';
ui.render();
check($$('#team-switch [data-team]').length === 2, '샌드박스에서는 블루/레드 스위치');
check($('#budget').classList.contains('hidden'), '샌드박스에서는 예산 숨김');
check(!$('#btn-fight').classList.contains('hidden'), '샌드박스에서는 배틀 버튼 표시');
ui.buildBattle(battle);
check(!$('#score-bar').classList.contains('multi'), '2팀 점수 바');

console.log(`\nUI 검사 — PASS ${pass} · FAIL ${fails.length}`);
if (fails.length) {
  fails.slice(0, 40).forEach((f) => console.log(' - ' + f));
  process.exit(1);
}
console.log('✅ UI 배선 정상');
