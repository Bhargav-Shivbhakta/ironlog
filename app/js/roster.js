// Reads a class roster exported or copied from Canvas.
// Works with:
//  - the People page table copied and pasted (Name, Login ID, SIS ID, Section, Role)
//  - a Gradebook CSV export (Student, ID, SIS User ID, SIS Login ID, Section)
//  - any CSV/TSV with a Name column and an Email or Login ID column
// Returns { people: [{ email, name, redId, section, role }], skipped: [{ line, text, reason }], columns }.

function splitRows(text) {
  const t = String(text || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const first = t.split('\n').find((l) => l.trim()) || '';
  const delim = first.includes('\t') ? '\t' : (first.split(';').length > first.split(',').length ? ';' : ',');
  const rows = [];
  let row = [], cell = '', quoted = false, line = 1, rowLine = 1;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (quoted) {
      if (ch === '"' && t[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else { if (ch === '\n') line++; cell += ch; }
    } else if (ch === '"' && cell.trim() === '') { quoted = true; cell = ''; }
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push({ cells: row, line: rowLine }); row = []; cell = ''; line++; rowLine = line; }
    else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push({ cells: row, line: rowLine }); }
  return rows.map((r) => ({ ...r, cells: r.cells.map((c) => c.replace(/\s+/g, ' ').trim()) })).filter((r) => r.cells.some(Boolean));
}

const COLS = {
  name: [/^name$/i, /^student$/i, /^student name$/i, /^full name$/i, /^sortable name$/i],
  email: [/e-?mail/i],
  login: [/^sis login id$/i, /^login id$/i, /^login$/i, /^sdsu ?id$/i, /^username$/i],
  redId: [/^sis id/i, /^sis user id$/i, /red ?id/i],
  section: [/^sections?$/i],
  role: [/^role$/i, /^roles$/i],
};

function findColumns(header) {
  const out = {};
  for (const [key, pats] of Object.entries(COLS)) {
    for (const p of pats) {
      const i = header.findIndex((h, idx) => p.test(h) && !Object.values(out).includes(idx));
      if (i >= 0) { out[key] = i; break; }
    }
  }
  return out;
}

export function parseRoster(text, domain = 'sdsu.edu') {
  const rows = splitRows(text);
  const hi = rows.findIndex((r) => { const c = findColumns(r.cells); return c.name != null && (c.email != null || c.login != null); });
  if (hi < 0) {
    return { people: [], skipped: [], columns: null, error: "Couldn't find the column headings. The first row should include Name and either Email or Login ID (as in Canvas)." };
  }
  const cols = findColumns(rows[hi].cells);
  const byEmail = new Map();
  const skipped = [];
  const dom = '@' + domain.toLowerCase();
  for (const r of rows.slice(hi + 1)) {
    const get = (k) => (cols[k] != null ? r.cells[cols[k]] || '' : '');
    const name = get('name');
    const raw = (get('email') || get('login')).toLowerCase().replace(/^mailto:/, '');
    const text = r.cells.filter(Boolean).join(' · ').slice(0, 90);
    if (/^points possible$/i.test(name) || /^test student$/i.test(name) || /^student, test$/i.test(name)) continue;
    const role = get('role');
    if (/observer|designer/i.test(role)) { skipped.push({ line: r.line, text, reason: `Role "${role}" doesn't get access` }); continue; }
    let email = '';
    if (/^[^\s@]+@[^\s@]+$/.test(raw)) email = raw;
    else if (/^[a-z0-9._-]+$/i.test(raw)) email = raw + dom;
    if (!email) { skipped.push({ line: r.line, text, reason: 'No email or Login ID' }); continue; }
    if (domain && !email.endsWith(dom)) { skipped.push({ line: r.line, text, reason: `Not an ${dom} email (${email})` }); continue; }
    const person = {
      email,
      name: /^[^,]+,\s*[^,]+$/.test(name) && /student|sortable/i.test(rows[hi].cells[cols.name]) ? name.split(',').reverse().map((x) => x.trim()).join(' ') : name, // "Doe, Jane" -> "Jane Doe"
      redId: get('redId').replace(/\D/g, '') || get('redId'),
      section: get('section'),
      role: /\bta\b|teaching assistant/i.test(role) ? 'ta' : /teacher|instructor/i.test(role) ? 'instructor' : 'student',
    };
    const prev = byEmail.get(email);
    if (prev) {
      // same person listed twice (e.g. two sections): keep one row, join sections, staff role wins
      if (person.section && !prev.section.split(', ').includes(person.section)) prev.section = [prev.section, person.section].filter(Boolean).join(', ');
      if (person.role !== 'student' && (prev.role === 'student' || person.role === 'instructor')) prev.role = person.role;
      continue;
    }
    byEmail.set(email, person);
  }
  return { people: [...byEmail.values()], skipped, columns: Object.fromEntries(Object.entries(cols).map(([k, i]) => [k, rows[hi].cells[i]])) };
}

export const classIdFrom = (name) => String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
