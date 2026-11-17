// Build my course, step 1: the kind of course, the term and exam dates, what to make, and ALL the
// professor's materials. Done once, before classes start. The site reads the words out of the files
// (materials.js) and saves that text with the class; later steps hand it to the professor's own AI
// one unit at a time. Only the class's instructor (or an admin) can use this page.
import * as cloud from '../cloud.js';
import { esc, icon, toast, modal, confirmDialog, plural } from '../ui.js';
import { readMaterial, packChunks, ACCEPT } from '../materials.js';
import { createBuild } from '../build/engine.js';

const KINDS = [
  ['concepts', 'Concepts and facts', 'Terms, ideas, cases and readings. Multiple choice, short answers and written answers.'],
  ['programming', 'Java programming', 'Students write and run Java. Every solution is checked by running it against tests.'],
  ['math', 'Math and numbers', 'Problems with number answers. Formula answers and graphs are coming soon.'],
];
const MAKE = [
  ['notes', 'Study notes for each unit', false],
  ['practice', 'A practice set for each unit', false],
  ['quiz', 'A quiz for each unit', false],
  ['exams', 'Midterms and the final (question banks you pick from)', false],
  ['assignments', 'Programming assignments', true],
  ['progExams', 'Programming exams', true],
];
const KIND_LABEL = { pdf: 'PDF', pptx: 'PowerPoint', docx: 'Word', text: 'Text' };
const num = (n) => Number(n || 0).toLocaleString();
const dayLabel = (s) => (s ? new Date(s + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : '');

function defaults(cls) {
  const cs = /\b(cs|cse|comp|computer|program)/i.test(`${cls.course || ''} ${cls.name || ''}`);
  return {
    kinds: { concepts: true, programming: cs, math: false },
    firstDay: '', lastDay: '',
    exams: [{ name: 'Midterm 1', date: '' }, { name: 'Midterm 2', date: '' }, { name: 'Final exam', date: '' }],
    make: { notes: true, practice: true, quiz: true, exams: true, assignments: cs, progExams: false },
    wishes: '', approveMap: true, team: false, partSize: 0,
  };
}

export async function render(main, { classId }) {
  if (!cloud.enabled || !cloud.currentUser()) { main.innerHTML = '<section class="page"><h1>Build my course</h1><p>Sign in with your school account first.</p></section>'; return; }
  const cls = cloud.myClasses().find((c) => c.id === classId) || (cloud.isAdmin() ? await cloud.getClass(classId).catch(() => null) : null);
  if (!cls) { main.innerHTML = '<section class="page"><h1>Build my course</h1><p>This class wasn\'t found.</p><p><a class="btn" href="#/instructor">Back</a></p></section>'; return; }
  const back = `#/instructor?class=${encodeURIComponent(classId)}`;
  if (!cloud.leadsClass(classId)) {
    main.innerHTML = `<section class="page"><h1>Build my course</h1><p>The course is set up by the class's instructor. As a TA you can see the practice and graded work it makes once the instructor approves them.</p><p><a class="btn" href="${back}">Back to the class</a></p></section>`;
    return;
  }

  let setup, materials, roster, build;
  try {
    [setup, materials, roster, build] = await Promise.all([cloud.getBuilderSetup(classId), cloud.listMaterials(classId), cloud.getRoster(classId).catch(() => []), cloud.getBuild(classId)]);
  } catch (e) {
    main.innerHTML = `<section class="page"><h1>Build my course</h1><p class="bad">${e?.code === 'permission-denied' ? 'This needs the latest security rules. Ask the site admin to publish the newest firestore.rules.' : esc(e?.message || String(e))}</p><p><a class="btn" href="${back}">Back to the class</a></p></section>`;
    return;
  }
  const d0 = defaults(cls);
  setup = { ...d0, ...(setup || {}), kinds: { ...d0.kinds, ...(setup?.kinds || {}) }, make: { ...d0.make, ...(setup?.make || {}) }, exams: setup?.exams?.length ? setup.exams : d0.exams };
  const sections = [...new Set(roster.filter((p) => !p.role || p.role === 'student').map((p) => String(p.section || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const reading = []; // files being read right now: { key, name, state: 'reading' | 'error', msg }
  let alive = true;

  main.innerHTML = `
    <section class="page builder">
      <nav class="crumbs" aria-label="Breadcrumb"><a href="${back}">Class dashboard</a><span aria-hidden="true">›</span><span>Build my course</span></nav>
      <p class="eyebrow">${esc(cls.name || classId)} · Build my course <span class="tag">Preview</span></p>
      <h1>Build my course with AI</h1>
      <p class="lead">Do this once, before classes start. Put everything in now and you won't need to come back each week. Your own AI will make the study notes, practice, quizzes and exams from your materials, one step at a time, and Cramming checks every step.</p>
      ${build ? `<p class="note build-banner" role="status">${build.st.phase === 'done' ? 'Your course has been built from these materials.' : `A build is under way: ${build.done || 0} of ${build.total || 0} jobs done.`} <a href="#/build/${encodeURIComponent(classId)}/go"><strong>Open it</strong></a>. Changes you make below only count if you start again.</p>` : ''}
      <ol class="build-steps" aria-label="Steps">
        <li class="on" aria-current="step"><span>1</span> Course and materials</li>
        <li><span>2</span> Connect your AI</li>
        <li><span>3</span> Check the course map</li>
        <li><span>4</span> Building</li>
        <li><span>5</span> Review and schedule</li>
      </ol>

      <form class="build-form" data-setup novalidate>
        <fieldset>
          <legend>What kind of course is this?</legend>
          <p class="muted small">Tick everything that fits. It decides what can be made.</p>
          <div class="kind-picks">
            ${KINDS.map(([k, label, hint]) => `<label class="kind-pick"><input type="checkbox" name="kind-${k}" ${setup.kinds[k] ? 'checked' : ''}><span><strong>${label}</strong><span class="muted small block">${hint}</span></span></label>`).join('')}
          </div>
        </fieldset>

        <div class="build-two">
          <fieldset class="mat-box">
            <legend>Your course materials</legend>
            <div class="dropzone" data-drop>
              <p class="drop-hint">${icon('upload')} <strong>Drop all your files here</strong></p>
              <p class="muted small">Syllabus, slides, notes, old exams. PDF, PowerPoint (.pptx), Word (.docx) or text.</p>
              <div class="row center"><label class="btn">Choose files<input type="file" multiple accept="${ACCEPT}" data-files hidden></label></div>
            </div>
            <p class="mat-total" data-total aria-live="polite"></p>
            <ul class="mat-list" data-list aria-label="Files added"></ul>
            <p class="note small">Cramming reads the <strong>words</strong> in your files and saves only that text with this class. It does not read pictures, diagrams or handwriting in slides. Add only material you have the right to share.</p>
          </fieldset>

          <fieldset>
            <legend>Your term</legend>
            <div class="grid2">
              <label class="field"><span>First day of class</span><input type="date" name="firstDay" value="${esc(setup.firstDay)}"></label>
              <label class="field"><span>Last day of class</span><input type="date" name="lastDay" value="${esc(setup.lastDay)}"></label>
            </div>
            <p class="bad small" data-term-err role="alert"></p>
            <div><p class="field-label">Sections</p>
              ${sections.length ? `<p class="chips">${sections.map((s) => `<span class="chip">${esc(s)}</span>`).join('')}</p>` : '<p class="muted small">No sections on the roster yet. They come from the class roster.</p>'}</div>
            <div><p class="field-label" id="exam-dates">Exam dates</p>
              <div data-exams role="group" aria-labelledby="exam-dates"></div>
              <button type="button" class="btn small" data-add-exam>${icon('plus')} Add an exam</button></div>
          </fieldset>
        </div>

        <fieldset>
          <legend>What should be made</legend>
          <div class="make-picks">
            ${MAKE.map(([k, label, prog]) => `<label class="check-line"><input type="checkbox" name="make-${k}" ${setup.make[k] ? 'checked' : ''} ${prog ? 'data-prog' : ''}><span>${label}${prog ? ' <span class="muted small" data-prog-note></span>' : ''}</span></label>`).join('')}
          </div>
          <label class="field"><span>Anything you want the AI to know <span class="muted">(optional, in your own words)</span></span>
            <textarea name="wishes" rows="3" maxlength="2000" placeholder="For example: more code-tracing questions, fewer definitions. Use the variable names from my slides.">${esc(setup.wishes)}</textarea></label>
          <label class="field topline"><span>Build it</span><select name="partSize">${[[0, 'All at once'], [2, '2 units at a time'], [3, '3 units at a time (recommended for a full term)'], [5, '5 units at a time']].map(([v, t]) => `<option value="${v}" ${Number(setup.partSize || 0) === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
          <p class="muted small">In parts, the first units are built and then it stops, so you can look at them before the rest is made. It also keeps a long course inside one day\'s free limits and your AI\'s own limit.</p>
          <label class="check-line topline"><input type="checkbox" name="team" ${setup.team ? 'checked' : ''}><span>Use three chats: one builds, one checks, one gives a final fresh look <span class="muted">(most careful; takes two to three times as long)</span></span></label>
          <label class="check-line"><input type="checkbox" name="approveMap" ${setup.approveMap ? 'checked' : ''}><span>Let me check the course map before the rest is built <span class="muted">(recommended)</span></span></label>
        </fieldset>
      </form>

      <div class="build-ready">
        <div><h2>Ready for the next step?</h2><ul class="ready-list" data-ready aria-live="polite"></ul></div>
        <div class="ready-side">
          <p class="save-state" data-save aria-live="polite"></p>
          <button type="button" class="btn primary" data-start>${build ? 'Start again with these materials' : 'Next: connect your AI'}</button>
          <p class="muted small" data-start-note>${build ? 'Starting again throws away what the current build has made.' : 'Next you connect Claude, ChatGPT or Gemini. You can still come back and change things before it starts.'}</p>
        </div>
      </div>
    </section>`;

  const $ = (s) => main.querySelector(s);
  const form = $('[data-setup]');

  // ---------- exam dates
  function drawExams() {
    $('[data-exams]').innerHTML = setup.exams.map((x, i) => `
      <div class="exam-row" data-exam="${i}">
        <label class="field"><span class="sr-only">Exam ${i + 1} name</span><input name="exam-name" value="${esc(x.name)}" maxlength="60" placeholder="Exam name"></label>
        <label class="field"><span class="sr-only">Date of ${esc(x.name || `exam ${i + 1}`)}</span><input type="date" name="exam-date" value="${esc(x.date)}"></label>
        <button type="button" class="btn small icon-btn" data-del-exam="${i}" aria-label="Remove ${esc(x.name || `exam ${i + 1}`)}">${icon('trash')}</button>
      </div>`).join('') || '<p class="muted small">No exams. Add one if the course has any.</p>';
  }

  // ---------- materials
  function drawMaterials() {
    const list = $('[data-list]');
    const rows = materials.map((m) => `
      <li class="mat-row">
        <span class="mat-kind" aria-hidden="true">${esc(KIND_LABEL[m.kind] || 'File')}</span>
        <span class="mat-main"><strong>${esc(m.name)}</strong>
          <span class="muted small block">${plural(m.parts, m.unit || 'part')} · ${num(m.words)} words${m.emptyParts ? ` · <span class="warn-text">${plural(m.emptyParts, m.unit || 'part')} had no words (pictures only?)</span>` : ''}</span></span>
        <span class="mat-actions"><button type="button" class="btn small" data-see="${esc(m.id)}">See the text</button><button type="button" class="btn small icon-btn" data-remove="${esc(m.id)}" aria-label="Remove ${esc(m.name)}">${icon('trash')}</button></span>
      </li>`);
    const live = reading.map((r) => `
      <li class="mat-row ${r.state}">
        <span class="mat-kind" aria-hidden="true">${r.state === 'error' ? '!' : '…'}</span>
        <span class="mat-main"><strong>${esc(r.name)}</strong><span class="small block ${r.state === 'error' ? 'bad' : 'muted'}">${r.state === 'error' ? esc(r.msg) : 'Reading…'}</span></span>
        <span class="mat-actions">${r.state === 'error' ? `<button type="button" class="btn small" data-dismiss="${r.key}">Dismiss</button>` : ''}</span>
      </li>`);
    list.innerHTML = rows.join('') + live.join('');
    const words = materials.reduce((n, m) => n + (m.words || 0), 0);
    $('[data-total]').textContent = materials.length ? `${plural(materials.length, 'file')} read · ${num(words)} words` : '';
    drawReady();
  }

  let seq = 0, queue = Promise.resolve();
  function addFiles(files) {
    for (const file of files) {
      const item = { key: ++seq, name: file.name, state: 'reading' };
      reading.push(item);
      queue = queue.then(async () => {
        if (!alive) return;
        try {
          const m = await readMaterial(file);
          const old = materials.find((x) => x.name === m.name);
          const saved = await cloud.addMaterial(classId, m, packChunks(m.parts));
          if (old) { await cloud.deleteMaterial(classId, old).catch(() => {}); materials = materials.filter((x) => x.id !== old.id); }
          materials.push(saved);
          reading.splice(reading.indexOf(item), 1);
          if (old) toast(`Replaced ${m.name} with the new copy`);
        } catch (e) {
          item.state = 'error';
          item.msg = e?.code === 'permission-denied' ? "Couldn't save it. Ask the site admin to publish the newest firestore.rules." : e?.message || String(e);
        }
        if (alive) drawMaterials();
      });
    }
    drawMaterials();
  }

  async function seeText(m) {
    const dlg = modal({ title: m.name, wide: true, body: '<p class="muted loading-line">Loading the text…</p>' });
    try {
      const parts = await cloud.getMaterialText(classId, m);
      const shown = parts.slice(0, 80);
      const body = dlg.el.querySelector('.modal-body');
      const html = `<p class="muted small">This is what Cramming read from the file, and all your AI will be given from it.</p>
        <div class="mat-text" tabindex="0" role="region" aria-label="Text read from ${esc(m.name)}">${shown.map((p) => `<h3>${esc(p.label)}</h3>${p.text ? `<pre>${esc(p.text)}</pre>` : '<p class="muted small">No words on this one.</p>'}`).join('')}
        ${parts.length > shown.length ? `<p class="muted small">…and ${plural(parts.length - shown.length, 'more part')}.</p>` : ''}</div>`;
      const slot = body.querySelector('.loading-line');
      if (slot) slot.outerHTML = html;
    } catch (e) {
      const slot = dlg.el.querySelector('.loading-line');
      if (slot) { slot.className = 'bad'; slot.textContent = "Couldn't load the text: " + (e?.message || e); }
    }
  }

  // ---------- reading the form, saving by itself
  function readForm() {
    const el = form.elements;
    for (const [k] of KINDS) setup.kinds[k] = el[`kind-${k}`].checked;
    for (const [k] of MAKE) setup.make[k] = el[`make-${k}`].checked;
    setup.firstDay = el.firstDay.value; setup.lastDay = el.lastDay.value;
    setup.wishes = el.wishes.value.trim(); setup.approveMap = el.approveMap.checked; setup.team = el.team.checked; setup.partSize = Number(el.partSize.value) || 0;
    setup.exams = [...form.querySelectorAll('[data-exam]')].map((row) => ({ name: row.querySelector('[name=exam-name]').value.trim(), date: row.querySelector('[name=exam-date]').value }));
  }
  function syncProg() {
    const prog = setup.kinds.programming;
    form.querySelectorAll('[data-prog]').forEach((box) => { box.disabled = !prog; if (!prog) box.checked = false; });
    form.querySelectorAll('[data-prog-note]').forEach((n) => { n.textContent = prog ? '' : '(tick Java programming above to use this)'; });
    if (!prog) { setup.make.assignments = false; setup.make.progExams = false; }
  }
  function problems() {
    const out = [];
    if (!Object.values(setup.kinds).some(Boolean)) out.push(['kind', 'Tick the kind of course']);
    const termBad = setup.firstDay && setup.lastDay && setup.lastDay <= setup.firstDay;
    if (!setup.firstDay || !setup.lastDay || termBad) out.push(['term', termBad ? 'The last day of class must be after the first day' : 'Add the first and last day of class']);
    const outside = setup.exams.filter((x) => x.date && setup.firstDay && x.date < setup.firstDay);
    if (outside.length) out.push(['exams', `${outside.map((x) => x.name || 'An exam').join(', ')} ${outside.length === 1 ? 'is' : 'are'} dated before the first day of class`]);
    if (!materials.length) out.push(['files', 'Add your course materials']);
    if (!Object.values(setup.make).some(Boolean)) out.push(['make', 'Tick at least one thing to make']);
    return out;
  }
  function drawReady() {
    const bad = new Map(problems());
    const dated = setup.exams.filter((x) => x.name && x.date).length;
    const line = (key, okText) => `<li class="${bad.has(key) ? 'todo' : 'done'}">${icon(bad.has(key) ? 'right' : 'check')}<span>${esc(bad.has(key) ? bad.get(key) : okText)}</span></li>`;
    $('[data-ready]').innerHTML =
      line('kind', `Kind of course: ${KINDS.filter(([k]) => setup.kinds[k]).map(([, l]) => l.toLowerCase()).join(', ')}`) +
      line('term', `Term: ${dayLabel(setup.firstDay)} to ${dayLabel(setup.lastDay)}`) +
      (bad.has('exams') ? line('exams', '') : `<li class="done">${icon('check')}<span>${dated ? `${plural(dated, 'exam')} with a date` : 'No exam dates (that is fine if there are no exams)'}</span></li>`) +
      line('files', `${plural(materials.length, 'file')} read`) +
      line('make', `${plural(Object.values(setup.make).filter(Boolean).length, 'kind')} of material to make`);
    const termErr = bad.get('term');
    $('[data-term-err]').textContent = termErr && setup.firstDay && setup.lastDay ? termErr : '';
    const busy = reading.some((r) => r.state === 'reading');
    $('[data-start]').disabled = bad.size > 0 || busy || starting;
  }
  let saveTimer = null, saving = false, again = false, starting = false;
  async function start(btn) {
    if (build) {
      const ok = await confirmDialog({ title: 'Start again?', body: '<p>Everything the current build has made is deleted and its link stops working. Your materials and settings are kept.</p>', confirm: 'Start again', danger: true });
      if (!ok) return;
    }
    starting = true; btn.disabled = true; btn.textContent = 'Getting ready…';
    try {
      clearTimeout(saveTimer); readForm(); await save();
      const files = [];
      for (const m of materials) files.push({ id: m.id, name: m.name, chunks: m.chunks || 0, parts: await cloud.getMaterialText(classId, m) });
      const st = createBuild({ kinds: setup.kinds, firstDay: setup.firstDay, lastDay: setup.lastDay, exams: setup.exams.filter((x) => x.name && x.date), make: setup.make, wishes: setup.wishes, approveMap: setup.approveMap, team: !!setup.team, partSize: Number(setup.partSize) || 0 }, files);
      await cloud.startBuild(classId, st);
      location.hash = `#/build/${encodeURIComponent(classId)}/go`;
    } catch (e) {
      starting = false; btn.textContent = build ? 'Start again with these materials' : 'Next: connect your AI'; drawReady();
      toast("Couldn't start: " + (e?.code === 'permission-denied' ? 'ask the site admin to publish the newest firestore.rules.' : e?.message || e), 'bad');
    }
  }
  async function save() {
    if (saving) { again = true; return; }
    saving = true;
    $('[data-save]').textContent = 'Saving…';
    try {
      await cloud.saveBuilderSetup(classId, { kinds: setup.kinds, firstDay: setup.firstDay, lastDay: setup.lastDay, exams: setup.exams.filter((x) => x.name || x.date), make: setup.make, wishes: setup.wishes, partSize: Number(setup.partSize) || 0, team: !!setup.team, approveMap: setup.approveMap });
      if (alive) $('[data-save]').innerHTML = `${icon('check')} All changes saved`;
    } catch (e) {
      if (alive) $('[data-save]').innerHTML = `<span class="bad">Couldn't save: ${esc(e?.code === 'permission-denied' ? 'ask the site admin to publish the newest firestore.rules.' : e?.message || String(e))}</span>`;
    }
    saving = false;
    if (again) { again = false; save(); }
  }
  function changed() {
    readForm(); syncProg(); drawReady();
    clearTimeout(saveTimer);
    $('[data-save]').textContent = 'Saving…';
    saveTimer = setTimeout(save, 700);
  }

  // ---------- events
  form.addEventListener('submit', (ev) => ev.preventDefault());
  form.addEventListener('input', (ev) => { if (!ev.target.matches('[data-files]')) changed(); });
  form.addEventListener('change', (ev) => {
    if (ev.target.matches('[data-files]')) { addFiles([...ev.target.files]); ev.target.value = ''; return; }
    changed();
  });
  main.addEventListener('click', async (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    if ('start' in b.dataset) { start(b); return; }
    if ('addExam' in b.dataset) { readForm(); setup.exams.push({ name: '', date: '' }); drawExams(); form.querySelector('[data-exam]:last-child [name=exam-name]')?.focus(); changed(); return; }
    if (b.dataset.delExam != null) { readForm(); setup.exams.splice(Number(b.dataset.delExam), 1); drawExams(); changed(); $('[data-add-exam]').focus(); return; }
    if (b.dataset.dismiss) { const i = reading.findIndex((r) => String(r.key) === b.dataset.dismiss); if (i >= 0) reading.splice(i, 1); drawMaterials(); return; }
    if (b.dataset.see) { const m = materials.find((x) => x.id === b.dataset.see); if (m) seeText(m); return; }
    if (b.dataset.remove) {
      const m = materials.find((x) => x.id === b.dataset.remove); if (!m) return;
      const ok = await confirmDialog({ title: `Remove ${m.name}?`, body: '<p>Its text is deleted from this class. Your own file is not touched, and you can add it again.</p>', confirm: 'Remove', danger: true });
      if (!ok) return;
      try { await cloud.deleteMaterial(classId, m); materials = materials.filter((x) => x.id !== m.id); drawMaterials(); toast(`${m.name} removed`); $('[data-files]').closest('label').focus?.(); }
      catch (e) { toast("Couldn't remove it: " + (e?.message || e), 'bad'); }
    }
  });
  // drag and drop
  const zone = $('[data-drop]');
  const hasFiles = (ev) => [...(ev.dataTransfer?.types || [])].includes('Files');
  zone.addEventListener('dragover', (ev) => { if (hasFiles(ev)) { ev.preventDefault(); zone.classList.add('over'); } });
  zone.addEventListener('dragleave', () => zone.classList.remove('over'));
  zone.addEventListener('drop', (ev) => { if (!hasFiles(ev)) return; ev.preventDefault(); zone.classList.remove('over'); addFiles([...ev.dataTransfer.files]); });
  const stray = (ev) => { if (hasFiles(ev) && !ev.target.closest?.('[data-drop]')) ev.preventDefault(); }; // a miss must not open the file in the tab
  window.addEventListener('dragover', stray); window.addEventListener('drop', stray);

  drawExams(); syncProg(); drawMaterials();
  $('[data-save]').textContent = '';
  return () => { alive = false; clearTimeout(saveTimer); window.removeEventListener('dragover', stray); window.removeEventListener('drop', stray); };
}
