// Coding workspace: instructions, editor, run with input, test results.
import { getExam, getAssignments } from '../data.js';
import * as store from '../store.js';
import { esc, icon, toast, confirmDialog, modalOpen } from '../ui.js';
import { md, highlight } from '../render.js';
import { CodeJar } from '../../vendor/codejar.js';
import { runJava, testJava } from '../java/client.js';
import { normalizeOutput } from '../java/index.js';
import { formatJava } from '../java/format-code.js';
import { attachSuggestions } from '../java/suggest.js';

const humanize = (name) => {
  let s = name.replace(/^test\d*_?/i, '') || name;
  s = s.replace(/^n(-?\d+)$/, 'n = $1').replace(/^([a-z]+)(-?\d+)$/i, '$1 $2').replace(/_+/g, ' ').replace(/ ([a-f])$/, (m, c) => ' ' + c.toUpperCase()).trim();
  return s.startsWith('n = ') ? s : s.charAt(0).toUpperCase() + s.slice(1);
};
const firstLine = (s, n = 40) => { const t = String(s).trim().replace(/\s+/g, ' '); return t.length > n ? t.slice(0, n - 1) + '…' : t || '(no input)'; };

function diffLines(expected, actual) {
  const e = normalizeOutput(expected).split('\n');
  const a = normalizeOutput(clip(actual)).split('\n');
  const n = Math.min(Math.max(e.length, a.length), Math.max(e.length + 20, 60));
  const rows = [];
  let first = -1;
  for (let i = 0; i < n; i++) {
    const ex = e[i], ac = a[i];
    const same = ex === ac;
    if (!same && first < 0) first = i;
    rows.push({ i, ex, ac, same });
  }
  return { rows, first };
}
const CLIP = 20000;
const clip = (s) => (s && s.length > CLIP ? s.slice(0, CLIP) + '\n… (the rest of the output is not shown)' : s);
const showWs = (s) => esc(s).replace(/ /g, '<span class="ws">·</span>');

