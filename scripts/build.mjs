#!/usr/bin/env node
// Builds the site into dist/.
//   npm run build   -> check every exam file and build dist/
//   npm run check   -> only check the exam files (nothing is written)
//
// Every folder in exams/ that has a questions.md becomes an exam (folders starting
// with "_" are ignored). A loose exams/<name>.md file works too.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseExam, findImages, isRelativeUrl, rewriteImages } from '../app/js/parser.js';
import { loadAssignments } from './assignments.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXAMS = path.join(ROOT, 'exams');
const APP = path.join(ROOT, 'app');
const DIST = path.join(ROOT, 'dist');
const NM = path.join(ROOT, 'node_modules');

const CI = !!process.env.GITHUB_ACTIONS;
const color = (c, s) => (process.stdout.isTTY ? `\x1b[${c}m${s}\x1b[0m` : s);
const red = (s) => color('31', s), yellow = (s) => color('33', s), green = (s) => color('32', s), dim = (s) => color('2', s), bold = (s) => color('1', s);

export function slugify(s) {
  return String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'exam';
}

// Exams inside a subject folder, e.g. exams/CS150/Midterm 2/questions.md
function subjectExams(dir) {
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_') && !d.name.startsWith('.'))
    .map((d) => ({ name: d.name, dir: path.join(dir, d.name), file: path.join(dir, d.name, 'questions.md') }))
    .filter((x) => fs.existsSync(x.file));
}

function findExamSources() {
  if (!fs.existsSync(EXAMS)) return [];
  const out = [];
  for (const entry of fs.readdirSync(EXAMS, { withFileTypes: true })) {
    if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
    const full = path.join(EXAMS, entry.name);
    if (entry.isDirectory()) {
      const md = path.join(full, 'questions.md');
      if (fs.existsSync(md)) out.push({ id: slugify(entry.name), file: md, dir: full });
      else {
        const others = fs.readdirSync(full).filter((f) => /\.(md|markdown)$/i.test(f));
        if (others.length === 1) out.push({ id: slugify(entry.name), file: path.join(full, others[0]), dir: full });
        else if (others.length > 1) out.push({ id: slugify(entry.name), problem: `Folder exams/${entry.name} has several .md files. Name the question file questions.md.` });
        else if (subjectExams(full).length) {
          // A subject folder: exams/CS150/Midterm 2/questions.md
          for (const sub of subjectExams(full)) {
            out.push({ id: slugify(entry.name + '-' + sub.name), file: sub.file, dir: sub.dir, course: entry.name });
          }
        }
        else {
          const loose = fs.readdirSync(full).filter((f) => !f.startsWith('.') && f !== 'images');
          const hint = loose.some((f) => /\.(pdf|docx?)$/i.test(f))
            ? ' PDFs and Word files need converting to questions.md first (see README, "Adding a new exam").'
            : '';
          out.push({ id: slugify(entry.name), problem: `Folder exams/${entry.name} has no questions.md, so it was skipped.${hint}`, soft: true });
        }
      }
    } else if (/\.(md|markdown)$/i.test(entry.name) && !/^readme/i.test(entry.name)) {
      out.push({ id: slugify(entry.name.replace(/\.(md|markdown)$/i, '')), file: full, dir: EXAMS });
    } else if (/\.(pdf|docx?|xlsx?|pptx?|csv)$/i.test(entry.name)) {
      out.push({ id: `file:${entry.name}`, problem: `Found exams/${entry.name}. ${entry.name.split('.').pop().toUpperCase()} files can't become a quiz automatically. Convert it into exams/<exam-name>/questions.md first (see README, "Adding a new exam"), then remove this file.`, soft: true });
    }
  }
  return out;
}

function annotate(kind, file, line, msg) {
  if (CI) console.log(`::${kind} file=${path.relative(ROOT, file)},line=${line}::${msg.replace(/\n/g, ' ')}`);
}

