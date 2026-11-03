// Question-file parser. Pure JS with no dependencies, so the same code runs in
// the build script (Node) and in the browser ("Check a question file" page).
//
// Format overview (see README.md for the full guide):
//
//   ---
//   title: Midterm 2
//   active: true
//   time_limit: 75
//   ---
//   # Topic: Recursion
//   ## Q1 · single · easy · on-exam
//   Question text (Markdown, $math$, code blocks, images)
//   - [ ] wrong choice
//   - [x] right choice
//   > Hint: optional hint
//   > Explanation: why the answer is right

const TYPE_ALIASES = {
  single: 'single', mc: 'single', mcq: 'single', choice: 'single',
  multi: 'multi', multiple: 'multi', select: 'multi', 'select-all': 'multi', checkbox: 'multi',
  tf: 'truefalse', truefalse: 'truefalse', 'true-false': 'truefalse', 'true/false': 'truefalse',
  numeric: 'numeric', number: 'numeric', num: 'numeric',
  text: 'text', fill: 'text', blank: 'text', short: 'text', 'fill-in': 'text',
};
const DIFFICULTIES = ['easy', 'medium', 'hard'];
const EXAM_TAGS = ['on-exam', 'onexam', 'exam', 'real', 'actual'];

export const TYPE_LABELS = {
  single: 'Single answer', multi: 'Select all that apply', truefalse: 'True / False',
  numeric: 'Numeric answer', text: 'Fill in the blank',
};

function parseScalar(raw) {
  const v = raw.trim();
  if (/^(true|yes|on)$/i.test(v)) return true;
  if (/^(false|no|off)$/i.test(v)) return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  const q = v.match(/^"(.*)"$|^'(.*)'$/);
  if (q) return q[1] ?? q[2];
  return v;
}

function stripTrailingComment(s) {
  // "75   # minutes" -> "75" (only when # follows whitespace and we're not in quotes)
  let inQ = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQ) { if (c === inQ) inQ = null; continue; }
    if (c === '"' || c === "'") { inQ = c; continue; }
    if (c === '#' && i > 0 && /\s/.test(s[i - 1])) return s.slice(0, i).trimEnd();
  }
  return s;
}

