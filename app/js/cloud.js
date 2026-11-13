// Student sign-in and saving progress to the student's account (Firebase).
//
// The site still works from localStorage. When sign-in is on, this module:
//  - signs students in with Google, allowing only the school's email domain
//  - on sign-in, copies the student's saved progress down and merges it with this device
//  - keeps progress in the browser while the student studies and copies it up when they close
//    the tab, when they leave the site on a phone or tablet, from Settings → Save now, and
//    otherwise (quiz finished, tests run, switching away on a computer) at most every 30 minutes
//  - reads which classes the student is enrolled in (rosters uploaded by the admin)
//  - writes a small summary per exam into each of the student's classes for the instructor dashboard
//
// Firestore layout (see firestore.rules):
//   admins/{email}                          exists only to test "am I an admin?" (the list lives in the rules)
//   classes/{classId}                       name, course, term, exams[], staff[] (name, email, role, sections), instructors[] (staff emails)
//   classes/{classId}/summaries/{uid_exam}  one student's summary for one exam (instructors read these)
//   classes/{classId}/code/{uid_exam}       one student's assignment code for one exam
//   rosters/{classId}                       the uploaded roster (admin and the class's instructors only)
//   enrollments/{email}                     the classes one person is in (they can read only their own)
//   users/{uid}                             name, email, settings, lastSeen
//   users/{uid}/exams/{examId}              the raw progress for one exam (attempts, stats, saved, notes, assignments)
//   users/{uid}/code/{examId}               assignment code for one exam (for the student's other devices)
import config from '../config.js';
import * as store from './store.js';
import { getExam, getManifest, setCloudProvider, refreshManifest } from './data.js';
import { readiness, topicMastery } from './engine.js';

const fbc = config.firebase || {};
export const enabled = !!(fbc.apiKey && fbc.projectId);
export const domain = String(config.allowedEmailDomain || '').replace(/^@/, '').toLowerCase();

const EXAM_KEY = /^(attempts|qstats|saved|notes|asg):(.+)$/;
const CODE_KEY = /^code:([^:]+):(.+)$/;
const SOON_MS = 4000;
const GAP_MS = 30 * 60 * 1000;       // while studying on a computer: at most one save every 30 minutes
const LEAVE_GAP_MS = 10 * 60 * 1000; // phones/tablets: leaving the site saves (not more than once every 10 minutes)
// Records each student's device may write per day. 300 students × 60 = 18,000,
// inside the free plan's 20,000 a day. Change it in config.js with  dailySaveLimit: 60
const DAILY_LIMIT = Number(config.dailySaveLimit) > 0 ? Number(config.dailySaveLimit) : 60;
const touchDevice = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
// how long until the next save is allowed
const untilAllowed = (gap) => Math.max(SOON_MS, lastFlushAt + gap - Date.now());

let fb = null;               // loaded Firebase modules + instances
let user = null;
let admin = false;
let enrollment = {};         // classId -> { name, course, term, exams, role, section }
let authError = '';
let readyResolve;
const ready = new Promise((r) => (readyResolve = r));
const dirtyExams = new Set();
const dirtyCode = new Set();
let dirtyUser = false;
let timer = null;
let timerAt = 0;
let flushing = null;
let lastSynced = 0;
let lastFlushAt = 0;
let forceNext = false;   // reset and erase are saved even past the daily allowance
const hasPending = () => dirtyExams.size > 0 || dirtyCode.size > 0 || dirtyUser;
let syncError = '';

export const whenReady = () => ready;
export const currentUser = () => user;
export const isAdmin = () => admin;
// The class this exam belongs to for this person (first match), used for colours and exam dates
export const classForExam = (examId) => myClasses().find((c) => (c.exams || []).includes(examId)) || null;
export const myClasses = () => Object.entries(enrollment).map(([id, c]) => ({ id, ...c })).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
export const isStaffRole = (role) => role === 'instructor' || role === 'ta';
export const teachingClasses = () => myClasses().filter((c) => isStaffRole(c.role));
export const isInstructor = () => admin || teachingClasses().length > 0;
export const isEnrolled = () => admin || myClasses().length > 0;
// Exams this person may open: those of their classes (admins see everything)
export const canSeeExam = (examId) => !enabled || admin || myClasses().some((c) => (c.exams || []).includes(examId));
export const lastError = () => authError;
export const syncState = () => ({ lastSynced, pending: dirtyExams.size + dirtyCode.size + (dirtyUser ? 1 : 0), error: syncError });
const emit = () => window.dispatchEvent(new CustomEvent('qp:auth'));
const emitSync = () => window.dispatchEvent(new CustomEvent('qp:sync'));

export function allowedEmail(email) {
  return !!email && (!domain || String(email).toLowerCase().endsWith('@' + domain));
}

async function load() {
  if (fb) return fb;
  const [app, auth, fs] = await Promise.all([
    import('../vendor/firebase/firebase-app.js'),
    import('../vendor/firebase/firebase-auth.js'),
    import('../vendor/firebase/firebase-firestore-lite.js'),
  ]);
  const a = app.initializeApp({ apiKey: fbc.apiKey, authDomain: fbc.authDomain, projectId: fbc.projectId, appId: fbc.appId });
  fb = { ...auth, ...fs, auth: auth.getAuth(a), db: fs.getFirestore(a) };
  return fb;
}