export function buildAll({ write = true, quiet = false } = {}) {
  const log = quiet ? () => {} : console.log;
  const sources = findExamSources();
  let errorCount = 0, warnCount = 0;
  const built = [];
  const ids = new Set();

  log(bold('\nChecking exam files'));
  if (!sources.length) {
    // Fine when exams are uploaded on the site (sign-in mode); the site is still built.
    log(yellow('  No exam folders in exams/. Exams uploaded on the site (Class content page) still work.'));
  }

  for (const src of sources) {
    if (src.problem) {
      log((src.soft ? yellow('  ! ') : red('  ✗ ')) + src.problem);
      if (src.soft) warnCount++; else errorCount++;
      continue;
    }
    if (ids.has(src.id)) {
      log(red(`  ✗ Two exams would both be called "${src.id}". Rename one of the folders.`));
      errorCount++;
      continue;
    }
    ids.add(src.id);
    const rel = path.relative(ROOT, src.file);
    const text = fs.readFileSync(src.file, 'utf8');
    const fallbackTitle = (src.course ? path.basename(src.dir) : src.id.replace(/-/g, ' ')).replace(/\b\w/g, (c) => c.toUpperCase());
    const res = parseExam(text, { fallbackTitle });
    if (src.course && !res.meta.course) res.meta.course = src.course;

    // images must exist
    const assetDir = path.relative(EXAMS, src.dir);
    const images = new Map();
    for (const q of res.questions) {
      const fields = [q.text, q.explanation, q.hint, ...(q.options || []).map((o) => o.text)];
      for (const f of fields) for (const img of findImages(f)) {
        if (!isRelativeUrl(img)) continue;
        const abs = path.resolve(src.dir, img);
        if (!fs.existsSync(abs)) res.errors.push({ line: q.line, id: q.id, message: `${q.id} uses image "${img}", but that file isn't in ${path.relative(ROOT, src.dir)}/.` });
        else images.set(img, abs);
      }
    }

    const nQ = res.questions.length;
    const status = res.errors.length ? red('✗') : green('✓');
    log(`  ${status} ${bold(res.meta.title)} ${dim(`(${rel})`)}  ${nQ} questions · ${res.topics.length} topics · ${res.questions.filter((q) => q.onExam).length} on the exam`);
    for (const e of res.errors) { log(red(`      line ${e.line}: ${e.message}`)); annotate('error', src.file, e.line, e.message); }
    for (const w of res.warnings) { log(yellow(`      line ${w.line}: ${w.message}`)); annotate('warning', src.file, w.line, w.message); }
    errorCount += res.errors.length;
    warnCount += res.warnings.length;

    // programming assignments in <exam>/assignments/
    const asg = loadAssignments(src.dir);
    if (asg.assignments.length || asg.errors.length) {
      const ok = asg.errors.length === 0;
      log(`      ${ok ? green('✓') : red('✗')} ${asg.assignments.length} programming assignment${asg.assignments.length === 1 ? '' : 's'}${ok ? dim(` (reference solutions pass all ${asg.assignments.reduce((n, a) => n + a.tests.length, 0)} tests)`) : ''}`);
    }
    for (const e of asg.errors) { log(red(`      ${e}`)); annotate('error', src.file, 1, e); }
    for (const w of asg.warnings) { log(yellow(`      ${w}`)); annotate('warning', src.file, 1, w); }
    errorCount += asg.errors.length;
    warnCount += asg.warnings.length;

    if (!res.errors.length) {
      const base = `data/${src.id}/`;
      for (const q of res.questions) {
        q.text = rewriteImages(q.text, base);
        q.explanation = rewriteImages(q.explanation, base);
        q.hint = rewriteImages(q.hint, base);
        if (q.options) q.options.forEach((o) => (o.text = rewriteImages(o.text, base)));
      }
      built.push({ id: src.id, res, images, assetDir, assignments: asg.assignments });
    }
  }

  if (errorCount) {
    log(red(bold(`\n${errorCount} problem${errorCount > 1 ? 's' : ''} to fix before the site can be published.`)) + (warnCount ? yellow(` (${warnCount} warning${warnCount > 1 ? 's' : ''})`) : ''));
    return { ok: false, errorCount, warnCount };
  }

  // exactly one "current" exam
  const visible = built.filter((b) => !b.res.meta.hidden);
  const actives = visible.filter((b) => b.res.meta.active);
  const byCourse = new Map();
  actives.forEach((b) => { const c = b.res.meta.course || ''; byCourse.set(c, [...(byCourse.get(c) || []), b]); });
  for (const [c, list] of byCourse) if (list.length > 1) log(yellow(`  ! ${list.length} exams${c ? ` in ${c}` : ''} say "active: true". "${list[0].res.meta.title}" is shown first.`));
  if (!actives.length && visible.length) log(dim(`  No exam has "active: true", so "${visible.slice().sort((a, b) => a.res.meta.order - b.res.meta.order)[0].res.meta.title}" is shown first.`));

  if (!write) {
    log(green(bold('\nAll exam files look good.')) + (warnCount ? yellow(` (${warnCount} warning${warnCount > 1 ? 's' : ''})`) : ''));
    return { ok: true, errorCount, warnCount };
  }

  // ---- write dist/
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });
  fs.cpSync(APP, DIST, { recursive: true });

  const vendor = path.join(DIST, 'vendor');
  fs.mkdirSync(vendor, { recursive: true });
  const copy = (from, to) => {
    const f = path.join(NM, from);
    if (!fs.existsSync(f)) throw new Error(`Missing ${from}. Run "npm install" first.`);
    fs.cpSync(f, path.join(vendor, to), { recursive: true });
  };
  copy('marked/lib/marked.esm.js', 'marked.esm.js');
  copy('katex/dist/katex.min.js', 'katex/katex.min.js');
  copy('katex/dist/katex.min.css', 'katex/katex.min.css');
  copy('katex/dist/fonts', 'katex/fonts');
  copy('@highlightjs/cdn-assets/highlight.min.js', 'hljs/highlight.min.js');
  copy('@highlightjs/cdn-assets/styles/github.min.css', 'hljs/light.css');
  copy('@highlightjs/cdn-assets/styles/github-dark.min.css', 'hljs/dark.css');
  copy('codejar/dist/codejar.js', 'codejar.js');
  copy('jszip/dist/jszip.min.js', 'jszip.min.js'); // reading and making .zip files for assignment uploads
  // Firebase (sign-in and saving progress to student accounts). The browser builds import each
  // other from Google's CDN; point them at our own copies so the site loads nothing from outside.
  fs.mkdirSync(path.join(vendor, 'firebase'), { recursive: true });
  for (const f of ['firebase-app.js', 'firebase-auth.js', 'firebase-firestore-lite.js']) {
    const src = path.join(NM, 'firebase', f);
    if (!fs.existsSync(src)) throw new Error(`Missing firebase/${f}. Run "npm install" first.`);
    const code = fs.readFileSync(src, 'utf8').replace(/https:\/\/www\.gstatic\.com\/firebasejs\/[\d.]+\/(firebase-[a-z-]+\.js)/g, './$1');
    fs.writeFileSync(path.join(vendor, 'firebase', f), code);
  }

  const dataDir = path.join(DIST, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const manifest = { builtAt: new Date().toISOString(), exams: [] };
  for (const b of built) {
    const { meta, topics, questions } = b.res;
    const asgList = b.assignments || [];
    const payload = { id: b.id, ...meta, topics, questions, assignmentCount: asgList.length };
    let asgHash = null;
    if (asgList.length) {
      // solutions are never published: only instructions, starter code, tests and checks
      const pub = { examId: b.id, assignments: asgList.map(({ folder, verified, solution, ...a }) => a) };
      const aj = JSON.stringify(pub);
      asgHash = crypto.createHash('sha1').update(aj).digest('hex').slice(0, 10);
      fs.writeFileSync(path.join(dataDir, `${b.id}.assignments.json`), aj);
    }
    const json = JSON.stringify(payload);
    const hash = crypto.createHash('sha1').update(json).digest('hex').slice(0, 10);
    fs.writeFileSync(path.join(dataDir, `${b.id}.json`), json);
    for (const [rel, abs] of b.images) {
      const dest = path.join(dataDir, b.id, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(abs, dest);
    }
    if (meta.hidden) continue;
    manifest.exams.push({
      id: b.id, title: meta.title, course: meta.course, description: meta.description,
      active: meta.active, archived: meta.archived, order: meta.order, timeLimit: meta.timeLimit,
      passMark: meta.passMark, examDate: meta.examDate,
      questionCount: questions.length, onExamCount: questions.filter((q) => q.onExam).length,
      topics, hash, assignmentCount: asgList.length, assignmentsHash: asgHash,
    });
  }
  manifest.exams.sort((a, b) => (a.course || '').localeCompare(b.course || '', undefined, { numeric: true }) || (b.active - a.active) || (a.archived - b.archived) || (a.order - b.order) || a.title.localeCompare(b.title));
  fs.writeFileSync(path.join(dataDir, 'exams.json'), JSON.stringify(manifest, null, 1));
  fs.writeFileSync(path.join(DIST, '.nojekyll'), '');

  log(green(bold(`\nBuilt ${manifest.exams.length} exam${manifest.exams.length === 1 ? '' : 's'} into dist/`)) + (warnCount ? yellow(` (${warnCount} warning${warnCount > 1 ? 's' : ''})`) : ''));
  return { ok: true, errorCount, warnCount };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const checkOnly = process.argv.includes('--check');
  try {
    const r = buildAll({ write: !checkOnly });
    process.exit(r.ok ? 0 : 1);
  } catch (e) {
    console.error(red(e.message));
    process.exit(1);
  }
}
