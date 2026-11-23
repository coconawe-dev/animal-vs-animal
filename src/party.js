// 파티 멀티플레이 세션 — 방 상태 · 진영 배정 · 예산 · 배틀 동기화
//  · 방장(Host)이 유일한 권한자: 진영 배정, 예산 검증, 전투 시뮬레이션, 스냅샷 전송
//  · 손님(Guest)은 자기 진영 배치를 보내고, 방장의 스냅샷/이벤트를 받아 그대로 그린다.
//  · Net(중계)과 Sim(전투)만 쓰고 THREE/DOM 에 의존하지 않는다 → 노드 테스트 가능.
import { createBattle, step, possessUnit, releasePossession, setUnitInput } from './sim.js';
import { PARTY, partyTeams, teamDef, sectorBounds, TUNING } from './config.js';
import { reclampList, costOf, clampSide } from './placement.js';
import { Net, normalizeRoomCode } from './net.js';

export const PHASE = { IDLE: 'idle', LOBBY: 'lobby', PLACE: 'place', BATTLE: 'battle', END: 'end' };

export const SNAPSHOT_HZ = 12;
// 잠시 끊긴 것(휴대폰 백그라운드·다른 앱)과 진짜 나간 것을 구분한다
const STALE_MS = 25000;        // 이만큼 응답이 없으면 '연결 끊김'으로 표시
const DROP_MS = 180000;        // 3분 동안 안 돌아오면 방에서 정리
const PING_MS = 5000;          // 살아 있음을 알리는 주기 (탭이 뒤에 있어도 타이머로 돈다)

/* ─────────────────── 이벤트 압축 (방장 → 손님) ─────────────────── */

const EV_FIELDS = {
  attack: ['uid', 'ranged'],
  shot: ['uid', 'x', 'z', 'y', 'kind', 'color'],
  beam: ['uid', 'x', 'z', 'y', 'x2', 'z2', 'color'],
  bulletHit: ['x', 'z', 'y', 'color'],
  explosion: ['x', 'z', 'y', 'r', 'color'],
  flame: ['uid', 'x', 'z', 'tx', 'tz', 'r'],
  hit: ['uid', 'x', 'z', 'y', 'dmg', 'crit', 'dot'],
  evade: ['uid', 'x', 'z'],
  block: ['uid', 'x', 'z'],
  bash: ['uid', 'x', 'z'],
  skill: ['uid', 'x', 'z', 'kind', 'name'],
  burst: ['x', 'z', 'r', 'kind', 'uid'],
  quake: ['x', 'z', 'r', 'big'],
  tail: ['x', 'z'],
  dashHit: ['x', 'z'],
  takeoff: ['x', 'z'],
  diveLand: ['x', 'z'],
  chomp: ['x', 'z'],
  buff: ['uid'],
  stun: ['uid'],
  launch: ['uid', 'x', 'z', 'force'],
  land: ['x', 'z', 'force'],
  death: ['uid', 'x', 'z', 'heavy'],
  heal: ['uid', 'x', 'z', 'amount'],
  // 강하닭 · 샌즈 연출
  blink: ['uid', 'x', 'z', 'x2', 'z2'],
  featherRain: ['x', 'z', 'r'],
  beakSlam: ['uid', 'x', 'z', 'r', 'ang'],
  eggLaunch: ['uid', 'x', 'z', 'tx', 'tz'],
  gasterBlast: ['uid', 'x', 'z', 'ang', 'len', 'tx', 'tz'],
  boneBarrage: ['uid', 'x', 'z', 'ang', 'count'],
  boneSpikes: ['uid', 'x', 'z', 'r'],
  // 라스트 브레스 · 신규 4종 연출
  gasterHand: ['uid', 'x', 'z', 'side', 'i', 'r'],
  rudeAttack: ['uid', 'x', 'z', 'i', 'count'],
  rudeText: ['uid', 'x', 'z', 'text'],
  tripleVenom: ['uid', 'x', 'z', 'ang', 'lane', 'r'],
  heroStrike: ['uid', 'x', 'z', 'i', 'style'],
  heroCombo: ['uid', 'x', 'z', 'count'],
  chestBeat: ['uid', 'x', 'z'],
  tuskQuakeLand: ['uid', 'x', 'z', 'r'],
  // 전장 아이템 연출
  chainLightning: ['uid', 'x', 'z', 'y', 'x2', 'y2', 'z2'],
  healPulse: ['uid', 'x', 'z', 'r'],
  spikeHit: ['uid', 'x', 'z'],
};
const EV_CODES = Object.keys(EV_FIELDS);
const EV_INDEX = Object.fromEntries(EV_CODES.map((k, i) => [k, i]));
const BOOL_FIELDS = new Set(['crit', 'dot', 'big', 'ranged']);