// ---------------------------------------------------------------- auth
export async function init() {
  if (!enabled) { readyResolve(); return; }
  try {
    await load();
  } catch (e) {
    console.error(e);
    authError = "Couldn't reach the sign-in service. Check your internet connection and reload the page.";
    readyResolve();
    return;
  }
  let first = true;
  fb.onAuthStateChanged(fb.auth, async (u) => {
    if (u && !(allowedEmail(u.email) && u.emailVerified)) {
      authError = `Please sign in with your ${config.schoolName || ''} account (an email ending in @${domain}). You chose ${u.email || 'a different account'}.`.replace('  ', ' ');
      await fb.signOut(fb.auth).catch(() => {});
      return;
    }
    const prev = user;
    user = u || null;
    admin = false; enrollment = {};
    if (user) {
      authError = '';
      await loadAccess();
      if (isEnrolled()) {
        try { await afterSignIn(user); } catch (e) { console.error(e); syncError = 'Your saved progress could not be loaded. It will retry automatically.'; }
      } else if (!admin) {
        noteUnrosteredSignIn(); // so the admin can spot roster/email mismatches
      }
    } else if (prev) {
      wipeLocal();
      cloudExams = []; adminClassList = null; refreshManifest();
    }
    if (first) { first = false; readyResolve(); }
    emit();
  });
  window.addEventListener('qp:changed', (e) => markDirty(e.detail));
  window.addEventListener('qp:reset-exam', (e) => { if (user) resetExamCloud(e.detail); });
  window.addEventListener('qp:erase-all', () => { if (user) eraseAllCloud(); });
  // the main save: when the student leaves the site
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden' || !hasPending()) return;
    // a phone or tablet may be locked or switched to another device next, so save now;
    // on a computer this is often just a quick look at another tab
    const wait = lastFlushAt + (touchDevice() ? LEAVE_GAP_MS : GAP_MS) - Date.now();
    if (wait <= 0) flush(); else schedule(wait);
  });
  window.addEventListener('pagehide', () => { if (hasPending()) flush(); });
  window.addEventListener('online', () => schedule(SOON_MS));
}

export async function signIn() {
  await load();
  authError = '';
  const p = new fb.GoogleAuthProvider();
  // Shows only school accounts in Google's account chooser (the check above still applies)
  p.setCustomParameters({ hd: domain || '*', prompt: 'select_account' });
  try {
    await fb.signInWithPopup(fb.auth, p);
  } catch (e) {
    if (e?.code === 'auth/popup-blocked' || e?.code === 'auth/operation-not-supported-in-this-environment') {
      await fb.signInWithRedirect(fb.auth, p);
      return;
    }
    if (e?.code === 'auth/popup-closed-by-user' || e?.code === 'auth/cancelled-popup-request') return;
    if (e?.code === 'auth/unauthorized-domain') authError = 'This website address is not on the sign-in allow list yet. (Instructor: add it under Firebase → Authentication → Settings → Authorized domains.)';
    else authError = 'Sign-in did not work: ' + (e?.message || e);
    emit();
  }
}

export async function signOut() {
  if (!fb || !user) return;
  await flush().catch(() => {});
  await fb.signOut(fb.auth);
}

// Which classes is this account in, and is it an admin?
async function loadAccess() {
  const email = user.email.toLowerCase();
  const [a, e] = await Promise.allSettled([
    fb.getDoc(fb.doc(fb.db, 'admins', email)),
    fb.getDoc(fb.doc(fb.db, 'enrollments', email)),
  ]);
  admin = a.status === 'fulfilled';
  enrollment = e.status === 'fulfilled' && e.value.exists() ? e.value.data().classes || {} : {};
  if (e.status === 'rejected' && e.reason?.code !== 'permission-denied') {
    authError = "Couldn't check your class enrollment. Check your internet connection and reload the page.";
  }
  await loadClassContent();
}

// ---------------------------------------------------------------- class content (exams uploaded on the site)
// Each class's latest details (name, exams, dates, colour) and the exams uploaded to it.
let cloudExams = [];        // exam list entries, like data/exams.json entries plus { cloud: true, classId }
let adminClassList = null;  // all classes, for admins
async function loadClassContent() {
  const ids = new Set(Object.keys(enrollment));
  if (admin) {
    try { adminClassList = await listClasses(); adminClassList.forEach((c) => ids.add(c.id)); } catch { adminClassList = []; }
  }
  const results = await Promise.all([...ids].map(async (id) => {
    const [cls, ex] = await Promise.allSettled([
      fb.getDoc(fb.doc(fb.db, 'classes', id)),
      fb.getDocs(fb.collection(fb.db, 'classes', id, 'exams')),
    ]);
    return { id, cls: cls.status === 'fulfilled' && cls.value.exists() ? cls.value.data() : null, exams: ex.status === 'fulfilled' ? ex.value.docs.map((d) => d.data()) : [] };
  }));
  cloudExams = [];
  for (const r of results) {
    if (r.cls && enrollment[r.id]) {
      const { name, course, term, exams, examDates, color } = r.cls;
      enrollment[r.id] = { ...enrollment[r.id], name, course, term, exams: exams || [], examDates: examDates || {}, color };
    }
    for (const e of r.exams) cloudExams.push({ ...e, id: e.examId, cloud: true, classId: r.id, course: e.course || r.cls?.course || '' });
  }
  refreshManifest();
}
export const classExamEntries = () => cloudExams;
export async function reloadClassContent() { if (user) { await loadClassContent(); emit(); } }

setCloudProvider({
  exams: () => cloudExams,
  async loadExamSource(entry) {
    const key = `examsrc:${entry.id}`;
    const cached = store.get(key, null);
    if (cached && cached.hash === entry.hash) return cached.source;
    await load();
    const snap = await fb.getDoc(fb.doc(fb.db, 'classes', entry.classId, 'examFiles', entry.id));
    if (!snap.exists()) throw new Error('This exam file is missing. Ask your instructor to upload it again.');
    const source = snap.data().source;
    store.quietly(() => store.set(key, { hash: entry.hash, source }));
    return source;
  },
  async loadAssignments(entry) {
    await load();
    const snap = await fb.getDoc(fb.doc(fb.db, 'classes', entry.classId, 'assignmentSets', entry.id));
    return snap.exists() ? JSON.parse(snap.data().data).assignments : [];
  },
});

