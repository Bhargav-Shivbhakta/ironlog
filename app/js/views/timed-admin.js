// Professor's pages for timed exams:
//   #/timed/<class>             the class's timed exams
//   #/timed/<class>/new         create one
//   #/timed/<class>/<exam>      one exam: Live (monitor) · Results (grade, release) · Settings
import * as cloud from '../cloud.js';
import { esc, icon, toast, modal, confirmDialog, plural } from '../ui.js';
import { md } from '../render.js';
import { makeSebFile } from '../seb.js';
import { parseExam } from '../parser.js';
import { readAssignments, solutionProblems } from '../assignments-core.js';
import { testJava } from '../java/client.js';
import { formatErrors } from '../java/index.js';
import { readCanvasExport, matchCanvas, canvasCsv, rosterAsCanvas } from '../canvas.js';
import { ms, splitExam, gradeObjective, codePoints, answered, examPhase, attemptDeadline, parseExtraTime, windowFor, overallWindow, assignedSections, sectionRules, KINDS, kindOf, newAccessCode, normCode, QTYPE_LABEL, EXIT_LABEL } from '../timed.js';

const DAY = 86400000;
const pad = (n) => String(n).padStart(2, '0');
const toLocalInput = (t) => { if (!t) return ''; const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fromLocalInput = (s) => (s ? new Date(s).getTime() : null);
const when = (t) => (t ? new Date(t).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '–');
const clock = (t) => (t ? new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' }) : '–');
const mmss = (msLeft) => { if (msLeft <= 0) return '0:00'; const s = Math.round(msLeft / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`; };
const r1 = (x) => (x == null || isNaN(x) ? '–' : String(Math.round(x * 10) / 10));
const LEAVES = ['tab-hidden', 'window-blur', 'fullscreen-exit', 'page-leave', 'print-screen', 'devtools-key', 'away-too-long'];
// "Sections 01, 03" or "" when everyone takes it
const whoText = (t) => { const s = assignedSections(t); return s ? `${s.length === 1 ? 'Section' : 'Sections'} ${s.join(', ')}` : ''; };
const PHASE_LABEL = { draft: 'Draft', upcoming: 'Scheduled', open: 'Open now', closed: 'Closed' };

let jszip = null;
const loadJSZip = () => (window.JSZip ? Promise.resolve(window.JSZip) : (jszip ||= new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'vendor/jszip.min.js'; s.onload = () => res(window.JSZip); s.onerror = () => rej(new Error("Couldn't load the zip reader.")); document.head.appendChild(s); })));

export async function render(main, { classId, tid }, query = {}) {
  if (!cloud.enabled || !cloud.currentUser()) { main.innerHTML = '<section class="page"><h1>Graded work</h1><p>Sign in with your school account first.</p></section>'; return; }
  const staffOf = cloud.myClasses().filter((c) => ['instructor', 'ta'].includes(c.role)).map((c) => c.id);
  const [cls] = await Promise.all([cloud.getClass(classId).catch(() => null), cloud.syncClock()]);
  if (!cls || !(cloud.isAdmin() || staffOf.includes(classId))) {
    main.innerHTML = `<section class="page"><h1>Graded work</h1><p>Only this class's instructors and TAs can manage its exams, quizzes and assignments.</p><p><a class="btn" href="#/">Home</a></p></section>`;
    return;
  }
  if (!tid) return listPage(main, cls);
  if (tid === 'new') {
    if (!cloud.leadsClass(classId)) { main.innerHTML = `<section class="page"><h1>New exam, quiz or assignment</h1><p>Graded work is set up by the class's instructor. As a TA you can watch it live, help students back in, and grade it.</p><p><a class="btn" href="#/timed/${encodeURIComponent(classId)}">Back</a></p></section>`; return; }
    return editorPage(main, cls, null);
  }
  return examPage(main, cls, tid, query);
}

// ---------------------------------------------------------------- list
async function listPage(main, cls) {
  main.innerHTML = `<section class="page timed-admin"><p class="eyebrow"><a href="#/instructor?class=${encodeURIComponent(cls.id)}&tab=timed">${esc(cls.name)}</a></p><h1>Graded work</h1><div data-list><p class="muted loading-line">Loading…</p></div></section>`;
  const box = main.querySelector('[data-list]');
  try {
    const list = await cloud.listTimed(cls.id);
    box.innerHTML = timedList(cls, list);
  } catch (e) { box.innerHTML = `<p class="bad">Couldn't load the exams: ${esc(e?.message || e)}</p>`; }
}
// also used inside the class dashboard's "Timed exams" tab
export function timedList(cls, list) {
  const now = cloud.trueNow();
  return `
    <div class="row between wrap timed-head">
      <p class="dash-intro">Exams, quizzes and assignments that count: locked down, with a time limit and one attempt per student. Multiple choice, short and written answers, and Java programming. Students see each type in its own group, separate from practice.</p>
      ${cloud.leadsClass(cls.id) ? `<a class="btn primary" href="#/timed/${encodeURIComponent(cls.id)}/new">${icon('plus')} New exam, quiz or assignment</a>` : '<p class="muted small">Set up by the class\'s instructor. As a TA you can watch it live, let students back in, add time, and grade.</p>'}
    </div>
    ${list.length ? `<ul class="timed-list">${list.map((t) => {
      const span = overallWindow(t);
      const ph = examPhase({ ...t, ...span }, now);
      return `<li><a href="#/timed/${encodeURIComponent(cls.id)}/${encodeURIComponent(t.id)}">
        <span class="timed-title"><strong><span class="kind-badge kind-${kindOf(t)}">${KINDS[kindOf(t)].label}</span> ${esc(t.title || 'Untitled')}</strong>
          <span class="muted small">${whoText(t) ? `${esc(whoText(t))} · ` : ''}${when(span.opensAt)} → ${when(span.closesAt)} · ${t.durationMin} min · ${plural((t.questions || []).length, 'question')} · ${r1(t.totalPoints)} points${t.requireSEB ? ' · Safe Exam Browser' : ''}</span></span>
        <span class="phase phase-${t.disabled ? 'off' : ph}">${t.disabled ? 'Turned off' : PHASE_LABEL[ph]}${t.released ? ' · scores released' : ''}</span></a></li>`;
    }).join('')}</ul>` : '<div class="empty-state"><h2>Nothing graded yet</h2><p>Create an exam, quiz or assignment from a question file (the same format as practice exams) and, if you like, Java programming problems.</p></div>'}`;
}

// ---------------------------------------------------------------- editor
async function editorPage(main, cls, existing, host = null, onSaved = null) {
  const root = host || main;
  let key = null, extra = [], attemptsExist = false, accessCode = '', secCodes = {};
  const roster = (await cloud.getRoster(cls.id).catch(() => [])).filter((p) => !p.role || p.role === 'student');
  if (existing) {
    [key, extra, accessCode] = await Promise.all([cloud.getTimedKey(cls.id, existing.id).catch(() => null), cloud.listTimedExtra(cls.id, existing.id).catch(() => []), cloud.getAccessCodes(cls.id, existing.id).catch(() => ({ code: '', sections: {} }))]).then(([k, x, c]) => { secCodes = c.sections; return [k, x, c.code]; });
    attemptsExist = (await cloud.listAttempts(cls.id, existing.id).catch(() => [])).length > 0;
  }
  const t = existing || { title: '', instructions: 'Answer every question. You have one attempt. Stay in this window, in full screen, until you submit: leaving it gives a warning and can end your exam.', requireCode: true, durationMin: 60, shuffleQ: true, shuffleOpts: true, requireSEB: false, allowPhones: false, releaseDetail: true, warnings: 2, awayMaxSec: 15, questions: [], totalPoints: 0, status: 'draft' };
  const startDefault = (() => { const d = new Date(Date.now() + DAY); d.setMinutes(0, 0, 0); return d.getTime(); })();
  const state = {
    opensAt: ms(t.opensAt) || startDefault, closesAt: ms(t.closesAt) || startDefault + 2 * 3600000,
    questions: (t.questions || []).map((q) => ({ ...q })), key: key?.questions || null,
    parsed: null, mdName: '', asg: null, asgName: '', asgProblems: new Map(), asgRunning: false, filesChanged: false,
  };
  // ---- 3. Who takes it: everyone, or only some sections (each with its own times if needed)
  function whoFieldset() {
    const count = new Map();
    for (const p of roster) { const k = String(p.section || ''); count.set(k, (count.get(k) || 0) + 1); }
    const noSection = count.get('') || 0;
    const wins = t.windows && Object.keys(t.windows).length ? t.windows : null;
    const secs = [...new Set([...count.keys(), ...Object.keys(wins || {})].filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const own = (s, k) => { const v = ms(wins?.[s]?.[k]); return v && v !== ms(t[k]) ? toLocalInput(v) : ''; };
    return `
      <fieldset class="who-fs"><legend>3. Who takes it</legend>
        <label class="check"><input type="radio" name="who" value="all" ${wins ? '' : 'checked'}><span><strong>Everyone in the class</strong> (${plural(roster.length, 'student')}), at the times above</span></label>
        <label class="check"><input type="radio" name="who" value="sections" ${wins ? 'checked' : ''} ${secs.length ? '' : 'disabled'}><span><strong>Only the sections I choose</strong>, each at its own time if you like${secs.length ? '' : ' <span class="muted">(the roster has no sections)</span>'}</span></label>
        <div class="sec-pick" data-secs ${wins ? '' : 'hidden'}>
          <div class="table-wrap"><table class="sec-table">
            <thead><tr><th scope="col">Section</th><th scope="col">Students</th><th scope="col">Opens <span class="muted small">(empty: as above)</span></th><th scope="col">Closes <span class="muted small">(empty: as above)</span></th></tr></thead>
            <tbody>${secs.map((sec) => `<tr data-sec-row="${esc(sec)}">
              <td><label class="check"><input type="checkbox" data-sec-on ${wins?.[sec] ? 'checked' : ''}><span>Section ${esc(sec)}</span></label></td>
              <td>${count.get(sec) || 0}</td>
              <td><input type="datetime-local" data-sec-open value="${own(sec, 'opensAt')}" aria-label="Section ${esc(sec)} opens"></td>
              <td><input type="datetime-local" data-sec-close value="${own(sec, 'closesAt')}" aria-label="Section ${esc(sec)} closes"></td></tr>`).join('')}</tbody>
          </table></div>
          <p class="muted small">Students in other sections don't see this exam and can't open it.</p>
          <details class="sec-rules" ${secs.some((sec) => Object.keys(sectionRules(wins?.[sec])).length || secCodes[sec]) ? 'open' : ''}>
            <summary><strong>Different rules for a section</strong> <span class="muted small">(optional: for example a longer time for one section, its own access code, or Safe Exam Browser for one room only)</span></summary>
            <div class="table-wrap"><table class="sec-table sec-rules-table">
              <thead><tr><th scope="col">Section</th><th scope="col">Time limit (min)</th><th scope="col">Access code</th><th scope="col">Safe Exam Browser</th><th scope="col">Leaving the exam</th><th scope="col">Phones</th></tr></thead>
              <tbody>${secs.map((sec) => { const r = sectionRules(wins?.[sec]); const codeMode = secCodes[sec] ? 'own' : r.requireCode === false ? 'none' : 'same'; const yn = (k, yes, no) => `<option value="" ${r[k] == null ? 'selected' : ''}>Same</option><option value="yes" ${r[k] === true ? 'selected' : ''}>${yes}</option><option value="no" ${r[k] === false ? 'selected' : ''}>${no}</option>`; return `<tr data-rule-row="${esc(sec)}">
                <th scope="row">Section ${esc(sec)}</th>
                <td><input type="number" min="1" max="600" step="1" data-r-dur value="${esc(r.durationMin ?? '')}" placeholder="same" aria-label="Section ${esc(sec)} time limit in minutes"></td>
                <td><select data-r-codemode aria-label="Section ${esc(sec)} access code"><option value="same" ${codeMode === 'same' ? 'selected' : ''}>Same</option><option value="own" ${codeMode === 'own' ? 'selected' : ''}>Its own code</option><option value="none" ${codeMode === 'none' ? 'selected' : ''}>No code</option></select>
                  <input data-r-code value="${esc(secCodes[sec] || newAccessCode())}" maxlength="12" autocomplete="off" spellcheck="false" aria-label="Section ${esc(sec)} code" ${codeMode === 'own' ? '' : 'hidden'}></td>
                <td><select data-r-seb aria-label="Section ${esc(sec)} Safe Exam Browser">${yn('requireSEB', 'Required', 'Not required')}</select></td>
                <td><select data-r-warn aria-label="Section ${esc(sec)} leaving the exam"><option value="" ${r.warnings == null ? 'selected' : ''}>Same</option>${[[0, 'End at once'], [1, '1 warning'], [2, '2 warnings'], [3, '3 warnings']].map(([v, l]) => `<option value="${v}" ${r.warnings === v ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
                <td><select data-r-phone aria-label="Section ${esc(sec)} phones">${yn('allowPhones', 'Allowed', 'Not allowed')}</select></td></tr>`; }).join('')}</tbody>
            </table></div>
            <p class="muted small"><strong>Same</strong> uses the exam's rule (time limit in step 2, the rest in step 5). Only ticked sections take the exam. A section's own time limit and access code are checked by Firebase, like the others. Extra time for a student is added on top of their section's limit.</p>
          </details>
          ${noSection ? `<p class="ok small">${icon('note')} ${plural(noSection, 'student')} on the roster ${noSection === 1 ? 'has' : 'have'} no section, so ${noSection === 1 ? 'that student' : 'they'} won't get this exam. Set their section on the Class dashboard first.</p>` : ''}
        </div>
      </fieldset>`;
  }
  let newSecCodes = {};
  function readWho(opensAt, closesAt, problems) {
    newSecCodes = {};
    if (form.querySelector('input[name=who]:checked')?.value !== 'sections') return null;
    const windows = {};
    for (const row of form.querySelectorAll('[data-sec-row]')) {
      if (!row.querySelector('[data-sec-on]').checked) continue;
      const sec = row.dataset.secRow;
      const o = fromLocalInput(row.querySelector('[data-sec-open]').value) || opensAt, c = fromLocalInput(row.querySelector('[data-sec-close]').value) || closesAt;
      if (o && c && c <= o) problems.push(`Section ${sec}: Closes must be after Opens.`);
      windows[sec] = { opensAt: o, closesAt: c };
      const rr = form.querySelector(`[data-rule-row="${CSS.escape(sec)}"]`);
      if (rr) {
        const dur = rr.querySelector('[data-r-dur]').value.trim();
        if (dur) { const n = Math.round(Number(dur)); if (!(n >= 1 && n <= 600)) problems.push(`Section ${sec}: the time limit must be between 1 and 600 minutes.`); else windows[sec].durationMin = n; }
        const mode = rr.querySelector('[data-r-codemode]').value;
        if (mode === 'own') {
          const cd = normCode(rr.querySelector('[data-r-code]').value);
          if (cd.length < 4) problems.push(`Section ${sec}: its access code needs at least 4 letters or numbers.`);
          windows[sec].requireCode = true; newSecCodes[sec] = cd;
        } else if (mode === 'none') windows[sec].requireCode = false;
        const yn = (sel) => (sel === 'yes' ? true : sel === 'no' ? false : null);
        const seb = yn(rr.querySelector('[data-r-seb]').value); if (seb != null) windows[sec].requireSEB = seb;
        const ph = yn(rr.querySelector('[data-r-phone]').value); if (ph != null) windows[sec].allowPhones = ph;
        const wv = rr.querySelector('[data-r-warn]').value; if (wv !== '') windows[sec].warnings = Number(wv);
      }
    }
    if (!Object.keys(windows).length) problems.push('Tick at least one section (or choose Everyone in the class).');
    return windows;
  }

  root.innerHTML = `
    ${host ? '' : `<section class="page timed-admin"><p class="eyebrow"><a href="#/timed/${encodeURIComponent(cls.id)}">Graded work · ${esc(cls.name)}</a></p><h1>New exam, quiz or assignment</h1>`}
    <form class="timed-form" data-editor novalidate>
      ${attemptsExist ? `<p class="note">${icon('note')} Students have already started this exam, so its questions can't be changed. You can still change the times, rules and extra time.</p>` : ''}
      <fieldset><legend>1. What it is</legend>
        <div class="kind-pick" role="radiogroup" aria-label="Type">${Object.entries(KINDS).map(([k, v]) => `<label class="kind-opt"><input type="radio" name="kind" value="${k}" ${kindOf(t) === k ? 'checked' : ''}><span class="kind-badge kind-${k}">${v.label}</span></label>`).join('')}</div>
        <p class="muted small">Students see exams, quizzes and assignments in separate groups on their class page, apart from practice.</p>
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
        <p class="time-fit small" data-time-fit aria-live="polite"></p>
      </fieldset>
      ${whoFieldset()}
      <fieldset ${attemptsExist ? 'disabled' : ''}><legend>4. Questions</legend>
        <p class="muted small">Use the same files as practice exams. Mark points in a question's heading (<code>## Q3 · 2pts</code>). Written answers graded by hand: <code>## Q9 · written · 5pts</code>. Programming problems use the assignments format (one folder per problem with assignment.md, the starter .java, tests/ and solution/); add <code>points: 10</code> to assignment.md. Tests listed in <code>sample_tests</code> are shown to students; the rest stay hidden for grading.</p>
        <div class="grid2">
          <div class="dropzone" data-drop="md"><p class="drop-hint">${icon('upload')} <strong>Question file (.md)</strong></p><div class="row center"><label class="btn">Choose .md<input type="file" accept=".md,.markdown,.txt" data-md hidden></label></div><p class="muted small drop-name" data-md-name></p></div>
          <div class="dropzone" data-drop="asg"><p class="drop-hint">${icon('code')} <strong>Programming problems</strong> <span class="muted small">(optional)</span></p><div class="row center"><label class="btn">Choose .zip<input type="file" accept=".zip" data-zip hidden></label><label class="btn">Choose a folder<input type="file" webkitdirectory directory multiple data-folder hidden></label></div><p class="muted small drop-name" data-asg-name></p></div>
        </div>
        <div data-qcheck aria-live="polite"></div>
        <div data-qlist></div>
      </fieldset>
      <fieldset><legend>5. Rules</legend>
        <label class="check"><input type="checkbox" name="shuffleQ" ${t.shuffleQ ? 'checked' : ''}><span><strong>Shuffle the question order</strong> for each student (programming problems stay at the end)</span></label>
        <label class="check"><input type="checkbox" name="shuffleOpts" ${t.shuffleOpts ? 'checked' : ''}><span><strong>Shuffle the answer choices</strong> for each student</span></label>
        <label class="check"><input type="checkbox" name="requireCode" ${t.requireCode ? 'checked' : ''}><span><strong>Require an access code to start</strong> (recommended in class): you show the code in the room, so students who aren't there can't start. Turn it off for take-home work.</span></label>
        <div class="code-set" data-code-set ${t.requireCode ? '' : 'hidden'}>
          <label class="field inline"><span>Access code</span><input name="accessCode" value="${esc(accessCode || newAccessCode())}" maxlength="12" autocomplete="off" spellcheck="false" aria-describedby="code-help"></label>
          <button type="button" class="btn small" data-newcode>${icon('shuffle')} New code</button>
          <p class="muted small" id="code-help">Letters and numbers, at least 4. It's on the exam's Live tab too, with a full-screen view for the projector, and you can change it there during the exam.</p>
        </div>
        <label class="check"><input type="checkbox" name="requireSEB" ${t.requireSEB ? 'checked' : ''}><span><strong>Require Safe Exam Browser</strong> (free app for Windows, Mac and iPad that blocks screenshots, other apps and switching). Students without it can't start.</span></label>
        <label class="check"><input type="checkbox" name="aiNotice" ${t.aiNotice !== false ? 'checked' : ''}><span><strong>Add a notice for AI tools</strong> (recommended): a small line above every question and a faint background tells any AI that sees a photo or screenshot of the screen not to answer. Students see it too.</span></label>
        <label class="check"><input type="checkbox" name="allowPhones" ${t.allowPhones ? 'checked' : ''}><span><strong>Allow phones</strong> (off: laptops and iPads only)</span></label>
        <label class="check"><input type="checkbox" name="releaseDetail" ${t.releaseDetail !== false ? 'checked' : ''}><span>When scores are released, also show students <strong>which questions they got right</strong> (the right answers are never shown)</span></label>
        <div class="grid2 leave-rules">
          <label class="field"><span>When a student leaves the exam (switches app, tab or desktop, swipes with 3 or 4 fingers, clicks outside, leaves full screen)</span>
            <select name="warnings">${[[0, 'End it right away'], [1, 'Warn once, end it the 2nd time'], [2, 'Warn twice, end it the 3rd time (recommended)'], [3, 'Warn 3 times, end it the 4th time']].map(([v, l]) => `<option value="${v}" ${Number(t.warnings ?? 0) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label class="field"><span>After a warning, end it anyway if they're away longer than</span>
            <select name="awayMaxSec">${[5, 10, 15, 30].map((v) => `<option value="${v}" ${Number(t.awayMaxSec || 15) === v ? 'selected' : ''}>${v} seconds${v === 15 ? ' (recommended)' : ''}</option>`).join('')}</select></label>
        </div>
        <p class="muted small">Always on: one attempt, full screen, no copy/paste or right-click, no hints or answer checking. <strong>Always ends the exam at once, no warning:</strong> the screenshot keys, developer tools, closing or reloading the page. Two-finger scrolling and swiping inside the page never count. Every warning, and how long they were away, shows on the Live tab. Only you can let a student back in.</p>
      </fieldset>
      <fieldset><legend>6. Extra time (accommodations)</legend>
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
  form.querySelector('[data-newcode]').addEventListener('click', () => { form.querySelector('[name=accessCode]').value = newAccessCode(); });
  // say plainly when Closes cuts the time limit short (a student who starts late gets less time)
  const hmm = (t) => new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  function timeFit() {
    const el = form.querySelector('[data-time-fit]'); if (!el) return;
    const o = fromLocalInput(form.elements.opensAt.value), c = fromLocalInput(form.elements.closesAt.value), d = Number(form.elements.durationMin.value) || 0;
    if (!o || !c || !d || c <= o) { el.textContent = ''; el.className = 'time-fit small'; return; }
    const lastFull = c - d * 60000, win = Math.round((c - o) / 60000);
    if (lastFull < o) { el.className = 'time-fit small bad'; el.innerHTML = `<strong>Nobody gets the full ${d} minutes:</strong> the exam is open for only ${win} minutes. Make Closes later, or the time limit shorter.`; return; }
    el.className = 'time-fit small ' + (lastFull - o < 10 * 60000 ? 'warn' : 'good');
    el.innerHTML = `Students who press Start by <strong>${hmm(lastFull)}</strong> get the full ${d} minutes. Anyone starting later has only until ${hmm(c)}.${lastFull - o < 10 * 60000 ? ' For an exam in class, close it 10 to 15 minutes later so late starters still get the full time.' : ''}`;
  }
  form.addEventListener('input', (ev) => { if (['opensAt', 'closesAt', 'durationMin'].includes(ev.target.name)) timeFit(); });
  timeFit();
  form.addEventListener('change', (ev) => {
    if (['opensAt', 'closesAt', 'durationMin'].includes(ev.target.name)) timeFit();
    if (ev.target.name === 'requireCode') form.querySelector('[data-code-set]').hidden = !ev.target.checked;
    if (ev.target.name === 'who') form.querySelector('[data-secs]').hidden = ev.target.value !== 'sections';
    if (ev.target.matches('[data-r-codemode]')) { const inp = ev.target.parentElement.querySelector('[data-r-code]'); inp.hidden = ev.target.value !== 'own'; if (!inp.hidden) inp.focus(); }
    // typing a section's own time ticks that section
    if (ev.target.matches('[data-sec-open],[data-sec-close]') && ev.target.value) ev.target.closest('tr').querySelector('[data-sec-on]').checked = true;
  });

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
    const windows = readWho(opensAt, closesAt, problems);
    const code = normCode(f.get('accessCode'));
    if (f.get('requireCode') === 'on' && code.length < 4) problems.push('The access code needs at least 4 letters or numbers (or untick "Require an access code").');
    const ex = parseExtraTime(f.get('extra'), cloud.domain || 'sdsu.edu');
    if (ex.bad.length) problems.push(`Extra time: couldn't read "${ex.bad[0]}". Write an email and a number of minutes, like  jdoe@sdsu.edu 30`);
    if (problems.length) { err.textContent = problems.join(' '); err.scrollIntoView({ block: 'nearest' }); return; }
    if (status === 'published' && closesAt - opensAt < durationMin * 60000) {
      if (!(await confirmDialog({ title: 'The window is shorter than the time limit', body: `<p>The exam is open for ${Math.round((closesAt - opensAt) / 60000)} minutes but the time limit is ${durationMin}. Students who start late get less time. Publish anyway?</p>`, confirm: 'Publish' }))) return;
    }
    err.textContent = '';
    const test = {
      title, kind: KINDS[f.get('kind')] ? f.get('kind') : 'exam', instructions: String(f.get('instructions') || '').trim(), opensAt, closesAt, windows, durationMin,
      shuffleQ: f.get('shuffleQ') === 'on', shuffleOpts: f.get('shuffleOpts') === 'on', requireSEB: f.get('requireSEB') === 'on', requireCode: f.get('requireCode') === 'on',
      allowPhones: f.get('allowPhones') === 'on', releaseDetail: f.get('releaseDetail') === 'on', aiNotice: f.get('aiNotice') === 'on',
      warnings: Math.max(0, Math.min(3, Number(f.get('warnings')) || 0)), awayMaxSec: [5, 10, 15, 30].includes(Number(f.get('awayMaxSec'))) ? Number(f.get('awayMaxSec')) : 15,
      questions: state.questions, totalPoints: state.questions.reduce((s, q) => s + (Number(q.points) || 0), 0),
      status, disabled: !!t.disabled, released: !!t.released, createdAt: t.createdAt || null, createdBy: t.createdBy || null,
    };
    if (!test.createdAt) { delete test.createdAt; delete test.createdBy; }
    const btns = form.querySelectorAll('button[type=submit]'); btns.forEach((b) => (b.disabled = true));
    try {
      const id = await cloud.saveTimed(cls.id, existing?.id || null, test, state.filesChanged || !existing ? { questions: state.key || {} } : null, ex.list);
      const wantCode = test.requireCode ? code : accessCode;
      const sameCodes = wantCode === accessCode && JSON.stringify(Object.entries(newSecCodes).sort()) === JSON.stringify(Object.entries(secCodes || {}).sort());
      if (!sameCodes && (test.requireCode || Object.keys(newSecCodes).length || Object.keys(secCodes || {}).length)) await cloud.setAccessCodes(cls.id, id, { code: wantCode, sections: newSecCodes });
      toast(status === 'published' ? (windows ? `${title} is published for ${plural(Object.keys(windows).length, 'section')}.` : `${title} is published. Students can start at ${when(opensAt)}.`) : `${title} saved as a draft`, 'good');
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
  if (!test) { main.innerHTML = `<section class="page"><h1>Exam not found</h1><p><a class="btn" href="#/timed/${encodeURIComponent(cls.id)}">Back to graded work</a></p></section>`; return; }
  const phaseNow = () => examPhase({ ...test, ...overallWindow(test) }, cloud.trueNow());
  const lead = cloud.leadsClass(cls.id); // TAs: no Settings, turning off, releasing or new attempts
  let tab = ['live', 'results', ...(lead ? ['settings'] : [])].includes(query.tab) ? query.tab : phaseNow() === 'closed' ? 'results' : phaseNow() === 'draft' && lead ? 'settings' : 'live';
  let roster = [], attempts = [], grades = [], key = null, loadedAt = 0, filter = 'all', section = '', search = '', auto = true, timer = null, tick = null, settingsCleanup = null;
  let codes = await cloud.getAccessCodes(cls.id, tid).catch(() => ({ code: '', sections: {} }));
  let accessCode = codes.code;
  const codedSections = () => Object.entries(test.windows || {}).filter(([sec, w]) => (w.requireCode ?? test.requireCode) === true).map(([sec]) => sec)
    .filter((sec) => !mySecs || mySecs.includes(sec)).sort((x, y) => x.localeCompare(y, undefined, { numeric: true }));
  const mySecs = (() => { const c = cloud.myClasses().find((x) => x.id === cls.id); return c?.role === 'ta' && !cloud.isAdmin() ? (c.sections?.length ? c.sections : String(c.section || '').split(',').map((s) => s.trim()).filter(Boolean)) : null; })();

  main.innerHTML = `
    <section class="page timed-admin timed-exam">
      <p class="eyebrow"><a href="#/timed/${encodeURIComponent(cls.id)}">Graded work · ${esc(cls.name)}</a></p>
      <div class="row between wrap"><h1 data-title>${esc(test.title)}</h1><span data-phase></span></div>
      <p class="muted" data-sub></p>
      <div class="row wrap timed-links">
        <button class="btn" data-copy-link>${icon('link')} Copy the student link</button>
        <button class="btn" data-seb-file>${icon('download')} Safe Exam Browser file</button>
        <a class="btn" href="#/take/${encodeURIComponent(cls.id)}/${encodeURIComponent(tid)}?preview=1">${icon('eye')} Try it as a student</a>
        <button class="btn" data-toggle-off hidden></button>
      </div>
      <p class="off-note" data-off-note hidden>${icon('lock')} <span><strong>Turned off.</strong> Students can't see this ${esc(KINDS[kindOf(test)].label.toLowerCase())} or start it. Anyone who was already working on it can still finish. Turn it on again any time.</span></p>
      <div class="dash-tabs" role="tablist" aria-label="Exam">${[['live', 'Live'], ['results', 'Results & grading'], ...(lead ? [['settings', 'Settings']] : [])].map(([k, l]) => `<button role="tab" data-xtab="${k}" id="xtab-${k}" aria-controls="xpanel" aria-selected="${tab === k}" tabindex="${tab === k ? 0 : -1}">${l}</button>`).join('')}</div>
      <div id="xpanel" role="tabpanel" data-panel aria-labelledby="xtab-${tab}"></div>
    </section>`;
  const panel = main.querySelector('[data-panel]');
  const head = () => {
    const ph = phaseNow();
    main.querySelector('[data-title]').textContent = test.title;
    main.querySelector('[data-phase]').innerHTML = `<span class="kind-badge kind-${kindOf(test)}">${KINDS[kindOf(test)].label}</span> <span class="phase phase-${test.disabled ? 'off' : ph}">${test.disabled ? 'Turned off' : PHASE_LABEL[ph]}${test.released ? ' · scores released' : ''}</span>`;
    const offBtn = main.querySelector('[data-toggle-off]');
    if (offBtn) { offBtn.innerHTML = test.disabled ? `${icon('play')} Turn on` : `${icon('lock')} Turn off`; offBtn.classList.toggle('primary', !!test.disabled); offBtn.hidden = test.status !== 'published' || !lead; }
    const offNote = main.querySelector('[data-off-note]');
    if (offNote) offNote.hidden = !test.disabled;
    const span = overallWindow(test);
    main.querySelector('[data-sub]').textContent = `${whoText(test) ? whoText(test) + ' · ' : ''}${when(span.opensAt)} → ${when(span.closesAt)} · ${test.durationMin} minutes · ${plural((test.questions || []).length, 'question')} · ${r1(test.totalPoints)} points${test.requireSEB ? ' · Safe Exam Browser required' : ''}${Object.values(test.windows || {}).some((w) => Object.keys(sectionRules(w)).length) ? ' · some sections have their own rules' : ''}`;
  };
  head();

  const students = () => roster.filter((p) => (!p.role || p.role === 'student') && windowFor(test, p.section) && (!mySecs || mySecs.some((s) => String(p.section || '').split(',').map((x) => x.trim()).includes(s))));
  let earlier = [];
  const earlierOf = (email) => earlier.filter((x) => String(x.email).toLowerCase() === String(email).toLowerCase());
  // Reading as little as possible (Firebase's free plan counts every document read):
  // every minute only the attempts whose state changed (started, warned, submitted, ended…), usually a
  // few documents or none; the whole class every FULL_EVERY (for "last saved" and "answered") and
  // whenever you press Refresh.
  const FULL_EVERY = 5 * 60000;
  let fullAt = 0, deltaAt = 0;
  async function loadData(withGrades = false, full = true) {
    if (full || !fullAt) {
      const t = cloud.trueNow();
      [roster, attempts, earlier] = await Promise.all([roster.length ? roster : cloud.getRoster(cls.id), cloud.listAttempts(cls.id, tid), cloud.listEarlierAttempts(cls.id, tid).catch(() => [])]);
      fullAt = deltaAt = t;
    } else if (cloud.trueNow() - fullAt >= FULL_EVERY) {
      // students still working only (finished ones don't change; any change to them comes with a stateKey)
      const t = cloud.trueNow();
      const [open, changed] = await Promise.all([cloud.listOpenAttempts(cls.id, tid), cloud.listAttemptsChanged(cls.id, tid, deltaAt - 30000)]);
      const seen = new Set([...open, ...changed].map((a) => a.id));
      // shown as working here but no longer open in Firebase, and its change was missed: read those again
      const stale = attempts.filter((a) => a.status === 'open' && !seen.has(a.id));
      const fixed = stale.length ? (await cloud.listAttempts(cls.id, tid)).filter((a) => stale.some((x) => x.id === a.id) || !attempts.some((x) => x.id === a.id)) : [];
      const byId = new Map(attempts.filter((a) => !stale.some((x) => x.id === a.id)).map((a) => [a.id, a]));
      for (const a of [...open, ...changed, ...fixed]) byId.set(a.id, a);
      attempts = [...byId.values()];
      fullAt = deltaAt = t;
    } else {
      const t = cloud.trueNow();
      const changed = await cloud.listAttemptsChanged(cls.id, tid, deltaAt - 30000); // 30 s overlap: clocks (all on the real time) differ by a second or two
      deltaAt = t;
      if (changed.length) {
        const byId = new Map(attempts.map((a) => [a.id, a]));
        for (const a of changed) byId.set(a.id, a);
        attempts = [...byId.values()];
      }
    }
    if (withGrades) grades = await cloud.listTestGrades(cls.id, tid).catch(() => []);
    loadedAt = Date.now();
  }
  // one row per roster student (plus anyone with an attempt who isn't on the roster any more)
  function rowsNow() {
    const now = cloud.trueNow();
    const byEmail = new Map(attempts.map((a) => [String(a.email).toLowerCase(), a]));
    const list = students().map((p) => ({ p, a: byEmail.get(String(p.email).toLowerCase()) || null }));
    for (const a of attempts) if (!list.some((r) => r.a === a) && !mySecs) list.push({ p: { email: a.email, name: a.name || a.email, section: '' }, a, offRoster: true });
    return list.map((r) => ({ ...r, ...attemptState(r.a, now, r.p) }));
  }
  function attemptState(a, now, p = {}) {
    const win = windowFor(test, p.section) || overallWindow(test);
    if (!a) return { st: 'none', label: now < win.opensAt ? `Opens ${when(win.opensAt)}` : now >= win.closesAt ? "Didn't take it" : 'Not started', win };
    const dl = attemptDeadline({ ...test, ...win }, a);
    const exits = (a.events || []).filter((e) => LEAVES.includes(e.type));
    const evs = a.events || [], fromReopen = evs.slice(evs.map((e) => e.type).lastIndexOf('reopened') + 1);
    const warns = fromReopen.filter((e) => e.warning).length;
    const awaySec = Math.round(evs.reduce((n, e) => n + (Number(e.awayMs) || 0), 0) / 1000);
    const answeredN = (test.questions || []).filter((q) => answered(q, a.answers?.[q.id])).length;
    const base = { deadline: dl, exits, warns, awaySec, answeredN, beat: ms(a.beatAt), win };
    if (a.status === 'submitted') return { ...base, st: 'submitted', label: a.endedReason === 'time-up' ? 'Time ran out (submitted)' : 'Submitted' };
    if (a.status === 'ended') return { ...base, st: 'ended', label: 'Ended: ' + (EXIT_LABEL[a.endedReason] || a.endedReason || 'left the exam') };
    if (now > dl + 30000) return { ...base, st: 'timeup', label: 'Time up (last save kept)' };
    if (now - ms(a.beatAt) > 5 * 60000) return { ...base, st: 'lost', label: 'No contact for ' + Math.round((now - ms(a.beatAt)) / 60000) + ' min' };
    return { ...base, st: 'working', label: 'Working' };
  }

  // ------------------------------------------------ Live
  const FILTERS = { all: () => true, none: (r) => r.st === 'none', working: (r) => r.st === 'working', submitted: (r) => r.st === 'submitted' || r.st === 'timeup', ended: (r) => r.st === 'ended', lost: (r) => r.st === 'lost', exits: (r) => (r.exits || []).length > 0 };
  // the code, huge, for the projector (Esc or click to close)
  function showCodeBig(code = accessCode, label = '') {
    const el = document.createElement('div');
    el.className = 'code-projector';
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Access code');
    el.innerHTML = `<p class="code-proj-title">${esc(test.title)}</p><p class="code-proj-label">Access code${label ? ' · ' + esc(label) : ''}</p><p class="code-proj-code">${esc(code)}</p>
      <p class="code-proj-help">Open the exam on your class page, type this code, and press Start.</p><button class="btn" data-close-proj>Close</button>`;
    document.body.appendChild(el);
    const close = () => { el.remove(); document.removeEventListener('keydown', onKey); main.querySelector('[data-showcode]')?.focus(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    el.addEventListener('click', close);
    el.querySelector('[data-close-proj]').focus();
    el.requestFullscreen?.().catch(() => {});
  }
  function livePanel() {
    const rows = rowsNow().filter((r) => !section || String(r.p.section || '').split(',').map((x) => x.trim()).includes(section));
    const n = (k) => rows.filter(FILTERS[k]).length;
    const q = search.trim().toLowerCase();
    const shown = rows.filter(FILTERS[filter]).filter((r) => !q || `${r.p.name} ${r.p.email} ${r.p.redId || ''}`.toLowerCase().includes(q))
      .sort((x, y) => ['lost', 'ended', 'working', 'timeup', 'submitted', 'none'].indexOf(x.st) - ['lost', 'ended', 'working', 'timeup', 'submitted', 'none'].indexOf(y.st) || String(x.p.name || '').localeCompare(String(y.p.name || '')));
    const secs = [...new Set(students().flatMap((p) => String(p.section || '').split(',').map((s) => s.trim()).filter(Boolean)))].sort();
    const now = cloud.trueNow();
    const cards = [['all', 'Everyone', ''], ['none', 'Not started', ''], ['working', 'Working now', 'good'], ['submitted', 'Submitted', 'good'], ['ended', 'Ended by leaving', 'bad'], ['lost', 'No contact 5+ min', 'warn'], ['exits', 'Any exit recorded', 'warn']];
    // one code for the exam, or each section's own code (a section without its own uses the exam's)
    const secList = test.windows ? codedSections() : [];
    const codeRows = test.windows
      ? secList.map((sec) => ({ sec, code: codes.sections[sec] || accessCode, own: !!codes.sections[sec] }))
      : test.requireCode ? [{ sec: '', code: accessCode, own: false }] : [];
    const codeBox = codeRows.length ? `
      <div class="code-box ${codeRows.length > 1 ? 'multi' : ''}">
        ${codeRows.map((r) => `<div class="code-row">
          <div><p class="eyebrow">Access code${r.sec ? ` · section ${esc(r.sec)}` : ''}</p><p class="code-big" data-code-text>${esc(r.code || '(not set)')}</p></div>
          <div class="row wrap"><button class="btn primary" data-showcode="${esc(r.sec)}">${icon('eye')} Show on projector</button><button class="btn" data-newaccess="${esc(r.own ? r.sec : '')}">${icon('shuffle')} New code</button></div>
        </div>`).join('')}
        <p class="muted small">Show it in the room when students may start. Students who have already started don't need it again.${codeRows.length > 1 && codeRows.some((r) => !r.own) ? ' Sections without their own code share the exam\'s code, so a new code changes it for all of them.' : ''}</p>
      </div>` : '';
    return `${codeBox}
      <div class="row between wrap live-bar">
        <p class="muted small" aria-live="polite">Updated ${clock(loadedAt)}${auto ? ' · status every minute, last saved and answered every 5 minutes (Refresh for now)' : ''}</p>
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
            <td data-label="Status"><span class="st-pill st-${r.st}">${esc(r.label)}</span>${a?.reopened ? `<span class="muted small block">let back in ×${a.reopened}</span>` : ''}${earlierOf(r.p.email).length ? `<span class="muted small block">attempt ${earlierOf(r.p.email).length + 1}${a ? '' : ' allowed, not started'}</span>` : ''}</td>
            <td data-label="Started">${a ? clock(ms(a.startedAt)) : '–'}</td>
            <td data-label="Time left">${left == null ? '–' : `<span data-left="${r.deadline}">${mmss(left)}</span>`}${a?.extraMin ? `<span class="muted small block">+${a.extraMin} min extra</span>` : ''}${left != null && ms(a.startedAt) + (r.win.durationMin ?? test.durationMin) * 60000 > r.win.closesAt ? `<span class="muted small block" title="Started ${esc(String(Math.round((ms(a.startedAt) + (r.win.durationMin ?? test.durationMin) * 60000 - r.win.closesAt) / 60000)))} min too late for the full time">ends at closing time ${new Date(r.win.closesAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span>` : ''}</td>
            <td data-label="Last saved">${a ? clock(r.beat) : '–'}</td>
            <td data-label="Answered">${a ? `${r.answeredN} of ${(test.questions || []).length}` : '–'}</td>
            <td data-label="Exits">${r.exits?.length ? `<span class="bad">${Number(test.warnings) > 0 ? `${r.warns} of ${test.warnings} warnings` : r.exits.length}</span> <span class="muted small">${esc(EXIT_LABEL[r.exits[r.exits.length - 1].type] || '')}${r.awaySec ? ` · away ${r.awaySec}s in all` : ''}</span>` : a ? '0' : '–'}</td>
            <td data-label="Device">${a?.device ? `${esc(a.device.browser)} · ${esc(a.device.os)}${a.device.seb ? ' ✓' : ''}` : '–'}</td>
            <td class="row-actions">${a ? `${['ended', 'lost', 'timeup'].includes(r.st) ? `<button class="btn small" data-reopen="${esc(a.id)}">Let back in</button>` : ''}${r.st === 'submitted' && lead ? `<button class="btn small" data-newattempt="${esc(a.id)}">New attempt</button>` : ''}${r.st === 'working' || r.st === 'lost' ? `<button class="btn small" data-addtime="${esc(a.id)}">+ Time</button><button class="btn small danger-outline" data-endnow="${esc(a.id)}">End</button>` : ''}` : ''}</td>
          </tr>`;
        }).join('') || `<tr><td colspan="9" class="muted">No students match.</td></tr>`}</tbody>
      </table></div>`;
  }
  function tickClocks() {
    const now = cloud.trueNow();
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
          ${grades.length && lead ? `<button class="btn ${test.released ? '' : 'primary'}" data-release="${test.released ? 'hide' : 'show'}">${test.released ? 'Hide scores from students' : 'Release scores to students'}</button>`: ''}${grades.length ? `
          <button class="btn" data-canvas>${icon('upload')} Send to Canvas</button>
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
  // ------------------------------------------------ Canvas: a file for Grades → Import
  function sendToCanvas() {
    const g = new Map(grades.map((x) => [x.uid, x]));
    // everyone this was for (their section), with a score if graded
    const people = rowsNow().filter((r) => !r.offRoster).map((r) => ({ ...r.p, score: r.a && g.get(r.a.uid) ? g.get(r.a.uid).total : null, took: !!r.a }));
    const st = { ex: null, fileName: '', fromRoster: false, column: '', zeros: false, err: '' };
    const label = `${test.title}`;
    const m = modal({ title: 'Send scores to Canvas', wide: true, body: '<div data-cv></div>' });
    const box = m.el.querySelector('[data-cv]');
    const canvasStudents = () => (st.fromRoster ? rosterAsCanvas(people) : st.ex?.students || []);
    function draw() {
      const ready = st.ex || st.fromRoster;
      const existing = st.ex?.assignments || [];
      const sameName = existing.find((a) => a.base.trim().toLowerCase() === label.trim().toLowerCase());
      if (ready && !st.column) st.column = sameName ? sameName.name : label;
      let summary = '', target = null, points = test.totalPoints, factor = 1, match = null;
      if (ready) {
        match = matchCanvas(canvasStudents(), people);
        target = st.ex?.assignments.find((a) => a.name === st.column) || null;
        if (target && target.points > 0 && test.totalPoints > 0 && Math.abs(target.points - test.totalPoints) > 1e-9) { points = target.points; factor = target.points / test.totalPoints; }
        else if (target) points = target.points;
        const withScore = match.pairs.filter((x) => x.p.score != null).length;
        const missing = match.pairs.filter((x) => x.p.score == null).length;
        const hows = ['RedID', 'email', 'name'].map((h) => [h, match.pairs.filter((x) => x.how === h).length]).filter(([, n]) => n).map(([h, n]) => `${n} by ${h}`).join(', ');
        summary = `
          <div class="cv-summary">
            <p><strong>${match.pairs.length}</strong> Canvas student${match.pairs.length === 1 ? '' : 's'} matched${hows ? ` (${hows})` : ''}: <strong>${withScore}</strong> with a score${missing ? `, ${missing} without (${st.zeros ? 'they get 0' : 'left out, so Canvas keeps what they have'})` : ''}.</p>
            ${factor !== 1 ? `<p class="ok">${icon('note')} This is out of ${r1(test.totalPoints)} here and ${r1(target.points)} in Canvas, so scores are scaled to ${r1(target.points)} (for example ${r1(test.totalPoints)} → ${r1(target.points)}).</p>` : ''}
            ${match.notInCanvas.length ? `<details><summary><strong>${icon('note')} ${plural(match.notInCanvas.length, 'student')} here ${match.notInCanvas.length === 1 ? "isn't" : "aren't"} in the Canvas file</strong></summary><ul class="small">${match.notInCanvas.map((p) => `<li>${esc(p.name || p.email)} · ${esc(p.email || '')}${p.score != null ? ` · score ${r1(p.score)}` : ''}</li>`).join('')}</ul><p class="muted small">Enter these by hand in Canvas, or check their RedID on the roster.</p></details>` : ''}
            ${match.noMatch.length ? `<details><summary>${plural(match.noMatch.length, 'Canvas student')} not in this ${KINDS[kindOf(test)].label.toLowerCase()}</summary><ul class="small">${match.noMatch.map((c) => `<li>${esc(c.name)}${c.section ? ' · ' + esc(c.section) : ''}</li>`).join('')}</ul><p class="muted small">Their cell is left out, so Canvas keeps whatever they have now${assignedSections(test) ? ' (other sections, for example)' : ''}.</p></details>` : ''}
          </div>`;
      }
      box.innerHTML = `
        <ol class="cv-steps">
          <li><h3>Your Canvas gradebook</h3>
            <p class="muted small">In Canvas open <strong>Grades → Export → Export Entire Gradebook</strong> and drop that .csv here. It's read on this computer only; nothing is uploaded.</p>
            <div class="dropzone small-drop" data-cv-drop><p class="drop-hint">${icon('upload')} ${st.fileName ? `<strong>${esc(st.fileName)}</strong>: ${plural(st.ex.students.filter((x) => !x.testStudent).length, 'student')}, ${plural(st.ex.assignments.length, 'assignment')}` : '<strong>Drag the Canvas .csv here</strong>'}</p>
              <label class="btn small">Choose file<input type="file" accept=".csv,text/csv" data-cv-file hidden></label></div>
            ${st.err ? `<p class="bad" role="alert">${esc(st.err)}</p>` : ''}
            ${st.ex ? '' : `<p class="small">No export? <button class="link-btn" data-cv-roster>${st.fromRoster ? 'Using the roster (RedID as SIS User ID)' : 'Make the file from the roster instead'}</button></p>`}
          </li>
          ${ready ? `<li><h3>Which Canvas column</h3>
            <label class="field"><span>Put the scores in</span><select data-cv-col>
              <option value="${esc(label)}" ${st.column === label ? 'selected' : ''}>A new assignment: “${esc(label)}” (${r1(test.totalPoints)} points)</option>
              ${existing.map((a) => `<option value="${esc(a.name)}" ${st.column === a.name ? 'selected' : ''}>${esc(a.base)} · ${a.points != null && !isNaN(a.points) ? r1(a.points) + ' points' : ''}</option>`).join('')}
            </select></label>
            <p class="muted small">Picking an existing assignment updates it. A new one is created and <strong>published</strong> by Canvas when you import. If your course uses grading periods, create the assignment in Canvas first, export again, and pick it here.</p></li>
          <li><h3>Students with no score</h3>
            <label class="check"><input type="radio" name="cv-zero" value="blank" ${st.zeros ? '' : 'checked'}><span>Leave blank (you decide later)</span></label>
            <label class="check"><input type="radio" name="cv-zero" value="zero" ${st.zeros ? 'checked' : ''}><span>Give 0 (didn't take it)</span></label></li>
          <li><h3>Check and download</h3>${summary}
            <div class="row"><button class="btn primary" data-cv-dl ${match?.pairs.length ? '' : 'disabled'}>${icon('download')} Download the file for Canvas</button></div>
            <p class="muted small">Then in Canvas: <strong>Grades → Import</strong>, choose this file, check the preview (lower grades show in red) and click <strong>Upload</strong>.${test.released ? '' : ' Scores aren\'t released to students here yet; Canvas shows them to students according to your course\'s posting policy.'}</p></li>` : ''}
        </ol>`;
      box._data = { match, points, factor };
    }
    async function useFile(f) {
      if (!f) return;
      try { st.ex = readCanvasExport(await f.text()); st.fileName = f.name; st.fromRoster = false; st.err = ''; st.column = ''; }
      catch (e) { st.err = e.message || String(e); st.ex = null; st.fileName = ''; }
      draw();
    }
    box.addEventListener('change', (e) => {
      if (e.target.matches('[data-cv-file]')) useFile(e.target.files[0]);
      if (e.target.matches('[data-cv-col]')) { st.column = e.target.value; draw(); box.querySelector('[data-cv-col]')?.focus(); }
      if (e.target.name === 'cv-zero') { st.zeros = e.target.value === 'zero'; draw(); box.querySelector(`input[name=cv-zero][value=${st.zeros ? 'zero' : 'blank'}]`)?.focus(); }
    });
    box.addEventListener('click', (e) => {
      if (e.target.closest('[data-cv-roster]')) { st.fromRoster = !st.fromRoster; st.column = ''; draw(); }
      if (e.target.closest('[data-cv-dl]')) {
        const { match, points, factor } = box._data;
        // no score and "leave blank": leave the student out, so Canvas doesn't touch their cell
        const rows = match.pairs.filter(({ p }) => p.score != null || st.zeros).map(({ c, p }) => ({ c, score: p.score != null ? p.score * factor : 0 }));
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([canvasCsv({ column: st.column, points, rows })], { type: 'text/csv;charset=utf-8' }));
        a.download = `Grades-${test.title.replace(/[^\w-]+/g, '_')}-for-Canvas.csv`;
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        toast('Downloaded. Now import it in Canvas: Grades → Import.', 'good');
      }
    });
    box.addEventListener('dragover', (e) => { if (e.target.closest('[data-cv-drop]')) { e.preventDefault(); e.target.closest('[data-cv-drop]').classList.add('over'); } });
    box.addEventListener('dragleave', (e) => e.target.closest?.('[data-cv-drop]')?.classList.remove('over'));
    box.addEventListener('drop', (e) => { if (e.target.closest('[data-cv-drop]')) { e.preventDefault(); useFile(e.dataTransfer.files[0]); } });
    draw();
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
      body: (earlierOf(r.p.email).length ? `<div class="earlier"><h3>Earlier ${earlierOf(r.p.email).length === 1 ? 'attempt' : 'attempts'}</h3><ul>${earlierOf(r.p.email).map((x, k) => `<li><strong>Attempt ${k + 1}</strong>: ${x.submittedAt ? `submitted ${when(ms(x.submittedAt))}` : 'finished'} · ${r1((test.questions || []).filter((q) => answered(q, x.answers?.[q.id])).length)} of ${(test.questions || []).length} answered${x.grade?.total != null ? ` · score ${r1(x.grade.total)} of ${r1(test.totalPoints)}` : ''} <span class="muted small">(new attempt given by ${esc(x.archivedBy || 'staff')} ${when(x.archivedAt)})</span>
          <details><summary>See attempt ${k + 1}'s answers</summary><ol class="saved-answers">${(test.questions || []).map((q) => { const v = x.answers?.[q.id]; return `<li><strong>${esc(q.label)}</strong><div>${!answered(q, v) ? '<span class="muted">No answer</span>' : q.options ? esc((Array.isArray(v) ? v : [v]).map((i) => q.options[i]).join(' · ')) : q.type === 'code' ? `<pre class="code-view small" tabindex="0"><code>${esc(v)}</code></pre>` : esc(v)}</div></li>`; }).join('')}</ol></details></li>`).join('')}</ul><p class="muted small">Only the latest attempt is graded. Earlier answers are kept here for your records.</p></div>` : '') + (!a ? `<p>${esc(r.p.email)} hasn't started ${earlierOf(r.p.email).length ? 'the new attempt yet' : 'this exam'}.</p>` : `
        <p class="muted small">${esc(r.p.email)}${r.p.section ? ' · ' + esc(r.p.section) : ''} · <span class="st-pill st-${r.st}">${esc(r.label)}</span></p>
        <dl class="kv"><dt>Started</dt><dd>${when(ms(a.startedAt))}</dd><dt>Must finish by</dt><dd>${when(r.deadline)}${a.extraMin ? ` (includes ${a.extraMin} extra min)` : ''}</dd><dt>Last saved</dt><dd>${when(r.beat)} · ${plural(a.saves || 0, 'save')}</dd>${a.submittedAt ? `<dt>Finished</dt><dd>${when(ms(a.submittedAt))}</dd>` : ''}<dt>Device</dt><dd>${a.device ? `${esc(a.device.browser)} on ${esc(a.device.os)}${a.device.seb ? ' (Safe Exam Browser)' : ''}${a.device.screen ? ` · screen ${esc(a.device.screen)}` : ''}` : '–'}</dd><dt>Answered</dt><dd>${r.answeredN} of ${qs.length}</dd></dl>
        <h3>What happened</h3>
        <ol class="timeline">${[{ t: ms(a.startedAt), type: 'started' }, ...(a.events || [])].map((e) => `<li class="${LEAVES.includes(e.type) || e.type === 'professor-ended' ? 'bad' : ''}"><span class="muted small">${clock(e.t)}</span> ${esc(e.type === 'started' ? 'Started the exam' : e.type === 'reopened' ? `Let back in by ${e.by || 'the professor'}${e.add ? ` (+${e.add} min)` : ''}` : e.type === 'time-added' ? `${e.add} minutes added by ${e.by || 'the professor'}` : EXIT_LABEL[e.type] || e.type)}${e.warning ? ` <strong>(warning ${e.warning} of ${test.warnings || e.warning})</strong>` : ''}${e.awayMs ? ` <span class="muted small">after ${Math.round(e.awayMs / 1000)} s</span>` : ''}${e.detail ? ` <span class="muted small">${esc(e.detail)}</span>` : ''}</li>`).join('')}</ol>
        <h3>Saved answers</h3>
        <ol class="saved-answers">${qs.map((q) => { const v = a.answers?.[q.id]; return `<li><strong>${esc(q.label)}</strong> <span class="muted small">${QTYPE_LABEL[q.type]}</span><div>${!answered(q, v) ? '<span class="muted">No answer</span>' : q.options ? esc((Array.isArray(v) ? v : [v]).map((i) => q.options[i]).join(' · ')) : q.type === 'code' ? `<pre class="code-view small" tabindex="0"><code>${esc(v)}</code></pre>` : esc(v)}</div></li>`; }).join('')}</ol>`),
    });
  }
  async function newAttemptFor(aid) {
    const a = attempts.find((x) => x.id === aid);
    if (!a) return;
    const sec = roster.find((p) => String(p.email).toLowerCase() === String(a.email).toLowerCase())?.section;
    const win = windowFor(test, sec) || overallWindow(test);
    const closed = cloud.trueNow() >= win.closesAt;
    const ok = await confirmDialog({
      title: `Give ${a.name || a.email} a new attempt?`,
      body: `<p>They start again <strong>from a blank exam</strong>, with the full time limit${test.requireCode || Object.values(test.windows || {}).some((w) => w.requireCode) ? ' and the access code' : ''}. Only the new attempt is graded.</p>
        <p>Their submitted answers (and score, if you have graded it) are kept as an earlier attempt: open their name to see them.</p>
        ${closed ? `<p class="bad small"><strong>The exam is closed${sec ? ` for section ${esc(sec)}` : ''}</strong>, so they can't start until you move its closing time later (Settings).</p>` : ''}
        <p class="muted small">This is different from Let back in, which continues an attempt that was cut off.</p>`,
      confirm: 'Give a new attempt',
    });
    if (!ok) return;
    try { await cloud.newAttempt(cls.id, aid); toast(`${a.name || a.email} can start a new attempt`, 'good'); refresh(); }
    catch (e) { toast("Couldn't: " + (e?.code === 'permission-denied' ? 'publish the latest firestore.rules.' : e?.message || e), 'bad'); }
  }
  async function reopen(aid) {
    const a = attempts.find((x) => x.id === aid);
    if (!a) return;
    const sec = roster.find((p) => String(p.email).toLowerCase() === String(a.email).toLowerCase())?.section;
    const win = windowFor(test, sec) || overallWindow(test);
    const m = modal({
      title: `Let ${a.name || a.email} back in?`,
      body: `<p>They can continue their same attempt with the answers they saved. Their clock doesn't stop: it still counts from when they started, so add minutes if they lost time.</p>
        <label class="field inline"><span>Extra minutes</span><input type="number" min="0" max="300" value="${Math.max(0, Math.ceil((cloud.trueNow() - attemptDeadline({ ...test, ...win }, a)) / 60000) + 5) || 0}" data-add></label>`,
      actions: [{ label: 'Cancel' }, { label: 'Let back in', kind: 'primary', onClick: (close) => {
        const add = Math.max(0, Math.round(Number(m.el.querySelector('[data-add]').value) || 0));
        cloud.staffAttempt(cls.id, aid, { status: 'open', session: '', endedReason: '', submittedAt: null, extraMin: (Number(a.extraMin) || 0) + add, reopened: (a.reopened || 0) + 1, events: [...(a.events || []), { t: cloud.trueNow(), type: 'reopened', by: cloud.currentUser()?.email || '', add }] }, { now: true })
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
        cloud.staffAttempt(cls.id, aid, { extraMin: (Number(a.extraMin) || 0) + add, events: [...(a.events || []), { t: cloud.trueNow(), type: 'time-added', by: cloud.currentUser()?.email || '', add }] })
          .then(() => { toast(`${add} minutes added`, 'good'); refresh(); }).catch((e) => toast("Couldn't: " + (e?.message || e), 'bad'));
        close(); return true;
      } }],
    });
  }
  async function endNow(aid) {
    const a = attempts.find((x) => x.id === aid);
    if (!a || !(await confirmDialog({ title: `End ${a.name || a.email}'s exam now?`, body: '<p>Their saved answers are kept and graded. You can let them back in later.</p>', confirm: 'End exam', danger: true }))) return;
    await cloud.staffAttempt(cls.id, aid, { status: 'ended', endedReason: 'professor-ended', submittedAt: 'now', events: [...(a.events || []), { t: cloud.trueNow(), type: 'professor-ended', by: cloud.currentUser()?.email || '' }] }).catch((e) => toast("Couldn't: " + (e?.message || e), 'bad'));
    refresh();
  }

  // ------------------------------------------------ painting
  async function refresh(full = true) {
    try { await loadData(tab === 'results', full); } catch (e) { toast("Couldn't refresh: " + (e?.message || e), 'bad'); }
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
    if (tab === 'live') timer = setInterval(() => { if (auto && document.visibilityState === 'visible' && !document.querySelector('.modal-back') && phaseNow() === 'open') refresh(false); }, 60000);
  }
  tick = setInterval(tickClocks, 1000);

  // The .seb file: double-clicking it opens this exam in Safe Exam Browser with the right settings
  function sebFileDialog() {
    const startURL = `${location.origin}${location.pathname}#/take/${encodeURIComponent(cls.id)}/${encodeURIComponent(tid)}`;
    const quitURL = `${location.origin}${location.pathname.replace(/[^/]*$/, '')}seb-quit.html`;
    const pw = newAccessCode();
    const m = modal({
      title: 'Safe Exam Browser file',
      body: `<form data-seb-form novalidate>
        <p>Students double-click this file. Safe Exam Browser opens, locks the computer (no screenshots, Print Screen, other apps or switching) and goes straight to <strong>${esc(test.title)}</strong>.</p>
        ${test.requireSEB ? '' : '<p class="bad small"><strong>This exam doesn\'t require Safe Exam Browser yet</strong>, so students could still use a normal browser. Tick <strong>Require Safe Exam Browser</strong> on the Settings tab.</p>'}
        <label class="field"><span>Quit password (for the proctor)</span><input name="pw" value="${esc(pw)}" maxlength="40" autocomplete="off" spellcheck="false"></label>
        <p class="muted small">Write it down. It's only needed if a student must leave before submitting (a frozen computer). After submitting, students close Safe Exam Browser with the <strong>Quit Safe Exam Browser</strong> button. Leave it empty for no password (iPads need one).</p>
        <p class="bad small" data-seb-err role="alert"></p>
        <div class="row"><button class="btn primary" type="submit">${icon('download')} Download the .seb file</button><button class="btn" type="button" data-seb-cancel>Cancel</button></div>
        <p class="muted small">Post it on Canvas with the student handout. Make a new file for each exam. Try it yourself with a test student first.</p>
      </form>`,
    });
    const f = m.el.querySelector('form');
    m.el.querySelector('[data-seb-cancel]').onclick = () => m.close();
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = f.querySelector('[type=submit]'); btn.disabled = true;
      try {
        const blob = await makeSebFile({ startURL, quitURL, quitPassword: f.elements.pw.value.trim() });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${(test.title || 'exam').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'exam'}.seb`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        m.close();
        toast('Downloaded. Students double-click it to open the exam in Safe Exam Browser.', 'good');
      } catch (err) { f.querySelector('[data-seb-err]').textContent = err?.message || String(err); btn.disabled = false; }
    });
  }
  main.addEventListener('click', async (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.dataset.xtab) { tab = b.dataset.xtab; history.replaceState(null, '', `#/timed/${encodeURIComponent(cls.id)}/${encodeURIComponent(tid)}?tab=${tab}`); showTab(); return; }
    if ('copyLink' in b.dataset) {
      const url = `${location.origin}${location.pathname}#/take/${encodeURIComponent(cls.id)}/${encodeURIComponent(tid)}`;
      try { await navigator.clipboard.writeText(url); toast('Link copied. Students also find the exam on their class page.', 'good'); } catch { modal({ title: 'Student link', body: `<p><input class="wide-input" readonly value="${esc(url)}" onfocus="this.select()"></p>` }); }
      return;
    }
    if ('sebFile' in b.dataset) { sebFileDialog(); return; }
    if ('toggleOff' in b.dataset) {
      const off = !test.disabled, what = KINDS[kindOf(test)].label.toLowerCase();
      if (off) attempts = await cloud.listAttempts(cls.id, tid).catch(() => attempts);
      const working = attempts.filter((a) => a.status === 'open').length;
      const ok = await confirmDialog(off
        ? { title: `Turn off ${test.title}?`, body: `<p>Students won't see this ${what} on their class page and can't start it.${working ? ` <strong>${plural(working, 'student')} ${working === 1 ? 'is' : 'are'} working on it now</strong> and can still finish (use End on the Live tab to stop them).` : ''}</p><p class="muted small">Nothing is deleted. Turn it on again any time.</p>`, confirm: 'Turn off', danger: true }
        : { title: `Turn on ${test.title}?`, body: `<p>Students see it again on their class page and can start it at its times.</p>`, confirm: 'Turn on' });
      if (!ok) return;
      b.disabled = true;
      try { await cloud.setTimedDisabled(cls.id, tid, off); test = { ...test, disabled: off }; paint(); toast(off ? `${test.title} is turned off` : `${test.title} is on again`, 'good'); }
      catch (e) { toast("Couldn't change it: " + (e?.code === 'permission-denied' ? 'publish the latest firestore.rules.' : e?.message || e), 'bad'); }
      b.disabled = false;
      return;
    }
    if (b.dataset.lf) { filter = filter === b.dataset.lf ? 'all' : b.dataset.lf; paint(); return; }
    if ('refresh' in b.dataset) { b.disabled = true; await refresh(); return; }
    if ('showcode' in b.dataset) { const sec = b.dataset.showcode; showCodeBig(sec ? codes.sections[sec] || accessCode : accessCode, sec ? `section ${sec}` : ''); return; }
    if ('newaccess' in b.dataset) {
      const ok = await confirmDialog({ title: 'Make a new access code?', body: '<p>The old code stops working straight away. Students who have already started keep going; anyone who hasn\'t started yet needs the new code.</p><p class="muted small">Useful if the code may have been shared outside the room.</p>', confirm: 'New code' });
      if (!ok) return;
      const code = newAccessCode(), sec = b.dataset.newaccess;
      const next = sec ? { code: accessCode, sections: { ...codes.sections, [sec]: code } } : { code, sections: { ...codes.sections } };
      try { await cloud.setAccessCodes(cls.id, tid, next); codes = next; accessCode = next.code; paint(); toast(`New access code${sec ? ` for section ${sec}` : ''}: ${code}`, 'good'); }
      catch (e) { toast("Couldn't change the code: " + (e?.code === 'permission-denied' ? 'publish the latest firestore.rules.' : e?.message || e), 'bad'); }
      return;
    }
    if (b.dataset.detail) { attemptDetail(b.dataset.detail); return; }
    if (b.dataset.reopen) { reopen(b.dataset.reopen); return; }
    if (b.dataset.newattempt) { newAttemptFor(b.dataset.newattempt); return; }
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
    if ('canvas' in b.dataset) { sendToCanvas(); return; }
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
