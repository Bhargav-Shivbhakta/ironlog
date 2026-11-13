// A student taking a timed exam (#/take/<class>/<exam>). Staff can open it with ?preview=1 to try it:
// nothing is saved and leaving only shows a message.
//
// Lockdown while the exam runs: full screen; switching tab, app or desktop, leaving full screen,
// closing or reloading the page, the screenshot key or developer-tools keys end the exam at once.
// Copy, cut, paste, right-click, dragging and printing are blocked; Back and swipe-back do nothing.
// Firebase's clock decides when time is up, one device holds the attempt, and only one attempt exists.
import * as cloud from '../cloud.js';
import { esc, icon, toast, confirmDialog, closeModal, plural } from '../ui.js';
import { md, highlight } from '../render.js';
import { CodeJar } from '../../vendor/codejar.js';
import { runJava, testJava } from '../java/client.js';
import { normalizeOutput } from '../java/index.js';
import { setNavGuard } from '../main.js';
import { ms, studentView, answered, examPhase, attemptDeadline, deviceInfo, QTYPE_LABEL, EXIT_LABEL } from '../timed.js';

const SAVE_EVERY = 120000;       // a save (with answers) every 2 minutes
const pad = (n) => String(n).padStart(2, '0');
const when = (t) => new Date(t).toLocaleString(undefined, { weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const hm = (t) => new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const mmss = (x) => { const s = Math.max(0, Math.ceil(x / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`; };
const r1 = (x) => String(Math.round(x * 10) / 10);
const lsGet = (k) => { try { return localStorage.getItem('qp1:timed:' + k); } catch { return null; } };
const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem('qp1:timed:' + k); else localStorage.setItem('qp1:timed:' + k, v); } catch {} };
const newSession = () => { const a = new Uint8Array(16); crypto.getRandomValues(a); return [...a].map((x) => x.toString(16).padStart(2, '0')).join(''); };

export async function render(main, { classId, tid }, query = {}) {
  const me = cloud.currentUser();
  const staff = cloud.isAdmin() || cloud.myClasses().some((c) => c.id === classId && ['instructor', 'ta'].includes(c.role));
  const preview = query.preview === '1' && staff;
  const dev = { ...deviceInfo(navigator.userAgent, navigator.maxTouchPoints || 0, Math.min(screen.width, screen.height)), screen: `${screen.width}×${screen.height}`, extended: screen.isExtended === true };
  let cleanupFns = [];
  const page = (html) => { main.innerHTML = `<section class="page narrow take-page">${html}</section>`; };

  // what the class page knows (works before the exam opens)
  const cls = await cloud.getClass(classId).catch(() => null);
  const sum = cls?.timed?.[tid];
  if (!cls || !sum || (sum.status !== 'published' && !preview)) {
    page(`<h1>Exam not available</h1><p>This exam doesn't exist or isn't published yet.</p><p><a class="btn" href="#/class/${encodeURIComponent(classId)}">Back to the class</a></p>`);
    return;
  }
  const phase = preview ? 'open' : examPhase({ ...sum, opensAt: sum.opensAt, closesAt: sum.closesAt });
  if (phase === 'upcoming') return upcoming();

  let test = null, attempt = null;
  try { ({ test, attempt } = await cloud.openTimed(classId, tid)); } catch (e) { console.warn(e); }
  if (preview) attempt = null;
  if (!test) {
    if (attempt) return finishedScreen(attempt);
    page(`<h1>${esc(sum.title)}</h1><p>${phase === 'closed' ? `This exam closed ${when(sum.closesAt)}. You didn't start it.` : "The exam couldn't be loaded. Check your internet connection and reload."}</p><p><a class="btn" href="#/class/${encodeURIComponent(classId)}">Back to the class</a></p>`);
    return;
  }
  if (attempt) {
    const left = lsGet('left:' + attempt.id);
    const mine = lsGet('sess:' + attempt.id);
    if (attempt.status !== 'open') return finishedScreen(attempt);
    if (attempt.session === '') return preStart({ resume: true });
    if (mine && mine === attempt.session) {
      // this device had the exam open and the page was closed or reloaded: that ends it
      await endOnServer(attempt, left || 'page-leave');
      return finishedScreen(await cloud.myAttempt(classId, tid).catch(() => null) || { ...attempt, status: 'ended', endedReason: left || 'page-leave' });
    }
    page(`<h1>${esc(test.title)}</h1>
      <div class="lock-note bad">${icon('lock')}<div><h2>This exam is open on another device</h2><p>An exam can only be taken on one device. If that wasn't you, or your other device stopped working, ask your professor to let you back in.</p></div></div>
      <p><a class="btn" href="#/class/${encodeURIComponent(classId)}">Back to the class</a></p>`);
    return;
  }
  if (phase === 'closed') { page(`<h1>${esc(test.title)}</h1><p>This exam closed ${when(ms(test.closesAt))}. You didn't start it.</p><p><a class="btn" href="#/class/${encodeURIComponent(classId)}">Back to the class</a></p>`); return; }
  return preStart({ resume: false });

  // ------------------------------------------------ screens before / after
  function upcoming() {
    page(`
      <p class="eyebrow">${esc(cls.name)}</p><h1>${esc(sum.title)}</h1>
      <div class="take-facts"><p><strong>Opens:</strong> ${when(sum.opensAt)}</p><p><strong>Closes:</strong> ${when(sum.closesAt)}</p><p><strong>Time limit:</strong> ${sum.durationMin} minutes once you start</p></div>
      <p class="take-countdown" aria-live="off">Opens in <strong data-count></strong></p>
      ${checksHtml(sum)}
      <p class="muted small">This page opens the exam by itself when it's time. You can also come back later.</p>
      <p><a class="btn" href="#/class/${encodeURIComponent(classId)}">Back to the class</a></p>`);
    const el = main.querySelector('[data-count]');
    const iv = setInterval(() => { const left = sum.opensAt - Date.now(); if (left <= 0) { clearInterval(iv); location.reload(); return; } el.textContent = mmss(left); }, 1000);
    el.textContent = mmss(sum.opensAt - Date.now());
    return () => clearInterval(iv);
  }
  function checksHtml(t) {
    const items = [];
    if (t.requireSEB) items.push(dev.seb ? ['good', 'Safe Exam Browser: ready'] : ['bad', 'This exam must be taken in <strong>Safe Exam Browser</strong>. Install it free from <a href="https://safeexambrowser.org/download_en.html" target="_blank" rel="noopener">safeexambrowser.org</a> and open the exam from it, as your professor explains.']);
    if (!t.allowPhones && dev.phone) items.push(['bad', 'Phones can\'t be used for this exam. Use a laptop, desktop or iPad.']);
    if (dev.extended) items.push(['bad', 'A <strong>second screen</strong> is connected. Disconnect it before you start.']);
    if (!t.requireSEB && !document.fullscreenEnabled && !document.webkitFullscreenEnabled) items.push(['warn', 'This browser can\'t go full screen. Chrome, Edge, Firefox or Safari on a computer work best.']);
    if (!items.some((x) => x[0] !== 'good')) items.push(['good', 'This device is ready.']);
    return `<ul class="dev-checks">${items.map(([k, h]) => `<li class="${k}">${icon(k === 'good' ? 'check' : 'x')}<span>${h}</span></li>`).join('')}</ul>`;
  }
  function blockers(t) { return (t.requireSEB && !dev.seb) || (!t.allowPhones && dev.phone) || dev.extended; }

  function preStart({ resume }) {
    const close = ms(test.closesAt);
    const fullMin = test.durationMin + (attempt?.extraMin || 0);
    const latest = Math.min(Date.now() + test.durationMin * 60000, close);
    page(`
      ${preview ? `<p class="preview-note">${icon('eye')} Preview: this is what students see. Nothing is saved, and leaving only shows a message.</p>` : ''}
      <p class="eyebrow">${esc(cls.name)}</p><h1>${esc(test.title)}</h1>
      ${resume ? `<div class="lock-note">${icon('note')}<div><h2>Your professor let you back in</h2><p>You continue your same attempt with the answers you had saved. Time left: <strong>${mmss(attemptDeadline({ ...test, closesAt: close }, attempt) - Date.now())}</strong>.</p></div></div>` : ''}
      <div class="take-facts">
        <p><strong>${plural(test.questions.length, 'question')}</strong> · ${r1(test.totalPoints)} points${Object.entries(test.questions.reduce((c, q) => ((c[QTYPE_LABEL[q.type]] = (c[QTYPE_LABEL[q.type]] || 0) + 1), c), {})).map(([k, v]) => ` · ${v} ${k.toLowerCase()}`).join('')}</p>
        ${resume ? '' : `<p><strong>Time limit:</strong> ${fullMin} minutes from when you press Start${latest < Date.now() + test.durationMin * 60000 ? ` (but the exam closes at ${hm(close)}, so you'll have until then)` : ''}.</p>`}
      </div>
      ${test.instructions ? `<div class="take-instructions">${md(test.instructions)}</div>` : ''}
      <h2>Rules</h2>
      <ul class="take-rules">
        <li><strong>One attempt.</strong> You can't start again.</li>
        <li><strong>Leaving ends your exam.</strong> Switching to another tab, app or desktop, leaving full screen, closing or reloading this page, or taking a screenshot submits your exam right away. There is no warning.</li>
        <li><strong>One device.</strong> Opening the exam anywhere else won't work.</li>
        <li>Copy, paste and right-click are turned off. There are no hints and no answer checking.</li>
        <li>Your answers save by themselves. When time runs out, the exam is submitted for you.</li>
        <li>Your name is shown faintly across the screen.</li>
      </ul>
      ${checksHtml(test)}
      <label class="check take-agree"><input type="checkbox" data-agree><span>I understand. Leaving the exam ends it, and I'm the only one taking it.</span></label>
      <div class="row take-start"><a class="btn" href="#/class/${encodeURIComponent(classId)}">Not now</a><button class="btn primary big" data-start disabled>${icon('play')} ${resume ? 'Continue the exam' : 'Start the exam'}</button></div>`);
    const btn = main.querySelector('[data-start]');
    const can = !blockers(test) || preview;
    main.querySelector('[data-agree]').addEventListener('change', (e) => { btn.disabled = !(e.target.checked && can); });
    btn.addEventListener('click', () => begin(resume));
  }

  async function endOnServer(a, reason) {
    try {
      await cloud.saveAttempt(classId, a, { status: 'ended', endedReason: reason, events: [...(a.events || []), { t: Date.now(), type: reason }].slice(-200), saves: (a.saves || 0) + 1 });
    } catch (e) { console.warn('could not end', e?.message); }
    lsSet('left:' + a.id, null);
  }

  async function finishedScreen(a) {
    if (!a) { page('<h1>Exam ended</h1>'); return; }
    const t = test || { title: sum.title, questions: [] };
    const reason = a.endedReason;
    const grade = sum.released ? await cloud.myTestGrade(classId, tid) : null;
    const left = a.status === 'ended';
    page(`
      <p class="eyebrow">${esc(cls.name)}</p><h1>${esc(t.title)}</h1>
      <div class="lock-note ${left ? 'bad' : 'good'}">${icon(left ? 'lock' : 'check')}<div>
        <h2>${left ? 'Your exam has ended' : 'Your exam was submitted'}</h2>
        <p>${left ? `It ended because: <strong>${esc(EXIT_LABEL[reason] || reason || 'you left the exam')}</strong>. The answers you had saved were submitted.` : reason === 'time-up' ? 'Time ran out, so it was submitted for you.' : 'Thanks. Your answers are in.'}${a.submittedAt ? ` (${when(ms(a.submittedAt))})` : ''}</p>
        ${left ? '<p>If this was a mistake, for example your computer crashed, contact your professor. Only they can let you back in.</p>' : ''}
      </div></div>
      ${grade ? `<div class="take-score"><p class="eyebrow">Your score</p><p class="big-score">${r1(grade.total)} <span class="muted">/ ${r1(grade.max)}</span></p><p class="muted">${Math.round((grade.total / (grade.max || 1)) * 100)}%</p>
        ${test?.releaseDetail !== false && test?.questions?.length ? `<ol class="score-list">${test.questions.map((q) => { const p = grade.perQ?.[q.id]; return `<li><span>${esc(q.label)} <span class="muted small">${QTYPE_LABEL[q.type]}</span></span><strong>${p?.pts == null ? '–' : r1(p.pts)} / ${r1(q.points)}</strong></li>`; }).join('')}</ol>` : ''}</div>`
        : `<p class="muted">${sum.released ? 'Your score isn\'t ready yet.' : 'Your professor will release scores later. They\'ll show here.'}</p>`}
      <p><a class="btn" href="#/class/${encodeURIComponent(classId)}">Back to the class</a></p>`);
  }

  // ------------------------------------------------ the exam
  async function begin(resume) {
    const btn = main.querySelector('[data-start]');
    btn.disabled = true; btn.textContent = 'Starting…';
    // full screen must be asked for straight from the click
    const wantFs = !dev.seb && (document.fullscreenEnabled || document.webkitFullscreenEnabled);
    if (wantFs) {
      try { await (document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }) || document.documentElement.webkitRequestFullscreen?.()); }
      catch { toast('Allow full screen to start the exam.', 'bad'); btn.disabled = false; btn.innerHTML = `${icon('play')} Start the exam`; return; }
    }
    let offset = 0;
    const session = newSession();
    const device = { browser: dev.browser, os: dev.os, seb: dev.seb, screen: dev.screen };
    if (!preview) {
      try {
        if (resume) {
          const t0 = Date.now();
          await cloud.saveAttempt(classId, attempt, { session, device, events: [...(attempt.events || []), { t: Date.now(), type: 'resumed' }] });
          attempt = await cloud.myAttempt(classId, tid);
          offset = ms(attempt.beatAt) - (t0 + Date.now()) / 2;
        } else {
          const extraMin = await cloud.myExtraTime(classId, tid);
          ({ attempt, offset } = await cloud.startAttempt(classId, tid, { session, device, extraMin }));
        }
        lsSet('sess:' + attempt.id, session);
      } catch (e) {
        document.exitFullscreen?.().catch(() => {});
        page(`<h1>${esc(test.title)}</h1><p class="bad">The exam couldn't start: ${esc(e?.code === 'permission-denied' ? "it may have closed, you may already have an attempt, or your professor's settings changed. Reload the page to check." : e?.message || e)}</p><p><button class="btn" onclick="location.reload()">Reload</button></p>`);
        return;
      }
    } else {
      attempt = { id: 'preview', startedAt: Date.now(), extraMin: 0, answers: {}, events: [], saves: 0 };
    }
    runExam(offset);
  }
  function runExam(offset) {
    const serverNow = () => Date.now() + offset;
    const view = studentView(test, me?.uid || 'preview');
    const qs = view.questions;
    const local = (() => { try { return JSON.parse(lsGet('ans:' + attempt.id) || 'null'); } catch { return null; } })();
    let answers = { ...(attempt.answers || {}), ...((local && local.at > ms(attempt.beatAt || 0)) ? local.answers : {}) };
    let flags = new Set(JSON.parse(lsGet('flags:' + attempt.id) || '[]'));
    let events = [...(attempt.events || [])];
    let idx = 0, finished = false, lastSave = serverNow(), saving = false, saveError = '', warned = new Set(), editor = null;
    let deadline = attemptDeadline({ ...test, closesAt: ms(test.closesAt) }, attempt);
    const name = me?.displayName || me?.email || 'Preview';

    document.body.classList.add('exam-locked');
    main.innerHTML = `
      <div class="exam-shell" data-shell>
        <div class="exam-watermark" aria-hidden="true" data-wm></div>
        <header class="exam-bar">
          <div class="exam-title"><strong>${esc(test.title)}</strong>${preview ? ' <span class="pill">Preview</span>' : ''}</div>
          <div class="exam-timer" role="timer" aria-live="off"><span class="sr-only">Time left</span><span data-timer></span></div>
          <div class="exam-save small" data-save aria-live="polite"></div>
          <button class="btn primary" data-submit>${icon('check')} Submit exam</button>
        </header>
        <div class="exam-body">
          <nav class="exam-nav" aria-label="Questions"><ol data-nav></ol><p class="muted small exam-legend"><span class="dot a"></span> answered <span class="dot f"></span> flagged</p></nav>
          <section class="exam-q" data-q tabindex="-1" aria-label="Question"></section>
        </div>
        <p class="sr-only" aria-live="assertive" data-alert></p>
      </div>`;
    const $ = (s) => main.querySelector(s);
    // the student's name across the screen, drawn as a picture (so it can't be selected or read out)
    const wmText = `${name} · ${me?.email || ''}`.replace(/[<>&"']/g, '');
    const wmColor = getComputedStyle(document.body).color || '#000';
    $('[data-wm]').style.backgroundImage = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='420' height='160'><text x='10' y='90' font-family='sans-serif' font-size='15' font-weight='700' fill='${wmColor}' transform='rotate(-20 210 80)'>${wmText}</text></svg>`)}")`;

    function navHtml() {
      return qs.map((q, i) => `<li><button data-go="${i}" class="${i === idx ? 'cur' : ''} ${answered(q, answers[q.id]) ? 'a' : ''} ${flags.has(q.id) ? 'f' : ''}" aria-current="${i === idx ? 'step' : 'false'}" aria-label="Question ${i + 1}${answered(q, answers[q.id]) ? ', answered' : ''}${flags.has(q.id) ? ', flagged' : ''}">${i + 1}</button></li>`).join('');
    }
    function qHtml(q, i) {
      const v = answers[q.id];
      let input = '';
      if (q.options) {
        const multi = q.type === 'multi';
        input = `<fieldset class="exam-opts"><legend class="sr-only">Answer</legend>${view.optOrder[q.id].map((oi) => `
          <label class="exam-opt"><input type="${multi ? 'checkbox' : 'radio'}" name="opt" value="${oi}" ${multi ? ((v || []).includes(oi) ? 'checked' : '') : v === oi ? 'checked' : ''}><span>${md(q.options[oi], { inline: true })}</span></label>`).join('')}</fieldset>
          ${!multi && v != null ? '<button class="link-btn small" data-clear>Clear my answer</button>' : ''}`;
      } else if (q.type === 'numeric' || q.type === 'text') {
        input = `<label class="field"><span>Your answer</span><input class="exam-input" data-text value="${esc(v ?? '')}" ${q.type === 'numeric' ? 'inputmode="decimal"' : ''} autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"></label>`;
      } else if (q.type === 'long') {
        input = `<label class="field"><span>Your answer</span><textarea class="exam-input" data-text rows="10" spellcheck="false">${esc(v ?? '')}</textarea></label>`;
      } else if (q.type === 'code') {
        input = `
          <div class="exam-code">
            <div class="editor-wrap"><div class="editor language-java" data-editor tabindex="0" role="textbox" aria-multiline="true" aria-label="Java code for ${esc(q.label)}" spellcheck="false" autocapitalize="off" autocorrect="off"></div></div>
            <div class="exam-run">
              <label class="field"><span>Input for Run</span><textarea data-input rows="2" spellcheck="false"></textarea></label>
              <div class="row"><button class="btn" data-run>${icon('play')} Run</button>${q.samples?.length ? `<button class="btn" data-samples>Run the ${plural(q.samples.length, 'sample test')}</button>` : ''}<button class="link-btn small" data-reset-code>Start over from the starter code</button></div>
              <pre class="exam-out" data-out aria-live="polite"></pre>
            </div>
          </div>`;
      }
      return `
        <div class="exam-qhead"><p class="eyebrow">Question ${i + 1} of ${qs.length} · ${QTYPE_LABEL[q.type]} · ${plural(q.points, 'point')}</p>
          <button class="btn small ${flags.has(q.id) ? 'on' : ''}" data-flag aria-pressed="${flags.has(q.id)}">${icon('flag')} ${flags.has(q.id) ? 'Flagged' : 'Flag for review'}</button></div>
        <div class="exam-text">${md(q.text)}</div>
        ${q.type === 'code' && q.samples?.length ? `<details class="exam-samples"><summary>Sample input and output</summary>${q.samples.map((s) => `<div class="grid2"><div><p class="small"><strong>Input</strong></p><pre>${esc(s.input || '(none)')}</pre></div><div><p class="small"><strong>Expected output</strong></p><pre>${esc(s.output)}</pre></div></div>`).join('')}</details>` : ''}
        ${input}
        <div class="row between exam-move"><button class="btn" data-prev ${i === 0 ? 'disabled' : ''}>${icon('left')} Previous</button><button class="btn" data-next ${i === qs.length - 1 ? 'disabled' : ''}>Next ${icon('right')}</button></div>`;
    }
    function show(i) {
      idx = Math.max(0, Math.min(qs.length - 1, i));
      editor = null;
      $('[data-nav]').innerHTML = navHtml();
      const q = qs[idx];
      $('[data-q]').innerHTML = qHtml(q, idx);
      highlight($('[data-q] .exam-text'));
      if (q.type === 'code') {
        const el = $('[data-editor]');
        const hl = (e) => { if (window.hljs) { delete e.dataset.highlighted; e.className = 'editor language-java'; e.textContent = e.textContent; try { window.hljs.highlightElement(e); } catch {} } };
        el.textContent = answers[q.id] ?? q.starter ?? '';
        editor = CodeJar(el, hl, { tab: '    ', indentOn: /[({[]$/, addClosing: false, spellcheck: false, catchTab: true });
        editor.updateCode(answers[q.id] ?? q.starter ?? '');
        editor.onUpdate((c) => { answers[q.id] = c; changed(false); });
      }
      $('[data-q]').focus({ preventScroll: true });
      $('[data-q]').scrollTop = 0;
    }
    function changed(redrawNav = true) {
      lsSet('ans:' + attempt.id, JSON.stringify({ at: serverNow(), answers }));
      if (redrawNav) $('[data-nav]').innerHTML = navHtml();
      else { const b = $(`[data-go="${idx}"]`); if (b) b.classList.toggle('a', answered(qs[idx], answers[qs[idx].id])); }
    }

    // ---- saving
    function saveLabel() {
      const el = $('[data-save]'); if (!el) return;
      el.innerHTML = preview ? 'Preview: not saved' : saveError ? `<span class="bad">${esc(saveError)}</span>` : saving ? 'Saving…' : `Saved ${hm(lastSave - offset)}`;
    }
    async function save(extra = {}) {
      if (preview || saving) return true;
      saving = true; saveLabel();
      const changes = { answers: { ...answers }, events: events.slice(-200), saves: (attempt.saves || 0) + 1, ...extra };
      try {
        await cloud.saveAttempt(classId, attempt, changes);
        attempt = { ...attempt, ...changes, beatAt: serverNow() };
        lastSave = serverNow(); saveError = '';
        return true;
      } catch (e) {
        if (e?.code === 'permission-denied') {
          // the professor may have added time or ended the exam, or another device took over: look again
          const fresh = await cloud.myAttempt(classId, tid).catch(() => null);
          if (fresh && fresh.status !== 'open') { finished = true; teardown(); finishedScreen(fresh); return false; }
          if (fresh && fresh.session !== lsGet('sess:' + attempt.id)) { finished = true; teardown(); page(`<h1>${esc(test.title)}</h1><div class="lock-note bad">${icon('lock')}<div><h2>This exam was opened on another device</h2><p>Ask your professor if you need help.</p></div></div>`); return false; }
          if (fresh) {
            attempt = { ...fresh, id: attempt.id };
            deadline = attemptDeadline({ ...test, closesAt: ms(test.closesAt) }, attempt);
            try { await cloud.saveAttempt(classId, attempt, changes); attempt = { ...attempt, ...changes }; lastSave = serverNow(); saveError = ''; return true; } catch {}
          }
          saveError = 'Not saved. Your connection may have dropped for too long; tell your professor.';
        } else saveError = 'Not saved yet: check your internet. Trying again soon.';
        return false;
      } finally { saving = false; saveLabel(); }
    }

    // ---- ending
    async function finish(status, reason) {
      if (finished) return;
      finished = true;
      if (reason !== 'submitted' && reason !== 'time-up') events.push({ t: serverNow(), type: reason });
      if (preview) {
        teardown();
        page(`<h1>${esc(test.title)}</h1><p class="preview-note">${icon('eye')} Preview finished: <strong>${esc(EXIT_LABEL[reason] || reason)}</strong>. In a real exam this ${status === 'ended' ? 'ends the exam right away' : 'submits the exam'}.</p><p><a class="btn" href="#/timed/${encodeURIComponent(classId)}/${encodeURIComponent(tid)}">Back to the exam page</a></p>`);
        return;
      }
      lsSet('left:' + attempt.id, status === 'ended' ? reason : null);
      teardown();
      main.innerHTML = '<section class="page narrow"><p class="muted loading-line">Submitting…</p></section>';
      saving = false;
      const ok = await save({ status, endedReason: reason });
      lsSet('left:' + attempt.id, null);
      finishedScreen(ok ? { ...attempt, status, endedReason: reason, submittedAt: serverNow() } : (await cloud.myAttempt(classId, tid).catch(() => null)) || { ...attempt, status, endedReason: reason });
    }
    const leave = (reason) => {
      if (finished) return;
      if (preview) { toast(`In a real exam this would end it now: ${EXIT_LABEL[reason] || reason}`, 'bad'); events.push({ t: Date.now(), type: reason }); return; }
      finish('ended', reason);
    };

    // ---- lockdown
    const on = (target, type, fn, opts) => { target.addEventListener(type, fn, opts); cleanupFns.push(() => target.removeEventListener(type, fn, opts)); };
    let fsWas = !!(document.fullscreenElement || document.webkitFullscreenElement);
    let blurTimer = null;
    on(document, 'visibilitychange', () => { if (document.visibilityState === 'hidden') leave('tab-hidden'); });
    on(window, 'blur', () => { clearTimeout(blurTimer); blurTimer = setTimeout(() => { if (!document.hasFocus() && !finished) leave('window-blur'); }, 1200); });
    on(window, 'focus', () => clearTimeout(blurTimer));
    const fsChange = () => { const now = !!(document.fullscreenElement || document.webkitFullscreenElement); if (fsWas && !now) leave('fullscreen-exit'); fsWas = now; };
    on(document, 'fullscreenchange', fsChange); on(document, 'webkitfullscreenchange', fsChange);
    on(window, 'pagehide', () => { if (!finished && !preview) { lsSet('left:' + attempt.id, 'page-leave'); cloud.saveAttempt(classId, attempt, { answers, status: 'ended', endedReason: 'page-leave', events: [...events, { t: serverNow(), type: 'page-leave' }].slice(-200), saves: (attempt.saves || 0) + 1 }).catch(() => {}); } });
    on(window, 'beforeunload', (e) => { if (!finished && !preview) { e.preventDefault(); e.returnValue = ''; } });
    const block = (e) => { if (finished) return; e.preventDefault(); e.stopPropagation(); };
    for (const t of ['copy', 'cut', 'paste', 'contextmenu', 'dragstart', 'drop', 'beforeprint']) on(document, t, (e) => { block(e); if (t !== 'contextmenu' && t !== 'dragstart') notice('Copy, paste and printing are turned off during the exam.'); }, true);
    on(document, 'selectstart', (e) => { if (!e.target.closest?.('input, textarea, [data-editor]')) e.preventDefault(); }, true);
    on(document, 'keydown', (e) => {
      if (finished) return;
      const k = e.key?.toLowerCase(), mod = e.ctrlKey || e.metaKey;
      if (k === 'f12' || (mod && e.shiftKey && ['i', 'j', 'c', 'k'].includes(k)) || (e.metaKey && e.altKey && ['i', 'j', 'c', 'u'].includes(k))) { block(e); leave('devtools-key'); return; }
      if (e.metaKey && e.shiftKey && ['3', '4', '5', 's'].includes(k)) { block(e); leave('print-screen'); return; }
      if (mod && ['c', 'v', 'x', 'p', 's', 'u', 'f', 'g', 'o', 'n', 't', 'w', 'r', 'l', 'h', 'j', 'd'].includes(k)) { block(e); if (['c', 'v', 'x'].includes(k)) notice('Copy and paste are turned off during the exam.'); return; }
      if (k === 'f5' || (e.altKey && ['arrowleft', 'arrowright'].includes(k)) || k === 'browserback') { block(e); return; }
      if (e.key === 'Escape') { e.preventDefault(); }
    }, true);
    on(document, 'keyup', (e) => { if (e.key === 'PrintScreen' || e.code === 'PrintScreen') { leave('print-screen'); } }, true);
    on(document, 'gesturestart', (e) => e.preventDefault(), { passive: false });
    setNavGuard({ hash: location.hash, blocked: () => notice('You can\'t leave the exam page. Use Submit when you\'re done.') });
    cleanupFns.push(() => setNavGuard(null));
    history.pushState(null, '', location.hash); // so Back has somewhere to go that isn't away
    let noticeT = 0;
    function notice(msg) { if (Date.now() - noticeT > 2500) { noticeT = Date.now(); toast(msg); } }

    // ---- timer
    const timerEl = $('[data-timer]');
    const iv = setInterval(async () => {
      if (finished) return;
      const left = deadline - serverNow();
      timerEl.textContent = mmss(left);
      timerEl.parentElement.classList.toggle('low', left < 5 * 60000);
      const due = [10, 5, 1].filter((m) => left <= m * 60000 && left > 0 && !warned.has(m));
      if (due.length) { due.forEach((m) => warned.add(m)); const m = Math.min(...due), msg = left < m * 60000 - 30000 ? `Less than ${m} minute${m > 1 ? 's' : ''} left` : `${m} minute${m > 1 ? 's' : ''} left`; $('[data-alert]').textContent = msg; toast(msg); }
      if (left <= 0) {
        if (!preview && !warned.has('check')) {
          warned.add('check');
          // the professor may have added time: look once before submitting
          const fresh = await cloud.myAttempt(classId, tid).catch(() => null);
          if (fresh && fresh.status === 'open' && (fresh.extraMin || 0) > (attempt.extraMin || 0)) { attempt = { ...attempt, extraMin: fresh.extraMin }; deadline = attemptDeadline({ ...test, closesAt: ms(test.closesAt) }, attempt); warned.delete('check'); toast('Your professor gave you more time.', 'good'); return; }
        }
        finish('submitted', 'time-up');
        return;
      }
      if (serverNow() - lastSave >= SAVE_EVERY) save();
    }, 1000);
    cleanupFns.push(() => clearInterval(iv));
    timerEl.textContent = mmss(deadline - serverNow());

    function teardown() {
      cleanupFns.forEach((f) => { try { f(); } catch {} });
      cleanupFns = [];
      document.body.classList.remove('exam-locked');
      closeModal();
      if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen?.() || document.webkitExitFullscreen?.())?.catch?.(() => {});
    }

    // ---- answering
    const shell = $('[data-shell]');
    shell.addEventListener('change', (e) => {
      const q = qs[idx];
      if (e.target.name === 'opt') {
        if (q.type === 'multi') answers[q.id] = [...shell.querySelectorAll('input[name=opt]:checked')].map((x) => Number(x.value)).sort((a, b) => a - b);
        else answers[q.id] = Number(e.target.value);
        changed();
        if (q.type !== 'multi' && !shell.querySelector('[data-clear]')) shell.querySelector('.exam-opts').insertAdjacentHTML('afterend', '<button class="link-btn small" data-clear>Clear my answer</button>');
      }
    });
    shell.addEventListener('input', (e) => { if (e.target.matches('[data-text]')) { answers[qs[idx].id] = e.target.value; changed(false); } });
    shell.addEventListener('click', async (e) => {
      const b = e.target.closest('button'); if (!b || finished) return;
      if (b.dataset.go != null) { show(Number(b.dataset.go)); return; }
      if ('prev' in b.dataset) { show(idx - 1); return; }
      if ('next' in b.dataset) { show(idx + 1); return; }
      if ('clear' in b.dataset) { delete answers[qs[idx].id]; changed(); show(idx); return; }
      if ('flag' in b.dataset) { const id = qs[idx].id; if (flags.has(id)) flags.delete(id); else flags.add(id); lsSet('flags:' + attempt.id, JSON.stringify([...flags])); show(idx); return; }
      if ('resetCode' in b.dataset) { if (await confirmDialog({ title: 'Start over?', body: '<p>Your code for this question is replaced with the starter code.</p>', confirm: 'Start over', danger: true })) { answers[qs[idx].id] = qs[idx].starter; changed(); show(idx); } return; }
      if ('run' in b.dataset || 'samples' in b.dataset) {
        const q = qs[idx], out = $('[data-out]');
        const src = editor ? editor.toString() : answers[q.id] || q.starter;
        b.disabled = true; out.textContent = 'Running…';
        try {
          if ('run' in b.dataset) {
            const r = await runJava(src, $('[data-input]').value, { className: q.cls, fileName: q.cls + '.java' });
            out.textContent = r.compileErrors ? r.errorText : r.killed || r.timedOut ? 'Stopped: it ran too long (infinite loop?).\n' + (r.stdout || '') : (r.stdout || '(no output)') + (r.stderr ? '\n' + r.stderr : '');
          } else {
            const r = await testJava(src, { className: q.cls, tests: q.samples, checks: [] }, q.cls + '.java');
            out.textContent = r.compileErrors ? 'Your code does not compile yet.' : r.killed ? 'Stopped: it ran too long (infinite loop?).' : r.results.map((x) => `${x.passed ? '✓' : '✗'} sample ${x.name}${x.passed ? '' : `\n  expected:\n${normalizeOutput(x.expected)}\n  yours:\n${normalizeOutput(x.actual)}`}`).join('\n');
          }
        } catch (err) { out.textContent = 'The runner had a problem: ' + (err?.message || err); }
        b.disabled = false;
        return;
      }
      if ('submit' in b.dataset) {
        const missing = qs.filter((q) => !answered(q, answers[q.id])).length;
        const flagged = flags.size;
        const ok = await confirmDialog({ title: 'Submit your exam?', body: `<p>${missing ? `<strong>${plural(missing, 'question')} ${missing === 1 ? 'has' : 'have'} no answer.</strong> ` : 'Every question has an answer. '}${flagged ? `${plural(flagged, 'question')} ${flagged === 1 ? 'is' : 'are'} flagged for review. ` : ''}You can't change anything after submitting.</p>`, confirm: 'Submit', cancel: 'Keep working' });
        if (ok && !finished) { if (editor) answers[qs[idx].id] = editor.toString(); finish('submitted', 'submitted'); }
      }
    });
    show(0);
    saveLabel();
  }
}
