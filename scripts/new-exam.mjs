#!/usr/bin/env node
// Creates a new exam folder from the template.
//   npm run new-exam                 -> asks you for the details
//   npm run new-exam -- "Final Exam" -> uses that title

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { slugify } from './build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXAMS = path.join(ROOT, 'exams');

// Point out any PDF/Word files that were dropped into exams/ and still need converting
const pending = [];
(function scan(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('_') || e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) scan(full);
    else if (/\.(pdf|docx?|xlsx?|pptx?)$/i.test(e.name)) pending.push(path.relative(ROOT, full));
  }
})(EXAMS);
if (pending.length) {
  console.log('\nThese files in exams/ still need converting into a questions.md:');
  pending.forEach((f) => console.log('  - ' + f));
  console.log('Give the file to Claude and ask for a questions.md for this site, or type the questions into the new exam below.\n');
}

const argTitle = process.argv.slice(2).join(' ').trim();
let title = argTitle, makeActive = false, minutes = '';

if (!title) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  title = (await rl.question('Exam name (e.g. Final Exam): ')).trim() || 'New Exam';
  minutes = (await rl.question('Time limit for the real exam, in minutes (blank for none): ')).trim();
  makeActive = /^y/i.test((await rl.question('Make this the exam students see first? (y/N): ')).trim());
  rl.close();
}

const id = slugify(title);
const dir = path.join(EXAMS, id);
if (fs.existsSync(dir)) {
  console.error(`exams/${id} already exists. Pick a different name or edit that folder.`);
  process.exit(1);
}

const template = fs.readFileSync(path.join(EXAMS, '_template', 'questions.md'), 'utf8')
  .replace(/^title:.*$/m, `title: ${title}`)
  .replace(/^active:.*$/m, `active: ${makeActive}`)
  .replace(/^time_limit:.*$/m, minutes && !isNaN(Number(minutes)) ? `time_limit: ${Number(minutes)}` : 'time_limit: 75');

fs.mkdirSync(path.join(dir, 'images'), { recursive: true });
fs.writeFileSync(path.join(dir, 'images', '.gitkeep'), '');
fs.writeFileSync(path.join(dir, 'questions.md'), template);

if (makeActive) {
  // only one exam should be "active"
  for (const other of fs.readdirSync(EXAMS)) {
    const f = path.join(EXAMS, other, 'questions.md');
    if (other === id || other.startsWith('_') || !fs.existsSync(f)) continue;
    const t = fs.readFileSync(f, 'utf8');
    if (/^active:\s*true/m.test(t)) {
      fs.writeFileSync(f, t.replace(/^active:\s*true/m, 'active: false'));
      console.log(`Set exams/${other} to active: false`);
    }
  }
}

console.log(`\nCreated exams/${id}/questions.md`);
console.log('Next: replace the example questions with yours, then run  npm run dev  to preview.');
