import config from '../config.js';
import * as store from './store.js';
import { esc, toast, closeModal, icon } from './ui.js';
import { closeCalculator } from './calculator.js';
import * as cloud from './cloud.js';
import { applyClassColor } from './colors.js';
import { getExam } from './data.js';

const routes = [
  { re: /^\/?$/, view: () => import('./views/home.js'), nav: 'home' },
  { re: /^\/class\/([^/]+)$/, keys: ['classId'], view: () => import('./views/home.js'), nav: 'home' },
  { re: /^\/admin$/, view: () => import('./views/admin.js'), nav: 'admin' },
  { re: /^\/overview$/, view: () => import('./views/overview.js'), nav: 'admin' },
  { re: /^\/content\/([^/]+)$/, keys: ['classId'], view: () => import('./views/content.js'), nav: 'instructor' },
  { re: /^\/course\/([^/]+)$/, keys: ['course'], view: () => import('./views/home.js'), nav: 'home' },
  { re: /^\/exam\/([^/]+)$/, keys: ['id'], view: () => import('./views/exam.js'), nav: 'home' },
  { re: /^\/start\/([^/]+)\/([^/]+)$/, keys: ['id', 'mode'], view: () => import('./views/setup.js'), nav: 'home' },
  { re: /^\/quiz$/, view: () => import('./views/quiz.js'), nav: 'home', focus: true },
  { re: /^\/results\/([^/]+)\/([^/]+)$/, keys: ['id', 'attempt'], view: () => import('./views/results.js'), nav: 'home' },
  { re: /^\/progress\/([^/]+)$/, keys: ['id'], view: () => import('./views/progress.js'), nav: 'home' },
  { re: /^\/browse\/([^/]+)$/, keys: ['id'], view: () => import('./views/browse.js'), nav: 'home' },
  { re: /^\/cards\/([^/]+)$/, keys: ['id'], view: () => import('./views/flashcards.js'), nav: 'home' },
  { re: /^\/assignments\/([^/]+)$/, keys: ['id'], view: () => import('./views/assignments.js'), nav: 'home' },
  { re: /^\/code\/([^/]+)\/([^/]+)$/, keys: ['id', 'slug'], view: () => import('./views/code.js'), nav: 'home', focus: true },
  { re: /^\/subjects$/, view: () => import('./views/subjects.js'), nav: 'home' },
  { re: /^\/instructor$/, view: () => import('./views/instructor.js'), nav: 'instructor' },
  { re: /^\/analytics$/, view: () => import('./views/analytics.js'), nav: 'instructor' },
  { re: /^\/settings$/, view: () => import('./views/settings.js'), nav: 'settings' },
  { re: /^\/author$/, view: () => import('./views/author.js'), nav: 'author' },
];

let cleanup = null;
const SKELETON = `<section class="page skeleton" aria-busy="true" aria-label="Loading">
  <span class="sk sk-eyebrow"></span><span class="sk sk-title"></span><span class="sk sk-line"></span>
  <span class="sk sk-block"></span><div class="sk-row"><span class="sk sk-card"></span><span class="sk sk-card"></span><span class="sk sk-card"></span></div></section>`;
let renderToken = 0;

export function go(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = raw.split('?');
  const query = Object.fromEntries(new URLSearchParams(qs || ''));
  return { path, query };
}

