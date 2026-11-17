// Getting scores into Canvas: read a Canvas gradebook export, match its students to the class
// roster, and write a small CSV that Canvas's Grades → Import accepts. Pure functions (tested in Node).
// Everything runs in the browser; the export never leaves the professor's computer.
import { parseTable } from './grades.js';

const IDENT = ['Student', 'ID', 'SIS User ID', 'SIS Login ID', 'Section'];
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
// "Lopez, Maria" -> "maria lopez"
const nameKey = (s) => { const t = String(s || '').trim(); const m = t.match(/^([^,]+),\s*(.+)$/); return norm(m ? `${m[2]} ${m[1]}` : t); };
const digits = (s) => String(s || '').replace(/\D+/g, '');
const local = (s) => String(s || '').toLowerCase().trim().split('@')[0];

// -> { students: [{ name, id, sis, login, section, testStudent }], assignments: [{ name, base, points, index }] }
export function readCanvasExport(text) {
  const rows = parseTable(text);
  const h = rows[0] || [];
  const at = (re) => h.findIndex((x) => re.test(x));
  const c = { name: at(/^student$/i), id: at(/^id$/i), sis: at(/^sis user id$/i), login: at(/^sis login id$/i), section: at(/^section$/i) };
  if (c.name < 0 || (c.id < 0 && c.sis < 0 && c.login < 0)) {
    throw new Error("This doesn't look like a Canvas gradebook export. In Canvas open Grades, then Export → Export Entire Gradebook, and use that file.");
  }
  const pts = rows.find((r, i) => i > 0 && /^points possible$/i.test(r[c.name] || ''));
  const assignments = h.map((name, index) => ({ name, index, base: name.replace(/\s*\(\d+\)\s*$/, ''), points: pts ? Number(pts[index]) : null }))
    .filter((a) => /\(\d+\)\s*$/.test(a.name) && !(pts && /read only/i.test(pts[a.index] || '')));
  const students = rows.slice(1)
    .filter((r) => r[c.name] && !/^points possible$/i.test(r[c.name]) && (r[c.id] || r[c.sis] || r[c.login]))
    .map((r) => ({
      name: r[c.name], id: c.id >= 0 ? r[c.id] || '' : '', sis: c.sis >= 0 ? r[c.sis] || '' : '', login: c.login >= 0 ? r[c.login] || '' : '', section: c.section >= 0 ? r[c.section] || '' : '',
      testStudent: /^student,\s*test$/i.test(r[c.name]) || /^test student$/i.test(r[c.name]),
    }));
  return { students, assignments };
}

// Match Canvas students to people on the site. people: [{ email, redId, name, ... }]
// RedID (= Canvas "SIS User ID" at SDSU) first, then email (SIS Login ID), then a name that's unique on both sides.
// -> { pairs: [{ c, p, how }], notInCanvas: [p], noMatch: [c] }
export function matchCanvas(canvasStudents, people) {
  const byRed = new Map(), byEmail = new Map(), byName = new Map();
  for (const p of people) {
    if (digits(p.redId)) byRed.set(digits(p.redId), p);
    if (p.email) byEmail.set(local(p.email), p);
    const k = nameKey(p.name);
    if (k) byName.set(k, byName.has(k) ? null : p); // null = two people with this name: don't guess
  }
  const canvasNames = new Map();
  for (const c of canvasStudents) { const k = nameKey(c.name); canvasNames.set(k, (canvasNames.get(k) || 0) + 1); }
  const used = new Set(), pairs = [], noMatch = [];
  for (const c of canvasStudents) {
    if (c.testStudent) continue;
    let p = null, how = '';
    if (digits(c.sis) && byRed.get(digits(c.sis))) { p = byRed.get(digits(c.sis)); how = 'RedID'; }
    else if (c.login && byEmail.get(local(c.login))) { p = byEmail.get(local(c.login)); how = 'email'; }
    else { const k = nameKey(c.name); if (byName.get(k) && canvasNames.get(k) === 1) { p = byName.get(k); how = 'name'; } }
    if (p && used.has(p)) p = null; // never give one person's score to two Canvas rows
    if (p) { used.add(p); pairs.push({ c, p, how }); } else noMatch.push(c);
  }
  return { pairs, notInCanvas: people.filter((p) => !used.has(p)), noMatch };
}

const cell = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const num = (x) => (x == null || x === '' ? '' : String(Math.round(Number(x) * 100) / 100));

// The file for Canvas → Grades → Import: the five columns Canvas uses to find students, the
// "Points Possible" row, and one score column. column: an existing Canvas header ("Quiz 4 (2010509)")
// to update that assignment, or a new name to create one. rows: [{ c: canvasStudent, score }]
export function canvasCsv({ column, points, rows }) {
  const lines = [[...IDENT, column].map(cell).join(',')];
  lines.push(['Points Possible', '', '', '', '', num(points)].map(cell).join(','));
  for (const { c, score } of rows) lines.push([c.name, c.id, c.sis, c.login, c.section, num(score)].map(cell).join(','));
  return lines.join('\r\n') + '\r\n';
}

// Without an export: Canvas students made from the roster (Canvas matches them by SIS User ID = RedID)
export function rosterAsCanvas(people) {
  return people.map((p) => ({ name: p.name || p.email, id: '', sis: digits(p.redId), login: p.email || '', section: '', testStudent: false }));
}
