// Build my course, step 5: look over what the AI made, fix anything, and publish it.
//   a unit  →  a practice set students see from the day the unit starts (with its programming
//              assignment), and the unit quiz as a DRAFT in Graded work
//   an exam →  a DRAFT in Graded work with the exam date filled in
// Graded work is only ever added as a draft: the professor sets sections, access code and time
// there and publishes it with the same page they already use. Study notes wait for the student pages.
import * as cloud from '../cloud.js';
import { esc, icon, toast, modal, confirmDialog, plural } from '../ui.js';
import { md, highlight } from '../render.js';
import { parseExam, correctAnswerLabel } from '../parser.js';
import { thinTopics } from '../build/engine.js';
import { readAssignments, solutionProblems, publicAssignments } from '../assignments-core.js';
import { splitExam } from '../timed.js';
import { testJava } from '../java/client.js';

const KIND = { notes: 'Study notes', practice: 'Practice questions', quiz: 'Quiz', assign: 'Programming assignment', exam: 'Exam questions' };
const day = (s) => (s ? new Date(s + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : '');
const at = (date, h, m = 0) => new Date(`${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`).getTime();
const slug = (x) => String(x || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'item';
const TEST_DEFAULTS = { instructions: '', shuffleQ: true, shuffleOpts: true, requireSEB: false, requireCode: false, allowPhones: false, releaseDetail: false, aiNotice: true, warnings: 2, awayMaxSec: 15, status: 'draft', disabled: false, released: false };

export async function render(main, { classId }) {
  const base = `#/build/${encodeURIComponent(classId)}`;
  const page = (inner) => { main.innerHTML = `<section class="page builder"><nav class="crumbs" aria-label="Breadcrumb"><a href="#/instructor?class=${encodeURIComponent(classId)}">Class dashboard</a><span aria-hidden="true">›</span><a href="${base}">Build my course</a><span aria-hidden="true">›</span><span>Review</span></nav>${inner}</section>`; };
  if (!cloud.enabled || !cloud.currentUser() || !cloud.leadsClass(classId)) { page('<h1>Review and publish</h1><p>Only the class\'s instructor can open this page.</p>'); return; }
  let b, built;
  try { [b, built] = await Promise.all([cloud.getBuild(classId), cloud.listBuilt(classId)]); }
  catch (e) { page(`<h1>Review and publish</h1><p class="bad">${e?.code === 'permission-denied' ? 'This needs the latest security rules. Ask the site admin to publish the newest firestore.rules.' : esc(e?.message || String(e))}</p>`); return; }
  if (!b || !b.st.map || !['build', 'done'].includes(b.st.phase)) { page(`<h1>Review and publish</h1><p>There is nothing to review yet.</p><p><a class="btn primary" href="${b ? base + '/go' : base}">Back to the build</a></p>`); return; }
  const cls = cloud.myClasses().find((c) => c.id === classId) || (await cloud.getClass(classId).catch(() => null)) || { id: classId };
  const st = b.st;
  let alive = true, busy = false;
  const failed = new Map();      // step id → why publishing it failed
  const steps = st.order.map((id) => st.steps[id]).filter((s) => !['outline', 'map', 'check'].includes(s.kind));
  const groups = [
    ...st.map.units.map((u) => ({ key: `u${u.n}`, unit: u, title: `Unit ${u.n}: ${u.title}`, sub: u.start ? `${day(u.start)} to ${day(u.end)}` : '', items: steps.filter((s) => s.unit === u.n) })),
    ...st.map.exams.map((e, i) => ({ key: `e${i}`, exam: e, i, title: e.name, sub: day(e.date), items: steps.filter((s) => s.exam === i) })),
  ].filter((g) => g.items.length);
  const doc = (s) => built[s.id];
  const ready = (s) => s.status === 'done' && !!doc(s);
  const outputOf = (s) => { const d = doc(s); return d?.text ?? JSON.parse(d?.json || 'null'); };
  // questions the second look answered differently from the answer key: held back until the professor
  // says they are right (or rewrites the set, which counts as having looked)
  const lastLook = (s) => built[s.last && st.steps[s.last]?.status === 'done' ? s.last : `check-${s.id}`];   // a team build checks more than once
  const flagsOf = (s) => {
    const c = lastLook(s);
    if (!c?.json || !doc(s) || doc(s).editedAt) return [];
    const kept = doc(s).kept || [];
    return (JSON.parse(c.json)?.disagree || []).filter((d) => !kept.includes(d.id));
  };
  const looked = (s) => !!lastLook(s)?.json;
  // an assignment a second programmer could not pass from the instructions alone: held until the professor says it is fine
  const unsolved = (s) => (s.kind === 'assign' && !doc(s)?.editedAt && !doc(s)?.okd && st.steps[s.last]?.status === 'done' ? st.steps[s.last].meta?.fails || 0 : 0);
  const withoutQuestions = (text, ids) => (ids.length ? text.split(/(?=^## )/m).map((chunk) => {
    const id = (chunk.match(/^## (\S+)/) || [])[1];
    if (!id || !ids.includes(id)) return chunk;
    const i = chunk.search(/^# /m);            // keep a topic heading that follows the dropped question
    return i >= 0 ? chunk.slice(i) : '';
  }).join('') : text);
  const textFor = (s) => withoutQuestions(outputOf(s), flagsOf(s).map((d) => d.id));
  const publishable = (g) => g.items.filter((s) => ready(s));
  const name = (s) => (s.exam != null && s.kind === 'assign' ? `Programming problem ${s.problem}` : KIND[s.kind] + (s.part ? `, part ${s.part}` : ''));

  function stateOf(s) {
    if (failed.has(s.id)) return ['bad', 'Could not publish'];
    if (s.status === 'stuck') return ['bad', 'Not made'];
    if (!ready(s)) return ['todo', 'Still being made'];
    if (unsolved(s) && !doc(s).published) return ['ready', 'Ready · held back for you to check'];
    if (doc(s).published) return ['done', doc(s).published.draft ? 'Draft in Graded work' : 'Published'];
    const held = ['practice', 'quiz', 'exam'].includes(s.kind) ? flagsOf(s).length : 0;
    if (held) return ['ready', `Ready · ${plural(held, 'question')} held back for you to check`];
    return ['ready', doc(s).editedAt ? 'Ready (edited by you)' : 'Ready'];
  }
  function draw() {
    const all = groups.flatMap(publishable), left = all.filter((s) => !doc(s).published).length;
    const building = st.phase !== 'done';
    const qsteps = steps.filter((s) => ['practice', 'quiz', 'exam'].includes(s.kind) && ready(s));
    const heldAll = qsteps.reduce((n, s) => n + flagsOf(s).length, 0), checkedAll = qsteps.length > 0 && qsteps.every(looked);
    page(`
      <p class="eyebrow">Build my course <span class="tag">Preview</span></p>
      <h1>Review and publish</h1>
      <ol class="build-steps" aria-label="Steps">${['Course and materials', 'Connect your AI', 'Check the course map', 'Building', 'Review and schedule'].map((n, i) => `<li class="${i === 4 ? 'on' : 'past'}"${i === 4 ? ' aria-current="step"' : ''}><span>${i === 4 ? 5 : '✓'}</span> ${i === 0 ? `<a href="${base}">${n}</a>` : i === 3 ? `<a href="${base}/go">${n}</a>` : n}</li>`).join('')}</ol>
      <div class="build-card">
        <h2>Look it over, then publish</h2>
        <p>Nothing here has gone to students. Open anything to read it and change it. When you publish:</p>
        <ul class="plain-list">
          <li><strong>Practice questions and programming assignments</strong> appear for students on the day their unit starts.</li>
          <li><strong>Quizzes and exams</strong> are added to Graded work as <strong>drafts</strong>, with the date filled in. You choose the sections, time and access code there and publish them yourself.</li>
          <li><strong>Study notes</strong> become the unit's study page, which students can open from the same day.</li>
        </ul>
        ${heldAll ? `<p class="note" role="status"><strong>${plural(heldAll, 'question')} ${heldAll === 1 ? 'is' : 'are'} held back.</strong> Every question was answered a second time without its answer key. For ${heldAll === 1 ? 'this one' : 'these'} the second answer was different, so ${heldAll === 1 ? 'it is' : 'they are'} left out of what you publish until you open the set and say ${heldAll === 1 ? 'it is' : 'they are'} right.</p>` : checkedAll ? `<p class="small good">${icon('check')} Every question was answered a second time without its answer key, and the answers agree.</p>` : ''}
        ${building ? `<p class="note">The build is still running. You can review what is finished. <a href="${base}/go">See progress</a></p>` : ''}
        <div class="row"><button type="button" class="btn primary" data-publish-all ${left && !busy ? '' : 'disabled'}>${left ? `Publish everything that is ready (${left})` : 'Everything is published'}</button></div>
        <p class="small" data-status role="status" aria-live="polite"></p>
      </div>
      ${report()}
      <div class="job-groups review-groups">${groups.map((g) => {
        const can = publishable(g).filter((s) => !doc(s).published).length;
        return `<section class="job-group" data-group="${g.key}"><h3>${esc(g.title)} ${g.sub ? `<span class="muted small">${esc(g.sub)}</span>` : ''}</h3>
          <ul class="jobs">${g.items.map((s) => { const [tone, label] = stateOf(s); return `<li class="job ${tone === 'done' ? 'done' : tone === 'bad' ? 'stuck' : 'todo'}"><span class="job-mark" aria-hidden="true">${tone === 'done' ? icon('check') : tone === 'bad' ? '!' : ''}</span>
            <span class="job-name">${ready(s) ? `<button type="button" class="linklike" data-look="${s.id}">${name(s)}</button>` : name(s)}${s.note ? ` <span class="muted small">${esc(s.note)}</span>` : ''}</span>
            <span class="job-state">${label}</span>
            ${failed.has(s.id) ? `<p class="job-why bad small">${esc(failed.get(s.id))}</p>` : s.status === 'stuck' && s.problems?.length ? `<details class="job-why"><summary>Why it was not made</summary><ul>${s.problems.slice(0, 6).map((p) => `<li>${esc(p)}</li>`).join('')}</ul></details>` : ''}</li>`; }).join('')}</ul>
          <div class="row"><button type="button" class="btn small" data-publish="${g.key}" ${can && !busy ? '' : 'disabled'}>${g.exam ? 'Add to Graded work as a draft' : 'Publish this unit'}</button></div></section>`;
      }).join('')}</div>`);
  }

  // One card that says what was made, how it was checked and what still needs the professor.
  function report() {
    const all = st.order.map((id) => st.steps[id]);
    const num = (s) => Number((s.note || '').match(/^(\d+)/)?.[1] || 0);
    const count = (kind) => all.filter((s) => s.kind === kind && s.status === 'done');
    const files = all.filter((s) => s.kind === 'outline'), unread = [...new Set(files.filter((s) => s.status === 'stuck').map((s) => s.title.replace(/^Read /, '').replace(/ \(.*\)$/, '')))];
    const checks = all.filter((s) => ['practice', 'quiz', 'exam'].includes(s.kind) && s.status === 'done').map((s) => (st.steps[s.last && st.steps[s.last]?.status === 'done' ? s.last : `check-${s.id}`]?.note || '').match(/^(\d+) of (\d+)/)).filter(Boolean);
    const second = all.filter((s) => s.kind === 'assign' && st.steps[s.last]?.status === 'done'), secondOk = second.filter((s) => !st.steps[s.last].meta?.fails).length;
    const agreed = checks.reduce((n, m) => n + Number(m[1]), 0), asked = checks.reduce((n, m) => n + Number(m[2]), 0);
    const LOOKS = ['check', 'solve', 'revise', 'reassign'];
    const setAside = all.filter((s) => s.status === 'stuck' && s.kind !== 'outline' && !LOOKS.includes(s.kind)), unchecked = all.filter((s) => s.status === 'stuck' && LOOKS.includes(s.kind)), thin = thinTopics(st);
    const assigns = count('assign'), q = (kind) => count(kind).reduce((n, s) => n + num(s), 0);
    const made = [[st.topics.length, 'topic'], [st.map.units.length, 'unit'], [count('notes').length, 'set of study notes', 'sets of study notes'], [q('practice'), 'practice question'], [q('quiz'), 'quiz question'], [q('exam'), 'exam question'], [assigns.length, 'programming assignment']].filter((x) => x[0]);
    const needs = [
      ...(unread.length ? [`<strong>Could not be read:</strong> ${unread.map(esc).join('; ')}. Nothing from ${unread.length === 1 ? 'it' : 'them'} is in the course.`] : []),
      ...(setAside.length ? [`<strong>${plural(setAside.length, 'item')} could not be made</strong> and ${setAside.length === 1 ? 'is' : 'are'} marked below. <a href="${base}/go">Try again from the build page</a>.`] : []),
      ...(unchecked.length ? [`<strong>${plural(unchecked.length, 'check')} could not be finished</strong>, so ${unchecked.length === 1 ? 'one item was' : 'some items were'} looked at fewer times than planned: ${[...new Set(unchecked.map((x) => esc((st.steps[x.of]?.title || x.title).replace(/ · Unit \d+:.*$/, m => m))))].slice(0, 6).join('; ')}. <a href="${base}/go">Try again from the build page</a>.`] : []),
      ...(thin.length ? [`<strong>Thin material:</strong> your files say very little about ${thin.map((t) => esc(t.title)).join('; ')}. What was made for ${thin.length === 1 ? 'it' : 'them'} is short and basic.`] : []),
    ];
    return `<div class="build-card build-report"><h2>What was made and how it was checked</h2>
      <p>${made.map(([n, one, many]) => `<strong>${n}</strong> ${n === 1 ? one : many || one + 's'}`).join(' · ')}</p>
      <ul class="plain-list">
        <li>Everything was written only from your files. ${files.filter((s) => s.status === 'done').length} of ${files.length} file parts were read.</li>
        ${asked ? `<li>Every question was answered a second time without its answer key: <strong>${agreed} of ${asked}</strong> answers matched. ${asked - agreed ? `The other ${asked - agreed} ${asked - agreed === 1 ? 'is' : 'are'} held back until you check ${asked - agreed === 1 ? 'it' : 'them'}.` : ''}</li>` : ''}
        ${assigns.length ? '<li>Each programming solution is run against its own tests when you publish. One that fails is not published.</li>' : ''}
        ${st.setup.team ? `<li>Built by one chat, checked by a second and read once more by a third.${second.length ? ` A second programmer solved each assignment from the instructions alone: <strong>${secondOk} of ${second.length}</strong> passed every test.` : ''}</li>` : ''}
        <li>Exam and quiz questions are never the same as practice questions.</li>
      </ul>
      ${needs.length ? `<h3>Needs you</h3><ul class="plain-list">${needs.map((x) => `<li>${x}</li>`).join('')}</ul>` : '<p><strong>Nothing needs you before publishing.</strong> Reading a few items is still worth five minutes.</p>'}
    </div>`;
  }

  // ---------- looking at one item (and changing it)
  const questionsHtml = (text, flags = []) => {
    const r = parseExam(`---\ntitle: x\n---\n${text}`);
    let topic = null;
    return `<ol class="review-qs">${r.questions.map((q) => {
      const head = q.topic !== topic ? `<li class="review-topic"><h3>${esc(topic = q.topic)}</h3></li>` : '';
      let ans = ''; try { ans = q.options ? '' : correctAnswerLabel(q); } catch { ans = ''; }
      const flag = flags.find((d) => d.id === q.id);
      return `${head}<li${flag ? ' class="flagged"' : ''}>${flag ? `<div class="review-flag"><p><strong>Held back: check this one.</strong> Answered again without the key, the answer was: <strong>${esc(flag.got)}</strong>. The key says otherwise. Either the key is wrong or the question can be read two ways.</p><div class="row"><button type="button" class="btn small" data-keep="${esc(q.id)}">The key is right: keep this question</button></div></div>` : ''}<p class="muted small">${esc(q.type)} · ${esc(q.difficulty)}${q.points > 1 ? ` · ${q.points} points` : ''}</p><div class="md">${md(q.text)}</div>
        ${q.options ? `<ul class="review-opts">${q.options.map((o) => `<li class="${o.correct ? 'right' : ''}">${o.correct ? '<span class="sr-only">Correct: </span>✓ ' : ''}${md(o.text, { inline: true })}</li>`).join('')}</ul>` : `<p><strong>Answer:</strong> ${esc(ans)}</p>`}
        ${q.explanation ? `<div class="review-why md"><strong>Why:</strong> ${md(q.explanation, { inline: true })}</div>` : ''}</li>`;
    }).join('')}</ol>`;
  };
  function assignmentOf(s, folder = `01-${slug(outputOf(s).title)}`) {
    const files = new Map(Object.entries(outputOf(s).files).map(([k, v]) => [`${folder}/${k}`, v]));
    return { files, read: readAssignments(files, { label: () => outputOf(s).title }) };
  }
  async function runAssignment(a) {
    const r = await testJava(a.solution, { className: a.cls, tests: a.tests.map(({ name: n, input, output }) => ({ name: n, input, output })), checks: a.checks }, a.cls + '.java');
    return r.killed ? ['the solution ran too long (an endless loop?)'] : solutionProblems(a, r);
  }
  function look(s) {
    const text = outputOf(s), isText = typeof text === 'string';
    const dlg = modal({ title: `${name(s)} · ${groups.find((g) => g.items.includes(s)).title}`, wide: true, body: '<div data-view></div>' });
    const view = dlg.el.querySelector('[data-view]');
    const show = () => {
      if (s.kind === 'notes') view.innerHTML = `<div class="md review-notes">${md(outputOf(s))}</div>`;
      else if (isText) {
        view.innerHTML = questionsHtml(outputOf(s), flagsOf(s));
        view.querySelectorAll('[data-keep]').forEach((btn) => { btn.onclick = async () => {
          btn.disabled = true;
          try { const kept = [...(doc(s).kept || []), btn.dataset.keep]; await cloud.patchBuilt(classId, s.id, { kept, keepOnly: true }); built[s.id] = { ...doc(s), kept }; show(); draw(); toast('Kept'); }
          catch (e) { btn.disabled = false; toast("Couldn't save: " + (e?.message || e), 'bad'); }
        }; });
      }
      else {
        const o = outputOf(s), a = assignmentOf(s).read.assignments[0];
        view.innerHTML = `<p class="muted small">${esc(o.cls)}.java · ${plural(o.tests, 'test')} · ${esc(o.difficulty || '')}</p><div class="md">${md(a?.instructions || '')}</div>
          <details><summary>Starter code students begin with</summary><pre tabindex="0"><code class="language-java">${esc(a?.starter || '')}</code></pre></details>
          <details><summary>Solution (never shown to students)</summary><pre tabindex="0"><code class="language-java">${esc(a?.solution || '')}</code></pre></details>
          <details><summary>Tests</summary>${(a?.tests || []).map((t) => `<p class="small"><strong>${esc(t.name)}</strong></p><div class="grid2"><pre tabindex="0">${esc(t.input)}</pre><pre tabindex="0">${esc(t.output)}</pre></div>`).join('')}</details>
          ${unsolved(s) ? `<div class="review-flag"><p><strong>Held back: check this one.</strong> A second programmer who saw only the instructions and starter code did not get the output ${plural(unsolved(s), 'test')} expect${unsolved(s) === 1 ? 's' : ''}. The instructions may leave something out.</p><button type="button" class="btn small" data-okd>It is fine as it is: publish it</button></div>` : ''}
          <div class="row"><button type="button" class="btn small" data-run>Run the solution against its tests</button><span class="small" data-run-out role="status" aria-live="polite"></span></div>`;
        const okd = view.querySelector('[data-okd]');
        if (okd) okd.onclick = async () => { okd.disabled = true; try { await cloud.patchBuilt(classId, s.id, { okd: true }); built[s.id] = { ...doc(s), okd: true }; failed.delete(s.id); show(); draw(); toast('Marked as fine'); } catch (e) { okd.disabled = false; toast("Couldn't save: " + (e?.message || e), 'bad'); } };
        view.querySelector('[data-run]').onclick = async (ev) => {
          const out = view.querySelector('[data-run-out]'); ev.target.disabled = true; out.textContent = 'Running…';
          try { const p = await runAssignment(a); out.className = `small ${p.length ? 'bad' : 'good'}`; out.textContent = p.length ? p[0] : `The solution passes all ${a.tests.length} tests.`; } catch (e) { out.textContent = "Couldn't run it: " + (e?.message || e); }
          ev.target.disabled = false;
        };
      }
      highlight(view);
      if (isText) {
        view.insertAdjacentHTML('beforeend', `<div class="row topline"><button type="button" class="btn small" data-edit>${icon('edit')} Change the text</button></div>`);
        view.querySelector('[data-edit]').onclick = edit;
      }
    };
    const edit = () => {
      view.innerHTML = `<label class="field"><span>${s.kind === 'notes' ? 'The notes, in Markdown' : 'The questions, in the Cramming question format'}</span><textarea rows="22" class="mono" data-src spellcheck="${s.kind === 'notes'}"></textarea></label>
        <p class="bad small" data-edit-err role="alert"></p><div class="row"><button type="button" class="btn primary" data-save>Save changes</button><button type="button" class="btn" data-cancel>Cancel</button></div>`;
      const box = view.querySelector('[data-src]'); box.value = outputOf(s); box.focus();
      view.querySelector('[data-cancel]').onclick = show;
      view.querySelector('[data-save]').onclick = async (ev) => {
        const val = box.value.trim(), err = view.querySelector('[data-edit-err]');
        if (!val) { err.textContent = 'This can\'t be empty.'; return; }
        if (s.kind !== 'notes') {
          const r = parseExam(`---\ntitle: x\n---\n${val}`);
          if (r.errors.length || !r.questions.length) { err.textContent = r.errors.length ? `Line ${Math.max(1, r.errors[0].line - 3)}: ${r.errors[0].message}` : 'No questions were found.'; return; }
        }
        ev.target.disabled = true;
        try {
          const was = doc(s).published;
          await cloud.patchBuilt(classId, s.id, { text: val, ...(was ? { published: null } : {}) });
          built[s.id] = { ...doc(s), text: val, editedAt: Date.now(), ...(was ? { published: null } : {}) };
          show(); draw(); toast(was ? 'Saved. Publish it again so students get the new version.' : 'Saved');
        } catch (e) { ev.target.disabled = false; err.textContent = "Couldn't save: " + (e?.message || e); }
      };
    };
    show();
  }

  // ---------- publishing
  const mark = async (s, as, draft = false) => { const published = { at: Date.now(), as, draft }; await cloud.patchBuilt(classId, s.id, { published }); built[s.id] = { ...doc(s), published }; failed.delete(s.id); };
  async function checkedAssignments(list) {      // → [{ step, a, files }] whose solutions pass; the rest are marked failed
    const ok = [];
    for (const [k, s] of list.entries()) {
      const { files, read } = assignmentOf(s, `${String(k + 1).padStart(2, '0')}-${slug(outputOf(s).title)}`);
      const a = read.assignments[0];
      const p = read.errors.length ? read.errors : !a ? ['it could not be read'] : await runAssignment(a);
      if (!p.length && unsolved(s)) p.push('a second programmer, working only from the instructions, did not get the output the tests expect. Open it, check the instructions and tests, then say it is fine or change it.');
      if (p.length) failed.set(s.id, `Not published: ${p[0].split('\n')[0]}`); else ok.push({ step: s, a, files });
    }
    return ok;
  }
  async function draftTest(tid, test, key, stepsIn) {
    const old = await cloud.getTimed(classId, tid).catch(() => null);
    if (old && old.status === 'published') { stepsIn.forEach((s) => failed.set(s.id, 'Already published in Graded work. Change it there.')); return false; }
    await cloud.saveTimed(classId, tid, { ...TEST_DEFAULTS, ...test }, { questions: key });
    for (const s of stepsIn) await mark(s, tid, true);
    return true;
  }
  async function publishUnit(g) {
    const u = g.unit, by = (kind) => g.items.find((s) => s.kind === kind && ready(s));
    const practice = by('practice'), assign = by('assign'), quiz = by('quiz');
    const examId = `${classId}--unit-${u.n}`;
    if (practice) {
      const source = `---\ntitle: "Unit ${u.n}: ${u.title.replace(/"/g, "'")}"\ncourse: ${cls.course || cls.name || ''}\ndescription: Practice for unit ${u.n}\norder: ${u.n}\n---\n\n${textFor(practice)}\n`;
      const r = parseExam(source);
      if (r.errors.length) failed.set(practice.id, `Not published: ${r.errors[0].message}`);
      else {
        await cloud.saveExam(classId, { examId, meta: r.meta, source, counts: { questions: r.questions.length, onExam: r.questions.filter((q) => q.onExam).length, topics: r.topics.map((t) => ({ name: t.name, count: t.count })) } });
        await cloud.setPractice(classId, examId, { off: false, opensAt: u.start ? at(u.start, 0) : null, dueAt: null });
        await mark(practice, examId);
      }
    }
    if (assign) {
      if (!practice || failed.has(practice.id)) failed.set(assign.id, 'Not published: it goes with the unit\'s practice set, which was not made.');
      else {
        const [ok] = await checkedAssignments([assign]);
        if (ok) { await cloud.saveAssignments(classId, examId, { assignments: publicAssignments([ok.a]), files: [...ok.files].map(([path, text]) => ({ path, text })) }); await mark(assign, examId); }
      }
    }
    // the study page: the notes, with links to this unit's practice
    const notes = by('notes'), practised = practice && !failed.has(practice.id);
    if (notes || practised) {
      await cloud.saveStudyUnit(classId, `unit-${u.n}`, { n: u.n, title: u.title, start: u.start || null, end: u.end || null, opensAt: u.start ? at(u.start, 0) : 0,
        notes: notes ? outputOf(notes) : '', examId: practised ? examId : null, hasAssignment: !!(assign && doc(assign)?.published) });
      if (notes) await mark(notes, `unit-${u.n}`);
    }
    if (quiz) {
      const r = parseExam(`---\ntitle: x\n---\n${textFor(quiz)}`), { pub, key, totalPoints } = splitExam(r);
      const date = u.end || st.setup.lastDay;
      if (r.errors.length || !pub.length) failed.set(quiz.id, 'Not published: the questions could not be read.');
      else await draftTest(`b-quiz-${u.n}`, { title: `Unit ${u.n} quiz: ${u.title}`.slice(0, 80), kind: 'quiz', opensAt: date ? at(date, 9) : Date.now(), closesAt: date ? at(date, 23, 59) : Date.now() + 86400000, durationMin: 15, questions: pub, totalPoints }, key, [quiz]);
    }
  }
  async function publishExam(g) {
    const qs = g.items.filter((s) => s.kind === 'exam' && ready(s)), progs = g.items.filter((s) => s.kind === 'assign' && ready(s));   // a long exam is made in parts
    const parsed = qs.length ? parseExam(`---\ntitle: x\n---\n${qs.map(textFor).join('\n\n')}`, { allowLong: true }) : null;
    if (parsed?.errors.length) { qs.forEach((s) => failed.set(s.id, 'Not added: the questions could not be read.')); return; }
    const ok = await checkedAssignments(progs);
    const { pub, key, totalPoints } = splitExam(parsed, readAssignments(new Map(ok.flatMap((x) => [...x.files]))).assignments);
    if (!pub.length) return;
    const minutes = Math.max(30, Math.min(180, Math.round(((parsed?.questions.length || 0) * 1.5 + ok.length * 20) / 5) * 5));
    await draftTest(`b-exam-${g.i + 1}`, { title: g.exam.name.slice(0, 80), kind: 'exam', opensAt: at(g.exam.date, 9), closesAt: at(g.exam.date, 9) + minutes * 60000, durationMin: minutes, questions: pub, totalPoints }, key, [...qs, ...ok.map((x) => x.step)]);
  }
  async function publish(list) {
    if (busy) return;
    busy = true; draw();
    const say = (t) => { const el = main.querySelector('[data-status]'); if (el) el.textContent = t; };
    let n = 0;
    try {
      for (const g of list) {
        say(`Publishing ${g.title}… (${++n} of ${list.length})`);
        g.items.forEach((s) => failed.delete(s.id));
        await (g.exam ? publishExam(g) : publishUnit(g));
        if (!alive) return;
      }
      busy = false; draw();
      const bad = list.flatMap((g) => g.items).filter((s) => failed.has(s.id)).length;
      say(bad ? `Done, but ${plural(bad, 'item')} could not be published. They are marked below.` : 'Done. Practice is on the class page; quizzes and exams are drafts in Graded work.');
      toast(bad ? `${plural(bad, 'item')} could not be published` : 'Published', bad ? 'bad' : 'good');
    } catch (e) {
      busy = false; draw();
      say(`Stopped: ${e?.code === 'permission-denied' ? 'you are not allowed to do that. Ask the site admin to publish the newest firestore.rules.' : e?.message || e}`);
    }
  }

  main.addEventListener('click', async (ev) => {
    const el = ev.target.closest('button'); if (!el || !alive) return;
    if (el.dataset.look) { const s = st.steps[el.dataset.look]; if (s && ready(s)) look(s); return; }
    if (el.dataset.publish) { publish([groups.find((g) => g.key === el.dataset.publish)]); return; }
    if ('publishAll' in el.dataset) {
      const list = groups.filter((g) => publishable(g).some((s) => !doc(s).published));
      const ok = await confirmDialog({ title: 'Publish everything that is ready?', body: `<p>${plural(list.filter((g) => g.unit).length, 'unit')} of practice will appear for students on the day each unit starts. Quizzes and exams are added to Graded work as drafts that students cannot see.</p>`, confirm: 'Publish' });
      if (ok) publish(list);
    }
  });
  draw();
  return () => { alive = false; };
}
