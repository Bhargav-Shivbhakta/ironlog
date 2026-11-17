// Reading real exam scores from a CSV (a Canvas gradebook export, or any simple sheet) and
// matching each row to a student on the class roster. Pure functions, so they can be tested.

// Split CSV or pasted spreadsheet text (tabs) into rows of cells. Handles quotes and "" escapes.
export function parseTable(text) {
  const src = String(text || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const firstLine = src.split('\n').find((l) => l.trim()) || '';
  const sep = (firstLine.match(/\t/g) || []).length > (firstLine.match(/,/g) || []).length ? '\t' : ',';
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') q = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c));
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
// "Lopez, Maria" -> "maria lopez"; "Maria  Lopez" -> "maria lopez"
const nameKey = (s) => { const t = String(s || '').trim(); const m = t.match(/^([^,]+),\s*(.+)$/); return norm(m ? `${m[2]} ${m[1]}` : t); };
const toNumber = (s) => {
  const t = String(s ?? '').replace(/[%\s]/g, '').replace(/,(?=\d{3}\b)/g, '');
  if (!t || /^(ex|excused|-|–|n\/a|na|null|missing)$/i.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

const ID_HEADERS = {
  email: /^(e-?mail|email address|sdsu email|student email)$/i,
  login: /^(sis login id|login id|login|username|user name|sdsuid|sdsu id|net ?id)$/i,
  redId: /^(sis user id|sis id|red ?id|student id|student number|id number)$/i,
  canvasId: /^id$/i,
  name: /^(student|name|student name|full name)$/i,
  first: /^(first name|first|given name)$/i,
  last: /^(last name|last|surname|family name)$/i,
  section: /^(section|sections)$/i,
};
// Canvas summary columns that are not single exams
const NOT_AN_EXAM = /^(current|final|unposted)\s+(score|grade|points)|^(assignments|quizzes|exams|labs|homework)\s+(current|final|unposted)/i;

// Look at the sheet: which columns identify students, which hold scores, and Canvas's "Points Possible" row
export function inspectScores(text) {
  const rows = parseTable(text);
  if (rows.length < 2) return { error: 'The file needs a heading row and at least one student.' };
  const headers = rows[0];
  const col = {};
  headers.forEach((h, i) => { for (const [k, re] of Object.entries(ID_HEADERS)) if (col[k] == null && re.test(h.trim())) col[k] = i; });
  let body = rows.slice(1);
  // Canvas: a "Points Possible" row, sometimes a "Manual Posting" row, and a "Student, Test" row
  const pointsRow = body.find((r) => /points possible/i.test(r[0] || '') || /points possible/i.test(r.join(' ')));
  body = body.filter((r) => !/points possible|manual posting|read only/i.test(r.slice(0, 2).join(' ')) && !/^test,?\s*student$|^student,?\s*test$/i.test((r[col.name ?? 0] || '').trim()));
  if (!body.length) return { error: 'No student rows were found under the headings.' };
  // a column with a value that looks like an email is an email column even if the heading is unusual
  if (col.email == null) {
    const i = headers.findIndex((_, j) => body.filter((r) => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(r[j] || '')).length >= body.length * 0.6);
    if (i >= 0) col.email = i;
  }
  const idCols = new Set(Object.values(col));
  const scoreCols = [];
  headers.forEach((h, i) => {
    if (idCols.has(i) || !h) return;
    const nums = body.map((r) => toNumber(r[i])).filter((n) => n != null);
    if (nums.length < Math.max(1, body.length * 0.5)) return;
    const possible = pointsRow ? toNumber(pointsRow[i]) : null;
    scoreCols.push({ index: i, header: h.replace(/\s*\(\d+\)\s*$/, ''), possible, filled: nums.length, max: Math.max(...nums), summary: NOT_AN_EXAM.test(h) });
  });
  if (!scoreCols.length) return { error: "Couldn't find a column of scores (numbers) in this file." };
  if (col.email == null && col.login == null && col.redId == null && col.name == null && col.first == null) {
    return { error: "Couldn't find a column that identifies students. Include an Email, SIS Login ID, SIS User ID (RedID) or Student name column." };
  }
  // best guess for the score column: a column named like an exam, otherwise the first one that isn't a course total
  const guess = scoreCols.find((c) => /midterm|exam|test|final/i.test(c.header) && !c.summary) || scoreCols.find((c) => !c.summary) || scoreCols[0];
  return { rows: body, headers, col, scoreCols, guess: guess.index, hasPointsRow: !!pointsRow };
}

// The "out of" for a column: Canvas's Points Possible, else 100 if every score fits, else the highest score.
// Several columns (an exam in parts, e.g. MC + FR) add up.
export function suggestMax(info, index) {
  if (Array.isArray(index)) return index.length === 1 ? suggestMax(info, index[0]) : index.reduce((s, i) => s + suggestMax(info, i), 0);
  const c = info.scoreCols.find((x) => x.index === index);
  if (!c) return 100;
  if (c.possible) return c.possible;
  return c.max <= 100 ? 100 : Math.ceil(c.max);
}

// "Midterm 1 MC" + "Midterm 1 FR" -> "Midterm 1" (the words the names start with)
export function commonName(names) {
  const words = names.map((n) => String(n || '').trim().split(/\s+/));
  if (!words.length) return '';
  const out = [];
  for (let i = 0; i < words[0].length; i++) { const w = words[0][i]; if (words.every((x) => (x[i] || '').toLowerCase() === w.toLowerCase())) out.push(w); else break; }
  return out.join(' ').replace(/[\s:\-–(]+$/, '').trim();
}

// Are these names parts of one exam? They must share the start ("Midterm 1") and differ only by a short
// part label ("MC", "FR", "Part A", "Written"), not by a number ("Quiz 1" / "Quiz 2" are different exams).
export function looksLikeParts(names) {
  if (names.length < 2) return false;
  const base = commonName(names);
  if (base.length < 3) return false;
  const rest = names.map((n) => String(n).trim().slice(base.length).replace(/^[\s:\-–(]+|[)\s]+$/g, ''));
  return rest.every((r) => r && r.split(/\s+/).length <= 3 && !/^\d/.test(r)) && new Set(rest.map((r) => r.toLowerCase())).size === rest.length;
}

// Match rows to the roster. roster: [{ email, name, redId }]; domain: e.g. "sdsu.edu"
// index: one score column, or several to add together (an exam in parts). With several, a student
// with only some parts is left out (listed in `partial`) unless missingAsZero.
export function matchScores(info, index, roster, domain = 'sdsu.edu', { missingAsZero = false } = {}) {
  const cols = Array.isArray(index) ? index : [index];
  const students = roster.filter((p) => !p.role || p.role === 'student');
  const byEmail = new Map(students.map((p) => [String(p.email).toLowerCase(), p]));
  const byRed = new Map(students.filter((p) => p.redId).map((p) => [String(p.redId).replace(/\D/g, ''), p]));
  const nameCount = new Map();
  students.forEach((p) => { const k = nameKey(p.name); nameCount.set(k, (nameCount.get(k) || 0) + 1); });
  const byName = new Map(students.filter((p) => nameCount.get(nameKey(p.name)) === 1).map((p) => [nameKey(p.name), p]));
  const { col } = info;
  const matched = new Map(), unmatched = [], blank = [], dupes = [], partial = [];
  info.rows.forEach((r, n) => {
    const who = col.name != null ? r[col.name] : [r[col.first], r[col.last]].filter(Boolean).join(' ');
    let p = null, how = '';
    const email = col.email != null ? String(r[col.email] || '').toLowerCase() : '';
    const login = col.login != null ? String(r[col.login] || '').toLowerCase() : '';
    const red = col.redId != null ? String(r[col.redId] || '').replace(/\D/g, '') : '';
    if (email && byEmail.has(email)) { p = byEmail.get(email); how = 'email'; }
    else if (login && byEmail.has(login.includes('@') ? login : `${login}@${domain}`)) { p = byEmail.get(login.includes('@') ? login : `${login}@${domain}`); how = 'login'; }
    else if (red && byRed.has(red)) { p = byRed.get(red); how = 'RedID'; }
    else if (who && byName.has(nameKey(who))) { p = byName.get(nameKey(who)); how = 'name'; }
    const parts = cols.map((i) => toNumber(r[i]));
    const have = parts.filter((x) => x != null);
    let score = have.length ? have.reduce((a, b) => a + b, 0) : null;
    if (!p) { unmatched.push({ line: n + 2, who: who || email || login || red || '(no name)', score }); return; }
    if (score == null) { blank.push({ email: p.email, name: p.name }); return; }
    if (have.length < parts.length) {
      partial.push({ email: p.email, name: p.name, parts });
      if (!missingAsZero) return;
    }
    if (matched.has(p.email)) dupes.push({ name: p.name, line: n + 2, kept: score, was: matched.get(p.email).score });
    matched.set(p.email, { email: p.email, name: p.name, section: p.section || '', score, how }); // a later duplicate row wins
  });
  const left = (p) => blank.some((b) => b.email === p.email) || (!missingAsZero && partial.some((b) => b.email === p.email));
  const missing = students.filter((p) => !matched.has(String(p.email).toLowerCase()) && !left(p));
  return { matched: [...matched.values()], unmatched, blank, missing, dupes, partial };
}

// Combine score sets that are parts of one exam (e.g. "Midterm 1 MC" and "Midterm 1 FR"):
// each student's points are added up, and so are the "out of" points.
export function combineSets(sets, { missingAsZero = false } = {}) {
  const byEmail = new Map();
  sets.forEach((g, k) => { for (const s of g.scores || []) { const e = String(s.email).toLowerCase(); if (!byEmail.has(e)) byEmail.set(e, Array(sets.length).fill(null)); byEmail.get(e)[k] = s.score; } });
  const scores = [], partial = [];
  for (const [email, parts] of byEmail) {
    const have = parts.filter((x) => x != null);
    if (have.length < parts.length) { partial.push({ email, parts }); if (!missingAsZero) continue; }
    scores.push({ email, score: Math.round(have.reduce((a, b) => a + b, 0) * 1000) / 1000 });
  }
  return { scores, partial, maxPoints: sets.reduce((s, g) => s + (Number(g.maxPoints) || 0), 0) };
}
