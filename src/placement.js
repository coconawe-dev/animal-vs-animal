// 배치 모델 — 샌드박스에서 탭한 지점에 유닛을 놓고, 지우고, 되돌리고, 대칭 복사한다.
// 순수 로직(THREE/DOM 비의존)이라 브라우저와 노드 테스트가 같은 함수를 쓴다.

import { CREATURE_BY_ID, TUNING, WEAPON_BY_ID } from './config.js';

export const SIDE_GAP = 1.0;         // 중앙 구분선 여백
const MIN_GAP = 1.25;                // 같은 편 유닛끼리 최소 간격

export const clampArena = (x, z) => {
  const r = Math.hypot(x, z);
  const max = TUNING.ARENA_RADIUS - 0.8;
  if (r <= max || r === 0) return { x, z };
  return { x: (x / r) * max, z: (z / r) * max };
};

// 진영 규칙: 블루는 x<0, 레드 x>0. 자유 배치면 어디든.
export function clampSide(team, x, z, free = false) {
  let nx = x;
  if (!free) {
    if (team === 'blue' && nx > -SIDE_GAP) nx = -SIDE_GAP;
    if (team === 'red' && nx < SIDE_GAP) nx = SIDE_GAP;
  }
  return clampArena(nx, z);
}

export function normalizePlacement(p) {
  if (!p) return null;
  if (typeof p === 'string') {
    return CREATURE_BY_ID[p] ? { id: p, x: null, z: null, weapon: 'none' } : null;
  }
  if (!CREATURE_BY_ID[p.id]) return null;
  return {
    id: p.id,
    x: Number.isFinite(p.x) ? p.x : null,
    z: Number.isFinite(p.z) ? p.z : null,
    weapon: WEAPON_BY_ID[p.weapon] ? p.weapon : 'none',
    rot: Number.isFinite(p.rot) ? p.rot : null,
  };
}

// 자동 진형 (x/z 가 없는 배치를 진영에 흩어 놓는다)
export function autoPositions(list, team) {
  const sx = team === 'blue' ? -1 : 1;
  return list.map((p, i) => {
    if (Number.isFinite(p.x) && Number.isFinite(p.z)) return p;
    const col = Math.floor(i / 5);
    const row = i % 5;
    return {
      ...p,
      x: sx * (4.6 + col * 2.5),
      z: (row - 2) * 2.4,
    };
  });
}

// 한 번 탭할 때 여러 마리를 놓기 위한 자리 (×1 · ×3 · ×5)
export function clusterOffsets(count) {
  if (count <= 1) return [[0, 0]];
  const out = [];
  const ring = count === 3 ? 1.7 : 2.05;
  out.push([0, 0]);
  for (let i = 1; i < count; i++) {
    const a = ((i - 1) / (count - 1)) * Math.PI * 2 + Math.PI / 6;
    out.push([Math.cos(a) * ring, Math.sin(a) * ring]);
  }
  return out;
}

function tooClose(list, x, z, gap = MIN_GAP) {
  for (const p of list) {
    if (Number.isFinite(p.x) && Math.hypot(p.x - x, p.z - z) < gap) return true;
  }
  return false;
}

/**
 * 유닛을 배치한다. (배열을 직접 수정하고 추가된 배치 목록을 돌려준다)
 * x/z 는 이미 화면 탭 지점에서 계산된 좌표.
 */
export function placeUnits(list, {
  id, team = 'blue', x, z, weapon = 'none', count = 1, free = false, limit = TUNING.MAX_UNITS_PER_TEAM,
}) {
  const def = CREATURE_BY_ID[id];
  if (!def) return { added: [], skipped: 'unknown' };
  const added = [];
  let skipped = null;
  const offsets = clusterOffsets(Math.max(1, Math.min(5, count | 0)));
  for (const [ox, oz] of offsets) {
    if (list.length >= limit) { skipped = 'limit'; break; }
    let px = x + ox;
    let pz = z + oz;
    const c = clampSide(team, px, pz, free);
    px = c.x; pz = c.z;
    // 너무 겹치면 살짝 밀어낸다
    let tries = 0;
    while (tooClose(list, px, pz) && tries < 8) {
      const a = tries * 2.399;
      px = c.x + Math.cos(a) * (MIN_GAP + 0.35 * tries);
      pz = c.z + Math.sin(a) * (MIN_GAP + 0.35 * tries);
      const c2 = clampSide(team, px, pz, free);
      px = c2.x; pz = c2.z;
      tries++;
    }
    const p = { id, x: px, z: pz, weapon: WEAPON_BY_ID[weapon] ? weapon : 'none' };
    list.push(p);
    added.push(p);
  }
  return { added, skipped };
}

export function nearestIndex(list, x, z, radius = 1.9) {
  let best = -1;
  let bestD = radius;
  list.forEach((p, i) => {
    if (!Number.isFinite(p.x)) return;
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}

export function removeNearest(list, x, z, radius = 1.9) {
  const i = nearestIndex(list, x, z, radius);
  if (i < 0) return null;
  return list.splice(i, 1)[0];
}

// 좌우 대칭 복사 — from 팀의 배치를 반대편에 x 축을 뒤집어 복제
export function mirrorTeam(fromList, toTeamTag) {
  return fromList.map((p) => ({
    ...p,
    x: -(p.x || 0),
    z: p.z || 0,
  })).filter((p) => !toTeamTag || true);
}

// 저장/불러오기용 정리
export function sanitizeList(list, limit = TUNING.MAX_UNITS_PER_TEAM) {
  if (!Array.isArray(list)) return [];
  return list
    .map(normalizePlacement)
    .filter(Boolean)
    .slice(0, limit);
}

export function countByCreature(list) {
  const out = {};
  for (const p of list) out[p.id] = (out[p.id] || 0) + 1;
  return out;
}
