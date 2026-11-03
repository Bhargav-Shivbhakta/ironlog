import config from '../../config.js';
import { getManifest, getExam } from '../data.js';
import * as store from '../store.js';
import { esc, ring, plural, toneFor, confirmDialog } from '../ui.js';
import { readiness, fmtDate, MODES } from '../engine.js';
import * as cloud from '../cloud.js';
import { listCourses, chosenCourses, newCourses, saveChoice, courseLabel } from './subjects.js';

function countdown(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d)) return '';
  const days = Math.ceil((d - new Date(new Date().toDateString())) / 86400000);
  if (days < 0) return '';
  if (days === 0) return 'Exam is today';
  return `Exam in ${plural(days, 'day')}`;
}

export function examCard(e, { big = false, grouped = false, ready = null } = {}) {
  const attempts = store.getAttempts(e.id);
  const last = attempts[attempts.length - 1];
  const best = attempts.filter((a) => a.mode === 'exam').reduce((m, a) => Math.max(m, a.score.pct), -1);
  return `
  <a class="exam-card ${big ? 'big' : ''}" href="#/exam/${encodeURIComponent(e.id)}">
    <div class="exam-card-main">
      ${e.course && !grouped ? `<p class="course">${esc(e.course)}</p>` : ''}
      <h2>${esc(e.title)}</h2>
      ${e.description ? `<p class="desc">${esc(e.description)}</p>` : ''}
      <p class="facts">${plural(e.questionCount, 'question')}, ${plural(e.topics.length, 'topic')}${e.onExamCount ? `, timed test of ${e.onExamCount}${e.timeLimit ? ` in ${e.timeLimit} min` : ''}` : ''}${e.assignmentCount ? `, ${plural(e.assignmentCount, 'coding assignment')}` : ''}</p>
      ${countdown(e.examDate) ? `<p class="countdown">${esc(countdown(e.examDate))}</p>` : ''}
      ${last ? `<p class="last">Last studied ${esc(fmtDate(last.finishedAt))}${best >= 0 ? ` · Best timed test ${best}%` : ''}</p>` : ''}
    </div>
    ${big && ready ? (() => { const r = ready; return `<div class="exam-card-side">${ring(r.score, { size: 116, label: r.score + '%', sub: r.label, tone: toneFor(r.score / 100) })}<span class="ring-caption">Quiz readiness</span></div>`; })() : ''}
    <span class="exam-card-go">${big ? 'Start studying' : 'Open'}</span>
  </a>`;
}

export async function readinessFor(ids) {
  const m = new Map();
  await Promise.all(ids.map(async (id) => {
    try { const ex = await getExam(id); m.set(id, readiness(ex, store.getStats(ex.id), store.getAttempts(ex.id))); } catch {}
  }));
  return m;
}

export function resumeBanner() {
  const session = store.getSession();
  return session ? `
    <div class="resume-banner" role="region" aria-label="Unfinished quiz">
      <div>
        <strong>You have an unfinished ${esc(MODES[session.mode]?.label.toLowerCase() || 'quiz')}</strong>
        <span class="muted">${esc(session.examTitle)} · ${Object.keys(session.answers).length} of ${session.questionIds.length} answered · started ${esc(fmtDate(session.startedAt))}</span>
      </div>
      <div class="row">
        <button class="btn" data-discard>Discard</button>
        <a class="btn primary" href="#/quiz">Resume</a>
      </div>
    </div>` : '';
}

