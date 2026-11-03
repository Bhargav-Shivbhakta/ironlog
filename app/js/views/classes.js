// Home page when sign-in is on: the classes this account is enrolled in.
// One class goes straight to its page; several show a short list. No subject picker.
import config from '../../config.js';
import { getManifest } from '../data.js';
import * as store from '../store.js';
import * as cloud from '../cloud.js';
import { esc, icon, plural, confirmDialog } from '../ui.js';
import { examCard, readinessFor, resumeBanner } from './home.js';
import { studyPanel } from './nextup.js';
import { announcementBanners, bindAnnouncements } from './announce.js';
import { CLASS_COLORS } from '../colors.js';

const swatch = (c) => (CLASS_COLORS.find((x) => x.id === c.color) || CLASS_COLORS[0]).swatch;
const withDate = (e, cls) => (e && cls.examDates?.[e.id] ? { ...e, examDate: cls.examDates[e.id] } : e);
function daysTo(d) { if (!d) return null; const t = new Date(d + 'T00:00:00'); if (isNaN(t)) return null; const n = Math.ceil((t - new Date(new Date().toDateString())) / 86400000); return n >= 0 ? n : null; }

export async function render(main, params = {}) {
  const manifest = await getManifest();
  const byId = new Map(manifest.exams.map((e) => [e.id, e]));
  const classes = cloud.myClasses();

  if (!classes.length) {
    if (cloud.isAdmin()) return adminHome(main, manifest);
    return notEnrolled(main);
  }
  const cls = params.classId ? classes.find((c) => c.id === params.classId) : classes.length === 1 ? classes[0] : null;
  if (params.classId && !cls) {
    main.innerHTML = `<section class="page narrow empty-state"><h1>Class not found</h1><p>You're not on the roster for this class.</p><a class="btn primary" href="#/">Go to my classes</a></section>`;
    return;
  }
  if (cls) return classPage(main, cls, byId, classes.length > 1);

  // several classes
  main.innerHTML = `
    <section class="page home">
      <header class="home-head">
        <h1>My classes</h1>
        <p class="tagline">Signed in as ${esc(cloud.currentUser().email)}</p>
      </header>
      ${resumeBanner()}
      <div class="class-grid">
        ${classes.map((c) => {
          const exams = (c.exams || []).map((id) => byId.get(id)).filter(Boolean);
          return `
          <a class="class-card" style="--sw:${swatch(c)}" href="#/class/${encodeURIComponent(c.id)}">
            <span class="class-course">${esc(c.course || '')}${c.term ? ` · ${esc(c.term)}` : ''}</span>
            <span class="class-name">${esc(c.name)}</span>
            <span class="muted small">${exams.map((e) => esc(e.title)).join(' · ') || 'No exams yet'}</span>
            ${(() => { const soon = exams.map((e) => ({ e, n: daysTo(c.examDates?.[e.id] || e.examDate) })).filter((x) => x.n != null).sort((a, b) => a.n - b.n)[0]; return soon ? `<span class="countdown-chip">${icon('clock')} ${esc(soon.e.title)} ${soon.n === 0 ? 'is today' : `in ${soon.n} day${soon.n === 1 ? '' : 's'}`}</span>` : ''; })()}
            <span class="class-foot">${cloud.isStaffRole(c.role) ? `<span class="tag role-tag">${c.role === 'ta' ? 'TA' : 'Instructor'}</span>` : c.section ? `<span class="tag">Section ${esc(c.section)}</span>` : ''}<span class="exam-card-go">Open</span></span>
          </a>`;
        }).join('')}
      </div>
      ${cloud.isAdmin() ? '<p class="muted small admin-note"><a href="#/admin">Manage classes and rosters</a></p>' : ''}
    </section>`;
  bindDiscard(main, () => render(main, params));
}

