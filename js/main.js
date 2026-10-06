import { $, show, esc, shapeSvg, ANSWER_STYLES, ICONS } from './ui.js';
import * as audio from './audio.js';
import { showLibrary } from './library.js';
import { openEditor } from './editor.js';
import { hostGame } from './host.js';
import { playerJoin } from './player.js';

// Навигация между разделами (передаётся в модули, чтобы не было циклических импортов)
export const nav = {
  home: () => { setHash(''); renderHome(); },
  library: () => { setHash('library'); showLibrary(nav); },
  edit: quizId => { setHash('edit'); openEditor(nav, quizId); },
  host: quiz => { setHash(''); hostGame(nav, quiz); },
  join: pin => { setHash('join=' + pin); playerJoin(nav, pin); }
};

function setHash(h) {
  const url = location.pathname + location.search + (h ? '#' + h : '');
  history.replaceState(null, '', url);
}

// ---------- Фон с плавающими фигурами ----------

function renderBackground() {
  const bg = $('.bg');
  const items = [];
  for (let i = 0; i < 14; i++) {
    const s = ANSWER_STYLES[i % 4];
    const size = 40 + Math.random() * 110;
    items.push(`<div class="bg-shape" style="
      left:${Math.random() * 100}%;
      top:${Math.random() * 100}%;
      width:${size}px;height:${size}px;
      animation-duration:${18 + Math.random() * 22}s;
      animation-delay:-${Math.random() * 30}s;
      --rot:${Math.random() > 0.5 ? 360 : -360}deg">${shapeSvg(s.shape)}</div>`);
  }
  bg.innerHTML = items.join('');
}

// ---------- Главная ----------

function logoHtml(big = true) {
  const letters = 'Kahiok!'.split('');
  return `<h1 class="logo ${big ? 'logo-big' : ''}" aria-label="Kahiok!">${letters.map((l, i) =>
    `<span style="animation-delay:${0.05 * i}s">${esc(l)}</span>`).join('')}</h1>`;
}
export { logoHtml };

function renderHome() {
  const root = show(`
    <div class="home">
      ${logoHtml(true)}
      <p class="home-tag">Квизы в реальном времени с друзьями, классом или коллегами</p>
      <form class="card join-card pop-in" id="join-form" autocomplete="off">
        <input class="input input-pin" id="pin" inputmode="numeric" pattern="[0-9]*" maxlength="7"
          placeholder="PIN игры" aria-label="PIN игры">
        <button class="btn btn-dark btn-block btn-lg" type="submit">Войти</button>
      </form>
      <div class="home-or"><span>или</span></div>
      <button class="btn btn-white btn-lg host-cta pop-in" id="go-host" style="animation-delay:.1s">
        ${ICONS.play} Создать и провести игру
      </button>
      <ul class="home-steps">
        <li><b>1</b> Выбери или создай квиз</li>
        <li><b>2</b> Покажи PIN на большом экране</li>
        <li><b>3</b> Игроки отвечают с телефонов</li>
      </ul>
    </div>
    <footer class="home-foot">Kahiok! — без регистрации и бесплатно. Квизы хранятся в вашем браузере.</footer>
  `, 'home-screen');

  const pin = $('#pin', root);
  pin.addEventListener('input', () => { pin.value = pin.value.replace(/\D/g, '').slice(0, 7); });
  $('#join-form', root).addEventListener('submit', e => {
    e.preventDefault();
    audio.unlock();
    const v = pin.value.trim();
    if (!/^\d{6,7}$/.test(v)) {
      pin.classList.remove('shake');
      void pin.offsetWidth;
      pin.classList.add('shake');
      pin.focus();
      return;
    }
    nav.join(v);
  });
  $('#go-host', root).addEventListener('click', () => { audio.unlock(); audio.sfx('click'); nav.library(); });
}

// ---------- Кнопки в углу ----------

function initCornerTools() {
  const btn = $('#btn-sound');
  const paint = () => {
    btn.innerHTML = audio.isMuted() ? ICONS.mute : ICONS.sound;
    btn.classList.toggle('off', audio.isMuted());
    btn.title = audio.isMuted() ? 'Включить звук' : 'Выключить звук';
  };
  paint();
  audio.onMuteChange(paint);
  btn.addEventListener('click', () => { audio.unlock(); audio.setMuted(!audio.isMuted()); });

  const fs = $('#btn-fullscreen');
  if (!document.documentElement.requestFullscreen) fs.hidden = true;
  fs.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  });

  // Первый жест пользователя разблокирует аудио
  const unlockOnce = () => { audio.unlock(); window.removeEventListener('pointerdown', unlockOnce); };
  window.addEventListener('pointerdown', unlockOnce);
}

// ---------- Старт ----------

function route() {
  const h = location.hash.replace(/^#/, '');
  const m = h.match(/^join=(\d{6,7})$/) || h.match(/^(\d{6,7})$/);
  if (m) return nav.join(m[1]);
  if (h === 'library' || h === 'edit') return nav.library();
  nav.home();
}

renderBackground();
initCornerTools();
window.addEventListener("hashchange", route);
route();
