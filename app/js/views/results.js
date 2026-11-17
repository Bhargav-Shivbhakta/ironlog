import { getExam } from '../data.js';
import * as store from '../store.js';
import { esc, icon, ring, meter, toneFor, plural } from '../ui.js';
import { md, highlight } from '../render.js';
import { gradeQuestion, isAnswered, correctAnswerLabel } from '../parser.js';
import { fmtDuration, fmtDate } from '../engine.js';
import { startSession } from './setup.js';

const LETTERS = 'ABCDEFGHIJKLMNOP';

export async function render(main, { id, attempt: attemptId }, query) {
  const exam = await getExam(id);
  const a = exam && store.getAttempt(exam.id, attemptId);
  if (!exam || !a) {
    main.innerHTML = `<section class="page narrow empty-state"><h1>Result not found</h1><p>It may have been cleared from this browser.</p><a class="btn primary" href="#/">Go to exams</a></section>`;
    return;
  }
  const e = encodeURIComponent(exam.id);
  const ids = a.questionIds.filter((qid) => exam.byId.has(qid));
  const res = (qid) => a.results[qid] || { correct: false, answered: false };
  const wrongIds = ids.filter((qid) => !res(qid).correct);
  const pct = a.score.pct;
  const pass = exam.passMark;
  const tone = pass ? (pct >= pass ? 'good' : pct >= pass - 15 ? 'ok' : 'bad') : toneFor(pct / 100);

  // topic + difficulty breakdown
  const group = (key) => {
    const m = new Map();
    for (const qid of ids) {
      const q = exam.byId.get(qid);
      const k = q[key];
      const g = m.get(k) || { name: k, n: 0, right: 0 };
      g.n++; if (res(qid).correct) g.right++;
      m.set(k, g);
    }
    return [...m.values()];
  };
  const topics = group('topic').sort((x, y) => x.right / x.n - y.right / y.n);
  const diffs = ['easy', 'medium', 'hard'].map((d) => group('difficulty').find((g) => g.name === d)).filter(Boolean);
  const times = ids.map((qid) => a.times?.[qid] || 0);
  const avgTime = times.length ? times.reduce((x, y) => x + y, 0) / times.length : 0;
  const maxTime = Math.max(1, ...times);
  const weakest = topics.filter((t) => t.right / t.n < 0.7).slice(0, 3);

  // previous attempt of same mode for comparison
  const prev = store.getAttempts(exam.id).filter((x) => x.mode === a.mode && x.finishedAt < a.finishedAt).pop();
  const delta = prev ? Math.round((pct - prev.score.pct) * 10) / 10 : null;
  const earlier = store.getAttempts(exam.id).filter((x) => x.mode === a.mode && x.finishedAt < a.finishedAt);
  const best = earlier.length && a.score.count >= 5 && pct > Math.max(...earlier.map((x) => x.score.pct));

  let filter = query.filter || (wrongIds.length ? 'wrong' : 'all');

  main.innerHTML = `
    <section class="page results">
      <nav class="crumbs"><a href="#/">Exams</a><a href="#/exam/${e}">${esc(exam.title)}</a></nav>
      <header class="result-hero ${tone}">
        ${ring(pct, { size: 148, stroke: 12, label: `${pct}%`, sub: `${a.score.correct} of ${a.score.count} right`, tone })}
        <div class="result-text">
          <h1>${esc(a.label)}</h1>
          ${best || (delta != null && delta > 0) ? `<p class="result-badges">${best ? `<span class="pill good">${icon('star')} New personal best</span>` : ''}${delta > 0 ? `<span class="pill good">+${delta}% since last time</span>` : ''}</p>` : ''}
          <p class="muted">${esc(fmtDate(a.finishedAt))}${a.timedOut ? ' · Time ran out' : ''}</p>
          <dl class="facts-list">
            <div><dt>Score</dt><dd>${a.score.earned} / ${a.score.total} points</dd></div>
            <div><dt>Time</dt><dd>${fmtDuration(a.durationMs, { short: true })}${a.timeLimitSec ? ` of ${Math.round(a.timeLimitSec / 60)} min` : ''}</dd></div>
            <div><dt>Per question</dt><dd>${fmtDuration(avgTime, { short: true })} average</dd></div>
            ${pass ? `<div><dt>Target</dt><dd>${pass}% · ${pct >= pass ? 'Reached' : `${Math.round((pass - pct) * 10) / 10} points short`}</dd></div>` : ''}
            ${a.skippedIds?.length ? `<div><dt>Skipped</dt><dd>${a.skippedIds.length} (not counted)</dd></div>` : ''}
            ${delta != null ? `<div><dt>Last time</dt><dd>${prev.score.pct}% (${delta >= 0 ? '+' : ''}${delta})</dd></div>` : ''}
          </dl>
        </div>
      </header>

      <div class="result-actions">
        ${wrongIds.length ? `<button class="btn primary" data-retry>${wrongIds.length === 1 ? 'Retry the one I missed' : `Retry the ${wrongIds.length} I missed`}</button>` : ''}
        ${a.skippedIds?.length ? `<button class="btn" data-skipped>${a.skippedIds.length === 1 ? 'Do the skipped one' : `Do the ${a.skippedIds.length} skipped ones`}</button>` : ''}
        ${weakest.length ? `<button class="btn" data-weak>Practice ${weakest.length === 1 ? esc(weakest[0].name) : 'my weakest topics'}</button>` : ''}
        <button class="btn" data-again>Same settings again</button>
        <a class="btn" href="#/progress/${e}">My progress</a>
      </div>

      <div class="result-grid">
        <section class="panel">
          <h2>By topic</h2>
          <ul class="bars">
            ${topics.map((t) => `<li><span class="bar-label">${esc(t.name)}</span>${meter(t.right / t.n, { tone: toneFor(t.right / t.n) })}<span class="bar-val">${t.right}/${t.n}</span></li>`).join('')}
          </ul>
        </section>
        <section class="panel">
          <h2>By difficulty</h2>
          <ul class="bars">
            ${diffs.map((t) => `<li><span class="bar-label">${t.name[0].toUpperCase() + t.name.slice(1)}</span>${meter(t.right / t.n, { tone: toneFor(t.right / t.n) })}<span class="bar-val">${t.right}/${t.n}</span></li>`).join('')}
          </ul>
          <h2 class="mt">Time on each question</h2>
          <div class="time-strip" role="img" aria-label="Time spent per question">
            ${ids.map((qid, i) => `<span class="${res(qid).correct ? 'good' : 'bad'}" style="height:${Math.max(6, (times[i] / maxTime) * 100)}%" title="Q${i + 1}: ${fmtDuration(times[i], { short: true })} · ${res(qid).correct ? 'right' : 'wrong'}"></span>`).join('')}
          </div>
          <p class="muted small">Taller bars took longer. Long red bars are worth revisiting.</p>
        </section>
      </div>

      <section class="review">
        <div class="review-head">
          <h2>Review answers</h2>
          <div class="seg" role="tablist" aria-label="Filter questions">
            <button role="tab" data-filter="wrong">Wrong <span>${wrongIds.length}</span></button>
            <button role="tab" data-filter="flagged">Flagged <span>${ids.filter((x) => a.flags?.[x]).length}</span></button>
            <button role="tab" data-filter="all">All <span>${ids.length}</span></button>
          </div>
        </div>
        <ol class="review-list" data-list></ol>
      </section>
    </section>`;

  const list = main.querySelector('[data-list]');
  const renderList = () => {
    main.querySelectorAll('[data-filter]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.filter === filter)));
    const shown = ids.map((qid, i) => ({ qid, i })).filter(({ qid }) =>
      filter === 'all' ? true : filter === 'wrong' ? !res(qid).correct : !!a.flags?.[qid]);
    if (!shown.length) {
      list.innerHTML = `<li class="empty-row">${filter === 'wrong' ? 'No wrong answers. Nice work.' : 'Nothing flagged.'}</li>`;
      return;
    }
    list.innerHTML = shown.map(({ qid, i }) => reviewItem(exam.byId.get(qid), i, a)).join('');
    highlight(list);
  };
  renderList();

  main.addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.filter) { filter = b.dataset.filter; renderList(); }
    if ('skipped' in b.dataset) startSession(exam, 'retry', { ids: a.skippedIds, label: 'Skipped questions', feedback: a.feedback || 'instant' });
    if ('retry' in b.dataset) startSession(exam, 'retry', { ids: wrongIds, label: 'Retry missed questions', feedback: 'instant' });
    if ('weak' in b.dataset) startSession(exam, 'topic', { topics: weakest.map((t) => t.name), label: weakest.length === 1 ? `Topic: ${weakest[0].name}` : 'Weakest topics', count: 20 });
    if ('again' in b.dataset) {
      if (a.mode === 'exam' || a.mode === 'mock') startSession(exam, a.mode, {});
      else startSession(exam, a.mode, a.opts ? { ...a.opts } : { count: a.questionIds.length, label: a.label, feedback: a.feedback, timeLimitMin: a.timeLimitSec ? a.timeLimitSec / 60 : null });
    }
  });
}

