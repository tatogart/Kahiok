// Сеть: все сообщения идут через публичный MQTT-брокер по защищённому WebSocket.
// Это работает из любой сети (мобильный интернет, Wi-Fi, NAT) — в отличие от
// прямого WebRTC-соединения между устройствами. Состояние игры хранит браузер ведущего.
//
// Первая цифра PIN — номер брокера, остальные — номер комнаты.
// Для локальной отладки: ?mqtt=ws://127.0.0.1:8888

const BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://test.mosquitto.org:8081/mqtt'
];
const ROOT = 'kahiok/v2/';
const PING_MS = 4000;
const DEAD_MS = 16000;

function brokerUrl(i) {
  const custom = new URLSearchParams(location.search).get('mqtt');
  return custom || BROKERS[i];
}

function rid(len = 12) {
  const abc = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return [...crypto.getRandomValues(new Uint8Array(len))].map(b => abc[b % abc.length]).join('');
}

// Простой emitter, повторяющий интерфейс соединения PeerJS (on/send/close/open)
class Conn {
  constructor(sendFn, closeFn) {
    this.open = true;
    this._send = sendFn;
    this._close = closeFn;
    this._h = {};
  }
  on(ev, fn) { (this._h[ev] ||= []).push(fn); return this; }
  emit(ev, ...a) { (this._h[ev] || []).forEach(fn => { try { fn(...a); } catch (e) { console.error(e); } }); }
  send(m) { if (this.open) this._send(m); }
  close() { if (!this.open) return; this._close(); this.drop(); }
  drop() { if (!this.open) return; this.open = false; this.emit('close'); }
}

function connectBroker(url, opts) {
  if (!window.mqtt) return Promise.reject(new Error('Не загрузилась сетевая библиотека. Обновите страницу.'));
  return new Promise((resolve, reject) => {
    const client = window.mqtt.connect(url, {
      clientId: 'kahiok_' + rid(10),
      clean: true,
      keepalive: 20,
      reconnectPeriod: 2000,
      connectTimeout: 9000,
      ...opts
    });
    const timer = setTimeout(() => { client.end(true); reject(new Error('timeout')); }, 10000);
    client.once('connect', () => { clearTimeout(timer); resolve(client); });
    client.on('error', e => console.warn('mqtt', e?.message));
  });
}

const enc = obj => JSON.stringify(obj);
function dec(buf) {
  try { return JSON.parse(typeof buf === 'string' ? buf : new TextDecoder().decode(buf)); } catch { return null; }
}

// ---------- Ведущий ----------

// Создаёт комнату. onConnection(conn) вызывается для каждого подключившегося игрока.
export async function createHost(onConnection, onTrouble) {
  let client = null;
  let idx = -1;
  let pin = '';
  const order = new URLSearchParams(location.search).get('mqtt') ? [0] : [0, 1, 2];
  for (const i of order) {
    pin = String(i + 1) + String(crypto.getRandomValues(new Uint32Array(1))[0] % 100000).padStart(5, '0');
    try {
      client = await connectBroker(brokerUrl(i), {
        will: { topic: ROOT + pin + '/all', payload: enc({ t: '_hostgone' }), qos: 0, retain: false }
      });
      idx = i;
      break;
    } catch {
      client = null;
    }
  }
  if (!client) throw new Error('Не удалось подключиться к серверу соединений. Проверьте интернет и попробуйте снова.');

  const base = ROOT + pin;
  const conns = new Map(); // sid -> { conn, last }
  const pub = (topic, obj, qos = 1) => client.publish(topic, enc(obj), { qos });

  client.subscribe(base + '/up', { qos: 1 });
  client.on('message', (topic, payload) => {
    if (topic !== base + '/up') return;
    const msg = dec(payload);
    if (!msg || typeof msg.sid !== 'string' || !msg.m) return;
    const sid = msg.sid;
    const m = msg.m;
    let entry = conns.get(sid);
    if (m.t === '_hello') {
      if (!entry) {
        const conn = new Conn(
          data => pub(base + '/to/' + sid, data),
          () => pub(base + '/to/' + sid, { t: '_closed' })
        );
        entry = { conn, last: Date.now() };
        conns.set(sid, entry);
        conn.on('close', () => conns.delete(sid));
        onConnection(conn);
      }
      entry.last = Date.now();
      pub(base + '/to/' + sid, { t: '_welcome' });
      return;
    }
    if (!entry) {
      // Соединение уже считается закрытым — пусть игрок переподключится
      if (m.t !== '_bye') pub(base + '/to/' + sid, { t: '_closed' }, 0);
      return;
    }
    entry.last = Date.now();
    if (m.t === '_bye') { entry.conn.drop(); return; }
    if (m.t === '_ping') return;
    entry.conn.emit('data', m);
  });

  let offline = false;
  client.on('offline', () => { if (!offline) { offline = true; onTrouble && onTrouble('Связь с сервером потеряна, переподключаемся…'); } });
  client.on('connect', () => { offline = false; });

  const pinger = setInterval(() => {
    if (client.connected) pub(base + '/all', { t: '_ping' }, 0);
    const now = Date.now();
    for (const { conn, last } of [...conns.values()]) if (now - last > DEAD_MS) conn.drop();
  }, PING_MS);

  return {
    pin,
    broker: idx,
    destroy() {
      clearInterval(pinger);
      try { pub(base + '/all', { t: '_hostgone' }, 0); } catch { /* ignore */ }
      setTimeout(() => client.end(true), 300);
    }
  };
}

