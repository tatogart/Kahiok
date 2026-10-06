import { $, $$, show, esc, ICONS, toast, confirmDialog, modal, shapeSvg, answerStyle, onLeave, hueFrom } from './ui.js';
import * as store from './store.js';
import * as audio from './audio.js';

const EMOJIS = ['🧠', '🌍', '🚀', '🎬', '🎵', '⚽', '🍕', '🐶', '🧪', '📚', '🎨', '💻', '🏛️', '🧮', '🗺️', '🎮', '🦖', '🌿', '🍎', '🎉', '❤️', '⭐', '🔥', '❓'];
const TIMES = [5, 10, 20, 30, 45, 60, 90, 120];
const TYPE_LABELS = { quiz: 'Викторина', truefalse: 'Верно / Неверно', poll: 'Опрос (без очков)' };
const POINT_LABELS = { 0: 'Без очков', 1: 'Обычные', 2: 'Двойные' };

function blankQuestion(type = 'quiz') {
  return store.normalizeQuestion({ type, time: type === 'truefalse' ? 10 : 20, points: type === 'poll' ? 0 : 1 });
}

export function openEditor(nav, quizId) {
  const existing = quizId ? store.getQuiz(quizId) : null;
  const draft = existing ? structuredClone(existing) : store.normalizeQuiz({ title: '', emoji: '🧠', questions: [blankQuestion()] });
  if (!draft.questions.length) draft.questions.push(blankQuestion());
  let sel = 0;
  let dirty = !existing;
  let problems = [];

  const root = show(`
    <header class="topbar editor-top">
      <button class="btn btn-ghost btn-sm" id="ed-back">${ICONS.back} <span class="hide-sm">Назад</span></button>
      <button class="emoji-btn" id="ed-emoji" title="Иконка квиза"></button>
      <input class="input title-input" id="ed-title" maxlength="120" placeholder="Название квиза" value="${esc(draft.title)}">
      <div class="topbar-right">
        <button class="btn btn-white btn-sm" id="ed-save">Сохранить</button>
        <button class="btn btn-green btn-sm" id="ed-play">${ICONS.play} <span class="hide-sm">Провести</span></button>
      </div>
    </header>
    <div class="editor">
      <aside class="ed-side">
        <ol class="ed-list" id="ed-list"></ol>
        <div class="ed-add">
          <button class="btn btn-primary btn-sm btn-block" data-add="quiz">${ICONS.plus} Викторина</button>
          <div class="ed-add-row">
            <button class="btn btn-ghost btn-xs" data-add="truefalse">+ Верно/Неверно</button>
            <button class="btn btn-ghost btn-xs" data-add="poll">+ Опрос</button>
          </div>
        </div>
      </aside>
      <section class="ed-main" id="ed-main"></section>
      <aside class="ed-settings" id="ed-settings"></aside>
    </div>
  `, 'editor-screen');

  const listEl = $('#ed-list', root);
  const mainEl = $('#ed-main', root);
  const setEl = $('#ed-settings', root);

  const markDirty = () => { dirty = true; };

  // ---------- Список вопросов ----------

  function thumb(q, i) {
    const bad = problems.some(p => p.index === i);
    return `
      <li class="ed-item ${i === sel ? 'active' : ''} ${bad ? 'bad' : ''}" draggable="true" data-i="${i}">
        <span class="ed-num">${i + 1}</span>
        <div class="ed-thumb">
          <div class="ed-thumb-type">${TYPE_LABELS[q.type]}</div>
          <div class="ed-thumb-text">${esc(q.text) || '<i>Новый вопрос</i>'}</div>
          <div class="ed-thumb-ans">${q.answers.map((a, j) =>
            `<span class="c-${answerStyle(q.type, j).color} ${a.correct ? 'ok' : ''} ${a.text.trim() ? '' : 'empty'}"></span>`).join('')}</div>
        </div>
      </li>`;
  }

  function renderList() {
    listEl.innerHTML = draft.questions.map(thumb).join('');
  }

  listEl.addEventListener('click', e => {
    const item = e.target.closest('.ed-item');
    if (!item) return;
    sel = +item.dataset.i;
    renderAll();
  });

  // Перетаскивание для смены порядка
  let dragFrom = null;
  listEl.addEventListener('dragstart', e => {
    const item = e.target.closest('.ed-item');
    if (!item) return;
    dragFrom = +item.dataset.i;
    item.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  listEl.addEventListener('dragover', e => {
    e.preventDefault();
    const item = e.target.closest('.ed-item');
    $$('.ed-item', listEl).forEach(x => x.classList.toggle('drop-target', x === item));
  });
  listEl.addEventListener('dragend', () => $$('.ed-item', listEl).forEach(x => x.classList.remove('dragging', 'drop-target')));
  listEl.addEventListener('drop', e => {
    e.preventDefault();
    const item = e.target.closest('.ed-item');
    if (!item || dragFrom === null) return;
    const to = +item.dataset.i;
    moveQuestion(dragFrom, to);
    dragFrom = null;
  });

  function moveQuestion(from, to) {
    if (to < 0 || to >= draft.questions.length || from === to) return;
    const [q] = draft.questions.splice(from, 1);
    draft.questions.splice(to, 0, q);
    if (sel === from) sel = to;
    else if (from < sel && to >= sel) sel--;
    else if (from > sel && to <= sel) sel++;
    markDirty();
    refreshProblems(false);
    renderAll();
  }

  $$('[data-add]', root).forEach(b => b.addEventListener('click', () => {
    draft.questions.splice(sel + 1, 0, blankQuestion(b.dataset.add));
    sel++;
    markDirty();
    renderAll();
    audio.sfx('pop');
    setTimeout(() => {
      $('.ed-item.active', listEl)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      $('#q-text', mainEl)?.focus();
    }, 30);
  }));

  // ---------- Основная область ----------

  function renderMain() {
    const q = draft.questions[sel];
    const fixed = q.type === 'truefalse';
    mainEl.innerHTML = `
      <div class="ed-q-wrap pop-in" key="${q.id}">
        <textarea class="ed-qtext" id="q-text" maxlength="200" rows="2" placeholder="Введите вопрос">${esc(q.text)}</textarea>
        <div class="ed-media ${q.image ? 'has-img' : ''}" id="q-media">
          ${q.image
            ? `<img src="${esc(q.image)}" alt=""><div class="ed-media-tools"><button class="btn btn-white btn-xs" id="q-img">Заменить</button><button class="btn btn-danger btn-xs" id="q-img-del">Убрать</button></div>`
            : `<button class="ed-media-add" id="q-img">${ICONS.image}<span>Добавить картинку</span><small>Её увидят на большом экране</small></button>`}
        </div>
        <div class="ed-answers n${q.answers.length}">
          ${q.answers.map((a, i) => {
            const st = answerStyle(q.type, i);
            return `
            <div class="ed-ans c-${st.color} ${a.text.trim() || fixed ? 'filled' : ''} ${a.correct ? 'is-correct' : ''}" data-i="${i}">
              <span class="ed-ans-shape">${shapeSvg(st.shape)}</span>
              ${fixed
                ? `<span class="ed-ans-fixed">${esc(a.text)}</span>`
                : `<input class="ed-ans-input" maxlength="90" placeholder="Ответ ${i + 1}${i >= 2 ? ' (необязательно)' : ''}" value="${esc(a.text)}">`}
              ${q.type !== 'poll' ? `<button class="ed-correct" title="Правильный ответ" aria-pressed="${a.correct}">${ICONS.check}</button>` : ''}
            </div>`;
          }).join('')}
        </div>
        ${q.type === 'quiz' ? '<p class="ed-hint">Нажмите галочку, чтобы отметить правильный ответ. Можно отметить несколько.</p>' : ''}
        ${q.type === 'poll' ? '<p class="ed-hint">В опросе нет правильных ответов — игроки просто голосуют.</p>' : ''}
      </div>`;

    const text = $('#q-text', mainEl);
    autoGrow(text);
    text.addEventListener('input', () => {
      q.text = text.value;
      autoGrow(text);
      markDirty();
      updateThumb();
    });

    $$('.ed-ans', mainEl).forEach(box => {
      const i = +box.dataset.i;
      const inp = $('.ed-ans-input', box);
      inp?.addEventListener('input', () => {
        q.answers[i].text = inp.value;
        box.classList.toggle('filled', !!inp.value.trim());
        markDirty();
        updateThumb();
      });
      $('.ed-correct', box)?.addEventListener('click', () => {
        if (q.type === 'truefalse') {
          q.answers.forEach((a, j) => { a.correct = j === i; });
        } else {
          q.answers[i].correct = !q.answers[i].correct;
        }
        $$('.ed-ans', mainEl).forEach((b, j) => {
          b.classList.toggle('is-correct', q.answers[j].correct);
          $('.ed-correct', b)?.setAttribute('aria-pressed', q.answers[j].correct);
        });
        audio.sfx('click');
        markDirty();
        updateThumb();
      });
    });

    $('#q-img', mainEl).addEventListener('click', () => pickImage(q));
    $('#q-img-del', mainEl)?.addEventListener('click', () => { q.image = ''; markDirty(); renderMain(); });
  }

  function updateThumb() {
    const li = $(`.ed-item[data-i="${sel}"]`, listEl);
    if (!li) return;
    if (problems.length) refreshProblems(false);
    li.outerHTML = thumb(draft.questions[sel], sel);
  }

  function autoGrow(t) {
    t.style.height = 'auto';
    t.style.height = Math.min(t.scrollHeight, 220) + 'px';
  }

  // ---------- Настройки вопроса ----------

  function renderSettings() {
    const q = draft.questions[sel];
    setEl.innerHTML = `
      <div class="field">
        <label>Тип вопроса</label>
        <select class="input" id="s-type">${Object.entries(TYPE_LABELS).map(([k, v]) =>
          `<option value="${k}" ${q.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      </div>
      <div class="field">
        <label>Время на ответ</label>
        <div class="chips" id="s-time">${TIMES.map(t =>
          `<button class="chip ${q.time === t ? 'on' : ''}" data-v="${t}">${t < 60 ? t + ' с' : t / 60 + ' мин'}</button>`).join('')}</div>
      </div>
      ${q.type !== 'poll' ? `
      <div class="field">
        <label>Очки</label>
        <div class="chips" id="s-points">${[1, 2, 0].map(p =>
          `<button class="chip ${q.points === p ? 'on' : ''}" data-v="${p}">${POINT_LABELS[p]}</button>`).join('')}</div>
      </div>` : ''}
      <div class="field ed-q-actions">
        <div class="ed-move">
          <button class="icon-btn sm" id="s-up" title="Выше" ${sel === 0 ? 'disabled' : ''}>${ICONS.up}</button>
          <button class="icon-btn sm" id="s-down" title="Ниже" ${sel === draft.questions.length - 1 ? 'disabled' : ''}>${ICONS.down}</button>
        </div>
        <button class="btn btn-ghost btn-xs" id="s-dup">${ICONS.copy} Дублировать</button>
        <button class="btn btn-ghost btn-xs danger" id="s-del" ${draft.questions.length < 2 ? 'disabled' : ''}>${ICONS.trash} Удалить</button>
      </div>
      <hr>
      <div class="field">
        <label>Описание квиза</label>
        <textarea class="input" id="s-desc" rows="3" maxlength="400" placeholder="О чём этот квиз?">${esc(draft.description)}</textarea>
      </div>
      <div class="ed-problems" id="ed-problems"></div>
    `;

    $('#s-type', setEl).addEventListener('change', e => {
      const type = e.target.value;
      const old = q;
      const nq = store.normalizeQuestion({ ...old, type, points: type === 'poll' ? 0 : (old.points || 1) });
      if (type === 'truefalse' && old.type !== 'truefalse') {
        nq.answers = [{ text: 'Верно', correct: true }, { text: 'Неверно', correct: false }];
      }
      if (old.type === 'truefalse' && type !== 'truefalse') {
        nq.answers = [{ text: 'Верно', correct: old.answers[0].correct && type !== 'poll' }, { text: 'Неверно', correct: old.answers[1].correct && type !== 'poll' }, { text: '', correct: false }, { text: '', correct: false }];
      }
      draft.questions[sel] = nq;
      markDirty();
      renderAll();
    });
    $$('#s-time .chip', setEl).forEach(c => c.addEventListener('click', () => {
      q.time = +c.dataset.v; markDirty(); renderSettings();
    }));
    $$('#s-points .chip', setEl).forEach(c => c.addEventListener('click', () => {
      q.points = +c.dataset.v; markDirty(); renderSettings();
    }));
    $('#s-up', setEl).addEventListener('click', () => moveQuestion(sel, sel - 1));
    $('#s-down', setEl).addEventListener('click', () => moveQuestion(sel, sel + 1));
    $('#s-dup', setEl).addEventListener('click', () => {
      const copy = structuredClone(q);
      copy.id = Math.random().toString(36).slice(2, 10);
      draft.questions.splice(sel + 1, 0, copy);
      sel++;
      markDirty();
      renderAll();
    });
    $('#s-del', setEl).addEventListener('click', async () => {
      if (draft.questions.length < 2) return;
      if (q.text.trim() && !(await confirmDialog('Удалить этот вопрос?', 'Удалить', true))) return;
      draft.questions.splice(sel, 1);
      sel = Math.max(0, sel - 1);
      markDirty();
      refreshProblems(false);
      renderAll();
    });
    $('#s-desc', setEl).addEventListener('input', e => { draft.description = e.target.value; markDirty(); });
    renderProblems();
  }

  function renderProblems() {
    const box = $('#ed-problems', setEl);
    if (!box) return;
    box.innerHTML = problems.length ? `
      <div class="problems-box">
        <b>Нужно исправить:</b>
        <ul>${problems.slice(0, 8).map(p => `<li data-i="${p.index}">${p.index >= 0 ? `Вопрос ${p.index + 1}: ` : ''}${esc(p.msg)}</li>`).join('')}</ul>
      </div>` : '';
    $$('li[data-i]', box).forEach(li => li.addEventListener('click', () => {
      const i = +li.dataset.i;
      if (i >= 0) { sel = i; renderAll(); }
    }));
  }

  function refreshProblems(render = true) {
    problems = store.validateQuiz(draft);
    if (render) { renderList(); renderProblems(); }
  }

  function renderAll() {
    renderList();
    renderMain();
    renderSettings();
  }

  // ---------- Картинки ----------

  async function pickImage(q) {
    const res = await modal({
      title: 'Картинка к вопросу',
      body: `
        <div class="field"><label>Ссылка на картинку</label>
          <input class="input" id="img-url" placeholder="https://..." value="${q.image.startsWith('data:') ? '' : esc(q.image)}"></div>
        <div class="img-or">или</div>
        <label class="btn btn-ghost btn-block" for="img-file">${ICONS.upload} Загрузить с устройства</label>
        <input type="file" id="img-file" accept="image/*" hidden>
        <p class="hint">Загруженные картинки сжимаются и хранятся вместе с квизом.</p>`,
      actions: [{ label: 'Отмена', value: null }, { label: 'Готово', value: w => ({ url: $('#img-url', w).value.trim() }), cls: 'btn-primary' }],
      onMount(wrap, close) {
        $('#img-file', wrap).addEventListener('change', async e => {
          const f = e.target.files[0];
          if (!f) return;
          try {
            const data = await resizeImage(f, 960);
            close({ url: data });
          } catch {
            toast('Не удалось прочитать картинку', 'error');
          }
        });
      }
    });
    if (!res) return;
    if (res.url && !/^(https?:|data:image\/)/.test(res.url)) { toast('Ссылка должна начинаться с http(s)://', 'error'); return; }
    q.image = res.url;
    markDirty();
    renderMain();
  }

  function resizeImage(file, max) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k);
        c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(img.src);
        resolve(c.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  // ---------- Верхняя панель ----------

  const emojiBtn = $('#ed-emoji', root);
  const paintEmoji = () => {
    emojiBtn.textContent = draft.emoji || '❓';
    emojiBtn.style.setProperty('--h', hueFrom(draft.id + draft.title));
  };
  paintEmoji();
  emojiBtn.addEventListener('click', async () => {
    const e = await modal({
      title: 'Иконка квиза',
      body: `<div class="emoji-grid">${EMOJIS.map(x => `<button class="emoji-pick" data-e="${x}">${x}</button>`).join('')}</div>`,
      actions: [{ label: 'Отмена', value: null }],
      onMount(wrap, close) {
        $$('.emoji-pick', wrap).forEach(b => b.addEventListener('click', () => close(b.dataset.e)));
      }
    });
    if (e) { draft.emoji = e; markDirty(); paintEmoji(); }
  });

  $('#ed-title', root).addEventListener('input', e => { draft.title = e.target.value; markDirty(); });

  function save(silent = false) {
    if (!draft.title.trim()) draft.title = 'Мой квиз';
    $('#ed-title', root).value = draft.title;
    const ok = store.saveQuiz(store.normalizeQuiz(draft));
    if (!ok) {
      toast('Не хватает места в браузере. Уберите большие картинки.', 'error', 5000);
      return false;
    }
    dirty = false;
    refreshProblems();
    if (!silent) toast(problems.length ? 'Сохранено, но есть незаполненные вопросы' : 'Квиз сохранён', problems.length ? 'warn' : 'ok');
    return true;
  }

  $('#ed-save', root).addEventListener('click', () => { audio.sfx('click'); save(); });

  $('#ed-play', root).addEventListener('click', () => {
    if (!save(true)) return;
    if (problems.length) {
      toast('Сначала исправьте вопросы, отмеченные красным', 'error');
      if (problems[0].index >= 0) { sel = problems[0].index; renderAll(); }
      return;
    }
    nav.host(store.getQuiz(draft.id));
  });

  $('#ed-back', root).addEventListener('click', async () => {
    if (dirty) {
      const r = await modal({
        body: '<p class="modal-text">Сохранить изменения перед выходом?</p>',
        actions: [{ label: 'Не сохранять', value: 'drop', cls: 'btn-ghost danger' }, { label: 'Отмена', value: null }, { label: 'Сохранить', value: 'save', cls: 'btn-primary' }]
      });
      if (!r) return;
      if (r === 'save' && !save(true)) return;
    }
    nav.library();
  });

  // Ctrl+S
  const onKey = e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
  };
  document.addEventListener('keydown', onKey);
  const onUnload = e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', onUnload);
  onLeave(() => {
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('beforeunload', onUnload);
  });

  if (existing) refreshProblems(false);
  renderAll();
  if (!existing) setTimeout(() => $('#ed-title', root).focus(), 100);
}
