// "Which classes are you studying for?" picker, shown before the dashboard
// on a first visit and reachable later from the home page and Settings.
import config from '../../config.js';
import { getManifest } from '../data.js';
import * as store from '../store.js';
import { esc, icon, plural, toast } from '../ui.js';

export const OTHER = '';
export const courseLabel = (c) => c || 'Other exams';

// Courses that have published exams, with a short summary of each.
export async function listCourses() {
  const exams = (await getManifest()).exams.filter((e) => !e.preview);
  const map = new Map();
  for (const e of exams) {
    const c = e.course || OTHER;
    if (!map.has(c)) map.set(c, { name: c, exams: [], assignments: 0 });
    const m = map.get(c);
    m.exams.push(e);
    m.assignments += e.assignmentCount || 0;
  }
  return [...map.values()];
}

// The courses this student picked that still exist (null if they never picked).
export function chosenCourses(courses) {
  const s = store.getSettings().subjects;
  if (!Array.isArray(s)) return null;
  const names = new Set(courses.map((c) => c.name));
  const keep = s.filter((x) => names.has(x));
  return keep.length ? keep : null;
}

// Courses added to the site since the student last saved their choice.
export function newCourses(courses) {
  const seen = store.getSettings().subjectsSeen;
  if (!Array.isArray(seen)) return [];
  return courses.filter((c) => !seen.includes(c.name));
}

export function saveChoice(names, courses) {
  store.saveSettings({ subjects: names, subjectsSeen: courses.map((c) => c.name) });
}

export function courseOptions(courses, selected, { name = 'subject' } = {}) {
  return courses.map((c) => {
    const current = c.exams.filter((e) => !e.archived);
    const titles = (current.length ? current : c.exams).map((e) => e.title);
    return `
      <label class="subject-card">
        <input type="checkbox" name="${name}" value="${esc(c.name)}" ${selected.includes(c.name) ? 'checked' : ''}>
        <span class="subject-body">
          <span class="subject-check" aria-hidden="true">${icon('check')}</span>
          <span class="subject-name">${esc(courseLabel(c.name))}</span>
          <span class="subject-sub">${esc(titles.slice(0, 3).join(' · '))}${titles.length > 3 ? ` +${titles.length - 3} more` : ''}</span>
          <span class="subject-facts muted small">${plural(c.exams.length, 'exam')}${c.assignments ? ` · ${plural(c.assignments, 'coding assignment')}` : ''}</span>
        </span>
      </label>`;
  }).join('');
}

// Full-page picker. `then` is where to go after saving.
export async function render(main, params = {}, query = {}) {
  const courses = await listCourses();
  if (!courses.length) { location.replace('#/'); return; }
  const first = store.getSettings().subjects == null;
  const chosen = chosenCourses(courses) || (courses.length === 1 ? [courses[0].name] : []);
  const then = query.then && query.then.startsWith('/') ? query.then : '/';

  main.innerHTML = `
    <section class="page narrow subject-picker">
      ${first ? `<p class="eyebrow">Welcome to ${esc(config.siteName)}</p>` : '<nav class="crumbs"><a href="#/">Home</a></nav>'}
      <h1>Which ${courses.length > 1 ? 'classes' : 'class'} are you studying for?</h1>
      <p class="lead">${courses.length > 1 ? 'Pick one or more. Your home page will only show these.' : 'Select your class to get started.'} You can change this any time in Settings.</p>
      <form data-subjects>
        <fieldset class="subject-grid">
          <legend class="sr-only">Classes</legend>
          ${courseOptions(courses, chosen)}
        </fieldset>
        <p class="form-error bad small" data-err role="alert" hidden>Choose at least one class.</p>
        <div class="row">
          <button class="btn primary big" type="submit">${first ? 'Continue' : 'Save'} ${icon('right')}</button>
          ${first ? '' : '<a class="btn big" href="#/">Cancel</a>'}
        </div>
      </form>
      <p class="muted small privacy-note">${icon('note')} Your choice is saved only in this browser. Nobody else can see it.</p>
    </section>`;

  const form = main.querySelector('[data-subjects]');
  const err = main.querySelector('[data-err]');
  form.addEventListener('change', () => { err.hidden = true; });
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const picked = [...form.querySelectorAll('input[name=subject]:checked')].map((i) => i.value);
    if (!picked.length) { err.hidden = false; form.querySelector('input')?.focus(); return; }
    saveChoice(picked, courses);
    if (!first) toast('Your classes are saved');
    location.hash = '#' + then;
  });
}
