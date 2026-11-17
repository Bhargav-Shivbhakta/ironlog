// Study pages for students: one page per unit with the notes, then what to practise.
// A unit opens on its first day (the database refuses it before then); staff can always preview.
import * as cloud from '../cloud.js';
import { esc, icon } from '../ui.js';
import * as store from '../store.js';
import { md, highlight } from '../render.js';
import { studyUnits } from './classes.js';

const when = (t) => new Date(t).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

export async function render(main, { classId, unitId }) {
  const cls = cloud.myClasses().find((c) => c.id === classId);
  const home = `#/class/${encodeURIComponent(classId)}`;
  const page = (inner) => { main.innerHTML = `<section class="page study-page"><nav class="crumbs" aria-label="Breadcrumb"><a href="${home}">${esc(cls?.name || 'My class')}</a><span aria-hidden="true">›</span><span>Study</span></nav>${inner}</section>`; };
  if (!cloud.enabled || !cloud.currentUser() || !cls) { page('<h1>Study</h1><p>This is for students in the class. Open it from your class page.</p>'); return; }
  const teacher = cloud.isStaffRole(cls.role);
  const doc = await cloud.getClass(classId).catch(() => null);
  const units = studyUnits(doc?.study), now = cloud.trueNow();
  const link = (u) => `#/study/${encodeURIComponent(classId)}/${encodeURIComponent(u.id)}`;
  if (!units.length) { page('<h1>Study</h1><p>Your instructor has not added study notes for this class yet.</p>'); return; }

  if (!unitId) {
    page(`<h1>Study by unit</h1><p class="lede">Read the notes for each unit, then practise it.</p>
      <ol class="study-list">${units.map((u) => (teacher || u.opensAt <= now
        ? `<li><a href="${link(u)}"><span class="study-n" aria-hidden="true">${u.n}</span><span><strong>Unit ${u.n}: ${esc(u.title)}</strong>${u.opensAt > now ? ` <span class="muted small">opens for students ${when(u.opensAt)}</span>` : ''}</span></a></li>`
        : `<li class="locked"><span class="study-n" aria-hidden="true">${u.n}</span><span><strong>Unit ${u.n}: ${esc(u.title)}</strong> <span class="muted small">opens ${when(u.opensAt)}</span></span></li>`)).join('')}</ol>`);
    return;
  }

  const meta = units.find((u) => u.id === unitId);
  if (!meta) { page('<h1>Unit not found</h1><p>This unit is not part of the class.</p><p><a class="btn" href="' + home + '">Back to the class</a></p>'); return; }
  if (!teacher && meta.opensAt > now) { page(`<h1>Unit ${meta.n}: ${esc(meta.title)}</h1><p>This unit opens on <strong>${when(meta.opensAt)}</strong>.</p><p><a class="btn" href="${home}">Back to the class</a></p>`); return; }
  let unit;
  try { unit = await cloud.getStudyUnit(classId, unitId); }
  catch (e) { page(`<h1>Unit ${meta.n}: ${esc(meta.title)}</h1><p>${e?.code === 'permission-denied' ? `This unit opens on <strong>${when(meta.opensAt)}</strong>.` : 'The notes could not be loaded. Check your connection and try again.'}</p><p><a class="btn" href="${home}">Back to the class</a></p>`); return; }
  if (!unit) { page('<h1>Unit not found</h1><p>The notes for this unit were removed.</p>'); return; }

  if (!teacher) store.set(`read:${classId}:${unitId}`, Date.now());      // My study stops asking them to read it
  const i = units.indexOf(meta), prev = units[i - 1], next = units[i + 1];
  const nextOpen = next && (teacher || next.opensAt <= now);
  const canPractise = unit.examId && (teacher || cloud.canSeeExam(unit.examId));
  page(`
    <header class="study-head">
      <p class="eyebrow">Unit ${unit.n}${unit.start ? ` · ${new Date(unit.start + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} to ${new Date(unit.end + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ''}</p>
      <h1>${esc(unit.title)}</h1>
      ${teacher && unit.opensAt > now ? `<p class="note">Preview. Students can open this from ${when(unit.opensAt)}.</p>` : ''}
    </header>
    <div class="study-layout">
      <nav class="study-toc" aria-label="In this unit" data-toc hidden><h2>In this unit</h2><ol></ol></nav>
      <article class="md study-notes" data-notes>${unit.notes ? md(unit.notes) : '<p class="muted">There are no notes for this unit.</p>'}</article>
    </div>
    <section class="study-next" aria-labelledby="practise-h">
      <h2 id="practise-h">Now practise it</h2>
      <p class="muted">Reading is the start. You learn it by answering questions and getting them wrong first.</p>
      <div class="row">
        ${canPractise ? `<a class="btn primary" href="#/exam/${encodeURIComponent(unit.examId)}">${icon('book')} Practice questions</a>` : ''}
        ${canPractise && unit.hasAssignment ? `<a class="btn" href="#/assignments/${encodeURIComponent(unit.examId)}">Programming assignment</a>` : ''}
        ${!canPractise ? '<span class="muted">Practice for this unit is not open yet.</span>' : ''}
      </div>
    </section>
    <nav class="study-pager" aria-label="Units">
      ${prev ? `<a class="btn" href="${link(prev)}">← Unit ${prev.n}: ${esc(prev.title)}</a>` : '<span></span>'}
      ${nextOpen ? `<a class="btn" href="${link(next)}">Unit ${next.n}: ${esc(next.title)} →</a>` : next ? `<span class="muted small">Unit ${next.n} opens ${when(next.opensAt)}</span>` : '<span></span>'}
    </nav>`);
  // a short table of contents from the topic headings
  const notes = main.querySelector('[data-notes]'), toc = main.querySelector('[data-toc]');
  highlight(notes);
  const heads = [...notes.querySelectorAll('h2')];
  heads.forEach((h, k) => { h.id = `topic-${k + 1}`; h.tabIndex = -1; });
  if (heads.length > 1) {
    toc.querySelector('ol').innerHTML = heads.map((h) => `<li><a href="#${h.id}" data-jump="${h.id}">${esc(h.textContent)}</a></li>`).join('');
    toc.hidden = false;
    toc.addEventListener('click', (ev) => { const a = ev.target.closest('[data-jump]'); if (!a) return; ev.preventDefault(); const h = document.getElementById(a.dataset.jump); h?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); h?.focus({ preventScroll: true }); });
  }
}
