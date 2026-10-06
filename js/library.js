import { $, $$, show, esc, ICONS, toast, confirmDialog, download, hueFrom, plural, modal } from './ui.js';
import * as store from './store.js';
import * as audio from './audio.js';

export function showLibrary(nav) {
  const quizzes = store.listQuizzes();
  const card = (qz, i) => {
    const hue = hueFrom(qz.id + qz.title);
    const n = qz.questions.length;
    return `
      <article class="quiz-card pop-in" style="animation-delay:${Math.min(i, 10) * 0.04}s" data-id="${qz.id}">
        <div class="quiz-cover" style="--h:${hue}">
          <span class="quiz-emoji">${esc(qz.emoji || '❓')}</span>
          <span class="quiz-count">${n} ${plural(n, 'вопрос', 'вопроса', 'вопросов')}</span>
        </div>
        <div class="quiz-body">
          <h3 class="quiz-title">${esc(qz.title)}</h3>
          <p class="quiz-desc">${esc(qz.description || 'Без описания')}</p>
        </div>
        <div class="quiz-actions">
          <button class="btn btn-primary btn-sm" data-act="play">${ICONS.play} Провести</button>
          <div class="quiz-tools">
            <button class="icon-btn sm" data-act="edit" title="Редактировать">${ICONS.edit}</button>
            <button class="icon-btn sm" data-act="dup" title="Дублировать">${ICONS.copy}</button>
            <button class="icon-btn sm" data-act="export" title="Скачать JSON">${ICONS.download}</button>
            <button class="icon-btn sm danger" data-act="del" title="Удалить">${ICONS.trash}</button>
          </div>
        </div>
      </article>`;
  };

  const root = show(`
    <header class="topbar">
      <button class="btn btn-ghost btn-sm" id="lib-back">${ICONS.back} Главная</button>
      <div class="topbar-logo">Kahiok!</div>
      <div class="topbar-right"></div>
    </header>
    <div class="library">
      <div class="lib-head">
        <div>
          <h2 class="lib-title">Мои квизы</h2>
          <p class="lib-sub">Выбери квиз и нажми «Провести» — появится PIN для игроков.</p>
        </div>
        <div class="lib-head-actions">
          <button class="btn btn-ghost" id="lib-import">${ICONS.upload} Импорт</button>
          <button class="btn btn-green" id="lib-new">${ICONS.plus} Новый квиз</button>
        </div>
      </div>
      <div class="quiz-grid">
        <button class="quiz-card quiz-new pop-in" id="lib-new2">
          <span class="quiz-new-plus">${ICONS.plus}</span>
          <span>Создать квиз</span>
        </button>
        ${quizzes.map(card).join('')}
      </div>
      ${quizzes.length === 0 ? `<p class="lib-empty">Пока пусто. <button class="link" id="lib-restore">Вернуть примеры</button></p>` : `<p class="lib-empty small"><button class="link" id="lib-restore">Вернуть стандартные квизы</button></p>`}
      <input type="file" id="lib-file" accept=".json,application/json" hidden>
    </div>
  `, 'library-screen');

  const newQuiz = () => { audio.sfx('click'); nav.edit(null); };
  $('#lib-new', root).addEventListener('click', newQuiz);
  $('#lib-new2', root).addEventListener('click', newQuiz);
  $('#lib-back', root).addEventListener('click', () => nav.home());

  $('#lib-restore', root)?.addEventListener('click', () => {
    const n = store.restoreSamples();
    toast(n ? 'Стандартные квизы возвращены' : 'Все стандартные квизы уже на месте', n ? 'ok' : 'info');
    showLibrary(nav);
  });

  const file = $('#lib-file', root);
  $('#lib-import', root).addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    const f = file.files[0];
    if (!f) return;
    try {
      const list = store.importQuiz(await f.text());
      toast(`Импортировано: ${list.length}`, 'ok');
      showLibrary(nav);
    } catch (e) {
      toast('Не удалось импортировать: ' + e.message, 'error');
    }
  });

  $$('.quiz-card[data-id]', root).forEach(el => {
    const id = el.dataset.id;
    el.addEventListener('click', async e => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const quiz = store.getQuiz(id);
      if (!quiz) return;
      switch (btn.dataset.act) {
        case 'play': {
          const problems = store.validateQuiz(quiz);
          if (problems.length) {
            const go = await modal({
              title: 'Квиз не готов',
              body: `<p class="modal-text">Исправьте ошибки в редакторе:</p><ul class="problems">${problems.slice(0, 6).map(p =>
                `<li>${p.index >= 0 ? `Вопрос ${p.index + 1}: ` : ''}${esc(p.msg)}</li>`).join('')}</ul>`,
              actions: [{ label: 'Закрыть', value: false }, { label: 'В редактор', value: true, cls: 'btn-primary' }]
            });
            if (go) nav.edit(id);
            return;
          }
          audio.sfx('click');
          nav.host(quiz);
          break;
        }
        case 'edit': nav.edit(id); break;
        case 'dup': store.duplicateQuiz(id); toast('Копия создана', 'ok'); showLibrary(nav); break;
        case 'export': {
          const { id: _, ...data } = quiz;
          download(`${quiz.title.replace(/[^\p{L}\p{N}]+/gu, '_')}.kahiok.json`, JSON.stringify(data, null, 2));
          break;
        }
        case 'del':
          if (await confirmDialog(`Удалить квиз «${quiz.title}»?`, 'Удалить', true)) {
            el.classList.add('vanish');
            setTimeout(() => { store.deleteQuiz(id); showLibrary(nav); }, 300);
          }
          break;
      }
    });
  });
}
