import * as store from '../store.js';
import { getManifest } from '../data.js';
import { esc, icon, toast, confirmDialog } from '../ui.js';
import { applyTheme } from '../main.js';
import { listCourses, chosenCourses, courseOptions, saveChoice } from './subjects.js';
import * as cloud from '../cloud.js';
import { fmtDate } from '../engine.js';

export async function render(main) {
  const s = store.getSettings();
  let exams = [];
  try { exams = (await getManifest()).exams.filter((e) => !e.preview); } catch {}

  let courses = [];
  try { courses = await listCourses(); } catch {}
  const chosen = chosenCourses(courses) || [];
  const radio = (name, value, label, cur) => `<label class="chip"><input type="radio" name="${name}" value="${value}" ${cur === value ? 'checked' : ''}><span>${label}</span></label>`;

  main.innerHTML = `
    <section class="page narrow settings">
      <h1>Settings</h1>
      ${cloud.currentUser() ? `
      <section class="account-box" aria-label="Your account">
        <div class="account-who">
          <strong>${esc(cloud.currentUser().displayName || cloud.currentUser().email)}</strong>
          <span class="muted small">${esc(cloud.currentUser().email)}</span>
          <span class="small sync-line" data-sync aria-live="polite"></span>
          ${cloud.myClasses().length ? `<span class="small">Classes: ${cloud.myClasses().map((c) => esc(c.name) + (c.role === 'instructor' ? ' (instructor)' : c.role === 'ta' ? ' (TA)' : c.section ? ` (section ${esc(c.section)})` : '')).join(', ')}</span>` : ''}
        </div>
        <div class="row">
          <button class="btn" data-sync-now>${icon('upload')} Save now</button>
          <button class="btn" data-signout>Sign out</button>
        </div>
      </section>` : ''}
      ${!cloud.enabled && (courses.length > 1 || (courses.length === 1 && courses[0].name)) ? `
      <form class="setup-form" data-my-subjects id="subjects">
        <fieldset><legend>My classes</legend>
          <p class="muted small fieldset-help">Your home page shows only these. Exams from other classes stay available through their links.</p>
          <div class="subject-grid compact">${courseOptions(courses, chosen)}</div>
          <p class="form-error bad small" data-subj-err role="alert" hidden>Keep at least one class selected.</p>
        </fieldset>
      </form>` : ''}
      <form class="setup-form" data-prefs>
        <fieldset><legend>Theme</legend><div class="chip-row">
          ${radio('theme', 'system', 'Match my device', s.theme)}${radio('theme', 'light', 'Light', s.theme)}${radio('theme', 'dark', 'Dark', s.theme)}
        </div></fieldset>
        <fieldset><legend>Text size</legend><div class="chip-row">
          ${radio('textSize', 's', 'Small', s.textSize)}${radio('textSize', 'm', 'Medium', s.textSize)}${radio('textSize', 'l', 'Large', s.textSize)}
        </div></fieldset>
        <fieldset><legend>Reading</legend>
          <div class="chip-row">${radio('readFont', 'standard', 'Standard font', s.readFont)}${radio('readFont', 'easy', 'Easier reading', s.readFont)}</div>
          <p class="muted small fieldset-help reading-help">Easier reading uses the Lexend font with wider letter and line spacing, which many readers with dyslexia find easier.</p>
          <div class="chip-row">${radio('contrast', 'normal', 'Normal contrast', s.contrast)}${radio('contrast', 'high', 'High contrast', s.contrast)}</div>
        </fieldset>
        <fieldset><legend>In practice modes, show answers</legend><div class="chip-row">
          ${radio('feedback', 'instant', 'After each question', s.feedback)}${radio('feedback', 'end', 'At the end', s.feedback)}
        </div></fieldset>
        <fieldset><legend>Quiz options</legend>
          <label class="check"><input type="checkbox" name="shuffleChoices" ${s.shuffleChoices ? 'checked' : ''}><span>Shuffle answer choices in practice (the timed practice test keeps the original order)</span></label>
          <label class="check"><input type="checkbox" name="confirmSubmit" ${s.confirmSubmit ? 'checked' : ''}><span>Ask before submitting even when every question is answered</span></label>
        </fieldset>
      </form>

      <h2 class="section-title">Your data</h2>
      ${cloud.currentUser()
        ? '<p class="muted">Your progress and assignment code are saved to your school account, so you can sign in on any device. Your instructor can see them. Reset and erase below also remove them from your account.</p>'
        : `<p class="muted">Everything is stored only in this browser on this device (about ${store.storageUsedKB()} KB). To study on another device, export here and import there. Clearing your browser data erases it.</p>`}
      <div class="data-actions">
        <div class="data-row">
          <div><strong>Export progress</strong><span class="muted small">Downloads a small file with your scores, history, saved questions, notes and assignment code.</span></div>
          <button class="btn" data-export>${icon('download')} Export</button>
        </div>
        <div class="data-row">
          <div><strong>Import progress</strong><span class="muted small">Merges a progress file into this browser. Nothing here is lost.</span></div>
          <label class="btn">${icon('upload')} Import<input type="file" accept=".json,application/json" data-import hidden></label>
        </div>
        ${exams.map((e) => `
        <div class="data-row">
          <div><strong>Reset ${esc(e.title)}</strong><span class="muted small">Clears your scores, history, saved questions${e.assignmentCount ? ' and assignment code' : ''} for this exam only.</span></div>
          <button class="btn danger-outline" data-reset="${esc(e.id)}" data-title="${esc(e.title)}">Reset</button>
        </div>`).join('')}
        <div class="data-row">
          <div><strong>Erase everything</strong><span class="muted small">${cloud.currentUser() ? 'Removes all your progress and code from your account and this browser.' : 'Removes all progress and settings from this browser.'}</span></div>
          <button class="btn danger-outline" data-wipe>${icon('trash')} Erase</button>
        </div>
      </div>
    </section>`;

  const syncEl = main.querySelector('[data-sync]');
  const paintSync = () => {
    if (!syncEl) return;
    const st = cloud.syncState();
    syncEl.className = 'small sync-line ' + (st.error ? 'bad' : 'good');
    syncEl.textContent = st.error ? st.error
      : st.pending ? 'Saving soon…'
      : st.lastSynced ? `Saved to your account ${Date.now() - st.lastSynced < 60000 ? 'just now' : fmtDate(st.lastSynced)}` : 'Connected';
  };
  paintSync();
  window.addEventListener('qp:sync', paintSync);
  const syncTick = setInterval(paintSync, 30000);
  main.querySelector('[data-sync-now]')?.addEventListener('click', async (ev) => {
    const btn = ev.currentTarget; // (ev.currentTarget is empty again after an await)
    btn.disabled = true;
    try { await cloud.flush(); } finally { btn.disabled = false; }
    toast(cloud.syncState().error ? cloud.syncState().error : 'Saved to your account', cloud.syncState().error ? 'bad' : 'good');
  });
  main.querySelector('[data-signout]')?.addEventListener('click', async () => {
    if (await confirmDialog({ title: 'Sign out?', body: '<p>Your progress is saved to your account. It will be removed from this browser, so the next person using this device starts fresh.</p>', confirm: 'Sign out' })) await cloud.signOut();
  });

  const subjForm = main.querySelector('[data-my-subjects]');
  subjForm?.addEventListener('change', (ev) => {
    const picked = [...subjForm.querySelectorAll('input[name=subject]:checked')].map((i) => i.value);
    const err = subjForm.querySelector('[data-subj-err]');
    if (!picked.length) { ev.target.checked = true; err.hidden = false; return; }
    err.hidden = true;
    saveChoice(picked, courses);
    toast('Your classes are saved');
  });

  main.querySelector('[data-prefs]').addEventListener('change', (ev) => {
    const f = ev.currentTarget;
    store.saveSettings({
      theme: f.theme.value, textSize: f.textSize.value, feedback: f.feedback.value, readFont: f.readFont.value, contrast: f.contrast.value,
      shuffleChoices: f.shuffleChoices.checked, confirmSubmit: f.confirmSubmit.checked,
    });
    applyTheme();
    toast('Settings saved');
  });

  main.querySelector('[data-export]').onclick = () => {
    const blob = new Blob([JSON.stringify(store.exportAll())], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `exam-practice-progress-${new Date().toLocaleDateString('en-CA')}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('Progress exported');
  };
  main.querySelector('[data-import]').onchange = async (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    try {
      const n = store.importAll(JSON.parse(await file.text()));
      applyTheme();
      toast(`Progress imported (${n} item${n === 1 ? '' : 's'} merged)`, 'good');
    } catch (e) {
      toast(e instanceof SyntaxError ? "That file couldn't be read. Choose a progress file exported from this site." : e.message, 'bad');
    }
    ev.target.value = '';
  };
  main.querySelectorAll('[data-reset]').forEach((b) => (b.onclick = async () => {
    if (await confirmDialog({ title: `Reset ${b.dataset.title}?`, body: '<p>Your scores, history, saved questions, notes and any assignment code for this exam will be erased from this browser. This can\'t be undone. Export first if you want a backup.</p>', confirm: 'Reset', danger: true })) {
      store.resetExam(b.dataset.reset);
      toast(`${b.dataset.title} reset`);
      window.dispatchEvent(new HashChangeEvent('hashchange')); // re-open the page cleanly (its timers are cleaned up)
    }
  }));
  main.querySelector('[data-wipe]').onclick = async () => {
    if (await confirmDialog({ title: 'Erase everything?', body: '<p>All progress, history and settings for every exam will be erased from this browser. This can\'t be undone.</p>', confirm: 'Erase everything', danger: true })) {
      store.resetEverything();
      applyTheme();
      toast('Everything erased');
      window.dispatchEvent(new HashChangeEvent('hashchange')); // re-open the page cleanly (its timers are cleaned up)
    }
  };
  return () => { window.removeEventListener('qp:sync', paintSync); clearInterval(syncTick); };
}
