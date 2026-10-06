// Экран игрока: вход по PIN, ответы с телефона, результаты.

import { $, $$, show, esc, ICONS, shapeSvg, ANSWER_STYLES, uid, fmtNum, countUp, plural } from './ui.js';
import * as audio from './audio.js';
import { joinGame, safeSend } from './net.js';
import { burst, celebrate } from './fx.js';

const WAIT_LINES = [
  'Интересно, другие тоже так думают?',
  'Скрестим пальцы…',
  'Уверенность — половина победы!',
  'Хм, а может, всё-таки другой?..',
  'Было быстро!',
  'Ждём самых задумчивых…'
];

export function playerJoin(nav, pin) {
  const S = {
    pin,
    name: '',
    cid: '',
    conn: null,
    peer: null,
    score: 0,
    joined: false,
    over: false,
    q: null,
    reconnecting: false,
    timerAnim: null
  };

  try {
    S.cid = sessionStorage.getItem('kahiok.cid.' + pin) || uid(12);
    sessionStorage.setItem('kahiok.cid.' + pin, S.cid);
    S.name = sessionStorage.getItem('kahiok.name.' + pin) || '';
  } catch {
    S.cid = uid(12);
  }

  const send = msg => safeSend(S.conn, msg);

  function cleanup() {
    S.over = true;
    try { S.peer?.destroy(); } catch { /* ignore */ }
  }
  const leave = () => { cleanup(); nav.home(); };

  // ---------- Подключение ----------

  function connectingScreen(text = 'Ищем игру…') {
    show(`
      <div class="center-stage">
        <div class="loader-shapes">${ANSWER_STYLES.map(s => `<span class="c-${s.color}">${shapeSvg(s.shape)}</span>`).join('')}</div>
        <p class="stage-text">${esc(text)}</p>
        <p class="stage-hint">PIN: ${esc(pin)}</p>
      </div>`, 'player-connecting');
  }

  async function connect() {
    const { conn, peer } = await joinGame(pin);
    S.conn = conn;
    S.peer = peer;
    conn.on('data', onMessage);
    conn.on('close', onClose);
    peer.on('disconnected', () => { /* сигнальный сервер нам больше не нужен */ });
  }

  async function start() {
    connectingScreen();
    try {
      await connect();
    } catch (err) {
      return errorScreen('Игра не найдена', err.message, true);
    }
    if (S.name) sendJoin(S.name); // авто-вход после перезагрузки страницы
    else nameScreen();
  }

  function sendJoin(name) {
    S.name = name;
    send({ t: 'join', name, cid: S.cid });
  }

  function onClose() {
    if (S.over) return;
    if (!S.joined) return errorScreen('Соединение потеряно', 'Не удалось связаться с ведущим.', true);
    reconnect();
  }

  async function reconnect() {
    if (S.reconnecting || S.over) return;
    S.reconnecting = true;
    showOverlay('Связь потеряна. Переподключаемся…');
    for (let i = 0; i < 6 && !S.over; i++) {
      try {
        try { S.peer?.destroy(); } catch { /* ignore */ }
        await connect();
        sendJoin(S.name);
        S.reconnecting = false;
        hideOverlay();
        return;
      } catch {
        await new Promise(r => setTimeout(r, 1500 * (i + 1)));
      }
    }
    S.reconnecting = false;
    hideOverlay();
    if (!S.over) errorScreen('Связь потеряна', 'Не удалось вернуться в игру. Возможно, ведущий её закрыл.', true);
  }

  function showOverlay(text) {
    hideOverlay();
    const o = document.createElement('div');
    o.className = 'net-overlay';
    o.innerHTML = `<div class="spinner"></div><p>${esc(text)}</p>`;
    document.body.appendChild(o);
  }
  function hideOverlay() { document.querySelector('.net-overlay')?.remove(); }

  function errorScreen(title, text, canRetry) {
    cleanup();
    hideOverlay();
    const root = show(`
      <div class="center-stage">
        <div class="big-emoji wobble">😕</div>
        <h2 class="stage-title">${esc(title)}</h2>
        <p class="stage-text">${esc(text)}</p>
        <div class="row-btns">
          <button class="btn btn-ghost" id="e-home">${ICONS.back} На главную</button>
          ${canRetry ? '<button class="btn btn-white" id="e-retry">Ещё раз</button>' : ''}
        </div>
      </div>`, 'player-error');
    $('#e-home', root).addEventListener('click', () => nav.home());
    $('#e-retry', root)?.addEventListener('click', () => playerJoin(nav, pin));
  }

  // ---------- Никнейм ----------

  function nameScreen(error = '') {
    const root = show(`
      <div class="player-center">
        <div class="mini-logo">Kahiok!</div>
        <form class="card join-card pop-in" id="name-form" autocomplete="off">
          <input class="input input-pin ${error ? 'shake' : ''}" id="nick" maxlength="16" placeholder="Никнейм" aria-label="Никнейм" value="${esc(S.name)}">
          ${error ? `<p class="form-error">${esc(error)}</p>` : ''}
          <button class="btn btn-dark btn-block btn-lg" type="submit">Поехали!</button>
        </form>
        <button class="btn btn-ghost btn-sm" id="n-back">${ICONS.back} Другой PIN</button>
      </div>`, 'player-name');
    const nick = $('#nick', root);
    setTimeout(() => nick.focus(), 80);
    $('#n-back', root).addEventListener('click', leave);
    $('#name-form', root).addEventListener('submit', e => {
      e.preventDefault();
      const v = nick.value.replace(/\s+/g, ' ').trim();
      if (!v) {
        nick.classList.remove('shake'); void nick.offsetWidth; nick.classList.add('shake');
        return;
      }
      audio.unlock();
      $('button[type=submit]', root).disabled = true;
      sendJoin(v);
    });
  }

  // ---------- Сообщения от ведущего ----------

  function onMessage(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (typeof msg.score === 'number') S.score = msg.score;
    switch (msg.t) {
      case 'error':
        if (msg.field === 'name' || !S.joined) {
          if (msg.field === 'name') { S.name = ''; return nameScreen(msg.msg); }
          return errorScreen('Не получилось войти', msg.msg, false);
        }
        break;
      case 'joined':
        S.joined = true;
        S.name = msg.name;
        S.quizTitle = msg.quiz;
        try { sessionStorage.setItem('kahiok.name.' + pin, S.name); } catch { /* ignore */ }
        break;
      case 'lobby': lobbyScreen(); break;
      case 'get-ready': getReadyScreen(msg); break;
      case 'question': questionScreen(msg); break;
      case 'answered': answeredScreen(); break;
      case 'result': resultScreen(msg); break;
      case 'wait': waitScreen(); break;
      case 'end': endScreen(msg); break;
      case 'kicked':
        S.over = true;
        try { sessionStorage.removeItem('kahiok.name.' + pin); } catch { /* ignore */ }
        errorScreen('Тебя удалили из игры', 'Ведущий убрал тебя из списка игроков.', false);
        break;
      case 'closed':
        if (S.over) return;
        if (document.body.dataset.screen === 'player-end') { cleanup(); return; }
        S.over = true;
        errorScreen('Игра завершена', 'Ведущий закрыл комнату. Спасибо за игру!', false);
        break;
    }
  }

  // Нижняя панель с ником и очками
  function statusBar() {
    return `<div class="p-status"><span class="p-name">${esc(S.name)}</span><span class="p-score" id="p-score">${fmtNum(S.score)}</span></div>`;
  }

  function lobbyScreen() {
    const root = show(`
      <div class="player-center">
        <div class="p-big-check pop-in">${ICONS.check}</div>
        <h2 class="stage-title">Ты в игре!</h2>
        <p class="stage-text">Видишь свой ник на экране?</p>
        <div class="p-nick-badge pop-in">${esc(S.name)}</div>
        ${S.quizTitle ? `<p class="stage-hint">Квиз: ${esc(S.quizTitle)}</p>` : ''}
        <div class="reactions">
          ${['👍', '😂', '🔥', '😮', '🎉', '❤️'].map(e => `<button class="react-btn" data-e="${e}">${e}</button>`).join('')}
        </div>
      </div>
      ${statusBar()}`, 'player-lobby');
    let lastReact = 0;
    $$('.react-btn', root).forEach(b => b.addEventListener('click', () => {
      if (Date.now() - lastReact < 600) return;
      lastReact = Date.now();
      send({ t: 'react', e: b.dataset.e });
      b.classList.remove('boing'); void b.offsetWidth; b.classList.add('boing');
    }));
  }

  function getReadyScreen(m) {
    show(`
      <div class="player-center">
        <div class="p-qnum">Вопрос ${m.q + 1}<small> из ${m.total}</small></div>
        <div class="p-ready-ring"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44"/></svg>
          <div class="loader-shapes small">${ANSWER_STYLES.map(s => `<span class="c-${s.color}">${shapeSvg(s.shape)}</span>`).join('')}</div>
        </div>
        <h2 class="stage-title">Приготовься!</h2>
        ${m.points === 2 ? '<p class="badge gold">Двойные очки!</p>' : ''}
      </div>
      ${statusBar()}`, 'player-ready');
  }

  function questionScreen(m) {
    S.q = m;
    const remaining = Math.max(0, m.remaining ?? m.time * 1000);
    const hasText = m.answers.some(a => a.text);
    const root = show(`
      <div class="p-question">
        <div class="p-qhead">
          <span class="hq-pill">${m.q + 1} / ${m.total}</span>
          ${m.text ? `<span class="p-qtext">${esc(m.text)}</span>` : ''}
        </div>
        <div class="p-timer"><span style="animation-duration:${remaining}ms"></span></div>
        <div class="p-answers n${m.answers.length} ${hasText ? 'with-text' : ''}">
          ${m.answers.map((a, i) => {
            const st = ANSWER_STYLES[a.slot];
            return `<button class="p-ans c-${st.color}" data-i="${i}" style="animation-delay:${i * 0.05}s" aria-label="${esc(a.text || st.shape)}">
              ${shapeSvg(st.shape)}${a.text ? `<span>${esc(a.text)}</span>` : ''}
            </button>`;
          }).join('')}
        </div>
      </div>
      ${statusBar()}`, 'player-question');
    let sent = false;
    $$('.p-ans', root).forEach(b => b.addEventListener('click', () => {
      if (sent) return;
      sent = true;
      const i = +b.dataset.i;
      S.choice = m.answers[i];
      if (navigator.vibrate) navigator.vibrate(25);
      audio.sfx('click');
      b.classList.add('chosen');
      $$('.p-ans', root).forEach(x => { if (x !== b) x.classList.add('faded'); });
      send({ t: 'answer', q: m.q, a: i });
      // На случай потери пакета — повтор через секунду, ведущий игнорирует дубли
      setTimeout(() => { if (document.body.dataset.screen === 'player-question' && S.q === m) send({ t: 'answer', q: m.q, a: i }); }, 1500);
    }));
  }

  function answeredScreen() {
    const ch = S.choice;
    const st = ch ? ANSWER_STYLES[ch.slot] : null;
    show(`
      <div class="player-center">
        ${st ? `<div class="p-chosen c-${st.color}">${shapeSvg(st.shape)}</div>` : '<div class="spinner"></div>'}
        <h2 class="stage-title">Ответ принят!</h2>
        <p class="stage-text">${esc(WAIT_LINES[Math.floor(Math.random() * WAIT_LINES.length)])}</p>
      </div>
      ${statusBar()}`, 'player-answered');
  }

  function waitScreen() {
    show(`
      <div class="player-center">
        <div class="spinner"></div>
        <h2 class="stage-title">Подожди немного</h2>
        <p class="stage-text">Скоро следующий вопрос — смотри на большой экран.</p>
      </div>
      ${statusBar()}`, 'player-wait');
  }

  function resultScreen(r) {
    const prev = S.score - (r.points || 0);
    S.score = r.score;
    S.choice = null;
    const title = { correct: 'Верно!', wrong: 'Неверно', timeout: 'Время вышло', poll: 'Голос учтён!' }[r.status];
    const icon = r.status === 'correct' || r.status === 'poll' ? ICONS.check : ICONS.cross;
    let place = '';
    if (r.rank === 1) place = '🥇 Ты на 1 месте!';
    else place = `Ты на ${r.rank} месте`;
    const behind = r.ahead ? (r.ahead.gap > 0
      ? `Отстаёшь от <b>${esc(r.ahead.name)}</b> на ${fmtNum(r.ahead.gap)} ${plural(r.ahead.gap, 'очко', 'очка', 'очков')}`
      : `Делишь место с <b>${esc(r.ahead.name)}</b>`) : (r.total > 1 ? 'Все гонятся за тобой!' : '');
    const showCorrect = (r.status === 'wrong' || r.status === 'timeout') && r.correct?.length;
    const root = show(`
      <div class="p-result ${r.status}">
        <h2 class="p-res-title">${title}</h2>
        <div class="p-res-icon">${icon}</div>
        ${r.status === 'correct' && r.streak >= 2 ? `<div class="p-streak">${ICONS.fire} Серия: ${r.streak}</div>` : ''}
        ${r.status === 'correct' || r.points ? `<div class="p-points">+<span id="pts">0</span></div>` : ''}
        ${r.status === 'wrong' ? '<p class="p-res-sub">Серия прервана. В следующий раз получится!</p>' : ''}
        ${r.status === 'timeout' ? '<p class="p-res-sub">Не успел(а) ответить</p>' : ''}
        ${showCorrect ? `<div class="p-correct">Правильно: ${r.correct.map(c => `<span class="c-${ANSWER_STYLES[c.slot].color}">${shapeSvg(ANSWER_STYLES[c.slot].shape)} ${esc(c.text)}</span>`).join('')}</div>` : ''}
        <div class="p-place">${place}</div>
        ${behind ? `<p class="p-behind">${behind}</p>` : ''}
      </div>
      ${statusBar()}`, 'player-result');
    const pts = $('#pts', root);
    if (pts) countUp(pts, 0, r.points, 900);
    countUp($('#p-score', root), prev, r.score, 1000);
    if (r.status === 'correct') {
      audio.sfx('correct');
      if (navigator.vibrate) navigator.vibrate([30, 50, 30]);
      if (r.streak >= 3) burst(0.5, 0.35);
    } else if (r.status === 'wrong' || r.status === 'timeout') {
      audio.sfx('wrong');
      if (navigator.vibrate) navigator.vibrate(180);
    } else {
      audio.sfx('reveal');
    }
  }

  function endScreen(m) {
    S.over = true;
    S.score = m.score;
    const medal = ['', '🥇', '🥈', '🥉'][m.rank] || '';
    const titles = { 1: 'Победа!', 2: 'Второе место!', 3: 'Третье место!' };
    const root = show(`
      <div class="player-center p-end ${m.rank <= 3 ? 'top' : ''}">
        ${medal ? `<div class="p-medal">${medal}</div>` : `<div class="p-rank-big">${m.rank}<small>место</small></div>`}
        <h2 class="stage-title">${titles[m.rank] || `${m.rank} место из ${m.total}`}</h2>
        <div class="p-end-stats">
          <div><b>${fmtNum(m.score)}</b><span>очков</span></div>
          <div><b>${m.correct}/${m.questions}</b><span>верно</span></div>
          <div><b>${m.best}</b><span>лучшая серия</span></div>
        </div>
        <p class="stage-hint">Смотри на большой экран — там пьедестал!</p>
        <button class="btn btn-white btn-lg" id="again">Сыграть ещё</button>
      </div>`, 'player-end');
    $('#again', root).addEventListener('click', leave);
    try { sessionStorage.removeItem('kahiok.name.' + pin); } catch { /* ignore */ }
    if (m.rank <= 3) setTimeout(() => { celebrate(2500); audio.sfx('fanfare'); }, 4500);
    // Ведущий может начать игру заново — остаёмся на связи
    S.over = false;
  }

  window.addEventListener('beforeunload', cleanup, { once: true });
  start();
}
