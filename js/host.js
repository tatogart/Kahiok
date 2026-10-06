// Экран ведущего: лобби, вопросы, результаты, таблица лидеров и пьедестал.
// Браузер ведущего хранит всё состояние игры и рассылает его игрокам.

import { $, $$, show, esc, ICONS, toast, confirmDialog, modal, shapeSvg, ANSWER_STYLES, countUp, fmtNum, plural, download, uid } from './ui.js';
import * as audio from './audio.js';
import { createHost, safeSend } from './net.js';
import { playableQuestions } from './store.js';
import { burst, celebrate, rain } from './fx.js';

const BOT_NAMES = ['Робо-Борис', 'Кибер-Катя', 'Нейро-Ника', 'Бит', 'Пиксель', 'Чипушка', 'Тостер3000', 'Вертер', 'Бот-Ботаник', 'Флешка', 'Байтик', 'Электроник', 'Шуруп', 'Гигабайт', 'Микросхема'];
const INTRO_MS = 4200;
const MAX_PLAYERS = 120;

export function hostGame(nav, quiz) {
  const G = {
    quiz,
    questions: playableQuestions(quiz),
    players: new Map(), // cid -> player
    order: [], // порядок присоединения
    qi: -1,
    phase: 'connecting',
    locked: false,
    opts: { shuffle: false, showText: true },
    answers: new Map(),
    qStart: 0,
    limit: 0,
    timers: new Set(),
    raf: 0,
    host: null,
    ended: false
  };

  const later = (fn, ms) => {
    const id = setTimeout(() => { G.timers.delete(id); fn(); }, ms);
    G.timers.add(id);
    return id;
  };
  const clearTimers = () => { G.timers.forEach(clearTimeout); G.timers.clear(); cancelAnimationFrame(G.raf); };

  const players = () => [...G.players.values()];
  const active = () => players().filter(p => p.bot || p.connected);
  const ranked = () => players().sort((a, b) => b.score - a.score || a.joinedAt - b.joinedAt);
  const cur = () => G.questions[G.qi];

  // ---------- Сеть ----------

  function send(p, msg) { if (!p.bot) safeSend(p.conn, msg); }
  function broadcast(build) { players().forEach(p => { const m = build(p); if (m) send(p, m); }); }

  function onConnection(conn) {
    conn.on('data', msg => handleMessage(conn, msg));
    conn.on('close', () => {
      const p = players().find(x => x.conn === conn);
      if (!p) return;
      p.connected = false;
      paintPlayerChip(p);
      if (G.phase === 'question') checkAllAnswered();
    });
    conn.on('error', () => {});
  }

  function handleMessage(conn, msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'join') return handleJoin(conn, msg);
    const p = players().find(x => x.conn === conn);
    if (!p) return;
    if (msg.t === 'answer') registerAnswer(p, msg.q, msg.a);
    if (msg.t === 'react' && G.phase === 'lobby') floatReaction(p, msg.e);
  }

  function handleJoin(conn, msg) {
    const name = String(msg.name || '').replace(/\s+/g, ' ').trim().slice(0, 16);
    const cid = String(msg.cid || '').slice(0, 40) || uid();
    if (G.ended) return reject(conn, 'Игра уже закончилась');
    if (!name) return reject(conn, 'Введите никнейм');
    const existing = G.players.get(cid);
    if (existing) {
      // Переподключение того же игрока — сохраняем очки
      existing.conn = conn;
      existing.connected = true;
      safeSend(conn, { t: 'joined', name: existing.name, quiz: G.quiz.title });
      paintPlayerChip(existing);
      syncPlayer(existing);
      return;
    }
    if (G.locked) return reject(conn, 'Ведущий закрыл вход в игру');
    if (G.players.size >= MAX_PLAYERS) return reject(conn, 'Игра заполнена');
    if (players().some(p => p.name.toLowerCase() === name.toLowerCase())) return reject(conn, 'Этот ник уже занят — придумайте другой', 'name');
    const p = makePlayer(cid, name, conn);
    safeSend(conn, { t: 'joined', name, quiz: G.quiz.title });
    addPlayer(p);
    syncPlayer(p);
  }

  function reject(conn, msg, field) {
    safeSend(conn, { t: 'error', msg, field });
    // При занятом нике соединение оставляем — игрок просто введёт другой
    if (field !== 'name') setTimeout(() => { try { conn.close(); } catch { /* ignore */ } }, 400);
  }

  function makePlayer(cid, name, conn, bot = false) {
    return { cid, name, conn, bot, connected: !bot, score: 0, streak: 0, best: 0, correct: 0, last: null, history: [], joinedAt: performance.now(), rank: 0, prevRank: 0, prevScore: 0 };
  }

  function addPlayer(p) {
    G.players.set(p.cid, p);
    G.order.push(p.cid);
    if (G.phase === 'lobby') {
      addPlayerChip(p);
      audio.sfx('join');
    } else {
      toast(`${p.name} присоединяется к игре`, 'info', 2000);
    }
  }

  // Сообщить игроку текущее состояние (для новых и переподключившихся)
  function syncPlayer(p) {
    const base = { score: p.score, pin: G.host?.pin };
    switch (G.phase) {
      case 'lobby': send(p, { t: 'lobby', ...base }); break;
      case 'intro': send(p, { t: 'get-ready', ...base, ...introPayload() }); break;
      case 'question':
        if (G.answers.has(p.cid)) send(p, { t: 'answered', ...base });
        else send(p, { t: 'question', ...base, ...questionPayload(), remaining: Math.max(0, G.limit - (performance.now() - G.qStart)) });
        break;
      case 'podium': case 'final': send(p, endPayload(p)); break;
      default:
        send(p, p.last ? { t: 'result', ...p.last } : { t: 'wait', ...base });
    }
  }

  function introPayload() {
    const q = cur();
    return { q: G.qi, total: G.questions.length, type: q.type, text: q.text, points: q.points };
  }

  function questionPayload() {
    const q = cur();
    return {
      q: G.qi,
      total: G.questions.length,
      type: q.type,
      text: G.opts.showText ? q.text : '',
      time: q.time,
      answers: q.answers.map(a => ({ slot: a.slot, text: G.opts.showText ? a.text : '' }))
    };
  }

  // ---------- Запуск ----------

  show(`
    <div class="center-stage">
      <div class="loader-shapes">${ANSWER_STYLES.map(s => `<span class="c-${s.color}">${shapeSvg(s.shape)}</span>`).join('')}</div>
      <p class="stage-text">Создаём игровую комнату…</p>
    </div>`, 'host-connecting');

  createHost(onConnection, msg => toast(msg, 'warn'))
    .then(h => {
      G.host = h;
      G.phase = 'lobby';
      renderLobby();
    })
    .catch(err => {
      show(`
        <div class="center-stage">
          <div class="big-emoji">📡</div>
          <h2 class="stage-title">Не получилось создать игру</h2>
          <p class="stage-text">${esc(err.message)}</p>
          <div class="row-btns">
            <button class="btn btn-ghost" id="err-back">${ICONS.back} К квизам</button>
            <button class="btn btn-white" id="err-retry">Попробовать снова</button>
          </div>
        </div>`, 'host-error');
      $('#err-back').addEventListener('click', () => nav.library());
      $('#err-retry').addEventListener('click', () => hostGame(nav, quiz));
    });

  const onUnload = e => { if (G.players.size && !G.ended) { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', onUnload);

  function teardown() {
    clearTimers();
    audio.stopMusic();
    window.removeEventListener('beforeunload', onUnload);
    document.removeEventListener('keydown', onKey);
    if (G.host) {
      broadcast(() => ({ t: 'closed' }));
      const h = G.host;
      setTimeout(() => h.destroy(), 500);
      G.host = null;
    }
  }

  async function exitGame() {
    if (G.players.size && !G.ended && !(await confirmDialog('Завершить игру? Все игроки будут отключены.', 'Завершить', true))) return;
    G.ended = true;
    teardown();
    nav.library();
  }

  // Клавиша «Пробел/Enter» — дальше
  const onKey = e => {
    if (document.querySelector('.modal-wrap')) return;
    if ((e.key === ' ' || e.key === 'Enter') && !/INPUT|TEXTAREA|BUTTON|SELECT/.test(document.activeElement?.tagName)) {
      const next = $('.screen:not(.leave) [data-next]');
      if (next && !next.disabled) { e.preventDefault(); next.click(); }
    }
  };
  document.addEventListener('keydown', onKey);

  // ---------- Лобби ----------

  function joinUrl() {
    return location.origin + location.pathname + location.search + '#join=' + G.host.pin;
  }

  function qrSvg(text) {
    if (!window.qrcode) return '';
    const qr = window.qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    return qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
  }

  function renderLobby() {
    const pin = G.host.pin;
    const prettyPin = pin.length === 6 ? pin.slice(0, 3) + ' ' + pin.slice(3) : pin.slice(0, 3) + ' ' + pin.slice(3, 5) + ' ' + pin.slice(5);
    const displayUrl = (location.host + location.pathname).replace(/\/(index\.html)?$/, '');
    const root = show(`
      <div class="lobby">
        <div class="lobby-top">
          <div class="pin-card slide-down">
            <div class="pin-left">
              <div class="pin-how">Заходи на <b>${esc(displayUrl)}</b><br>или наведи камеру на QR-код</div>
              <div class="pin-label">PIN игры:</div>
              <button class="pin-value" id="copy-link" title="Скопировать ссылку">${prettyPin}</button>
            </div>
            <div class="pin-qr" id="qr" title="Скопировать ссылку">${qrSvg(joinUrl())}</div>
          </div>
        </div>
        <div class="lobby-bar">
          <div class="lobby-count"><span class="ico-wrap">${ICONS.user}</span><b id="pcount">0</b></div>
          <div class="lobby-title">${esc(G.quiz.emoji || '')} ${esc(G.quiz.title)}</div>
          <div class="lobby-actions">
            <button class="icon-btn" id="lock" title="Закрыть вход">${ICONS.unlock}</button>
            <button class="icon-btn" id="settings" title="Настройки игры"><svg viewBox="0 0 24 24" class="ico"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="16" cy="7" r="2.4" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="10" cy="17" r="2.4" fill="none" stroke="currentColor" stroke-width="2.2"/></svg></button>
            <button class="btn btn-white" id="start" data-next disabled>Начать ${ICONS.next}</button>
          </div>
        </div>
        <div class="lobby-players" id="plist">
          <div class="lobby-wait" id="lwait">
            <div class="wait-dots"><span></span><span></span><span></span></div>
            Ждём игроков…
          </div>
        </div>
        <div class="lobby-foot">
          <button class="btn btn-ghost btn-sm" id="exit">${ICONS.back} Выйти</button>
          <button class="btn btn-ghost btn-sm" id="bots" title="Добавить ботов для проверки">${ICONS.robot} Добавить бота</button>
        </div>
      </div>`, 'host-lobby');

    const copy = async () => {
      try { await navigator.clipboard.writeText(joinUrl()); toast('Ссылка для входа скопирована', 'ok'); } catch { toast(joinUrl(), 'info', 6000); }
    };
    $('#copy-link', root).addEventListener('click', copy);
    $('#qr', root).addEventListener('click', copy);
    $('#exit', root).addEventListener('click', exitGame);
    $('#bots', root).addEventListener('click', () => addBot());
    $('#start', root).addEventListener('click', startGame);
    $('#lock', root).addEventListener('click', () => {
      G.locked = !G.locked;
      $('#lock', root).innerHTML = G.locked ? ICONS.lock : ICONS.unlock;
      $('#lock', root).classList.toggle('on', G.locked);
      toast(G.locked ? 'Вход закрыт — новые игроки не смогут войти' : 'Вход снова открыт', 'info');
    });
    $('#settings', root).addEventListener('click', openSettings);
    players().forEach(addPlayerChip);
    updateCount();
    audio.music('lobby');
  }

  async function openSettings() {
    const res = await modal({
      title: 'Настройки игры',
      body: `
        <label class="switch-row"><input type="checkbox" id="o-shuffle" ${G.opts.shuffle ? 'checked' : ''}><span class="switch"></span>
          <span><b>Перемешать вопросы</b><small>Вопросы пойдут в случайном порядке</small></span></label>
        <label class="switch-row"><input type="checkbox" id="o-text" ${G.opts.showText ? 'checked' : ''}><span class="switch"></span>
          <span><b>Показывать текст на телефонах</b><small>Иначе — только цветные фигуры, как в классике</small></span></label>`,
      actions: [{ label: 'Отмена', value: null }, { label: 'Готово', cls: 'btn-primary', value: w => ({ shuffle: $('#o-shuffle', w).checked, showText: $('#o-text', w).checked }) }]
    });
    if (res) G.opts = res;
  }

  function addPlayerChip(p) {
    const list = $('#plist');
    if (!list) return;
    $('#lwait')?.remove();
    const chip = document.createElement('button');
    chip.className = 'player-chip' + (p.bot ? ' bot' : '');
    chip.dataset.cid = p.cid;
    chip.style.setProperty('--tilt', (Math.random() * 6 - 3).toFixed(1) + 'deg');
    chip.title = 'Нажмите, чтобы удалить игрока';
    chip.innerHTML = `${p.bot ? ICONS.robot : ''}<span>${esc(p.name)}</span>`;
    chip.addEventListener('click', () => kick(p));
    list.appendChild(chip);
    paintPlayerChip(p);
    updateCount();
  }

  function paintPlayerChip(p) {
    const chip = document.querySelector(`.player-chip[data-cid="${CSS.escape(p.cid)}"]`);
    if (chip) chip.classList.toggle('offline', !p.bot && !p.connected);
  }

  function updateCount() {
    const n = G.players.size;
    const el = $('#pcount');
    if (el) {
      el.textContent = n;
      el.parentElement.classList.remove('bump');
      void el.offsetWidth;
      el.parentElement.classList.add('bump');
    }
    const start = $('#start');
    if (start) start.disabled = n === 0;
    if (n === 0 && $('#plist') && !$('#lwait')) {
      $('#plist').innerHTML = `<div class="lobby-wait" id="lwait"><div class="wait-dots"><span></span><span></span><span></span></div>Ждём игроков…</div>`;
    }
  }

  function kick(p) {
    send(p, { t: 'kicked' });
    const conn = p.conn;
    setTimeout(() => { try { conn?.close(); } catch { /* ignore */ } }, 300);
    G.players.delete(p.cid);
    G.order = G.order.filter(c => c !== p.cid);
    const chip = document.querySelector(`.player-chip[data-cid="${CSS.escape(p.cid)}"]`);
    if (chip) { chip.classList.add('vanish'); setTimeout(() => { chip.remove(); updateCount(); }, 300); }
    audio.sfx('whoosh');
  }

  function addBot() {
    const used = new Set(players().map(p => p.name));
    const free = BOT_NAMES.filter(n => !used.has(n));
    const name = free.length ? free[Math.floor(Math.random() * free.length)] : 'Бот-' + Math.floor(Math.random() * 1000);
    const bot = makePlayer('bot-' + uid(6), name, null, true);
    bot.skill = 0.45 + Math.random() * 0.45;
    addPlayer(bot);
  }

  function floatReaction(p, e) {
    const allowed = ['👍', '😂', '🔥', '😮', '🎉', '❤️'];
    if (!allowed.includes(e)) return;
    const el = document.createElement('div');
    el.className = 'float-react';
    el.textContent = e;
    el.style.left = (10 + Math.random() * 80) + '%';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2600);
  }

  // ---------- Ход игры ----------

  function startGame() {
    if (!G.players.size) return;
    if (G.opts.shuffle) {
      for (let i = G.questions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [G.questions[i], G.questions[j]] = [G.questions[j], G.questions[i]];
      }
    }
    audio.sfx('whoosh');
    G.qi = -1;
    nextQuestion();
  }

  function nextQuestion() {
    clearTimers();
    G.qi++;
    if (G.qi >= G.questions.length) return showPodium();
    showIntro();
  }

  function topBar(label = '', extra = '') {
    return `
      <div class="hq-bar">
        <span class="hq-pill">${G.qi + 1} / ${G.questions.length}</span>
        <span class="hq-pill ghost">${label}</span>
        <span class="hq-pill ghost">PIN: <b>${G.host.pin}</b></span>
        ${extra}
      </div>`;
  }

  function showIntro() {
    G.phase = 'intro';
    const q = cur();
    audio.stopMusic();
    audio.sfx('whoosh');
    const badge = q.type === 'poll' ? 'Опрос' : q.type === 'truefalse' ? 'Верно или неверно' : 'Викторина';
    show(`
      <div class="intro">
        <div class="intro-num">Вопрос ${G.qi + 1} <span>из ${G.questions.length}</span></div>
        <div class="intro-badges">
          <span class="badge">${badge}</span>
          ${q.points === 2 ? '<span class="badge gold">×2 очков!</span>' : ''}
          ${q.points === 0 && q.type !== 'poll' ? '<span class="badge">Без очков</span>' : ''}
        </div>
        <h2 class="intro-text">${esc(q.text)}</h2>
        <div class="intro-progress"><span style="animation-duration:${INTRO_MS}ms"></span></div>
      </div>`, 'host-intro');
    broadcast(p => ({ t: 'get-ready', score: p.score, ...introPayload() }));
    later(showQuestion, INTRO_MS);
  }

  function answerTiles(q, mode = 'live') {
    return `
      <div class="answer-grid n${q.answers.length} ${mode}">
        ${q.answers.map((a, i) => {
          const st = ANSWER_STYLES[a.slot];
          return `<div class="answer-tile c-${st.color} ${mode === 'result' && q.type !== 'poll' ? (a.correct ? 'right' : 'dim') : ''}" style="animation-delay:${i * 0.07}s">
            <span class="tile-shape">${shapeSvg(st.shape)}</span>
            <span class="tile-text">${esc(a.text)}</span>
            ${mode === 'result' && a.correct && q.type !== 'poll' ? `<span class="tile-mark">${ICONS.check}</span>` : ''}
            ${mode === 'result' && !a.correct && q.type !== 'poll' ? `<span class="tile-mark">${ICONS.cross}</span>` : ''}
          </div>`;
        }).join('')}
      </div>`;
  }

  function showQuestion() {
    G.phase = 'question';
    const q = cur();
    G.answers = new Map();
    G.limit = q.time * 1000;
    const R = 54;
    const C = 2 * Math.PI * R;
    const root = show(`
      <div class="hq">
        ${topBar(q.points === 2 ? '×2 очков' : q.type === 'poll' ? 'Опрос' : '')}
        <h2 class="hq-text">${esc(q.text)}</h2>
        <div class="hq-mid">
          <div class="hq-timer" id="timer">
            <svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="${R}" class="ring-bg"/><circle cx="60" cy="60" r="${R}" class="ring" id="ring" stroke-dasharray="${C}" stroke-dashoffset="0"/></svg>
            <span id="tnum">${q.time}</span>
          </div>
          <div class="hq-media">
            ${q.image ? `<img src="${esc(q.image)}" alt="">` : `<div class="hq-shapes">${ANSWER_STYLES.map(s => `<span class="c-${s.color}">${shapeSvg(s.shape)}</span>`).join('')}</div>`}
          </div>
          <div class="hq-count">
            <b id="acount">0</b>
            <span id="alabel">ответов</span>
            <button class="btn btn-ghost btn-sm" id="skip" data-next>${ICONS.skip} Пропустить</button>
          </div>
        </div>
        ${answerTiles(q)}
      </div>`, 'host-question');
    $('#skip', root).addEventListener('click', () => endQuestion());

    broadcast(p => ({ t: 'question', score: p.score, ...questionPayload(), remaining: G.limit }));
    audio.music('question');

    // Боты отвечают
    active().filter(p => p.bot).forEach(bot => {
      const delay = 900 + Math.random() * G.limit * (0.25 + (1 - bot.skill) * 0.55);
      later(() => {
        let a;
        const right = q.answers.map((x, i) => x.correct ? i : -1).filter(i => i >= 0);
        if (right.length && Math.random() < bot.skill) a = right[Math.floor(Math.random() * right.length)];
        else a = Math.floor(Math.random() * q.answers.length);
        registerAnswer(bot, G.qi, a);
      }, Math.min(delay, G.limit - 300));
    });

    const ring = $('#ring', root);
    const tnum = $('#tnum', root);
    const timerEl = $('#timer', root);
    let lastSec = q.time;
    G.qStart = performance.now();
    const loop = now => {
      if (G.phase !== 'question') return;
      const left = Math.max(0, G.limit - (now - G.qStart));
      const sec = Math.ceil(left / 1000);
      ring.style.strokeDashoffset = (C * (1 - left / G.limit)).toFixed(1);
      if (sec !== lastSec) {
        lastSec = sec;
        tnum.textContent = sec;
        if (sec <= 5 && sec > 0) {
          audio.sfx(sec <= 3 ? 'tickHigh' : 'tick');
          timerEl.classList.add('urgent');
          tnum.classList.remove('pulse'); void tnum.offsetWidth; tnum.classList.add('pulse');
        }
      }
      if (left <= 0) return endQuestion();
      G.raf = requestAnimationFrame(loop);
    };
    G.raf = requestAnimationFrame(loop);
  }

  function registerAnswer(p, qi, a) {
    if (G.phase !== 'question' || qi !== G.qi || G.answers.has(p.cid)) return;
    const q = cur();
    a = Number(a);
    if (!Number.isInteger(a) || a < 0 || a >= q.answers.length) return;
    const ms = Math.min(G.limit, performance.now() - G.qStart);
    G.answers.set(p.cid, { a, ms });
    send(p, { t: 'answered', score: p.score });
    const el = $('#acount');
    if (el) {
      el.textContent = G.answers.size;
      $('#alabel').textContent = plural(G.answers.size, 'ответ', 'ответа', 'ответов');
      el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
    }
    checkAllAnswered();
  }

  function checkAllAnswered() {
    if (G.phase !== 'question') return;
    const act = active();
    if (act.length && act.every(p => G.answers.has(p.cid))) later(() => endQuestion(), 500);
  }

  function endQuestion() {
    if (G.phase !== 'question') return;
    G.phase = 'results';
    clearTimers();
    audio.stopMusic();
    audio.sfx('gong');
    const q = cur();
    const mult = q.type === 'poll' ? 0 : q.points;
    const counts = q.answers.map(() => 0);

    // Запоминаем места до этого вопроса — для анимации таблицы
    ranked().forEach((p, i) => { p.prevRank = i; p.prevScore = p.score; });

    for (const p of players()) {
      const ans = G.answers.get(p.cid);
      let status;
      let points = 0;
      if (ans) counts[ans.a]++;
      if (q.type === 'poll') status = ans ? 'poll' : 'timeout';
      else if (!ans) { status = 'timeout'; if (mult) p.streak = 0; }
      else if (q.answers[ans.a].correct) {
        status = 'correct';
        p.correct++;
        if (mult) {
          p.streak++;
          p.best = Math.max(p.best, p.streak);
          points = Math.round(1000 * mult * (1 - (ans.ms / G.limit) / 2));
          if (p.streak >= 2) points += Math.min((p.streak - 1) * 100, 500);
        }
      } else { status = 'wrong'; if (mult) p.streak = 0; }
      p.score += points;
      p.history.push({ status, points, a: ans?.a ?? null, ms: ans?.ms ?? null });
      p.lastPoints = points;
      p.lastStatus = status;
    }

    const list = ranked();
    list.forEach((p, i) => { p.rank = i; });
    for (const p of list) {
      const ahead = p.rank > 0 ? list[p.rank - 1] : null;
      p.last = {
        status: p.lastStatus,
        points: p.lastPoints,
        score: p.score,
        streak: p.streak,
        rank: p.rank + 1,
        total: list.length,
        ahead: ahead ? { name: ahead.name, gap: ahead.score - p.score } : null,
        correct: q.answers.filter(a => a.correct).map(a => ({ slot: a.slot, text: a.text })),
        last: G.qi === G.questions.length - 1
      };
      send(p, { t: 'result', ...p.last });
    }

    renderResults(q, counts);
  }

  function renderResults(q, counts) {
    const max = Math.max(1, ...counts);
    const isLast = G.qi === G.questions.length - 1;
    const root = show(`
      <div class="hq results">
        ${topBar('', `<button class="btn btn-white hq-next" id="next" data-next>${isLast ? 'Итоги' : 'Далее'} ${ICONS.next}</button>`)}
        <h2 class="hq-text">${esc(q.text)}</h2>
        <div class="hq-mid">
          <div class="chart">
            ${q.answers.map((a, i) => {
              const st = ANSWER_STYLES[a.slot];
              return `<div class="bar-col c-${st.color} ${q.type !== 'poll' && !a.correct ? 'dim' : ''}">
                <div class="bar-num" style="animation-delay:${0.3 + i * 0.1}s">${counts[i]}</div>
                <div class="bar"><span style="--h:${(counts[i] / max) * 100}%; transition-delay:${0.15 + i * 0.1}s"></span></div>
                <div class="bar-label">${shapeSvg(st.shape)}${q.type !== 'poll' && a.correct ? ICONS.check : ''}</div>
              </div>`;
            }).join('')}
          </div>
        </div>
        ${answerTiles(q, 'result')}
      </div>`, 'host-results');
    requestAnimationFrame(() => requestAnimationFrame(() => $$('.bar span', root).forEach(b => b.classList.add('grow'))));
    later(() => audio.sfx('reveal'), 300);
    $('#next', root).addEventListener('click', () => {
      audio.sfx('click');
      if (isLast) showPodium(); else showScoreboard();
    });
  }

  function showScoreboard() {
    G.phase = 'scoreboard';
    const list = ranked();
    const top = list.slice(0, 5);
    // Сначала показываем в старом порядке со старыми очками, затем анимируем
    const startOrder = [...top].sort((a, b) => a.prevRank - b.prevRank);
    const leader = list[0];
    const streakers = list.filter(p => p.streak >= 3).sort((a, b) => b.streak - a.streak);
    const root = show(`
      <div class="scoreboard">
        <div class="sb-head">
          <h2 class="stage-title">Таблица лидеров</h2>
          <button class="btn btn-white" id="next" data-next>Далее ${ICONS.next}</button>
        </div>
        <ol class="sb-list" id="sb">
          ${startOrder.map(p => `
            <li class="sb-row" data-cid="${esc(p.cid)}">
              <span class="sb-rank">${p.prevRank + 1}</span>
              <span class="sb-name">${p.bot ? ICONS.robot : ''}${esc(p.name)}</span>
              ${p.streak >= 2 ? `<span class="sb-streak" title="Серия правильных ответов">${ICONS.fire}${p.streak}</span>` : ''}
              <span class="sb-gain">${p.lastPoints ? '+' + fmtNum(p.lastPoints) : ''}</span>
              <span class="sb-score">${fmtNum(p.prevScore)}</span>
            </li>`).join('')}
        </ol>
        ${streakers.length ? `<p class="sb-note">${ICONS.fire} ${esc(streakers[0].name)} — серия из ${streakers[0].streak} правильных ответов подряд!</p>` : ''}
      </div>`, 'host-scoreboard');
    audio.music('results');
    $('#next', root).addEventListener('click', () => { audio.sfx('click'); nextQuestion(); });

    later(() => {
      const sb = $('#sb', root);
      if (!sb) return;
      const rows = $$('.sb-row', sb);
      const first = new Map(rows.map(r => [r, r.getBoundingClientRect().top]));
      top.forEach((p, i) => {
        const row = rows.find(r => r.dataset.cid === p.cid);
        sb.appendChild(row);
        $('.sb-rank', row).textContent = i + 1;
        countUp($('.sb-score', row), p.prevScore, p.score, 1100);
        if (i < p.prevRank) row.classList.add('moved-up');
        if (i === 0) row.classList.add('first');
      });
      rows.forEach(r => {
        const dy = first.get(r) - r.getBoundingClientRect().top;
        if (!dy) return;
        r.style.transition = 'none';
        r.style.transform = `translateY(${dy}px)`;
        requestAnimationFrame(() => requestAnimationFrame(() => {
          r.style.transition = '';
          r.style.transform = '';
        }));
      });
      if (leader && leader.prevRank !== 0) later(() => audio.sfx('reveal'), 500);
    }, 900);
  }

  // ---------- Финал ----------

  function endPayload(p) {
    const list = ranked();
    return { t: 'end', rank: list.indexOf(p) + 1, total: list.length, score: p.score, correct: p.correct, questions: G.questions.length, best: p.best };
  }

  async function showPodium() {
    G.phase = 'podium';
    clearTimers();
    audio.stopMusic();
    const list = ranked();
    broadcast(p => endPayload(p));
    const [p1, p2, p3] = list;
    const col = (p, place) => p ? `
      <div class="pod pod-${place}">
        <div class="pod-name">${esc(p.name)}</div>
        <div class="pod-block">
          <div class="pod-medal">${place}</div>
          <div class="pod-score">${fmtNum(p.score)}</div>
          <div class="pod-sub">${p.correct} из ${G.questions.length} верно</div>
        </div>
      </div>` : `<div class="pod pod-${place} empty"></div>`;
    const root = show(`
      <div class="podium">
        <h2 class="podium-title">${esc(G.quiz.emoji || '🏆')} ${esc(G.quiz.title)}</h2>
        <div class="podium-stage">
          ${col(p2, 2)}${col(p1, 1)}${col(p3, 3)}
        </div>
        <div class="podium-actions" id="pa">
          <button class="btn btn-ghost" id="full">${ICONS.trophy} Все результаты</button>
          <button class="btn btn-ghost" id="csv">${ICONS.download} Скачать CSV</button>
          <button class="btn btn-white" id="again">Сыграть ещё раз</button>
          <button class="btn btn-ghost" id="done">Завершить</button>
        </div>
      </div>`, 'host-podium');

    $('#full', root).addEventListener('click', showFullResults);
    $('#csv', root).addEventListener('click', exportCsv);
    $('#done', root).addEventListener('click', () => { G.ended = true; teardown(); nav.library(); });
    $('#again', root).addEventListener('click', () => {
      clearTimers();
      // Тот же PIN и те же игроки, очки обнуляются
      for (const p of players()) Object.assign(p, { score: 0, streak: 0, best: 0, correct: 0, last: null, history: [], prevRank: 0, prevScore: 0 });
      for (const p of players()) if (!p.bot && !p.connected) G.players.delete(p.cid);
      G.qi = -1;
      G.questions = playableQuestions(quiz);
      G.phase = 'lobby';
      broadcast(p => ({ t: 'lobby', score: 0 }));
      renderLobby();
    });

    const reveal = (sel, delay) => later(() => {
      const el = $(sel, root);
      if (el) el.classList.add('show');
    }, delay);

    audio.sfx('drumroll', 1.4);
    reveal('.pod-3', 600);
    later(() => p3 && audio.sfx('medal'), 650);
    reveal('.pod-2', 2000);
    later(() => { p2 && audio.sfx('medal'); audio.sfx('drumroll', 2.2); }, 2050);
    reveal('.pod-1', 4300);
    later(() => {
      audio.sfx('fanfare');
      celebrate(4000);
      burst(0.5, 0.45);
      later(() => rain(5000), 1500);
    }, 4350);
    reveal('#pa', 5200);
    G.phase = 'final';
  }

  function showFullResults() {
    const list = ranked();
    modal({
      title: 'Результаты',
      wide: true,
      body: `
        <div class="table-wrap">
          <table class="res-table">
            <thead><tr><th>#</th><th>Игрок</th><th>Очки</th><th>Верно</th><th>Лучшая серия</th></tr></thead>
            <tbody>${list.map((p, i) => `
              <tr><td>${i + 1}</td><td>${esc(p.name)}${p.bot ? ' 🤖' : ''}</td><td>${fmtNum(p.score)}</td>
              <td>${p.correct} / ${G.questions.length}</td><td>${p.best}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>
        <h3 class="modal-sub">По вопросам</h3>
        <div class="table-wrap">
          <table class="res-table">
            <thead><tr><th>#</th><th>Вопрос</th><th>Верно ответили</th></tr></thead>
            <tbody>${G.questions.map((q, i) => {
              const answered = players().filter(p => p.history[i]);
              const ok = answered.filter(p => p.history[i].status === 'correct').length;
              const pct = answered.length ? Math.round(ok / answered.length * 100) : 0;
              return `<tr><td>${i + 1}</td><td>${esc(q.text)}</td><td>${q.type === 'poll' ? 'опрос' : `<span class="pct"><span style="width:${pct}%"></span></span> ${pct}%`}</td></tr>`;
            }).join('')}</tbody>
          </table>
        </div>`,
      actions: [{ label: 'Закрыть', value: true, cls: 'btn-primary' }]
    });
  }

  function exportCsv() {
    const list = ranked();
    const cell = v => `"${String(v).replace(/"/g, '""')}"`;
    const head = ['Место', 'Игрок', 'Очки', 'Верных ответов', ...G.questions.map((q, i) => `В${i + 1}: ${q.text}`)];
    const rows = list.map((p, i) => [i + 1, p.name, p.score, p.correct, ...G.questions.map((_, qi) => {
      const h = p.history[qi];
      if (!h) return '';
      return h.status === 'correct' ? `+${h.points}` : h.status === 'wrong' ? 'неверно' : h.status === 'timeout' ? 'нет ответа' : 'голос';
    })]);
    const csv = '﻿' + [head, ...rows].map(r => r.map(cell).join(';')).join('\n');
    download(`kahiok-${G.quiz.title.replace(/[^\p{L}\p{N}]+/gu, '_')}.csv`, csv, 'text/csv;charset=utf-8');
  }

}
