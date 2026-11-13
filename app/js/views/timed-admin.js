// Professor's pages for timed exams:
//   #/timed/<class>             the class's timed exams
//   #/timed/<class>/new         create one
//   #/timed/<class>/<exam>      one exam: Live (monitor) · Results (grade, release) · Settings
import * as cloud from '../cloud.js';
import { esc, icon, toast, modal, confirmDialog, plural } from '../ui.js';
import { md } from '../render.js';
import { parseExam } from '../parser.js';
import { readAssignments, solutionProblems } from '../assignments-core.js';
import { testJava } from '../java/client.js';
import { formatErrors } from '../java/index.js';
import { ms, splitExam, gradeObjective, codePoints, answered, examPhase, attemptDeadline, parseExtraTime, QTYPE_LABEL, EXIT_LABEL } from '../timed.js';

const DAY = 86400000;
const pad = (n) => String(n).padStart(2, '0');
const toLocalInput = (t) => { if (!t) return ''; const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fromLocalInput = (s) => (s ? new Date(s).getTime() : null);
const when = (t) => (t ? new Date(t).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '–');
const clock = (t) => (t ? new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' }) : '–');
const mmss = (msLeft) => { if (msLeft <= 0) return '0:00'; const s = Math.round(msLeft / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`; };
const r1 = (x) => (x == null || isNaN(x) ? '–' : String(Math.round(x * 10) / 10));
const LEAVES = ['tab-hidden', 'window-blur', 'fullscreen-exit', 'page-leave', 'print-screen', 'devtools-key', 'returned-after-leaving'];
const PHASE_LABEL = { draft: 'Draft', upcoming: 'Scheduled', open: 'Open now', closed: 'Closed' };

let jszip = null;
const loadJSZip = () => (window.JSZip ? Promise.resolve(window.JSZip) : (jszip ||= new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'vendor/jszip.min.js'; s.onload = () => res(window.JSZip); s.onerror = () => rej(new Error("Couldn't load the zip reader.")); document.head.appendChild(s); })));

export async function render(main, { classId, tid }, query = {}) {
  if (!cloud.enabled || !cloud.currentUser()) { main.innerHTML = '<section class="page"><h1>Timed exams</h1><p>Sign in with your school account first.</p></section>'; return; }
  const staffOf = cloud.myClasses().filter((c) => ['instructor', 'ta'].includes(c.role)).map((c) => c.id);
  const cls = await cloud.getClass(classId).catch(() => null);
  if (!cls || !(cloud.isAdmin() || staffOf.includes(classId))) {
    main.innerHTML = `<section class="page"><h1>Timed exams</h1><p>Only this class's instructors and TAs can manage its timed exams.</p><p><a class="btn" href="#/">Home</a></p></section>`;
    return;
  }
  if (!tid) return listPage(main, cls);
  if (tid === 'new') return editorPage(main, cls, null);
  return examPage(main, cls, tid, query);
}

// ---------------------------------------------------------------- list
async function listPage(main, cls) {
  main.innerHTML = `<section class="page timed-admin"><p class="eyebrow"><a href="#/instructor?class=${encodeURIComponent(cls.id)}&tab=timed">${esc(cls.name)}</a></p><h1>Timed exams</h1><div data-list><p class="muted loading-line">Loading…</p></div></section>`;
  const box = main.querySelector('[data-list]');
  try {
    const list = await cloud.listTimed(cls.id);
    box.innerHTML = timedList(cls, list);
  } catch (e) { box.innerHTML = `<p class="bad">Couldn't load the exams: ${esc(e?.message || e)}</p>`; }
}
// also used inside the class dashboard's "Timed exams" tab
export function timedList(cls, list) {
  const now = Date.now();
  return `
    <div class="row between wrap timed-head">
      <p class="dash-intro">Locked-down exams with a time limit: multiple choice, short and written answers, and Java programming. One attempt per student.</p>
      <a class="btn primary" href="#/timed/${encodeURIComponent(cls.id)}/new">${icon('plus')} New timed exam</a>
    </div>
    ${list.length ? `<ul class="timed-list">${list.map((t) => {
      const ph = examPhase({ ...t, opensAt: ms(t.opensAt), closesAt: ms(t.closesAt) }, now);
      return `<li><a href="#/timed/${encodeURIComponent(cls.id)}/${encodeURIComponent(t.id)}">
        <span class="timed-title"><strong>${esc(t.title || 'Untitled exam')}</strong>
          <span class="muted small">${when(ms(t.opensAt))} → ${when(ms(t.closesAt))} · ${t.durationMin} min · ${plural((t.questions || []).length, 'question')} · ${r1(t.totalPoints)} points${t.requireSEB ? ' · Safe Exam Browser' : ''}</span></span>
        <span class="phase phase-${ph}">${PHASE_LABEL[ph]}${t.released ? ' · scores released' : ''}</span></a></li>`;
    }).join('')}</ul>` : '<div class="empty-state"><h2>No timed exams yet</h2><p>Create one from a question file (the same format as practice exams) and, if you like, Java programming problems.</p></div>'}`;
}

// ---------------------------------------------------------------- editor
async function editorPage(main, cls, existing, host = null, onSaved = null) {
  const root = host || main;
  let key = null, extra = [], attemptsExist = false;
  if (existing) {
    [key, extra] = await Promise.all([cloud.getTimedKey(cls.id, existing.id).catch(() => null), cloud.listTimedExtra(cls.id, existing.id).catch(() => [])]);
    attemptsExist = (await cloud.listAttempts(cls.id, existing.id).catch(() => [])).length > 0;
  }
  const t = existing || { title: '', instructions: 'Answer every question. You have one attempt. Leaving this page, switching tabs or apps, or leaving full screen ends your exam immediately.', durationMin: 60, shuffleQ: true, shuffleOpts: true, requireSEB: false, allowPhones: false, releaseDetail: true, questions: [], totalPoints: 0, status: 'draft' };
  const startDefault = (() => { const d = new Date(Date.now() + DAY); d.setMinutes(0, 0, 0); return d.getTime(); })();
  const state = {
    opensAt: ms(t.opensAt) || startDefault, closesAt: ms(t.closesAt) || startDefault + 2 * 3600000,
    questions: (t.questions || []).map((q) => ({ ...q })), key: key?.questions || null,
    parsed: null, mdName: '', asg: null, asgName: '', asgProblems: new Map(), asgRunning: false, filesChanged: false,
  };
  root.innerHTML = `
    ${host ? '' : `<section class="page timed-admin"><p class="eyebrow"><a href="#/timed/${encodeURIComponent(cls.id)}">Timed exams · ${esc(cls.name)}</a></p><h1>New timed exam</h1>`}
    <form class="timed-form" data-editor novalidate>
      ${attemptsExist ? `<p class="note">${icon('note')} Students have already started this exam, so its questions can't be changed. You can still change the times, rules and extra time.</p>` : ''}
      <fieldset><legend>1. The exam</legend>
        <label class="field"><span>Title</span><input name="title" required maxlength="100" value="${esc(t.title)}" placeholder="Midterm 2"></label>
        <label class="field"><span>Instructions shown before students start</span><textarea name="instructions" rows="4" maxlength="3000">${esc(t.instructions || '')}</textarea></label>
      </fieldset>
      <fieldset><legend>2. When</legend>
        <div class="grid3">
          <label class="field"><span>Opens</span><input type="datetime-local" name="opensAt" value="${toLocalInput(state.opensAt)}" required></label>
          <label class="field"><span>Closes</span><input type="datetime-local" name="closesAt" value="${toLocalInput(state.closesAt)}" required></label>
          <label class="field"><span>Time limit (minutes)</span><input type="number" name="durationMin" min="1" max="600" step="1" value="${esc(t.durationMin)}" required></label>
        </div>
        <p class="muted small">Students can start any time between Opens and Closes. Each student's clock starts when they press Start and never runs past Closes. Times use Firebase's clock, not the student's computer.</p>
      </fieldset>
      <fieldset ${attemptsExist ? 'disabled' : ''}><legend>3. Questions</legend>
        <p class="muted small">Use the same files as practice exams. Mark points in a question's heading (<code>## Q3 · 2pts</code>). Written answers graded by hand: <code>## Q9 · written · 5pts</code>. Programming problems use the assignments format (one folder per problem with assignment.md, the starter .java, tests/ and solution/); add <code>points: 10</code> to assignment.md. Tests listed in <code>sample_tests</code> are shown to students; the rest stay hidden for grading.</p>
        <div class="grid2">
          <div class="dropzone" data-drop="md"><p class="drop-hint">${icon('upload')} <strong>Question file (.md)</strong></p><div class="row center"><label class="btn">Choose .md<input type="file" accept=".md,.markdown,.txt" data-md hidden></label></div><p class="muted small drop-name" data-md-name></p></div>
          <div class="dropzone" data-drop="asg"><p class="drop-hint">${icon('code')} <strong>Programming problems</strong> <span class="muted small">(optional)</span></p><div class="row center"><label class="btn">Choose .zip<input type="file" accept=".zip" data-zip hidden></label><label class="btn">Choose a folder<input type="file" webkitdirectory directory multiple data-folder hidden></label></div><p class="muted small drop-name" data-asg-name></p></div>
        </div>
        <div data-qcheck aria-live="polite"></div>
        <div data-qlist></div>
      </fieldset>
      <fieldset><legend>4. Rules</legend>
        <label class="check"><input type="checkbox" name="shuffleQ" ${t.shuffleQ ? 'checked' : ''}><span><strong>Shuffle the question order</strong> for each student (programming problems stay at the end)</span></label>
        <label class="check"><input type="checkbox" name="shuffleOpts" ${t.shuffleOpts ? 'checked' : ''}><span><strong>Shuffle the answer choices</strong> for each student</span></label>
        <label class="check"><input type="checkbox" name="requireSEB" ${t.requireSEB ? 'checked' : ''}><span><strong>Require Safe Exam Browser</strong> (free app for Windows, Mac and iPad that blocks screenshots, other apps and switching). Students without it can't start.</span></label>
        <label class="check"><input type="checkbox" name="allowPhones" ${t.allowPhones ? 'checked' : ''}><span><strong>Allow phones</strong> (off: laptops and iPads only)</span></label>
        <label class="check"><input type="checkbox" name="releaseDetail" ${t.releaseDetail !== false ? 'checked' : ''}><span>When scores are released, also show students <strong>which questions they got right</strong> (the right answers are never shown)</span></label>
        <p class="muted small">Always on: one attempt, full screen, no copy/paste or right-click, no hints or answer checking, and leaving the exam (switching tab, app or desktop, leaving full screen, closing or reloading) ends it immediately. Only you can let a student back in.</p>
      </fieldset>
      <fieldset><legend>5. Extra time (accommodations)</legend>
        <label class="field"><span>One student per line: email (or username) and extra minutes</span><textarea name="extra" rows="3" placeholder="jdoe@sdsu.edu 30&#10;asmith 45">${esc(extra.map((x) => `${x.email} ${x.minutes}`).join('\n'))}</textarea></label>
        <p class="muted small">Their time limit, and the closing time for them, are extended by those minutes.</p>
      </fieldset>
      <p class="bad" data-form-err role="alert"></p>
      <div class="row end timed-actions">
        ${host ? '' : `<a class="btn" href="#/timed/${encodeURIComponent(cls.id)}">Cancel</a>`}
        <button class="btn" type="submit" data-status="draft">Save as draft</button>
        <button class="btn primary" type="submit" data-status="published">${icon('check')} ${t.status === 'published' ? 'Save' : 'Publish'}</button>
      </div>
    </form>
    ${host ? '' : '</section>'}`;
  const form = root.querySelector('[data-editor]');

  function drawQuestions() {
    const qc = root.querySelector('[data-qcheck]'), ql = root.querySelector('[data-qlist]');
    const bits = [];
    if (state.parsed) {
      const p = state.parsed;
      bits.push(p.errors.length ? `<div class="parse-result pr-bad"><p><strong>${icon('x')} Fix ${plural(p.errors.length, 'problem')} in ${esc(state.mdName)}</strong></p><ul class="issue-list bad">${p.errors.slice(0, 20).map((e) => `<li>Line ${e.line}: ${esc(e.message)}</li>`).join('')}</ul></div>`
        : `<p class="good small">${icon('check')} ${esc(state.mdName)}: ${plural(p.questions.length, 'question')}</p>`);
    }
    if (state.asg) {
      const a = state.asg;
      const failing = [...state.asgProblems.values()].some((x) => x.length);
      bits.push(a.errors.length || failing ? `<div class="parse-result pr-bad"><p><strong>${icon('x')} Programming problems need fixing</strong></p><ul class="issue-list bad">${[...a.errors, ...[...state.asgProblems.entries()].filter(([, v]) => v.length).map(([k, v]) => `${k}: ${v.join('; ')}`)].map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div>`
        : `<p class="${state.asgRunning ? 'muted' : 'good'} small">${state.asgRunning ? 'Checking the reference solutions against the tests…' : `${icon('check')} ${esc(state.asgName)}: ${plural(a.assignments.length, 'programming problem')}${a.assignments.some((x) => x.solution != null) ? ', solutions pass every test' : ''}`}</p>`);
    }
    qc.innerHTML = bits.join('');
    const qs = state.questions;
    const total = qs.reduce((s, q) => s + (Number(q.points) || 0), 0);
    ql.innerHTML = qs.length ? `
      <div class="table-wrap" tabindex="0" role="region" aria-label="Questions"><table class="inst-table compact timed-qtable">
        <thead><tr><th scope="col">#</th><th scope="col">Question</th><th scope="col">Type</th><th scope="col">Points</th></tr></thead>
        <tbody>${qs.map((q, i) => `<tr><td>${i + 1}</td><td><strong>${esc(q.label)}</strong> <span class="muted small">${esc(firstLine(q.text))}</span>${q.type === 'code' ? `<span class="muted small block">${plural((q.samples || []).length, 'sample test')} shown · ${plural(Math.max(0, (state.key?.[q.id]?.tests || []).length - (q.samples || []).length), 'hidden test')}</span>` : ''}</td><td>${QTYPE_LABEL[q.type] || q.type}</td>
          <td><input type="number" min="0" step="0.5" value="${esc(q.points)}" data-pts="${i}" aria-label="Points for ${esc(q.label)}" ${attemptsExist ? 'disabled' : ''} class="pts-input"></td></tr>`).join('')}</tbody>
        <tfoot><tr><th colspan="3" scope="row">Total</th><td><strong data-total>${r1(total)}</strong></td></tr></tfoot>
      </table></div>` : '<p class="muted">No questions yet. Add a question file and/or programming problems.</p>';
  }
  const firstLine = (s) => { const x = String(s || '').replace(/```[\s\S]*?```/g, ' [code] ').replace(/[#*_`>]/g, '').replace(/\s+/g, ' ').trim(); return x.length > 90 ? x.slice(0, 89) + '…' : x; };
  function rebuild() {
    const okMd = state.parsed && !state.parsed.errors.length ? state.parsed : null;
    const okAsg = state.asg && !state.asg.errors.length && ![...state.asgProblems.values()].some((x) => x.length) ? state.asg.assignments : [];
    if (!okMd && !okAsg.length) return;
    // a new file replaces that part; the other part is kept
    const keepQ = okMd ? [] : state.questions.filter((q) => q.type !== 'code');
    const keepP = okAsg.length ? [] : state.questions.filter((q) => q.type === 'code');
    const s = splitExam(okMd, okAsg.map((a) => ({ ...a, points: a.points || 10 })));
    const newQ = s.pub.filter((q) => q.type !== 'code'), newP = s.pub.filter((q) => q.type === 'code');
    state.questions = [...(okMd ? newQ : keepQ), ...(okAsg.length ? newP : keepP)];
    const keep = {};
    for (const q of state.questions) keep[q.id] = s.key[q.id] || state.key?.[q.id];
    state.key = keep;
    state.filesChanged = true;
  }
  async function useMd(file) {
    if (!/\.(md|markdown|txt)$/i.test(file.name)) { toast(`"${file.name}" isn't a .md question file.`, 'bad'); return; }
    state.mdName = file.name;
    root.querySelector('[data-md-name]').textContent = file.name;
    state.parsed = parseExam(await file.text(), { allowLong: true });
    rebuild(); drawQuestions();
  }
  async function useAssignments(name, files) {
    state.asgName = name; root.querySelector('[data-asg-name]').textContent = name;
    state.asg = readAssignments(files); state.asgProblems = new Map(); state.asgRunning = true; drawQuestions();
    for (const a of state.asg.assignments) {
      if (a.solution == null) continue;
      const r = await testJava(a.solution, { className: a.cls, tests: a.tests.map(({ name: n, input, output }) => ({ name: n, input, output })), checks: a.checks }, a.cls + '.java');
      state.asgProblems.set(a.title, r.killed ? ['the reference solution ran too long'] : solutionProblems(a, r, formatErrors));
    }
    state.asgRunning = false;
    if (!state.asg.assignments.length) state.asg.errors.push('No programming problems found. Each one needs its own folder with assignment.md inside.');
    rebuild(); drawQuestions();
  }
  const wanted = (p) => /\.(md|java|in|out|txt)$/i.test(p) && !/(^|\/)(__MACOSX|\.)/.test(p);
  async function useZip(file) {
    if (!/\.zip$/i.test(file.name)) { toast(`"${file.name}" isn't a .zip.`, 'bad'); return; }
    const JSZip = await loadJSZip();
    const zip = await JSZip.loadAsync(file);
    const files = new Map();
    for (const f of Object.values(zip.files).filter((f) => !f.dir && wanted(f.name))) files.set(f.name.replace(/\\/g, '/'), await f.async('string'));
    await useAssignments(file.name, files);
  }
  async function useFolderList(name, list) {
    const files = new Map();
    for (const { path, file } of list) if (wanted(path)) files.set(path.replace(/\\/g, '/'), await file.text());
    await useAssignments(name, files);
  }
  drawQuestions();

  form.addEventListener('change', async (ev) => {
    const el = ev.target;
    try {
      if (el.matches('[data-md]') && el.files[0]) await useMd(el.files[0]);
      if (el.matches('[data-zip]') && el.files[0]) await useZip(el.files[0]);
      if (el.matches('[data-folder]') && el.files.length) { const list = [...el.files].map((f) => ({ path: f.webkitRelativePath || f.name, file: f })); await useFolderList(`${list[0].path.split('/')[0]}/ (folder)`, list); }
    } catch (e) { toast("Couldn't read that: " + (e?.message || e), 'bad'); }
    if (el.type === 'file') el.value = '';
    if (el.matches('[data-pts]')) { state.questions[Number(el.dataset.pts)].points = Math.max(0, Number(el.value) || 0); const tot = root.querySelector('[data-total]'); if (tot) tot.textContent = r1(state.questions.reduce((s, q) => s + (Number(q.points) || 0), 0)); }
  });
  // drag and drop (files and folders)
  const zoneOf = (ev) => ev.target.closest?.('[data-drop]');
  const hasFiles = (ev) => [...(ev.dataTransfer?.types || [])].includes('Files');
  async function readEntry(entry, prefix, out) {
    if (entry.isFile) { out.push({ path: prefix + entry.name, file: await new Promise((res, rej) => entry.file(res, rej)) }); return; }
    if (!entry.isDirectory || /^(__MACOSX|\.)/.test(entry.name)) return;
    const reader = entry.createReader();
    for (;;) { const batch = await new Promise((res, rej) => reader.readEntries(res, rej)); if (!batch.length) break; for (const c of batch) await readEntry(c, prefix + entry.name + '/', out); }
  }
  form.addEventListener('dragover', (ev) => { const z = zoneOf(ev); if (z && hasFiles(ev)) { ev.preventDefault(); z.classList.add('over'); } });
  form.addEventListener('dragleave', (ev) => { const z = zoneOf(ev); if (z && !z.contains(ev.relatedTarget)) z.classList.remove('over'); });
  form.addEventListener('drop', async (ev) => {
    const z = zoneOf(ev); if (!z) return;
    ev.preventDefault(); z.classList.remove('over');
    if (attemptsExist) return;
    const entries = [...(ev.dataTransfer.items || [])].filter((i) => i.kind === 'file').map((i) => i.webkitGetAsEntry?.()).filter(Boolean);
    const files = [...ev.dataTransfer.files];
    try {
      if (z.dataset.drop === 'md') { if (files[0]) await useMd(files[0]); return; }
      if (entries.some((e) => e.isDirectory)) { const list = []; for (const e of entries) await readEntry(e, '', list); await useFolderList(entries.length === 1 ? `${entries[0].name}/ (folder)` : `${entries.length} folders`, list); }
      else if (files[0]) await useZip(files[0]);
    } catch (e) { toast("Couldn't read what was dropped: " + (e?.message || e), 'bad'); }
  });
  const stray = (ev) => { if (hasFiles(ev) && !zoneOf(ev)) ev.preventDefault(); };
  window.addEventListener('dragover', stray); window.addEventListener('drop', stray);

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const status = ev.submitter?.dataset.status || 'draft';
    const f = new FormData(form);
    const err = form.querySelector('[data-form-err]');
    const opensAt = fromLocalInput(f.get('opensAt')), closesAt = fromLocalInput(f.get('closesAt'));
    const durationMin = Math.round(Number(f.get('durationMin')));
    const problems = [];
    const title = String(f.get('title') || '').trim();
    if (!title) problems.push('Give the exam a title.');
    if (!opensAt || !closesAt) problems.push('Set when the exam opens and closes.');
    else if (closesAt <= opensAt) problems.push('Closes must be after Opens.');
    if (!(durationMin >= 1 && durationMin <= 600)) problems.push('The time limit must be between 1 and 600 minutes.');
    if (status === 'published' && !state.questions.length) problems.push('Add questions before publishing (or save as a draft).');
    if (state.parsed?.errors.length || state.asg?.errors.length || [...state.asgProblems.values()].some((x) => x.length)) problems.push('Fix the problems in the question files first.');
    if (state.asgRunning) problems.push('Wait until the programming problems have been checked.');
    const ex = parseExtraTime(f.get('extra'), cloud.domain || 'sdsu.edu');
    if (ex.bad.length) problems.push(`Extra time: couldn't read "${ex.bad[0]}". Write an email and a number of minutes, like  jdoe@sdsu.edu 30`);
    if (problems.length) { err.textContent = problems.join(' '); err.scrollIntoView({ block: 'nearest' }); return; }
    if (status === 'published' && closesAt - opensAt < durationMin * 60000) {
      if (!(await confirmDialog({ title: 'The window is shorter than the time limit', body: `<p>The exam is open for ${Math.round((closesAt - opensAt) / 60000)} minutes but the time limit is ${durationMin}. Students who start late get less time. Publish anyway?</p>`, confirm: 'Publish' }))) return;
    }
    err.textContent = '';
    const test = {
      title, instructions: String(f.get('instructions') || '').trim(), opensAt, closesAt, durationMin,
      shuffleQ: f.get('shuffleQ') === 'on', shuffleOpts: f.get('shuffleOpts') === 'on', requireSEB: f.get('requireSEB') === 'on',
      allowPhones: f.get('allowPhones') === 'on', releaseDetail: f.get('releaseDetail') === 'on',
      questions: state.questions, totalPoints: state.questions.reduce((s, q) => s + (Number(q.points) || 0), 0),
      status, released: !!t.released, createdAt: t.createdAt || null, createdBy: t.createdBy || null,
    };
    if (!test.createdAt) { delete test.createdAt; delete test.createdBy; }
    const btns = form.querySelectorAll('button[type=submit]'); btns.forEach((b) => (b.disabled = true));
    try {
      const id = await cloud.saveTimed(cls.id, existing?.id || null, test, state.filesChanged || !existing ? { questions: state.key || {} } : null, ex.list);
      toast(status === 'published' ? `${title} is published. Students can start at ${when(opensAt)}.` : `${title} saved as a draft`, 'good');
      window.removeEventListener('dragover', stray); window.removeEventListener('drop', stray);
      if (onSaved) onSaved(); else location.hash = `#/timed/${encodeURIComponent(cls.id)}/${encodeURIComponent(id)}`;
    } catch (e) {
      err.textContent = "Couldn't save: " + (e?.code === 'permission-denied' ? "you're not on this class's teaching staff, or the latest firestore.rules aren't published." : e?.message || e);
      btns.forEach((b) => (b.disabled = false));
    }
  });
  return () => { window.removeEventListener('dragover', stray); window.removeEventListener('drop', stray); };
}

