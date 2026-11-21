// 배치 모델 — 샌드박스에서 탭한 지점에 유닛을 놓고, 지우고, 되돌리고, 대칭 복사한다.
// 순수 로직(THREE/DOM 비의존)이라 브라우저와 노드 테스트가 같은 함수를 쓴다.
// 파티 모드(2~4팀)에서는 각자 자기 진영 부채꼴 안에만 놓을 수 있다.

import { CREATURE_BY_ID, TUNING, WEAPON_BY_ID, clampToSector, sectorBounds } from './config.js';

export const SIDE_GAP = 1.0;         // 중앙 구분선 여백
const MIN_GAP = 1.25;                // 같은 편 유닛끼리 최소 간격

export const clampArena = (x, z) => {
  const r = Math.hypot(x, z);
  const max = TUNING.ARENA_RADIUS - 0.8;
  if (r <= max || r === 0) return { x, z };
  return { x: (x / r) * max, z: (z / r) * max };
};

// 배치에 참여하는 진영 목록 (기본 샌드박스 = 블루·레드)
export function teamList(teams) {
  return Array.isArray(teams) && teams.length ? teams : ['blue', 'red'];
}

// 진영 규칙:
//  · 2팀(샌드박스·챌린지) → 블루는 x<0, 레드 x>0 (기존과 동일)
//  · 3·4팀(파티) → 각 진영의 부채꼴 안 (sectorBounds)
export function clampSide(team, x, z, free = false, teams = null) {
  const list = teamList(teams);
  if (free) return clampArena(x, z);
  if (list.length <= 2) {
    let nx = x;
    if (team === 'blue' && nx > -SIDE_GAP) nx = -SIDE_GAP;
    if (team === 'red' && nx < SIDE_GAP) nx = SIDE_GAP;
    return clampArena(nx, z);
  }
  const c = clampToSector(list, team, x, z);
  return clampArena(c.x, c.z);
}

