// Сеть: WebRTC через PeerJS. Браузер ведущего — это и есть «сервер» игры,
// публичный сигнальный сервер PeerJS нужен только чтобы игроки нашли ведущего по PIN.

const PREFIX = 'kahiok-v1-';

// Для локальной отладки можно указать свой PeerServer:
// ?peerhost=localhost&peerport=9000&peerpath=/
function peerOptions() {
  const p = new URLSearchParams(location.search);
  const o = { debug: 0 };
  if (p.get('peerhost')) {
    o.host = p.get('peerhost');
    o.port = +(p.get('peerport') || 9000);
    o.path = p.get('peerpath') || '/';
    o.secure = p.get('peersecure') === '1';
  }
  return o;
}

function randomPin() {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 900000 + 100000;
  return String(n);
}

function errorText(err) {
  const map = {
    'browser-incompatible': 'Браузер не поддерживает WebRTC. Попробуйте Chrome, Safari или Firefox.',
    'network': 'Нет связи с сервером. Проверьте интернет.',
    'server-error': 'Сервер соединений недоступен. Попробуйте ещё раз.',
    'socket-error': 'Ошибка соединения с сервером.',
    'socket-closed': 'Соединение с сервером закрыто.',
    'peer-unavailable': 'Игра с таким PIN не найдена.',
    'webrtc': 'Ошибка WebRTC-соединения.'
  };
  return map[err?.type] || err?.message || 'Неизвестная ошибка сети';
}

// Создаёт комнату ведущего. onConnection(conn) вызывается для каждого игрока.
export function createHost(onConnection, onTrouble) {
  if (!window.Peer) return Promise.reject(new Error('Не загрузилась библиотека PeerJS'));
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const tryOpen = () => {
      attempts++;
      const pin = randomPin();
      const peer = new window.Peer(PREFIX + pin, peerOptions());
      let opened = false;
      const timer = setTimeout(() => {
        if (!opened) { peer.destroy(); reject(new Error('Сервер соединений не отвечает. Проверьте интернет и попробуйте снова.')); }
      }, 15000);
      peer.on('open', () => {
        opened = true;
        clearTimeout(timer);
        resolve({ peer, pin, destroy: () => peer.destroy() });
      });
      peer.on('connection', conn => onConnection(conn));
      peer.on('disconnected', () => {
        // Сигнальный сервер отвалился — уже открытые соединения с игроками живы,
        // переподключаемся, чтобы новые игроки тоже могли войти.
        if (!peer.destroyed) setTimeout(() => { try { peer.reconnect(); } catch { /* ignore */ } }, 1000);
      });
      peer.on('error', err => {
        if (!opened) {
          clearTimeout(timer);
          peer.destroy();
          if (err.type === 'unavailable-id' && attempts < 6) tryOpen();
          else reject(new Error(errorText(err)));
        } else if (err.type !== 'peer-unavailable') {
          onTrouble && onTrouble(errorText(err));
        }
      });
    };
    tryOpen();
  });
}

// Подключение игрока к комнате по PIN. Возвращает { conn, peer }.
export function joinGame(pin) {
  if (!window.Peer) return Promise.reject(new Error('Не загрузилась библиотека PeerJS'));
  return new Promise((resolve, reject) => {
    const peer = new window.Peer(peerOptions());
    let done = false;
    const fail = msg => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      peer.destroy();
      reject(new Error(msg));
    };
    const timer = setTimeout(() => fail('Не удалось подключиться к игре. Проверьте PIN и интернет.'), 20000);
    peer.on('open', () => {
      const conn = peer.connect(PREFIX + pin, { reliable: true, serialization: 'json' });
      conn.on('open', () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve({ conn, peer });
      });
      conn.on('error', err => fail(errorText(err)));
    });
    peer.on('error', err => fail(errorText(err)));
  });
}

export function safeSend(conn, msg) {
  try {
    if (conn && conn.open) conn.send(msg);
  } catch (e) {
    console.warn('send failed', e);
  }
}
