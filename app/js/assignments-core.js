// Reads programming assignments from a set of files (shared by the site build and the
// in-browser upload, so both check assignments exactly the same way).
//
//   <folder>/assignment.md          instructions (front matter + Markdown; a "## Hints" section becomes hints)
//   <folder>/<Class>.java           starter code students begin with
//   <folder>/tests/<name>.in/.out   input and exact expected output for each test
//   <folder>/checks.txt             optional:  require:<regex>  # label   /   forbid:<regex>  # label
//   <folder>/solution/<Class>.java  the reference solution: used to verify the tests, never shown to students
//
// files: Map of "folder/relative/path" -> text

export function frontMatter(text) {
  const m = String(text).replace(/\r\n?/g, '\n').match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: text };
  const meta = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^\s*([A-Za-z_][\w-]*)\s*:\s*(.*?)\s*$/);
    if (kv) meta[kv[1].toLowerCase()] = kv[2].replace(/\s+#.*$/, '').replace(/^["']|["']$/g, '');
  }
  return { meta, body: m[2] };
}

// The assignment folders in a file set: any folder that directly contains assignment.md
export function assignmentFolders(files) {
  const out = [];
  for (const p of files.keys()) {
    const m = p.match(/^(.*?)([^/]+)\/assignment\.md$/i);
    if (m && !m[2].startsWith('_') && !m[2].startsWith('.')) out.push(m[1] + m[2]);
  }
  return out.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export function readAssignments(files, { label = (f) => f } = {}) {
  const out = { assignments: [], errors: [], warnings: [] };
  const slugs = new Set();
  const get = (p) => files.get(p);
  for (const dir of assignmentFolders(files)) {
    const name = dir.split('/').pop();
    const rel = label(dir);
    const problem = (msg) => out.errors.push(`${rel}: ${msg}`);
    const { meta, body } = frontMatter(get(`${dir}/assignment.md`));
    const javaFiles = [...files.keys()].filter((p) => p.startsWith(dir + '/') && !p.slice(dir.length + 1).includes('/') && p.endsWith('.java'));
    const cls = meta.class || (javaFiles.length === 1 ? javaFiles[0].split('/').pop().slice(0, -5) : null);
    if (!cls) { problem('add "class: ClassName" to assignment.md (or keep exactly one starter .java file)'); continue; }
    const starter = get(`${dir}/${cls}.java`);
    if (starter == null) { problem(`starter file ${cls}.java not found`); continue; }

    // tests
    const tests = [];
    const ins = [...files.keys()].filter((p) => p.startsWith(`${dir}/tests/`) && p.endsWith('.in')).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    for (const p of ins) {
      const tname = p.split('/').pop().slice(0, -3);
      const outText = get(`${dir}/tests/${tname}.out`);
      if (outText == null) { problem(`tests/${tname}.in has no matching tests/${tname}.out`); continue; }
      tests.push({ name: tname, input: get(p), output: outText });
    }
    if (!tests.length) out.warnings.push(`${rel}: no tests (students can still run their code)`);
    const samples = (meta.sample_tests || '').split(',').map((s) => s.trim()).filter(Boolean);
    for (const s of samples) if (!tests.some((t) => t.name === s)) problem(`sample_tests lists "${s}", but tests/${s}.in doesn't exist`);
    const sampleSet = new Set(samples.length ? samples : tests.slice(0, 2).map((t) => t.name));
    tests.forEach((t) => { t.sample = sampleSet.has(t.name); });

    // structure checks
    const checks = [];
    const ctext = get(`${dir}/checks.txt`);
    if (ctext != null) {
      ctext.split('\n').forEach((line, i) => {
        const l = line.trim();
        if (!l || l.startsWith('#')) return;
        const m = l.match(/^(require|forbid)\s*:\s*(.+?)(?:\s+#\s+(.+))?$/);
        if (!m) { problem(`checks.txt line ${i + 1}: expected  require:<regex>  or  forbid:<regex>`); return; }
        try { new RegExp(m[2]); } catch { problem(`checks.txt line ${i + 1}: invalid regular expression ${m[2]}`); return; }
        checks.push({ kind: m[1], pattern: m[2], label: m[3] || `${m[1] === 'require' ? 'Uses' : 'Does not use'} ${m[2]}` });
      });
    }

    // hints: bullets under "## Hints"
    let instructions = String(body).trim();
    let hints = [];
    const hm = instructions.match(/\n##\s+Hints\s*\n([\s\S]*?)(?=\n##\s|$)/i);
    if (hm) {
      hints = hm[1].split(/\n(?=- )/).map((h) => h.replace(/^- /, '').trim()).filter(Boolean);
      instructions = (instructions.slice(0, hm.index) + instructions.slice(hm.index + hm[0].length)).trim();
    }

    const solution = get(`${dir}/solution/${cls}.java`);
    if (solution == null) out.warnings.push(`${rel}: no solution/${cls}.java, so the tests can't be verified automatically`);

    const slug = name.replace(/^\d+[-_ ]*/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || name;
    if (slugs.has(slug)) problem(`two assignments would both be called "${slug}"`);
    slugs.add(slug);
    out.assignments.push({
      slug, folder: name, title: meta.title || cls, cls,
      order: Number(meta.order) || out.assignments.length + 1,
      difficulty: ['easy', 'medium', 'hard'].includes(meta.difficulty) ? meta.difficulty : 'medium',
      estimate: meta.estimate || '',
      topics: (meta.topics || '').split(',').map((s) => s.trim()).filter(Boolean),
      instructions, hints, starter, tests, checks,
      solution, // removed before publishing to students
    });
  }
  out.assignments.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
  return out;
}

// Turn a solution's test run into problems to fix (same wording for the build and the upload page)
export function solutionProblems(a, r, formatErrors) {
  const p = [];
  if (r.compileErrors) p.push(`the reference solution doesn't compile in the browser runner:\n${formatErrors ? formatErrors(r.compileErrors, a.solution, a.cls + '.java') : r.compileErrors.map((e) => `line ${e.line}: ${e.message}`).join('\n')}`);
  else {
    for (const t of r.results.filter((x) => !x.passed)) p.push(`the reference solution fails test "${t.name}"${t.timedOut ? ' (time limit)' : ''}. Check tests/${t.name}.out.\n      expected: ${JSON.stringify(String(t.expected).slice(0, 200))}\n      got:      ${JSON.stringify(String(t.actual).slice(0, 200))}${t.stderr ? '\n      error:    ' + t.stderr.split('\n')[0] : ''}`);
    for (const c of r.structure.filter((x) => !x.passed)) p.push(`the reference solution fails the requirement "${c.label}" (${c.kind}:${c.pattern})`);
  }
  return p;
}

// What students get: no solutions, no folder names
export const publicAssignments = (list) => list.map(({ solution, folder, verified, ...a }) => a);