// Instructors and admins: publish or replace an exam (the questions.md text) in a class
export async function saveExam(classId, { examId, meta, source, counts }) {
  await load();
  const hash = await sha(source);
  const b = fb.writeBatch(fb.db);
  b.set(fb.doc(fb.db, 'classes', classId, 'examFiles', examId), { examId, source, hash, updatedAt: Date.now(), updatedBy: user.email.toLowerCase() });
  const prev = cloudExams.find((e) => e.id === examId);
  b.set(fb.doc(fb.db, 'classes', classId, 'exams', examId), {
    examId, title: meta.title, course: meta.course || '', description: meta.description || '',
    active: !!meta.active, archived: !!meta.archived, order: meta.order ?? 0, timeLimit: meta.timeLimit ?? null, passMark: meta.passMark ?? null, examDate: meta.examDate || '',
    questionCount: counts.questions, onExamCount: counts.onExam, topics: counts.topics, hash,
    assignmentCount: prev?.assignmentCount || 0, assignmentsHash: prev?.assignmentsHash || null,
    updatedAt: Date.now(), updatedBy: user.email.toLowerCase(),
  });
  await b.commit();
  await addExamToClass(classId, examId);
  await loadClassContent();
}
export async function deleteExam(classId, examId) {
  await load();
  const b = fb.writeBatch(fb.db);
  for (const kind of ['exams', 'examFiles', 'assignmentSets', 'assignmentFiles']) b.delete(fb.doc(fb.db, 'classes', classId, kind, examId));
  await b.commit();
  const cls = await getClass(classId);
  await fb.setDoc(fb.doc(fb.db, 'classes', classId), { exams: (cls?.exams || []).filter((x) => x !== examId), updatedAt: Date.now() }, { merge: true });
  await loadClassContent();
}
async function addExamToClass(classId, examId) {
  const cls = await getClass(classId);
  if ((cls?.exams || []).includes(examId)) return;
  await fb.setDoc(fb.doc(fb.db, 'classes', classId), { exams: [...(cls?.exams || []), examId], updatedAt: Date.now() }, { merge: true });
}
export async function examSource(classId, examId) {
  await load();
  const snap = await fb.getDoc(fb.doc(fb.db, 'classes', classId, 'examFiles', examId));
  return snap.exists() ? snap.data().source : null;
}
// Assignments: the public part for students, and the original files (with solutions) for staff only
export async function saveAssignments(classId, examId, { assignments, files }) {
  await load();
  const data = JSON.stringify({ examId, assignments });
  const hash = await sha(data);
  const b = fb.writeBatch(fb.db);
  b.set(fb.doc(fb.db, 'classes', classId, 'assignmentSets', examId), { examId, data, hash, updatedAt: Date.now() });
  b.set(fb.doc(fb.db, 'classes', classId, 'assignmentFiles', examId), { examId, files, updatedAt: Date.now(), updatedBy: user.email.toLowerCase() });
  b.set(fb.doc(fb.db, 'classes', classId, 'exams', examId), { assignmentCount: assignments.length, assignmentsHash: hash, updatedAt: Date.now() }, { merge: true });
  await b.commit();
  await loadClassContent();
}
export async function deleteAssignments(classId, examId) {
  await load();
  const b = fb.writeBatch(fb.db);
  b.delete(fb.doc(fb.db, 'classes', classId, 'assignmentSets', examId));
  b.delete(fb.doc(fb.db, 'classes', classId, 'assignmentFiles', examId));
  b.set(fb.doc(fb.db, 'classes', classId, 'exams', examId), { assignmentCount: 0, assignmentsHash: null, updatedAt: Date.now() }, { merge: true });
  await b.commit();
  await loadClassContent();
}
export async function assignmentFiles(classId, examId) {
  await load();
  const snap = await fb.getDoc(fb.doc(fb.db, 'classes', classId, 'assignmentFiles', examId));
  return snap.exists() ? snap.data().files : null;
}
async function sha(text) {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].slice(0, 5).map((b) => b.toString(16).padStart(2, '0')).join('');
}
export async function refreshAccess() {
  if (!user) return;
  await loadAccess();
  emit();
}

// ---------------------------------------------------------------- local data ownership
// On a shared computer, the next student must not see (or upload) the last one's progress.
function wipeLocal() {
  store.quietly(() => {
    for (const k of store.allKeys()) if (k !== 'settings') store.removeRaw(k);
    // keep display preferences, but the class choice belongs to the student
    store.saveSettings({ subjects: null, subjectsSeen: null });
  });
  dirtyExams.clear(); dirtyCode.clear(); dirtyUser = false;
}

const syncMetaKey = (examId) => `sync:${examId}`;
const getSyncMeta = (examId) => store.get(syncMetaKey(examId), {});
const setSyncMeta = (examId, patch) => store.quietly(() => store.set(syncMetaKey(examId), { ...getSyncMeta(examId), ...patch }));

function markDirty(key) {
  if (!user || !key) return;
  let m;
  if ((m = EXAM_KEY.exec(key))) {
    dirtyExams.add(m[2]);
    const important = m[1] === 'attempts' || m[1] === 'asg';
    schedule(important ? untilAllowed(GAP_MS) : Math.max(untilAllowed(GAP_MS), GAP_MS / 2));
  } else if ((m = CODE_KEY.exec(key))) {
    dirtyCode.add(m[1]);
    const at = getSyncMeta(m[1]).codeAt || {};
    at[m[2]] = Date.now();
    setSyncMeta(m[1], { codeAt: at });
    schedule(untilAllowed(GAP_MS));
  } else if (key === 'settings') {
    dirtyUser = true;
    schedule(untilAllowed(GAP_MS));
  }
  emitSync();
}

function schedule(ms) {
  const at = Date.now() + ms;
  if (timer && timerAt <= at) return;
  clearTimeout(timer);
  timerAt = at;
  timer = setTimeout(() => { timer = null; flush(); }, ms);
}