const num = (v, dp = 2) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  const p = 10 ** dp;
  return Math.round(n * p) / p;
};

export function packEvent(ev) {
  if (!ev || !EV_FIELDS[ev.type]) return null;
  const fields = EV_FIELDS[ev.type];
  const out = [EV_INDEX[ev.type]];
  for (const f of fields) {
    const v = ev[f];
    if (typeof v === 'string') out.push(v.slice(0, 12));
    else if (BOOL_FIELDS.has(f)) out.push(v ? 1 : 0);
    else out.push(num(v));
  }
  return out;
}

export function unpackEvent(a) {
  if (!Array.isArray(a) || !a.length) return null;
  const type = EV_CODES[a[0]];
  if (!type) return null;
  const out = { type };
  EV_FIELDS[type].forEach((f, i) => {
    const v = a[i + 1];
    out[f] = BOOL_FIELDS.has(f) ? !!v : v;
  });
  return out;
}

const STATE_LIST = ['idle', 'attack', 'chase', 'skill', 'stun', 'ready', 'retreat', 'strafe'];
const stateCode = (s) => Math.max(0, STATE_LIST.indexOf(s));

/* ─────────────────────────── 세션 ─────────────────────────── */

export class PartySession {
  constructor(opts = {}) {
    this.transportFactory = opts.transportFactory || null;
    this.net = opts.net || new Net({
      onMessage: (m) => this.handle(m),
      onStatus: (s) => this.status(s),
      transportFactory: this.transportFactory || undefined,
    });
    this.net.onMessage = (m) => this.handle(m);
    this.net.onStatus = (s) => this.status(s);

    this.onChange = opts.onChange || (() => {});
    this.onStatus = opts.onStatus || (() => {});
    this.onBattle = opts.onBattle || (() => {});
    this.onEnd = opts.onEnd || (() => {});
    this.onClosed = opts.onClosed || (() => {});

    this.players = new Map();      // pid → 플레이어
    this.order = [];               // 참가 순서 (진영 배정 기준)
    this.phase = PHASE.IDLE;
    this.arenaId = opts.arenaId || 'savanna';
    this.battle = null;
    this.seed = 0;
    this.statusText = '';
    this.lastRecv = Date.now();
    this._snapAcc = 0;
    this._outEvents = [];
    this._outLog = 0;
    this._endSent = false;
    this._endPushed = false;
    this._joinAt = 0;
    // 휴대폰에서 다른 앱에 다녀오면 잠시 멈췄던 연결을 바로 되살린다
    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden || !this.active || this.isHost) return;
        this.send('ping', {});
        if (this.phase === PHASE.PLACE) this.send('place', { list: this.me?.placements || [] });
      });
    }
    this._pingAcc = 0;
    this._pingTimer = null;
    this.stats = { sent: 0, recv: 0 };
  }

  /* ── 기본 정보 ── */

  get myPid() { return this.net.pid; }
  get isHost() { return this.net.isHost; }
  get roomCode() { return this.net.roomCode; }
  get me() { return this.players.get(this.myPid) || null; }
  get myTeam() { return this.me ? this.me.team : 'blue'; }
  get playerCount() { return this.players.size; }
  get teams() { return partyTeams(this.players.size); }
  get teamCount() { return this.teams.length; }
  get active() { return this.phase !== PHASE.IDLE; }
  get inBattle() { return this.phase === PHASE.BATTLE || this.phase === PHASE.END; }

  status(text) {
    this.statusText = text;
    this.onStatus(text);
  }

  changed() { this.onChange(this.snapshotState()); }

  // UI 가 그대로 그릴 수 있는 평범한 객체
  snapshotState() {
    const teams = this.teams;
    const list = this.order
      .map((pid) => this.players.get(pid))
      .filter(Boolean)
      .map((p) => ({
        pid: p.pid,
        nick: p.nick,
        team: p.team,
        teamName: teamDef(p.team).name,
        color: teamDef(p.team).css,
        me: p.pid === this.myPid,
        host: p.pid === this.net.hostPid || (this.isHost && p.pid === this.myPid),
        ready: !!p.ready,
        stale: p.pid === this.myPid ? false : (Date.now() - (p.lastAt || 0) > STALE_MS),
        count: (p.placements || []).length,
        used: costOf(p.placements || []),
        budget: PARTY.BUDGET,
        connected: p.pid === this.myPid ? true : (Date.now() - (p.lastAt || 0) < STALE_MS),
      }));
    return {
      phase: this.phase,
      roomCode: this.roomCode,
      isHost: this.isHost,
      teams,
      teamCount: teams.length,
      players: list,
      maxPlayers: PARTY.MAX_PLAYERS,
      budget: PARTY.BUDGET,
      canStart: this.isHost ? this.canStart() : false,
      myTeam: this.myTeam,
      myReady: !!this.me?.ready,
      myPlaced: (this.me?.placements || []).length,
      myUsed: costOf(this.me?.placements || []),
      arenaId: this.arenaId,
      status: this.statusText,
      network: { connected: this.net.connected, sent: this.net.stats.sent, recv: this.net.stats.recv },
    };
  }

  /* ── 방 열기 / 참가 ── */

  // 손님이 살아 있음을 알리는 타이머 (탭이 뒤에 있어도 계속 돈다)
  _startPing() {
    this._stopPing();
    if (typeof setInterval !== 'function') return;
    this._pingTimer = setInterval(() => {
      if (!this.active || this.isHost) return;
      this.send('ping', {});
    }, PING_MS);
    // 노드 테스트가 이 타이머 때문에 끝나지 않는 일이 없게
    this._pingTimer?.unref?.();
  }

  _stopPing() {
    if (this._pingTimer) { clearInterval(this._pingTimer); this._pingTimer = null; }
  }

  async host(nick) {
    this.phase = PHASE.LOBBY;
    const code = await this.net.host(nick);
    this._stopPing();
    this.players.clear();
    this.order = [];
    this._addPlayer({ pid: this.myPid, nick: this.net.nick, host: true });
    this.phase = PHASE.PLACE;
    this.status(`방 ${code} 열림 — 초대 링크를 보내세요`);
    this.changed();
    return code;
  }

  async join(code, nick) {
    this.phase = PHASE.LOBBY;
    const data = await this.net.join(normalizeRoomCode(code), nick);
    this._startPing();
    this.applyRoster(data.players || [], data);
    this.arenaId = data.arenaId || this.arenaId;
    this.phase = data.phase === PHASE.BATTLE ? PHASE.PLACE : (data.phase || PHASE.PLACE);
    this.status(`방 ${this.net.roomCode} 에 참가했습니다`);
    this.changed();
    return data;
  }

  _addPlayer(info) {
    if (!info || !info.pid) return null;
    let p = this.players.get(info.pid);
    if (!p) {
      p = {
        pid: info.pid,
        nick: (info.nick || '플레이어').slice(0, 10),
        team: 'blue',
        ready: false,
        placements: [],
        joinedAt: Date.now(),
      };
      this.players.set(info.pid, p);
      this.order.push(info.pid);
    } else {
      p.nick = (info.nick || p.nick).slice(0, 10);
      if (Array.isArray(info.placements)) p.placements = info.placements;
      if (info.ready !== undefined) p.ready = !!info.ready;
    }
    p.lastAt = Date.now();
    return p;
  }

  _removePlayer(pid) {
    const p = this.players.get(pid);
    if (!p) return null;
    this.players.delete(pid);
    this.order = this.order.filter((x) => x !== pid);
    return p;
  }

  // 참가 순서대로 진영 배정 (2명 → 2팀, 3명 → 3팀, 4명 → 4팀)
  assignTeams() {
    const teams = partyTeams(this.order.length || 1);
    this.order.forEach((pid, i) => {
      const p = this.players.get(pid);
      if (!p) return;
      const team = teams[Math.min(i, teams.length - 1)];
      if (p.team !== team || !p.placements.length) {
        p.placements = reclampList(p.placements || [], team, teams);
      }
      p.team = team;
    });
    return teams;
  }

  // 다른 참가자의 배치를 합친 전체 진영 목록 (미리보기·전투 공통)
  sidesForBattle() {
    const teams = this.teams;
    const sides = {};
    for (const t of teams) sides[t] = [];
    for (const pid of this.order) {
      const p = this.players.get(pid);
      if (!p || !sides[p.team]) continue;
      for (const q of p.placements) sides[p.team].push({ id: q.id, x: q.x, z: q.z, weapon: q.weapon || 'none' });
    }
    return sides;
  }

  /* ── 배치 · 준비 ── */

  setPlacements(list) {
    const me = this.me;
    if (!me) return;
    const teams = this.teams;
    const cleaned = reclampList(list || [], me.team, teams);
    // 예산을 넘으면 뒤에서부터 잘라 낸다 (방장·손님 모두 같은 규칙)
    let budgetLeft = PARTY.BUDGET;
    const kept = [];
    for (const q of cleaned) {
      const cost = costOf([q]);
      if (cost > budgetLeft) break;
      budgetLeft -= cost;
      kept.push(q);
    }
    me.placements = kept;
    if (kept.length < cleaned.length) this.status(`예산 ${PARTY.BUDGET}을 넘어 일부를 놓지 못했습니다`);
    if (this.isHost) {
      this.broadcastPlacements(me.pid);
      this.broadcastRoster();
    } else {
      this.send('place', { list: kept });
    }
    this.changed();
  }

  /* ── 유닛 직접 조종 ── */

  // 방장은 자기 시뮬레이션에 바로 적용하고, 손님은 방장에게 입력을 보낸다.
  control(uid, input) {
    if (!this.active) return false;
    if (this.isHost) return this.applyControl(uid, input, this.myPid);
    this.send('ctl', { uid, c: input || {} });
    return true;
  }

  // 방장: 조종 입력을 시뮬레이션에 적용한다 (자기 진영 유닛만 허용)
  applyControl(uid, input, pid) {
    const b = this.battle;
    if (!b || this.phase !== PHASE.BATTLE || !uid) return false;
    const u = b.units.find((x) => x.uid === uid && !x.dead && !x.isStructure);
    if (!u) { releasePossession(b, uid); return false; }
    if (pid && pid !== this.myPid) {
      const pl = this.players.get(pid);
      if (!pl || pl.team !== u.team) return false;
    }
    if (input && input.release) { releasePossession(b, uid); return true; }
    if (!u.possessed && !possessUnit(b, uid, pid || this.myPid)) return false;
    setUnitInput(u, input);
    return true;
  }

  setReady(on) {
    const me = this.me;
    if (!me) return;
    me.ready = !!on;
    if (this.isHost) this.broadcastRoster();
    else this.send('ready', { on: !!on });
    this.changed();
  }

  canStart() {
    if (!this.isHost) return false;
    if (this.phase !== PHASE.PLACE) return false;
    const list = this.order.map((pid) => this.players.get(pid)).filter(Boolean);
    if (list.length < PARTY.MIN_PLAYERS) return false;
    return list.every((p) => p.ready && (p.placements || []).length > 0 && costOf(p.placements) <= PARTY.BUDGET);
  }

  requestStart() {
    if (!this.canStart()) {
      this.status('모든 참가자가 배치를 마치고 준비해야 시작할 수 있습니다');
      this.changed();
      return false;
    }
    const seed = (Math.random() * 1e9) | 0;
    const payload = {
      seed,
      arenaId: this.arenaId,
      teams: this.teams,
      sides: this.sidesForBattle(),
      players: this.order.map((pid) => {
        const p = this.players.get(pid);
        return { pid, nick: p.nick, team: p.team };
      }),
    };
    this.send('start', payload);
    this.beginBattle(payload);
    return true;
  }

  beginBattle(payload) {
    const teams = payload.teams && payload.teams.length ? payload.teams : this.teams;
    const battle = createBattle({
      sides: payload.sides || {},
      teams,
      arenaId: payload.arenaId || this.arenaId,
      seed: payload.seed >>> 0,
      mode: 'party',
    });
    this.battle = battle;
    this.seed = payload.seed;
    this.phase = PHASE.BATTLE;
    this._snapAcc = 0;
    this._endSent = false;
    this._endPushed = false;
    this._outEvents = [];
    this._outLog = battle.logTotal || 0;
    battle._partyPlayers = payload.players || [];
    this.onBattle(battle, payload);
    this.changed();
    if (this.isHost) this.sendSnapshot(true);
    return battle;
  }

  rematch() {
    if (!this.isHost) return false;
    if (this.battle) releasePossession(this.battle);
    this.phase = PHASE.PLACE;
    this.battle = null;
    for (const p of this.players.values()) p.ready = false;
    this.broadcastRoster();
    this.broadcastPlacements();
    this.changed();
    return true;
  }

  leave() {
    this._stopPing();
    const role = this.net.stop();
    this.phase = PHASE.IDLE;
    this.players.clear();
    this.order = [];
    this.battle = null;
    if (role) this.changed();
  }

  /* ── 메시지 ── */

  send(type, payload) {
    const ok = this.net.send({ t: type, p: payload });
    if (ok) this.stats.sent++;
    return ok;
  }

  handle(msg) {
    const p = msg.p || {};
    // 보낸이는 봉투(f)에 적혀 있다 — 짐(p)에 pid 가 없으면 그걸로 채운다
    if (p.pid === undefined && msg.f) p.pid = msg.f;
    this.lastRecv = Date.now();
    this.stats.recv++;
    if (this.isHost) this._hostHandle(msg.t, p);
    else this._guestHandle(msg.t, p);
  }

  _hostHandle(type, p) {
    if (type === 'join') {
      if (!p.pid) return;
      const existing = this.players.get(p.pid);
      if (!existing && this.players.size >= PARTY.MAX_PLAYERS) {
        this.send('full', { pid: p.pid });
        this.status(`${p.nick || '한 명'} 님이 가득 찬 방에 들어오려 했습니다 (최대 ${PARTY.MAX_PLAYERS}명)`);
        this.changed();
        return;
      }
      const player = this._addPlayer({ pid: p.pid, nick: p.nick });
      if (player) player.lastAt = Date.now();
      this.assignTeams();
      this.send('welcome', {
        hostPid: this.myPid,
        roomCode: this.roomCode,
        phase: this.phase,
        arenaId: this.arenaId,
        players: this.rosterPayload(),
        budget: PARTY.BUDGET,
      });
      this.broadcastRoster();
      this.broadcastPlacements();
      this.status(existing ? `${player.nick} 님이 다시 연결되었습니다` : `${player.nick} 님이 들어왔습니다`);
      this.changed();
    } else if (type === 'place') {
      const player = this.players.get(p.pid);
      if (!player || !Array.isArray(p.list)) return;
      player.placements = this._sanitizeForTeam(p.list, player.team);
      player.lastAt = Date.now();
      this.broadcastPlacements(player.pid);
      this.broadcastRoster();
      this.changed();
    } else if (type === 'ready') {
      const player = this.players.get(p.pid);
      if (!player) return;
      player.ready = !!p.on;
      if (player.ready && !(player.placements || []).length) player.ready = false;
      this.broadcastRoster();
      this.changed();
    } else if (type === 'bye') {
      const player = this._removePlayer(p.pid);
      if (player) {
        this.assignTeams();
        this.broadcastRoster();
        this.broadcastPlacements();
        this.status(`${player.nick} 님이 나갔습니다`);
        this.changed();
      }
    } else if (type === 'ctl') {
      const player = this.players.get(p.pid);
      if (!player) return;
      this.applyControl(p.uid, p.c || {}, p.pid);
    } else if (type === 'ping') {
      const player = this.players.get(p.pid);
      if (player) {
        player.lastAt = Date.now();
        if (player.stale) {
          player.stale = false;
          this.status(`${player.nick} 님이 다시 연결되었습니다`);
          this.changed();
        }
      } else if (this.players.size < PARTY.MAX_PLAYERS) {
        // 방에서 빠졌던 사람이 다시 살아났다 — 목록을 보내 스스로 판단하게 한다
        this.send('roster', { players: this.rosterPayload(), phase: this.phase, arenaId: this.arenaId });
      }
    }
  }

  _guestHandle(type, p) {
    if (type === 'welcome') {
      this.applyRoster(p.players || [], p);
    } else if (type === 'roster') {
      this.applyRoster(p.players || [], p);
    } else if (type === 'pl') {
      const player = this.players.get(p.pid);
      if (player) {
        player.placements = Array.isArray(p.list) ? p.list : [];
        player.lastAt = Date.now();
        this.changed();
      }
    } else if (type === 'start') {
      this.beginBattle(p);
    } else if (type === 'snap') {
      this.applySnapshot(p);
    } else if (type === 'end') {
      if (this.battle) {
        this.battle.over = true;
        this.battle.winner = p.winner || 'draw';
        this.battle.endReason = p.reason || 'elimination';
        this.pushEnd();
      }
    } else if (type === 'bye') {
      if (p.pid === this.net.hostPid || p.host) {
        this.status('방장이 방을 닫았습니다');
        this.net.stop();
        this.phase = PHASE.IDLE;
        this.players.clear();
        this.order = [];
        this.onClosed('host-left');
        this.changed();
      } else {
        const player = this._removePlayer(p.pid);
        if (player) {
          this.assignTeams();
          this.status(`${player.nick} 님이 나갔습니다`);
          this.changed();
        }
      }
    }
  }

  _sanitizeForTeam(list, team) {
    const teams = this.teams;
    const cleaned = reclampList(list, team, teams);
    let left = PARTY.BUDGET;
    const out = [];
    for (const q of cleaned) {
      const c = costOf([q]);
      if (c > left) break;
      left -= c;
      out.push(q);
    }
    return out;
  }

  applyRoster(list, extra = {}) {
    const seen = new Set();
    // 방장이 보낸 목록에 내가 없으면 → 내가 방에서 빠진 것이다
    if (!this.isHost && (this.phase === PHASE.PLACE || this.phase === PHASE.BATTLE) && list.length
      && !list.some((x) => x && x.pid === this.myPid)) {
      this.status('방에서 나갔습니다 (오래 응답이 없었습니다)');
      this.net.stop();
      this.phase = PHASE.IDLE;
      this.players.clear();
      this.order = [];
      this.onClosed('removed');
      this.changed();
      return;
    }
    for (const info of list) {
      if (!info || !info.pid) continue;
      seen.add(info.pid);
      const player = this._addPlayer(info);
      if (!player) continue;
      if (info.team) player.team = info.team;
      if (info.placements) player.placements = info.placements;
      if (info.ready !== undefined) player.ready = !!info.ready;
      player.lastAt = Date.now();
    }
    // 목록에 없는 사람은 나간 것으로 본다
    for (const pid of [...this.players.keys()]) {
      if (!seen.has(pid) && pid !== this.myPid && this.isHost === false) this._removePlayer(pid);
    }
    this.order = [...this.players.keys()].sort((a, b) => {
      const pa = this.players.get(a), pb = this.players.get(b);
      return (pa?.joinedAt || 0) - (pb?.joinedAt || 0);
    });
    if (extra.phase) this.phase = extra.phase;
    if (extra.arenaId) this.arenaId = extra.arenaId;
    if (this.phase === PHASE.LOBBY) this.phase = PHASE.PLACE;
    this.changed();
  }

  rosterPayload() {
    return this.order.map((pid) => {
      const p = this.players.get(pid);
      return {
        pid: p.pid, nick: p.nick, team: p.team,
        ready: !!p.ready, placements: p.placements || [],
      };
    });
  }

  broadcastRoster() {
    if (!this.isHost) return;
    this.send('roster', { players: this.rosterPayload(), phase: this.phase, arenaId: this.arenaId });
  }

  broadcastPlacements(pid = null) {
    if (!this.isHost) return;
    if (pid) {
      const p = this.players.get(pid);
      if (p) this.send('pl', { pid: p.pid, team: p.team, list: p.placements || [] });
    } else {
      for (const p of this.players.values()) {
        this.send('pl', { pid: p.pid, team: p.team, list: p.placements || [] });
      }
    }
  }

  /* ── 전투 동기화 ── */

  // 방장: 지금까지 쌓인 이벤트/로그를 모아 스냅샷을 보낸다
  sendSnapshot(force = false) {
    if (!this.isHost || !this.battle) return;
    const b = this.battle;
    const units = [];
    for (const u of b.units) {
      units.push([
        u.uid, num(u.x, 1), num(u.z, 1), num(u.facing, 2),
        Math.round(u.hp), u.dead ? 1 : 0, num(u.y, 1),
        stateCode(u.state), u.moving ? 1 : 0,
        num(u.skillTimer, 1),
        num(u.aimYaw == null ? u.facing : u.aimYaw, 2),
      ]);
    }
    // 이벤트는 중요한 것(스킬·사망·폭발)을 먼저, 피해 숫자는 남는 자리에만
    const evs = [];
    const rest = [];
    for (const ev of b.events) {
      const packed = packEvent(ev);
      if (!packed) continue;
      if (ev.type === 'hit' || ev.type === 'shot' || ev.type === 'attack') rest.push(packed);
      else evs.push(packed);
      if (evs.length >= 24) break;
    }
    for (const packed of rest) {
      if (evs.length >= 24) break;
      evs.push(packed);
    }
    const logFrom = this._outLog;
    const logTotal = b.logTotal || b.log.length;
    const log = b.logTotal > logFrom ? b.log.slice(Math.max(0, b.log.length - (logTotal - logFrom))) : [];
    this._outLog = logTotal;

    const payload = {
      t: num(b.time, 2),
      u: units,
      ev: evs,
      lg: log.map((l) => ({ t: num(l.t, 1), text: String(l.text || '').slice(0, 60), kind: l.kind || '', team: l.team || null })),
    };
    if (force) payload.full = 1;
    if (b.over) {
      payload.ov = 1;
      payload.w = b.winner;
      payload.r = b.endReason;
      payload.mv = b.units.map((u) => [u.uid, Math.round(u.dmgDealt), u.kills, u.skillCasts]);
      payload.st = { ...b.stats };
      if (!this._endSent) {
        this._endSent = true;
        this.send('end', { winner: b.winner, reason: b.endReason, time: b.time });
      }
    }
    this.send('snap', payload);
    this.stats.sent++;
  }

  applySnapshot(p) {
    const b = this.battle;
    if (!b || !p) return;
    b.time = Number(p.t) || b.time;
    const byUid = new Map(b.units.map((u) => [u.uid, u]));
    for (const a of p.u || []) {
      const u = byUid.get(a[0]);
      if (!u) continue;
      u.x = a[1];
      u.z = a[2];
      u.facing = a[3];
      if (!u.dead) u.hp = a[4];
      u.y = a[6];
      u.moving = !!a[8];
      const st = STATE_LIST[a[7]] || 'idle';
      if (!u.dead) u.state = st;
      if (a[9] != null && !u.dead) u.skillTimer = Number(a[9]) || 0;
      if (a[10] != null) u.aimYaw = Number(a[10]) || 0;
      if (a[5] && !u.dead) {
        u.dead = true;
        u.hp = 0;
        u.state = 'dead';
      }
    }
    for (const raw of p.ev || []) {
      const ev = unpackEvent(raw);
      if (ev) b.events.push(ev);
    }
    for (const l of p.lg || []) {
      b.log.push(l);
      b.logTotal = (b.logTotal || b.log.length) + 1;
    }
    while (b.log.length > TUNING.LOG_LIMIT) b.log.shift();
    if (p.ov) {
      b.over = true;
      b.winner = p.w || 'draw';
      b.endReason = p.r || 'elimination';
      for (const a of p.mv || []) {
        const u = byUid.get(a[0]);
        if (u) { u.dmgDealt = a[1]; u.kills = a[2]; u.skillCasts = a[3]; }
      }
      if (p.st) b.stats = { ...b.stats, ...p.st };
      this.pushEnd();
    }
  }

  pushEnd() {
    if (this._endPushed || !this.battle) return;
    this._endPushed = true;
    this.phase = PHASE.END;
    this.battle.events.push({ type: 'end', winner: this.battle.winner, reason: this.battle.endReason });
    this.onEnd(this.battle);
    this.changed();
  }

  // 프레임마다: 연결 유지 · 방장 스냅샷 · 끊긴 참가자 정리
  tick(dt = 0) {
    if (!this.active) return;
    this.net.tick();

    if (this.net.reconnected) {
      this.net.reconnected = false;
      if (this.isHost) {
        this.broadcastRoster();
        this.broadcastPlacements();
      } else {
        this.send('place', { list: this.me?.placements || [] });
        if (this.me?.ready) this.send('ready', { on: true });
      }
      this.changed();
    }

    // 손님은 살아 있음을 알린다 — 조용한 참가자가 방장에게서 잘려 나가지 않게
    if (!this.isHost && this.phase !== PHASE.IDLE) {
      this._pingAcc = (this._pingAcc || 0) + dt;
      if (this._pingAcc >= 6) {
        this._pingAcc = 0;
        this.send('ping', {});
      }
    }

    if (this.isHost) {
      if (this.phase === PHASE.BATTLE && this.battle && this.battle.over) {
        // 마지막 스냅샷은 반드시 보내고, 패킷이 사라져도 승패가 전달되도록 가끔 재전송한다
        const now = Date.now();
        if (!this._endSent || now - (this._lastEndAt || 0) > 1500) {
          this._lastEndAt = now;
          this.sendSnapshot(true);
        }
      } else if (this.phase === PHASE.BATTLE && this.battle) {
        this._snapAcc += dt;
        if (this._snapAcc >= 1 / SNAPSHOT_HZ) {
          this._snapAcc = 0;
          this.sendSnapshot();
        }
      }
      // 오래 응답 없는 참가자 — 잠시 끊긴 것과 나간 것을 구분한다
      const now = Date.now();
      for (const pid of [...this.order]) {
        if (pid === this.myPid) continue;
        const p = this.players.get(pid);
        if (!p) continue;
        const silence = now - (p.lastAt || 0);
        if (silence > DROP_MS) {
          this._removePlayer(pid);
          this.assignTeams();
          this.broadcastRoster();
          this.status(`${p.nick} 님이 방에서 나갔습니다`);
          this.changed();
        } else if (silence > STALE_MS && !p.stale) {
          p.stale = true;
          this.status(`${p.nick} 님의 연결이 잠시 끊겼습니다 (돌아오면 자동 연결)`);
          this.changed();
        }
      }
    } else if (this.phase === PHASE.BATTLE) {
      // 방장 신호가 끊기면 알린다
      if (this.net.active && this.net.lastRecvAt && Date.now() - this.net.lastRecvAt > STALE_MS) {
        this.status('방장과 연결이 끊겼습니다');
      }
    }
  }

  /* ── 진영 위치 도우미 ── */

  sectorFor(team) { return sectorBounds(this.teams, team); }

  // 내 진영으로 좌표를 밀어 넣는다 (배치 화면에서 사용)
  clampToMyTeam(x, z) {
    return clampSide(this.myTeam, x, z, false, this.teams);
  }

  // 이 좌표가 내 진영인지
  isMySector(x, z) {
    const c = this.clampToMyTeam(x, z);
    return Math.hypot(c.x - x, c.z - z) < 0.5;
  }
}

/* ────────────────── 테스트용 4인 루프백 도우미 ────────────────── */

export function makeLoopback(count, opts = {}) {
  const hub = opts.hub;
  const factory = () => hub.create();
  const sessions = [];
  for (let i = 0; i < count; i++) {
    sessions.push(new PartySession({
      transportFactory: factory,
      onChange: opts.onChange,
      onBattle: opts.onBattle,
      onEnd: opts.onEnd,
      onClosed: opts.onClosed,
    }));
  }
  return sessions;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
