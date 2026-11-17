// Loads programming assignments from <exam folder>/assignments/<name>/ and checks that every
// reference solution passes its own tests. The reading rules live in app/js/assignments-core.js,
// shared with the in-browser upload on the site.
import fs from 'node:fs';
import path from 'node:path';
import { runTests, formatErrors } from '../app/js/java/index.js';
import { readAssignments, solutionProblems } from '../app/js/assignments-core.js';

function walk(dir, base, files) {
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, d.name);
    const rel = base ? `${base}/${d.name}` : d.name;
    if (d.isDirectory()) walk(full, rel, files);
    else if (/\.(md|java|in|out|txt)$/i.test(d.name)) files.set(rel, fs.readFileSync(full, 'utf8'));
  }
  return files;
}

export function loadAssignments(examDir) {
  const dir = path.join(examDir, 'assignments');
  if (!fs.existsSync(dir)) return { assignments: [], errors: [], warnings: [] };
  const files = walk(dir, '', new Map());
  const label = (f) => path.relative(path.dirname(path.dirname(examDir)), path.join(dir, f));
  const out = readAssignments(files, { label });
  for (const a of out.assignments) {
    a.verified = false;
    if (a.solution == null) continue;
    const r = runTests(a.solution, { className: a.cls, tests: a.tests, checks: a.checks }, { timeLimitMs: 10000 });
    const problems = solutionProblems(a, r, formatErrors);
    problems.forEach((p) => out.errors.push(`${label(a.folder)}: ${p}`));
    a.verified = !problems.length;
  }
  return out;
}