// ---------------------------------------------------------------- pull
async function afterSignIn(u) {
  const owner = store.getRaw('owner');
  if (owner && owner !== u.uid) wipeLocal();
  store.quietly(() => store.setRaw('owner', u.uid));
  const base = fb.doc(fb.db, 'users', u.uid);
  const [userSnap, examSnaps, codeSnaps] = await Promise.all([
    fb.getDoc(base),
    fb.getDocs(fb.collection(base, 'exams')),
    fb.getDocs(fb.collection(base, 'code')),
  ]);
  // what this device already had before downloading (anything else came from the account, so it needn't be sent back)
  const localExam = new Set(), localCode = new Set();
  for (const k of store.allKeys()) { let m; if ((m = EXAM_KEY.exec(k))) localExam.add(m[2]); else if ((m = CODE_KEY.exec(k))) localCode.add(m[1]); }
  const pushed = { ...(store.get('pushed', {})) };
  // settings: a new device takes the saved class choice
  const cloudSettings = userSnap.exists() ? userSnap.data().settings : null;
  if (cloudSettings) {
    const local = store.getSettings();
    if (local.subjects == null && cloudSettings.subjects) {
      store.quietly(() => store.saveSettings({ subjects: cloudSettings.subjects, subjectsSeen: cloudSettings.subjectsSeen || null }));
    }
    const now = store.getSettings();
    const mine = { subjects: now.subjects ?? null, subjectsSeen: now.subjectsSeen ?? null };
    if (JSON.stringify(mine) === JSON.stringify({ subjects: cloudSettings.subjects ?? null, subjectsSeen: cloudSettings.subjectsSeen ?? null })) pushed.user = fingerprint(mine);
  }
  // code: newest copy of each assignment wins (older accounts keep code in a separate record)
  const mergeCode = (examId, d) => {
    if (!d.codes) return;
    const meta = getSyncMeta(examId);
    const localAt = { ...(meta.codeAt || {}) };
    for (const [slug, code] of Object.entries(d.codes)) {
      const cloudAt = d.codeAt?.[slug] || 0;
      const have = store.getCode(examId, slug);
      if (have == null || cloudAt > (localAt[slug] || 0)) {
        store.quietly(() => store.saveCode(examId, slug, code));
        localAt[slug] = cloudAt;
      }
    }
    setSyncMeta(examId, { codeAt: localAt });
  };
  const combined = new Set(examSnaps.docs.filter((x) => x.data().codes).map((x) => x.id));
  for (const snap of codeSnaps.docs) {
    if (combined.has(snap.id)) continue; // already combined into the progress record
    const d = snap.data();
    const meta = getSyncMeta(snap.id);
    if (d.resetAt && d.resetAt > (meta.at || 0)) clearLocalExam(snap.id);
    mergeCode(snap.id, d);
    setSyncMeta(snap.id, { at: Date.now() });
  }
  // progress (and, since this version, code in the same record)
  for (const snap of examSnaps.docs) {
    const d = snap.data();
    const examId = snap.id;
    const meta = getSyncMeta(examId);
    if (d.resetAt && d.resetAt > (meta.at || 0)) clearLocalExam(examId);
    const data = {};
    for (const [k, v] of Object.entries(d.keys || {})) if (typeof v === 'string') data[`${k}:${examId}`] = v;
    store.quietly(() => store.importAll({ app: 'quiz-platform', data }));
    mergeCode(examId, d);
    setSyncMeta(examId, { at: Date.now(), resetAt: d.resetAt || 0 });
    // the account already has exactly this, so it needn't be sent back
    // (unless the code is still in the old separate record: then it is combined once)
    if (!localExam.has(examId) && !localCode.has(examId) && (d.codes || !Object.keys(codesFor(examId)).length)) {
      pushed['exam:' + examId] = fingerprint([examPayload(examId), codesFor(examId), d.resetAt || 0]);
      setSyncMeta(examId, { sumAt: Date.now() });
    }
  }
  store.quietly(() => store.set('pushed', pushed));
  lastSynced = Date.now();
  syncError = '';
  // A student who has never saved anything for an exam of their class still shows up on the
  // dashboard as "signed in, not started" (one small save per exam, once).
  const inAccount = new Set(examSnaps.docs.map((x) => x.id));
  for (const c of myClasses()) {
    if (isStaffRole(c.role)) continue;
    for (const examId of c.exams || []) {
      if (!inAccount.has(examId) && !localExam.has(examId) && !getSyncMeta(examId).sumAt) dirtyExams.add(examId);
    }
  }
  // upload anything this device had that the account didn't (and refresh the summaries)
  for (const k of store.allKeys()) {
    let m;
    if ((m = EXAM_KEY.exec(k))) dirtyExams.add(m[2]);
    else if ((m = CODE_KEY.exec(k))) dirtyCode.add(m[1]);
  }
  dirtyUser = true;
  schedule(SOON_MS);
  emitSync();
  markClassSignIns(u);
}

// Tell each class's staff "this student has signed in" (one small record per class, at most once a day)
const SIGNIN_EVERY_MS = 20 * 3600000;
function markClassSignIns(u) {
  for (const c of myClasses()) {
    if (isStaffRole(c.role)) continue;
    const k = 'signinMark:' + c.id;
    if (Date.now() - (Number(store.getRaw(k)) || 0) < SIGNIN_EVERY_MS) continue;
    fb.setDoc(fb.doc(fb.db, 'classes', c.id, 'signins', u.uid), { uid: u.uid, email: String(u.email || '').toLowerCase(), at: Date.now() })
      .then(() => store.quietly(() => store.setRaw(k, String(Date.now()))))
      .catch(() => {}); // older rules: the dashboard falls back to saved progress
  }
}
// Staff: who in this class has signed in, and when (last)
export async function classSignIns(classId) {
  await load();
  const snap = await fb.getDocs(fb.collection(fb.db, 'classes', classId, 'signins'));
  return snap.docs.map((d) => ({ uid: d.id, email: String(d.data().email || '').toLowerCase(), at: d.data().at || 0 }));
}
// Admin: record sign-ins the class doesn't know about yet (students who signed in before these records existed)
export async function recordSignIns(classId, people) {
  for (let i = 0; i < people.length; i += 400) {
    const b = fb.writeBatch(fb.db);
    for (const p of people.slice(i, i + 400)) b.set(fb.doc(fb.db, 'classes', classId, 'signins', p.uid), { uid: p.uid, email: p.email, at: p.at || 1 });
    await b.commit();
  }
}
let usersCache = null;
export async function listUsersCached() {
  if (usersCache && Date.now() - usersCache.at < 10 * 60000) return usersCache.list;
  const list = await listUsers();
  usersCache = { list, at: Date.now() };
  return list;
}

function clearLocalExam(examId) {
  store.quietly(() => {
    for (const k of store.allKeys()) {
      const m = EXAM_KEY.exec(k) || CODE_KEY.exec(k);
      if (m && (m[2] === examId || m[1] === examId)) store.removeRaw(k);
    }
  });
}

