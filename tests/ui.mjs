// 편성/전투 UI 배선 검증 (jsdom) — 실제 index.html DOM에 UI 모듈을 붙여 클릭까지 확인한다.
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
const { createBattle } = await import('../src/sim.js');
const { ANIMALS, ANIMAL_BY_ID, PRESETS } = await import('../src/config.js');

let pass = 0;
const fails = [];
const check = (cond, msg) => { if (cond) pass++; else fails.push(msg); };
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const app = {
  teams: { blue: ['lion', 'wolf', 'eagle'], red: ['tiger', 'elephant', 'crocodile'] },
  arenaId: 'savanna', mode: 'team', activeTeam: 'blue',
};
const calls = { start: 0, rebuild: 0, rematch: 0, pause: 0, speed: 0, follow: 0, arena: [] };
const ui = new UI(app, {
  onStart: () => calls.start++,
  onRematch: () => calls.rematch++,
  onRebuild: () => calls.rebuild++,
  onPause: () => calls.pause++,
  onSpeed: () => calls.speed++,
  onFollow: () => calls.follow++,
  onArenaChange: (id) => calls.arena.push(id),
  onTeamsChange: () => {},
});

/* ── 초기 렌더 ── */
check($$('#roster .card').length === ANIMALS.length, `도감 카드 ${ANIMALS.length}장`);
check($('#slots-blue').children.length === 4, '블루 슬롯 4칸');
check($('#slots-red').children.length === 4, '레드 슬롯 4칸');
check($('#count-blue').textContent === '3', '블루 인원 표시');
check($('#power-blue').textContent !== '0', '블루 전투력 계산');
check(!$('#btn-fight').disabled, '양 팀이 있으면 시작 가능');
check($('#btn-fight').textContent.includes('3 vs 3'), '시작 버튼에 인원 표시');
check($$('#roster .card.selected-blue').length === 3, '블루로 선택된 카드 3장');
check($$('#preset-row .chip').length >= 4, '프리셋 칩');
check($$('#arena-row .chip').length === 3, '전장 칩 3개');
check($('#detail').textContent.includes('사자'), '첫 동물 상세 표시');

/* ── 카드 탭: 추가/제거 토글 ── */
const boar = $('.card[data-id="boar"]');
boar.click();
check(app.teams.blue.includes('boar'), '카드 탭 → 블루에 추가');
check(boar.classList.contains('selected-blue'), '추가된 카드 표시');
check($('#count-blue').textContent === '4', '인원 4로 증가');
check($('#slots-blue').querySelectorAll('.slot.filled').length === 4, '슬롯 4칸 채워짐');

// 팀이 가득 찬 상태에서 더 추가하면 토스트만
const foxCard = $('.card[data-id="fox"]');
foxCard.click();
check(!app.teams.blue.includes('fox'), '정원 초과 시 추가 안 됨');
check($('#toast').classList.contains('show'), '정원 초과 토스트');

// 빼기
$('#slots-blue .slot.filled[data-idx="0"]').click();
check(!app.teams.blue.includes('lion'), '슬롯 ✕ 탭 → 제거');

/* ── 레드 팀 탭 전환 후 추가 ── */
$$('.team-btn').find((b) => b.dataset.team === 'red').click();
check(ui.activeTeam === 'red', '레드 팀 활성');
$('.card[data-id="fox"]').click();
check(app.teams.red.includes('fox'), '레드에 여우 추가');
check($('.card[data-id="fox"]').classList.contains('selected-red'), '레드 선택 표시');

/* ── 모드: 1:1 ── */
$$('.mode-chip').find((b) => b.dataset.mode === 'duel').click();
check(app.mode === 'duel', '1:1 모드');
check(app.teams.blue.length <= 1 && app.teams.red.length <= 1, '1:1 모드에서 인원 1로 축소');
check($('#slots-blue').children.length === 1, '1:1 슬롯 1칸');
$('.card[data-id="bear"]').click();
check(app.teams.red[0] === 'bear' && app.teams.red.length === 1, '1:1에서 다른 동물로 교체');

