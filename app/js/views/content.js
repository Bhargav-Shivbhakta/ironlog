// Practice for one class (question sets and coding practice, not graded): instructors and admins upload question files (.md)
// and assignment zips here instead of using GitHub. Everything is checked in the browser first.
import { getManifest } from '../data.js';
import * as cloud from '../cloud.js';
import { parseExam } from '../parser.js';
import { readAssignments, solutionProblems, publicAssignments } from '../assignments-core.js';
import { testJava } from '../java/client.js';
import { formatErrors } from '../java/index.js';
import { esc, icon, plural, toast, confirmDialog, modal } from '../ui.js';
import { fmtDate } from '../engine.js';

const pad = (n) => String(n).padStart(2, '0');
const toLocalInput = (t) => { if (!t) return ''; const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fromLocalInput = (v) => { const t = v ? new Date(v).getTime() : NaN; return isNaN(t) ? null : t; };
const when = (t) => new Date(t).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const slug = (x) => String(x || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'exam';

let jszip = null;
function loadJSZip() {
  if (window.JSZip) return Promise.resolve(window.JSZip);
  return jszip ||= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'vendor/jszip.min.js';
    s.onload = () => res(window.JSZip);
    s.onerror = () => rej(new Error("Couldn't load the zip reader."));
    document.head.appendChild(s);
  });
}
function download(name, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export async function render(main, { classId }) {
  const staffClass = cloud.teachingClasses().find((c) => c.id === classId);
  if (!cloud.enabled || !(cloud.isAdmin() || staffClass)) {
    main.innerHTML = `<section class="page narrow empty-state"><h1>Instructors only</h1><p>Only this class's instructors and the site admin can manage its exams.</p><a class="btn primary" href="#/">Go to my classes</a></section>`;
    return;
  }
  const cls = staffClass || (await cloud.getClass(classId));
  if (!cls) { main.innerHTML = `<section class="page narrow empty-state"><h1>Class not found</h1><a class="btn primary" href="#/">Go home</a></section>`; return; }

  let practice = { ...(cls.practice || {}) }; // examId -> { off, dueAt, closeAfterDue }
  let mode = null; // null | { kind: 'exam', examId? } | { kind: 'asg', examId }
  let parsed = null, sourceText = '', fileName = '';
  let asgCheck = null; // { result, files, problems: Map, running, done }

  async function draw() {
    const all = (await getManifest()).exams;
    const uploaded = all.filter((e) => e.cloud && e.classId === classId);
    const builtIn = all.filter((e) => !e.cloud && !e.preview && (cls.exams || []).includes(e.id));
    main.innerHTML = `
      <section class="page narrow content-page">
        <nav class="crumbs"><a href="#/">My classes</a><a href="#/class/${encodeURIComponent(classId)}">${esc(cls.name)}</a></nav>
        <header class="inst-head">
          <div><p class="eyebrow">Instructor · ${esc(cls.name)}</p><h1>Practice</h1>
          <p class="muted">Practice sets are <strong>not graded</strong>: students can try them as often as they like. Upload a question file (.md) for each set, and optionally a .zip of coding practice. Students see changes right away. For exams, quizzes and assignments that count, use <a href="#/timed/${encodeURIComponent(classId)}">Graded work</a>.</p></div>
          ${mode ? '' : `<button class="btn primary" data-new-exam>${icon('upload')} Add a practice set</button>`}
        </header>
        ${mode ? '' : listHtml(uploaded, builtIn)}
        <div data-panel>${mode?.kind === 'exam' ? examPanel(uploaded) : mode?.kind === 'asg' ? asgPanel(uploaded) : ''}</div>
      </section>`;
    if (mode?.kind === 'exam' && parsed) showParse();
    if (mode?.kind === 'asg' && asgCheck) showAsg();
  }

  function listHtml(uploaded, builtIn) {
    if (!uploaded.length && !builtIn.length) {
      return `<div class="empty-state"><h2>No practice sets yet</h2><p>Click <strong>Add a practice set</strong> and choose its question file (.md). Need the format? Open <a href="#/author">Check a question file</a> for an example and a checker.</p></div>`;
    }
    return `<ul class="content-list">
      ${uploaded.map((e) => `
        <li class="content-item">
          <div class="content-main">
            <h2>${esc(e.title)} ${e.active ? '<span class="tag">Current</span>' : ''}${e.archived ? '<span class="tag">Past</span>' : ''}</h2>
            <p class="muted small">${plural(e.questionCount, 'question')} · ${plural((e.topics || []).length, 'topic')} · timed test of ${e.onExamCount || Math.min(50, e.questionCount)}${e.timeLimit ? ` in ${e.timeLimit} min` : ''} · updated ${esc(fmtDate(e.updatedAt))}${e.updatedBy ? ` by ${esc(e.updatedBy)}` : ''}</p>
            <p class="small">${icon('code')} ${e.assignmentCount ? plural(e.assignmentCount, 'programming assignment') : '<span class="muted">No programming assignments</span>'}</p>
            ${practiceCtl(e)}
          </div>
          <div class="content-actions">
            <a class="btn small" href="#/exam/${encodeURIComponent(e.id)}">Preview</a>
            <button class="btn small" data-rename="${esc(e.id)}" data-title="${esc(e.title)}">${icon('edit')} Rename</button>
            <button class="btn small" data-replace="${esc(e.id)}">${icon('upload')} Replace questions</button>
            <button class="btn small" data-dl-md="${esc(e.id)}">${icon('download')} .md</button>
            <button class="btn small" data-asg="${esc(e.id)}">${icon('code')} ${e.assignmentCount ? 'Replace assignments' : 'Add assignments'}</button>
            ${e.assignmentCount ? `<button class="btn small" data-dl-zip="${esc(e.id)}">${icon('download')} .zip</button><button class="btn small danger-outline" data-del-asg="${esc(e.id)}">Remove assignments</button>` : ''}
            <button class="btn small danger-outline" data-del-exam="${esc(e.id)}" data-title="${esc(e.title)}">${icon('trash')} Delete exam</button>
          </div>
        </li>`).join('')}
      ${builtIn.map((e) => `
        <li class="content-item builtin">
          <div class="content-main"><h2>${esc(e.title)}</h2><p class="muted small">${plural(e.questionCount, 'question')} · from the website files (GitHub). Use <strong>Move here</strong> to upload it on this page instead; students keep their progress.</p>${practiceCtl(e)}</div>
          <div class="content-actions"><a class="btn small" href="#/exam/${encodeURIComponent(e.id)}">Preview</a><button class="btn small primary" data-move="${esc(e.id)}" data-title="${esc(e.title)}">${icon('upload')} Move here</button></div>
        </li>`).join('')}
    </ul>`;
  }

  // ---------- practice on/off and due date ----------
  function practiceStatus(id) {
    const p = cloud.practiceState({ practice }, id);
    if (p.off) return { tone: 'bad', text: 'Off: students can’t see or open it' };
    if (p.notYet) return { tone: 'ok', text: `Opens ${when(p.opensAt)}: students can’t see it until then` };
    if (p.closed) return { tone: 'bad', text: `Closed: the due date (${when(p.dueAt)}) has passed` };
    if (p.dueAt) return { tone: p.pastDue ? 'ok' : 'good', text: p.pastDue ? `Past due (${when(p.dueAt)}), still open` : `Open · due ${when(p.dueAt)}` };
    return { tone: 'good', text: 'Open · no due date' };
  }
  function practiceCtl(e) {
    const p = cloud.practiceState({ practice }, e.id), st = practiceStatus(e.id);
    const t = esc(e.title);
    return `
      <div class="practice-ctl" data-pr="${esc(e.id)}" role="group" aria-label="Practice settings for ${t}">
        <label class="check"><input type="checkbox" data-pr-on ${p.off ? '' : 'checked'}><span><strong>Students can practise</strong></span></label>
        <span class="pr-due"><label class="field inline"><span>Due</span><input type="datetime-local" data-pr-due value="${toLocalInput(p.dueAt)}" aria-label="Due date for ${t}"></label>
        <button type="button" class="btn small" data-pr-setdue disabled>Save due date</button>
        ${p.dueAt ? `<button type="button" class="link-btn small" data-pr-nodue>Remove due date</button>` : ''}</span>
        ${p.notYet ? `<button type="button" class="link-btn small" data-pr-opennow>Open it for students now</button>` : ''}
        <label class="check"><input type="checkbox" data-pr-close ${p.closeAfterDue ? 'checked' : ''} ${p.dueAt ? '' : 'disabled'}><span>Close it after the due date</span></label>
        <p class="pr-status small ${st.tone}" data-pr-status aria-live="polite">${esc(st.text)}</p>
      </div>`;
  }
  async function savePractice(box, patch = {}, focus = '[data-pr-on]') {
    const id = box.dataset.pr, title = box.getAttribute('aria-label').replace(/^Practice settings for /, '');
    const cfg = {
      off: !box.querySelector('[data-pr-on]').checked,
      dueAt: practice[id]?.dueAt || null,
      opensAt: practice[id]?.opensAt || null,
      closeAfterDue: box.querySelector('[data-pr-close]').checked,
      ...patch,
    };
    box.querySelectorAll('input,button').forEach((x) => (x.disabled = true));
    try {
      practice[id] = await cloud.setPractice(classId, id, cfg);
      toast(practice[id].off ? `${title} is off for students` : `${title} saved`, 'good');
    } catch (e) {
      toast("Couldn't save: " + (e?.code === 'permission-denied' ? "you're not an instructor for this class, or the latest firestore.rules aren't published." : e?.message || e), 'bad');
    }
    box.outerHTML = practiceCtl({ id, title });
    main.querySelector(`[data-pr="${CSS.escape(id)}"] ${focus}`)?.focus();
  }

  // ---------- question file ----------
  function examPanel(uploaded) {
    const target = mode.examId ? uploaded.find((e) => e.id === mode.examId) || { title: mode.title } : null;
    return `
      <section class="upload-panel">
        <h2>${mode.move ? `Move ${esc(mode.title)} to this page` : target ? `Replace the questions of ${esc(target.title)}` : 'Add a practice set'}</h2>
        ${mode.move ? '<p class="small">Choose the same questions.md that is in GitHub (or an updated one). After publishing, this page manages it and students keep their progress. Its programming assignments need to be added again here as a .zip. You can then delete the exam folder from GitHub.</p>' : ''}
        <p class="muted small">Choose the practice set's question file (.md). It's checked here first; nothing is published until you click Publish.${target ? ' Students keep their progress on questions whose IDs (Q1, Q2…) stay the same.' : ''}</p>
        <div class="dropzone" data-drop="md">
          <p class="drop-hint">${icon('upload')} <strong>Drag the .md file here</strong> <span class="muted">or</span></p>
          <div class="row center"><label class="btn">Choose .md file<input type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" data-md-file hidden></label></div>
          <p class="muted small drop-name" data-file-name>${esc(fileName)}</p>
        </div>
        <details class="paste-box"><summary>…or paste the file's text</summary><textarea rows="8" data-md-paste spellcheck="false" placeholder="---&#10;title: Final Exam&#10;time_limit: 120&#10;---&#10;&#10;# Topic: Arrays&#10;..."></textarea></details>
        <div data-parse aria-live="polite"></div>
        <div class="row end upload-actions"><button class="btn" data-cancel>Cancel</button><button class="btn primary" data-publish-exam disabled>${icon('check')} Publish</button></div>
      </section>`;
  }
  function onSource(text, name) {
    sourceText = text; fileName = name || 'pasted text';
    parsed = text.trim() ? parseExam(text, { fallbackTitle: name ? name.replace(/\.(md|markdown|txt)$/i, '') : 'New exam' }) : null;
    showParse();
  }
  function showParse() {
    const box = main.querySelector('[data-parse]');
    const btn = main.querySelector('[data-publish-exam]');
    if (!parsed) { box.innerHTML = ''; btn.disabled = true; return; }
    const r = parsed, ok = !r.errors.length && r.questions.length > 0;
    const replacing = !!mode.examId;
    box.innerHTML = `
      <div class="parse-result ${ok ? 'pr-good' : 'pr-bad'}">
        <p><strong>${ok ? `${icon('check')} Looks good` : `${icon('x')} ${r.errors.length ? plural(r.errors.length, 'problem') + ' to fix' : 'No questions found'}`}</strong></p>
        <p>${plural(r.questions.length, 'question')} in ${plural(r.topics.length, 'topic')}${r.questions.some((q) => q.onExam) ? `, ${r.questions.filter((q) => q.onExam).length} in the timed practice test` : ''}${r.meta.timeLimit ? `, ${r.meta.timeLimit} minutes` : ''}.</p>
        ${!replacing ? `<label class="field"><span>Name students see</span><input data-exam-title value="${esc(r.meta.title ? (/practice/i.test(r.meta.title) ? r.meta.title : r.meta.title + ' Practice') : '')}" maxlength="80"></label>` : ''}
        ${r.errors.length ? `<ul class="issue-list bad">${r.errors.slice(0, 30).map((e) => `<li><strong>Line ${e.line}:</strong> ${esc(e.message)}</li>`).join('')}${r.errors.length > 30 ? `<li>…and ${r.errors.length - 30} more</li>` : ''}</ul>` : ''}
        ${r.warnings.length ? `<details><summary>${plural(r.warnings.length, 'warning')} (you can still publish)</summary><ul class="issue-list">${r.warnings.slice(0, 30).map((w) => `<li><strong>Line ${w.line}:</strong> ${esc(w.message)}</li>`).join('')}</ul></details>` : ''}
        ${r.questions.some((q) => /!\[[^\]]*\]\((?!https?:)/.test(q.text)) ? '<p class="small bad">Some questions use pictures from files next to the .md. Uploaded exams can only show pictures from web links (https://…).</p>' : ''}
      </div>`;
    btn.disabled = !ok;
  }
  async function publishExam() {
    const btn = main.querySelector('[data-publish-exam]');
    const all = (await getManifest()).exams;
    const title = mode.examId ? all.find((e) => e.id === mode.examId)?.title : (main.querySelector('input[data-exam-title]')?.value.trim() || parsed.meta.title);
    if (!title) { toast('Give the exam a name', 'bad'); return; }
    let examId = mode.examId;
    if (!examId) {
      examId = `${classId}--${slug(title)}`;
      if (all.some((e) => e.id === examId)) { toast(`This class already has an exam called "${title}". Use Replace questions on it, or choose another name.`, 'bad'); return; }
    }
    btn.disabled = true; btn.textContent = 'Publishing…';
    try {
      const meta = { ...parsed.meta, title };
      await cloud.saveExam(classId, { examId, meta, source: sourceText, counts: { questions: parsed.questions.length, onExam: parsed.questions.filter((q) => q.onExam).length, topics: parsed.topics.map((t) => ({ name: t.name, count: t.count })) } });
      toast(`${title} published. Students in ${cls.name} can open it now.`, 'good');
      mode = null; parsed = null; sourceText = ''; fileName = '';
      draw();
    } catch (e) {
      toast("Couldn't publish: " + (e?.code === 'permission-denied' ? "you're not an instructor for this class." : e?.message || e), 'bad');
      btn.disabled = false; btn.innerHTML = `${icon('check')} Publish`;
    }
  }

  // ---------- assignments zip ----------
  function asgPanel(uploaded) {
    const e = uploaded.find((x) => x.id === mode.examId);
    return `
      <section class="upload-panel">
        <h2>Programming assignments for ${esc(e?.title || '')}</h2>
        <p class="muted small">Choose a .zip with one folder per assignment (assignment.md, the starter .java file, tests/*.in and *.out, optional checks.txt, and solution/ with your reference solution). Each solution is run against its tests here before anything is published. Solutions are never shown to students. ${e?.assignmentCount ? 'This replaces the current assignments; students keep the code they wrote.' : ''}</p>
        <div class="dropzone" data-drop="asg">
          <p class="drop-hint">${icon('upload')} <strong>Drag the .zip or the assignments folder here</strong> <span class="muted">or</span></p>
          <div class="row center"><label class="btn">Choose .zip<input type="file" accept=".zip,application/zip" data-zip hidden></label><label class="btn">Choose a folder<input type="file" webkitdirectory directory multiple data-asg-folder hidden></label></div>
          <p class="muted small drop-name" data-file-name>${esc(fileName)}</p>
        </div>
        ${e?.assignmentCount ? `<p class="small"><button class="link-btn" data-dl-zip="${esc(e.id)}">Download the current ones as a starting point</button></p>` : ''}
        <div data-asg-result aria-live="polite"></div>
        <div class="row end upload-actions"><button class="btn" data-cancel>Cancel</button><button class="btn primary" data-publish-asg disabled>${icon('check')} Publish assignments</button></div>
      </section>`;
  }
  const wanted = (path) => /\.(md|java|in|out|txt)$/i.test(path) && !/(^|\/)(__MACOSX|\.)/.test(path);
  async function onZip(file) {
    return checkAssignments(file.name, async () => {
      const JSZip = await loadJSZip();
      const zip = await JSZip.loadAsync(file);
      const files = new Map();
      for (const f of Object.values(zip.files).filter((f) => !f.dir && wanted(f.name))) files.set(f.name.replace(/\\/g, '/'), await f.async('string'));
      return files;
    });
  }
  // A folder (dragged in, or chosen with "Choose a folder"): [{ path, file }]
  async function onFolder(name, list) {
    return checkAssignments(name, async () => {
      const files = new Map();
      for (const { path, file } of list) if (wanted(path)) files.set(path.replace(/\\/g, '/'), await file.text());
      if (!files.size) throw new Error("that folder has no assignment files in it (assignment.md, .java, tests/*.in and *.out)");
      return files;
    });
  }
  async function checkAssignments(name, read) {
    fileName = name;
    asgCheck = { running: true, problems: new Map(), done: 0 };
    showAsg();
    try {
      const files = await read();
      const result = readAssignments(files);
      asgCheck = { result, files, problems: new Map(), done: 0, running: true };
      showAsg();
      for (const a of result.assignments) {
        if (a.solution != null) {
          const r = await testJava(a.solution, { className: a.cls, tests: a.tests.map(({ name, input, output }) => ({ name, input, output })), checks: a.checks }, a.cls + '.java');
          const p = r.killed ? ['the reference solution ran too long (infinite loop?)'] : solutionProblems(a, r, formatErrors);
          asgCheck.problems.set(a.slug, p);
        }
        asgCheck.done++;
        showAsg();
      }
      asgCheck.running = false;
    } catch (e) {
      asgCheck = { error: e?.message || String(e) };
    }
    showAsg();
  }
  function showAsg() {
    const box = main.querySelector('[data-asg-result]');
    const btn = main.querySelector('[data-publish-asg]');
    if (!box) return;
    const c = asgCheck;
    if (!c) { box.innerHTML = ''; btn.disabled = true; return; }
    if (c.error) { box.innerHTML = `<p class="bad">Couldn't read ${esc(fileName || 'that')}: ${esc(c.error)}</p>`; btn.disabled = true; return; }
    if (!c.result) { box.innerHTML = '<p class="muted">Reading the zip…</p>'; btn.disabled = true; return; }
    const r = c.result;
    const failing = [...c.problems.values()].some((p) => p.length);
    const ok = !c.running && !r.errors.length && !failing && r.assignments.length > 0;
    box.innerHTML = `
      <div class="parse-result ${ok ? 'pr-good' : c.running ? '' : 'pr-bad'}">
        <p><strong>${c.running ? `Checking reference solutions… ${c.done} of ${r.assignments.length}` : ok ? `${icon('check')} ${plural(r.assignments.length, 'assignment')} ready` : !r.assignments.length ? `${icon('x')} No assignments found` : `${icon('x')} Fix the problems below, then choose the zip again`}</strong></p>
        ${!r.assignments.length && !c.running ? '<p class="small">Each assignment needs its own folder with an assignment.md file inside.</p>' : ''}
        <ul class="asg-check">${r.assignments.map((a) => { const p = c.problems.get(a.slug); return `
          <li><span class="asg-check-icon ${p ? (p.length ? 'bad' : 'good') : a.solution == null ? 'warn' : ''}">${p ? (p.length ? icon('x') : icon('check')) : a.solution == null ? '!' : '…'}</span>
            <span><strong>${esc(a.title)}</strong> <span class="muted small">${plural(a.tests.length, 'test')}${a.checks.length ? ` + ${plural(a.checks.length, 'requirement')}` : ''}${a.solution == null ? ' · no solution, tests not verified' : p && !p.length ? ' · solution passes everything' : ''}</span>
            ${p && p.length ? `<pre class="small">${esc(p.join('\n'))}</pre>` : ''}</span></li>`; }).join('')}</ul>
        ${r.errors.length ? `<ul class="issue-list bad">${r.errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}
        ${r.warnings.length ? `<details><summary>${plural(r.warnings.length, 'warning')}</summary><ul class="issue-list">${r.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></details>` : ''}
      </div>`;
    btn.disabled = !ok;
  }
  async function publishAsg() {
    const btn = main.querySelector('[data-publish-asg]');
    btn.disabled = true; btn.textContent = 'Publishing…';
    try {
      const files = [...asgCheck.files.entries()].map(([path, text]) => ({ path, text }));
      await cloud.saveAssignments(classId, mode.examId, { assignments: publicAssignments(asgCheck.result.assignments), files });
      toast(`${plural(asgCheck.result.assignments.length, 'assignment')} published`, 'good');
      mode = null; asgCheck = null; fileName = '';
      draw();
    } catch (e) {
      toast("Couldn't publish: " + (e?.message || e), 'bad');
      btn.disabled = false; btn.innerHTML = `${icon('check')} Publish assignments`;
    }
  }

  // ---------- events ----------
  main.addEventListener('click', async (ev) => {
    const b = ev.target.closest('button');
    if (b?.matches('[data-rename]')) {
      const id = b.dataset.rename, oldTitle = b.dataset.title;
      const m = modal({
        title: `Rename ${oldTitle}`,
        body: `<label class="field"><span>New name</span><input data-new-title maxlength="80" value="${esc(oldTitle)}"></label><p class="muted small">This is the name students see. Tip: put "Practice" in the name (for example <strong>${esc(oldTitle.replace(/\s*practice\s*$/i, ''))} Practice</strong>) so it isn't confused with the real exam. Students keep their progress.</p>`,
        actions: [{ label: 'Cancel' }, { label: 'Rename', kind: 'primary', onClick: (close) => {
          const v = m.el.querySelector('[data-new-title]').value.trim();
          if (!v) { toast('Type a name', 'bad'); return true; }
          cloud.renameExam(classId, id, v).then(() => { toast(`Renamed to ${v}`, 'good'); draw(); }).catch((e) => toast("Couldn't rename: " + (e?.code === 'permission-denied' ? "you're not an instructor for this class." : e?.message || e), 'bad'));
          close(); return true;
        } }],
      });
      const inp = m.el.querySelector('[data-new-title]');
      if (!/practice/i.test(oldTitle)) inp.value = `${oldTitle} Practice`;
      inp.focus(); inp.select();
      inp.addEventListener('keydown', (k) => { if (k.key === 'Enter') { k.preventDefault(); m.el.querySelector('.modal-foot .btn.primary').click(); } });
      return;
    }
    if (b?.matches('[data-pr-setdue]')) {
      const box = b.closest('[data-pr]'), v = box.querySelector('[data-pr-due]').value;
      if (!fromLocalInput(v)) { toast('Pick a date and time first (or use Remove due date)', 'bad'); return; }
      return savePractice(box, { dueAt: fromLocalInput(v) }, '[data-pr-due]');
    }
    if (b?.matches('[data-pr-opennow]')) return savePractice(b.closest('[data-pr]'), { opensAt: null });
    if (b?.matches('[data-pr-nodue]')) return savePractice(b.closest('[data-pr]'), { dueAt: null, closeAfterDue: false }, '[data-pr-due]');
    if (!b) return;
    if ('newExam' in b.dataset) { mode = { kind: 'exam' }; parsed = null; fileName = ''; return draw(); }
    if (b.dataset.move) { mode = { kind: 'exam', examId: b.dataset.move, title: b.dataset.title, move: true }; parsed = null; fileName = ''; return draw(); }
    if (b.dataset.replace) { mode = { kind: 'exam', examId: b.dataset.replace }; parsed = null; fileName = ''; return draw(); }
    if (b.dataset.asg) { mode = { kind: 'asg', examId: b.dataset.asg }; asgCheck = null; fileName = ''; return draw(); }
    if ('cancel' in b.dataset) { mode = null; parsed = null; asgCheck = null; return draw(); }
    if ('publishExam' in b.dataset) return publishExam();
    if ('publishAsg' in b.dataset) return publishAsg();
    if (b.dataset.dlMd) {
      const src = await cloud.examSource(classId, b.dataset.dlMd);
      if (src == null) return toast('No file found', 'bad');
      return download(`${b.dataset.dlMd.split('--').pop()}.md`, new Blob([src], { type: 'text/markdown' }));
    }
    if (b.dataset.dlZip) {
      const files = await cloud.assignmentFiles(classId, b.dataset.dlZip);
      if (!files) return toast('No assignment files found', 'bad');
      const JSZip = await loadJSZip();
      const z = new JSZip();
      files.forEach((f) => z.file(f.path, f.text));
      return download(`${b.dataset.dlZip.split('--').pop()}-assignments.zip`, await z.generateAsync({ type: 'blob' }));
    }
    if (b.dataset.delAsg) {
      if (!(await confirmDialog({ title: 'Remove the programming assignments?', body: '<p>Students will no longer see them. The code students wrote stays saved in their accounts.</p>', confirm: 'Remove', danger: true }))) return;
      await cloud.deleteAssignments(classId, b.dataset.delAsg); toast('Assignments removed'); return draw();
    }
    if (b.dataset.delExam) {
      if (!(await confirmDialog({ title: `Delete ${b.dataset.title}?`, body: '<p>Students in this class will no longer see this exam or its assignments. Their saved progress stays in their accounts, so uploading it again with the same name brings it back. Download the .md first if you want a copy.</p>', confirm: 'Delete exam', danger: true }))) return;
      await cloud.deleteExam(classId, b.dataset.delExam); toast('Exam deleted'); return draw();
    }
  });
  main.addEventListener('input', (ev) => { if (ev.target.matches('[data-pr-due]')) ev.target.closest('[data-pr]').querySelector('[data-pr-setdue]').disabled = false; });
  main.addEventListener('change', async (ev) => {
    const pr = ev.target.closest('[data-pr]');
    if (pr) {
      if (ev.target.matches('[data-pr-on]') && !ev.target.checked) {
        const ok = await confirmDialog({ title: 'Turn practice off?', body: '<p>Students in this class won’t see this practice or be able to open it. Their progress is kept, and you can turn it back on any time.</p>', confirm: 'Turn off' });
        if (!ok) { ev.target.checked = true; return; }
      }
      if (ev.target.matches('[data-pr-due]')) { pr.querySelector('[data-pr-setdue]').disabled = false; return; }
      return savePractice(pr, {}, ev.target.matches('[data-pr-close]') ? '[data-pr-close]' : '[data-pr-on]');
    }
    if (ev.target.matches('[data-md-file]') && ev.target.files[0]) useMdFile(ev.target.files[0]);
    if (ev.target.matches('[data-zip]') && ev.target.files[0]) useZipFile(ev.target.files[0]);
    if (ev.target.matches('[data-asg-folder]') && ev.target.files.length) {
      const list = [...ev.target.files].map((file) => ({ path: file.webkitRelativePath || file.name, file }));
      const top = (list[0]?.path || '').split('/')[0] || 'folder';
      setName(`${top}/ (folder)`); onFolder(`${top}/ (folder)`, list);
    }
    if (ev.target.type === 'file') ev.target.value = ''; // choosing the same file again still works
  });

  // ---------- drag and drop ----------
  const setName = (name) => { const el = main.querySelector('[data-file-name]'); if (el) el.textContent = name; };
  async function useMdFile(f) {
    if (!/\.(md|markdown|txt)$/i.test(f.name)) { toast(`"${f.name}" isn't a .md file. Drop the exam's question file (questions.md).`, 'bad'); return; }
    setName(f.name); onSource(await f.text(), f.name);
  }
  function useZipFile(f) {
    if (!/\.zip$/i.test(f.name)) { toast(`"${f.name}" isn't a .zip. Drop a .zip, or the assignments folder itself.`, 'bad'); return; }
    setName(f.name); onZip(f);
  }
  // read every file inside a dropped folder (browsers hand folders over as "entries")
  async function readEntry(entry, prefix, out) {
    if (entry.isFile) { out.push({ path: prefix + entry.name, file: await new Promise((res, rej) => entry.file(res, rej)) }); return; }
    if (!entry.isDirectory || /^(__MACOSX|\.)/.test(entry.name)) return;
    const reader = entry.createReader();
    for (;;) {
      const batch = await new Promise((res, rej) => reader.readEntries(res, rej)); // returns at most ~100 at a time
      if (!batch.length) break;
      for (const child of batch) await readEntry(child, prefix + entry.name + '/', out);
    }
  }
  const zoneOf = (ev) => ev.target.closest?.('[data-drop]');
  const hasFiles = (ev) => [...(ev.dataTransfer?.types || [])].includes('Files');
  main.addEventListener('dragenter', (ev) => { const z = zoneOf(ev); if (z && hasFiles(ev)) { ev.preventDefault(); z.classList.add('over'); } });
  main.addEventListener('dragover', (ev) => { const z = zoneOf(ev); if (z && hasFiles(ev)) { ev.preventDefault(); ev.dataTransfer.dropEffect = 'copy'; z.classList.add('over'); } });
  main.addEventListener('dragleave', (ev) => { const z = zoneOf(ev); if (z && !z.contains(ev.relatedTarget)) z.classList.remove('over'); });
  main.addEventListener('drop', async (ev) => {
    const z = zoneOf(ev);
    if (!z) return;
    ev.preventDefault();
    z.classList.remove('over');
    const items = [...(ev.dataTransfer.items || [])].filter((i) => i.kind === 'file');
    const entries = items.map((i) => i.webkitGetAsEntry?.()).filter(Boolean);
    const files = [...ev.dataTransfer.files];
    try {
      if (z.dataset.drop === 'md') {
        if (entries[0]?.isDirectory) { toast('Drop the question file (.md) itself, not a folder.', 'bad'); return; }
        if (files.length > 1) toast('Only the first file was used. Drop one .md file at a time.');
        if (files[0]) await useMdFile(files[0]);
        return;
      }
      // assignments: a .zip, or the folder itself (or several assignment folders at once)
      if (entries.some((e) => e.isDirectory)) {
        const list = [];
        for (const e of entries) await readEntry(e, '', list);
        const name = entries.length === 1 ? `${entries[0].name}/ (folder)` : `${entries.length} folders`;
        setName(name); onFolder(name, list);
      } else if (files[0]) useZipFile(files[0]);
    } catch (e) {
      console.error(e);
      toast("Couldn't read what was dropped: " + (e?.message || e) + '. Try the Choose button instead.', 'bad');
    }
  });
  // a file dropped just outside the box must not make the browser leave the page
  const stray = (ev) => { if (hasFiles(ev) && !zoneOf(ev)) ev.preventDefault(); };
  window.addEventListener('dragover', stray);
  window.addEventListener('drop', stray);
  let pt;
  main.addEventListener('input', (ev) => { if (ev.target.matches('[data-md-paste]')) { clearTimeout(pt); pt = setTimeout(() => onSource(ev.target.value, ''), 250); } });
  await draw();
  return () => { window.removeEventListener('dragover', stray); window.removeEventListener('drop', stray); };
}