// ---------------------------------------------------------------- push
const KINDS = ['attempts', 'qstats', 'saved', 'notes', 'asg'];
const MAX_DOC = 900 * 1024; // Firestore's limit is 1 MiB per document

function examPayload(examId) {
  const keys = {};
  for (const kind of KINDS) {
    const v = store.getRaw(`${kind}:${examId}`);
    if (v != null) keys[kind] = v;
  }
  // keep the document under the size limit: drop answer details from older attempts first
  if (keys.attempts && keys.attempts.length > MAX_DOC / 2) {
    let list = JSON.parse(keys.attempts);
    list = list.map((a, i) => (i < list.length - 30 ? { ...a, answers: undefined, times: undefined } : a));
    keys.attempts = JSON.stringify(list);
    while (keys.attempts.length > MAX_DOC / 2 && list.length > 10) { list = list.slice(Math.ceil(list.length / 4)); keys.attempts = JSON.stringify(list); }
  }
  return keys;
}

async function summaryFor(examId) {
  let exam = null;
  try { exam = await getExam(examId); } catch {}
  const stats = store.get(`qstats:${examId}`, {});
  const attempts = store.get(`attempts:${examId}`, []);
  const asg = store.get(`asg:${examId}`, {});
  let right = 0, wrong = 0, seen = 0, lastAnswer = 0;
  for (const s of Object.values(stats)) { right += s.right || 0; wrong += s.wrong || 0; if (s.seen) seen++; lastAnswer = Math.max(lastAnswer, s.last || 0); }
  const real = attempts.filter((a) => a.mode === 'exam');
  const out = {
    examId,
    examTitle: exam?.title || examId,
    course: exam?.course || '',
    totalQuestions: exam?.questions.length || 0,
    seen, right, wrong,
    accuracy: right + wrong ? right / (right + wrong) : null,
    attempts: attempts.length,
    realExamBest: real.length ? Math.max(...real.map((a) => a.score.pct)) : null,
    realExamLast: real.length ? real[real.length - 1].score.pct : null,
    lastQuiz: attempts.length ? attempts[attempts.length - 1].finishedAt || attempts[attempts.length - 1].startedAt || 0 : 0,
    lastAnswer,
    asg: Object.fromEntries(Object.entries(asg).map(([slug, a]) => [slug, { best: a.best || 0, total: a.total || 0, done: !!a.done, attempts: a.attempts || 0, hints: a.hints || 0, updated: a.updated || 0 }])),
    asgDone: Object.values(asg).filter((a) => a.done).length,
    // per question: [times right, times wrong, last answer right (1) or wrong (0)] for the dashboard's most-missed list
    qs: Object.fromEntries(Object.entries(stats).filter(([, x]) => x.seen).map(([qid, x]) => [qid, [x.right || 0, x.wrong || 0, x.lastCorrect === false ? 0 : 1]])),
  };
  if (exam) {
    const r = readiness(exam, stats, attempts);
    out.readiness = r.score;
    out.readinessLabel = r.label;
    out.topics = topicMastery(exam, stats).map((t) => ({ name: t.name, count: t.count, seen: t.seen, right: t.right, wrong: t.wrong, mastery: Math.round(t.mastery * 1000) / 1000 }));
  }
  out.lastActive = Math.max(out.lastQuiz, out.lastAnswer, ...Object.values(out.asg).map((a) => a.updated));
  out.days = activeDays(attempts, stats, asg);
  return out;
}

// The days (YYYY-MM-DD, last 60) this student studied, for the admin's activity chart. It rides
// along with the summary, which is only sent when progress changed, so it costs no extra saves.
// Days come from this device's study log plus the synced progress (so other devices count too).
function activeDays(attempts, stats, asg) {
  const day = (t) => (t ? new Date(t).toLocaleDateString('en-CA') : null);
  const since = day(Date.now() - 60 * 86400000);
  const set = new Set();
  for (const [d, a] of Object.entries(store.getActivity())) if ((a.ms || 0) > 0 || (a.answered || 0) > 0) set.add(d);
  for (const a of attempts) set.add(day(a.finishedAt || a.startedAt));
  for (const x of Object.values(stats)) set.add(day(x.last));
  for (const a of Object.values(asg)) set.add(day(a.updated));
  return [...set].filter((d) => d && d >= since).sort();
}

// The student's classes that include this exam (instructors' own practice isn't reported)
const classesWithExam = (examId) => myClasses().filter((c) => !isStaffRole(c.role) && (c.exams || []).includes(examId));

const who = () => ({ uid: user.uid, email: user.email.toLowerCase(), name: user.displayName || user.email.split('@')[0] });

