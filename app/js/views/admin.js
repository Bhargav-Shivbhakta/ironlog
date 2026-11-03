// Admin: create classes, choose their exams and instructors, upload Canvas rosters.
import { getManifest } from '../data.js';
import * as cloud from '../cloud.js';
import { esc, icon, plural, toast, confirmDialog } from '../ui.js';
import { fmtDate } from '../engine.js';
import { parseRoster, classIdFrom } from '../roster.js';
import { CLASS_COLORS } from '../colors.js';

export async function render(main, params = {}, query = {}) {
  if (!cloud.enabled || !cloud.isAdmin()) {
    main.innerHTML = `<section class="page narrow empty-state"><h1>Admins only</h1><p>Only site admins can manage classes. Admins are listed in <code>firestore.rules</code> (see the README).</p><a class="btn primary" href="#/">Go home</a></section>`;
    return;
  }
  const manifest = await getManifest();
  const exams = manifest.exams.filter((e) => !e.preview);
  let classes = [];
  try { classes = await cloud.listClasses(); } catch (e) {
    main.innerHTML = `<section class="page narrow empty-state"><h1>Couldn't load classes</h1><p>${esc(e?.message || e)}</p></section>`;
    return;
  }
  if (query.edit) {
    const cls = query.edit === 'new' ? null : classes.find((c) => c.id === query.edit);
    return editor(main, cls, exams, classes);
  }
  const examTitle = (id) => { const e = exams.find((x) => x.id === id); return e ? (e.course ? e.course + ' · ' : '') + e.title : id + ' (missing)'; };
  main.innerHTML = `
    <section class="page admin">
      <header class="inst-head">
        <div>
          <p class="eyebrow">Admin</p>
          <h1>Classes and rosters</h1>
          <p class="muted">Only students on a class roster can use the site, and they see only their classes' exams.</p>
        </div>
        <div class="row"><a class="btn" href="#/overview">${icon('chart')} Platform overview</a><a class="btn primary" href="#/admin?edit=new">${icon('note')} New class</a></div>
      </header>
      ${classes.length ? `<div class="class-admin-list">
        ${classes.map((c) => `
          <article class="class-admin">
            <div class="class-admin-main">
              <h2><span class="class-dot" style="--sw:${(CLASS_COLORS.find((x) => x.id === c.color) || CLASS_COLORS[0]).swatch}"></span>${esc(c.name)}</h2>
              <p class="muted small">${esc([c.course, c.term].filter(Boolean).join(' · '))}${c.updatedAt ? ` · roster updated ${esc(fmtDate(c.updatedAt))}` : ''}</p>
              <p><strong>${plural(c.studentCount || 0, 'student')}</strong> · ${(c.exams || []).map((id) => esc(examTitle(id))).join(', ') || '<span class="muted">no exams yet</span>'}</p>
              <p class="muted small">Teaching staff: ${(c.staff || (c.instructors || []).map((email) => ({ email, role: 'instructor', sections: [] }))).map((x) => `${esc(x.name || x.email)} (${x.role === 'ta' ? 'TA' : 'instructor'}${x.sections?.length ? ' · ' + x.sections.map(esc).join(', ') : ''})`).join(', ') || 'none'}</p>
            </div>
            <div class="row">
              <a class="btn" href="#/instructor?class=${encodeURIComponent(c.id)}">${icon('grid')} Dashboard</a>
              <a class="btn" href="#/content/${encodeURIComponent(c.id)}">${icon('note')} Exams & assignments</a>
              <a class="btn" href="#/admin?edit=${encodeURIComponent(c.id)}">Edit / new roster</a>
              <button class="btn danger-outline" data-delete="${esc(c.id)}" data-name="${esc(c.name)}">${icon('trash')}<span class="sr-only">Delete ${esc(c.name)}</span></button>
            </div>
          </article>`).join('')}
      </div>` : `<div class="empty-state"><h2>No classes yet</h2><p>Create a class, pick its exams and upload the Canvas roster. Students on the roster can then sign in.</p></div>`}
    </section>`;
  main.querySelectorAll('[data-delete]').forEach((b) => (b.onclick = async () => {
    const ok = await confirmDialog({ title: `Delete ${b.dataset.name}?`, body: '<p>Students on this roster lose access to the class right away. Their own saved progress is kept, and you can re-create the class later.</p>', confirm: 'Delete class', danger: true });
    if (!ok) return;
    b.disabled = true;
    try { await cloud.deleteClass(b.dataset.delete); toast('Class deleted'); await cloud.refreshAccess(); render(main, params, {}); }
    catch (e) { toast("Couldn't delete: " + (e?.message || e), 'bad'); b.disabled = false; }
  }));
}

