import { gradeQuestion, isAnswered } from './parser.js';
import * as store from './store.js';

export const MODES = {
  topic:   { label: 'Topic practice',      feedback: 'instant', timer: false },
  bank:    { label: 'Full question bank',  feedback: 'instant', timer: false },
  exam:    { label: 'Timed practice test', feedback: 'end',     timer: true  },
  mock:    { label: 'Random practice test', feedback: 'end',    timer: true  },
  custom:  { label: 'Custom exam',         feedback: 'end',     timer: true  },
  smart:   { label: 'Smart review',        feedback: 'instant', timer: false },
  mistakes:{ label: 'My mistakes',         feedback: 'instant', timer: false },
  saved:   { label: 'Saved questions',     feedback: 'instant', timer: false },
  retry:   { label: 'Retry',               feedback: 'instant', timer: false },
};

// Spaced repetition (Leitner boxes 1–5). Box 0 = never answered.
const DAY = 86400000;
const BOX_INTERVAL = [0, 10 * 60000, 1 * DAY, 3 * DAY, 7 * DAY, 16 * DAY];

// Modes that behave like a real test: no hints, no topic labels, unanswered = wrong
export const EXAM_LIKE = new Set(['exam', 'mock']);

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export function shuffle(arr, rand = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function qStat(stats, qid) {
  return stats[qid] || { seen: 0, right: 0, wrong: 0, box: 0, due: 0, last: 0, streak: 0, lastCorrect: null };
}

export function isDue(s, now = Date.now()) { return s.box > 0 && s.due <= now; }

export function mistakeIds(exam, stats) {
  return exam.questions.filter((q) => { const s = stats[q.id]; return s && s.lastCorrect === false; }).map((q) => q.id);
}

export function dueIds(exam, stats, now = Date.now()) {
  return exam.questions.filter((q) => isDue(qStat(stats, q.id), now)).map((q) => q.id);
}

// Picks questions for smart review: due first (weakest box first), then never-seen, then lowest mastery.
export function smartPick(exam, stats, count) {
  const now = Date.now();
  const scored = exam.questions.map((q) => {
    const s = qStat(stats, q.id);
    let pri;
    if (isDue(s, now)) pri = 0 + s.box * 0.1 + Math.random() * 0.05;
    else if (s.box === 0) pri = 1 + Math.random() * 0.5;
    else pri = 2 + s.box + (s.due - now) / (30 * DAY) + Math.random() * 0.2;
    return { id: q.id, pri };
  });
  return scored.sort((a, b) => a.pri - b.pri).slice(0, count).map((x) => x.id);
}

// A fresh exam with the same length and topic mix as the real one, drawn from the whole bank.
export function mockPick(exam) {
  const real = exam.questions.filter((q) => q.onExam);
  const size = real.length || Math.min(50, exam.questions.length);
  const want = new Map();
  if (real.length) real.forEach((q) => want.set(q.topic, (want.get(q.topic) || 0) + 1));
  else exam.topics.forEach((t) => want.set(t.name, Math.round((t.count / exam.questions.length) * size)));
  const picked = [];
  for (const t of exam.topics) {
    const n = want.get(t.name) || 0;
    picked.push(...shuffle(exam.questions.filter((q) => q.topic === t.name)).slice(0, n));
  }
  // top up if rounding left us short
  if (picked.length < size) {
    const have = new Set(picked.map((q) => q.id));
    picked.push(...shuffle(exam.questions.filter((q) => !have.has(q.id))).slice(0, size - picked.length));
  }
  return picked;
}

/**
 * opts: { topics, count, difficulties, types, source: all|unseen|missed|saved, ids, timeLimitMin,
 *         feedback, shuffleQuestions, shuffleChoices }
 */
export function buildSession(exam, mode, opts = {}) {
  const settings = store.getSettings();
  const stats = store.getStats(exam.id);
  const saved = new Set(store.getSaved(exam.id));
  const m = MODES[mode] || MODES.custom;
  let pool = exam.questions;
  let ordered = false;

  if (mode === 'exam') {
    const onExam = pool.filter((q) => q.onExam);
    pool = onExam.length ? onExam : pool;
    ordered = true;
  } else if (mode === 'mock') {
    pool = mockPick(exam);
    ordered = true;
  } else if (opts.ids?.length) {
    pool = opts.ids.map((id) => exam.byId.get(id)).filter(Boolean);
  } else if (mode === 'smart') {
    pool = smartPick(exam, stats, opts.count || 20).map((id) => exam.byId.get(id));
    ordered = true;
  } else if (mode === 'mistakes') {
    const ids = new Set(mistakeIds(exam, stats));
    pool = pool.filter((q) => ids.has(q.id));
  } else if (mode === 'saved') {
    pool = pool.filter((q) => saved.has(q.id));
  }

  if (!EXAM_LIKE.has(mode) && mode !== 'smart') {
    if (opts.topics?.length) pool = pool.filter((q) => opts.topics.includes(q.topic));
    if (opts.difficulties?.length) pool = pool.filter((q) => opts.difficulties.includes(q.difficulty));
    if (opts.types?.length) pool = pool.filter((q) => opts.types.includes(q.type));
    if (opts.source === 'unseen') pool = pool.filter((q) => !stats[q.id]?.seen);
    else if (opts.source === 'missed') pool = pool.filter((q) => stats[q.id]?.lastCorrect === false);
    else if (opts.source === 'saved') pool = pool.filter((q) => saved.has(q.id));
  }

  let ids = pool.map((q) => q.id);
  const shuffleQs = opts.shuffleQuestions ?? !ordered;
  if (shuffleQs) ids = shuffle(ids);
  if (opts.count && opts.count < ids.length) ids = ids.slice(0, opts.count);

  // Exam-like modes always shuffle choices so the answer letter can't be memorized.
  const shuffleChoices = EXAM_LIKE.has(mode) ? exam.shuffleChoices !== false : (opts.shuffleChoices ?? (settings.shuffleChoices && exam.shuffleChoices !== false));
  const choiceOrder = {};
  for (const id of ids) {
    const q = exam.byId.get(id);
    if (!q.options) continue;
    const idx = q.options.map((_, i) => i);
    // never shuffle True/False or "all/none of the above" style lists
    const fixed = q.type === 'truefalse' || q.options.length === 2 || q.options.some((o) => /\b(all|none|both|neither) of (the|these)\b|\bA and B\b/i.test(o.text));
    choiceOrder[id] = shuffleChoices && !fixed ? shuffle(idx) : idx;
  }

  let timeLimitMin = opts.timeLimitMin;
  if (timeLimitMin === undefined) timeLimitMin = EXAM_LIKE.has(mode) ? exam.timeLimit : null;

  return {
    id: uid(),
    examId: exam.id,
    examTitle: exam.title,
    mode,
    label: opts.label || m.label,
    feedback: opts.feedback || (EXAM_LIKE.has(mode) ? 'end' : m.feedback === 'instant' ? settings.feedback : m.feedback),
    questionIds: ids,
    choiceOrder,
    answers: {},
    checked: {},
    hintsUsed: {},
    flags: {},
    struck: {},
    times: {},
    current: 0,
    startedAt: Date.now(),
    elapsedMs: 0,
    timeLimitSec: timeLimitMin ? Math.round(timeLimitMin * 60) : null,
    paused: false,
    canPause: !EXAM_LIKE.has(mode),
    opts: { ...opts },
  };
}

export function gradeSession(exam, session, ids = session.questionIds) {
  const results = {};
  let earned = 0, total = 0, correct = 0, answered = 0;
  for (const id of ids) {
    const q = exam.byId.get(id);
    if (!q) continue;
    const value = session.answers[id];
    const ok = gradeQuestion(q, value);
    const pts = q.points || 1;
    total += pts;
    if (ok) { earned += pts; correct++; }
    if (isAnswered(q, value)) answered++;
    results[id] = { correct: ok, answered: isAnswered(q, value), points: pts };
  }
  return {
    results,
    score: { earned, total, correct, answered, count: ids.length, pct: total ? Math.round((earned / total) * 1000) / 10 : 0 },
  };
}

// Update a single question's spaced-repetition record
export function recordAnswer(stats, qid, correct, now = Date.now()) {
  const s = { ...qStat(stats, qid) };
  s.seen += 1;
  s.last = now;
  s.lastCorrect = correct;
  if (correct) { s.right += 1; s.streak += 1; s.box = Math.min(5, Math.max(1, s.box + 1)); }
  else { s.wrong += 1; s.streak = 0; s.box = 1; }
  s.due = now + BOX_INTERVAL[s.box];
  stats[qid] = s;
  return s;
}

// Called once when a session is submitted. Returns the saved attempt.
export function finishSession(exam, session) {
  // In practice modes, questions you never answered are "skipped", not wrong.
  // In exam-like modes (and timed custom exams) they count as wrong, like a real test.
  const strict = EXAM_LIKE.has(session.mode) || session.feedback === 'end' && !!session.timeLimitSec;
  const answeredIds = session.questionIds.filter((id) => { const q = exam.byId.get(id); return q && isAnswered(q, session.answers[id]); });
  const scoredIds = strict ? session.questionIds : answeredIds;
  const skippedIds = strict ? [] : session.questionIds.filter((id) => !answeredIds.includes(id));
  if (!scoredIds.length) { store.clearSession(); return null; }
  const { results, score } = gradeSession(exam, session, scoredIds);
  const stats = store.getStats(exam.id);
  const now = Date.now();
  for (const id of scoredIds) {
    const r = results[id];
    // instant-feedback questions were already recorded when checked
    if (r.answered && !session.checked[id]) recordAnswer(stats, id, r.correct, now);
  }
  store.saveStats(exam.id, stats);

  const attempt = {
    id: session.id,
    examId: exam.id,
    mode: session.mode,
    label: session.label,
    feedback: session.feedback,
    startedAt: session.startedAt,
    finishedAt: now,
    durationMs: session.elapsedMs,
    timeLimitSec: session.timeLimitSec,
    timedOut: !!session.timedOut,
    questionIds: scoredIds,
    skippedIds,
    choiceOrder: session.choiceOrder,
    answers: session.answers,
    flags: session.flags,
    times: session.times,
    hintsUsed: session.hintsUsed,
    opts: session.opts,
    results,
    score,
  };
  store.addAttempt(exam.id, attempt);
  store.logActivity(0, Object.values(results).filter((r) => r.answered).length - Object.keys(session.checked).length);
  store.clearSession();
  return attempt;
}

// ---------- analytics ----------
export function topicMastery(exam, stats) {
  const out = exam.topics.map((t) => ({ name: t.name, count: t.count, seen: 0, right: 0, wrong: 0, mastery: 0, due: 0 }));
  const by = new Map(out.map((t) => [t.name, t]));
  const now = Date.now();
  for (const q of exam.questions) {
    const t = by.get(q.topic);
    if (!t) continue;
    const s = qStat(stats, q.id);
    if (s.seen) t.seen++;
    t.right += s.right;
    t.wrong += s.wrong;
    t.mastery += s.box / 5;
    if (isDue(s, now)) t.due++;
  }
  for (const t of out) {
    t.mastery = t.count ? t.mastery / t.count : 0;
    t.accuracy = t.right + t.wrong ? t.right / (t.right + t.wrong) : null;
  }
  return out;
}

// A 0–100 estimate combining coverage, mastery and recent full-exam performance.
export function readiness(exam, stats, attempts) {
  const qs = exam.questions;
  if (!qs.length) return { score: 0, label: 'Not started', parts: {} };
  let mastery = 0, seen = 0;
  for (const q of qs) { const s = qStat(stats, q.id); mastery += s.box / 5; if (s.seen) seen++; }
  mastery /= qs.length;
  const coverage = seen / qs.length;
  const examLike = attempts.filter((a) => (a.mode === 'exam' || a.mode === 'mock' || a.mode === 'custom' || a.mode === 'bank') && a.score.count >= 5).slice(-3);
  const recent = examLike.length ? examLike.reduce((s, a) => s + a.score.pct, 0) / examLike.length / 100 : null;
  let score = recent == null ? mastery * 0.8 + coverage * 0.2 : mastery * 0.5 + recent * 0.35 + coverage * 0.15;
  score = Math.round(score * 100);
  const label = !seen ? 'Not started' : score >= 85 ? 'Ready' : score >= 65 ? 'Almost there' : score >= 40 ? 'Getting there' : 'Just starting';
  return { score, label, parts: { mastery, coverage, recent } };
}

export function missedRanking(exam, stats, limit = 10) {
  return exam.questions
    .map((q) => ({ q, s: qStat(stats, q.id) }))
    .filter((x) => x.s.wrong > 0)
    .sort((a, b) => (b.s.wrong / b.s.seen) - (a.s.wrong / a.s.seen) || b.s.wrong - a.s.wrong)
    .slice(0, limit);
}

export function streakDays(activity) {
  let n = 0;
  const d = new Date();
  const key = (x) => x.toLocaleDateString('en-CA');
  if (!activity[key(d)]) d.setDate(d.getDate() - 1); // today not studied yet: count from yesterday
  while (activity[key(d)]) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

export function fmtDuration(ms, { short = false } = {}) {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (short) return h ? `${h}h ${m}m` : m ? `${m}m ${sec}s` : `${sec}s`;
  const pad = (x) => String(x).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

export function fmtDate(ts) {
  const d = new Date(ts);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const y = new Date(today); y.setDate(today.getDate() - 1);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (sameDay) return `Today, ${time}`;
  if (d.toDateString() === y.toDateString()) return `Yesterday, ${time}`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + `, ${time}`;
}
