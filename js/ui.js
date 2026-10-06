// Общие помощники интерфейса: экраны, тосты, модалки, фигуры ответов.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

export const sleep = ms => new Promise(r => setTimeout(r, ms));

export function uid(len = 10) {
  const abc = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  const buf = crypto.getRandomValues(new Uint8Array(len));
  for (const b of buf) s += abc[b % abc.length];
  return s;
}

// ---------- Фигуры и цвета ответов ----------

const SHAPE_PATHS = {
  triangle: '<path d="M16 3.5 L29.5 27.5 H2.5 Z"/>',
  diamond: '<path d="M16 2 L30 16 L16 30 L2 16 Z"/>',
  circle: '<circle cx="16" cy="16" r="13.5"/>',
  square: '<rect x="3.5" y="3.5" width="25" height="25" rx="1.5"/>'
};

export const ANSWER_STYLES = [
  { color: 'red', shape: 'triangle' },
  { color: 'blue', shape: 'diamond' },
  { color: 'yellow', shape: 'circle' },
  { color: 'green', shape: 'square' }
];

// У «Верно/Неверно» как в оригинале: синий ромб — верно, красный треугольник — неверно.
export function styleIndex(type, i) {
  return type === 'truefalse' ? [1, 0][i] : i;
}

export function answerStyle(type, i) {
  return ANSWER_STYLES[styleIndex(type, i)];
}

export function shapeSvg(shape, cls = 'shape') {
  return `<svg class="${cls}" viewBox="0 0 32 32" fill="currentColor" aria-hidden="true">${SHAPE_PATHS[shape]}</svg>`;
}

export const ICONS = {
  check: '<svg viewBox="0 0 24 24" class="ico"><path d="M4 12.5l5 5L20 6.5" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  cross: '<svg viewBox="0 0 24 24" class="ico"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/></svg>',
  user: '<svg viewBox="0 0 24 24" class="ico"><circle cx="12" cy="8" r="4.2" fill="currentColor"/><path d="M3.5 21c.8-4.4 4.2-7 8.5-7s7.7 2.6 8.5 7z" fill="currentColor"/></svg>',
  lock: '<svg viewBox="0 0 24 24" class="ico"><rect x="4.5" y="10.5" width="15" height="10.5" rx="2.5" fill="currentColor"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2.4"/></svg>',
  unlock: '<svg viewBox="0 0 24 24" class="ico"><rect x="4.5" y="10.5" width="15" height="10.5" rx="2.5" fill="currentColor"/><path d="M8 10.5V7.5a4 4 0 0 1 7.8-1.3" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  play: '<svg viewBox="0 0 24 24" class="ico"><path d="M7 4.5v15l12.5-7.5z" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
  edit: '<svg viewBox="0 0 24 24" class="ico"><path d="M4 20h4L19 9l-4-4L4 16z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M13.5 6.5l4 4" stroke="currentColor" stroke-width="2.2"/></svg>',
  copy: '<svg viewBox="0 0 24 24" class="ico"><rect x="8" y="8" width="12" height="12" rx="2.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M16 5.5V5a1.5 1.5 0 0 0-1.5-1.5h-9A1.5 1.5 0 0 0 4 5v9a1.5 1.5 0 0 0 1.5 1.5H6" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>',
  trash: '<svg viewBox="0 0 24 24" class="ico"><path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/></svg>',
  download: '<svg viewBox="0 0 24 24" class="ico"><path d="M12 4v11m-5-5l5 5 5-5M5 20h14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  upload: '<svg viewBox="0 0 24 24" class="ico"><path d="M12 16V5m-5 5l5-5 5 5M5 20h14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  plus: '<svg viewBox="0 0 24 24" class="ico"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
  back: '<svg viewBox="0 0 24 24" class="ico"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  next: '<svg viewBox="0 0 24 24" class="ico"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  up: '<svg viewBox="0 0 24 24" class="ico"><path d="M6 15l6-6 6 6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  down: '<svg viewBox="0 0 24 24" class="ico"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  image: '<svg viewBox="0 0 24 24" class="ico"><rect x="3" y="4.5" width="18" height="15" rx="2.5" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="9" cy="10" r="2" fill="currentColor"/><path d="M4 18l5-5 4 4 3-3 4 4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/></svg>',
  robot: '<svg viewBox="0 0 24 24" class="ico"><rect x="4" y="8" width="16" height="12" rx="3" fill="currentColor"/><circle cx="9" cy="14" r="1.6" fill="#fff"/><circle cx="15" cy="14" r="1.6" fill="#fff"/><path d="M12 8V4.5" stroke="currentColor" stroke-width="2.2"/><circle cx="12" cy="4" r="1.6" fill="currentColor"/></svg>',
  fire: '<svg viewBox="0 0 24 24" class="ico"><path d="M12 2.5c1 3.5 5.5 5.5 5.5 11a5.5 5.5 0 0 1-11 0c0-2.6 1.4-4.2 2.5-5.3.3 1.6 1 2.6 2 3-.4-3.2.2-6.2 1-8.7z" fill="currentColor"/></svg>',
  skip: '<svg viewBox="0 0 24 24" class="ico"><path d="M5 5l9 7-9 7zM17 5v14" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  trophy: '<svg viewBox="0 0 24 24" class="ico"><path d="M7 3.5h10v5a5 5 0 0 1-10 0z" fill="currentColor"/><path d="M7 5.5H3.5c0 3 1.5 4.5 3.8 4.8M17 5.5h3.5c0 3-1.5 4.5-3.8 4.8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10.5 13.5h3v3.5h-3zM7.5 20.5c0-2 1.8-3.5 4.5-3.5s4.5 1.5 4.5 3.5z" fill="currentColor"/></svg>',
  sound: '<svg viewBox="0 0 24 24"><path d="M4 9.5h3.5L12.5 5v14l-5-4.5H4z" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M16 8.5a5 5 0 0 1 0 7M18.6 6a8.6 8.6 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  mute: '<svg viewBox="0 0 24 24"><path d="M4 9.5h3.5L12.5 5v14l-5-4.5H4z" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M16 9.5l5 5M21 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>'
};