// ---------- Игрок ----------

// Подключение игрока к комнате по PIN. Возвращает { conn, peer }.
export async function joinGame(pin) {
  const i = Number(String(pin)[0]) - 1;
  if (!/^\d{6}$/.test(pin) || !(new URLSearchParams(location.search).get('mqtt') || BROKERS[i])) {
    throw new Error('Игра с таким PIN не найдена.');
  }
  const base = ROOT + pin;
  const sid = rid(12);
  let client;
  try {
    client = await connectBroker(brokerUrl(i), {
      will: { topic: base + '/up', payload: enc({ sid, m: { t: '_bye' } }), qos: 1, retain: false }
    });
  } catch {
    throw new Error('Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.');
  }
  const up = (m, qos = 1) => client.publish(base + '/up', enc({ sid, m }), { qos });

  return new Promise((resolve, reject) => {
    let welcomed = false;
    let lastHost = Date.now();
    let pinger = null;
    let hello = null;
    const conn = new Conn(m => up(m), () => up({ t: '_bye' }));
    const shutdown = () => {
      clearInterval(pinger);
      clearInterval(hello);
      try { client.end(true); } catch { /* ignore */ }
    };
    conn.on('close', shutdown);

    client.subscribe([base + '/to/' + sid, base + '/all'], { qos: 1 }, () => {
      up({ t: '_hello' });
      hello = setInterval(() => { if (!welcomed) up({ t: '_hello' }); }, 3000);
    });

    const timeout = setTimeout(() => {
      if (welcomed) return;
      shutdown();
      reject(new Error('Игра с таким PIN не найдена. Проверьте цифры — и что ведущий не закрыл вкладку.'));
    }, 12000);

    client.on('message', (topic, payload) => {
      const m = dec(payload);
      if (!m) return;
      lastHost = Date.now();
      if (m.t === '_welcome') {
        if (!welcomed) {
          welcomed = true;
          clearTimeout(timeout);
          clearInterval(hello);
          pinger = setInterval(() => {
            if (client.connected) up({ t: '_ping' }, 0);
            if (Date.now() - lastHost > DEAD_MS) conn.drop();
          }, PING_MS);
          resolve({ conn, peer: { destroy: () => conn.close(), on() {} } });
        }
        return;
      }
      if (!welcomed) return;
      if (m.t === '_ping') return;
      if (m.t === '_closed' || m.t === '_hostgone') { conn.drop(); return; }
      conn.emit('data', m);
    });
  });
}

export function safeSend(conn, msg) {
  try {
    if (conn && conn.open) conn.send(msg);
  } catch (e) {
    console.warn('send failed', e);
  }
}