async function classPage(main, cls, byId, several) {
  const exams = (cls.exams || []).map((id) => withDate(byId.get(id), cls)).filter(Boolean);
  const current = exams.filter((e) => !e.archived);
  const past = exams.filter((e) => e.archived);
  const featured = current.find((e) => e.active) || current[0];
  const others = current.filter((e) => e !== featured);
  const teacher = cloud.isStaffRole(cls.role);
  const [ready, panel, ann] = await Promise.all([readinessFor(featured ? [featured.id] : []), featured && !teacher ? studyPanel(featured) : '', announcementBanners(cls.id, { staff: teacher })]);
  main.innerHTML = `
    <section class="page home class-home">
      ${several ? '<nav class="crumbs"><a href="#/">My classes</a></nav>' : ''}
      <header class="home-head class-head">
        <div>
          <p class="eyebrow">${esc(cls.course || config.siteName)}${cls.term ? ` · ${esc(cls.term)}` : ''}${cls.section && !teacher ? ` · Section ${esc(cls.section)}` : ''}</p>
          <h1>${esc(cls.name)}</h1>
          <p class="tagline">${teacher ? (cls.role === 'ta' ? `You are a TA for this class${cls.sections?.length ? ` (${cls.sections.length > 1 ? 'sections' : 'section'} ${esc(cls.sections.join(', '))})` : ''}.` : 'You are an instructor for this class.') : `Welcome, ${esc((cloud.currentUser().displayName || '').split(' ')[0] || 'back')}.`}</p>
        </div>
        ${teacher ? `<div class="row"><a class="btn" href="#/content/${encodeURIComponent(cls.id)}">${icon('upload')} Exams & assignments</a><a class="btn" href="#/instructor?class=${encodeURIComponent(cls.id)}&tab=scores">${icon('chart')} Exam scores</a><a class="btn primary" href="#/instructor?class=${encodeURIComponent(cls.id)}">${icon('grid')} Class dashboard</a></div>` : ''}
      </header>
      ${ann}
      ${panel && store.getSession()?.examId === featured?.id ? '' : resumeBanner()}
      ${panel}
      ${panel ? `<h2 class="section-title">Your exam${others.length ? 's' : ''}</h2>` : ''}
      ${featured ? examCard(featured, { big: !panel, grouped: true, ready: ready.get(featured.id) }) : `<div class="empty-state"><p>No exams have been added to this class yet.</p>${teacher ? `<a class="btn primary" href="#/content/${encodeURIComponent(cls.id)}">${icon('upload')} Add an exam</a>` : ''}</div>`}
      ${others.length ? `<h2 class="section-title">Also in this class</h2><div class="exam-grid">${others.map((e) => examCard(e, { grouped: true })).join('')}</div>` : ''}
      ${past.length ? `<h2 class="section-title">Past exams</h2><p class="muted section-sub">Still available for practice.</p><div class="exam-grid">${past.map((e) => examCard(e, { grouped: true })).join('')}</div>` : ''}
    </section>`;
  bindDiscard(main, () => classPage(main, cls, byId, several));
  bindAnnouncements(main);
}

function notEnrolled(main) {
  const u = cloud.currentUser();
  main.innerHTML = `
    <section class="page narrow empty-state not-enrolled">
      <h1>You're not on a class roster yet</h1>
      <p>You're signed in as <strong>${esc(u.email)}</strong>, but this account isn't on the roster of any class here.</p>
      <p>If you just joined the class, ask your instructor to add you. If you have another SDSU account, sign out and try that one.</p>
      <div class="row center"><button class="btn" data-signout>Sign out</button><button class="btn primary" data-recheck>Check again</button></div>
    </section>`;
  main.querySelector('[data-signout]').onclick = () => cloud.signOut();
  main.querySelector('[data-recheck]').onclick = async (ev) => {
    const btn = ev.currentTarget; // (ev.currentTarget is empty again after an await)
    btn.disabled = true;
    try { await cloud.refreshAccess(); } catch (e) { console.error(e); }
    if (cloud.isEnrolled()) { window.dispatchEvent(new HashChangeEvent('hashchange')); return; }
    if (!cloud.isEnrolled()) { btn.disabled = false; btn.textContent = 'Still not on a roster. Check again'; }
  };
}

function adminHome(main, manifest) {
  main.innerHTML = `
    <section class="page home">
      <header class="home-head"><h1>${esc(config.siteName)}</h1><p class="tagline">You're the site admin. No classes have been set up for your account yet.</p></header>
      <a class="code-card" href="#/admin"><span class="code-card-icon" aria-hidden="true">${icon('grid')}</span><span class="code-card-text"><span class="mode-name">Set up classes and rosters</span><span class="mode-sub">Create a class, choose its exams and upload the Canvas roster</span></span>${icon('right')}</a>
      <h2 class="section-title">All exams</h2>
      <div class="exam-grid">${manifest.exams.filter((e) => !e.preview).map((e) => examCard(e)).join('')}</div>
    </section>`;
}

function bindDiscard(main, again) {
  main.querySelector('[data-discard]')?.addEventListener('click', async () => {
    const ok = await confirmDialog({ title: 'Discard this quiz?', body: '<p>Your answers in the unfinished quiz will be lost. Your saved progress stays.</p>', confirm: 'Discard', danger: true });
    if (ok) { store.clearSession(); again(); }
  });
}
