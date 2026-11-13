// "Check a question file": drop a questions.md to see problems and preview it as a student.
// Runs entirely in the browser; the file is never uploaded anywhere.
import { parseExam, TYPE_LABELS } from '../parser.js';
import { addPreviewExam } from '../data.js';
import { esc, icon, plural } from '../ui.js';
import { go } from '../main.js';

const CHEATSHEET = `---
title: Midterm 2
active: true
time_limit: 75
---

# Topic: Recursion

## Q1 · single · easy · on-exam
Question text. **Markdown**, \`code\` and $math$ work.
- [ ] Wrong choice
- [x] Right choice
> Hint: optional
> Explanation: why it's right

## Q2 · multi
- [x] Correct
- [x] Also correct
- [ ] Wrong

## Q3 · truefalse
= true

## Q4 · numeric
= 3.14 ± 0.01

## Q5 · text
= answer | other accepted answer`;

export async function render(main) {
  main.innerHTML = `
    <section class="page author">
      <h1>Check a question file</h1>
      <p class="lead">Drop a <code>questions.md</code> file to find mistakes before you publish it, then try it as a student. The file stays on this computer.</p>
      <label class="dropzone" data-drop>
        ${icon('upload')}
        <strong>Drop questions.md here</strong>
        <span class="muted">or click to choose a file</span>
        <input type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" hidden data-file>
      </label>
      <div data-report></div>
      <details class="cheatsheet">
        <summary>Question format cheat sheet</summary>
        <pre><code>${esc(CHEATSHEET)}</code></pre>
        <ul class="small">
          <li><strong>Types:</strong> single, multi, truefalse, numeric, text. If you leave it out, the type is guessed from the answers.</li>
          <li><strong>Difficulty:</strong> easy, medium (default), hard.</li>
          <li><strong>on-exam</strong> puts the question in the "Timed practice test", in file order.</li>
          <li><strong>2pts</strong> makes a question worth 2 points.</li>
          <li>Images: put them in the exam's <code>images/</code> folder and write <code>![description](images/file.png)</code>.</li>
          <li>Write <code>&lt;!-- CHECK: reason --&gt;</code> to leave yourself a note. It shows as a warning until you remove it.</li>
        </ul>
      </details>
    </section>`;

  const drop = main.querySelector('[data-drop]');
  const input = main.querySelector('[data-file]');
  const report = main.querySelector('[data-report]');

  async function handle(file) {
    if (!file) return;
    if (/\.(pdf|docx?|pptx?)$/i.test(file.name)) {
      report.innerHTML = `<div class="report bad"><h2>That's a ${esc(file.name.split('.').pop().toUpperCase())} file</h2><p>This checker reads question files in the text format below. PDFs and Word files need converting into a <code>questions.md</code> first (see "Adding a new exam" in the README).</p></div>`;
      return;
    }
    const text = await file.text();
    const res = parseExam(text, { fallbackTitle: file.name.replace(/\.(md|markdown|txt)$/i, '') });
    const counts = {};
    res.questions.forEach((q) => (counts[q.type] = (counts[q.type] || 0) + 1));
    const noExpl = res.questions.filter((q) => !q.explanation).length;
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    const issue = (x, kind) => `
      <li class="${kind}">
        <span class="issue-line">Line ${x.line}</span>
        <span>${esc(x.message)}</span>
        ${lines[x.line - 1] != null ? `<code class="issue-src">${esc(lines[x.line - 1].slice(0, 140))}</code>` : ''}
      </li>`;
    report.innerHTML = `
      <div class="report ${res.errors.length ? 'bad' : 'good'}">
        <h2>${res.errors.length ? `${plural(res.errors.length, 'problem')} to fix` : 'Ready to publish'}</h2>
        <p><strong>${esc(res.meta.title)}</strong>: ${plural(res.questions.length, 'question')}, ${plural(res.topics.length, 'topic')}, ${res.questions.filter((q) => q.onExam).length} in the timed practice test${res.meta.timeLimit ? `, ${res.meta.timeLimit} minutes` : ''}.</p>
        <p class="muted small">${Object.entries(counts).map(([t, n]) => `${n} ${TYPE_LABELS[t] ? TYPE_LABELS[t].toLowerCase() : t}`).join(' · ')}${noExpl ? ` · ${noExpl} without an explanation` : ''}</p>
        ${res.errors.length ? `<ul class="issues">${res.errors.map((x) => issue(x, 'err')).join('')}</ul>` : ''}
        ${res.warnings.length ? `<h3>${plural(res.warnings.length, 'warning')}</h3><ul class="issues">${res.warnings.map((x) => issue(x, 'warn')).join('')}</ul>` : ''}
        <div class="topics-preview">${res.topics.map((t) => `<span class="tag">${esc(t.name)} · ${t.count}</span>`).join('')}</div>
        ${res.questions.length ? `<div class="row"><button class="btn primary" data-preview>Try it as a student</button>${res.errors.length ? '<span class="muted small">Questions with problems may not work right in the preview.</span>' : ''}</div>` : ''}
        <p class="muted small">Images only show up after the exam is published, or in the local preview with <code>npm run dev</code>.</p>
      </div>`;
    report.querySelector('[data-preview]')?.addEventListener('click', () => {
      const usable = { ...res, questions: res.questions.filter((q) => q.type && (q.options?.length >= 2 || q.answer)) };
      const exam = addPreviewExam(usable, file.name.replace(/\.[^.]+$/, ''));
      go(`#/exam/${encodeURIComponent(exam.id)}`);
    });
    report.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  input.onchange = () => handle(input.files[0]);
  ['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => handle(e.dataTransfer.files[0]));
}