async function editor(main, cls, exams, classes) {
  const isNew = !cls;
  let current = [];
  if (!isNew) { try { current = await cloud.getRoster(cls.id); } catch {} }
  let parsed = null;
  const studentsOf = (list) => list.filter((p) => !p.role || p.role === 'student');
  const staffFromRoster = (p) => ({ name: p.name || '', email: p.email, role: p.role === 'ta' ? 'ta' : 'instructor', sections: p.role !== 'ta' ? [] : p.sections || (p.section ? p.section.split(', ').filter(Boolean) : []) });
  let staff = cls?.staff ? cls.staff.map((x) => ({ ...x, sections: [...(x.sections || [])] }))
    : (cls?.instructors || []).map((email) => { const p = current.find((q) => q.email === email); return p ? staffFromRoster(p) : { name: '', email, role: 'instructor', sections: [] }; });
  const sectionPool = () => [...new Set([...studentsOf(parsed && !parsed.error ? parsed.people : current).flatMap((p) => (p.section || '').split(', ').filter(Boolean)), ...staff.flatMap((x) => x.sections)])].sort();
  const builtIn = exams.filter((e) => !e.cloud);                                   // from the website files (GitHub)
  const uploadedHere = exams.filter((e) => e.cloud && e.classId === cls?.id);      // uploaded to this class
  const courses = [...new Set(builtIn.map((e) => e.course || ''))];
  main.innerHTML = `
    <section class="page narrow admin-edit">
      <nav class="crumbs"><a href="#/admin">Classes</a></nav>
      <h1>${isNew ? 'New class' : `Edit ${esc(cls.name)}`}</h1>
      <form class="setup-form" data-form novalidate>
        <fieldset><legend>Class</legend>
          <label class="field"><span>Class name</span><input name="name" required maxlength="80" placeholder="CS150 Fall 2026" value="${esc(cls?.name || '')}"></label>
          <p class="muted small" data-id-note>${isNew ? 'Class ID: <code data-id>…</code>' : `Class ID: <code>${esc(cls.id)}</code> (can't change)`}</p>
          <label class="field"><span>Course <span class="muted">(optional)</span></span><input name="course" maxlength="20" placeholder="CS150" value="${esc(cls?.course || '')}"></label>
          <label class="field"><span>Term <span class="muted">(optional)</span></span><input name="term" maxlength="40" placeholder="Fall 2026" value="${esc(cls?.term || '')}"></label>
        </fieldset>
        <fieldset><legend>Exams in this class</legend>
          <p class="muted small fieldset-help">Optional now: after saving, you or the class's instructors upload exams on the class's <strong>Exams and assignments</strong> page.</p>
          ${uploadedHere.length ? `<p class="small"><strong>Uploaded:</strong> ${uploadedHere.map((e) => esc(e.title)).join(', ')} · <a href="#/content/${encodeURIComponent(cls.id)}">Manage</a></p>` : ''}
          ${builtIn.length ? '<p class="muted small exam-group">From the website files (GitHub)</p>' : ''}
          ${courses.map((c) => `<p class="muted small exam-group">${esc(c || 'Other exams')}</p><div class="chip-row">${builtIn.filter((e) => (e.course || '') === c).map((e) => `
            <label class="chip"><input type="checkbox" name="exam" value="${esc(e.id)}" ${cls?.exams?.includes(e.id) ? 'checked' : ''}><span>${esc(e.title)}${e.archived ? ' (past)' : ''}</span></label>`).join('')}</div>`).join('')}
          <p class="muted small fieldset-help" style="margin-top:.8rem">Exam dates (optional): students see a countdown and a daily plan.</p>
          <div class="exam-dates" data-exam-dates></div>
        </fieldset>
        <fieldset><legend>Colour</legend>
          <p class="muted small fieldset-help">Pages for this class use this colour, so students in several classes can tell them apart.</p>
          <div class="color-swatches">${CLASS_COLORS.map((c, i) => `<label class="swatch" style="--sw:${c.swatch}"><input type="radio" name="color" value="${c.id}" ${(cls?.color || 'blue') === c.id ? 'checked' : ''}><span>${c.label}</span></label>`).join('')}</div>
        </fieldset>
        <fieldset><legend>Roster</legend>
          ${!isNew ? `<p class="small">Current roster: <strong>${plural(studentsOf(current).length, 'student')}</strong>. Upload a new roster to replace it, or leave this empty to keep it.</p>` : ''}
          <p class="muted small fieldset-help">In Canvas, open the course's <strong>People</strong> page, select the whole table and copy it, then paste below. A CSV file works too (for example a Gradebook export). It needs a Name column and a Login ID or Email column.</p>
          <div class="row"><label class="btn">${icon('upload')} Choose CSV file<input type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" data-file hidden></label><span class="muted small" data-file-name></span></div>
          <textarea name="paste" rows="5" placeholder="…or paste the roster table here" spellcheck="false"></textarea>
          <div data-preview aria-live="polite"></div>
        </fieldset>
        <fieldset><legend>Teaching staff</legend>
          <p class="muted small fieldset-help">Instructors see the whole class. TAs see only the sections you tick (tick none to give them every section). Teachers and TAs found in the roster are added here automatically.</p>
          <div class="staff-list" data-staff></div>
          <button class="btn small" type="button" data-add-staff>${icon('note')} Add an instructor or TA</button>
        </fieldset>
        <p class="form-error bad small" data-err role="alert" hidden></p>
        <div class="row"><a class="btn" href="#/admin">Cancel</a><button class="btn primary big" type="submit">${isNew ? 'Create class' : 'Save changes'}</button></div>
      </form>
    </section>`;
  const form = main.querySelector('[data-form]');
  const err = main.querySelector('[data-err]');
  const preview = main.querySelector('[data-preview]');
  const idEl = main.querySelector('[data-id]');
  const showErr = (m) => { err.textContent = m; err.hidden = !m; if (m) err.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); };
  const updId = () => { if (idEl) idEl.textContent = classIdFrom(form.name.value) || '…'; };
  form.name.addEventListener('input', updId); updId();
  form.addEventListener('change', () => showErr(''));

  const dates = { ...(cls?.examDates || {}) };
  const datesEl = main.querySelector('[data-exam-dates]');
  function paintDates() {
    const picked = [...uploadedHere, ...[...form.querySelectorAll('input[name=exam]:checked')].map((i) => exams.find((e) => e.id === i.value)).filter(Boolean)];
    datesEl.innerHTML = picked.map((e) => `<label class="exam-date-row"><span><strong>${esc(e.title)}</strong>${!dates[e.id] && e.examDate ? ` <span class="muted small">(question file says ${esc(e.examDate)})</span>` : ''}</span><input type="date" data-date="${esc(e.id)}" value="${esc(dates[e.id] || '')}" aria-label="Exam date for ${esc(e.title)}"></label>`).join('');
  }
  paintDates();
  form.addEventListener('change', (ev) => {
    if (ev.target.name === 'exam') paintDates();
    if (ev.target.dataset.date) { if (ev.target.value) dates[ev.target.dataset.date] = ev.target.value; else delete dates[ev.target.dataset.date]; }
  });

  const staffEl = main.querySelector('[data-staff]');
  function paintStaff() {
    const pool = sectionPool();
    staffEl.innerHTML = staff.length ? staff.map((x, i) => `
      <div class="staff-row" data-i="${i}">
        <label class="field"><span>Name</span><input data-s="name" value="${esc(x.name)}" placeholder="Taylor Tran" autocomplete="off"></label>
        <label class="field"><span>Email</span><input data-s="email" type="email" value="${esc(x.email)}" placeholder="ttran@${esc(cloud.domain)}" autocomplete="off"></label>
        <label class="field"><span>Role</span><select data-s="role"><option value="instructor" ${x.role !== 'ta' ? 'selected' : ''}>Instructor</option><option value="ta" ${x.role === 'ta' ? 'selected' : ''}>TA</option></select></label>
        <div class="staff-sections">
          <span class="small strong">Sections</span>
          ${x.role !== 'ta' ? '<span class="muted small">All sections (instructor)</span>'
            : pool.length ? `<div class="chip-row">${pool.map((sec) => `<label class="chip small-chip"><input type="checkbox" data-sec="${esc(sec)}" ${x.sections.includes(sec) ? 'checked' : ''}><span>${esc(sec)}</span></label>`).join('')}</div>
              <span class="muted small">${x.sections.length ? `Sees ${plural(x.sections.length, 'section')}` : 'None ticked: sees every section'}</span>`
            : '<span class="muted small">Add the roster above to choose sections.</span>'}
        </div>
        <button class="icon-btn small" type="button" data-remove-staff aria-label="Remove ${esc(x.name || x.email || 'this person')}">${icon('trash')}</button>
      </div>`).join('') : '<p class="muted small">No instructors or TAs yet.</p>';
  }
  paintStaff();
  staffEl.addEventListener('input', (ev) => {
    const row = ev.target.closest('[data-i]'); if (!row) return;
    const x = staff[Number(row.dataset.i)];
    if (ev.target.dataset.s === 'name') x.name = ev.target.value;
    if (ev.target.dataset.s === 'email') x.email = ev.target.value.trim().toLowerCase();
  });
  staffEl.addEventListener('change', (ev) => {
    const row = ev.target.closest('[data-i]'); if (!row) return;
    const x = staff[Number(row.dataset.i)];
    if (ev.target.dataset.s === 'role') { x.role = ev.target.value; paintStaff(); }
    if (ev.target.dataset.sec != null) {
      x.sections = ev.target.checked ? [...new Set([...x.sections, ev.target.dataset.sec])] : x.sections.filter((s) => s !== ev.target.dataset.sec);
      paintStaff();
    }
  });
  staffEl.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-remove-staff]'); if (!b) return;
    staff.splice(Number(b.closest('[data-i]').dataset.i), 1); paintStaff();
  });
  main.querySelector('[data-add-staff]').addEventListener('click', () => {
    staff.push({ name: '', email: '', role: 'ta', sections: [] }); paintStaff();
    staffEl.querySelector('.staff-row:last-child [data-s=name]').focus();
  });

  function showPreview(text) {
    if (!text.trim()) { parsed = null; preview.innerHTML = ''; return; }
    parsed = parseRoster(text, cloud.domain);
    if (parsed.error) { preview.innerHTML = `<p class="bad small">${esc(parsed.error)}</p>`; return; }
    const students = studentsOf(parsed.people);
    const rosterStaff = parsed.people.filter((p) => p.role !== 'student');
    let newStaff = 0;
    for (const p of rosterStaff) if (!staff.some((x) => x.email === p.email)) { staff.push(staffFromRoster(p)); newStaff++; }
    paintStaff();
    const sections = [...new Set(students.flatMap((p) => p.section.split(', ').filter(Boolean)))];
    const removed = studentsOf(current).filter((p) => !parsed.people.some((q) => q.email === p.email));
    const added = students.filter((p) => !current.some((q) => q.email === p.email));
    preview.innerHTML = `
      <div class="roster-preview">
        <p><strong>${plural(students.length, 'student')}</strong>${rosterStaff.length ? ` and <strong>${plural(rosterStaff.length, 'teacher/TA', 'teachers/TAs')}</strong> (${rosterStaff.map((p) => esc(p.name || p.email)).join(', ')})` : ''} found${sections.length ? ` in ${plural(sections.length, 'section')}` : ''}.${newStaff ? ` <span class="small">${plural(newStaff, 'person', 'people')} added to Teaching staff below.</span>` : ''}
        ${!isNew ? `<br><span class="small">${added.length} new, ${removed.length} will lose access${removed.length ? `: ${removed.slice(0, 5).map((p) => esc(p.name || p.email)).join(', ')}${removed.length > 5 ? '…' : ''}` : ''}.</span>` : ''}</p>
        <p class="muted small">Columns used: ${Object.entries(parsed.columns).map(([k, v]) => `${esc(v)} → ${k === 'login' ? 'email' : k === 'redId' ? 'RedID' : k}`).join(', ')}</p>
        <div class="table-wrap"><table class="inst-table compact">
          <thead><tr><th>Name</th><th>Email (used to sign in)</th><th>RedID</th><th>Section</th><th>Role</th></tr></thead>
          <tbody>${parsed.people.slice(0, 8).map((p) => `<tr><td>${esc(p.name)}</td><td>${esc(p.email)}</td><td>${esc(p.redId)}</td><td>${esc(p.section)}</td><td>${p.role === 'ta' ? 'TA' : p.role}</td></tr>`).join('')}
          ${parsed.people.length > 8 ? `<tr><td colspan="5" class="muted">…and ${parsed.people.length - 8} more</td></tr>` : ''}</tbody>
        </table></div>
        ${parsed.skipped.length ? `<details class="skipped" open><summary class="bad">${plural(parsed.skipped.length, 'row')} skipped</summary><ul>${parsed.skipped.map((s) => `<li><span class="muted">Line ${s.line}:</span> ${esc(s.text)} <strong>(${esc(s.reason)})</strong></li>`).join('')}</ul></details>` : ''}
        <p class="muted small">Check that the emails look right: they must match the SDSU account each student signs in with.</p>
      </div>`;
  }
  form.paste.addEventListener('input', () => showPreview(form.paste.value));
  main.querySelector('[data-file]').addEventListener('change', async (ev) => {
    const f = ev.target.files[0];
    if (!f) return;
    if (/\.xlsx?$/i.test(f.name)) { showErr('That is an Excel file. In Excel choose File → Save As → CSV, then choose the CSV here.'); return; }
    main.querySelector('[data-file-name]').textContent = f.name;
    form.paste.value = await f.text();
    showPreview(form.paste.value);
  });

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    showErr('');
    const name = form.name.value.trim();
    const id = isNew ? classIdFrom(name) : cls.id;
    // keep the exams uploaded to this class, plus the ticked ones from the website files
    const examIds = [...new Set([...(cls?.exams || []).filter((x) => !builtIn.some((e) => e.id === x)), ...[...form.querySelectorAll('input[name=exam]:checked')].map((i) => i.value)])];
    const staffNow = staff.filter((x) => x.email || x.name);
    const noEmail = staffNow.filter((x) => !x.email).map((x) => x.name);
    const badInstr = staffNow.filter((x) => x.email && !/^[^\s@]+@[^\s@]+$/.test(x.email) || x.email && !x.email.endsWith('@' + cloud.domain)).map((x) => x.email);
    if (!name) return showErr('Give the class a name, for example "CS150 Fall 2026".');
    if (isNew && classes.some((c) => c.id === id)) return showErr(`A class with the ID "${id}" already exists. Use a different name or edit that class.`);
    if (noEmail.length) return showErr(`Add an email for ${noEmail.join(', ')} in Teaching staff.`);
    if (badInstr.length) return showErr(`Teaching staff emails must be @${cloud.domain} addresses: ${badInstr.join(', ')}`);
    if (parsed?.error) return showErr(parsed.error);
    const people = studentsOf(parsed ? parsed.people : current);
    if (isNew && !people.length) return showErr('Add the roster: paste the Canvas People table or choose a CSV file.');
    const exam0 = (await getManifest()).exams.find((e) => e.id === examIds[0]);
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      const r = await cloud.saveClass({ id, name, course: form.course.value.trim() || exam0?.course || name.split(/\s+/)[0], term: form.term.value.trim(), exams: examIds, staff: staffNow, students: people,
        color: form.querySelector('input[name=color]:checked')?.value || 'blue',
        examDates: Object.fromEntries(Object.entries(dates).filter(([k]) => examIds.includes(k))) });
      await cloud.refreshAccess();
      toast(`${name} saved: ${plural(r.total, 'person', 'people')} on the roster${!isNew ? `, ${r.added} added, ${r.removed} removed` : ''}`, 'good');
      location.hash = isNew ? `#/content/${encodeURIComponent(id)}` : '#/admin';
    } catch (e) {
      console.error(e);
      showErr("Couldn't save: " + (e?.code === 'permission-denied' ? 'your account is not an admin in firestore.rules.' : e?.message || e));
      btn.disabled = false; btn.textContent = isNew ? 'Create class' : 'Save changes';
    }
  });
}