export function reviewItem(q, i, a) {
  const value = a.answers?.[q.id];
  const answered = isAnswered(q, value);
  const ok = gradeQuestion(q, value);
  const order = a.choiceOrder?.[q.id] || (q.options || []).map((_, k) => k);
  let answerHtml;
  if (q.options) {
    answerHtml = `<ol class="opts review-opts">${order.map((orig, di) => {
      const o = q.options[orig];
      const sel = q.type === 'multi' ? (value || []).includes(orig) : value === orig;
      return `<li class="opt ${o.correct ? 'is-correct' : sel ? 'is-wrong' : ''} ${sel ? 'selected' : ''}"><div class="opt-btn static">
        <span class="bubble ${q.type === 'multi' ? 'square' : ''}">${LETTERS[di]}</span>
        <span class="opt-text">${md(o.text, { inline: !o.text.includes('\n') })}</span>
        ${sel ? `<span class="you">Your answer</span>` : ''}</div></li>`;
    }).join('')}</ol>`;
  } else {
    answerHtml = `<div class="typed-review">
      <p><span class="muted">Your answer:</span> <strong class="${ok ? 'good' : 'bad'}">${answered ? esc(value) : 'No answer'}</strong></p>
      ${ok ? '' : `<p><span class="muted">Correct answer:</span> <strong>${md(correctAnswerLabel(q), { inline: true })}</strong></p>`}</div>`;
  }
  return `
    <li class="review-item ${ok ? 'good' : 'bad'}">
      <header>
        <span class="review-num">${i + 1}</span>
        <span class="review-verdict">${ok ? icon('check') + 'Correct' : answered ? icon('x') + 'Wrong' : icon('x') + 'Not answered'}</span>
        <span class="tag">${esc(q.topic)}</span>
        ${a.flags?.[q.id] ? `<span class="tag flag-tag">${icon('flag')}Flagged</span>` : ''}
        ${a.times?.[q.id] ? `<span class="muted small">${fmtDuration(a.times[q.id], { short: true })}</span>` : ''}
      </header>
      <div class="qtext prose">${md(q.text)}</div>
      ${answerHtml}
      ${q.explanation ? `<details class="explain" ${ok ? '' : 'open'}><summary>Explanation</summary><div class="prose">${md(q.explanation)}</div></details>` : ''}
    </li>`;
}
