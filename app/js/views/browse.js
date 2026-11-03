import { canReport, openReport } from '../report.js';
import { getExam } from '../data.js';
import * as store from '../store.js';
import { esc, icon, toast } from '../ui.js';
import { md, highlight } from '../render.js';
import { correctAnswerLabel, TYPE_LABELS } from '../parser.js';
import { qStat } from '../engine.js';

const LETTERS = 'ABCDEFGHIJKLMNOP';

export async function render(main, { id }, query = {}) {
  const exam = await getExam(id);
  if (!exam) { main.innerHTML = `<section class="page narrow empty-state"><h1>Exam not found</h1><a class="btn primary" href="#/">See all exams</a></section>`; return; }
  const e = encodeURIComponent(exam.id);
  const stats = store.getStats(exam.id);
  const saved = new Set(store.getSaved(exam.id));
  const notes = store.getNotes(exam.id);
  const state = { q: query.q || '', topic: '', diff: '', show: !!query.q, only: '' };

  main.innerHTML = `
    <section class="page browse">
      <nav class="crumbs"><a href="#/">Exams</a><a href="#/exam/${e}">${esc(exam.title)}</a></nav>
      <h1>All questions</h1>
      <div class="filters">
        <label class="search">${icon('search')}<input type="search" placeholder="Search questions and answers" data-q aria-label="Search" value="${esc(state.q)}"></label>
        <select data-topic aria-label="Topic"><option value="">All topics</option>${exam.topics.map((t) => `<option>${esc(t.name)}</option>`).join('')}</select>
        <select data-diff aria-label="Difficulty"><option value="">Any difficulty</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select>
        <select data-only aria-label="Show"><option value="">All questions</option><option value="saved">Saved</option><option value="wrong">Got wrong last time</option><option value="unseen">Not tried yet</option><option value="notes">With my notes</option></select>
        <label class="switch"><input type="checkbox" data-show ${state.show ? 'checked' : ''}><span>Show answers</span></label>
      </div>
      <p class="muted small" data-count></p>
      <div data-list></div>
    </section>`;

  const listEl = main.querySelector('[data-list]');
  const plain = (s) => String(s || '').toLowerCase();

  function draw() {
    const words = state.q.toLowerCase().split(/\s+/).filter(Boolean);
    const exactId = [...exam.byId.keys()].find((k) => k.toLowerCase() === state.q.trim().toLowerCase());
    const rows = exam.questions.filter((q) => {
      if (exactId) return q.id === exactId; // searching a question ID (e.g. from the dashboard) shows just that one
      if (state.topic && q.topic !== state.topic) return false;
      if (state.diff && q.difficulty !== state.diff) return false;
      const st = stats[q.id];
      if (state.only === 'saved' && !saved.has(q.id)) return false;
      if (state.only === 'wrong' && st?.lastCorrect !== false) return false;
      if (state.only === 'unseen' && st?.seen) return false;
      if (state.only === 'notes' && !notes[q.id]) return false;
      if (words.length) {
        const hay = plain(q.text + ' ' + (q.options || []).map((o) => o.text).join(' ') + ' ' + q.explanation + ' ' + q.id + ' ' + (notes[q.id] || ''));
        if (!words.every((w) => hay.includes(w))) return false;
      }
      return true;
    });
    main.querySelector('[data-count]').textContent = `Showing ${rows.length} of ${exam.questions.length}`;
    let lastTopic = null;
    listEl.innerHTML = rows.length ? rows.map((q) => {
      const st = qStat(stats, q.id);
      const head = q.topic !== lastTopic ? `<h2 class="browse-topic">${esc(q.topic)}</h2>` : '';
      lastTopic = q.topic;
      const ans = q.options
        ? `<ol class="browse-opts">${q.options.map((o, i) => `<li class="${state.show && o.correct ? 'correct' : ''}"><span class="bubble small ${q.type === 'multi' ? 'square' : ''}">${LETTERS[i]}</span><span>${md(o.text, { inline: true })}</span></li>`).join('')}</ol>`
        : '';
      return `${head}
        <article class="browse-item" data-id="${esc(q.id)}">
          <header>
            <span class="qid">${esc(q.id)}</span>
            <span class="tag diff-${q.difficulty}">${q.difficulty}</span>
            <span class="muted small">${esc(TYPE_LABELS[q.type] || '')}${q.onExam ? ' · In the timed practice test' : ''}</span>
            <span class="spacer"></span>
            ${st.seen ? `<span class="muted small">${st.right}/${st.seen} right</span>` : ''}
            <button class="tool ${saved.has(q.id) ? 'on star' : ''}" data-save aria-pressed="${saved.has(q.id)}" title="Save">${icon('star')}</button>
            <button class="tool ${notes[q.id] ? 'on' : ''}" data-note title="My note" aria-label="My note">${icon('note')}</button>
            ${canReport(exam.id) ? `<button class="tool" data-report title="Report a problem with this question" aria-label="Report a problem with question ${esc(q.id)}">${icon('report')}</button>` : ''}
          </header>
          <div class="prose">${md(q.text)}</div>
          ${ans}
          ${state.show ? `
            ${!q.options ? `<p class="accepted">Answer: <strong>${md(correctAnswerLabel(q), { inline: true })}</strong></p>` : ''}
            ${q.explanation ? `<div class="explanation prose">${md(q.explanation)}</div>` : ''}` : `<button class="link-btn" data-reveal>Show answer</button>`}
          <div class="note-box" ${notes[q.id] ? '' : 'hidden'}>
            <textarea rows="2" placeholder="Your note (only you can see it)" aria-label="Your note">${esc(notes[q.id] || '')}</textarea>
          </div>
        </article>`;
    }).join('') : `<p class="empty-row">No questions match these filters.</p>`;
    highlight(listEl);
  }

  let t;
  main.querySelector('[data-q]').addEventListener('input', (ev) => { clearTimeout(t); t = setTimeout(() => { state.q = ev.target.value; draw(); }, 120); });
  main.querySelector('[data-topic]').onchange = (ev) => { state.topic = ev.target.value; draw(); };
  main.querySelector('[data-diff]').onchange = (ev) => { state.diff = ev.target.value; draw(); };
  main.querySelector('[data-only]').onchange = (ev) => { state.only = ev.target.value; draw(); };
  main.querySelector('[data-show]').onchange = (ev) => { state.show = ev.target.checked; draw(); };

  listEl.addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    const item = b.closest('[data-id]');
    const qid = item?.dataset.id;
    const q = exam.byId.get(qid);
    if ('report' in b.dataset && q) return openReport({ examId: exam.id, qid, label: `Question ${qid}`, text: q.text });
    if ('save' in b.dataset) {
      const on = store.toggleSaved(exam.id, qid);
      if (on) saved.add(qid); else saved.delete(qid);
      b.classList.toggle('on', on); b.classList.toggle('star', on); b.setAttribute('aria-pressed', on);
      toast(on ? 'Saved' : 'Removed from saved');
    }
    if ('note' in b.dataset) {
      const box = item.querySelector('.note-box');
      box.hidden = !box.hidden;
      if (!box.hidden) box.querySelector('textarea').focus();
    }
    if ('reveal' in b.dataset) {
      if (q.options) item.querySelectorAll('.browse-opts li').forEach((li, i) => li.classList.toggle('correct', q.options[i].correct));
      const div = document.createElement('div');
      div.innerHTML = `${!q.options ? `<p class="accepted">Answer: <strong>${md(correctAnswerLabel(q), { inline: true })}</strong></p>` : ''}${q.explanation ? `<div class="explanation prose">${md(q.explanation)}</div>` : ''}`;
      b.replaceWith(...div.childNodes);
    }
  });
  let noteTimer;
  listEl.addEventListener('input', (ev) => {
    if (!ev.target.matches('.note-box textarea')) return;
    const qid = ev.target.closest('[data-id]').dataset.id;
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => {
      store.saveNote(exam.id, qid, ev.target.value);
      if (ev.target.value.trim()) notes[qid] = ev.target.value; else delete notes[qid];
    }, 300);
  });
  draw();
}
