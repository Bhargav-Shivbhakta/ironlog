// "My study": one page for a student in a class. Today's short list, the mistake notebook, a plan
// for the week, how ready they are, and (if the instructor allows it) the AI tutor set-up.
// Instructors see the same page as a preview, with switches to turn each tool off for the class.
import * as cloud from '../cloud.js';
import * as store from '../store.js';
import { getExam, getAssignments } from '../data.js';
import { esc, icon, toast, plural } from '../ui.js';
import { mistakeIds, dueIds, readiness, topicMastery, missedRanking } from '../engine.js';
import { todayTasks, weekPlan, tutorPrompt } from '../studyplan.js';
import { studyUnits } from './classes.js';

const TOOLS = { myStudy: true, tutor: false };       // what a class has until its instructor changes it
export const toolsOf = (doc) => ({ ...TOOLS, ...(doc?.tools || {}) });
const dayName = (t) => new Date(t).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
const first = (text) => String(text || '').replace(/```[\s\S]*?```/g, ' (code) ').replace(/[#*_`>]/g, '').split('\n').find((l) => l.trim())?.trim().slice(0, 110) || '';

export async function render(main, { classId }) {
  const cls = cloud.myClasses().find((c) => c.id === classId);
  const home = `#/class/${encodeURIComponent(classId)}`;
  const page = (inner) => { main.innerHTML = `<section class="page mystudy"><nav class="crumbs" aria-label="Breadcrumb"><a href="${home}">${esc(cls?.name || 'My class')}</a><span aria-hidden="true">›</span><span>My study</span></nav>${inner}</section>`; };
  if (!cloud.enabled || !cloud.currentUser() || !cls) { page('<h1>My study</h1><p>Open this from your class page.</p>'); return; }
  const teacher = cloud.isStaffRole(cls.role), lead = cloud.leadsClass(classId);
  const doc = await cloud.getClass(classId).catch(() => null);
  let tools = toolsOf(doc);
  if (!teacher && !tools.myStudy) { page(`<h1>My study</h1><p>Your instructor has turned this page off for the class.</p><p><a class="btn" href="${home}">Back to the class</a></p>`); return; }

  const now = cloud.trueNow();
  // the practice sets this person can open, with what they have done in each
  const ids = (doc?.exams || cls.exams || []).filter((id) => teacher || cloud.canSeeExam(id));
  const exams = (await Promise.all(ids.map((id) => getExam(id).catch(() => null)))).filter((e) => e && e.questions?.length);
  const sets = exams.map((e) => {
    const stats = store.getStats(e.id);
    return { id: e.id, title: e.title, exam: e, stats, mistakes: mistakeIds(e, stats).length, due: dueIds(e, stats).length, questions: e.questions.length, seen: e.questions.filter((q) => stats[q.id]?.seen).length };
  });
  const units = studyUnits(doc?.study), openUnits = units.filter((u) => teacher || u.opensAt <= now);
  const cur = openUnits[openUnits.length - 1] || null;
  const curExam = cur ? `${classId}--unit-${cur.n}` : null;
  const unit = cur ? { id: cur.id, n: cur.n, title: cur.title, read: !!store.get(`read:${classId}:${cur.id}`, 0), examId: sets.some((s) => s.id === curExam) ? curExam : null } : null;
  const today = new Date().toLocaleDateString('en-CA');
  const tasks = todayTasks({ classId, sets, unit, answeredToday: store.getActivity()[today]?.answered || 0 });
  const hasAssignment = unit?.examId ? ((await getAssignments(unit.examId).catch(() => null))?.assignments?.length || 0) > 0 : false;
  const section = cls.section || '';
  const graded = Object.values(doc?.timed || {}).filter((t) => t && t.status === 'published' && !t.disabled).map((t) => { const w = (section && t.windows?.[section]) || t; return { title: t.title, at: Number(w.opensAt) || 0, until: Number(w.closesAt) || 0 }; }).filter((t) => t.at);
  const openNow = graded.find((t) => t.at <= now && now < t.until);

  const TUTOR_SAY = 'Use the Cramming tutor connector to help me study. Start by listing my open units.';
  const tutorCode = () => store.get(`tutorLink:${classId}`, '');
  const tutorLink = () => `${cloud.connectorUrl()}/tutor/${tutorCode()}`;
  const planDays = () => Number(store.get(`planDays:${classId}`, 4)) || 4;
  const totals = sets.reduce((a, s) => { const r = readiness(s.exam, s.stats, store.getAttempts(s.id)); a.score += r.score * s.questions; a.q += s.questions; a.seen += s.seen; return a; }, { score: 0, q: 0, seen: 0 });
  const ready = totals.q ? Math.round(totals.score / totals.q) : 0;
  const weak = sets.flatMap((s) => topicMastery(s.exam, s.stats).filter((t) => t.seen >= 3 && t.seen > 0).map((t) => ({ name: t.name, acc: t.right / Math.max(1, t.right + t.wrong) }))).filter((t) => t.acc < 0.7).sort((a, b) => a.acc - b.acc).slice(0, 3);
  const missed = sets.flatMap((s) => missedRanking(s.exam, s.stats, 4).filter((x) => x.s.lastCorrect === false).map((x) => ({ text: first(x.q.text), topic: x.q.topic, set: s }))).slice(0, 6);
  const nextGraded = graded.filter((t) => t.at > now).sort((a, b) => a.at - b.at)[0];

  function draw() {
    const plan = weekPlan({ now, daysPerWeek: planDays(), unit, hasAssignment, earlier: Math.max(0, openUnits.length - 1), graded });
    const left = tasks.filter((t) => !t.done).length, mins = tasks.filter((t) => !t.done).reduce((n, t) => n + t.minutes, 0);
    page(`
      <header class="mystudy-head"><p class="eyebrow">${esc(cls.course || cls.name)}${teacher ? ' · Preview of what students see' : ''}</p>
        <h1>${!tasks.length ? 'You are up to date' : left ? `Today, about ${mins} minutes` : 'Done for today'}</h1>
        <p class="lede">${!tasks.length ? 'Nothing is waiting. Come back when the next unit opens, or practise anything you like.' : left ? `${left === 1 ? 'One thing' : `${left} things`}, in this order.` : 'That is enough for one day. Come back tomorrow.'}</p></header>
      ${teacher && lead ? `<section class="tool-switches" aria-labelledby="tools-h"><h2 id="tools-h">Student tools for this class</h2>
        <label class="check-line"><input type="checkbox" data-tool="myStudy" ${tools.myStudy ? 'checked' : ''}><span><strong>My study page</strong>: today's list, mistake notebook, weekly plan and readiness. Uses only each student's own practice results.</span></label>
        <label class="check-line"><input type="checkbox" data-tool="tutor" ${tools.tutor ? 'checked' : ''}><span><strong>Ask the tutor</strong>: gives students a set-up to paste into their own AI (such as SDSU's ChatGPT) so it coaches from your notes and does not hand out answers. Off until you turn it on. The site cannot control what the AI then says.</span></label>
        <p class="muted small" data-tool-status role="status" aria-live="polite">Changes apply to the whole class at once.</p></section>` : ''}
      ${tasks.length ? `<ol class="today-list">${tasks.map((t) => `<li class="${t.done ? 'done' : ''}"><span class="today-mark" aria-hidden="true">${t.done ? icon('check') : ''}</span>
        <span class="today-text"><strong>${esc(t.title)}</strong><span class="muted small">${esc(t.why)}</span></span>
        <span class="muted small today-min">${t.done ? 'Done' : `${t.minutes} min`}</span>
        ${t.done ? '' : `<a class="btn primary" href="${t.href}">Start<span class="sr-only">: ${esc(t.title)}</span></a>`}</li>`).join('')}</ol>` : ''}

      <div class="mystudy-grid">
        <section class="ms-card" aria-labelledby="mis-h"><h2 id="mis-h">Mistake notebook</h2>
          ${sets.some((s) => s.mistakes) ? `<p class="muted small">Questions you last got wrong. They stay here until you get them right.</p>
            <ul class="ms-rows">${sets.filter((s) => s.mistakes).map((s) => `<li><span><strong>${esc(s.title)}</strong> <span class="muted small">${plural(s.mistakes, 'question')}</span></span><a class="btn small" href="#/start/${encodeURIComponent(s.id)}/mistakes">Redo<span class="sr-only"> the mistakes in ${esc(s.title)}</span></a></li>`).join('')}</ul>
            ${missed.length ? `<h3>You miss these most</h3><ul class="ms-missed">${missed.map((m) => `<li>${esc(m.text)} <span class="muted small">${esc(m.topic || '')}</span></li>`).join('')}</ul>` : ''}`
            : `<p class="muted">${totals.seen ? 'Nothing here. Every question you have tried, you last got right.' : 'Empty for now. Questions you get wrong in practice are kept here so you can redo them.'}</p>`}
        </section>

        <section class="ms-card" aria-labelledby="plan-h"><h2 id="plan-h">This week</h2>
          <div class="row ms-days" role="group" aria-label="Days a week you can study">${[3, 4, 5].map((n) => `<button type="button" class="btn small${planDays() === n ? ' primary' : ''}" data-days="${n}" aria-pressed="${planDays() === n}">${n} days</button>`).join('')}</div>
          <ol class="ms-week">${plan.map((p) => `<li><strong>${dayName(p.date)}</strong>${p.graded ? ` <span class="tag">Day before ${esc(p.graded)}</span>` : ''}<span class="muted small"> · ${p.minutes} min</span><ul>${p.items.map((x) => `<li>${esc(x.text)}</li>`).join('')}</ul></li>`).join('')}</ol>
          <p class="muted small">${nextGraded ? `Next graded work: ${esc(nextGraded.title)}, ${dayName(nextGraded.at)}. ` : ''}Short sessions spread over the week work better than one long one.</p>
        </section>

        <section class="ms-card" aria-labelledby="ready-h"><h2 id="ready-h">How ready you are</h2>
          ${totals.seen ? `<div class="bar" role="img" aria-label="About ${ready} percent ready"><span style="width:${ready}%"></span></div>
            <p><strong>About ${ready}%</strong> across ${plural(sets.length, 'practice set')}.</p>
            ${weak.length ? `<p><strong>Weakest right now:</strong> ${weak.map((w) => esc(w.name)).join(', ')}.</p>` : ''}
            <p class="muted small">An estimate from your ${plural(sets.reduce((n, s) => n + Object.values(s.stats).reduce((k, x) => k + (x.seen || 0), 0), 0), 'practice answer')}. It shows where to spend time. It is not a prediction of your grade.</p>`
            : '<p class="muted">Answer some practice questions and this will show where you are strong and where you are not.</p>'}
        </section>

        ${tools.tutor ? `<section class="ms-card" aria-labelledby="tutor-h"><h2 id="tutor-h">Ask the tutor</h2>
          ${openNow && !teacher ? `<p class="note" role="status"><strong>Off for now.</strong> ${esc(openNow.title)} is open. The tutor comes back when it closes.</p>`
            : `<p>An AI coach for ${unit ? `Unit ${unit.n}` : 'this course'} that reads only your instructor's notes: hints and explanations, not answers.</p>
              ${cloud.connectorUrl() ? (tutorCode()
                ? `<h3>1. Add this link to your AI, once</h3>
                  <div class="copy-row"><label class="field grow"><span>Your private tutor link</span><input readonly value="${esc(tutorLink())}" data-copy-src="link" onfocus="this.select()"></label><button type="button" class="btn" data-copy="link">${icon('copy')} Copy</button></div>
                  <details><summary>ChatGPT (your SDSU account)</summary><p>Settings → Apps and connectors → add a custom connector. Name it <strong>Cramming tutor</strong>, paste the link, choose no sign-in. If you do not see that option, your university has not allowed custom connectors: use the set-up further down.</p></details>
                  <details><summary>Claude</summary><p>Settings → Connectors → Add custom connector. Name it <strong>Cramming tutor</strong> and paste the link.</p></details>
                  <details><summary>Gemini</summary><p>Custom connectors are not open to every Gemini account yet. If yours has them, add the link the same way; otherwise use the set-up further down.</p></details>
                  <h3>2. Then start a chat</h3>
                  <div class="copy-row"><label class="field grow"><span>Message to send</span><input readonly value="${esc(TUTOR_SAY)}" data-copy-src="say" onfocus="this.select()"></label><a class="btn" target="_blank" rel="noopener" href="https://chatgpt.com/?q=${encodeURIComponent(TUTOR_SAY)}">Open in ChatGPT</a><a class="btn" target="_blank" rel="noopener" href="https://claude.ai/new?q=${encodeURIComponent(TUTOR_SAY)}">Open in Claude</a><button type="button" class="btn" data-copy="say">${icon('copy')} Copy</button></div>
                  <p class="muted small">Keep the link to yourself: it opens your course's notes. <button type="button" class="linklike" data-new-link>Make a new link</button> if you shared it by mistake.</p>`
                : `<div class="row"><button type="button" class="btn primary" data-new-link>Connect my AI</button></div><p class="muted small">Makes a private link you add to ChatGPT, Claude or Gemini once. After that the AI can read your course's notes, and nothing else from Cramming.</p>`) : ''}
              <details${cloud.connectorUrl() ? '' : ' open'}><summary>${cloud.connectorUrl() ? 'Cannot add a connector? Use a copied set-up instead' : 'Set up your AI'}</summary>
                <div class="row"><button type="button" class="btn${cloud.connectorUrl() ? '' : ' primary'}" data-tutor ${unit ? '' : 'disabled'}>${icon('copy')} Copy the tutor set-up</button><a class="btn" href="https://chatgpt.com/" target="_blank" rel="noopener">Open ChatGPT</a></div>
                <p class="small" data-tutor-status role="status" aria-live="polite">${unit ? 'Then paste it into a new chat and ask your question. It carries the notes for this week\'s unit.' : 'Available when a unit with notes is open.'}</p></details>
              <p class="small" data-link-status role="status" aria-live="polite"></p>`}
          <ul class="muted small ms-rules"><li>It can be wrong. If it disagrees with your notes or your instructor, they are right.</li><li>Using AI on quizzes, exams or graded assignments is against the course rules.</li><li>The AI is given only your course's notes for units that are open. It never gets answer keys, tests or anyone's grades.</li><li>What you type there goes to the AI company, not to Cramming. Use your university account if you have one.</li></ul>
        </section>` : ''}
      </div>
      <p class="muted small ms-foot">Your results are kept with your account. The plan and estimates are suggestions worked out by simple rules, not by AI.</p>`);
  }

  main.addEventListener('click', async (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.dataset.days) { store.set(`planDays:${classId}`, Number(b.dataset.days)); draw(); main.querySelector(`[data-days="${b.dataset.days}"]`)?.focus(); return; }
    if (b.dataset.copy) {
      const src = main.querySelector(`[data-copy-src="${b.dataset.copy}"]`);
      try { await navigator.clipboard.writeText(src.value); toast('Copied'); } catch { src.focus(); src.select(); toast('Press Ctrl+C (or ⌘C) to copy'); }
      return;
    }
    if ('newLink' in b.dataset) {
      b.disabled = true;
      try { const code = await cloud.makeTutorLink(classId, cls.section || '', tutorCode()); store.set(`tutorLink:${classId}`, code); draw(); main.querySelector('[data-link-status]').textContent = 'Your tutor link is ready. Add it to your AI, then start a chat.'; main.querySelector('[data-copy="link"]')?.focus(); }
      catch (e) { b.disabled = false; const o = main.querySelector('[data-link-status]'); if (o) o.textContent = `Couldn't make the link: ${e?.code === 'permission-denied' ? 'ask your instructor to check the site is up to date.' : e?.message || e}`; }
      return;
    }
    if ('tutor' in b.dataset && unit) {
      const out = main.querySelector('[data-tutor-status]'); b.disabled = true;
      try {
        const u = await cloud.getStudyUnit(classId, unit.id);
        const text = tutorPrompt({ course: cls.course || cls.name, unit, notes: u?.notes || '' });
        try { await navigator.clipboard.writeText(text); out.textContent = 'Copied. Open ChatGPT (or your own AI), start a new chat, and paste.'; toast('Tutor set-up copied'); }
        catch { out.textContent = 'Your browser blocked copying. Allow clipboard access for this site and try again.'; }
      } catch { out.textContent = 'The notes could not be loaded. Check your connection and try again.'; }
      b.disabled = false;
    }
  });
  main.addEventListener('change', async (ev) => {
    const el = ev.target.closest('[data-tool]'); if (!el) return;
    const out = main.querySelector('[data-tool-status]'), next = { ...tools, [el.dataset.tool]: el.checked };
    el.disabled = true;
    try { await cloud.setClassTools(classId, next); tools = next; draw(); main.querySelector('[data-tool-status]').textContent = `Saved. ${el.dataset.tool === 'tutor' ? 'Ask the tutor' : 'My study'} is now ${next[el.dataset.tool] ? 'on' : 'off'} for the class.`; main.querySelector(`[data-tool="${el.dataset.tool}"]`)?.focus(); }
    catch (e) { el.checked = !el.checked; el.disabled = false; out.textContent = `Couldn't save: ${e?.code === 'permission-denied' ? 'only the instructor can change this.' : e?.message || e}`; }
  });
  draw();
}
