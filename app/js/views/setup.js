import { getExam } from '../data.js';
import * as store from '../store.js';
import { esc, plural, confirmDialog, $$ } from '../ui.js';
import { buildSession, MODES, mistakeIds, EXAM_LIKE } from '../engine.js';
import { TYPE_LABELS } from '../parser.js';
import { go } from '../main.js';

export async function startSession(exam, mode, opts) {
  const existing = store.getSession();
  if (existing) {
    const ok = await confirmDialog({
      title: 'Replace your unfinished quiz?',
      body: `<p>You have an unfinished quiz in <strong>${esc(existing.examTitle)}</strong> with ${Object.keys(existing.answers).length} answers. Starting a new one discards it.</p>`,
      confirm: 'Start new quiz', danger: true,
    });
    if (!ok) return false;
  }
  const s = buildSession(exam, mode, opts);
  if (!s.questionIds.length) return 'empty';
  store.saveSession(s);
  go('#/quiz');
  return true;
}

export async function render(main, { id, mode }, query) {
  const exam = await getExam(id);
  if (!exam) { main.innerHTML = `<section class="page narrow empty-state"><h1>Exam not found</h1><a class="btn primary" href="#/">See all exams</a></section>`; return; }
  if (!MODES[mode]) { go(`#/exam/${encodeURIComponent(id)}`); return; }
  const settings = store.getSettings();
  const stats = store.getStats(exam.id);
  const saved = store.getSaved(exam.id);
  const e = encodeURIComponent(exam.id);
  const back = `<nav class="crumbs"><a href="#/">Exams</a><a href="#/exam/${e}">${esc(exam.title)}</a></nav>`;

  // ---------- real exam: rules screen ----------
  if (EXAM_LIKE.has(mode)) {
    const mock = mode === 'mock';
    const qs = exam.questions.filter((q) => q.onExam);
    const n = mock ? (qs.length || Math.min(50, exam.questions.length)) : (qs.length || exam.questions.length);
    const pts = mock ? n : (qs.length ? qs : exam.questions).reduce((s, q) => s + (q.points || 1), 0);
    main.innerHTML = `
      <section class="page narrow setup">
        ${back}
        <h1>${mock ? 'Random practice test' : 'Timed practice test'}</h1>
        <p class="note practice-note">Practice only. Your score here is for you and doesn't count toward your grade.</p>
        ${mock ? `<p class="lead">A new set of ${n} questions every time, picked from all ${exam.questions.length} with the same topic mix as the timed practice test.</p>` : ''}
        <div class="exam-rules">
          <dl class="facts-list">
            <div><dt>Questions</dt><dd>${n}${pts !== n ? ` (${pts} points)` : ''}</dd></div>
            <div><dt>Time</dt><dd>${exam.timeLimit ? `${exam.timeLimit} minutes` : 'Untimed'}</dd></div>
            ${exam.passMark ? `<div><dt>Target</dt><dd>${exam.passMark}%</dd></div>` : ''}
          </dl>
          <ul class="rules">
            ${mock ? '<li>Questions are grouped by topic, like the timed practice test, but chosen at random.</li>' : '<li>The same questions in the same order every time. Answer choices are shuffled each time.</li>'}
            <li>Topic and difficulty labels and hints are hidden, like on a real test.</li>
            <li>You won't see right or wrong answers until you submit.</li>
            <li>You can skip questions, flag them, and come back before submitting.</li>
            ${exam.timeLimit ? '<li>The timer can\'t be paused. When it runs out, your answers are submitted automatically.</li>' : ''}
            <li>If you close the tab, you can resume from the home screen. The timer keeps your used time.</li>
          </ul>
          ${!qs.length && !mock ? '<p class="note">No questions are marked for the timed practice test, so this uses the whole bank.</p>' : ''}
        </div>
        <div class="row end setup-actions"><a class="btn" href="#/exam/${e}">Cancel</a><button class="btn primary big" data-start>Start ${mock ? 'random test' : 'timed test'}</button></div>
      </section>`;
    main.querySelector('[data-start]').onclick = () => startSession(exam, mode, {});
    return;
  }

  // ---------- configurable modes ----------
  const preTopics = query.topic ? [query.topic] : [];
  const showTopics = ['topic', 'custom', 'bank', 'mistakes', 'saved'].includes(mode);
  const showDifficulty = ['topic', 'custom', 'bank'].includes(mode);
  const showSource = mode === 'custom' || mode === 'topic';
  const showTimer = mode === 'custom' || mode === 'bank' || mode === 'topic';
  const types = [...new Set(exam.questions.map((q) => q.type))];
  const titles = {
    topic: 'Practice by topic', bank: 'Full question bank', custom: 'Build a custom exam',
    smart: 'Smart review', mistakes: 'My mistakes', saved: 'Saved questions',
  };
  const intros = {
    topic: 'Pick the topics to practice. You can choose several.',
    bank: 'Every question in the bank, in random order.',
    custom: 'Mix topics, set a length and a timer, and get scored at the end.',
    smart: 'Questions you got wrong or are due for review come first, then ones you haven\'t tried.',
    mistakes: 'Questions you got wrong the last time you answered them. Answer one correctly and it leaves this list.',
    saved: 'Questions you starred.',
  };
  const defaultCount = { topic: 20, bank: 0, custom: 20, smart: 20, mistakes: 0, saved: 0 }[mode];
  const defaultFeedback = mode === 'custom' ? 'end' : settings.feedback;
  const perQ = exam.timeLimit && exam.questions.some((q) => q.onExam)
    ? exam.timeLimit / exam.questions.filter((q) => q.onExam).length
    : 1.5;

  main.innerHTML = `
    <section class="page narrow setup">
      ${back}
      <h1>${titles[mode]}</h1>
      <p class="lead">${intros[mode]}</p>
      <form class="setup-form" novalidate>
        ${showTopics ? `
        <fieldset>
          <legend>Topics</legend>
          <div class="chip-row">
            <button type="button" class="link-btn" data-all-topics>Select all</button>
            <button type="button" class="link-btn" data-no-topics>Clear</button>
          </div>
          <div class="check-grid">
            ${exam.topics.map((t) => `<label class="check"><input type="checkbox" name="topic" value="${esc(t.name)}" ${preTopics.includes(t.name) || (!preTopics.length && mode !== 'topic') ? 'checked' : ''}><span>${esc(t.name)} <span class="muted">${t.count}</span></span></label>`).join('')}
          </div>
        </fieldset>` : ''}
        ${showDifficulty ? `
        <fieldset>
          <legend>Difficulty</legend>
          <div class="chip-row">
            ${['easy', 'medium', 'hard'].map((d) => `<label class="chip"><input type="checkbox" name="difficulty" value="${d}" checked><span>${d[0].toUpperCase() + d.slice(1)}</span></label>`).join('')}
          </div>
        </fieldset>` : ''}
        ${mode === 'custom' && types.length > 1 ? `
        <fieldset>
          <legend>Question types</legend>
          <div class="chip-row">
            ${types.map((t) => `<label class="chip"><input type="checkbox" name="type" value="${t}" checked><span>${TYPE_LABELS[t]}</span></label>`).join('')}
          </div>
        </fieldset>` : ''}
        ${showSource ? `
        <fieldset>
          <legend>Which questions</legend>
          <div class="chip-row">
            <label class="chip"><input type="radio" name="source" value="all" checked><span>All</span></label>
            <label class="chip"><input type="radio" name="source" value="unseen"><span>Not tried yet</span></label>
            <label class="chip"><input type="radio" name="source" value="missed"><span>Got wrong last time</span></label>
            ${saved.length ? '<label class="chip"><input type="radio" name="source" value="saved"><span>Saved</span></label>' : ''}
          </div>
        </fieldset>` : ''}
        <fieldset class="inline-fields">
          <label class="field"><span>Number of questions</span>
            <select name="count">
              ${mode === 'smart' ? [10, 20, 30, 50].map((n) => `<option value="${n}" ${n === 20 ? 'selected' : ''}>${n}</option>`).join('')
                : `<option value="0" ${!defaultCount ? 'selected' : ''}>All matching</option>${[5, 10, 15, 20, 25, 30, 40, 50].map((n) => `<option value="${n}" ${n === defaultCount ? 'selected' : ''}>${n}</option>`).join('')}`}
            </select>
          </label>
          ${showTimer ? `
          <label class="field"><span>Timer</span>
            <select name="timer">
              <option value="off" ${mode !== 'custom' ? 'selected' : ''}>No time limit</option>
              <option value="auto" ${mode === 'custom' ? 'selected' : ''}>Test pace (${Math.round(perQ * 10) / 10} min per question)</option>
              <option value="custom">Set minutes…</option>
            </select>
          </label>
          <p class="muted small field-help" data-pace-help>${perQ ? `Test pace gives you the same time per question as the timed practice test (${exam.timeLimit} minutes for ${exam.questions.filter((q) => q.onExam).length} questions), so a shorter quiz gets a shorter timer.` : ''}</p>
          <label class="field" data-minutes hidden><span>Minutes</span><input type="number" name="minutes" min="1" max="600" value="30"></label>` : ''}
        </fieldset>
        <fieldset>
          <legend>When to show answers</legend>
          <div class="chip-row">
            <label class="chip"><input type="radio" name="feedback" value="instant" ${defaultFeedback === 'instant' ? 'checked' : ''}><span>After each question</span></label>
            <label class="chip"><input type="radio" name="feedback" value="end" ${defaultFeedback === 'end' ? 'checked' : ''}><span>At the end</span></label>
          </div>
        </fieldset>
        <div class="setup-foot">
          <p class="match-count" aria-live="polite"></p>
          <div class="row"><a class="btn" href="#/exam/${e}">Cancel</a><button class="btn primary big" type="submit">Start</button></div>
        </div>
      </form>
    </section>`;

  const form = main.querySelector('form');
  const vals = (name) => $$(`input[name="${name}"]:checked`, form).map((i) => i.value);
  const readOpts = () => {
    const count = Number(form.count.value) || 0;
    const o = {
      count,
      feedback: form.feedback?.value || defaultFeedback,
    };
    if (showTopics) o.topics = vals('topic');
    if (showDifficulty) o.difficulties = vals('difficulty');
    if (form.querySelector('input[name="type"]')) o.types = vals('type');
    if (showSource) o.source = form.querySelector('input[name="source"]:checked')?.value || 'all';
    return o;
  };
  const matching = () => {
    const o = readOpts();
    let pool = exam.questions;
    if (mode === 'mistakes') { const ids = new Set(mistakeIds(exam, stats)); pool = pool.filter((q) => ids.has(q.id)); }
    if (mode === 'saved') { const s = new Set(saved); pool = pool.filter((q) => s.has(q.id)); }
    if (o.topics) pool = pool.filter((q) => o.topics.includes(q.topic));
    if (o.difficulties) pool = pool.filter((q) => o.difficulties.includes(q.difficulty));
    if (o.types) pool = pool.filter((q) => o.types.includes(q.type));
    if (o.source === 'unseen') pool = pool.filter((q) => !stats[q.id]?.seen);
    if (o.source === 'missed') pool = pool.filter((q) => stats[q.id]?.lastCorrect === false);
    if (o.source === 'saved') { const s = new Set(saved); pool = pool.filter((q) => s.has(q.id)); }
    return pool.length;
  };
  const timerMinutes = (n) => {
    const t = form.timer?.value;
    if (!t || t === 'off') return null;
    if (t === 'custom') return Math.max(1, Number(form.minutes.value) || 30);
    return Math.max(1, Math.round(n * perQ));
  };
  const update = () => {
    const n = mode === 'smart' ? Math.min(Number(form.count.value), exam.questions.length) : matching();
    const take = mode === 'smart' ? n : Math.min(n, Number(form.count.value) || n);
    const mins = timerMinutes(take);
    const out = form.querySelector('.match-count');
    const noTopic = showTopics && !vals('topic').length;
    out.textContent = noTopic
      ? 'Pick at least one topic to start.'
      : n === 0
      ? 'No questions match. Choose more topics or difficulties.'
      : `${plural(take, 'question')}${mode !== 'smart' && take < n ? ` (from ${n} matching)` : ''}${mins ? `, ${mins} minute${mins === 1 ? '' : 's'}${form.timer.value === 'auto' ? ' at test pace' : ''}` : ', no time limit'}`;
    out.classList.toggle('bad', n === 0 && !noTopic);
    form.querySelector('[type="submit"]').disabled = n === 0;
    const minField = form.querySelector('[data-minutes]');
    if (minField) minField.hidden = form.timer.value !== 'custom';
    const paceHelp = form.querySelector('[data-pace-help]');
    if (paceHelp) paceHelp.hidden = form.timer.value !== 'auto';
  };
  form.addEventListener('change', update);
  form.addEventListener('input', update);
  form.querySelector('[data-all-topics]')?.addEventListener('click', () => { $$('input[name="topic"]', form).forEach((i) => (i.checked = true)); update(); });
  form.querySelector('[data-no-topics]')?.addEventListener('click', () => { $$('input[name="topic"]', form).forEach((i) => (i.checked = false)); update(); });
  update();

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const o = readOpts();
    const n = mode === 'smart' ? o.count : Math.min(matching(), o.count || Infinity);
    o.timeLimitMin = timerMinutes(n);
    if (mode === 'topic' && o.topics.length === 1) o.label = `Topic: ${o.topics[0]}`;
    const r = await startSession(exam, mode, o);
    if (r === 'empty') update();
  });
}
