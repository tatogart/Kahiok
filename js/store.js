// Хранилище квизов в localStorage.
import { uid } from './ui.js';
import { SAMPLE_QUIZZES } from './samples.js';

const KEY = 'kahiok.quizzes.v1';
const SEEDED = 'kahiok.seeded.v1';

let cache = null;

function read() {
  if (cache) return cache;
  try {
    cache = JSON.parse(localStorage.getItem(KEY) || '[]');
    if (!Array.isArray(cache)) cache = [];
  } catch {
    cache = [];
  }
  let seeded = false;
  try { seeded = localStorage.getItem(SEEDED) === '1'; } catch { /* ignore */ }
  if (!seeded) {
    cache = [...SAMPLE_QUIZZES.map(materialize), ...cache];
    write();
    try { localStorage.setItem(SEEDED, '1'); } catch { /* ignore */ }
  }
  return cache;
}

function write() {
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
}

export function normalizeQuiz(raw) {
  const now = Date.now();
  const quiz = {
    id: raw.id || uid(),
    title: String(raw.title || 'Без названия').slice(0, 120),
    emoji: raw.emoji || '',
    description: String(raw.description || '').slice(0, 400),
    sampleId: raw.sampleId || undefined,
    createdAt: raw.createdAt || now,
    updatedAt: raw.updatedAt || now,
    questions: (raw.questions || []).map(q => normalizeQuestion(q))
  };
  return quiz;
}

export function normalizeQuestion(q = {}) {
  const type = ['quiz', 'truefalse', 'poll'].includes(q.type) ? q.type : 'quiz';
  let answers = Array.isArray(q.answers) ? q.answers.slice(0, 4).map(a => ({
    text: String(a?.text ?? '').slice(0, 90),
    correct: !!a?.correct
  })) : [];
  if (type === 'truefalse') {
    const t = answers[0]?.correct ?? true;
    answers = [{ text: 'Верно', correct: t }, { text: 'Неверно', correct: !t }];
  } else {
    while (answers.length < 4) answers.push({ text: '', correct: false });
    if (type === 'poll') answers.forEach(a => { a.correct = false; });
  }
  return {
    id: q.id || uid(8),
    type,
    text: String(q.text ?? '').slice(0, 200),
    image: typeof q.image === 'string' ? q.image : '',
    time: [5, 10, 20, 30, 45, 60, 90, 120].includes(+q.time) ? +q.time : 20,
    points: type === 'poll' ? 0 : ([0, 1, 2].includes(+q.points) ? +q.points : 1),
    answers
  };
}

function materialize(sample) {
  return normalizeQuiz({ ...sample, id: uid() });
}

export function listQuizzes() {
  return [...read()].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getQuiz(id) {
  return read().find(q => q.id === id) || null;
}

export function saveQuiz(quiz) {
  read();
  quiz.updatedAt = Date.now();
  const i = cache.findIndex(q => q.id === quiz.id);
  if (i >= 0) cache[i] = quiz; else cache.push(quiz);
  return write();
}

export function deleteQuiz(id) {
  read();
  cache = cache.filter(q => q.id !== id);
  write();
}

export function duplicateQuiz(id) {
  const src = getQuiz(id);
  if (!src) return null;
  const copy = normalizeQuiz({ ...structuredClone(src), id: uid(), sampleId: undefined, title: src.title + ' (копия)', createdAt: Date.now() });
  copy.questions.forEach(q => { q.id = uid(8); });
  saveQuiz(copy);
  return copy;
}

export function importQuiz(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  const list = Array.isArray(data) ? data : [data];
  const out = [];
  for (const raw of list) {
    if (!raw || !Array.isArray(raw.questions)) throw new Error('Неверный формат файла');
    const quiz = normalizeQuiz({ ...raw, id: uid(), createdAt: Date.now() });
    saveQuiz(quiz);
    out.push(quiz);
  }
  return out;
}

export function restoreSamples() {
  read();
  const existing = new Set(cache.map(q => q.sampleId).filter(Boolean));
  let added = 0;
  for (const s of SAMPLE_QUIZZES) {
    if (!existing.has(s.sampleId)) { cache.push(materialize(s)); added++; }
  }
  write();
  return added;
}

// Проверка квиза перед запуском/сохранением. Возвращает массив { index, msg }.
export function validateQuiz(quiz) {
  const problems = [];
  if (!quiz.questions.length) problems.push({ index: -1, msg: 'Добавьте хотя бы один вопрос' });
  quiz.questions.forEach((q, i) => {
    const filled = q.answers.filter(a => a.text.trim());
    if (!q.text.trim()) problems.push({ index: i, msg: 'Нет текста вопроса' });
    else if (q.type !== 'truefalse' && filled.length < 2) problems.push({ index: i, msg: 'Нужно минимум 2 ответа' });
    else if (q.type !== 'poll' && !q.answers.some(a => a.correct && a.text.trim())) problems.push({ index: i, msg: 'Отметьте правильный ответ' });
  });
  return problems;
}

// Убирает пустые варианты, оставляя порядок (для игры)
export function playableQuestions(quiz) {
  return quiz.questions.map(q => {
    // slot — индекс цвета/фигуры, сохраняется даже если пустые варианты выкинуты
    const answers = q.answers
      .map((a, i) => ({ text: a.text, correct: a.correct, slot: q.type === 'truefalse' ? [1, 0][i] : i }))
      .filter(a => q.type === 'truefalse' || a.text.trim());
    return { ...q, answers };
  });
}
