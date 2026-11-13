// Timed (proctored) exams: shared logic for the professor's pages and the student's exam screen.
// Pure functions only, so they can be tested in Node.
//
// What students' computers get: question text, choices (without which is right), points, programming
// instructions, starter code and sample tests. Answer keys, hidden tests and solutions are kept in a
// separate staff-only record and never sent to students.
import { gradeQuestion, isAnswered } from './parser.js';

// Firestore Timestamp, number of ms, Date or ISO text -> ms
export const ms = (v) => (v == null ? null : typeof v === 'number' ? v : typeof v.toMillis === 'function' ? v.toMillis() : v instanceof Date ? v.getTime() : Date.parse(v) || null);

export const QTYPE_LABEL = { single: 'Multiple choice', multi: 'Select all that apply', truefalse: 'True / false', numeric: 'Number', text: 'Short answer', long: 'Written answer', code: 'Programming' };

// Build the exam from a parsed question file and/or programming problems (readAssignments output).
// Returns { pub, key, totalPoints, counts }.
export function splitExam(parsed, assignments = []) {
  const pub = [], key = {};
  for (const q of parsed?.questions || []) {
    const item = { id: 'q-' + q.id, label: q.id, type: q.type, text: q.text, points: Number(q.points) || 1, topic: q.topic || '' };
    if (q.options) item.options = q.options.map((o) => o.text);
    pub.push(item);
    key[item.id] = q.type === 'long' ? { model: q.answer?.model || '' }
      : q.options ? { correct: q.options.map((o, i) => (o.correct ? i : -1)).filter((i) => i >= 0) }
      : { answer: q.answer };
  }
  for (const a of assignments) {
    const id = 'p-' + a.slug;
    const samples = a.tests.filter((t) => t.sample).map((t) => ({ name: t.name, input: t.input, output: t.output }));
    pub.push({ id, label: a.title, type: 'code', text: a.instructions, points: Number(a.points) || 10, cls: a.cls, starter: a.starter, samples, topic: (a.topics || []).join(', ') });
    key[id] = { tests: a.tests.map((t) => ({ name: t.name, input: t.input, output: t.output, sample: !!t.sample })), checks: a.checks || [] };
  }
  const totalPoints = pub.reduce((s, q) => s + q.points, 0);
  const counts = pub.reduce((c, q) => ((c[q.type] = (c[q.type] || 0) + 1), c), {});
  return { pub, key, totalPoints, counts };
}

// Small, repeatable random numbers from a text seed (so each student keeps the same order on reload)
export function seeded(seedText) {
  let h = 2166136261;
  for (const ch of String(seedText)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return () => { h += 0x6d2b79f5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function shuffled(arr, rand) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
// The order one student sees: questions (optionally shuffled, programming kept last) and choice order per question.
// Answers are always stored with the ORIGINAL choice numbers, so grading never depends on the order shown.
export function studentView(test, uid) {
  const rand = seeded(`${uid}|${test.id || test.title}`);
  let qs = test.questions.slice();
  if (test.shuffleQ) qs = [...shuffled(qs.filter((q) => q.type !== 'code'), rand), ...qs.filter((q) => q.type === 'code')];
  const optOrder = {};
  for (const q of qs) if (q.options) optOrder[q.id] = test.shuffleOpts && q.type !== 'truefalse' ? shuffled(q.options.map((_, i) => i), rand) : q.options.map((_, i) => i);
  return { questions: qs, optOrder };
}

export function answered(q, v) {
  if (q.type === 'code') return typeof v === 'string' && v.trim() !== '' && v.trim() !== String(q.starter || '').trim();
  if (q.type === 'long') return typeof v === 'string' && v.trim() !== '';
  return isAnswered(q, v);
}

// Auto-grade everything except programming (needs the Java runner) and written answers (by hand).
// Returns points for the question, or null when it needs the runner / a person.
export function gradeObjective(q, k, v) {
  if (q.type === 'code' || q.type === 'long') return null;
  if (!answered(q, v)) return 0;
  const full = { ...q, options: q.options?.map((text, i) => ({ text, correct: (k.correct || []).includes(i) })), answer: k.answer };
  return gradeQuestion(full, v) ? q.points : 0;
}
// Programming: points in proportion to tests (all of them, hidden included) and structure checks passed
export function codePoints(q, result) {
  if (!result || !result.total) return 0;
  return Math.round((q.points * result.passed / result.total) * 100) / 100;
}

// Exam status for a time (ms)
export function examPhase(t, now = Date.now()) {
  if (t.status !== 'published') return 'draft';
  if (now < ms(t.opensAt)) return 'upcoming';
  if (now < ms(t.closesAt)) return 'open';
  return 'closed';
}
// When this attempt must finish (ms): its own time limit or the exam's closing time, whichever comes first,
// plus any extra time given (accommodations, or added by the professor).
export function attemptDeadline(t, a) {
  const extra = (Number(a?.extraMin) || 0) * 60000;
  return Math.min(ms(a.startedAt) + Number(t.durationMin) * 60000, ms(t.closesAt)) + extra;
}

// Parse "email minutes" lines for extra time (accommodations)
export function parseExtraTime(text, domain = 'sdsu.edu') {
  const out = [], bad = [];
  String(text || '').split(/\n+/).map((l) => l.trim()).filter(Boolean).forEach((line) => {
    const m = line.match(/^([^\s,;]+)[\s,;]+(\d{1,3})\s*(?:m|min|mins|minutes)?$/i);
    if (!m) { bad.push(line); return; }
    let email = m[1].toLowerCase();
    if (!email.includes('@')) email += '@' + domain;
    out.push({ email, minutes: Number(m[2]) });
  });
  return { list: out, bad };
}

// Browser, system and device kind from the user agent (for the professor's monitor)
export function deviceInfo(ua = '', touch = 0, width = 0) {
  const os = /iPad|Macintosh.*Mobile/.test(ua) || (/Macintosh/.test(ua) && touch > 1) ? 'iPad' : /iPhone/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /CrOS/.test(ua) ? 'ChromeOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Other';
  const browser = /SEB\//.test(ua) ? 'Safe Exam Browser' : /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const phone = os === 'iPhone' || (os === 'Android' && /Mobile/.test(ua)) || (touch > 0 && width > 0 && width < 600);
  return { os, browser, phone, seb: /SEB\//.test(ua) };
}

// Plain-language name for an exit reason
export const EXIT_LABEL = {
  'tab-hidden': 'Switched tab, app or desktop',
  'window-blur': 'Clicked outside the exam window',
  'fullscreen-exit': 'Left full screen',
  'page-leave': 'Closed or reloaded the page',
  'print-screen': 'Pressed the screenshot key',
  'devtools-key': 'Tried to open developer tools',
  'returned-after-leaving': 'Came back after leaving',
  'other-device': 'Opened the exam on another device',
  'professor-ended': 'Ended by the professor',
  'time-up': 'Time ran out',
  'submitted': 'Submitted',
};
