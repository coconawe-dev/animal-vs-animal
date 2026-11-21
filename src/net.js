// 파티 멀티플레이 네트워크 — 서버 없이 공개 WSS 중계(MQTT)로 방을 만든다.
//  · EMQX · HiveMQ 두 중계에 동시에 붙어, 어느 쪽에 모여도 서로 만난다.
//  · 같은 메시지가 두 중계로 두 번 도착하므로 (보낸이, 순번)으로 걸러 낸다.
//  · 정적 GitHub Pages(서버 없음)에서도 동작하도록 WebSocket 만 쓴다.
//  · Node 테스트에서는 MemoryHub 를 transportFactory 로 넣어 4명 루프백을 돌린다.

export const BROKERS = [
  { id: 'emqx', name: 'EMQX', url: 'wss://broker.emqx.io:8084/mqtt' },
  { id: 'hivemq', name: 'HiveMQ', url: 'wss://broker.hivemq.com:8884/mqtt' },
];

const TOPIC_PREFIX = 'ava1/';       // animal vs animal
const JOIN_WAIT_MS = 14000;
const JOIN_RETRY_MS = 1200;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function makePid() {
  let s = '';
  for (let i = 0; i < 8; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return s;
}

export function makeRoomCode() {
  let s = '';
  for (let i = 0; i < 4; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return s;
}

// 방 코드 입력 정리 (소문자·붙여 쓴 기호·헷갈리는 문자 제거)
export function normalizeRoomCode(raw) {
  if (!raw) return '';
  const s = String(raw).toUpperCase();
  let out = '';
  for (const ch of s) if (CODE_ALPHABET.indexOf(ch) >= 0) out += ch;
  return out.slice(0, 6);
}

export function isValidRoomCode(code) {
  if (!code || code.length < 3 || code.length > 6) return false;
  for (const ch of code) if (CODE_ALPHABET.indexOf(ch) < 0) return false;
  return true;
}

export function encodeMsg(type, payload) {
  return JSON.stringify({ t: type, p: payload === undefined ? null : payload });
}

export function decodeMsg(raw) {
  if (typeof raw !== 'string' || !raw || raw.length > 120000) return null;
  let o;
  try { o = JSON.parse(raw); } catch (e) { return null; }
  if (!o || typeof o.t !== 'string') return null;
  return { t: o.t, p: o.p === undefined ? null : o.p, f: o.f, s: o.s };
}

export function inviteLink(code) {
  try {
    const base = `${location.origin}${location.pathname}`;
    return `${base}?room=${encodeURIComponent(code)}`;
  } catch (e) {
    return `${code}`;
  }
}

/* ─────────────────────────── MQTT (WSS) ─────────────────────────── */

function utf8Bytes(s) {
  const out = [];
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}

function mqttString(s) {
  const b = utf8Bytes(s);
  return [(b.length >> 8) & 255, b.length & 255].concat(b);
}

function mqttLength(n) {
  const out = [];
  do {
    let d = n % 128;
    n = Math.floor(n / 128);
    if (n > 0) d |= 0x80;
    out.push(d);
  } while (n > 0);
  return out;
}

const bytesOf = (arr) => new Uint8Array(arr);

export class RelayClient {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.buf = new Uint8Array(0);
    this.pid = 1;
    this.connected = false;
    this.onPublish = null;
    this.onClose = null;
    this._pingTimer = null;
  }

  connect(clientId, timeoutMs) {
    const self = this;
    return new Promise((resolve, reject) => {
      if (typeof WebSocket === 'undefined') { reject(new Error('이 브라우저는 WebSocket을 지원하지 않습니다')); return; }
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try { self.close(); } catch (e) { /* noop */ }
        reject(new Error('중계 서버 응답 없음'));
      }, timeoutMs || 9000);
      let ws;
      try {
        ws = new WebSocket(self.url, ['mqtt']);
      } catch (e) {
        clearTimeout(timer);
        reject(e);
        return;
      }
      self.ws = ws;
      ws.binaryType = 'arraybuffer';
      ws.onopen = () => {
        const body = mqttString('MQTT').concat([0x04, 0x02, 0x00, 0x3c]).concat(mqttString(clientId));
        ws.send(bytesOf([0x10].concat(mqttLength(body.length)).concat(body)));
      };
      ws.onerror = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new Error('중계 서버 접속 실패'));
      };
      ws.onclose = () => {
        self.connected = false;
        if (self._pingTimer) { clearInterval(self._pingTimer); self._pingTimer = null; }
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(new Error('중계 서버가 연결을 닫았습니다'));
          return;
        }
        if (self.onClose) self.onClose();
      };
      ws.onmessage = (ev) => {
        let chunk;
        try { chunk = new Uint8Array(ev.data); } catch (e) { return; }
        const all = new Uint8Array(self.buf.length + chunk.length);
        all.set(self.buf);
        all.set(chunk, self.buf.length);
        self.buf = all;
        self.parse((type, payload) => {
          if (type === 2 && !settled) {
            settled = true;
            clearTimeout(timer);
            if (payload && payload.length >= 2 && payload[1] !== 0) {
              reject(new Error('중계 서버가 접속을 거부했습니다'));
              return;
            }
            self.connected = true;
            self.startPing();
            resolve(true);
          } else if (type === 3 && self.onPublish) {
            const m = self.decodePublish(payload);
            if (m) self.onPublish(m.topic, m.body);
          }
        });
      };
    });
  }

  parse(onPacket) {
    const b = this.buf;
    let i = 0;
    while (i < b.length) {
      const start = i;
      const type = b[i] >> 4;
      i++;
      let mult = 1;
      let len = 0;
      let d;
      do {
        if (i >= b.length) { this.buf = b.slice(start); return; }
        d = b[i++];
        len += (d & 127) * mult;
        mult *= 128;
      } while (d & 128);
      if (i + len > b.length) { this.buf = b.slice(start); return; }
      const payload = b.slice(i, i + len);
      i += len;
      onPacket(type, payload);
    }
    this.buf = b.slice(i);
  }

  decodePublish(payload) {
    if (payload.length < 2) return null;
    const tl = (payload[0] << 8) | payload[1];
    if (2 + tl > payload.length) return null;
    let topic = '';
    for (let i = 0; i < tl; i++) topic += String.fromCharCode(payload[2 + i]);
    const bodyBytes = payload.subarray ? payload.subarray(2 + tl) : payload.slice(2 + tl);
    let body = '';
    if (typeof TextDecoder !== 'undefined') {
      body = new TextDecoder('utf-8').decode(bodyBytes);
    } else {
      for (let j = 0; j < bodyBytes.length; j++) body += String.fromCharCode(bodyBytes[j]);
    }
    return { topic, body };
  }

  startPing() {
    if (this._pingTimer) clearInterval(this._pingTimer);
    this._pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === 1) this.ws.send(bytesOf([0xc0, 0x00]));
    }, 25000);
  }

  subscribe(topic) {
    if (!this.ws || this.ws.readyState !== 1) return;
    const id = this.pid++;
    const body = [(id >> 8) & 255, id & 255].concat(mqttString(topic)).concat([0x00]);
    this.ws.send(bytesOf([0x82].concat(mqttLength(body.length)).concat(body)));
  }

  publish(topic, text) {
    if (!this.ws || this.ws.readyState !== 1) return false;
    const body = mqttString(topic).concat(utf8Bytes(text));
    this.ws.send(bytesOf([0x30].concat(mqttLength(body.length)).concat(body)));
    return true;
  }

  close() {
    if (this._pingTimer) { clearInterval(this._pingTimer); this._pingTimer = null; }
    this.connected = false;
    if (this.ws) {
      try { this.ws.close(); } catch (e) { /* noop */ }
      this.ws = null;
    }
  }
}