// ---------------------------------------------------------------- one exam
async function examPage(main, cls, tid, query) {
  let test = await cloud.getTimed(cls.id, tid).catch(() => null);
  if (!test) { main.innerHTML = `<section class="page"><h1>Exam not found</h1><p><a class="btn" href="#/timed/${encodeURIComponent(cls.id)}">Back to timed exams</a></p></section>`; return; }
  const phaseNow = () => examPhase({ ...test, opensAt: ms(test.opensAt), closesAt: ms(test.closesAt) });
  let tab = ['live', 'results', 'settings'].includes(query.tab) ? query.tab : phaseNow() === 'closed' ? 'results' : phaseNow() === 'draft' ? 'settings' : 'live';
  let roster = [], attempts = [], grades = [], key = null, loadedAt = 0, filter = 'all', section = '', search = '', auto = true, timer = null, tick = null, settingsCleanup = null;
  const mySecs = (() => { const c = cloud.myClasses().find((x) => x.id === cls.id); return c?.role === 'ta' && !cloud.isAdmin() ? (c.sections?.length ? c.sections : String(c.section || '').split(',').map((s) => s.trim()).filter(Boolean)) : null; })();

  main.innerHTML = `
    <section class="page timed-admin timed-exam">
      <p class="eyebrow"><a href="#/timed/${encodeURIComponent(cls.id)}">Timed exams · ${esc(cls.name)}</a></p>
      <div class="row between wrap"><h1 data-title>${esc(test.title)}</h1><span data-phase></span></div>
      <p class="muted" data-sub></p>
      <div class="row wrap timed-links">
        <button class="btn" data-copy-link>${icon('link')} Copy the student link</button>
        <a class="btn" href="#/take/${encodeURIComponent(cls.id)}/${encodeURIComponent(tid)}?preview=1">${icon('eye')} Try it as a student</a>
      </div>
      <div class="dash-tabs" role="tablist" aria-label="Exam">${[['live', 'Live'], ['results', 'Results & grading'], ['settings', 'Settings']].map(([k, l]) => `<button role="tab" data-xtab="${k}" id="xtab-${k}" aria-controls="xpanel" aria-selected="${tab === k}" tabindex="${tab === k ? 0 : -1}">${l}</button>`).join('')}</div>
      <div id="xpanel" role="tabpanel" data-panel aria-labelledby="xtab-${tab}"></div>
    </section>`;
  const panel = main.querySelector('[data-panel]');
  const head = () => {
    const ph = phaseNow();
    main.querySelector('[data-title]').textContent = test.title;
    main.querySelector('[data-phase]').innerHTML = `<span class="phase phase-${ph}">${PHASE_LABEL[ph]}${test.released ? ' · scores released' : ''}</span>`;
    main.querySelector('[data-sub]').textContent = `${when(ms(test.opensAt))} → ${when(ms(test.closesAt))} · ${test.durationMin} minutes · ${plural((test.questions || []).length, 'question')} · ${r1(test.totalPoints)} points${test.requireSEB ? ' · Safe Exam Browser required' : ''}`;
  };
  head();

  const students = () => roster.filter((p) => (!p.role || p.role === 'student') && (!mySecs || mySecs.some((s) => String(p.section || '').split(',').map((x) => x.trim()).includes(s))));
  async function loadData(withGrades = false) {
    [roster, attempts] = await Promise.all([roster.length ? roster : cloud.getRoster(cls.id), cloud.listAttempts(cls.id, tid)]);
    if (withGrades) grades = await cloud.listTestGrades(cls.id, tid).catch(() => []);
    loadedAt = Date.now();
  }
  // one row per roster student (plus anyone with an attempt who isn't on the roster any more)
  function rowsNow() {
    const now = Date.now();
    const byEmail = new Map(attempts.map((a) => [String(a.email).toLowerCase(), a]));
    const list = students().map((p) => ({ p, a: byEmail.get(String(p.email).toLowerCase()) || null }));
    for (const a of attempts) if (!list.some((r) => r.a === a) && !mySecs) list.push({ p: { email: a.email, name: a.name || a.email, section: '' }, a, offRoster: true });
    return list.map((r) => ({ ...r, ...attemptState(r.a, now) }));
  }
  function attemptState(a, now) {
    if (!a) return { st: 'none', label: 'Not started' };
    const dl = attemptDeadline({ ...test, closesAt: ms(test.closesAt) }, a);
    const exits = (a.events || []).filter((e) => LEAVES.includes(e.type));
    const answeredN = (test.questions || []).filter((q) => answered(q, a.answers?.[q.id])).length;
    const base = { deadline: dl, exits, answeredN, beat: ms(a.beatAt) };
    if (a.status === 'submitted') return { ...base, st: 'submitted', label: a.endedReason === 'time-up' ? 'Time ran out (submitted)' : 'Submitted' };
    if (a.status === 'ended') return { ...base, st: 'ended', label: 'Ended: ' + (EXIT_LABEL[a.endedReason] || a.endedReason || 'left the exam') };
    if (now > dl + 30000) return { ...base, st: 'timeup', label: 'Time up (last save kept)' };
    if (now - ms(a.beatAt) > 5 * 60000) return { ...base, st: 'lost', label: 'No contact for ' + Math.round((now - ms(a.beatAt)) / 60000) + ' min' };
    return { ...base, st: 'working', label: 'Working' };
  }

  // ------------------------------------------------ Live
  const FILTERS = { all: () => true, none: (r) => r.st === 'none', working: (r) => r.st === 'working', submitted: (r) => r.st === 'submitted' || r.st === 'timeup', ended: (r) => r.st === 'ended', lost: (r) => r.st === 'lost', exits: (r) => (r.exits || []).length > 0 };
  function livePanel() {
    const rows = rowsNow().filter((r) => !section || String(r.p.section || '').split(',').map((x) => x.trim()).includes(section));
    const n = (k) => rows.filter(FILTERS[k]).length;
    const q = search.trim().toLowerCase();
    const shown = rows.filter(FILTERS[filter]).filter((r) => !q || `${r.p.name} ${r.p.email} ${r.p.redId || ''}`.toLowerCase().includes(q))
      .sort((x, y) => ['lost', 'ended', 'working', 'timeup', 'submitted', 'none'].indexOf(x.st) - ['lost', 'ended', 'working', 'timeup', 'submitted', 'none'].indexOf(y.st) || String(x.p.name || '').localeCompare(String(y.p.name || '')));
    const secs = [...new Set(students().flatMap((p) => String(p.section || '').split(',').map((s) => s.trim()).filter(Boolean)))].sort();
    const now = Date.now();
    const cards = [['all', 'Everyone', ''], ['none', 'Not started', ''], ['working', 'Working now', 'good'], ['submitted', 'Submitted', 'good'], ['ended', 'Ended by leaving', 'bad'], ['lost', 'No contact 5+ min', 'warn'], ['exits', 'Any exit recorded', 'warn']];
    return `
      <div class="row between wrap live-bar">
        <p class="muted small" aria-live="polite">Updated ${clock(loadedAt)}${auto ? ' · refreshes every minute' : ''}</p>
        <span class="row"><label class="check"><input type="checkbox" data-auto ${auto ? 'checked' : ''}><span>Auto-refresh</span></label><button class="btn" data-refresh>${icon('shuffle')} Refresh</button></span>
      </div>
      <div class="who-cards" role="group" aria-label="Show students">${cards.map(([k, l, tone]) => `<button class="who-card ${tone}" data-lf="${k}" aria-pressed="${filter === k}"><strong>${n(k)}</strong><span>${l}</span></button>`).join('')}</div>
      <div class="inst-tools">
        <input type="search" placeholder="Find a student" value="${esc(search)}" data-lsearch aria-label="Find a student">
        ${secs.length > 1 ? `<label class="field inline"><span>Section</span><select data-lsec><option value="">All sections</option>${secs.map((s) => `<option ${s === section ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label>` : ''}
      </div>
      <div class="table-wrap inst-table-wrap"><table class="inst-table live-table">
        <thead><tr><th scope="col">Student</th><th scope="col">Status</th><th scope="col">Started</th><th scope="col">Time left</th><th scope="col">Last saved</th><th scope="col">Answered</th><th scope="col">Exits</th><th scope="col">Device</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
        <tbody>${shown.map((r) => {
          const a = r.a;
          const left = a && a.status === 'open' ? r.deadline - now : null;
          return `<tr class="st-row row-${r.st}">
            <td><button class="link-btn stu-name" data-detail="${esc(r.p.email)}">${esc(r.p.name || r.p.email)}</button><span class="muted small block">${esc(r.p.email)}${r.p.section ? ' · ' + esc(r.p.section) : ''}${r.offRoster ? ' · not on roster' : ''}</span></td>
            <td data-label="Status"><span class="st-pill st-${r.st}">${esc(r.label)}</span>${a?.reopened ? `<span class="muted small block">let back in ×${a.reopened}</span>` : ''}</td>
            <td data-label="Started">${a ? clock(ms(a.startedAt)) : '–'}</td>
            <td data-label="Time left">${left == null ? '–' : `<span data-left="${r.deadline}">${mmss(left)}</span>`}${a?.extraMin ? `<span class="muted small block">+${a.extraMin} min extra</span>` : ''}</td>
            <td data-label="Last saved">${a ? clock(r.beat) : '–'}</td>
            <td data-label="Answered">${a ? `${r.answeredN} of ${(test.questions || []).length}` : '–'}</td>
            <td data-label="Exits">${r.exits?.length ? `<span class="bad">${r.exits.length}</span> <span class="muted small">${esc(EXIT_LABEL[r.exits[r.exits.length - 1].type] || '')}</span>` : a ? '0' : '–'}</td>
            <td data-label="Device">${a?.device ? `${esc(a.device.browser)} · ${esc(a.device.os)}${a.device.seb ? ' ✓' : ''}` : '–'}</td>
            <td class="row-actions">${a ? `${['ended', 'lost', 'timeup', 'submitted'].includes(r.st) ? `<button class="btn small" data-reopen="${esc(a.id)}">Let back in</button>` : ''}${r.st === 'working' || r.st === 'lost' ? `<button class="btn small" data-addtime="${esc(a.id)}">+ Time</button><button class="btn small danger-outline" data-endnow="${esc(a.id)}">End</button>` : ''}` : ''}</td>
          </tr>`;
        }).join('') || `<tr><td colspan="9" class="muted">No students match.</td></tr>`}</tbody>
      </table></div>`;
  }
  function tickClocks() {
    const now = Date.now();
    panel.querySelectorAll('[data-left]').forEach((el) => { el.textContent = mmss(Number(el.dataset.left) - now); });
  }

  // ------------------------------------------------ Results
  let grading = null; // { done, total }
  function resultsPanel() {
    const rows = rowsNow();
    const g = new Map(grades.map((x) => [x.uid, x]));
    const qs = test.questions || [];
    const needHand = grades.reduce((s, x) => s + Object.values(x.perQ || {}).filter((p) => p.pts == null).length, 0);
    const scored = rows.filter((r) => r.a && g.get(r.a.uid));
    const avg = scored.length ? scored.reduce((s, r) => s + g.get(r.a.uid).total, 0) / scored.length : null;
    const phase = phaseNow();
    const stats = qs.map((q) => {
      const pts = scored.map((r) => g.get(r.a.uid).perQ?.[q.id]?.pts).filter((x) => x != null);
      const dist = q.options ? q.options.map((_, i) => scored.filter((r) => { const v = r.a.answers?.[q.id]; return Array.isArray(v) ? v.includes(i) : v === i; }).length) : null;
      return { q, avg: pts.length ? pts.reduce((a, b) => a + b, 0) / pts.length : null, full: pts.filter((x) => x >= q.points).length, n: pts.length, dist };
    });
    return `
      <div class="results-bar">
        ${phase === 'open' ? `<p class="note">${icon('note')} The exam is still open. You can grade now, but students still working will be graded again when you press Grade after it closes.</p>` : ''}
        <div class="row wrap">
          <button class="btn primary" data-grade ${grading ? 'disabled' : ''}>${icon('check')} ${grades.length ? 'Grade again' : 'Grade all attempts'}</button>
          ${grades.length ? `<button class="btn ${test.released ? '' : 'primary'}" data-release="${test.released ? 'hide' : 'show'}">${test.released ? 'Hide scores from students' : 'Release scores to students'}</button>
          <button class="btn" data-rcsv>${icon('download')} Download CSV</button>
          <button class="btn" data-toscores>${icon('chart')} Add to Exam scores</button>` : ''}
        </div>
        <p class="muted small">${grading ? `Grading… ${grading.done} of ${grading.total}` : grades.length ? `${plural(scored.length, 'student')} graded · average ${r1(avg)} of ${r1(test.totalPoints)} (${avg == null ? '–' : Math.round((avg / (test.totalPoints || 1)) * 100)}%)${needHand ? ` · <strong>${plural(needHand, 'written answer')} to grade by hand</strong> (click the cell)` : ''} · ${test.released ? '<strong>Students can see their scores.</strong>' : 'Students can\'t see scores yet.'}` : 'Multiple choice, number and short answers are graded against the key. Programming answers are run against every test, including the hidden ones. Written answers are graded by you.'}</p>
        ${grading ? `<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${grading.total}" aria-valuenow="${grading.done}"><span style="width:${(grading.done / Math.max(1, grading.total)) * 100}%"></span></div>` : ''}
      </div>
      ${grades.length ? `
      <div class="table-wrap inst-table-wrap" tabindex="0" role="region" aria-label="Scores"><table class="inst-table compact results-table">
        <thead><tr><th scope="col">Student</th><th scope="col">Status</th><th scope="col">Score</th>${qs.map((q, i) => `<th scope="col" title="${esc(q.label)}">${i + 1}<span class="muted small block">${esc(String(q.label).slice(0, 10))}</span></th>`).join('')}</tr></thead>
        <tbody>${rows.sort((x, y) => String(x.p.name || '').localeCompare(String(y.p.name || ''))).map((r) => { const gr = r.a && g.get(r.a.uid); return `<tr>
          <th scope="row">${esc(r.p.name || r.p.email)}<span class="muted small block">${esc(r.p.section || '')}</span></th>
          <td data-label="Status"><span class="st-pill st-${r.st}">${esc(r.st === 'none' ? 'Absent' : r.label)}</span></td>
          <td data-label="Score">${gr ? `<strong>${r1(gr.total)}</strong> <span class="muted small">/ ${r1(gr.max)}</span>` : '–'}</td>
          ${qs.map((q) => { const p = gr?.perQ?.[q.id]; return `<td data-label="${esc(q.label)}">${gr ? `<button class="cell-btn ${p?.pts == null ? 'need' : p.pts >= q.points ? 'full' : p.pts > 0 ? 'part' : 'zero'}" data-cell="${esc(r.a.uid)}|${esc(q.id)}">${p?.pts == null ? 'Grade' : r1(p.pts)}</button>` : ''}</td>`; }).join('')}
        </tr>`; }).join('')}</tbody>
      </table></div>
      <h2 class="an-h2">Questions</h2>
      <div class="table-wrap" tabindex="0" role="region" aria-label="Question statistics"><table class="inst-table compact">
        <thead><tr><th scope="col">Question</th><th scope="col">Type</th><th scope="col">Average</th><th scope="col">Full marks</th><th scope="col">Choices picked</th></tr></thead>
        <tbody>${stats.map((s, i) => `<tr><th scope="row">${i + 1}. ${esc(s.q.label)}</th><td>${QTYPE_LABEL[s.q.type]}</td><td>${s.avg == null ? '–' : `${r1(s.avg)} / ${r1(s.q.points)} <span class="muted small">(${Math.round((s.avg / (s.q.points || 1)) * 100)}%)</span>`}</td><td>${s.n ? `${s.full} of ${s.n}` : '–'}</td>
          <td>${s.dist ? `<span class="dist">${s.dist.map((c, j) => `<span class="${(key?.questions?.[s.q.id]?.correct || []).includes(j) ? 'good' : ''}" title="${esc(s.q.options[j])}">${String.fromCharCode(65 + j)}: ${c}</span>`).join(' ')}</span>` : ''}</td></tr>`).join('')}</tbody>
      </table></div>` : ''}`;
  }
  async function gradeAll() {
    if (grading) return;
    key = key || await cloud.getTimedKey(cls.id, tid);
    if (!key) { toast("This exam has no answer key saved. Upload its questions again in Settings.", 'bad'); return; }
    await loadData(true);
    const prev = new Map(grades.map((x) => [x.uid, x]));
    const qs = test.questions || [];
    const list = attempts.filter((a) => !mySecs || students().some((p) => String(p.email).toLowerCase() === String(a.email).toLowerCase()));
    grading = { done: 0, total: list.length };
    paint();
    const out = [];
    for (const a of list) {
      const perQ = {};
      for (const q of qs) {
        const v = a.answers?.[q.id], k = key.questions?.[q.id] || {}, old = prev.get(a.uid)?.perQ?.[q.id];
        if (old?.manual) { perQ[q.id] = old; continue; }
        if (q.type === 'code') {
          if (!answered(q, v)) { perQ[q.id] = { pts: 0, passed: 0, total: (k.tests || []).length }; continue; }
          const r = await testJava(v, { className: q.cls, tests: (k.tests || []).map(({ name, input, output }) => ({ name, input, output })), checks: k.checks || [] }, q.cls + '.java').catch((e) => ({ crash: String(e?.message || e) }));
          perQ[q.id] = r.crash || r.killed ? { pts: 0, passed: 0, total: (k.tests || []).length, note: r.killed ? 'ran too long' : 'runner error' } : { pts: codePoints(q, r), passed: r.passed, total: r.total, compileError: !!r.compileErrors };
        } else if (q.type === 'long') {
          perQ[q.id] = answered(q, v) ? { pts: null } : { pts: 0 };
        } else perQ[q.id] = { pts: gradeObjective(q, k, v) };
      }
      const total = Object.values(perQ).reduce((s, p) => s + (p.pts || 0), 0);
      out.push({ tid, uid: a.uid, email: a.email, name: a.name || '', total: Math.round(total * 100) / 100, max: test.totalPoints, perQ, gradedAt: Date.now() });
      grading.done++;
      if (grading.done % 5 === 0 || grading.done === list.length) paint();
    }
    try { await cloud.saveTestGrades(cls.id, out); grades = out; toast(`${plural(out.length, 'attempt')} graded`, 'good'); }
    catch (e) { toast("Couldn't save the scores: " + (e?.message || e), 'bad'); }
    grading = null;
    paint();
  }
  function cellDetail(uid, qid) {
    const a = attempts.find((x) => x.uid === uid), gr = grades.find((x) => x.uid === uid), q = (test.questions || []).find((x) => x.id === qid);
    if (!a || !gr || !q) return;
    const v = a.answers?.[qid], p = gr.perQ?.[qid] || {}, k = key?.questions?.[qid] || {};
    let ans;
    if (q.options) ans = `<ul class="opt-review">${q.options.map((o, i) => { const picked = Array.isArray(v) ? v.includes(i) : v === i; const right = (k.correct || []).includes(i); return `<li class="${right ? 'right' : ''} ${picked ? 'picked' : ''}">${picked ? '● ' : '○ '}${esc(o)}${right ? ' <span class="good small">(correct)</span>' : ''}</li>`; }).join('')}</ul>`;
    else if (q.type === 'code') ans = `<pre class="code-view"><code>${esc(v || '(no code)')}</code></pre><p class="small">${p.compileError ? '<span class="bad">Did not compile.</span> ' : ''}Passed ${p.passed ?? 0} of ${p.total ?? 0} tests and checks${p.note ? ` (${esc(p.note)})` : ''}.</p>`;
    else ans = `<div class="answer-box">${v ? esc(v).replace(/\n/g, '<br>') : '<span class="muted">(no answer)</span>'}</div>${q.type === 'long' && k.model ? `<p class="small"><strong>Model answer:</strong> ${esc(k.model)}</p>` : q.answer || k.answer ? `<p class="small"><strong>Accepted:</strong> ${esc((k.answer?.text || k.answer?.numeric?.map((x) => x.display) || []).join(' / '))}</p>` : ''}`;
    const m = modal({
      title: `${gr.name || gr.email}: ${q.label}`, wide: true,
      body: `<div class="q-review">${md(q.text)}</div><h3>Their answer</h3>${ans}
        <label class="field inline pts-field"><span>Points (out of ${r1(q.points)})</span><input type="number" min="0" max="${q.points}" step="0.25" value="${p.pts ?? ''}" data-setpts></label>
        <p class="muted small">Changing the points here keeps them even if you press Grade again.</p>`,
      actions: [{ label: 'Cancel' }, { label: 'Save points', kind: 'primary', onClick: (close) => {
        const val = Number(m.el.querySelector('[data-setpts]').value);
        if (!(val >= 0 && val <= q.points)) { toast(`Enter points between 0 and ${q.points}`, 'bad'); return true; }
        const perQ = { ...gr.perQ, [qid]: { ...p, pts: val, manual: true } };
        const total = Math.round(Object.values(perQ).reduce((s, x) => s + (x.pts || 0), 0) * 100) / 100;
        const next = { ...gr, perQ, total };
        cloud.saveTestGrades(cls.id, [next]).then(() => { grades = grades.map((x) => (x.uid === uid ? next : x)); paint(); toast('Points saved', 'good'); }).catch((e) => toast("Couldn't save: " + (e?.message || e), 'bad'));
        close();
        return true;
      } }],
    });
  }
  function csvDownload() {
    const qs = test.questions || [];
    const g = new Map(grades.map((x) => [x.uid, x]));
    const cell = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const lines = [['Name', 'Email', 'RedID', 'Section', 'Status', 'Score', 'Out of', 'Percent', 'Exits', ...qs.map((q, i) => `Q${i + 1} ${q.label}`)].map(cell).join(',')];
    for (const r of rowsNow()) {
      const gr = r.a && g.get(r.a.uid);
      lines.push([r.p.name, r.p.email, r.p.redId || '', r.p.section || '', r.st === 'none' ? 'Absent' : r.label, gr?.total ?? '', test.totalPoints, gr ? Math.round((gr.total / (test.totalPoints || 1)) * 1000) / 10 : '', r.exits?.length ?? '', ...qs.map((q) => gr?.perQ?.[q.id]?.pts ?? '')].map(cell).join(','));
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    a.download = `${test.title.replace(/[^\w-]+/g, '_')}_scores.csv`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // ------------------------------------------------ attempt details (Live)
  function attemptDetail(email) {
    const r = rowsNow().find((x) => String(x.p.email).toLowerCase() === String(email).toLowerCase());
    if (!r) return;
    const a = r.a;
    const qs = test.questions || [];
    modal({
      title: r.p.name || r.p.email, wide: true,
      body: !a ? `<p>${esc(r.p.email)} hasn't started this exam.</p>` : `
        <p class="muted small">${esc(r.p.email)}${r.p.section ? ' · ' + esc(r.p.section) : ''} · <span class="st-pill st-${r.st}">${esc(r.label)}</span></p>
        <dl class="kv"><dt>Started</dt><dd>${when(ms(a.startedAt))}</dd><dt>Must finish by</dt><dd>${when(r.deadline)}${a.extraMin ? ` (includes ${a.extraMin} extra min)` : ''}</dd><dt>Last saved</dt><dd>${when(r.beat)} · ${plural(a.saves || 0, 'save')}</dd>${a.submittedAt ? `<dt>Finished</dt><dd>${when(ms(a.submittedAt))}</dd>` : ''}<dt>Device</dt><dd>${a.device ? `${esc(a.device.browser)} on ${esc(a.device.os)}${a.device.seb ? ' (Safe Exam Browser)' : ''}${a.device.screen ? ` · screen ${esc(a.device.screen)}` : ''}` : '–'}</dd><dt>Answered</dt><dd>${r.answeredN} of ${qs.length}</dd></dl>
        <h3>What happened</h3>
        <ol class="timeline">${[{ t: ms(a.startedAt), type: 'started' }, ...(a.events || [])].map((e) => `<li class="${LEAVES.includes(e.type) || e.type === 'professor-ended' ? 'bad' : ''}"><span class="muted small">${clock(e.t)}</span> ${esc(e.type === 'started' ? 'Started the exam' : e.type === 'reopened' ? `Let back in by ${e.by || 'the professor'}${e.add ? ` (+${e.add} min)` : ''}` : e.type === 'time-added' ? `${e.add} minutes added by ${e.by || 'the professor'}` : EXIT_LABEL[e.type] || e.type)}${e.detail ? ` <span class="muted small">${esc(e.detail)}</span>` : ''}</li>`).join('')}</ol>
        <h3>Saved answers</h3>
        <ol class="saved-answers">${qs.map((q) => { const v = a.answers?.[q.id]; return `<li><strong>${esc(q.label)}</strong> <span class="muted small">${QTYPE_LABEL[q.type]}</span><div>${!answered(q, v) ? '<span class="muted">No answer</span>' : q.options ? esc((Array.isArray(v) ? v : [v]).map((i) => q.options[i]).join(' · ')) : q.type === 'code' ? `<pre class="code-view small"><code>${esc(v)}</code></pre>` : esc(v)}</div></li>`; }).join('')}</ol>`,
    });
  }
  async function reopen(aid) {
    const a = attempts.find((x) => x.id === aid);
    if (!a) return;
    const m = modal({
      title: `Let ${a.name || a.email} back in?`,
      body: `<p>They can continue their same attempt with the answers they saved. Their clock doesn't stop: it still counts from when they started, so add minutes if they lost time.</p>
        <label class="field inline"><span>Extra minutes</span><input type="number" min="0" max="300" value="${Math.max(0, Math.ceil((Date.now() - attemptDeadline({ ...test, closesAt: ms(test.closesAt) }, a)) / 60000) + 5) || 0}" data-add></label>`,
      actions: [{ label: 'Cancel' }, { label: 'Let back in', kind: 'primary', onClick: (close) => {
        const add = Math.max(0, Math.round(Number(m.el.querySelector('[data-add]').value) || 0));
        cloud.staffAttempt(cls.id, aid, { status: 'open', session: '', endedReason: '', submittedAt: null, extraMin: (Number(a.extraMin) || 0) + add, reopened: (a.reopened || 0) + 1, events: [...(a.events || []), { t: Date.now(), type: 'reopened', by: cloud.currentUser()?.email || '', add }] }, { now: true })
          .then(() => { toast(`${a.name || a.email} can sign in and continue`, 'good'); refresh(); }).catch((e) => toast("Couldn't: " + (e?.message || e), 'bad'));
        close(); return true;
      } }],
    });
  }
  function addTime(aid) {
    const a = attempts.find((x) => x.id === aid);
    if (!a) return;
    const m = modal({
      title: `Add time for ${a.name || a.email}`,
      body: '<label class="field inline"><span>Minutes to add</span><input type="number" min="1" max="300" value="10" data-add></label><p class="muted small">Their exam picks this up within about 2 minutes.</p>',
      actions: [{ label: 'Cancel' }, { label: 'Add time', kind: 'primary', onClick: (close) => {
        const add = Math.max(1, Math.round(Number(m.el.querySelector('[data-add]').value) || 0));
        cloud.staffAttempt(cls.id, aid, { extraMin: (Number(a.extraMin) || 0) + add, events: [...(a.events || []), { t: Date.now(), type: 'time-added', by: cloud.currentUser()?.email || '', add }] })
          .then(() => { toast(`${add} minutes added`, 'good'); refresh(); }).catch((e) => toast("Couldn't: " + (e?.message || e), 'bad'));
        close(); return true;
      } }],
    });
  }
  async function endNow(aid) {
    const a = attempts.find((x) => x.id === aid);
    if (!a || !(await confirmDialog({ title: `End ${a.name || a.email}'s exam now?`, body: '<p>Their saved answers are kept and graded. You can let them back in later.</p>', confirm: 'End exam', danger: true }))) return;
    await cloud.staffAttempt(cls.id, aid, { status: 'ended', endedReason: 'professor-ended', submittedAt: 'now', events: [...(a.events || []), { t: Date.now(), type: 'professor-ended', by: cloud.currentUser()?.email || '' }] }).catch((e) => toast("Couldn't: " + (e?.message || e), 'bad'));
    refresh();
  }

  // ------------------------------------------------ painting
  async function refresh() {
    try { await loadData(tab === 'results'); } catch (e) { toast("Couldn't refresh: " + (e?.message || e), 'bad'); }
    paint();
  }
  function paint() {
    head();
    main.querySelectorAll('[data-xtab]').forEach((b) => { b.setAttribute('aria-selected', String(b.dataset.xtab === tab)); b.tabIndex = b.dataset.xtab === tab ? 0 : -1; });
    panel.setAttribute('aria-labelledby', 'xtab-' + tab);
    if (tab === 'settings') return;
    const focusSel = document.activeElement?.matches?.('[data-lsearch]') ? '[data-lsearch]' : null;
    panel.innerHTML = tab === 'live' ? livePanel() : resultsPanel();
    if (focusSel) { const el = panel.querySelector(focusSel); el?.focus(); el?.setSelectionRange?.(el.value.length, el.value.length); }
  }
  async function showTab() {
    settingsCleanup?.(); settingsCleanup = null;
    clearInterval(timer); timer = null;
    if (tab === 'settings') {
      paint();
      panel.innerHTML = '<p class="muted loading-line">Loading…</p>';
      const box = document.createElement('div');
      settingsCleanup = await editorPage(main, cls, test, box, async () => { test = await cloud.getTimed(cls.id, tid); key = null; paint(); showTab(); });
      panel.replaceChildren(box);
      panel.insertAdjacentHTML('beforeend', `<div class="danger-zone"><h2>Delete this exam</h2><p class="muted small">Removes the exam, every student's attempt and the scores. This can't be undone.</p><button class="btn danger-outline" data-delete>${icon('trash')} Delete exam</button></div>`);
      return;
    }
    panel.innerHTML = '<p class="muted loading-line">Loading…</p>';
    await refresh();
    if (tab === 'results' && !key) { key = await cloud.getTimedKey(cls.id, tid).catch(() => null); paint(); }
    if (tab === 'live') timer = setInterval(() => { if (auto && document.visibilityState === 'visible' && !document.querySelector('.modal-back') && phaseNow() === 'open') refresh(); }, 60000);
  }
  tick = setInterval(tickClocks, 1000);

  main.addEventListener('click', async (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.dataset.xtab) { tab = b.dataset.xtab; history.replaceState(null, '', `#/timed/${encodeURIComponent(cls.id)}/${encodeURIComponent(tid)}?tab=${tab}`); showTab(); return; }
    if ('copyLink' in b.dataset) {
      const url = `${location.origin}${location.pathname}#/take/${encodeURIComponent(cls.id)}/${encodeURIComponent(tid)}`;
      try { await navigator.clipboard.writeText(url); toast('Link copied. Students also find the exam on their class page.', 'good'); } catch { modal({ title: 'Student link', body: `<p><input class="wide-input" readonly value="${esc(url)}" onfocus="this.select()"></p>` }); }
      return;
    }
    if (b.dataset.lf) { filter = filter === b.dataset.lf ? 'all' : b.dataset.lf; paint(); return; }
    if ('refresh' in b.dataset) { b.disabled = true; await refresh(); return; }
    if (b.dataset.detail) { attemptDetail(b.dataset.detail); return; }
    if (b.dataset.reopen) { reopen(b.dataset.reopen); return; }
    if (b.dataset.addtime) { addTime(b.dataset.addtime); return; }
    if (b.dataset.endnow) { endNow(b.dataset.endnow); return; }
    if ('grade' in b.dataset) { gradeAll(); return; }
    if (b.dataset.cell) { const [u, q] = b.dataset.cell.split('|'); cellDetail(u, q); return; }
    if ('rcsv' in b.dataset) { csvDownload(); return; }
    if (b.dataset.release) {
      const show = b.dataset.release === 'show';
      const pending = grades.reduce((s, x) => s + Object.values(x.perQ || {}).filter((p) => p.pts == null).length, 0);
      if (show && !(await confirmDialog({ title: 'Release scores to students?', body: `<p>Each student will see their own score on their class page${test.releaseDetail !== false ? ', and which questions they got right' : ''}. The correct answers are not shown.</p>${pending ? `<p class="bad">${plural(pending, 'written answer')} still need grading and count as 0 until you grade them.</p>` : ''}`, confirm: 'Release scores' }))) return;
      try { await cloud.setTimedReleased(cls.id, tid, show); test = { ...test, released: show }; toast(show ? 'Scores released' : 'Scores hidden from students', 'good'); paint(); } catch (e) { toast("Couldn't: " + (e?.message || e), 'bad'); }
      return;
    }
    if ('toscores' in b.dataset) {
      const scores = grades.map((x) => ({ email: x.email, score: x.total }));
      try { await cloud.saveGrades(cls.id, { name: test.title, maxPoints: test.totalPoints, date: new Date(ms(test.opensAt)).toISOString().slice(0, 10), examId: '', scores, source: 'timed exam' }); toast(`Added to Exam scores as "${test.title}"`, 'good'); }
      catch (e) { toast("Couldn't: " + (e?.message || e), 'bad'); }
      return;
    }
    if ('delete' in b.dataset) {
      if (!(await confirmDialog({ title: `Delete ${test.title}?`, body: '<p>The exam, every attempt and all scores are removed for good.</p>', confirm: 'Delete exam', danger: true }))) return;
      try { await cloud.deleteTimed(cls.id, tid); toast('Exam deleted'); location.hash = `#/timed/${encodeURIComponent(cls.id)}`; } catch (e) { toast("Couldn't delete: " + (e?.message || e), 'bad'); }
    }
  });
  main.addEventListener('change', (ev) => {
    if (ev.target.matches('[data-auto]')) { auto = ev.target.checked; paint(); }
    if (ev.target.matches('[data-lsec]')) { section = ev.target.value; paint(); }
  });
  main.addEventListener('input', (ev) => { if (ev.target.matches('[data-lsearch]')) { search = ev.target.value; paint(); } });
  main.addEventListener('keydown', (ev) => {
    const t = ev.target.closest?.('[data-xtab]');
    if (!t || !['ArrowLeft', 'ArrowRight'].includes(ev.key)) return;
    const order = ['live', 'results', 'settings'];
    tab = order[(order.indexOf(tab) + (ev.key === 'ArrowRight' ? 1 : 2)) % 3];
    showTab(); main.querySelector(`[data-xtab="${tab}"]`)?.focus();
  });
  await showTab();
  return () => { clearInterval(timer); clearInterval(tick); settingsCleanup?.(); };
}