/* ── 프리셋 · 전장 ── */
const skyPreset = PRESETS.find((p) => p.id === 'sky-ground');
$('#preset-row [data-preset="sky-ground"]').click();
check(app.teams.blue.join() === skyPreset.blue.join(), '프리셋 블루 팀 적용');
check(app.teams.red.join() === skyPreset.red.join(), '프리셋 레드 팀 적용');
check(app.arenaId === skyPreset.arena, '프리셋 전장 적용');
check(calls.arena.includes(skyPreset.arena), '전장 변경 콜백');
$('#arena-row [data-arena="tundra"]').click();
check(app.arenaId === 'tundra', '전장 탭 변경');

/* ── 빈 팀 → 시작 불가 ── */
app.teams.red = [];
ui.render();
check($('#btn-fight').disabled, '레드가 비면 시작 불가');
check($('#btn-fight').textContent.includes('골라'), '안내 문구로 교체');

/* ── 랜덤 매치 ── */
$('#btn-random').click();
check(app.teams.blue.length >= 1 && app.teams.red.length >= 1, '랜덤 매치 양 팀 채움');
check($$('#arena-row .chip.active').length === 1, '전장 하나만 활성');

/* ── 시작 버튼 콜백 ── */
$('#btn-fight').click();
check(calls.start === 1, '배틀 시작 콜백');

/* ── 전투 HUD ── */
const battle = createBattle({ blue: app.teams.blue, red: app.teams.red, arenaId: app.arenaId, seed: 3 });
ui.showBattleUI();
ui.buildStrips(battle);
check(!$('#battle-hud').classList.contains('hidden'), 'HUD 표시');
check($('#strip-blue').children.length === app.teams.blue.length, '블루 스트립 카드 수');
check($('#strip-red').children.length === app.teams.red.length, '레드 스트립 카드 수');
battle.units[0].hp = battle.units[0].maxHp * 0.5;
ui.updateBattle(battle);
const fill = $('#strip-blue .hp-fill');
check(fill.style.width.startsWith('50'), 'HP 바 절반 표시');
check($('#score-blue').textContent === String(battle.units.filter((u) => u.team === 'blue').length), '점수 표시');
check($('#battle-clock').textContent === '0:00', '시계 표시');
ui.setSpeed(2);
check($('#btn-speed').textContent === '2×', '배속 표시');
ui.setPaused(true);
check($('#btn-pause').textContent === '▶', '일시정지 아이콘');
ui.pushLog({ t: 12.4, text: '🦁 사자 「포효 충격파」', kind: 'skill' });
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
check($('#banner-title').textContent.includes('블루'), '승리 팀 문구');
check($('#banner-mvp').textContent.includes(mvp.name), 'MVP 표시');
$('#btn-rematch').click();
$('#btn-back').click();
check(calls.rematch === 1 && calls.rebuild === 1, '배너 버튼 콜백');
ui.hideBanner();
check($('#banner').classList.contains('hidden'), '배너 닫힘');

ui.setSound(false);
check($('#btn-sound').textContent === '🔇', '음소거 아이콘');

/* ── 도움말 · 로더 ── */
$('#btn-help').click();
check(!$('#help').classList.contains('hidden'), '도움말 열림');
$('#btn-help-close').click();
check($('#help').classList.contains('hidden'), '도움말 닫힘');
ui.hideLoader();
check($('#loader').classList.contains('gone'), '로더 사라짐');

/* ── 편성 열고 닫기 ── */
ui.hideBuilder();
check($('#builder').classList.contains('closed'), '편성 닫힘');
ui.showBuilder();
check(!$('#builder').classList.contains('closed'), '편성 열림');

/* ── 모든 동물 상세 표시 ── */
for (const a of ANIMALS) ui.showDetail(a);
check($('#detail').textContent.includes('필살기') || $('#detail').textContent.includes('🦴'), '상세 표시');

console.log(`\nUI 검사 — PASS ${pass} · FAIL ${fails.length}`);
if (fails.length) {
  fails.forEach((f) => console.log(' - ' + f));
  process.exit(1);
}
console.log('✅ UI 배선 정상');
