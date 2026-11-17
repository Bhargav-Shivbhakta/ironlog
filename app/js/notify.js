// The bell in the top bar: what's new or needs attention in the person's classes — graded work
// opening soon or open now, released scores, practice due soon, new practice and announcements.
// Worked out on this device from what the site already loads; nothing extra is saved anywhere.
import * as cloud from './cloud.js';
import * as store from './store.js';
import { getManifest } from './data.js';
import { esc, icon } from './ui.js';
import { forSection, overallWindow, kindOf, KINDS } from './timed.js';

const DAY = 864e5;
const SEEN = 'notif-seen', KNOWN = 'notif-known';
const when = (t) => new Date(t).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const hm = (t) => new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

// Pure: the list of notifications for these classes at this time.
// classes: myClasses() entries; titles: Map examId -> title; anns: Map classId -> announcements;
// known: Set of practice ids seen before (null = first run: nothing counts as new)
export function buildItems(classes, { now = Date.now(), titles = new Map(), anns = new Map(), known = null } = {}) {
  const out = [];
  const many = classes.length > 1;
  for (const c of classes) {
    const staff = cloud.isStaffRole(c.role);
    const where = many ? `${c.name} · ` : '';
    for (const [tid, t0] of Object.entries(c.timed || {})) {
      if (t0.status !== 'published' || t0.disabled) continue;
      const t = staff ? { ...t0, ...overallWindow(t0) } : forSection(t0, c.section ?? '');
      if (!t) continue;
      const K = KINDS[kindOf(t)];
      const href = staff ? `#/timed/${encodeURIComponent(c.id)}/${encodeURIComponent(tid)}` : `#/take/${encodeURIComponent(c.id)}/${encodeURIComponent(tid)}`;
      if (now >= t.opensAt && now < t.closesAt) {
        out.push({ id: `open:${c.id}:${tid}:${t.opensAt}`, at: t.opensAt, rank: 0, tone: 'good', icon: 'clock', kind: kindOf(t), text: `${K.label} open now: ${t.title}`, sub: `${where}closes ${hm(t.closesAt)} · ${t.durationMin} minutes once you start`, href });
      } else if (now < t.opensAt && t.opensAt - now < 7 * DAY) {
        out.push({ id: `soon:${c.id}:${tid}:${t.opensAt}`, at: t.opensAt, rank: 1, icon: 'clock', kind: kindOf(t), text: `${K.label} coming up: ${t.title}`, sub: `${where}opens ${when(t.opensAt)} · ${t.durationMin} minutes`, href });
      } else if (!staff && t.released && now - t.closesAt < 30 * DAY) {
        out.push({ id: `rel:${c.id}:${tid}`, at: t.closesAt, rank: 2, tone: 'good', icon: 'check', kind: kindOf(t), text: `Score ready: ${t.title}`, sub: `${where}your ${K.label.toLowerCase()} score is available`, href });
      }
    }
    if (!staff) {
      for (const eid of c.exams || []) {
        const p = cloud.practiceState(c, eid, now);
        if (p.closed) continue;
        const title = titles.get(eid) || 'Practice';
        const href = `#/exam/${encodeURIComponent(eid)}`;
        if (p.dueAt && p.dueAt > now && p.dueAt - now < 3 * DAY) out.push({ id: `due:${c.id}:${eid}:${p.dueAt}`, at: p.dueAt, rank: 1, icon: 'book', kind: 'practice', text: `Practice due ${when(p.dueAt)}: ${title}`, sub: `${where}not graded`, href });
        if (known && !known.has(eid)) out.push({ id: `new:${c.id}:${eid}`, at: now, rank: 3, icon: 'book', kind: 'practice', text: `New practice: ${title}`, sub: `${where}not graded · practise as often as you like`, href });
      }
    }
    for (const a of anns.get(c.id) || []) {
      if (a.expired || now - (a.createdAt || 0) > 14 * DAY) continue;
      out.push({ id: `ann:${c.id}:${a.id}`, at: a.createdAt, rank: 2, icon: 'megaphone', text: a.text, sub: `${where}${a.author || 'Announcement'}`, href: `#/class/${encodeURIComponent(c.id)}` });
    }
  }
  return out.sort((x, y) => x.rank - y.rank || (x.rank === 1 ? x.at - y.at : y.at - x.at));
}

// ---------------------------------------------------------------- the bell
let items = [], open = false, timer = null, lastData = 0, annMap = new Map(), titles = new Map(), loading = null;
const seen = () => new Set(store.get(SEEN, []));
const unread = () => { const s = seen(); return items.filter((i) => !s.has(i.id)); };