export function flush() {
  if (!user || !fb) return Promise.resolve();
  // a save is already running: try again once it ends (on a later turn, never in a tight loop)
  if (flushing) return flushing.then(() => new Promise((r) => setTimeout(r, 0))).then(() => (hasPending() ? flush() : flushing || undefined));
  if (!navigator.onLine) { schedule(untilAllowed(GAP_MS)); return Promise.resolve(); }
  clearTimeout(timer); timer = null;
  const exams = [...dirtyExams], codes = [...dirtyCode], doUser = dirtyUser;
  const force = forceNext; forceNext = false;
  dirtyExams.clear(); dirtyCode.clear(); dirtyUser = false;
  const base = fb.doc(fb.db, 'users', user.uid);
  const me = who();
  // `flushing` must be set before the save runs: a save with nothing to send finishes without
  // waiting, and its "finally" would otherwise run before this assignment, leaving `flushing`
  // set for good (every later save then waited on it forever and froze the page)
  let finish;
  flushing = new Promise((r) => (finish = r));
  (async () => {
    await null;
    try {
      const pushed = { ...(store.get('pushed', {})) };       // fingerprints of what the account already has
      const changed = (key, obj) => { const h = fingerprint(obj); if (pushed[key] === h) return false; pushed[key] = h; return true; };
      const writes = [];   // [doc, data, options]
      const done = [];     // bookkeeping to run once the writes succeed
      if (doUser) {
        const s = store.getSettings();
        const settings = { subjects: s.subjects ?? null, subjectsSeen: s.subjectsSeen ?? null };
        // only when the class choice changed
        if (changed('user', settings)) writes.push([base, { ...me, lastSeen: Date.now(), settings }, { merge: true }]);
      }
      // One save writes at most two records per exam: the student's progress (with their code)
      // and the dashboard summary (with the instructor's copy of the code).
      for (const examId of new Set([...exams, ...codes])) {
        const meta = getSyncMeta(examId);
        const keys = examPayload(examId);
        const codesNow = codesFor(examId);
        const progressChanged = changed('exam:' + examId, [keys, codesNow, meta.resetAt || 0]);
        // nothing studied yet: no progress record, only the "signed in" summary below
        const empty = !Object.keys(keys).length && !Object.keys(codesNow).length && !meta.resetAt;
        if (progressChanged && !empty) {
          writes.push([fb.doc(base, 'exams', examId), { ...me, examId, keys, codes: codesNow, codeAt: meta.codeAt || {}, resetAt: meta.resetAt || 0, updatedAt: Date.now() }]);
        }
        const classes = classesWithExam(examId);
        // the summary is worked out from the progress, so it only needs sending when that changed
        // (or if this device has never sent one and didn't just download the progress)
        if (classes.length && (progressChanged || !meta.sumAt)) {
          const sum = await summaryFor(examId);
          if (changed('sum:' + examId, { ...sum, lastActive: 0, codes: codesNow })) {
            done.push(() => setSyncMeta(examId, { sumAt: Date.now() }));
            for (const c of classes) writes.push([fb.doc(fb.db, 'classes', c.id, 'summaries', `${user.uid}_${examId}`), { ...me, ...sum, codes: codesNow, codeAt: meta.codeAt || {}, classId: c.id, section: c.section || '', updatedAt: Date.now() }]);
          }
        }
      }
      if (writes.length) {
        // each student has a daily allowance so the whole site stays inside the free plan
        const today = savesToday();
        if (!force && today.n + writes.length > DAILY_LIMIT) { const e = new Error('daily allowance used'); e.code = 'daily-limit'; throw e; }
        await Promise.all(writes.map(([ref, data, opts]) => (opts ? fb.setDoc(ref, data, opts) : fb.setDoc(ref, data))));
        store.quietly(() => store.set('saves', { day: today.day, n: today.n + writes.length }));
        lastFlushAt = Date.now(); // only real saves count towards the gaps
      }
      done.forEach((f) => f());
      store.quietly(() => store.set('pushed', pushed));
      for (const examId of new Set([...exams, ...codes])) setSyncMeta(examId, { at: Date.now() });
      lastSynced = Date.now();
      syncError = '';
    } catch (e) {
      console.error('Sync failed', e);
      exams.forEach((x) => dirtyExams.add(x)); codes.forEach((x) => dirtyCode.add(x)); if (doUser) dirtyUser = true;
      syncError = e?.code === 'daily-limit'
        ? "You've used today's saves to your account. Keep studying: your progress is safe on this device and will be saved to your account after midnight."
        : e?.code === 'resource-exhausted'
        ? "Today's free saving limit was reached. Your progress is safe on this device and will be saved tomorrow."
        : e?.code === 'permission-denied'
        ? 'Your account is not allowed to save progress. Sign out and sign in with your school account.'
        : 'Saving to your account failed. It will try again automatically.';
      schedule(e?.code === 'daily-limit' ? untilTomorrow() : e?.code === 'resource-exhausted' ? 60 * 60 * 1000 : 5 * 60 * 1000);
    } finally {
      flushing = null;
      finish();
      emitSync();
    }
  })();
  return flushing;
}

// This exam's assignment code on this device: { slug: code }
function codesFor(examId) {
  const out = {};
  for (const k of store.allKeys()) { const m = CODE_KEY.exec(k); if (m && m[1] === examId) out[m[2]] = store.getRaw(k); }
  return out;
}

// Saves are counted per Pacific day, the same day Firebase's free allowance uses
const pacific = (d = new Date()) => Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((p) => [p.type, p.value]));
function savesToday() {
  const p = pacific();
  const day = `${p.year}-${p.month}-${p.day}`;
  const s = store.get('saves', {});
  return { day, n: s.day === day ? s.n || 0 : 0 };
}
// time until just after midnight Pacific, spread over half an hour so everyone doesn't save at once
function untilTomorrow() {
  const p = pacific();
  const left = 86400 - (Number(p.hour) * 3600 + Number(p.minute) * 60 + Number(p.second));
  return (left + 60) * 1000 + Math.floor(Math.random() * 30 * 60 * 1000);
}
export const savesLeftToday = () => Math.max(0, DAILY_LIMIT - savesToday().n);

// A short fingerprint of what was saved, so identical data is never sent twice
function fingerprint(obj) {
  const str = JSON.stringify(obj);
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36) + ':' + str.length;
}

async function resetExamCloud(examId) {
  const now = Date.now();
  setSyncMeta(examId, { resetAt: now, codeAt: {} });
  dirtyExams.add(examId); dirtyCode.add(examId);
  forceNext = true;
  await flush();
}

async function eraseAllCloud() {
  store.quietly(() => store.setRaw('owner', user.uid));
  try {
    const manifest = await getManifest();
    for (const e of manifest.exams) { setSyncMeta(e.id, { resetAt: Date.now(), codeAt: {} }); dirtyExams.add(e.id); dirtyCode.add(e.id); }
    dirtyUser = true;
    forceNext = true;
    await flush();
  } catch (e) { console.error(e); }
}

// ---------------------------------------------------------------- announcements
const annCache = new Map();
export async function listAnnouncements(classId, { fresh = false } = {}) {
  await load();
  const hit = annCache.get(classId);
  if (hit && !fresh && Date.now() - hit.at < 120000) return hit.list;
  const snap = await fb.getDocs(fb.collection(fb.db, 'classes', classId, 'announcements'));
  const today = new Date().toLocaleDateString('en-CA');
  const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => b.createdAt - a.createdAt);
  annCache.set(classId, { at: Date.now(), list });
  return list.map((a) => ({ ...a, expired: !!a.until && a.until < today }));
}
export async function postAnnouncement(classId, { text, until }) {
  await load();
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  await fb.setDoc(fb.doc(fb.db, 'classes', classId, 'announcements', id), { text: text.slice(0, 500), until: until || '', author: user.displayName || user.email, authorEmail: user.email.toLowerCase(), createdAt: Date.now() });
  annCache.delete(classId);
}
export async function deleteAnnouncement(classId, id) {
  await load();
  const b = fb.writeBatch(fb.db);
  b.delete(fb.doc(fb.db, 'classes', classId, 'announcements', id));
  await b.commit();
  annCache.delete(classId);
}