async function route() {
  const token = ++renderToken;
  const { path, query } = parseHash();
  if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
  // fresh container each time so no event listeners leak between pages
  const old = document.getElementById('main');
  const main = old.cloneNode(false);
  old.replaceWith(main);
  closeCalculator();
  closeModal(); // a dialog never outlives the page it was opened on (e.g. after pressing Back)
  let r = routes.find((x) => x.re.test(path));
  if (cloud.enabled) {
    await cloud.whenReady();
    if (token !== renderToken) return;
    // everything except the instructors' file checker needs a signed-in student
    if (!cloud.currentUser() && path !== '/author') r = { re: /.*/, view: () => import('./views/signin.js'), nav: '' };
    else if (cloud.currentUser()) {
      if (path === '/subjects') { location.replace('#/'); return; }
      // not on any roster: only the home page (which explains), settings and the file checker
      if (!cloud.isEnrolled() && !['/', '/settings', '/author'].includes(path)) { location.replace('#/'); return; }
    }
  }
  document.body.classList.toggle('focus-mode', !!r?.focus);
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === r?.nav));
  if (!r) {
    main.innerHTML = `<section class="page narrow empty-state"><h1>Page not found</h1><p>This link doesn't match anything here.</p><a class="btn primary" href="#/">Go to exams</a></section>`;
    return;
  }
  const m = path.match(r.re);
  const params = {};
  (r.keys || []).forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
  if (cloud.enabled && params.id && !cloud.canSeeExam(params.id)) {
    main.innerHTML = `<section class="page narrow empty-state"><h1>This exam isn't part of your classes</h1><p>You can only open exams from classes you're enrolled in.</p><a class="btn primary" href="#/">Go to my classes</a></section>`;
    return;
  }
  const skTimer = setTimeout(() => { if (token === renderToken && !main.childElementCount) main.innerHTML = SKELETON; }, 120);
  try {
    const mod = await r.view();
    if (token !== renderToken) return;
    main.innerHTML = '';
    const result = await mod.render(main, params, query);
    if (token !== renderToken) { if (typeof result === 'function') result(); return; }
    cleanup = typeof result === 'function' ? result : null;
    clearTimeout(skTimer);
    main.querySelector('.skeleton')?.remove();
    main.classList.add('page-in');
    // pages that belong to one class take that class's colour
    let cls = null;
    if (cloud.enabled && cloud.currentUser()) {
      const mine = cloud.myClasses();
      cls = params.classId ? mine.find((x) => x.id === params.classId) : params.id ? cloud.classForExam(params.id) : (path === '/' || path === '') && mine.length === 1 ? mine[0] : null;
    }
    applyClassColor(cls?.color);
    if (cloud.enabled && cloud.currentUser()) main.querySelectorAll('.crumbs a[href="#/"]').forEach((a) => { if (a.textContent.trim() === 'Exams') a.textContent = 'My classes'; });
    if (!query.keepScroll) window.scrollTo(0, 0);
    const h1 = main.querySelector('h1');
    document.title = (h1 ? h1.textContent.trim() + ' · ' : '') + config.siteName;
  } catch (e) {
    console.error(e);
    if (token !== renderToken) return;
    const offline = !navigator.onLine || /dynamically imported module|Importing a module script failed|Failed to fetch|NetworkError|Load failed/i.test(String(e?.message || e));
    if (offline) {
      main.innerHTML = `<section class="page narrow empty-state"><h1>This page couldn't load</h1>
        <p>You may be offline, or the site was just updated. Check your internet connection, then reload. Your progress is safe on this device.</p>
        <div class="row center"><button class="btn primary" onclick="location.reload()">Reload</button><a class="btn" href="#/">Go to my classes</a></div></section>`;
      return;
    }
    main.innerHTML = `<section class="page narrow empty-state"><h1>Something went wrong</h1>
      <p>${esc(e.message || String(e))}</p>
      <p class="muted">If this keeps happening, try reloading the page.</p>
      <div class="row"><button class="btn primary" onclick="location.reload()">Reload</button><a class="btn" href="#/">Go to exams</a></div></section>`;
  }
}