export async function render(main, { id, slug }) {
  const exam = await getExam(id);
  const list = exam ? await getAssignments(id) : [];
  const a = list.find((x) => x.slug === slug);
  const e = encodeURIComponent(id);
  if (!exam || !a) {
    main.innerHTML = `<section class="page narrow empty-state"><h1>Assignment not found</h1><p>It may have been renamed or removed.</p><a class="btn primary" href="#/assignments/${e}">All assignments</a></section>`;
    return;
  }
  const idx = list.indexOf(a);
  const nextA = list[idx + 1];
  const fileName = a.cls + '.java';
  const spec = { className: a.cls, tests: a.tests.map(({ name, input, output }) => ({ name, input, output })), checks: a.checks };
  const total = a.tests.length + a.checks.length;
  let prog = store.getAsgProgress(exam.id)[a.slug] || {};
  let code = store.getCode(exam.id, a.slug) ?? a.starter;
  let lastTest = null;
  let lastRun = null;
  let leftTab = 'instructions';
  let pane = 'instructions';
  let errorLines = new Set();
  let busy = false;
  const firstSample = a.tests.find((t) => t.sample) || a.tests[0];
  let input = (() => { try { return sessionStorage.getItem(`qp1:input:${exam.id}:${a.slug}`); } catch { return null; } })() ?? (firstSample ? firstSample.input : '');

  main.innerHTML = `
    <div class="ide" data-pane="${pane}">
      <header class="ide-bar">
        <a class="icon-btn" href="#/assignments/${e}" aria-label="Back to assignments" title="Back to assignments">${icon('left')}</a>
        <div class="ide-title"><h1>${esc(a.title)}</h1><span>${idx + 1} of ${list.length} · ${esc(fileName)}</span></div>
        <span class="ide-saved muted small" data-saved aria-live="polite"></span>
        <div class="ide-actions">
          <button class="btn small" data-run aria-label="Run" title="Run with your input (Ctrl+Shift+Enter)">${icon('play')}<span>Run</span></button>
          <button class="btn primary small" data-test aria-label="Run tests" title="Run all tests (Ctrl+Enter)">${icon('check')}<span>Run tests</span></button>
        </div>
      </header>
      <nav class="ide-tabs" role="tablist" aria-label="Workspace">
        <button role="tab" data-pane-btn="instructions">Instructions</button>
        <button role="tab" data-pane-btn="code">Code</button>
        <button role="tab" data-pane-btn="tests">Tests <span data-tab-score></span></button>
      </nav>
      <div class="ide-body">
        <section class="ide-left" aria-label="Instructions and tests">
          <div class="seg ide-lefttabs" role="tablist">
            <button role="tab" data-left="instructions">Instructions</button>
            <button role="tab" data-left="tests">Tests <span data-tab-score2></span></button>
          </div>
          <div class="ide-left-body" data-left-body></div>
        </section>
        <section class="ide-right" aria-label="Code editor">
          <div class="editor-head">
            <span class="file-tab">${icon('note')} ${esc(fileName)}</span>
            <span class="spacer"></span>
            <button class="tool" data-format title="Fix the indentation (Shift+Alt+F)">${icon('code')}<span>Format</span></button>
            <button class="tool" data-reset title="Start over from the starter code">${icon('shuffle')}<span>Reset</span></button>
            <button class="tool" data-download title="Download ${esc(fileName)}">${icon('download')}<span>Download</span></button>
          </div>
          <div class="editor-wrap" data-editor-wrap>
            <div class="gutter" data-gutter aria-hidden="true"></div>
            <div class="editor language-java" data-editor tabindex="0" role="textbox" aria-multiline="true" aria-label="Java code editor" autocapitalize="off" autocorrect="off" spellcheck="false"></div>
          </div>
          <div class="console">
            <div class="console-head">
              <div class="seg" role="tablist">
                <button role="tab" data-con="input">Input</button>
                <button role="tab" data-con="output">Output</button>
              </div>
              <span class="console-status small muted" data-status></span>
            </div>
            <div class="console-input" data-con-panel="input">
              <textarea data-input rows="3" spellcheck="false" aria-label="Program input" placeholder="What the program reads, as if you typed it. For example: 30 Fri 19 n"></textarea>
              ${a.tests.some((t) => t.sample) ? `<div class="chip-row small">Load a sample: ${a.tests.filter((t) => t.sample).map((t) => `<button class="link-btn" data-load-input="${esc(t.name)}">${esc(humanize(t.name))}</button>`).join('')}</div>` : ''}
            </div>
            <div class="console-output" data-con-panel="output" hidden>
              <pre class="console-out" data-output tabindex="0"><span class="muted">Click Run to see what your program prints.</span></pre>
              <div class="compare" data-compare aria-live="polite"></div>
            </div>
          </div>
        </section>
      </div>
    </div>`;

  const $ = (sel) => main.querySelector(sel);
  const ide = $('.ide');
  const editorEl = $('[data-editor]');
  const gutter = $('[data-gutter]');
  const leftBody = $('[data-left-body]');
  const out = $('[data-output]');
  const status = $('[data-status]');
  const inputEl = $('[data-input]');
  inputEl.value = input;

  // ---------- editor ----------
  const hl = (el) => {
    if (window.hljs) {
      delete el.dataset.highlighted;
      el.className = 'editor language-java';
      el.textContent = el.textContent;
      try { window.hljs.highlightElement(el); } catch {}
    }
  };
  editorEl.textContent = code;
  const jar = CodeJar(editorEl, hl, { tab: '    ', indentOn: /[({[]$/, addClosing: false, spellcheck: false, catchTab: true });
  jar.updateCode(code);
  const paintGutter = () => {
    const n = (jar.toString().match(/\n/g) || []).length + 1;
    let h = '';
    for (let i = 1; i <= n; i++) h += `<span class="${errorLines.has(i) ? 'err' : ''}">${i}</span>`;
    gutter.innerHTML = h;
  };
  paintGutter();
  let saveTimer;
  const saved = $('[data-saved]');
  jar.onUpdate((c) => {
    code = c;
    if (errorLines.size) { errorLines = new Set(); }
    paintGutter();
    saved.textContent = 'Saving…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { store.saveCode(exam.id, a.slug, code); saved.textContent = 'Saved on this device'; }, 400);
  });
  saved.textContent = store.getCode(exam.id, a.slug) != null ? 'Saved on this device' : '';
  const detachSuggest = attachSuggestions({ jar, editor: editorEl, host: $('[data-editor-wrap]') });
  function formatCode() {
    const before = jar.toString();
    const after = formatJava(before);
    if (after === before) { toast('Your code is already neatly indented'); return; }
    const line = before.slice(0, jar.save().start).split('\n').length;
    jar.updateCode(after);
    goToLine(line);
    toast('Indentation fixed. Only spaces changed, not your code.');
  }

  function goToLine(line) {
    pane = 'code'; syncPane();
    const text = jar.toString();
    let pos = 0;
    for (let i = 1; i < line; i++) { const nl = text.indexOf('\n', pos); if (nl < 0) break; pos = nl + 1; }
    editorEl.focus();
    try { jar.restore({ start: pos, end: pos, dir: '->' }); } catch {}
    const lh = parseFloat(getComputedStyle(editorEl).lineHeight) || 22;
    const wrap = $('[data-editor-wrap]');
    wrap.scrollTop = Math.max(0, (line - 4) * lh);
  }

  // ---------- panes ----------
  function syncPane() {
    ide.dataset.pane = pane;
    main.querySelectorAll('[data-pane-btn]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.paneBtn === pane)));
    if (pane === 'tests') leftTab = 'tests';
    if (pane === 'instructions') leftTab = 'instructions';
    main.querySelectorAll('[data-left]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.left === leftTab)));
    renderLeft();
  }
  function setConsole(which) {
    main.querySelectorAll('[data-con]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.con === which)));
    main.querySelectorAll('[data-con-panel]').forEach((p) => { p.hidden = p.dataset.conPanel !== which; });
  }
  setConsole('input');

  // ---------- left panel ----------
  function scoreText() {
    if (!lastTest) return prog.attempts ? `${prog.last ?? prog.best}/${total}` : '';
    if (lastTest.compileErrors) return '0/' + total;
    return `${lastTest.passed}/${lastTest.total}`;
  }
  function renderLeft() {
    const sc = scoreText();
    $('[data-tab-score]').textContent = sc;
    $('[data-tab-score2]').textContent = sc;
    if (leftTab === 'instructions') renderInstructions();
    else renderTests();
  }
  function renderInstructions() {
    const shown = prog.hints || 0;
    leftBody.innerHTML = `
      <div class="asg-intro">
        <div class="chip-row">
          <span class="tag diff-${a.difficulty}">${a.difficulty}</span>
          ${a.estimate ? `<span class="tag">${icon('clock')} ${esc(a.estimate)}</span>` : ''}
          ${prog.done ? `<span class="tag done-tag">${icon('check')} Completed</span>` : ''}
        </div>
        <h2 class="asg-title-big">${esc(a.title)}</h2>
        ${a.topics.length ? `<p class="muted small">Practices: ${a.topics.map(esc).join(' · ')}</p>` : ''}
      </div>
      <div class="prose asg-body">${md(a.instructions)}</div>
      ${a.checks.length ? `<h2 class="asg-h">Requirements</h2><ul class="req-list">${a.checks.map((c) => `<li>${icon(c.kind === 'forbid' ? 'x' : 'check')} ${esc(c.label)}</li>`).join('')}</ul>` : ''}
      ${a.hints.length ? `
        <h2 class="asg-h">Stuck?</h2>
        <ol class="hint-list">
          ${a.hints.slice(0, shown).map((h, i) => `<li class="prose"><span class="hint-n">Hint ${i + 1}</span>${md(h)}</li>`).join('')}
        </ol>
        ${shown < a.hints.length ? `<button class="btn small" data-more-hint>${icon('bulb')} ${shown ? 'Show the next hint' : 'Show a hint'} <span class="muted">(${shown + 1} of ${a.hints.length})</span></button>` : '<p class="muted small">That was the last hint.</p>'}` : ''}
      <p class="muted small exact-note">Output must match character for character. Text in <code>code font</code> or in a grey box is exact; a period after it in a sentence is not part of the output.</p>
      <div class="asg-nav">
        ${nextA ? `<a class="btn" href="#/code/${e}/${nextA.slug}">Next: ${esc(nextA.title)} ${icon('right')}</a>` : `<a class="btn" href="#/assignments/${e}">All assignments</a>`}
      </div>`;
    highlight(leftBody);
  }
  function renderTests() {
    const r = lastTest;
    const reqs = (r?.structure || a.checks.map((c) => ({ ...c, passed: null })));
    let head;
    if (!r) {
      head = `<div class="test-summary pending"><strong>${a.tests.length} tests${a.checks.length ? ` + ${a.checks.length} requirement${a.checks.length > 1 ? 's' : ''}` : ''}</strong><span class="muted">Click <b>Run tests</b> to check your code. Sample tests show their input and expected output; hidden tests show theirs after you run them.</span></div>`;
    } else if (r.killed) {
      head = `<div class="test-summary bad"><strong>Your program didn't finish</strong><span>It ran too long and was stopped. Look for a loop whose condition never becomes false.</span></div>`;
    } else if (r.compileErrors) {
      head = `<div class="test-summary bad"><strong>Your code doesn't compile yet</strong><span>Fix the error${r.compileErrors.length > 1 ? 's' : ''} below, then run the tests again.</span></div>
        ${errorList(r.compileErrors)}`;
    } else {
      const all = r.passed === r.total;
      head = `<div class="test-summary ${all ? 'good' : r.passed ? 'ok' : 'bad'}">
        <strong>${all ? `${icon('check')} All ${r.total} passed` : `${r.passed} of ${r.total} passed`}</strong>
        <span class="meter ${all ? 'good' : r.passed ? 'ok' : 'bad'}"><span style="width:${(r.passed / r.total) * 100}%"></span></span>
        ${all ? `<span>Nice work! This assignment is marked complete.${nextA ? ` <a href="#/code/${e}/${nextA.slug}">Next: ${esc(nextA.title)}</a>` : ''}</span>` : '<span>Open a failed test to compare your output with the expected output.</span>'}
      </div>`;
    }
    const testRows = a.tests.map((t, i) => {
      const res = r && !r.compileErrors && !r.killed ? r.results[i] : null;
      const st = !res ? 'pending' : res.passed ? 'pass' : 'fail';
      const open = res && !res.passed && r.results.findIndex((x) => !x.passed) === i;
      const showIO = t.sample || res;
      let detail = '';
      if (showIO) {
        if (!res) {
          detail = `<div class="io"><div><p class="io-h">Input</p><pre>${esc(t.input) || '<span class="muted">(none)</span>'}</pre></div><div><p class="io-h">Expected output</p><pre>${esc(t.output)}</pre></div></div>`;
        } else if (res.passed) {
          detail = `<div class="io"><div><p class="io-h">Input</p><pre>${esc(t.input) || '<span class="muted">(none)</span>'}</pre></div><div><p class="io-h">Your output (correct)</p><pre>${esc(clip(res.actual))}</pre></div></div>`;
        } else {
          const d = diffLines(t.output, res.actual);
          const wsOnly = normalizeOutput(res.actual).replace(/\s+/g, '') === normalizeOutput(t.output).replace(/\s+/g, '');
          const caseOnly = normalizeOutput(res.actual).toLowerCase() === normalizeOutput(t.output).toLowerCase();
          detail = `
            <div class="io"><div><p class="io-h">Input</p><pre>${esc(t.input) || '<span class="muted">(none)</span>'}</pre></div></div>
            ${res.timedOut ? '<p class="test-note bad">Stopped after 5 seconds. Is there an infinite loop?</p>' : ''}
            ${res.outputLimit ? '<p class="test-note bad">Your program printed far too much and was stopped. Is there an infinite loop?</p>' : ''}
            ${res.exception ? `<p class="test-note bad">Your program crashed: <code>${esc(res.exception.cls.replace(/^java\.(lang|util)\./, ''))}${res.exception.message ? ': ' + esc(res.exception.message) : ''}</code>${res.exception.stack?.[0] ? ` on <button class="link-btn" data-goto-line="${res.exception.stack[0].line}">line ${res.exception.stack[0].line}</button>` : ''}</p>` : ''}
            ${!res.timedOut && d.first >= 0 ? `<p class="test-note">First difference on output line ${d.first + 1}.${wsOnly ? ' Only spaces or line breaks differ.' : caseOnly ? ' Only upper/lower case differs.' : ''}</p>` : ''}
            <div class="diff" role="table" aria-label="Expected and actual output">
              <div class="diff-row diff-hd" role="row"><span role="columnheader">#</span><span role="columnheader">Expected</span><span role="columnheader">Your output</span></div>
              ${d.rows.map((row) => `<div class="diff-row ${row.same ? '' : 'bad'} ${row.i === d.first ? 'first' : ''}" role="row"><span role="cell">${row.i + 1}</span><span role="cell">${row.ex === undefined ? '<em class="muted">(no line)</em>' : showWs(row.ex) || '&nbsp;'}</span><span role="cell">${row.ac === undefined ? '<em class="muted">(missing)</em>' : showWs(row.ac) || '&nbsp;'}</span></div>`).join('')}
            </div>`;
        }
      }
      return `
        <details class="test-item ${st}" ${open ? 'open' : ''}>
          <summary>
            <span class="test-icon" aria-hidden="true">${st === 'pass' ? icon('check') : st === 'fail' ? icon('x') : ''}</span>
            <span class="test-name">${esc(humanize(t.name))}</span>
            <span class="tag">${t.sample ? 'Sample' : 'Hidden'}</span>
            <span class="muted small test-in">${showIO ? 'Input: ' + esc(firstLine(t.input)) : ''}</span>
            <span class="sr-only">${st === 'pass' ? 'passed' : st === 'fail' ? 'failed' : 'not run yet'}</span>
          </summary>
          ${detail || '<p class="muted small test-note">Run the tests to see this one.</p>'}
          ${showIO ? `<button class="link-btn small" data-use-input="${i}">Use this input in the Run box</button>` : ''}
        </details>`;
    }).join('');
    leftBody.innerHTML = `
      ${head}
      ${reqs.length ? `<h2 class="asg-h">Requirements</h2><ul class="req-list">${reqs.map((c) => `<li class="${c.passed === true ? 'pass' : c.passed === false ? 'fail' : ''}">${c.passed === true ? icon('check') : c.passed === false ? icon('x') : icon('note')} ${esc(c.label)}</li>`).join('')}</ul>` : ''}
      <h2 class="asg-h">Tests</h2>
      <div class="test-list">${testRows}</div>`;
  }
  function errorList(errors) {
    return `<ul class="err-list">${errors.map((x) => `<li><button class="link-btn" data-goto-line="${x.line}">Line ${x.line}</button> <span>${esc(x.message.split('\n')[0])}</span>${x.message.includes('\n') ? `<pre>${esc(x.message.split('\n').slice(1).join('\n'))}</pre>` : ''}</li>`).join('')}</ul>`;
  }

  // ---------- run / test ----------
  function setBusy(b, what) {
    busy = b;
    main.querySelectorAll('[data-run],[data-test]').forEach((x) => { x.disabled = b; });
    status.textContent = b ? what : status.textContent;
  }
  async function doRun() {
    if (busy) return;
    pane = 'code'; syncPane();
    setConsole('output');
    out.innerHTML = '<span class="muted">Running…</span>';
    $('[data-compare]').innerHTML = '';
    setBusy(true, 'Running…');
    const r = await runJava(jar.toString(), inputEl.value, { className: a.cls, fileName }).catch((err) => ({ crash: String(err.message || err) }));
    setBusy(false);
    lastRun = r;
    errorLines = new Set();
    if (r.crash) { out.innerHTML = `<span class="bad">The runner had a problem: ${esc(r.crash)}</span>`; status.textContent = ''; return; }
    if (r.compileErrors) {
      r.compileErrors.forEach((x) => errorLines.add(x.line));
      out.innerHTML = `<span class="bad">${esc(r.errorText)}</span>`;
      status.innerHTML = `<span class="bad">${r.compileErrors.length} compile error${r.compileErrors.length > 1 ? 's' : ''}</span>`;
      paintGutter();
      return;
    }
    if (r.killed) { out.innerHTML = '<span class="bad">Your program was stopped because it ran too long. Is there an infinite loop?</span>'; status.textContent = 'Stopped'; return; }
    const exLine = r.exception?.stack?.find((s) => s.cls === a.cls)?.line;
    if (exLine) errorLines.add(exLine);
    paintGutter();
    const stopped = r.timedOut ? 'Stopped after 5 seconds. Is there an infinite loop? Here is what it printed before it was stopped:'
      : r.outputLimit ? 'Your program printed far too much and was stopped. Is there an infinite loop? Here is the start of what it printed:' : '';
    out.innerHTML = (stopped ? `<span class="bad">${stopped}</span>\n\n` : '')
      + (r.stdout ? esc(clip(r.stdout)) : '<span class="muted">(Your program printed nothing.)</span>')
      + (r.stderr && !r.outputLimit ? `\n<span class="bad">${esc(r.stderr)}</span>` : '');
    out.scrollTop = 0;
    status.textContent = r.timedOut || r.outputLimit ? 'Stopped' : r.exception ? 'Crashed' : `Finished in ${r.ms ?? 0} ms`;
    showCompare(r);
    if (r.exception && /NoSuchElementException/.test(r.exception.cls)) {
      out.innerHTML += '\n<span class="muted">Tip: your program tried to read more input than the Input box has.</span>';
    }
  }
  // After Run: if the input is one of the sample tests, compare with its expected output
  const words = (x) => normalizeOutput(x).split(/\s+/).filter(Boolean).join(' ');
  function showCompare(r) {
    const box = $('[data-compare]');
    const sample = a.tests.find((t) => t.sample && words(t.input) === words(inputEl.value));
    if (!sample) {
      box.innerHTML = a.tests.some((t) => t.sample) ? '<p class="muted small">Tip: load a sample input (Input tab) and Run to compare your output with the expected output.</p>' : '';
      return;
    }
    const d = diffLines(sample.output, r.stdout || '');
    if (d.first < 0) { box.innerHTML = `<p class="compare-ok">${icon('check')} Matches the expected output for the sample "${esc(humanize(sample.name))}".</p>`; return; }
    box.innerHTML = `<p class="compare-bad">${icon('x')} Different from the expected output for the sample "${esc(humanize(sample.name))}", first on line ${d.first + 1}.</p>
      <div class="diff" role="table" aria-label="Expected and actual output">
        <div class="diff-row diff-hd" role="row"><span role="columnheader">#</span><span role="columnheader">Expected</span><span role="columnheader">Your output</span></div>
        ${d.rows.map((row) => `<div class="diff-row ${row.same ? '' : 'bad'} ${row.i === d.first ? 'first' : ''}" role="row"><span role="cell">${row.i + 1}</span><span role="cell">${row.ex === undefined ? '<em class="muted">(no line)</em>' : showWs(row.ex) || '&nbsp;'}</span><span role="cell">${row.ac === undefined ? '<em class="muted">(missing)</em>' : showWs(row.ac) || '&nbsp;'}</span></div>`).join('')}
      </div>`;
  }

  async function doTest() {
    if (busy) return;
    setBusy(true, 'Testing…');
    leftTab = 'tests';
    if (matchMedia('(max-width: 900px)').matches) pane = 'tests';
    syncPane();
    leftBody.insertAdjacentHTML('afterbegin', '<p class="muted testing-note">Running tests…</p>');
    const r = await testJava(jar.toString(), spec, fileName).catch((err) => ({ crash: String(err.message || err) }));
    setBusy(false);
    status.textContent = '';
    if (r.crash) { toast('The runner had a problem: ' + r.crash, 'bad'); return; }
    lastTest = r;
    errorLines = new Set();
    if (r.compileErrors) r.compileErrors.forEach((x) => errorLines.add(x.line));
    paintGutter();
    const passed = r.compileErrors || r.killed ? 0 : r.passed;
    const wasDone = prog.done;
    prog = store.recordTestRun(exam.id, a.slug, passed, total);
    store.saveCode(exam.id, a.slug, jar.toString());
    renderLeft();
    if (!wasDone && prog.done) toast('All tests passed. Assignment complete!', 'good');
  }

  // ---------- events ----------
  main.addEventListener('click', async (ev) => {
    const b = ev.target.closest('button, a');
    if (!b) return;
    if (b.dataset.paneBtn) { pane = b.dataset.paneBtn; syncPane(); if (pane === 'code') editorEl.focus(); return; }
    if (b.dataset.left) { leftTab = b.dataset.left; pane = leftTab === 'tests' ? 'tests' : 'instructions'; syncPane(); return; }
    if (b.dataset.con) { setConsole(b.dataset.con); return; }
    if ('run' in b.dataset) return doRun();
    if ('test' in b.dataset) return doTest();
    if (b.dataset.gotoLine) return goToLine(Number(b.dataset.gotoLine));
    if (b.dataset.loadInput) { const t = a.tests.find((x) => x.name === b.dataset.loadInput); inputEl.value = t.input; inputEl.dispatchEvent(new Event('input')); return; }
    if (b.dataset.useInput) { inputEl.value = a.tests[Number(b.dataset.useInput)].input; inputEl.dispatchEvent(new Event('input')); pane = 'code'; syncPane(); setConsole('input'); toast('Input copied to the Run box'); return; }
    if ('moreHint' in b.dataset) { prog = store.saveAsgProgress(exam.id, a.slug, { hints: Math.min(a.hints.length, (prog.hints || 0) + 1) }); renderLeft(); leftBody.querySelector('.hint-list li:last-child')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); return; }
    if ('download' in b.dataset) {
      const blob = new Blob([jar.toString()], { type: 'text/x-java' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob); link.download = fileName;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 2000);
      return;
    }
    if ('format' in b.dataset) return formatCode();
    if ('reset' in b.dataset) {
      const ok = await confirmDialog({ title: 'Start over?', body: `<p>Your code will be replaced with the original starter code. Download it first if you want to keep a copy.</p>`, confirm: 'Reset code', danger: true });
      if (ok) { jar.updateCode(a.starter); code = a.starter; store.clearCode(exam.id, a.slug); paintGutter(); saved.textContent = ''; toast('Code reset to the starter'); }
    }
  });
  inputEl.addEventListener('input', () => { try { sessionStorage.setItem(`qp1:input:${exam.id}:${a.slug}`, inputEl.value); } catch {} });
  const onKey = (ev) => {
    if (modalOpen()) return;
    const mod = ev.ctrlKey || ev.metaKey;
    if (mod && ev.key === 'Enter') { ev.preventDefault(); if (ev.shiftKey) doRun(); else doTest(); }
    else if (ev.shiftKey && ev.altKey && (ev.code === 'KeyF')) { ev.preventDefault(); formatCode(); }
    else if (mod && (ev.key === 's' || ev.key === 'S')) { ev.preventDefault(); store.saveCode(exam.id, a.slug, jar.toString()); saved.textContent = 'Saved on this device'; toast('Saved on this device'); }
  };
  document.addEventListener('keydown', onKey);

  syncPane();
  if (matchMedia('(min-width: 901px)').matches) { pane = 'code'; ide.dataset.pane = 'code'; }
  return () => {
    clearTimeout(saveTimer);
    store.saveCode(exam.id, a.slug, jar.toString());
    if (jar.toString() === a.starter) store.clearCode(exam.id, a.slug);
    document.removeEventListener('keydown', onKey);
    detachSuggest();
    jar.destroy();
  };
}
