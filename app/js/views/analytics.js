// Exam analytics: instructors upload real exam scores (e.g. Midterm 1 before the site existed,
// Midterm 2 after) and see how students who practised here did compared with those who didn't.
// Scores are stored per class and only the class's staff can read them (see firestore.rules).
import { getManifest } from '../data.js';
import * as cloud from '../cloud.js';
import { esc, icon, plural, toast, confirmDialog, toneFor } from '../ui.js';
import { inspectScores, matchScores, suggestMax, commonName, combineSets, looksLikeParts } from '../grades.js';

const DAY = 86400000;
// Practice groups. Colours are the validated categorical slots 1–3 (see css: --grp-*)
const GROUPS = [
  { key: 'regular', label: 'Practised regularly', short: 'Regular', rule: '50+ questions' },
  { key: 'some', label: 'Some practice', short: 'Some', rule: '1–49 questions' },
  { key: 'none', label: 'Signed in, no practice', short: 'Signed in', rule: '' },
  { key: 'never', label: 'Never signed in', short: 'Not in', rule: '' },
];
const USED = (r) => r.group === 'regular' || r.group === 'some';
// Buckets by how many different questions a student solved (answered right at least once)
const BUCKETS = [[1, 24], [25, 49], [50, 99], [100, 199], [200, Infinity]];
const REGULAR = 50;
const mean = (xs) => { const a = xs.filter((x) => x != null && isFinite(x)); return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null; };
const median = (xs) => { const a = xs.filter((x) => x != null && isFinite(x)).sort((p, q) => p - q); if (!a.length) return null; const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
const r1 = (x) => (x == null ? '–' : (Math.round(x * 10) / 10).toString());
const pts = (x) => (x == null ? '–' : `${x > 0 ? '+' : ''}${r1(x)}`);
function pearson(pairs) {
  const p = pairs.filter(([a, b]) => a != null && b != null);
  if (p.length < 5) return null;
  const mx = mean(p.map((x) => x[0])), my = mean(p.map((x) => x[1]));
  let sxy = 0, sxx = 0, syy = 0;
  for (const [a, b] of p) { sxy += (a - mx) * (b - my); sxx += (a - mx) ** 2; syy += (b - my) ** 2; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}
const strength = (r) => (r == null ? '' : Math.abs(r) < 0.1 ? 'no real' : Math.abs(r) < 0.3 ? 'a weak' : Math.abs(r) < 0.5 ? 'a moderate' : 'a strong');
const studied = (x) => (x.seen || 0) > 0 || (x.attempts || 0) > 0 || (x.asgDone || 0) > 0;

// opts.embedded: shown as the "Exam scores" tab of the class dashboard, which owns the class and section choice
export async function render(main, params = {}, query = {}, opts = {}) {
  const embedded = !!opts.embedded;
  if (!embedded) { location.replace(`#/instructor?${query.class ? `class=${encodeURIComponent(query.class)}&` : ''}tab=scores`); return; }
  if (!cloud.enabled) { main.innerHTML = '<section class="page narrow empty-state"><h1>Exam analytics</h1><p>Student sign-in is turned off, so there is no student data.</p></section>'; return; }
  const classes = embedded ? opts.classes : cloud.isAdmin() ? await cloud.listClasses().catch(() => []) : cloud.teachingClasses();
  if (!classes.length) { main.innerHTML = '<section class="page narrow empty-state"><h1>Exam analytics</h1><p>You aren\'t listed as an instructor or TA for any class.</p></section>'; return; }
  const remembered = (k) => { try { return sessionStorage.getItem('qp1:analytics-' + k); } catch { return null; } };
  const remember = (k, v) => { try { sessionStorage.setItem('qp1:analytics-' + k, v); } catch {} };
  let classId = embedded ? opts.classId : [query.class, remembered('class')].find((x) => classes.some((c) => c.id === x)) || classes[0].id;
  const cls = () => classes.find((c) => c.id === classId);
  const myRole = () => cloud.myClasses().find((c) => c.id === classId);
  const mySections = () => { const c = myRole(); return !cloud.isAdmin() && c?.role === 'ta' && (c.sections || []).length ? c.sections : null; };
  const allExams = (await getManifest()).exams.filter((e) => !e.preview);
  const examsOf = () => (cls().exams || []).map((id) => allExams.find((e) => e.id === id)).filter(Boolean);

  let roster = [], sums = [], grades = [], section = embedded ? opts.section || '' : remembered('section') || '';
  let pick = { exam: '', before: '', practice: '' };
  let upload = null; // { text, fileName, info, cols: [column indexes, added together], max, name, date, examId }
  let combine = null; // { ids: [score set ids], name, examId, zero, removeParts }
  let sortKey = 'after', sortDir = -1, xAxis = 'solved', focus = '';

  if (embedded) main.innerHTML = '<section class="analytics an-embedded"><div data-body><p class="muted loading-line">Loading…</p></div></section>';
  else main.innerHTML = `
    <section class="page instructor analytics">
      <header class="inst-head">
        <div>
          <p class="eyebrow">Instructor</p>
          <h1>Exam analytics</h1>
          <p class="muted">Upload real exam scores and see how students who practised on this site did. Scores are visible only to this class's instructors and TAs, never to students.</p>
        </div>
        <div class="row">
          <label class="field inline"><span class="sr-only">Class</span><select data-class>${classes.map((c) => `<option value="${esc(c.id)}" ${c.id === classId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
          <a class="btn" data-dash-link href="#/instructor?class=${encodeURIComponent(classId)}">${icon('grid')} Class dashboard</a>
        </div>
      </header>
      <div data-body><p class="muted loading-line">Loading…</p></div>
    </section>`;
  const body = main.querySelector('[data-body]');

  async function load() {
    body.innerHTML = '<p class="muted loading-line">Loading…</p>';
    try {
      [roster, sums, grades] = await Promise.all([opts.roster || cloud.getRoster(classId), opts.sums || cloud.classSummaries(classId), cloud.listGrades(classId)]);
      opts.onGrades?.(grades);
    } catch (e) {
      body.innerHTML = `<div class="empty-state"><h2>${e?.code === 'permission-denied' ? "You're not on this class's teaching staff" : "Couldn't load the data"}</h2><p>${esc(e?.code === 'permission-denied' ? 'Ask the site admin to add you to the class, and make sure the latest firestore.rules are published.' : e?.message || e)}</p></div>`;
      return;
    }
    const byDate = [...grades];
    pick.exam = grades.some((g) => g.id === pick.exam) ? pick.exam : byDate[byDate.length - 1]?.id || '';
    const ex = grades.find((g) => g.id === pick.exam);
    pick.before = grades.some((g) => g.id === pick.before) && pick.before !== pick.exam ? pick.before : byDate.find((g) => g.id !== pick.exam)?.id || '';
    pick.practice = ex?.examId && examsOf().some((e) => e.id === ex.examId) ? ex.examId : examsOf().some((e) => e.id === pick.practice) ? pick.practice : examsOf()[0]?.id || '';
    paint();
  }

  // ---------- the people this person may see ----------
  const students = (ignoreSection = false) => {
    const allowed = mySections();
    return roster.filter((p) => (!p.role || p.role === 'student')).filter((p) => {
      const secs = String(p.section || '').split(', ').filter(Boolean);
      if (allowed && !secs.some((s) => allowed.includes(s))) return false;
      return ignoreSection || !section || secs.includes(section);
    });
  };
  const sectionList = () => { const allowed = mySections(); return [...new Set(roster.filter((p) => !p.role || p.role === 'student').flatMap((p) => String(p.section || '').split(', ').filter(Boolean)))].filter((s) => !allowed || allowed.includes(s)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })); };

  // One row per student: real scores (as %) + their practice on the chosen platform exam
  function table(ignoreSection = false) {
    const g = grades.find((x) => x.id === pick.exam), gb = grades.find((x) => x.id === pick.before);
    const pctOf = (set) => { const m = new Map(); if (set) for (const s of set.scores || []) m.set(s.email, (s.score / (set.maxPoints || 100)) * 100); return m; };
    const after = pctOf(g), before = pctOf(gb);
    const sum = new Map(sums.filter((x) => x.examId === pick.practice).map((x) => [String(x.email).toLowerCase(), x]));
    // any summary in this class means the student signed in at least once (sign-in writes one)
    const signedIn = new Set(sums.map((x) => String(x.email).toLowerCase()));
    return students(ignoreSection).map((p) => {
      const s = sum.get(String(p.email).toLowerCase());
      const used = s && studied(s);
      const seen = used ? s.seen || 0 : 0;
      const solved = used ? Object.values(s.qs || {}).filter((q) => (q?.[0] || 0) > 0).length : 0;
      const group = used ? (seen >= REGULAR ? 'regular' : 'some') : signedIn.has(String(p.email).toLowerCase()) ? 'none' : 'never';
      const a = after.get(p.email) ?? null, b = before.get(p.email) ?? null;
      return { email: p.email, name: p.name, section: p.section || '', after: a, before: b, change: a != null && b != null ? a - b : null, group, seen, solved, accuracy: used ? s.accuracy ?? null : null, quizzes: used ? s.attempts || 0 : 0, readiness: used ? s.readiness ?? null : null, timed: used ? s.realExamBest ?? null : null, asgDone: used ? s.asgDone || 0 : 0 };
    });
  }

  const ordinal = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
  const showFocus = () => { const el = body.querySelector('[data-an-student-panel]'); if (el) { el.scrollIntoView({ block: 'start', behavior: 'smooth' }); el.focus({ preventScroll: true }); } };

  // ---------- painting ----------
  function paint() {
    const secs = sectionList();
    if (section && !secs.includes(section)) section = '';
    const allowed = mySections();
    const tabs = !embedded && secs.length > 1 ? `<div class="sec-tabs" role="tablist" aria-label="Section">${[['', allowed ? 'All my sections' : 'All sections'], ...secs.map((s) => [s, s])].map(([v, l]) => `<button role="tab" data-section-tab="${esc(v)}" aria-selected="${v === section}">${esc(l)}</button>`).join('')}</div>` : '';
    body.innerHTML = tabs + scoresPanel() + (upload ? uploadPanel() : '') + (combine ? combinePanel() : '') + (grades.length ? analysis() : `<div class="empty-state an-empty"><h2>No exam scores yet</h2><p>Upload the scores of an exam (for example Midterm 1, from before students had this site, and Midterm 2) to compare how students who practised here did.</p></div>`);
    bindChart();
  }

  function scoresPanel() {
    const avg = (g) => mean((g.scores || []).map((s) => (s.score / (g.maxPoints || 100)) * 100));
    const pe = (id) => allExams.find((e) => e.id === id)?.title;
    return `
      <section class="an-panel">
        <div class="an-panel-head"><h2>Exam scores</h2>${upload || combine ? '' : `<span class="row">${grades.length > 1 ? `<button class="btn" data-combine>${icon('grid')} Combine parts</button>` : ''}<button class="btn primary" data-upload>${icon('upload')} Upload scores</button></span>`}</div>
        ${grades.length ? `<ul class="an-sets">${grades.map((g) => `
          <li>
            <span class="an-set-main"><strong>${esc(g.name)}</strong><span class="muted small">${plural(g.count || (g.scores || []).length, 'student')} · out of ${r1(g.maxPoints)} · average ${r1(avg(g))}%${g.date ? ' · ' + esc(g.date) : ''}${g.examId && pe(g.examId) ? ' · practice: ' + esc(pe(g.examId)) : ' · before the site / no practice exam'}</span></span>
            <span class="row"><button class="btn small" data-replace="${esc(g.id)}">Replace</button><button class="btn small danger-outline" data-del-grades="${esc(g.id)}" data-name="${esc(g.name)}">${icon('trash')}<span class="sr-only">Delete ${esc(g.name)}</span></button></span>
          </li>`).join('')}</ul>` : '<p class="muted small">Nothing uploaded yet. A Canvas gradebook export works as it is: Grades → Export → Export Entire Gradebook.</p>'}
        ${grades.length > 1 && !combine ? '<p class="muted small">Exam in parts (for example <em>Midterm 1 MC</em> and <em>Midterm 1 FR</em>)? Use <strong>Combine parts</strong> to add them up into one exam.</p>' : ''}
      </section>`;
  }

  // ---------- combining uploaded parts of one exam into one ----------
  function combinePanel() {
    const c = combine;
    const sets = grades.filter((g) => c.ids.includes(g.id));
    const res = sets.length > 1 ? combineSets(sets, { missingAsZero: c.zero }) : null;
    const nameOf = (e) => roster.find((p) => String(p.email).toLowerCase() === e)?.name || e;
    const avg = res ? mean(res.scores.map((x) => (x.score / res.maxPoints) * 100)) : null;
    return `
      <section class="an-panel combine-panel" data-combine-panel>
        <h2>Combine parts into one exam</h2>
        <p class="muted small">Tick the parts of the same exam. Each student's points are added up, and so are the "out of" points.</p>
        <fieldset class="an-picklist"><legend class="sr-only">Parts to combine</legend>
          ${grades.map((g) => `<label class="check"><input type="checkbox" data-comb-id="${esc(g.id)}" ${c.ids.includes(g.id) ? 'checked' : ''}><span><strong>${esc(g.name)}</strong> <span class="muted small">out of ${r1(g.maxPoints)} · ${plural((g.scores || []).length, 'student')}</span></span></label>`).join('')}
        </fieldset>
        ${sets.length > 1 ? `
          <div class="an-form">
            <label class="field"><span>Name of the whole exam</span><input data-comb-name value="${esc(c.name)}" maxlength="80" placeholder="Midterm 1"></label>
            <label class="field"><span>Practice on this site for it</span><select data-comb-exam><option value="">None (before the site)</option>${examsOf().map((e) => `<option value="${esc(e.id)}" ${e.id === c.examId ? 'selected' : ''}>${esc(e.title)}</option>`).join('')}</select></label>
          </div>
          ${looksLikeParts(sets.map((g) => g.name)) ? '' : `<p class="bad small" role="note">${icon('x')} These names don't look like parts of one exam (for example "Midterm 1 MC" and "Midterm 1 FR"). Check the ticks before combining.</p>`}
          <div class="an-check ${res.scores.length ? 'pr-good' : 'pr-bad'}">
            <p><strong>${icon(res.scores.length ? 'check' : 'x')} ${plural(res.scores.length, 'student')}</strong> · out of ${r1(res.maxPoints)} (${sets.map((g) => r1(g.maxPoints)).join(' + ')})${avg != null ? ` · average ${r1(avg)}%` : ''}</p>
            ${res.partial.length ? `<details><summary>${plural(res.partial.length, 'student')} ${res.partial.length === 1 ? 'has' : 'have'} a score for only some parts${c.zero ? ' (missing parts count as 0)' : ' (left out)'}</summary><ul class="small">${res.partial.map((x) => `<li>${esc(nameOf(x.email))}: ${x.parts.map((v, k) => `${esc(sets[k].name)} ${v == null ? '<span class="bad">missing</span>' : r1(v)}`).join(', ')}</li>`).join('')}</ul></details>
              <label class="check"><input type="checkbox" data-comb-zero ${c.zero ? 'checked' : ''}><span>Count a missing part as 0</span></label>` : ''}
          </div>
          <label class="check"><input type="checkbox" data-comb-remove ${c.removeParts ? 'checked' : ''}><span>Remove the separate parts after combining (recommended, so they don't show twice)</span></label>` : '<p class="muted">Tick at least two parts.</p>'}
        <div class="row end upload-actions"><button class="btn" data-comb-cancel>Cancel</button><button class="btn primary" data-comb-save ${res && res.scores.length ? '' : 'disabled'}>${icon('check')} Combine</button></div>
      </section>`;
  }
  // likely parts of one exam: names that start the same, e.g. "Midterm 1 MC" / "Midterm 1 FR"
  function guessParts() {
    let best = [];
    for (const g of grades) {
      const same = grades.filter((x) => x.id !== g.id && looksLikeParts([g.name, x.name]));
      const group = [g, ...same];
      if (group.length > best.length && looksLikeParts(group.map((x) => x.name))) best = group;
    }
    return best.map((x) => x.id);
  }
  function startCombine() {
    const ids = guessParts();
    const sets = grades.filter((g) => ids.includes(g.id));
    combine = { ids, name: commonName(sets.map((g) => g.name)), nameAuto: true, examId: sets.find((g) => g.examId)?.examId || '', zero: false, removeParts: true };
    upload = null;
    paint();
    body.querySelector('[data-combine-panel]')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
  async function saveCombine() {
    const c = combine;
    const sets = grades.filter((g) => c.ids.includes(g.id));
    const name = (body.querySelector('[data-comb-name]')?.value || '').trim();
    if (!name) { toast('Give the exam a name, for example Midterm 1', 'bad'); body.querySelector('[data-comb-name]')?.focus(); return; }
    const res = combineSets(sets, { missingAsZero: c.zero });
    const btn = body.querySelector('[data-comb-save]'); btn.disabled = true; btn.textContent = 'Saving…';
    try {
      const date = sets.map((g) => g.date).filter(Boolean).sort()[0] || '';
      const id = await cloud.saveGrades(classId, { name, maxPoints: res.maxPoints, date, examId: c.examId || '', scores: res.scores, source: 'combined: ' + sets.map((g) => g.name).join(' + ') });
      if (c.removeParts) for (const g of sets) await cloud.deleteGrades(classId, g.id).catch(() => toast(`Combined, but "${g.name}" couldn't be removed. Delete it from the list.`, 'bad'));
      toast(`${name}: ${plural(res.scores.length, 'score')} saved`, 'good');
      combine = null; pick.exam = id; pick.before = '';
      await load();
    } catch (e) {
      toast("Couldn't save: " + (e?.code === 'permission-denied' ? "you're not on this class's teaching staff." : e?.message || e), 'bad');
      btn.disabled = false; btn.innerHTML = `${icon('check')} Combine`;
    }
  }

  function uploadPanel() {
    const u = upload;
    let preview = '';
    if (u.error) preview = `<p class="bad">${esc(u.error)}</p>`;
    else if (u.info) {
      const m = matchScores(u.info, u.cols, roster, cloud.domain || 'sdsu.edu', { missingAsZero: u.zero });
      u.match = m;
      const avg = mean(m.matched.map((x) => (x.score / (u.max || 100)) * 100));
      const over = m.matched.filter((x) => x.score > u.max).length;
      preview = `
        <div class="an-form">
          <label class="field"><span>Exam name</span><input data-up-name value="${esc(u.name)}" maxlength="80" placeholder="Midterm 1"></label>
          <fieldset class="field an-cols"><legend>Score column <span class="muted">(tick more than one to add parts together, e.g. MC + FR)</span></legend>
            <div class="an-picklist">${u.info.scoreCols.map((c) => `<label class="check"><input type="checkbox" data-up-col="${c.index}" ${u.cols.includes(c.index) ? 'checked' : ''}><span>${esc(c.header)}${c.possible ? ` <span class="muted small">(${r1(c.possible)} pts)</span>` : ''}${c.summary ? ' <span class="muted small">(course total)</span>' : ''}</span></label>`).join('')}</div>
            ${(() => { const sib = siblings(u); return sib.length ? `<p class="small an-sib">${icon('bulb')} This exam seems to have parts: ${sib.map((i) => `<strong>${esc(colName(u, i))}</strong>`).join(', ')}. <button class="link-btn" data-up-addparts>Add them together</button></p>` : ''; })()}
          </fieldset>
          <label class="field"><span>Out of (points)</span><input type="number" min="1" step="any" data-up-max value="${esc(u.max)}"></label>
          <label class="field"><span>Exam date <span class="muted">(optional)</span></span><input type="date" data-up-date value="${esc(u.date || '')}"></label>
          <label class="field"><span>Practice on this site for it</span><select data-up-exam><option value="">None (before the site)</option>${examsOf().map((e) => `<option value="${esc(e.id)}" ${e.id === u.examId ? 'selected' : ''}>${esc(e.title)}</option>`).join('')}</select></label>
        </div>
        <div class="an-check ${m.matched.length ? 'pr-good' : 'pr-bad'}">
          <p><strong>${m.matched.length ? icon('check') : icon('x')} ${plural(m.matched.length, 'score')} matched to students on the roster</strong>${m.matched.length ? ` · average ${r1(avg)}%` : ''}</p>
          ${m.partial.length ? `<details><summary>${plural(m.partial.length, 'student')} ${m.partial.length === 1 ? 'has' : 'have'} a score for only some parts${u.zero ? ' (missing parts count as 0)' : ' (left out)'}</summary><ul class="small">${m.partial.map((x) => `<li>${esc(x.name || x.email)}: ${x.parts.map((v, k) => `${esc(colName(u, u.cols[k]))} ${v == null ? '<span class="bad">missing</span>' : r1(v)}`).join(', ')}</li>`).join('')}</ul></details>
            <label class="check"><input type="checkbox" data-up-zero ${u.zero ? 'checked' : ''}><span>Count a missing part as 0</span></label>` : ''}
          ${over ? `<p class="bad small">${plural(over, 'score')} ${over === 1 ? 'is' : 'are'} above ${r1(u.max)}. Check "Out of".</p>` : ''}
          ${m.unmatched.length ? `<details><summary>${plural(m.unmatched.length, 'row')} not matched to anyone on the roster (left out)</summary><ul class="small">${m.unmatched.slice(0, 50).map((x) => `<li>Line ${x.line}: ${esc(x.who)}${x.score != null ? ` (${r1(x.score)})` : ''}</li>`).join('')}</ul></details>` : ''}
          ${m.blank.length ? `<details><summary>${plural(m.blank.length, 'student')} with no score (blank or excused)</summary><ul class="small">${m.blank.map((x) => `<li>${esc(x.name)}</li>`).join('')}</ul></details>` : ''}
          ${m.dupes.length ? `<details><summary>${plural(m.dupes.length, 'student')} listed twice (the later row was kept)</summary><ul class="small">${m.dupes.map((x) => `<li>${esc(x.name)}: ${r1(x.was)} → ${r1(x.kept)} (line ${x.line})</li>`).join('')}</ul></details>` : ''}
          ${m.missing.length ? `<details><summary>${plural(m.missing.length, 'roster student')} not in the file</summary><ul class="small">${m.missing.map((x) => `<li>${esc(x.name || x.email)}</li>`).join('')}</ul></details>` : ''}
        </div>`;
    }
    return `
      <section class="an-panel upload-panel">
        <h2>${u.replaceId ? 'Replace scores' : 'Upload scores'}</h2>
        <p class="muted small">A CSV or a sheet copied from Excel or Google Sheets. Students are matched by email, SIS Login ID, SIS User ID (RedID) or name. The Canvas gradebook export works directly: choose the exam's column below.</p>
        <div class="dropzone" data-drop="scores">
          <p class="drop-hint">${icon('upload')} <strong>Drag the CSV here</strong> <span class="muted">or</span></p>
          <div class="row center"><label class="btn">Choose CSV<input type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" data-scores-file hidden></label></div>
          <p class="muted small drop-name">${esc(u.fileName || '')}</p>
        </div>
        <details class="paste-box"><summary>…or paste the rows</summary><textarea rows="6" data-scores-paste spellcheck="false" placeholder="Email,Score&#10;student@sdsu.edu,87">${esc(u.pasted || '')}</textarea></details>
        <div data-up-preview aria-live="polite">${preview}</div>
        <div class="row end upload-actions"><button class="btn" data-up-cancel>Cancel</button><button class="btn primary" data-up-save ${u.info && u.match?.matched.length ? '' : 'disabled'}>${icon('check')} Save scores</button></div>
      </section>`;
  }

  function analysis() {
    const rows = table();
    const g = grades.find((x) => x.id === pick.exam), gb = grades.find((x) => x.id === pick.before);
    const scored = rows.filter((r) => r.after != null);
    const by = (k) => scored.filter((r) => r.group === k);
    const stat = GROUPS.map((G) => { const xs = by(G.key); const paired = xs.filter((r) => r.change != null); return { ...G, n: xs.length, avg: mean(xs.map((r) => r.after)), med: median(xs.map((r) => r.after)), before: mean(paired.map((r) => r.before)), afterPaired: mean(paired.map((r) => r.after)), change: mean(paired.map((r) => r.change)), nPaired: paired.length }; });
    const usersAvg = mean(scored.filter(USED).map((r) => r.after));
    const nonUsers = scored.filter((r) => !USED(r));
    const noneAvg = mean(nonUsers.map((r) => r.after));
    const rSeen = pearson(scored.filter(USED).map((r) => [r.seen, r.after]));
    const rSolved = pearson(scored.filter(USED).map((r) => [r.solved, r.after]));
    const rReady = pearson(scored.filter(USED).map((r) => [r.readiness, r.after]));
    const usersChange = mean(scored.filter((r) => USED(r) && r.change != null).map((r) => r.change));
    const noneChange = mean(nonUsers.filter((r) => r.change != null).map((r) => r.change));
    const sIn = stat.find((x) => x.key === 'none'), sNever = stat.find((x) => x.key === 'never');
    const practice = allExams.find((e) => e.id === pick.practice)?.title || 'the practice exam';
    const opt = (sel, list, none) => (none ? `<option value="">${none}</option>` : '') + list.map((x) => `<option value="${esc(x.id)}" ${x.id === sel ? 'selected' : ''}>${esc(x.name || x.title)}</option>`).join('');
    const findings = [];
    if (usersAvg != null && noneAvg != null) findings.push(`<li><strong>Students who practised on the site averaged ${r1(usersAvg)}% on ${esc(g.name)}</strong>, against ${r1(noneAvg)}% for those who didn't practise: <strong>${pts(usersAvg - noneAvg)} points</strong>.</li>`);
    if (sIn.n && sNever.n) findings.push(`<li>Of the students who didn't practise, those who <strong>signed in</strong> averaged ${r1(sIn.avg)}% (${plural(sIn.n, 'student')}) and those who <strong>never signed in</strong> ${r1(sNever.avg)}% (${plural(sNever.n, 'student')}).</li>`);
    else if (usersAvg != null) findings.push(`<li>Students who used the site averaged <strong>${r1(usersAvg)}%</strong> on ${esc(g.name)}. Everyone with a score used the site, so there's no comparison group.</li>`);
    if (gb && usersChange != null && noneChange != null) findings.push(`<li><strong>From ${esc(gb.name)} to ${esc(g.name)}</strong>, students who practised changed by <strong>${pts(usersChange)} points</strong> on average, and those who didn't practise by <strong>${pts(noneChange)}</strong>. Comparing each student with themselves is the fairest comparison here.</li>`);
    const small = stat.filter((x) => x.n > 0 && x.n < 5);
    if (small.length) findings.push(`<li class="muted">${small.map((x) => `${esc(x.label)} has only ${plural(x.n, 'student')}`).join('; ')}, so treat ${small.length > 1 ? 'those groups' : 'that group'} with care.</li>`);
    if (rSolved != null) findings.push(`<li>Among students who practised, the number of questions they <strong>solved</strong> has <strong>${strength(rSolved)} ${rSolved >= 0 ? 'positive' : 'negative'} link</strong> with the score (r = ${rSolved.toFixed(2)}). Questions tried: r = ${rSeen?.toFixed(2) ?? '–'}.${rReady != null ? ` Quiz readiness: r = ${rReady.toFixed(2)}.` : ''}</li>`);
    return `
      <section class="an-panel">
        <div class="an-panel-head"><h2>Analysis</h2></div>
        <div class="an-controls">
          <label class="field"><span>Exam</span><select data-pick="exam">${opt(pick.exam, grades)}</select></label>
          <label class="field"><span>Compare with (earlier exam)</span><select data-pick="before">${opt(pick.before, grades.filter((x) => x.id !== pick.exam), 'Nothing')}</select></label>
          <label class="field"><span>Practice measured on</span><select data-pick="practice">${opt(pick.practice, examsOf())}</select></label>
        </div>
        <p class="muted small">Groups use practice on <strong>${esc(practice)}</strong>: practised regularly = ${REGULAR}+ questions tried, some practice = 1–${REGULAR - 1}, signed in = signed in but tried no questions, never signed in = never opened the site. A question counts as <em>solved</em> once it was answered right at least once. ${plural(scored.length, 'student')} ${section ? `in ${esc(section)} ` : ''}have a score for ${esc(g.name)}.</p>
        ${findings.length ? `<ul class="an-findings">${findings.join('')}</ul>` : ''}
        <div class="an-grid">
          <figure class="an-fig"><figcaption><strong>Average score on ${esc(g.name)}</strong><span class="muted small">by how much students practised</span></figcaption>${barChart(stat)}</figure>
          ${gb ? `<figure class="an-fig"><figcaption><strong>${esc(gb.name)} → ${esc(g.name)}</strong><span class="muted small">average of the same students on both exams</span></figcaption>${slopeChart(stat, gb.name, g.name)}</figure>` : ''}
        </div>
        ${solvedPanel(scored, g, gb)}
        <figure class="an-fig an-fig-wide"><figcaption><strong>Questions ${xAxis === 'solved' ? 'solved' : 'tried'} and score on ${esc(g.name)}</strong><span class="muted small">one dot per student · hover for details</span>
          <span class="seg" role="group" aria-label="Horizontal axis">${[['solved', 'Solved'], ['seen', 'Tried']].map(([k, l]) => `<button data-xaxis="${k}" aria-pressed="${xAxis === k}">${l}</button>`).join('')}</span></figcaption>${scatter(scored)}</figure>
        <details class="ov-table-toggle"><summary>Show the chart numbers as a table</summary>
          <div class="table-wrap" tabindex="0" role="region" aria-label="Averages by group"><table class="inst-table compact"><thead><tr><th>Group</th><th>Students</th><th>Average on ${esc(g.name)}</th><th>Median</th>${gb ? `<th>Same students: ${esc(gb.name)}</th><th>Same students: ${esc(g.name)}</th><th>Change</th>` : ''}</tr></thead>
          <tbody>${stat.map((x) => `<tr><td>${esc(x.label)}</td><td>${x.n}</td><td>${r1(x.avg)}%</td><td>${r1(x.med)}%</td>${gb ? `<td>${r1(x.before)}%</td><td>${r1(x.afterPaired)}%</td><td>${pts(x.change)} <span class="muted small">(${x.nPaired})</span></td>` : ''}</tr>`).join('')}</tbody></table></div>
        </details>
        <p class="muted small an-caveat">These show a link, not proof: students who choose to practise may also study more in other ways. Comparing each student's change between exams helps, because it compares students with themselves.</p>
      </section>
      ${!section && sectionList().length > 1 ? sectionTable(rows) : ''}
      ${focus ? studentPanel() : ''}
      ${studentTable(rows)}`;
  }

  function sectionTable(rows) {
    const gb = grades.find((x) => x.id === pick.before);
    const lines = sectionList().map((sec) => {
      const rs = rows.filter((r) => r.section.split(', ').includes(sec) && r.after != null);
      const users = rs.filter(USED);
      return { sec, n: rs.length, avg: mean(rs.map((r) => r.after)), used: rs.length ? users.length / rs.length : null, uAvg: mean(users.map((r) => r.after)), nAvg: mean(rs.filter((r) => !USED(r)).map((r) => r.after)), change: mean(rs.filter((r) => r.change != null).map((r) => r.change)) };
    });
    return `
      <section class="an-panel">
        <h2>By section</h2>
        <div class="table-wrap inst-table-wrap ov-classes" tabindex="0" role="region" aria-label="Scores by section"><table class="inst-table">
          <thead><tr><th>Section</th><th>With a score</th><th>Average</th><th>Practised</th><th>Average: used</th><th>Average: didn't practise</th>${gb ? `<th>Change since ${esc(gb.name)}</th>` : ''}</tr></thead>
          <tbody>${lines.map((x) => `<tr><td><button class="link-btn" data-section-tab="${esc(x.sec)}">${esc(x.sec)}</button></td><td data-label="With a score">${x.n}</td><td data-label="Average">${r1(x.avg)}%</td><td data-label="Practised">${x.used == null ? '–' : Math.round(x.used * 100) + '%'}</td><td data-label="Average: used">${r1(x.uAvg)}%</td><td data-label="Average: didn't practise">${r1(x.nAvg)}%</td>${gb ? `<td data-label="Change">${pts(x.change)}</td>` : ''}</tr>`).join('')}</tbody>
        </table></div>
      </section>`;
  }

  // Score by how many different questions students solved, every student with a score in one row
  function solvedPanel(scored, g, gb) {
    const rows = [
      { label: 'Never signed in', xs: scored.filter((r) => r.group === 'never') },
      { label: 'Signed in, 0 solved', xs: scored.filter((r) => r.group !== 'never' && r.solved === 0) },
      ...BUCKETS.map(([a, b]) => ({ label: b === Infinity ? `${a}+ solved` : `${a}–${b} solved`, xs: scored.filter((r) => r.solved >= a && r.solved <= b) })),
    ].map((x) => ({ ...x, n: x.xs.length, avg: mean(x.xs.map((r) => r.after)), med: median(x.xs.map((r) => r.after)), change: mean(x.xs.filter((r) => r.change != null).map((r) => r.change)), nPaired: x.xs.filter((r) => r.change != null).length }));
    return `
      <figure class="an-fig an-fig-wide"><figcaption><strong>Score on ${esc(g.name)} by questions solved</strong><span class="muted small">every student with a score, grouped by how many different questions they solved on the site</span></figcaption>
        <div class="table-wrap" tabindex="0" role="region" aria-label="Score by questions solved"><table class="inst-table compact an-solved">
          <thead><tr><th scope="col">Questions solved</th><th scope="col">Students</th><th scope="col">Average on ${esc(g.name)}</th><th scope="col">Median</th>${gb ? `<th scope="col">Change since ${esc(gb.name)}</th>` : ''}</tr></thead>
          <tbody>${rows.map((x) => `<tr${x.n ? '' : ' class="muted"'}><th scope="row">${esc(x.label)}</th><td data-label="Students">${x.n}</td>
            <td data-label="Average"><span class="an-meter"><span class="an-meter-bar" style="width:${x.avg == null ? 0 : Math.max(0, Math.min(100, x.avg))}%"></span></span>${r1(x.avg)}${x.avg == null ? '' : '%'}</td>
            <td data-label="Median">${r1(x.med)}${x.med == null ? '' : '%'}</td>${gb ? `<td data-label="Change">${x.change == null ? '–' : `<span class="${x.change >= 0 ? 'good' : 'bad'}">${pts(x.change)}</span> <span class="muted small">(${x.nPaired})</span>`}</td>` : ''}</tr>`).join('')}</tbody>
        </table></div></figure>`;
  }

  // One student next to the whole class (everyone this person may see) and next to their own section
  function studentPanel() {
    const all = table(true);
    const me = all.find((r) => r.email === focus);
    if (!me) return '';
    const mySecs = me.section.split(', ').filter(Boolean);
    const inSec = (r) => r.section.split(', ').some((x) => mySecs.includes(x));
    const secRows = all.filter(inSec);
    const secName = mySecs.join(', ') || 'no section';
    const pct = (set, email) => { const x = (set.scores || []).find((y) => y.email === email); return x ? (x.score / (set.maxPoints || 100)) * 100 : null; };
    const examLine = (set) => {
      const mine = pct(set, me.email);
      const cl = all.map((r) => pct(set, r.email)).filter((v) => v != null), sc = secRows.map((r) => pct(set, r.email)).filter((v) => v != null);
      const rank = mine == null ? null : cl.filter((v) => v > mine).length + 1;
      return { set, mine, cAvg: mean(cl), sAvg: mean(sc), rank, of: cl.length, sRank: mine == null ? null : sc.filter((v) => v > mine).length + 1, sOf: sc.length };
    };
    const lines = grades.map(examLine);
    const g = grades.find((x) => x.id === pick.exam), gb = grades.find((x) => x.id === pick.before);
    const chg = (rs) => mean(rs.filter((r) => r.change != null).map((r) => r.change));
    const practised = (rs) => rs.filter(USED);
    const med = (rs, k) => median(practised(rs).map((r) => r[k]));
    const G = Object.fromEntries(GROUPS.map((x) => [x.key, x]));
    const vs = (mine, other) => (mine == null || other == null ? '' : ` <span class="${mine - other >= 0 ? 'good' : 'bad'} small">(${pts(mine - other)})</span>`);
    const L = lines.find((x) => x.set.id === pick.exam);
    const says = [];
    if (L?.mine != null) says.push(`On ${esc(g.name)}, ${esc(me.name || me.email)} scored <strong>${r1(L.mine)}%</strong>: ${pts(L.mine - L.cAvg)} points against the class average and ${pts(L.mine - L.sAvg)} against ${esc(secName)}. That is ${ordinal(L.rank)} of ${L.of} ${mySections() ? 'in your sections' : 'in the class'}.`);
    else says.push(`${esc(me.name || me.email)} has no score for ${esc(g.name)}.`);
    if (gb && me.change != null) says.push(`From ${esc(gb.name)} they changed by <strong>${pts(me.change)} points</strong>; the class changed by ${pts(chg(all))} on average and ${esc(secName)} by ${pts(chg(secRows))}.`);
    says.push(me.group === 'never' ? 'They have never signed in to the site.' : me.group === 'none' ? `They signed in but haven't practised ${esc(allExams.find((e) => e.id === pick.practice)?.title || 'this exam')}.` : `They tried ${me.seen} questions and solved ${me.solved}; the class median for students who practised is ${r1(med(all, 'seen'))} tried and ${r1(med(all, 'solved'))} solved.`);
    const prow = (label, k, fmt = (v) => r1(v)) => `<tr><th scope="row">${label}</th><td data-label="${esc(me.name || 'Student')}"><strong>${me[k] == null ? '–' : fmt(me[k])}</strong></td><td data-label="Class median">${fmt(med(all, k)) ?? '–'}</td><td data-label="${esc(secName)} median">${fmt(med(secRows, k)) ?? '–'}</td></tr>`;
    return `
      <section class="an-panel an-student" data-an-student-panel tabindex="-1" aria-label="Student comparison">
        <div class="an-panel-head"><h2>${esc(me.name || me.email)} <span class="grp-chip grp-${me.group}">${esc(G[me.group].label)}</span></h2><button class="btn" data-an-close>${icon('x')} Close</button></div>
        <p class="muted small">${esc(me.email)} · ${esc(secName)} · compared with the ${mySections() ? 'students in your sections' : 'whole class'} (${all.length}) and with ${esc(secName)} (${secRows.length})</p>
        <ul class="an-findings">${says.map((x) => `<li>${x}</li>`).join('')}</ul>
        <div class="an-grid">
          <div><h3 class="an-h3">Exam scores</h3><div class="table-wrap" tabindex="0" role="region" aria-label="Exam scores compared"><table class="inst-table compact">
            <thead><tr><th scope="col">Exam</th><th scope="col">Student</th><th scope="col">Class avg</th><th scope="col">${esc(secName)} avg</th><th scope="col">Rank</th></tr></thead>
            <tbody>${lines.map((x) => `<tr><th scope="row">${esc(x.set.name)}</th><td data-label="Student"><strong>${x.mine == null ? '–' : r1(x.mine) + '%'}</strong></td><td data-label="Class avg">${r1(x.cAvg)}%${vs(x.mine, x.cAvg)}</td><td data-label="Section avg">${r1(x.sAvg)}%${vs(x.mine, x.sAvg)}</td><td data-label="Rank">${x.rank ? `${ordinal(x.rank)} of ${x.of} <span class="muted small">· ${ordinal(x.sRank)} of ${x.sOf} in section</span>` : '–'}</td></tr>`).join('')}</tbody>
          </table></div></div>
          <div><h3 class="an-h3">Practice on the site</h3><div class="table-wrap" tabindex="0" role="region" aria-label="Practice compared"><table class="inst-table compact">
            <thead><tr><th scope="col"><span class="sr-only">Measure</span></th><th scope="col">Student</th><th scope="col">Class median</th><th scope="col">${esc(secName)} median</th></tr></thead>
            <tbody>${prow('Questions tried', 'seen')}${prow('Questions solved', 'solved')}${prow('Accuracy', 'accuracy', (v) => (v == null ? null : Math.round(v * 100) + '%'))}${prow('Quizzes', 'quizzes')}${prow('Readiness', 'readiness')}${prow('Best timed test', 'timed', (v) => (v == null ? null : r1(v) + '%'))}</tbody>
          </table></div><p class="muted small">Medians are of students who practised.</p></div>
        </div>
      </section>`;
  }

  const COLS = [
    ['name', 'Student', (r) => (r.name || '').toLowerCase()], ['section', 'Section', (r) => r.section], ['before', 'Earlier exam', (r) => r.before ?? -1], ['after', 'Exam', (r) => r.after ?? -1],
    ['change', 'Change', (r) => r.change ?? -999], ['group', 'Practice', (r) => ({ regular: 3, some: 2, none: 1, never: 0 })[r.group]], ['seen', 'Tried', (r) => r.seen], ['solved', 'Solved', (r) => r.solved], ['readiness', 'Readiness', (r) => r.readiness ?? -1], ['timed', 'Best timed test', (r) => r.timed ?? -1],
  ];
  function studentTable(rows) {
    const g = grades.find((x) => x.id === pick.exam), gb = grades.find((x) => x.id === pick.before);
    const cols = COLS.filter(([k]) => gb || (k !== 'before' && k !== 'change'));
    const col = cols.find((c) => c[0] === sortKey) || cols[3];
    const cmp = (x, y) => (typeof x === 'string' ? x.localeCompare(y, undefined, { numeric: true }) : x - y);
    const list = [...rows].sort((a, b) => cmp(col[2](a), col[2](b)) * sortDir || (a.name || '').localeCompare(b.name || ''));
    const head = (k, l) => (k === 'after' ? esc(g.name) : k === 'before' ? esc(gb.name) : l);
    const G = Object.fromEntries(GROUPS.map((x) => [x.key, x]));
    return `
      <section class="an-panel">
        <div class="an-panel-head"><h2>Students</h2><div class="row">
          <label class="field inline"><span class="sr-only">Look at one student</span><select data-an-focus><option value="">Look at one student…</option>${[...rows].sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email)).map((r) => `<option value="${esc(r.email)}" ${r.email === focus ? 'selected' : ''}>${esc(r.name || r.email)}${r.section ? ' · ' + esc(r.section) : ''}</option>`).join('')}</select></label>
          <button class="btn" data-an-csv>${icon('download')} CSV</button></div></div>
        <p class="muted small">Click a name to compare that student with the class and their section.</p>
        <div class="table-wrap inst-table-wrap"><table class="inst-table">
          <thead><tr>${cols.map(([k, l]) => `<th scope="col" aria-sort="${k === col[0] ? (sortDir > 0 ? 'ascending' : 'descending') : 'none'}"><button data-an-sort="${k}">${head(k, l)}${k === col[0] ? (sortDir > 0 ? ' ▲' : ' ▼') : ''}</button></th>`).join('')}</tr></thead>
          <tbody>${list.map((r) => `<tr>
            <td><button class="link-btn" data-an-student="${esc(r.email)}">${esc(r.name || r.email)}</button><span class="muted small block">${esc(r.email)}</span></td>
            <td data-label="Section">${esc(r.section || '–')}</td>
            ${gb ? `<td data-label="${esc(gb.name)}">${r.before == null ? '<span class="muted">–</span>' : r1(r.before) + '%'}</td>` : ''}
            <td data-label="${esc(g.name)}">${r.after == null ? '<span class="muted">no score</span>' : `<strong>${r1(r.after)}%</strong>`}</td>
            ${gb ? `<td data-label="Change">${r.change == null ? '–' : `<span class="${r.change >= 0 ? 'good' : 'bad'}">${pts(r.change)}</span>`}</td>` : ''}
            <td data-label="Practice"><span class="grp-chip grp-${r.group}">${esc(G[r.group].short)}</span></td>
            <td data-label="Tried">${r.seen}</td>
            <td data-label="Solved">${r.solved}</td>
            <td data-label="Readiness">${r.readiness ?? '–'}</td>
            <td data-label="Best timed test">${r.timed != null ? r.timed + '%' : '–'}</td>
          </tr>`).join('') || `<tr><td colspan="${cols.length}" class="muted">No students.</td></tr>`}</tbody>
        </table></div>
      </section>`;
  }

  // ---------- charts (single axis, thin marks, direct labels, hover details) ----------
  function barChart(stat) {
    const W = 420, H = 240, padL = 34, padB = 46, padT = 22, ih = H - padT - padB;
    const bw = 64, gap = (W - padL - stat.length * bw) / (stat.length + 1);
    const y = (v) => padT + ih - (v / 100) * ih;
    return `<div class="an-chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Average score by practice group: ${stat.map((x) => `${x.label} ${r1(x.avg)}% (${x.n} students)`).join(', ')}">
      ${[0, 25, 50, 75, 100].map((v) => `<line class="ov-grid" x1="${padL}" x2="${W - 4}" y1="${y(v)}" y2="${y(v)}"/><text class="ov-tick" x="${padL - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join('')}
      ${stat.map((x, i) => {
        const bx = padL + gap + i * (bw + gap), h = x.avg == null ? 0 : (x.avg / 100) * ih, r = Math.min(4, h);
        const bar = h > 0 ? `<path class="grp-fill grp-${x.key}" d="M${bx},${padT + ih} V${padT + ih - h + r} Q${bx},${padT + ih - h} ${bx + r},${padT + ih - h} H${bx + bw - r} Q${bx + bw},${padT + ih - h} ${bx + bw},${padT + ih - h + r} V${padT + ih} Z"/>` : '';
        return `<g class="an-hit" data-tip="${esc(x.label)}: average ${r1(x.avg)}% · median ${r1(x.med)}% · ${plural(x.n, 'student')}">${bar}
          <text class="an-val" x="${bx + bw / 2}" y="${padT + ih - h - 6}" text-anchor="middle">${x.avg == null ? '–' : r1(x.avg) + '%'}</text>
          <text class="an-lab" x="${bx + bw / 2}" y="${H - 26}" text-anchor="middle">${esc(x.short)}</text><text class="ov-tick" x="${bx + bw / 2}" y="${H - 10}" text-anchor="middle">${x.n} students</text>
          <rect class="ov-hit" x="${bx - gap / 2}" y="${padT}" width="${bw + gap}" height="${ih}"/></g>`;
      }).join('')}
      <line class="ov-axis" x1="${padL}" x2="${W - 4}" y1="${padT + ih}" y2="${padT + ih}"/>
    </svg><div class="ov-tip" hidden></div></div>`;
  }
  function slopeChart(stat, nameA, nameB) {
    const W = 420, H = 240, padT = 18, padB = 30, xa = 110, xb = 300, ih = H - padT - padB;
    const lines = stat.filter((x) => x.nPaired && x.before != null && x.afterPaired != null);
    const all = lines.flatMap((x) => [x.before, x.afterPaired]);
    const lo = Math.max(0, Math.floor((Math.min(...all, 100) - 10) / 10) * 10), hi = Math.min(100, Math.ceil((Math.max(...all, 0) + 10) / 10) * 10);
    const y = (v) => padT + ih - ((v - lo) / Math.max(1, hi - lo)) * ih;
    // labels on the right, nudged apart so they never overlap
    const lab = lines.map((x) => ({ x, y: y(x.afterPaired) })).sort((a, b) => a.y - b.y);
    for (let i = 1; i < lab.length; i++) if (lab[i].y - lab[i - 1].y < 15) lab[i].y = lab[i - 1].y + 15;
    return `<div class="an-chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Average of the same students: ${lines.map((x) => `${x.label} ${r1(x.before)}% to ${r1(x.afterPaired)}%`).join(', ')}">
      ${[lo, (lo + hi) / 2, hi].map((v) => `<line class="ov-grid" x1="${xa - 40}" x2="${xb + 20}" y1="${y(v)}" y2="${y(v)}"/><text class="ov-tick" x="${xa - 46}" y="${y(v) + 4}" text-anchor="end">${Math.round(v)}</text>`).join('')}
      <text class="an-lab" x="${xa}" y="${H - 8}" text-anchor="middle">${esc(nameA)}</text><text class="an-lab" x="${xb}" y="${H - 8}" text-anchor="middle">${esc(nameB)}</text>
      ${lines.map((x) => `<g class="an-hit" data-tip="${esc(x.label)} (${x.nPaired} students): ${r1(x.before)}% → ${r1(x.afterPaired)}% (${pts(x.change)})">
        <line class="grp-line grp-${x.key}" x1="${xa}" y1="${y(x.before)}" x2="${xb}" y2="${y(x.afterPaired)}"/>
        <circle class="grp-dot grp-${x.key}" cx="${xa}" cy="${y(x.before)}" r="5"/><circle class="grp-dot grp-${x.key}" cx="${xb}" cy="${y(x.afterPaired)}" r="5"/>
        <line class="ov-hit-line" x1="${xa}" y1="${y(x.before)}" x2="${xb}" y2="${y(x.afterPaired)}"/></g>`).join('')}
      ${lab.map(({ x, y: ly }) => `<text class="an-end" x="${xb + 12}" y="${ly + 4}">${esc(x.short)} ${pts(x.change)} <tspan class="an-n">(${x.nPaired})</tspan></text>`).join('')}
    </svg><div class="ov-tip" hidden></div></div>`;
  }
  function scatter(rows) {
    const W = 760, H = 300, padL = 40, padR = 12, padT = 12, padB = 36, iw = W - padL - padR, ih = H - padT - padB;
    const X = (r) => (xAxis === 'solved' ? r.solved : r.seen);
    const maxX = Math.max(10, ...rows.map(X));
    const stepX = maxX <= 50 ? 10 : maxX <= 150 ? 25 : maxX <= 400 ? 50 : 100, topX = Math.ceil(maxX / stepX) * stepX;
    const x = (v) => padL + (v / topX) * iw, y = (v) => padT + ih - (Math.min(100, Math.max(0, v)) / 100) * ih;
    const ticks = []; for (let v = 0; v <= topX; v += stepX) ticks.push(v);
    const order = { never: 0, none: 1, some: 2, regular: 3 };
    return `<div class="an-chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Scatter plot of questions ${xAxis === 'solved' ? 'solved' : 'tried'} against exam score for ${rows.length} students">
      ${[0, 25, 50, 75, 100].map((v) => `<line class="ov-grid" x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}"/><text class="ov-tick" x="${padL - 6}" y="${y(v) + 4}" text-anchor="end">${v}%</text>`).join('')}
      ${ticks.map((v) => `<text class="ov-tick" x="${x(v)}" y="${H - 18}" text-anchor="middle">${v}</text>`).join('')}
      <text class="ov-tick" x="${padL + iw / 2}" y="${H - 2}" text-anchor="middle">questions ${xAxis === 'solved' ? 'solved' : 'tried'}</text>
      <line class="ov-axis" x1="${padL}" x2="${W - padR}" y1="${padT + ih}" y2="${padT + ih}"/>
      ${[...rows].sort((a, b) => order[a.group] - order[b.group]).map((r) => `<g class="an-hit" data-tip="${esc(r.name)}${r.section ? ' · ' + esc(r.section) : ''}: ${r1(r.after)}% · ${r.solved} solved of ${r.seen} tried${r.readiness != null ? ' · readiness ' + r.readiness : ''}"><circle class="grp-dot grp-${r.group}" cx="${x(X(r))}" cy="${y(r.after)}" r="5"/><circle class="ov-hit" cx="${x(X(r))}" cy="${y(r.after)}" r="11"/></g>`).join('')}
    </svg><div class="ov-tip" hidden></div>
    <p class="an-legend">${GROUPS.map((G) => `<span><i class="grp-swatch grp-${G.key}"></i>${esc(G.label)}${G.rule ? ` <span class="muted">(${G.rule})</span>` : ''}</span>`).join('')}</p></div>`;
  }
  function bindChart() {
    body.querySelectorAll('.an-chart').forEach((wrap) => {
      const tip = wrap.querySelector('.ov-tip');
      wrap.addEventListener('pointerover', (e) => {
        const g = e.target.closest('.an-hit'); if (!g) return;
        tip.textContent = g.dataset.tip; tip.hidden = false;
        const r = g.getBoundingClientRect(), w = wrap.getBoundingClientRect();
        tip.style.left = Math.min(Math.max(r.left - w.left + r.width / 2, 90), w.width - 90) + 'px';
        tip.style.top = Math.max(0, r.top - w.top - 8) + 'px';
        wrap.querySelectorAll('.an-hit.on').forEach((x) => x.classList.remove('on')); g.classList.add('on');
      });
      wrap.addEventListener('pointerleave', () => { tip.hidden = true; wrap.querySelectorAll('.an-hit.on').forEach((x) => x.classList.remove('on')); });
    });
  }

  // ---------- upload ----------
  const colName = (u, i) => (u.info.scoreCols.find((c) => c.index === i)?.header || '').replace(/\s*%\s*$/, '').trim();
  // other columns that look like parts of the same exam as the ticked one ("Midterm 1 MC" -> "Midterm 1 FR")
  function siblings(u) {
    if (u.cols.length !== 1) return [];
    const me = colName(u, u.cols[0]);
    return u.info.scoreCols.filter((c) => c.index !== u.cols[0] && !c.summary).map((c) => c.index)
      .filter((i) => looksLikeParts([me, colName(u, i)]));
  }
  function setCols(cols) {
    const u = upload;
    u.cols = [...new Set(cols)].sort((a, b) => a - b);
    u.max = u.cols.length ? suggestMax(u.info, u.cols) : 0;
    if (u.nameAuto) u.name = (u.cols.length > 1 ? commonName(u.cols.map((i) => colName(u, i))) || colName(u, u.cols[0]) : colName(u, u.cols[0] ?? -1)).slice(0, 80);
  }
  function useText(text, fileName, pasted) {
    const info = inspectScores(text);
    if (info.error) { upload = { ...upload, fileName, pasted, info: null, error: info.error }; return paint(); }
    upload = { ...upload, fileName, pasted, info, error: '', zero: false, nameAuto: !upload.name };
    setCols([info.guess]);
    paint();
  }
  const usePreviewFocus = () => body.querySelector('[data-up-name]')?.focus();
  async function saveUpload() {
    const u = upload;
    const name = (body.querySelector('[data-up-name]')?.value || '').trim();
    if (!name) { toast('Give the exam a name, for example Midterm 1', 'bad'); usePreviewFocus(); return; }
    if (!u.cols.length) { toast('Tick at least one score column', 'bad'); return; }
    if (!(u.max > 0)) { toast('"Out of" must be more than 0', 'bad'); return; }
    const btn = body.querySelector('[data-up-save]'); btn.disabled = true; btn.textContent = 'Saving…';
    try {
      const id = await cloud.saveGrades(classId, { name, maxPoints: u.max, date: u.date || '', examId: u.examId || '', scores: u.match.matched.map((x) => ({ email: x.email, score: x.score })), source: (u.fileName || 'pasted') + (u.cols.length > 1 ? ': ' + u.cols.map((i) => colName(u, i)).join(' + ') : '') });
      if (u.replaceId) await cloud.deleteGrades(classId, u.replaceId).catch(() => toast('The new scores were saved, but the old copy could not be removed. Delete it from the list.', 'bad'));
      toast(`${name}: ${plural(u.match.matched.length, 'score')} saved`, 'good');
      upload = null; pick.exam = id;
      await load();
    } catch (e) {
      toast("Couldn't save: " + (e?.code === 'permission-denied' ? "you're not on this class's teaching staff (or the latest firestore.rules aren't published)." : e?.message || e), 'bad');
      btn.disabled = false; btn.innerHTML = `${icon('check')} Save scores`;
    }
  }
  function csv() {
    const g = grades.find((x) => x.id === pick.exam), gb = grades.find((x) => x.id === pick.before);
    const head = ['Name', 'Email', 'Section', ...(gb ? [`${gb.name} %`] : []), `${g.name} %`, ...(gb ? ['Change'] : []), 'Practice', 'Questions tried', 'Questions solved', 'Accuracy %', 'Quizzes', 'Readiness', 'Best timed test %', 'Assignments done'];
    const cell = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const G = Object.fromEntries(GROUPS.map((x) => [x.key, x.label]));
    const lines = [head.map(cell).join(','), ...table().map((r) => [r.name, r.email, r.section, ...(gb ? [r.before == null ? '' : r1(r.before)] : []), r.after == null ? '' : r1(r.after), ...(gb ? [r.change == null ? '' : r1(r.change)] : []), G[r.group], r.seen, r.solved, r.accuracy == null ? '' : Math.round(r.accuracy * 100), r.quizzes, r.readiness ?? '', r.timed ?? '', r.asgDone].map(cell).join(','))];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    a.download = `${classId}-${g.name.replace(/[^\w-]+/g, '_')}${section ? '-' + section.replace(/[^\w-]+/g, '_') : ''}-analytics.csv`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // ---------- events ----------
  main.addEventListener('click', async (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.dataset.sectionTab != null) { if (embedded) return; section = b.dataset.sectionTab; remember('section', section); paint(); return; }
    if ('upload' in b.dataset) { combine = null; upload = { name: '', examId: '' }; paint(); body.querySelector('.upload-panel')?.scrollIntoView({ block: 'start', behavior: 'smooth' }); return; }
    if (b.dataset.replace) { const g = grades.find((x) => x.id === b.dataset.replace); upload = { replaceId: g.id, name: g.name, date: g.date, examId: g.examId }; paint(); body.querySelector('.upload-panel')?.scrollIntoView({ block: 'start', behavior: 'smooth' }); return; }
    if ('upCancel' in b.dataset) { upload = null; paint(); return; }
    if ('upAddparts' in b.dataset && upload) { setCols([...upload.cols, ...siblings(upload)]); paint(); return; }
    if ('combine' in b.dataset) { startCombine(); return; }
    if ('combCancel' in b.dataset) { combine = null; paint(); return; }
    if ('combSave' in b.dataset) { saveCombine(); return; }
    if ('upSave' in b.dataset) { saveUpload(); return; }
    if (b.dataset.delGrades) {
      if (!(await confirmDialog({ title: `Delete the ${b.dataset.name} scores?`, body: '<p>The uploaded scores are removed from the site. Your own copy of the file is not affected.</p>', confirm: 'Delete', danger: true }))) return;
      try { await cloud.deleteGrades(classId, b.dataset.delGrades); toast('Scores deleted'); await load(); } catch (e) { toast("Couldn't delete: " + (e?.message || e), 'bad'); }
      return;
    }
    if (b.dataset.xaxis) { xAxis = b.dataset.xaxis; paint(); return; }
    if (b.dataset.anSort) { if (sortKey === b.dataset.anSort) sortDir = -sortDir; else { sortKey = b.dataset.anSort; sortDir = ['name', 'section'].includes(sortKey) ? 1 : -1; } paint(); return; }
    if ('anCsv' in b.dataset) { csv(); return; }
    if (b.dataset.anStudent) { focus = b.dataset.anStudent; paint(); showFocus(); return; }
    if ('anClose' in b.dataset) { const was = focus; focus = ''; paint(); body.querySelector(`[data-an-student="${CSS.escape(was)}"]`)?.focus(); return; }
  });
  main.addEventListener('change', async (ev) => {
    const t = ev.target;
    if (t.matches('[data-class]')) { focus = ''; classId = t.value; remember('class', classId); section = ''; upload = null; main.querySelector('[data-dash-link]').href = `#/instructor?class=${encodeURIComponent(classId)}`; load(); return; }
    if (t.matches('[data-an-focus]')) { focus = t.value; paint(); if (focus) showFocus(); return; }
    if (t.matches('[data-pick]')) {
      pick[t.dataset.pick] = t.value;
      if (t.dataset.pick === 'exam') { const g = grades.find((x) => x.id === t.value); if (g?.examId) pick.practice = g.examId; if (pick.before === pick.exam) pick.before = grades.find((x) => x.id !== pick.exam)?.id || ''; }
      paint(); return;
    }
    if (t.matches('[data-scores-file]') && t.files[0]) { const f = t.files[0]; useText(await f.text(), f.name, ''); t.value = ''; return; }
    if (upload && t.matches('[data-up-col]')) { const i = Number(t.dataset.upCol); setCols(t.checked ? [...upload.cols, i] : upload.cols.filter((x) => x !== i)); paint(); body.querySelector(`[data-up-col="${i}"]`)?.focus(); return; }
    if (upload && t.matches('[data-up-zero]')) { upload.zero = t.checked; paint(); body.querySelector('[data-up-zero]')?.focus(); return; }
    if (combine && t.matches('[data-comb-id]')) {
      const id = t.dataset.combId; combine.ids = t.checked ? [...combine.ids, id] : combine.ids.filter((x) => x !== id);
      if (combine.nameAuto) combine.name = commonName(grades.filter((g) => combine.ids.includes(g.id)).map((g) => g.name));
      if (!combine.examId) combine.examId = grades.find((g) => combine.ids.includes(g.id) && g.examId)?.examId || '';
      paint(); body.querySelector(`[data-comb-id="${CSS.escape(id)}"]`)?.focus(); return;
    }
    if (combine && t.matches('[data-comb-zero]')) { combine.zero = t.checked; paint(); body.querySelector('[data-comb-zero]')?.focus(); return; }
    if (combine && t.matches('[data-comb-remove]')) { combine.removeParts = t.checked; return; }
    if (combine && t.matches('[data-comb-exam]')) { combine.examId = t.value; return; }
    if (combine && t.matches('[data-comb-name]')) { combine.name = t.value; combine.nameAuto = false; return; }
    if (upload && t.matches('[data-up-max]')) { upload.max = Number(t.value); paint(); return; }
    if (upload && t.matches('[data-up-date]')) { upload.date = t.value; return; }
    if (upload && t.matches('[data-up-exam]')) { upload.examId = t.value; return; }
    if (upload && t.matches('[data-up-name]')) { upload.name = t.value; upload.nameAuto = false; return; }
  });
  let pt;
  main.addEventListener('input', (ev) => {
    if (ev.target.matches('[data-scores-paste]')) { const v = ev.target.value; clearTimeout(pt); pt = setTimeout(() => { useText(v, 'pasted rows', v); body.querySelector('[data-scores-paste]')?.closest('details')?.setAttribute('open', ''); }, 400); }
    if (upload && ev.target.matches('[data-up-name]')) upload.name = ev.target.value;
  });
  // drag and drop
  const zone = (ev) => ev.target.closest?.('[data-drop="scores"]');
  const files = (ev) => [...(ev.dataTransfer?.types || [])].includes('Files');
  main.addEventListener('dragover', (ev) => { const z = zone(ev); if (z && files(ev)) { ev.preventDefault(); z.classList.add('over'); } });
  main.addEventListener('dragleave', (ev) => { const z = zone(ev); if (z && !z.contains(ev.relatedTarget)) z.classList.remove('over'); });
  main.addEventListener('drop', async (ev) => {
    const z = zone(ev); if (!z) return;
    ev.preventDefault(); z.classList.remove('over');
    const f = ev.dataTransfer.files[0];
    if (!f) return;
    if (!/\.(csv|tsv|txt)$/i.test(f.name)) { toast(`"${f.name}" isn't a CSV. In Excel or Google Sheets use File → Download/Save as → CSV.`, 'bad'); return; }
    useText(await f.text(), f.name, '');
  });
  const stray = (ev) => { if (files(ev) && !zone(ev)) ev.preventDefault(); };
  window.addEventListener('dragover', stray); window.addEventListener('drop', stray);
  await load();
  return () => { window.removeEventListener('dragover', stray); window.removeEventListener('drop', stray); };
}