export function applyTheme() {
  const s = store.getSettings();
  const root = document.documentElement;
  if (s.theme === 'system') delete root.dataset.theme; else root.dataset.theme = s.theme;
  root.dataset.size = s.textSize;
  root.dataset.font = s.readFont || 'standard';
  root.dataset.contrast = s.contrast || 'normal';
  if (s.readFont === 'easy' && !document.getElementById('font-easy')) {
    const l = document.createElement('link');
    l.id = 'font-easy'; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Lexend:wght@400;600;700&display=swap';
    document.head.appendChild(l);
  }
  const dark = s.theme === 'dark' || (s.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  const l = document.getElementById('hl-light'), d = document.getElementById('hl-dark');
  if (l && d) { l.disabled = dark; d.disabled = !dark; }
}

function paintChrome() {
  const foot = document.getElementById('sitefoot');
  const u = cloud.currentUser();
  foot.innerHTML = `<span>${esc(cloud.enabled ? config.signedInFooter || '' : config.footer)}</span><a href="#/author">For instructors: check a question file</a>`;
  const nav = document.querySelector('.topnav');
  nav.querySelector('[data-nav="instructor"]')?.remove();
  nav.querySelector('[data-nav="admin"]')?.remove();
  document.querySelector('.topbar .account-chip')?.remove();
  if (cloud.isInstructor()) nav.querySelector('[data-nav="settings"]').insertAdjacentHTML('beforebegin', '<a href="#/instructor" data-nav="instructor">Instructor</a>');
  if (cloud.isAdmin()) nav.querySelector('[data-nav="settings"]').insertAdjacentHTML('beforebegin', '<a href="#/overview" data-nav="admin">Admin</a>');
  const home = nav.querySelector('[data-nav="home"]');
  if (home) home.textContent = cloud.enabled && u ? 'My classes' : 'Exams';
  if (u) {
    const name = u.displayName || u.email;
    const initials = name.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((x) => x[0].toUpperCase()).join('');
    nav.insertAdjacentHTML('afterend', `<a class="account-chip" href="#/settings" title="${esc(u.email)}" aria-label="Account: ${esc(u.email)}">${u.photoURL ? `<img src="${esc(u.photoURL)}" alt="" referrerpolicy="no-referrer">` : esc(initials)}</a>`);
  }
  document.body.classList.toggle('signed-out', cloud.enabled && !u);
  // phones: the same links as a bottom tab bar, within thumb reach
  document.querySelector('.tabbar')?.remove();
  const tabs = [...nav.querySelectorAll('a[data-nav]')].map((a) => {
    const ic = { home: 'home', instructor: 'chart', admin: 'users', settings: 'settings', author: 'note' }[a.dataset.nav] || 'grid';
    const label = { home: cloud.enabled && u ? 'Classes' : 'Exams', instructor: 'Dashboard' }[a.dataset.nav] || a.textContent;
    return `<a href="${a.getAttribute('href')}" data-nav="${a.dataset.nav}">${icon(ic)}<span>${esc(label)}</span></a>`;
  });
  document.getElementById('main').insertAdjacentHTML('afterend', `<nav class="tabbar" aria-label="Main">${tabs.join('')}</nav>`);
  const cur = routes.find((x) => x.re.test(parseHash().path));
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === cur?.nav));
}

function init() {
  document.getElementById('site-name').textContent = config.siteName;
  paintChrome();
  let lastUid = null;
  window.addEventListener('qp:auth', () => {
    paintChrome();
    const uid = cloud.currentUser()?.uid || null;
    if (uid !== lastUid) { lastUid = uid; route(); warmUp(); }
  });
  cloud.init();
  applyTheme();
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);
  window.addEventListener('hashchange', route);
  window.addEventListener('qp:storage-full', () => toast("Your browser's storage is full. Export your progress in Settings, then clear old data.", 'bad'));
  // Safety net: an unexpected error never leaves the page silently broken. Log it, tell the
  // student once (not a flood of messages), and keep the page usable.
  let lastErrToast = 0;
  const onUnexpected = (err) => {
    console.error('Unexpected error', err);
    const msg = String(err?.message || err || '');
    // ignore noise from browser extensions and failed font/image loads
    if (/extension|ResizeObserver loop|Script error|Load failed|Failed to fetch dynamically/i.test(msg) && !/qp/.test(msg)) return;
    if (Date.now() - lastErrToast < 15000) return;
    lastErrToast = Date.now();
    toast('Something went wrong. Please try that again, or reload the page if it keeps happening.', 'bad');
  };
  window.addEventListener('error', (e) => { if (e.error) onUnexpected(e.error); });
  window.addEventListener('unhandledrejection', (e) => onUnexpected(e.reason));
  if (!store.storageAvailable()) {
    setTimeout(() => toast("This browser is blocking saving (private mode?). Progress won't be kept after you close the tab.", 'bad'), 600);
  }
  route();
  warmUp();
}

// Once the site is open, quietly load every page and this student's exam questions in the
// background (about 70 KB), so a dropped Wi-Fi connection doesn't stop them moving around.
let warmed = '';
function warmUp() {
  const key = cloud.currentUser()?.uid || 'anon';
  if (warmed === key) return;
  warmed = key;
  const go = () => {
    for (const r of routes) r.view().catch(() => {});
    if (cloud.enabled && cloud.currentUser()) for (const c of cloud.myClasses()) for (const id of c.exams || []) getExam(id).catch(() => {});
  };
  if ('requestIdleCallback' in window) requestIdleCallback(go, { timeout: 6000 }); else setTimeout(go, 3000);
}

init();