/* ───────────────────── 테스트용 메모리 중계 (같은 인터페이스) ───────────────────── */

export class MemoryHub {
  constructor() {
    this.topics = new Map();   // topic → Set<client>
    this.log = [];
    this.delay = 1;
  }

  create() { return new MemoryClient(this); }

  deliver(topic, text, from) {
    const set = this.topics.get(topic);
    if (!set) return;
    for (const c of [...set]) {
      if (!c.connected) continue;
      const copy = String(text);
      if (this.delay > 0) setTimeout(() => { if (c.connected) c._receive(topic, copy); }, this.delay);
      else c._receive(topic, copy);
    }
  }
}

export class MemoryClient {
  constructor(hub) {
    this.hub = hub;
    this.connected = false;
    this.topics = new Set();
    this.onPublish = null;
    this.onClose = null;
  }

  async connect(clientId) {
    this.connected = true;
    return true;
  }

  subscribe(topic) {
    this.topics.add(topic);
    if (!this.hub.topics.has(topic)) this.hub.topics.set(topic, new Set());
    this.hub.topics.get(topic).add(this);
  }

  publish(topic, text) {
    if (!this.connected) return false;
    this.hub.deliver(topic, text, this);
    return true;
  }

  _receive(topic, text) {
    if (this.onPublish) this.onPublish(topic, text);
  }