// ---------- Экраны ----------

let currentScreen = null;
let screenCleanup = null;

// Показывает новый экран с анимацией перехода. Возвращает корневой элемент.
export function show(html, cls = '') {
  const app = $('#app');
  if (screenCleanup) { try { screenCleanup(); } catch (e) { console.error(e); } screenCleanup = null; }
  const next = document.createElement('section');
  next.className = 'screen ' + cls;
  next.innerHTML = html;
  if (currentScreen) {
    const old = currentScreen;
    old.classList.add('leave');
    old.setAttribute('aria-hidden', 'true');
    old.style.pointerEvents = 'none';
    setTimeout(() => old.remove(), 450);
  }
  app.appendChild(next);
  currentScreen = next;
  document.body.dataset.screen = cls.split(' ')[0] || '';
  return next;
}

// Функция, которая вызовется при уходе с текущего экрана.
export function onLeave(fn) { screenCleanup = fn; }

// ---------- Тосты ----------

export function toast(msg, type = 'info', ms = 2800) {
  const box = $('#toasts');
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, ms);
}

// ---------- Модальные окна ----------

export function modal({ title = '', body = '', actions = [{ label: 'OK', value: true, cls: 'btn-primary' }], wide = false, onMount } = {}) {
  return new Promise(resolve => {
    const wrap = document.createElement('div');
    wrap.className = 'modal-wrap';
    wrap.innerHTML = `
      <div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
        ${title ? `<h2 class="modal-title">${esc(title)}</h2>` : ''}
        <div class="modal-body">${body}</div>
        <div class="modal-actions">
          ${actions.map((a, i) => `<button class="btn ${a.cls || 'btn-ghost'}" data-i="${i}">${a.label}</button>`).join('')}
        </div>
      </div>`;
    document.body.appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add('in'));
    const close = value => {
      wrap.classList.remove('in');
      wrap.classList.add('out');
      document.removeEventListener('keydown', onKey);
      setTimeout(() => wrap.remove(), 250);
      resolve(value);
    };
    const onKey = e => { if (e.key === 'Escape') close(null); };
    document.addEventListener('keydown', onKey);
    wrap.addEventListener('mousedown', e => { if (e.target === wrap) close(null); });
    $$('.modal-actions .btn', wrap).forEach(b => b.addEventListener('click', () => {
      const a = actions[+b.dataset.i];
      close(typeof a.value === 'function' ? a.value(wrap) : a.value);
    }));
    if (onMount) onMount(wrap, close);
    const first = $('input, textarea, .btn-primary', wrap);
    if (first) setTimeout(() => first.focus(), 60);
  });
}

export function confirmDialog(text, okLabel = 'Да', danger = false) {
  return modal({
    body: `<p class="modal-text">${esc(text)}</p>`,
    actions: [
      { label: 'Отмена', value: false, cls: 'btn-ghost' },
      { label: okLabel, value: true, cls: danger ? 'btn-danger' : 'btn-primary' }
    ]
  });
}

// ---------- Анимации чисел ----------

export function countUp(el, from, to, dur = 900) {
  const start = performance.now();
  const fmt = n => Math.round(n).toLocaleString('ru-RU');
  const step = now => {
    const k = Math.min(1, (now - start) / dur);
    const e = 1 - Math.pow(1 - k, 3);
    el.textContent = fmt(from + (to - from) * e);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export const fmtNum = n => Math.round(n).toLocaleString('ru-RU');

export function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

export function download(filename, text, type = 'application/json') {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

// Цвет обложки квиза из строки
export function hueFrom(str) {
  let h = 0;
  for (const ch of String(str)) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}