async function loadData(force = false) {
  if (loading) return loading;
  if (!force && Date.now() - lastData < 10 * 60000) return;
  loading = (async () => {
    const classes = cloud.myClasses();
    try { const m = await getManifest(); titles = new Map(m.exams.map((e) => [e.id, e.title])); } catch {}
    const a = new Map();
    await Promise.all(classes.map(async (c) => { try { a.set(c.id, await cloud.listAnnouncements(c.id)); } catch {} }));
    annMap = a; lastData = Date.now();
  })();
  try { await loading; } finally { loading = null; }
}
function recompute() {
  const classes = cloud.myClasses();
  let known = store.get(KNOWN, null);
  const allIds = classes.flatMap((c) => c.exams || []);
  if (!known) store.quietly(() => store.set(KNOWN, allIds)); // first time: nothing is "new"
  items = buildItems(classes, { titles, anns: annMap, known: known ? new Set(known) : null });
  paint();
}
function markAllSeen() {
  const s = seen();
  items.forEach((i) => s.add(i.id));
  store.quietly(() => {
    store.set(SEEN, [...s].slice(-400));
    store.set(KNOWN, [...new Set([...(store.get(KNOWN, []) || []), ...cloud.myClasses().flatMap((c) => c.exams || [])])]);
  });
}

function paint() {
  const btn = document.querySelector('[data-bell]');
  if (!btn) return;
  const n = unread().length;
  btn.querySelector('.bell-count').textContent = n > 9 ? '9+' : String(n);
  btn.querySelector('.bell-count').hidden = !n;
  btn.setAttribute('aria-label', n ? `Notifications, ${n} new` : 'Notifications');
  btn.classList.toggle('has-new', !!n);
}
function paintPanel() {
  const panel = document.querySelector('[data-bell-panel]');
  if (!panel) return;
  const s = seen();
  panel.innerHTML = `
    <div class="bell-head"><h2 id="bell-h" tabindex="-1">Notifications</h2><button class="icon-btn small" data-bell-close aria-label="Close notifications">${icon('x')}</button></div>
    ${items.length ? `<ul class="bell-list">${items.map((i) => `
      <li class="${s.has(i.id) ? '' : 'is-new'}"><a href="${i.href}" class="bell-item ${i.tone || ''}">
        <span class="bell-ic ${i.kind ? 'kind-' + i.kind : ''}" aria-hidden="true">${icon(i.icon)}</span>
        <span class="bell-text"><span class="bell-main">${s.has(i.id) ? '' : '<span class="sr-only">New: </span>'}${esc(i.text)}</span><span class="muted small">${esc(i.sub || '')}</span></span>
      </a></li>`).join('')}</ul>` : '<p class="muted bell-empty">Nothing new. Exams, quizzes, assignments, due dates and announcements show up here.</p>'}`;
}
function toggle(force) {
  const panel = document.querySelector('[data-bell-panel]'), btn = document.querySelector('[data-bell]');
  if (!panel || !btn) return;
  open = force ?? !open;
  panel.hidden = !open;
  btn.setAttribute('aria-expanded', String(open));
  if (open) {
    paintPanel();
    panel.querySelector('#bell-h')?.focus();
    // what they've now seen stops counting as new (the dots stay until the panel is opened again)
    markAllSeen(); paint();
  } else paint();
}

// Called whenever the top bar is drawn (sign-in changes, class data reloaded)
export function mountBell() {
  document.querySelector('.bell-wrap')?.remove();
  const u = cloud.currentUser();
  if (!cloud.enabled || !u || !cloud.myClasses().length) { clearInterval(timer); timer = null; return; }
  const wrap = document.createElement('div');
  wrap.className = 'bell-wrap';
  wrap.innerHTML = `<button class="bell-btn" data-bell aria-expanded="false" aria-controls="bell-panel" aria-label="Notifications">${icon('bell')}<span class="bell-count" hidden>0</span></button>
    <div class="bell-panel" id="bell-panel" data-bell-panel role="region" aria-labelledby="bell-h" hidden></div>`;
  const chip = document.querySelector('.topbar .account-chip');
  if (chip) chip.before(wrap); else document.querySelector('.topbar').appendChild(wrap);
  open = false;
  wrap.querySelector('[data-bell]').addEventListener('click', () => toggle());
  wrap.addEventListener('click', (e) => { if (e.target.closest('[data-bell-close]')) { toggle(false); wrap.querySelector('[data-bell]').focus(); } else if (e.target.closest('.bell-item')) toggle(false); });
  recompute();
  loadData().then(recompute).catch(() => {});
  if (!timer) {
    // time alone changes things (an exam opening): recheck every minute; reload the data every 10
    timer = setInterval(() => {
      // not during an exam or while staff watch one: those pages read what they need themselves
      if (document.hidden || /^#\/(take|timed)\//.test(location.hash)) return;
      if (Date.now() - lastData > 10 * 60000) cloud.reloadClassContent().then(() => loadData(true)).then(recompute).catch(() => {});
      else recompute();
    }, 60000);
  }
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) { toggle(false); document.querySelector('[data-bell]')?.focus(); } });
document.addEventListener('click', (e) => { if (open && !e.target.closest('.bell-wrap')) toggle(false); });