  close() {
    this.connected = false;
    for (const t of this.topics) {
      const set = this.hub.topics.get(t);
      if (set) set.delete(this);
    }
    this.topics.clear();
    if (this.onClose) this.onClose();
  }
}

/* ─────────────────────────── 방(Net) ─────────────────────────── */

export class Net {
  constructor(opts = {}) {
    this.opts = opts;
    this.role = null;            // 'host' | 'guest'
    this.active = false;
    this.roomCode = '';
    this.pid = opts.pid || makePid();
    this.nick = '플레이어';
    this.hostPid = '';
    this.transports = [];
    this.onMessage = opts.onMessage || (() => {});
    this.onStatus = opts.onStatus || (() => {});
    this.transportFactory = opts.transportFactory || ((url) => new RelayClient(url));
    this.lastRecvAt = 0;
    this.reconnected = false;
    this.error = null;
    this.stats = { sent: 0, recv: 0 };
    this._seq = 0;
    this._seen = new Map();
    this._lastConnectTry = 0;
    this._welcome = null;

    // 휴대폰에서 다른 앱에 다녀오면 Safari 가 연결을 잠시 멈춘다.
    // 참가 응답을 기다리는 중에 돌아오면 join 을 바로 다시 보내 기다림을 줄인다.
    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) return;
        if (!this._welcome) return;
        this._sendJoin();
      });
    }
  }

  get isHost() { return this.role === 'host'; }
  get isGuest() { return this.role === 'guest'; }
  get connected() { return this.transports.some((t) => t.connected); }

  _topic(kind) { return TOPIC_PREFIX + this.roomCode + '/' + kind; }

  async _connectAll() {
    this.onStatus('중계 서버 접속 중…');
    // 이전 접속이 남아 있으면 정리 (다시 열기·재접속)
    for (const t of this.transports) { try { t.close(); } catch (e) { /* noop */ } }
    this.transports = [];
    const attempts = BROKERS.map(async (b) => {
      const c = this.transportFactory(b.url);
      try {
        await c.connect('ava' + makePid() + Math.random().toString(36).slice(2, 6), 9000);
        return c;
      } catch (e) {
        try { c.close(); } catch (err) { /* noop */ }
        return null;
      }
    });
    const ok = (await Promise.all(attempts)).filter(Boolean);
    if (!ok.length) throw new Error('멀티플레이 중계 서버에 접속하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    this.transports = ok;
    this._wire();
    this.lastRecvAt = Date.now();
    return ok;
  }

  _wire() {
    for (const t of this.transports) {
      t.onClose = () => { /* tick 이 재접속을 시도한다 */ };
    }
  }

  _subscribeAll() {
    const inbox = this._topic(this.isHost ? 'h' : 'g');
    for (const t of this.transports) {
      t.subscribe(inbox);
      t.onPublish = (tp, body) => { if (tp === inbox) this._dispatch(body); };
    }
  }

  async host(nick) {
    this.role = 'host';
    this.nick = (nick || '플레이어').slice(0, 10);
    this.roomCode = makeRoomCode();
    this.hostPid = this.pid;
    await this._connectAll();
    this._subscribeAll();
    this.active = true;
    return this.roomCode;
  }

  async join(code, nick) {
    this.role = 'guest';
    this.nick = (nick || '플레이어').slice(0, 10);
    this.roomCode = normalizeRoomCode(code);
    if (!isValidRoomCode(this.roomCode)) throw new Error('방 코드를 확인해 주세요 (영문·숫자 4자리).');
    this.onStatus('방을 찾는 중…');
    await this._connectAll();
    this._subscribeAll();

    const welcome = new Promise((resolve, reject) => {
      this._welcome = { resolve, reject };
      setTimeout(() => {
        if (!this._welcome) return;
        this._welcome = null;
        this._clearJoinRetry();
        reject(new Error('방을 찾지 못했습니다. 방 코드를 확인하거나, 방장이 파티를 연 상태인지 확인해 주세요.'));
      }, JOIN_WAIT_MS);
    });
    this._sendJoin();
    this._joinRetry = setInterval(() => {
      if (!this._welcome) return;
      this._sendJoin();
    }, JOIN_RETRY_MS);

    const data = await welcome;
    this._clearJoinRetry();
    this.active = true;
    this.hostPid = data.hostPid || '';
    this.lastRecvAt = Date.now();
    return data;
  }

  _sendJoin() {
    this.send({ t: 'join', p: { pid: this.pid, nick: this.nick } });
  }

  _clearJoinRetry() {
    if (this._joinRetry) { clearInterval(this._joinRetry); this._joinRetry = null; }
  }

  _stamp(text) {
    this._seq = (this._seq || 0) + 1;
    return text.slice(0, -1) + ',"f":"' + this.pid + '","s":' + this._seq + '}';
  }

  _seenAlready(key) {
    const now = Date.now();
    const at = this._seen.get(key);
    if (at && now - at < 4000) return true;
    this._seen.set(key, now);
    if (this._seen.size > 320) {
      for (const [k, t] of this._seen) if (now - t > 4000) this._seen.delete(k);
    }
    return false;
  }

  // 보내기: 게스트는 방장 앞으로('h'), 방장은 전체 앞으로('g')
  send(msg) {
    const channel = this.isHost ? 'g' : 'h';
    const text = this._stamp(encodeMsg(msg.t, msg.p));
    let sent = false;
    for (const t of this.transports) {
      if (t.publish(this._topic(channel), text)) sent = true;
    }
    if (sent) this.stats.sent++;
    return sent;
  }

  _dispatch(raw) {
    const msg = decodeMsg(raw);
    if (!msg) return;
    if (msg.f !== undefined && msg.f === this.pid) return;      // 내가 보낸 것
    if (msg.f !== undefined && msg.s !== undefined && this._seenAlready(msg.f + ':' + msg.s)) return;
    this.stats.recv++;
    this.lastRecvAt = Date.now();

    if (msg.t === 'welcome') {
      if (this._welcome) {
        const w = this._welcome;
        this._welcome = null;
        this._clearJoinRetry();
        w.resolve(msg.p || {});
      }
      return;
    }
    if (msg.t === 'full') {
      // 방장은 전체 채널로 거절을 보내므로, 내 앞으로 온 것만 처리한다
      const target = msg.p && msg.p.pid;
      if (target && target !== this.pid) return;
      this.error = '방이 가득 찼습니다.';
      if (this._welcome) {
        const w = this._welcome;
        this._welcome = null;
        this._clearJoinRetry();
        w.reject(new Error('방이 가득 찼습니다 (최대 4명).'));
      }
      this.stop();
      return;
    }
    this.onMessage(msg);
  }

  // 끊김 확인 + 재접속 (프레임마다 호출)
  tick() {
    if (!this.active && !this._welcome) return false;
    if (this.connected) return false;
    const now = Date.now();
    if (now - this._lastConnectTry < 4000) return false;
    this._lastConnectTry = now;
    this._reconnect();
    return true;
  }

  _reconnect() {
    const role = this.role;
    const code = this.roomCode;
    this.onStatus('연결이 끊겨 다시 연결하는 중…');
    this.transports = [];
    this._connectAll().then(() => {
      this._subscribeAll();
      this.reconnected = true;
      if (role === 'guest') this._sendJoin();
      this.onStatus('다시 연결되었습니다');
    }).catch(() => {
      this.onStatus('연결이 끊겼습니다 · 잠시 후 다시 시도합니다');
    });
  }

  stop(reason) {
    if (this.active && this.role) {
      try { this.send({ t: 'bye', p: { pid: this.pid, reason: reason || '' } }); } catch (e) { /* noop */ }
    }
    this.active = false;
    this._clearJoinRetry();
    if (this._welcome) {
      const w = this._welcome;
      this._welcome = null;
      try { w.reject(new Error('방 연결이 끊어졌습니다.')); } catch (e) { /* noop */ }
    }
    for (const t of this.transports) {
      try { t.close(); } catch (e) { /* noop */ }
    }
    this.transports = [];
    const wasRole = this.role;
    this.role = null;
    return wasRole;
  }
}