export function parseNumber(str) {
  if (str == null) return NaN;
  let s = String(str).trim().replace(/,/g, '').replace(/\s+/g, '');
  if (!s) return NaN;
  const frac = s.match(/^(-?\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  const pct = s.match(/^(-?\d*\.?\d+(?:e-?\d+)?)%$/i);
  if (pct) return Number(pct[1]);
  if (!/^-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s)) return NaN;
  return Number(s);
}

// "= 3.14 ± 0.01", "= 3.14 +- 1%", "= 2..3", "= 45"
function parseNumericAnswer(raw) {
  const s = raw.trim();
  const range = s.match(/^(.+?)\s*\.\.\s*(.+)$/);
  if (range) {
    const a = parseNumber(range[1]), b = parseNumber(range[2]);
    if (isNaN(a) || isNaN(b)) return null;
    return { min: Math.min(a, b), max: Math.max(a, b), display: s };
  }
  const tol = s.match(/^(.+?)\s*(?:±|\+-|\+\/-)\s*(.+)$/);
  if (tol) {
    const v = parseNumber(tol[1]);
    const t = tol[2].trim();
    if (isNaN(v)) return null;
    if (t.endsWith('%')) {
      const p = parseNumber(t.slice(0, -1));
      if (isNaN(p)) return null;
      const d = Math.abs(v) * p / 100;
      return { min: v - d, max: v + d, display: s };
    }
    const d = parseNumber(t);
    if (isNaN(d)) return null;
    return { min: v - Math.abs(d), max: v + Math.abs(d), display: s };
  }
  const v = parseNumber(s);
  if (isNaN(v)) return null;
  const eps = 1e-9 * Math.max(1, Math.abs(v));
  return { min: v - eps, max: v + eps, display: s };
}

const IMG_RE = /!\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;

export function findImages(text) {
  const out = [];
  let m;
  IMG_RE.lastIndex = 0;
  while ((m = IMG_RE.exec(text))) out.push(m[1]);
  return out;
}

export function isRelativeUrl(src) {
  return !/^(https?:|data:|\/\/|\/)/i.test(src);
}

export function rewriteImages(text, base) {
  return text.replace(IMG_RE, (whole, src) => {
    if (!isRelativeUrl(src)) return whole;
    return whole.replace(src, base + src.replace(/^\.\//, ''));
  });
}

/**
 * Parse a question file.
 * @returns {{meta, questions, topics, errors, warnings}}
 * errors/warnings are {line, id?, message}
 */
export function parseExam(source, { fallbackTitle = 'Untitled exam' } = {}) {
  const lines = String(source).replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  const errors = [];
  const warnings = [];
  const meta = {};
  const err = (line, message, id) => errors.push({ line, message, id });
  const warn = (line, message, id) => warnings.push({ line, message, id });

  let i = 0;
  // ---- settings block
  let firstContent = 0;
  while (firstContent < lines.length && !lines[firstContent].trim()) firstContent++;
  if (lines[firstContent]?.trim() === '---') {
    let j = firstContent + 1;
    for (; j < lines.length && lines[j].trim() !== '---'; j++) {
      const l = lines[j];
      if (!l.trim() || l.trim().startsWith('#')) continue;
      const m = l.match(/^\s*([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
      if (!m) { err(j + 1, `Couldn't read this settings line: "${l.trim()}". Use the form  name: value`); continue; }
      meta[m[1].toLowerCase().replace(/-/g, '_')] = parseScalar(stripTrailingComment(m[2]));
    }
    if (j >= lines.length) {
      err(firstContent + 1, 'The settings block starts with --- but never ends. Add a line with just --- after the settings.');
      i = lines.length;
    } else i = j + 1;
  }

  const questions = [];
  const topicOrder = [];
  let topic = null;
  let topicLine = 0;
  let q = null;
  let inFence = null;
  let inComment = false;
  let lastTarget = null; // 'option' | 'explanation' | 'hint' | null

  const startTopic = (name, line) => {
    topic = name.trim();
    topicLine = line;
    if (!topicOrder.includes(topic)) topicOrder.push(topic);
  };

  const finish = () => {
    if (!q) return;
    finalizeQuestion(q, { err, warn });
    questions.push(q);
    q = null;
  };

  for (; i < lines.length; i++) {
    const lineNo = i + 1;
    let line = lines[i];

    // --- HTML comments (used for CHECK notes)
    if (inComment) {
      const end = line.indexOf('-->');
      if (end === -1) { if (q && /CHECK/i.test(line)) q.checks.push(line.trim()); continue; }
      inComment = false;
      line = line.slice(end + 3);
      if (!line.trim()) continue;
    }
    if (!inFence && line.includes('<!--')) {
      let out = '';
      let rest = line;
      while (rest.includes('<!--')) {
        const s = rest.indexOf('<!--');
        out += rest.slice(0, s);
        const e = rest.indexOf('-->', s + 4);
        const body = e === -1 ? rest.slice(s + 4) : rest.slice(s + 4, e);
        if (/CHECK/i.test(body)) {
          const note = body.replace(/^\s*CHECK\s*:?\s*/i, '').trim();
          if (q) q.checks.push(note || 'needs review');
          warn(lineNo, `CHECK note: ${note || 'needs review'}`, q?.id);
        }
        if (e === -1) { inComment = true; rest = ''; break; }
        rest = rest.slice(e + 3);
      }
      line = out + rest;
      if (!line.trim()) continue;
    }

    // --- code fences: everything inside is question text
    const fence = line.match(/^\s*(```+|~~~+)/);
    if (fence) {
      if (!inFence) inFence = fence[1][0];
      else if (fence[1][0] === inFence) inFence = null;
      if (!q) { err(lineNo, 'Code block found outside a question. Put it under a "## Q..." heading.'); continue; }
      if (q.stage !== 'body') err(lineNo, 'Code blocks must be in the question text, above the answer choices.', q.id);
      q.body.push(line);
      continue;
    }
    if (inFence) { if (q) q.body.push(line); continue; }

    // --- topic heading
    const t = line.match(/^#\s+(.+?)\s*#*\s*$/);
    if (t) {
      finish();
      startTopic(t[1].replace(/^topic\s*[:\-–]\s*/i, ''), lineNo);
      lastTarget = null;
      continue;
    }

    // --- question heading
    const h = line.match(/^##\s+(.+?)\s*$/);
    if (h) {
      finish();
      const parts = h[1].split(/[\s·|•,]+/).filter(Boolean);
      const id = parts.shift();
      q = {
        id, line: lineNo, topic: topic ?? 'General', type: null, difficulty: null, onExam: false,
        points: 1, tags: [], body: [], options: [], answers: [], explanation: [], hint: [],
        checks: [], stage: 'body',
      };
      if (!topic) {
        warn(lineNo, `${id} comes before any "# Topic" heading, so it was put under "General".`, id);
        startTopic('General', lineNo);
      }
      if (!/^[A-Za-z0-9][\w.\-]*$/.test(id)) err(lineNo, `"${id}" isn't a valid question ID. Use letters, numbers, dots or dashes (e.g. Q12 or 3.4).`, id);
      for (const raw of parts) {
        const p = raw.toLowerCase();
        if (TYPE_ALIASES[p]) { q.type = TYPE_ALIASES[p]; continue; }
        if (DIFFICULTIES.includes(p)) { q.difficulty = p; continue; }
        if (EXAM_TAGS.includes(p)) { q.onExam = true; continue; }
        const pts = p.match(/^(\d+(?:\.\d+)?)(?:pts?|points?)$/);
        if (pts) { q.points = Number(pts[1]); continue; }
        q.tags.push(raw);
      }
      lastTarget = null;
      continue;
    }

    if (!q) {
      if (line.trim()) {
        if (topic && line.trim()) {
          // text right under a topic heading: treat as a topic description, ignore
          continue;
        }
        warn(lineNo, 'This text is outside any question and was ignored.');
      }
      continue;
    }

    // --- choice line
    const opt = line.match(/^\s{0,3}[-*+]\s+\[([ xX✓✔])\]\s?(.*)$/);
    if (opt) {
      if (q.stage === 'after') err(lineNo, 'Answer choices must come before the explanation.', q.id);
      q.stage = 'options';
      q.options.push({ text: opt[2].trim(), correct: opt[1] !== ' ', line: lineNo });
      lastTarget = 'option';
      continue;
    }

    // --- typed answer line
    const ans = line.match(/^\s{0,3}=\s*(.*)$/);
    if (ans) {
      if (q.stage === 'body' || q.stage === 'options') q.stage = 'options';
      q.answers.push({ raw: ans[1].trim(), line: lineNo });
      lastTarget = null;
      continue;
    }

    // --- explanation / hint
    const bq = line.match(/^\s{0,3}>\s?(.*)$/);
    if (bq) {
      let text = bq[1];
      const hint = text.match(/^\s*hint\s*:\s*(.*)$/i);
      const expl = text.match(/^\s*(?:explanation|why|answer explanation)\s*:\s*(.*)$/i);
      if (hint) { lastTarget = 'hint'; text = hint[1]; }
      else if (expl) { lastTarget = 'explanation'; text = expl[1]; }
      else if (lastTarget !== 'hint' && lastTarget !== 'explanation') lastTarget = 'explanation';
      q[lastTarget].push(text);
      if (lastTarget === 'explanation') q.stage = 'after';
      continue;
    }

    // --- plain lines
    if (!line.trim()) {
      if (q.stage === 'body') q.body.push('');
      else if (lastTarget === 'explanation' || lastTarget === 'hint') q[lastTarget].push('');
      continue;
    }
    if (q.stage === 'body') { q.body.push(line); continue; }
    if (lastTarget === 'option' && /^\s{2,}\S/.test(line)) {
      const o = q.options[q.options.length - 1];
      o.text += '\n' + line.trim();
      continue;
    }
    if ((lastTarget === 'explanation' || lastTarget === 'hint') && /^\s{2,}\S/.test(line)) {
      q[lastTarget].push(line.trim());
      continue;
    }
    err(lineNo, 'Unexpected text after the answer choices. Move question text above the choices, or start explanation lines with ">".', q.id);
  }
  if (inFence && q) err(q.line, 'A code block (```) was opened but never closed.', q.id);
  finish();

  // ---- whole-file checks
  const seen = new Map();
  for (const qq of questions) {
    if (seen.has(qq.id)) err(qq.line, `Question ID "${qq.id}" is used twice (first on line ${seen.get(qq.id)}). Every question needs its own ID.`, qq.id);
    else seen.set(qq.id, qq.line);
  }
  if (!questions.length) err(1, 'No questions found. Each question starts with a line like  ## Q1 · single');

  const topics = topicOrder
    .map((name) => ({ name, count: questions.filter((x) => x.topic === name).length }))
    .filter((x) => x.count > 0);

  const cleanMeta = {
    title: String(meta.title ?? fallbackTitle),
    course: meta.course != null ? String(meta.course) : '',
    description: meta.description != null ? String(meta.description) : '',
    active: meta.active === true,
    archived: meta.archived === true,
    hidden: meta.hidden === true,
    timeLimit: typeof meta.time_limit === 'number' ? meta.time_limit : null,
    passMark: typeof meta.pass_mark === 'number' ? meta.pass_mark : null,
    order: typeof meta.order === 'number' ? meta.order : 100,
    shuffleChoices: meta.shuffle_choices !== false,
    examDate: meta.exam_date != null ? String(meta.exam_date) : '',
  };
  if (meta.title == null) warn(1, `No "title:" in the settings block, so the exam is called "${cleanMeta.title}".`);
  if (meta.time_limit != null && typeof meta.time_limit !== 'number') err(1, `time_limit should be a number of minutes, not "${meta.time_limit}".`);
  if (meta.pass_mark != null && typeof meta.pass_mark !== 'number') err(1, `pass_mark should be a percentage number like 70, not "${meta.pass_mark}".`);

  return {
    meta: cleanMeta,
    topics,
    questions: questions.map(publicQuestion),
    errors: errors.sort((a, b) => a.line - b.line),
    warnings: warnings.sort((a, b) => a.line - b.line),
  };
}

function trimBlock(arr) {
  return arr.join('\n').replace(/^\n+|\n+$/g, '').trim();
}

function finalizeQuestion(q, { err, warn }) {
  const correct = q.options.filter((o) => o.correct).length;
  q.text = trimBlock(q.body);
  q.explanationText = trimBlock(q.explanation);
  q.hintText = trimBlock(q.hint);
  if (!q.text) err(q.line, `${q.id} has no question text. Write it on the lines after the heading.`, q.id);

  // infer type
  if (!q.type) {
    if (q.options.length) q.type = correct > 1 ? 'multi' : 'single';
    else if (q.answers.length) {
      const a = q.answers[0].raw.toLowerCase();
      q.type = ['true', 'false', 't', 'f'].includes(a) ? 'truefalse' : parseNumericAnswer(a) ? 'numeric' : 'text';
    }
  }
  q.answer = null;

  switch (q.type) {
    case 'truefalse': {
      if (!q.options.length) {
        const a = q.answers[0]?.raw.toLowerCase();
        if (!a) { err(q.line, `${q.id} is true/false but has no answer. Add  = true  or  = false`, q.id); break; }
        if (!['true', 'false', 't', 'f'].includes(a)) { err(q.answers[0].line, `${q.id}: a true/false answer must be "true" or "false", not "${q.answers[0].raw}".`, q.id); break; }
        const isTrue = a.startsWith('t');
        q.options = [{ text: 'True', correct: isTrue }, { text: 'False', correct: !isTrue }];
      }
      q.answers = [];
    } // falls through to choice checks
    case 'single':
    case 'multi': {
      const c = q.options.filter((o) => o.correct).length;
      if (q.answers.length) err(q.answers[0].line, `${q.id} has answer choices, so it can't also have an "=" answer line.`, q.id);
      if (q.options.length < 2) { err(q.line, `${q.id} needs at least two answer choices (lines starting with "- [ ]").`, q.id); break; }
      if (c === 0) err(q.line, `${q.id} has no correct answer marked. Mark it with [x], like  - [x] the right choice`, q.id);
      else if (q.type !== 'multi' && c > 1) err(q.line, `${q.id} has ${c} choices marked correct. Mark only one, or add "multi" to the heading if several are right.`, q.id);
      const texts = q.options.map((o) => o.text.trim());
      if (new Set(texts).size !== texts.length) warn(q.line, `${q.id} has two identical answer choices.`, q.id);
      if (q.options.some((o) => !o.text)) err(q.line, `${q.id} has an empty answer choice.`, q.id);
      break;
    }
    case 'numeric': {
      if (q.options.length) { err(q.line, `${q.id} is numeric, so it uses an "= number" line instead of choices.`, q.id); break; }
      if (!q.answers.length) { err(q.line, `${q.id} is numeric but has no answer. Add a line like  = 42  or  = 3.14 ± 0.01`, q.id); break; }
      const parsed = [];
      for (const a of q.answers) {
        const p = parseNumericAnswer(a.raw);
        if (!p) err(a.line, `${q.id}: "${a.raw}" isn't a number. Use forms like  = 42,  = 3.14 ± 0.01,  = 10 ± 5%,  or  = 2..3`, q.id);
        else parsed.push(p);
      }
      q.answer = { numeric: parsed };
      break;
    }
    case 'text': {
      if (q.options.length) { err(q.line, `${q.id} is fill-in-the-blank, so it uses an "= answer" line instead of choices.`, q.id); break; }
      if (!q.answers.length) { err(q.line, `${q.id} is fill-in-the-blank but has no answer. Add a line like  = mitochondria | mitochondrion`, q.id); break; }
      const accepted = q.answers.flatMap((a) => a.raw.split('|').map((s) => s.trim()).filter(Boolean));
      if (!accepted.length) err(q.line, `${q.id} has an empty answer line.`, q.id);
      q.answer = { text: accepted };
      break;
    }
    default:
      if (!q.options.length && !q.answers.length) err(q.line, `${q.id} has no answer. Add choices (- [ ] / - [x]) or an "= answer" line.`, q.id);
  }
  if (!q.explanationText) q.noExplanation = true;
}

function publicQuestion(q) {
  const out = {
    id: q.id,
    topic: q.topic,
    type: q.type,
    difficulty: q.difficulty || 'medium',
    onExam: q.onExam,
    points: q.points,
    tags: q.tags,
    text: q.text,
    explanation: q.explanationText || '',
    hint: q.hintText || '',
    line: q.line,
  };
  if (q.options.length) out.options = q.options.map((o) => ({ text: o.text, correct: o.correct }));
  if (q.answer) out.answer = q.answer;
  if (q.checks.length) out.check = q.checks;
  return out;
}

// ---------- grading (shared so the build can self-test) ----------
export function normalizeText(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[“”"'`’]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[.\s]+$/, '')
    .trim();
}

export function isAnswered(q, value) {
  if (value == null) return false;
  if (q.type === 'multi') return Array.isArray(value) && value.length > 0;
  if (q.type === 'numeric' || q.type === 'text') return String(value).trim() !== '';
  return typeof value === 'number';
}

export function gradeQuestion(q, value) {
  if (!isAnswered(q, value)) return false;
  switch (q.type) {
    case 'single':
    case 'truefalse':
      return !!q.options[value]?.correct;
    case 'multi': {
      const want = q.options.map((o, i) => (o.correct ? i : -1)).filter((i) => i >= 0);
      const got = [...new Set(value)].sort((a, b) => a - b);
      return want.length === got.length && want.every((v, i) => v === got[i]);
    }
    case 'numeric': {
      const v = parseNumber(value);
      if (isNaN(v)) return false;
      return q.answer.numeric.some((a) => v >= a.min - 1e-12 && v <= a.max + 1e-12);
    }
    case 'text': {
      const v = normalizeText(value);
      return q.answer.text.some((a) => normalizeText(a) === v);
    }
    default:
      return false;
  }
}

export function correctAnswerLabel(q) {
  if (q.type === 'numeric') return q.answer.numeric.map((a) => a.display).join('  or  ');
  if (q.type === 'text') return q.answer.text.join('  /  ');
  return q.options.filter((o) => o.correct).map((o) => o.text).join('\n');
}