const slug = (x) => String(x || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export async function render(main, params = {}) {
  if (cloud.enabled) return (await import('./classes.js')).render(main, params);
  const manifest = await getManifest();
  const all = manifest.exams;
  const courseFilter = params.course || '';
  const courseList = await listCourses();
  let chosen = chosenCourses(courseList);
  if (courseFilter && !chosen) {
    // arriving from a course link counts as choosing that course
    const c = courseList.find((x) => x.name && slug(x.name) === courseFilter);
    if (c) { saveChoice([c.name], courseList); chosen = [c.name]; }
  }
  if (!courseFilter && !chosen && courseList.some((c) => c.name)) {
    location.replace('#/subjects');
    return;
  }
  const exams = courseFilter ? all.filter((e) => slug(e.course) === courseFilter)
    : chosen ? all.filter((e) => e.preview || chosen.includes(e.course || '')) : all;
  const fresh = courseFilter ? [] : newCourses(courseList);
  const mine = !courseFilter && chosen && courseList.length > 1 ? `
    <p class="my-subjects">Showing ${chosen.map((c) => `<strong>${esc(courseLabel(c))}</strong>`).join(', ')}
      <a class="link-btn" href="#/subjects">Change classes</a></p>` : '';
  const freshNote = fresh.length ? `
    <div class="resume-banner new-course" role="region" aria-label="New classes">
      <div><strong>New on the site: ${fresh.map((c) => esc(courseLabel(c.name))).join(', ')}</strong><span class="muted">Add ${fresh.length > 1 ? 'them' : 'it'} to your home page if you're taking ${fresh.length > 1 ? 'them' : 'it'}.</span></div>
      <div class="row"><button class="btn" data-dismiss-new>Not now</button><a class="btn primary" href="#/subjects">Choose classes</a></div>
    </div>` : '';
  const courses = [...new Set(all.filter((e) => !e.preview).map((e) => e.course || ''))];
  const session = store.getSession();

  if (!exams.length) {
    main.innerHTML = courseFilter
      ? `<section class="page narrow empty-state"><h1>Course not found</h1><p>There are no exams for this course link.</p><a class="btn primary" href="#/">See all courses</a></section>`
      : `<section class="page narrow empty-state"><h1>No exams yet</h1><p>Exams appear here once they're added to the site.</p></section>`;
    return;
  }

  const current = exams.filter((e) => !e.archived && !e.preview);
  const featured = current[0];
  const others = current.slice(1);
  const archived = exams.filter((e) => e.archived);
  const previews = exams.filter((e) => e.preview);

  // readiness for each big card (one per course) needs that exam's questions
  const readyMap = new Map();
  const bigIds = new Set([featured?.id, ...[...new Set(current.map((e) => e.course || ''))].map((c) => current.find((e) => (e.course || '') === c)?.id)].filter(Boolean));
  await Promise.all([...bigIds].map(async (id) => {
    try { const ex = await getExam(id); readyMap.set(id, readiness(ex, store.getStats(ex.id), store.getAttempts(ex.id))); } catch {}
  }));

  const resume = session ? `
    <div class="resume-banner" role="region" aria-label="Unfinished quiz">
      <div>
        <strong>You have an unfinished ${esc(MODES[session.mode]?.label.toLowerCase() || 'quiz')}</strong>
        <span class="muted">${esc(session.examTitle)} · ${Object.keys(session.answers).length} of ${session.questionIds.length} answered · started ${esc(fmtDate(session.startedAt))}</span>
      </div>
      <div class="row">
        <button class="btn" data-discard>Discard</button>
        <a class="btn primary" href="#/quiz">Resume</a>
      </div>
    </div>` : '';

  const card = (e, big = false, grouped = false) => examCard(e, { big, grouped, ready: readyMap.get(e.id) });

  // Several subjects: one section per course, each with its own current exam
  const shownCourses = courses.filter((c) => exams.some((e) => (e.course || '') === c));
  if (shownCourses.length > 1 || courseFilter) {
    const section = (c) => {
      const list = exams.filter((e) => (e.course || '') === c && !e.preview);
      const cur = list.filter((e) => !e.archived);
      const past = list.filter((e) => e.archived);
      return `
        <section class="course-group">
          ${courseFilter ? '' : `<header class="course-head"><h2>${esc(c || 'Other exams')}</h2>${c ? `<a class="link-btn small" href="#/course/${slug(c)}">Link for this course only</a>` : ''}</header>`}
          ${cur.length ? card(cur[0], true, true) : ''}
          ${cur.length > 1 ? `<div class="exam-grid">${cur.slice(1).map((e) => card(e, false, true)).join('')}</div>` : ''}
          ${past.length ? `<h3 class="section-title">Past exams</h3><p class="muted section-sub">Still available for practice.</p><div class="exam-grid">${past.map((e) => card(e, false, true)).join('')}</div>` : ''}
        </section>`;
    };
    main.innerHTML = `
      <section class="page home">
        <header class="home-head">
          <h1>${esc(courseFilter ? (exams[0].course || config.siteName) : config.siteName)}</h1>
          ${courseFilter ? `<p class="tagline"><a href="#/">Back to my classes</a></p>` : config.tagline ? `<p class="tagline">${esc(config.tagline)}</p>` : ''}
          ${mine}
        </header>
        ${freshNote}
        ${resume}
        ${shownCourses.map(section).join('')}
        ${previews.length ? `<h2 class="section-title">Previews</h2><p class="muted section-sub">Loaded from a file on this device. Not published.</p><div class="exam-grid">${previews.map((e) => card(e)).join('')}</div>` : ''}
      </section>`;
    bindDiscard();
    return;
  }

  const panel = featured ? await (await import('./nextup.js')).studyPanel(featured) : '';
  main.innerHTML = `
    <section class="page home">
      <header class="home-head">
        <h1>${esc(config.siteName)}</h1>
        ${config.tagline ? `<p class="tagline">${esc(config.tagline)}</p>` : ''}
        ${mine}
      </header>
      ${freshNote}
      ${panel && session?.examId === featured?.id ? '' : resume}
      ${panel}
      ${panel ? '<h2 class="section-title">Your exam</h2>' : ''}
      ${card(featured, !panel)}
      ${others.length ? `<h2 class="section-title">Other exams</h2><div class="exam-grid">${others.map((e) => card(e)).join('')}</div>` : ''}
      ${archived.length ? `<h2 class="section-title">Past exams</h2><p class="muted section-sub">Still available for practice.</p><div class="exam-grid">${archived.map((e) => card(e)).join('')}</div>` : ''}
      ${previews.length ? `<h2 class="section-title">Previews</h2><p class="muted section-sub">Loaded from a file on this device. Not published.</p><div class="exam-grid">${previews.map((e) => card(e)).join('')}</div>` : ''}
    </section>`;

  bindDiscard();
  function bindDiscard() {
  main.querySelector('[data-dismiss-new]')?.addEventListener('click', () => {
    store.saveSettings({ subjectsSeen: courseList.map((c) => c.name) });
    main.querySelector('.new-course')?.remove();
  });
  main.querySelector('[data-discard]')?.addEventListener('click', async () => {
    const ok = await confirmDialog({ title: 'Discard this quiz?', body: '<p>Your answers in the unfinished quiz will be lost. Your saved progress stays.</p>', confirm: 'Discard', danger: true });
    if (ok) { store.clearSession(); render(main, params); }
  });
  }
}