// ---------------------------------------------------------------- question reports
export const canReport = (examId) => enabled && !!user && classesWithExam(examId).length > 0;
export async function reportQuestion({ examId, qid, text, reason, note }) {
  await load();
  const c = classesWithExam(examId)[0];
  if (!c) throw new Error('You need to be on a class roster to send reports.');
  await fb.setDoc(fb.doc(fb.db, 'classes', c.id, 'reports', `${user.uid}_${examId}_${qid}`.replace(/[\/]/g, '-')), {
    ...who(), classId: c.id, examId, qid, text, reason, note: note.slice(0, 600), section: c.section || '', status: 'open', createdAt: Date.now(),
  });
}
export async function classReports(classId) {
  await load();
  const snap = await fb.getDocs(fb.collection(fb.db, 'classes', classId, 'reports'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
export async function setReportStatus(classId, id, status) {
  await load();
  await fb.setDoc(fb.doc(fb.db, 'classes', classId, 'reports', id), { status, resolvedBy: user.email.toLowerCase(), resolvedAt: Date.now() }, { merge: true });
}

// ---------------------------------------------------------------- real exam scores (staff only)
// classes/{classId}/grades/{gradeId}: { name, maxPoints, date, examId, scores: [{ email, score }], … }
// Uploaded by the class's instructors/TAs for the Analytics page. Students can never read them.
export async function listGrades(classId) {
  await load();
  const snap = await fb.getDocs(fb.collection(fb.db, 'classes', classId, 'grades'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || (a.uploadedAt || 0) - (b.uploadedAt || 0));
}
export async function saveGrades(classId, { id, name, maxPoints, date = '', examId = '', scores, source = '' }) {
  await load();
  const gid = id || (String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'exam') + '-' + Date.now().toString(36);
  await fb.setDoc(fb.doc(fb.db, 'classes', classId, 'grades', gid), {
    name: String(name).slice(0, 80), maxPoints: Number(maxPoints) || 100, date, examId, source: String(source).slice(0, 120),
    scores: scores.map((x) => ({ email: x.email, score: Number(x.score) })), count: scores.length,
    uploadedAt: Date.now(), uploadedBy: user.email.toLowerCase(),
  });
  return gid;
}
export async function deleteGrades(classId, gid) {
  await load();
  const b = fb.writeBatch(fb.db);
  b.delete(fb.doc(fb.db, 'classes', classId, 'grades', gid));
  await b.commit();
}

// ---------------------------------------------------------------- instructor reads
export async function classSummaries(classId) {
  await load();
  const snap = await fb.getDocs(fb.collection(fb.db, 'classes', classId, 'summaries'));
  return snap.docs.map((d) => d.data());
}
export async function studentCode(classId, uid, examId) {
  await load();
  const snap = await fb.getDoc(fb.doc(fb.db, 'classes', classId, 'code', `${uid}_${examId}`));
  return snap.exists() ? snap.data() : null;
}
export async function getClass(classId) {
  await load();
  const snap = await fb.getDoc(fb.doc(fb.db, 'classes', classId));
  return snap.exists() ? { id: classId, ...snap.data() } : null;
}
export async function getRoster(classId) {
  await load();
  const snap = await fb.getDoc(fb.doc(fb.db, 'rosters', classId));
  return snap.exists() ? snap.data().people || [] : [];
}

// Someone signed in with a school account that isn't on any roster: record it once per device
// (email, name, time) so the admin can see who is locked out, e.g. an email alias on the roster.
async function noteUnrosteredSignIn() {
  try {
    const key = 'unrostered:' + user.uid;
    if (store.get(key, 0) > Date.now() - 6 * 3600 * 1000) return; // at most every 6 hours per device
    await fb.setDoc(fb.doc(fb.db, 'signins', user.email.toLowerCase()), { email: user.email.toLowerCase(), name: user.displayName || '', at: Date.now() });
    store.quietly(() => store.set(key, Date.now()));
  } catch (e) { console.warn('Could not record the sign-in', e?.code || e); }
}
// Admin: school accounts that signed in but aren't on any roster
export async function listUnrostered() {
  await load();
  const snap = await fb.getDocs(fb.collection(fb.db, 'signins'));
  return snap.docs.map((d) => d.data());
}

// ---------------------------------------------------------------- admin: classes and rosters
// Everyone who has signed in at least once (admins only): one read per person
export async function listUsers() {
  await load();
  const snap = await fb.getDocs(fb.collection(fb.db, 'users'));
  return snap.docs.map((d) => ({ uid: d.id, email: String(d.data().email || '').toLowerCase(), name: d.data().name || '', lastSeen: d.data().lastSeen || 0 }));
}
export async function listClasses() {
  await load();
  const snap = await fb.getDocs(fb.collection(fb.db, 'classes'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

// staff:    [{ name, email, role: 'instructor' | 'ta', sections: [] }]   (no sections = all sections)
// students: [{ email, name, redId, section }]
export async function saveClass({ id, name, course, term, exams, staff, students, color = 'blue', examDates = {} }) {
  await load();
  const prevPeople = await getRoster(id).catch(() => []);
  const staffList = [];
  for (const s of staff) {
    const email = s.email.trim().toLowerCase();
    if (!email || staffList.some((x) => x.email === email)) continue;
    staffList.push({ name: (s.name || '').trim(), email, role: s.role === 'ta' ? 'ta' : 'instructor', sections: s.role === 'ta' ? [...new Set(s.sections || [])] : [] });
  }
  const everyone = new Map();
  for (const p of students) if (!staffList.some((x) => x.email === p.email)) everyone.set(p.email, { ...p, role: 'student' });
  for (const s of staffList) everyone.set(s.email, { email: s.email, name: s.name, redId: '', section: s.sections.join(', '), sections: s.sections, role: s.role });
  const info = { name, course: course || '', term: term || '', exams, color, examDates };
  const ops = [];
  ops.push((b) => b.set(fb.doc(fb.db, 'classes', id), { ...info, staff: staffList, instructors: staffList.map((x) => x.email), studentCount: [...everyone.values()].filter((p) => p.role === 'student').length, updatedAt: Date.now(), updatedBy: user.email.toLowerCase() }));
  ops.push((b) => b.set(fb.doc(fb.db, 'rosters', id), { classId: id, people: [...everyone.values()], updatedAt: Date.now() }));
  for (const p of everyone.values()) {
    const entry = { ...info, role: p.role, section: p.section || '' };
    if (p.role !== 'student') entry.sections = p.sections || [];
    // clear the old entry first so removed fields (like an exam date) really disappear
    ops.push((b) => b.set(fb.doc(fb.db, 'enrollments', p.email), { classes: { [id]: fb.deleteField() } }, { merge: true }));
    ops.push((b) => b.set(fb.doc(fb.db, 'enrollments', p.email), { email: p.email, classes: { [id]: entry } }, { merge: true }));
  }
  const removed = prevPeople.filter((p) => !everyone.has(p.email));
  for (const p of removed) ops.push((b) => b.set(fb.doc(fb.db, 'enrollments', p.email), { classes: { [id]: fb.deleteField() } }, { merge: true }));
  await runOps(ops);
  return { added: [...everyone.keys()].filter((e) => !prevPeople.some((p) => p.email === e)).length, removed: removed.length, total: everyone.size };
}

// Admin: put one person on a class roster as a student (e.g. someone who signed in with an
// email the roster didn't have). Same records as saving the class, for just this person.
export async function addStudentToClass(classId, { email, name = '', section = '' }) {
  await load();
  email = String(email || '').trim().toLowerCase();
  if (!email) throw new Error('No email');
  const cls = await getClass(classId);
  if (!cls) throw new Error('That class no longer exists');
  const people = await getRoster(classId).catch(() => []);
  if (people.some((p) => p.email === email)) return { already: true };
  const person = { email, name: String(name || '').slice(0, 120), redId: '', section, role: 'student' };
  const info = { name: cls.name, course: cls.course || '', term: cls.term || '', exams: cls.exams || [], color: cls.color || 'blue', examDates: cls.examDates || {} };
  const b = fb.writeBatch(fb.db);
  b.set(fb.doc(fb.db, 'rosters', classId), { classId, people: [...people, person], updatedAt: Date.now() });
  b.set(fb.doc(fb.db, 'enrollments', email), { email, classes: { [classId]: { ...info, role: 'student', section } } }, { merge: true });
  b.set(fb.doc(fb.db, 'classes', classId), { studentCount: people.filter((p) => p.role === 'student').length + 1, updatedAt: Date.now(), updatedBy: user.email.toLowerCase() }, { merge: true });
  b.delete(fb.doc(fb.db, 'signins', email));
  await b.commit();
  return { added: true };
}

// Admin: change a student's name or section on one class's roster. Email and RedID come from the
// roster upload and aren't changed here.
export async function updateStudent(classId, email, { name, section }) {
  await load();
  email = String(email || '').trim().toLowerCase();
  const cls = await getClass(classId);
  if (!cls) throw new Error('That class no longer exists');
  const people = await getRoster(classId);
  const i = people.findIndex((p) => p.email === email);
  if (i < 0) throw new Error('This student is no longer on the roster. Refresh the page.');
  const person = { ...people[i], name: String(name ?? people[i].name ?? '').trim().slice(0, 120), section: String(section ?? people[i].section ?? '').trim().slice(0, 60) };
  const info = { name: cls.name, course: cls.course || '', term: cls.term || '', exams: cls.exams || [], color: cls.color || 'blue', examDates: cls.examDates || {} };
  const b = fb.writeBatch(fb.db);
  b.set(fb.doc(fb.db, 'rosters', classId), { classId, people: people.map((p, j) => (j === i ? person : p)), updatedAt: Date.now() });
  b.set(fb.doc(fb.db, 'enrollments', email), { email, classes: { [classId]: { ...info, role: 'student', section: person.section } } }, { merge: true });
  b.set(fb.doc(fb.db, 'classes', classId), { updatedAt: Date.now(), updatedBy: user.email.toLowerCase() }, { merge: true });
  await b.commit();
  return person;
}
// Admin: take a student off one class (they lose access to it; their saved practice is kept)
export async function removeStudent(classId, email) {
  await load();
  email = String(email || '').trim().toLowerCase();
  const people = await getRoster(classId);
  if (!people.some((p) => p.email === email)) throw new Error('This student is no longer on the roster. Refresh the page.');
  const next = people.filter((p) => p.email !== email);
  const b = fb.writeBatch(fb.db);
  b.set(fb.doc(fb.db, 'rosters', classId), { classId, people: next, updatedAt: Date.now() });
  b.set(fb.doc(fb.db, 'enrollments', email), { classes: { [classId]: fb.deleteField() } }, { merge: true });
  b.set(fb.doc(fb.db, 'classes', classId), { studentCount: next.filter((p) => !p.role || p.role === 'student').length, updatedAt: Date.now(), updatedBy: user.email.toLowerCase() }, { merge: true });
  await b.commit();
}

export async function deleteClass(id) {
  await load();
  const people = await getRoster(id).catch(() => []);
  const ops = people.map((p) => (b) => b.set(fb.doc(fb.db, 'enrollments', p.email), { classes: { [id]: fb.deleteField() } }, { merge: true }));
  ops.push((b) => b.delete(fb.doc(fb.db, 'rosters', id)));
  ops.push((b) => b.delete(fb.doc(fb.db, 'classes', id)));
  await runOps(ops);
}

// Firestore batches hold at most 500 writes
async function runOps(ops) {
  for (let i = 0; i < ops.length; i += 450) {
    const b = fb.writeBatch(fb.db);
    ops.slice(i, i + 450).forEach((op) => op(b));
    await b.commit();
  }
}
