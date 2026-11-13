import { getExam, getAssignments } from '../data.js';
import * as store from '../store.js';
import { esc, icon, meter, plural } from '../ui.js';

export function statusOf(a, prog, examId) {
  const p = prog[a.slug];
  const total = a.tests.length + a.checks.length;
  if (p?.done) return { key: 'done', label: 'Completed', detail: `All ${total} checks passed` };
  if (p?.attempts) return { key: 'progress', label: 'In progress', detail: `${p.best} of ${total} checks passed` };
  const code = store.getCode(examId, a.slug);
  if (code != null && code !== a.starter) return { key: 'progress', label: 'Started', detail: 'Not tested yet' };
  return { key: 'new', label: 'Not started', detail: a.checks.length ? `${plural(a.tests.length, 'test')} + ${plural(a.checks.length, 'code requirement')}` : plural(a.tests.length, 'test') };
}

export async function render(main, { id }) {
  const exam = await getExam(id);
  if (!exam) { main.innerHTML = `<section class="page narrow empty-state"><h1>Exam not found</h1><a class="btn primary" href="#/">See all exams</a></section>`; return; }
  const list = await getAssignments(id);
  const e = encodeURIComponent(exam.id);
  const crumbs = `<nav class="crumbs"><a href="#/">Exams</a><a href="#/exam/${e}">${esc(exam.title)}</a></nav>`;
  if (!list.length) {
    main.innerHTML = `<section class="page narrow empty-state">${crumbs}<h1>No programming assignments yet</h1><p>Assignments appear here once they're added for this exam.</p></section>`;
    return;
  }
  const prog = store.getAsgProgress(exam.id);
  const statuses = list.map((a) => statusOf(a, prog, exam.id));
  const done = statuses.filter((s) => s.key === 'done').length;
  const next = list.find((a, i) => statuses[i].key !== 'done');

  main.innerHTML = `
    <section class="page assignments">
      ${crumbs}
      <header class="asg-head">
        <div>
          ${exam.course ? `<p class="course">${esc(exam.course)}</p>` : ''}
          <h1>Programming assignments</h1>
          <p class="muted">Write Java right here and test it instantly. Your code runs in your browser and is saved on this device.</p>
        </div>
        <div class="asg-summary">
          <strong>${done} of ${list.length}</strong><span class="muted">completed</span>
          ${meter(done / list.length, { tone: done === list.length ? 'good' : '' })}
          ${next ? `<a class="btn primary" href="#/code/${e}/${next.slug}">${statuses[list.indexOf(next)].key === 'new' ? 'Start' : 'Continue'}: ${esc(next.title)}</a>` : '<p class="good small"><strong>All assignments completed.</strong></p>'}
        </div>
      </header>
      <ol class="asg-list">
        ${list.map((a, i) => {
          const st = statuses[i];
          return `
          <li class="asg-card ${st.key}">
            <a href="#/code/${e}/${a.slug}">
              <span class="asg-num" aria-hidden="true">${st.key === 'done' ? icon('check') : i + 1}</span>
              <span class="asg-main">
                <span class="asg-title">${esc(a.title)}</span>
                <span class="asg-topics">${a.topics.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</span>
              </span>
              <span class="asg-meta">
                <span class="tag diff-${a.difficulty}">${a.difficulty}</span>
                ${a.estimate ? `<span class="muted small">${icon('clock')} ${esc(a.estimate)}</span>` : ''}
                <span class="asg-status ${st.key}"><strong>${st.label}</strong><span>${esc(st.detail)}</span></span>
              </span>
            </a>
          </li>`;
        }).join('')}
      </ol>
      <p class="muted small asg-foot">Tip: the tests check your output exactly, like the course autograder. Spaces at the ends of lines don't matter, but everything else does.</p>
    </section>`;
}
