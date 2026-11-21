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
const { CREATURES, WEAPONS, CATEGORIES, PRESETS, CHALLENGES, ARENAS, CREATURE_BY_ID } = await import('../src/config.js');

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
});

/* ── 초기 렌더 ── */
check($$('#unit-bar .ucard').length === CREATURES.length, `유닛 카드 ${CREATURES.length}장`);
check($$('#weapon-row .wchip').length === WEAPONS.length, '무기 칩 5개');
check($$('#cat-row .cat').length === CATEGORIES.length, '카테고리 탭 4개');
check($$('#preset-list [data-preset]').length === PRESETS.length, '프리셋 목록');
check($$('#arena-row [data-arena]').length === ARENAS.length, '전장 칩');
check($$('#challenge-list .stage').length === CHALLENGES.length, '챌린지 6단계');
check($('#count-blue').textContent === '2', '블루 수 표시');
check($('#count-red').textContent === '1', '레드 수 표시');
check($('#dock-count').textContent.includes('2') && $('#dock-count').textContent.includes('1'), '독 인원 표시');
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
check($$('#unit-bar .ucard:not(.hide)').length === 5, '공룡 5종만 표시');
$('#cat-row [data-cat="all"]').click();
check($$('#unit-bar .ucard:not(.hide)').length === CREATURES.length, '전체 표시');

/* ── 무기 / 수량 ── */
$('#weapon-row [data-weapon="rocket"]').click();
check(app.weapon === 'rocket', '로켓 선택');
check($('.wchip[data-weapon="rocket"]').classList.contains('on'), '무기 선택 표시');
check($('#detail-line').textContent.includes('로켓'), '상세에 무기 표시');
$('#count-row [data-count="5"]').click();
check(app.count === 5, '×5 선택');
check($('#place-hint').textContent.includes('×5'), '힌트에 수량');

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

/* ── 챌린지 6단계 표시 ── */
app.maxCleared = 6;
ui.buildChallenges();
check($$('#challenge-list .stage.locked').length === 0, '모두 클리어 시 잠금 없음');
check($$('#challenge-list .stage.cleared').length === 6, '6단계 모두 클리어 표시');

console.log(`\nUI 검사 — PASS ${pass} · FAIL ${fails.length}`);
if (fails.length) {
  fails.slice(0, 40).forEach((f) => console.log(' - ' + f));
  process.exit(1);
}
console.log('✅ UI 배선 정상');
