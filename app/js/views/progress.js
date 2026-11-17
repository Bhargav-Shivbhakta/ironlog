import { getExam } from '../data.js';
import * as store from '../store.js';
import { esc, ring, meter, toneFor, plural, lineChart } from '../ui.js';
import { snippet, md } from '../render.js';
import { readiness, topicMastery, missedRanking, streakDays, fmtDuration, fmtDate, dueIds, MODES } from '../engine.js';
import { startSession } from './setup.js';

export async function render(main, { id }) {
  const exam = await getExam(id);
  if (!exam) { main.innerHTML = `<section class="page narrow empty-state"><h1>Exam not found</h1><a class="btn primary" href="#/">See all exams</a></section>`; return; }
  const e = encodeURIComponent(exam.id);
  const stats = store.getStats(exam.id);
  const attempts = store.getAttempts(exam.id);
  const activity = store.getActivity();
  const ready = readiness(exam, stats, attempts);
  const topics = topicMastery(exam, stats);
  const missed = missedRanking(exam, stats, 10);
  const seen = exam.questions.filter((q) => stats[q.id]?.seen).length;
  const totalRight = Object.values(stats).reduce((s, x) => s + x.right, 0);
  const totalAns = Object.values(stats).reduce((s, x) => s + x.right + x.wrong, 0);
  const studied = attempts.reduce((s, a) => s + (a.durationMs || 0), 0);
  const streak = streakDays(activity);
  const due = dueIds(exam, stats).length;

  if (!attempts.length && !totalAns) {
    main.innerHTML = `
      <section class="page narrow empty-state">
        <nav class="crumbs"><a href="#/">Exams</a><a href="#/exam/${e}">${esc(exam.title)}</a></nav>
        <h1>My progress</h1>
        <p>Answer a few questions and your scores, weak topics and readiness will show up here.</p>
        <div class="row center"><a class="btn primary" href="#/start/${e}/smart">Start smart review</a><a class="btn" href="#/start/${e}/topic">Practice by topic</a></div>
      </section>`;
    return;
  }

  let chartMode = 'all';
  const chartFor = (mode) => {
    const list = attempts.filter((a) => a.score.count >= 3 && (mode === 'all' || a.mode === mode)).slice(-20);
    return lineChart(list.map((a, i) => ({
      x: new Date(a.finishedAt).toLocaleDateString([], { month: 'numeric', day: 'numeric' }),
      y: a.score.pct, title: `${a.label}: ${a.score.pct}% (${fmtDate(a.finishedAt)})`,
    })), { target: exam.passMark });
  };
  const usedModes = [...new Set(attempts.map((a) => a.mode))];

  main.innerHTML = `
    <section class="page progress">
      <nav class="crumbs"><a href="#/">Exams</a><a href="#/exam/${e}">${esc(exam.title)}</a></nav>
      <h1>My progress</h1>

      <div class="ready-panel">
        ${ring(ready.score, { size: 140, stroke: 12, label: ready.score + '%', sub: ready.label, tone: toneFor(ready.score / 100) })}
        <div>
          <h2>Quiz readiness</h2>
          <p class="muted">Based on how well you know each question, how much of the bank you've covered${ready.parts.recent != null ? ', and your recent full-length scores' : ''}.${exam.assignmentCount ? ` Programming assignments aren't part of this score; see them on the <a href="#/assignments/${encodeURIComponent(exam.id)}">assignments page</a>.` : ''}</p>
          <ul class="ready-parts">
            <li><span>Covered</span>${meter(ready.parts.coverage, { tone: toneFor(ready.parts.coverage) })}<span>${seen}/${exam.questions.length}</span></li>
            <li><span>Mastered</span>${meter(ready.parts.mastery, { tone: toneFor(ready.parts.mastery) })}<span>${Math.round(ready.parts.mastery * 100)}%</span></li>
            ${ready.parts.recent != null ? `<li><span>Recent exams</span>${meter(ready.parts.recent, { tone: toneFor(ready.parts.recent) })}<span>${Math.round(ready.parts.recent * 100)}%</span></li>` : ''}
          </ul>
          ${due ? `<a class="btn primary" href="#/start/${e}/smart">Review ${plural(due, 'due question')}</a>` : ''}
        </div>
      </div>

      <dl class="stat-row">
        <div><dt>Questions answered</dt><dd>${totalAns}</dd></div>
        <div><dt>Overall accuracy</dt><dd>${totalAns ? Math.round((totalRight / totalAns) * 100) + '%' : '–'}</dd></div>
        <div><dt>Quizzes finished</dt><dd>${attempts.length}</dd></div>
        <div><dt>Time in quizzes</dt><dd>${fmtDuration(studied, { short: true })}</dd></div>
        <div><dt>Study streak</dt><dd>${plural(streak, 'day')}</dd></div>
      </dl>

      ${attempts.filter((a) => a.score.count >= 3).length >= 2 ? `
      <section class="panel">
        <div class="panel-head">
          <h2>Scores over time</h2>
          ${usedModes.length > 1 ? `<div class="seg" role="tablist">
            <button role="tab" data-chart="all" aria-selected="true">All</button>
            ${usedModes.filter((m) => MODES[m]).map((m) => `<button role="tab" data-chart="${m}">${esc(MODES[m].label)}</button>`).join('')}
          </div>` : ''}
        </div>
        <div class="chart" data-chartbox>${chartFor('all')}</div>
      </section>` : ''}

      <div class="result-grid">
        <section class="panel">
          <h2>Topics</h2>
          <p class="muted small">Weakest first. Mastery grows as you answer questions correctly on different days.</p>
          <ul class="bars clickable">
            ${topics.slice().sort((a, b) => a.mastery - b.mastery).map((t) => `
              <li><a href="#/start/${e}/topic?topic=${encodeURIComponent(t.name)}">
                <span class="bar-label">${esc(t.name)}</span>${meter(t.mastery, { tone: t.seen ? toneFor(t.mastery) : 'muted' })}
                <span class="bar-val">${t.accuracy != null ? Math.round(t.accuracy * 100) + '%' : 'New'}</span></a></li>`).join('')}
          </ul>
        </section>
        <section class="panel">
          <h2>Most missed</h2>
          ${missed.length ? `
            <ol class="missed">
              ${missed.map(({ q, s }) => `<li><span class="missed-text">${md(snippet(q.text, 90), { inline: true })}</span><span class="muted small">${esc(q.id)} · ${esc(q.topic)} · wrong ${s.wrong} of ${s.seen}</span></li>`).join('')}
            </ol>
            <button class="btn" data-missed>Practice these ${missed.length}</button>` : '<p class="muted">No missed questions yet.</p>'}
        </section>
      </div>

      <section class="panel">
        <h2>History</h2>
        <div class="table-wrap">
          <table class="history">
            <thead><tr><th>When</th><th>Mode</th><th>Questions</th><th>Score</th><th>Time</th></tr></thead>
            <tbody>
              ${attempts.slice().reverse().map((a) => `
                <tr data-href="#/results/${e}/${a.id}" tabindex="0">
                  <td>${esc(fmtDate(a.finishedAt))}</td>
                  <td>${esc(a.label)}</td>
                  <td>${a.score.count}</td>
                  <td><strong class="${toneFor(a.score.pct / 100)}">${a.score.pct}%</strong></td>
                  <td>${fmtDuration(a.durationMs, { short: true })}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </section>
    </section>`;

  main.addEventListener('click', (ev) => {
    const tr = ev.target.closest('tr[data-href]');
    if (tr) { location.hash = tr.dataset.href; return; }
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.chart) {
      chartMode = b.dataset.chart;
      main.querySelectorAll('[data-chart]').forEach((x) => x.setAttribute('aria-selected', String(x.dataset.chart === chartMode)));
      main.querySelector('[data-chartbox]').innerHTML = chartFor(chartMode) || '<p class="muted">Not enough quizzes in this mode yet.</p>';
    }
    if ('missed' in b.dataset) startSession(exam, 'retry', { ids: missed.map((m) => m.q.id), label: 'Most missed questions', feedback: 'instant' });
  });
  main.addEventListener('keydown', (ev) => {
    const tr = ev.target.closest('tr[data-href]');
    if (tr && ev.key === 'Enter') location.hash = tr.dataset.href;
  });
}