// 좌표가 자기 진영 안인지
export function insideSide(team, x, z, teams = null, margin = 0.4) {
  const list = teamList(teams);
  if (list.length <= 2) {
    if (team === 'blue') return x <= -SIDE_GAP + margin;
    if (team === 'red') return x >= SIDE_GAP - margin;
    return true;
  }
  const c = clampToSector(list, team, x, z);
  return Math.hypot(c.x - x, c.z - z) < margin;
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
export function autoPositions(list, team, teams = null) {
  const list2 = teamList(teams);
  const b = sectorBounds(list2, team);
  const dirX = Math.sin(b.center);
  const dirZ = Math.cos(b.center);
  return list.map((p, i) => {
    if (Number.isFinite(p.x) && Number.isFinite(p.z)) return p;
    const col = Math.floor(i / 5);
    const row = i % 5;
    if (list2.length <= 2) {
      const sx = team === 'blue' ? -1 : 1;
      return { ...p, x: sx * (4.6 + col * 2.5), z: (row - 2) * 2.4 };
    }
    // 부채꼴: 중심 방향에서 좌우로 흩뿌린다
    const d = 6 + col * 3.4;
    const spread = (row - 2) * 2.6;
    return {
      ...p,
      x: dirX * d + Math.cos(b.center) * spread,
      z: dirZ * d - Math.sin(b.center) * spread,
    };
  });
}

// 한 번 탭할 때 여러 마리를 놓기 위한 자리 (×1 · ×3 · ×5 · ×10)
export function clusterOffsets(count) {
  const n = Math.max(1, count | 0);
  if (n === 1) return [[0, 0]];
  if (n === 2) return [[0, 0], [1.9, 0]];
  if (n === 3) {
    return [[0, 0], ...Array.from({ length: 2 }, (_, i) => {
      const a = Math.PI / 2 + i * Math.PI;
      return [Math.cos(a) * 1.9, Math.sin(a) * 1.9];
    })];
  }
  if (n <= 5) {
    return [[0, 0], ...Array.from({ length: n - 1 }, (_, i) => {
      const a = (i / (n - 1)) * Math.PI * 2 + Math.PI / 6;
      return [Math.cos(a) * 2.05, Math.sin(a) * 2.05];
    })];
  }
  // 6마리 이상: 중심 + 고리들
  const out = [[0, 0]];
  let ring = 1;
  while (out.length < n) {
    const cap = ring * 6;
    const take = Math.min(cap, n - out.length);
    const r = 1.9 * ring;
    for (let i = 0; i < take; i++) {
      const a = (i / take) * Math.PI * 2 + ring * 0.45;
      out.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    ring++;
  }
  return out;
}

function tooClose(list, x, z, gap = MIN_GAP) {
  for (const p of list) {
    if (Number.isFinite(p.x) && Math.hypot(p.x - x, p.z - z) < gap) return true;
  }
  return false;
}

// 유닛 코스트 합계 (무기·유닛)
export function costOf(list) {
  return (list || []).reduce((s, p) => s + (CREATURE_BY_ID[p.id]?.cost || 0), 0);
}

// 남은 예산으로 몇 마리까지 놓을 수 있는지
export function affordableCount(list, id, budget) {
  const def = CREATURE_BY_ID[id];
  if (!def || !(budget > 0)) return 0;
  return Math.max(0, Math.floor((budget - costOf(list)) / def.cost));
}

/**
 * 유닛을 배치한다. (배열을 직접 수정하고 추가된 배치 목록을 돌려준다)
 * x/z 는 이미 화면 탭 지점에서 계산된 좌표.
 * teams 를 주면 3·4팀 부채꼴 규칙을 쓴다.
 * budget 을 주면 예산을 넘지 않는 만큼만 놓는다 (over: true 면 거부).
 */
export function placeUnits(list, {
  id, team = 'blue', x, z, weapon = 'none', count = 1, free = false,
  limit = TUNING.MAX_UNITS_PER_TEAM, teams = null, budget = null,
}) {
  const def = CREATURE_BY_ID[id];
  if (!def) return { added: [], skipped: 'unknown' };
  if (budget != null) {
    const left = budget - costOf(list);
    if (def.cost > left) return { added: [], skipped: 'budget', left };
    count = Math.min(count, Math.floor(left / def.cost));
  }
  const added = [];
  let skipped = null;
  const offsets = clusterOffsets(Math.max(1, Math.min(20, count | 0)));
  for (const [ox, oz] of offsets) {
    if (list.length >= limit) { skipped = 'limit'; break; }
    if (budget != null && costOf(list) + def.cost > budget) { skipped = 'budget'; break; }
    let px = x + ox;
    let pz = z + oz;
    const c = clampSide(team, px, pz, free, teams);
    px = c.x; pz = c.z;
    // 너무 겹치면 살짝 밀어낸다
    let tries = 0;
    while (tooClose(list, px, pz) && tries < 8) {
      const a = tries * 2.399;
      px = c.x + Math.cos(a) * (MIN_GAP + 0.35 * tries);
      pz = c.z + Math.sin(a) * (MIN_GAP + 0.35 * tries);
      const c2 = clampSide(team, px, pz, free, teams);
      px = c2.x; pz = c2.z;
      tries++;
    }
    const p = { id, x: px, z: pz, weapon: WEAPON_BY_ID[weapon] ? weapon : 'none' };
    list.push(p);
    added.push(p);
  }
  // 예산 때문에 일부를 놓지 못한 경우 (한 마리 더 놓으면 넘칠 때)
  if (!skipped && budget != null && costOf(list) + def.cost > budget) skipped = 'budget';
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

// 파티에서 팀이 바뀌거나 인원이 늘 때, 이미 놓은 배치를 새 진영 안으로 다시 모은다
export function reclampList(list, team, teams) {
  return sanitizeList(list).map((p) => {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) {
      return { ...autoPositions([p], team, teams)[0] };
    }
    const c = clampSide(team, p.x, p.z, false, teams);
    return { ...p, x: c.x, z: c.z };
  });
}
