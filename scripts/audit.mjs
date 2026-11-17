// npm run audit: lists exported names that no other file in the project uses.
// Each one is dead code to delete, or a feature to wire up. Exits with an error when the list isn't empty.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const skip = /node_modules|vendor|dist|\.min\./;
const files = [];
const walk = (dir) => {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (skip.test(p)) continue;
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (/\.(m?js|html)$/.test(name)) files.push(p);
  }
};
['app', 'connector', 'scripts'].forEach((d) => walk(path.join(root, d)));

const text = Object.fromEntries(files.map((f) => [f, fs.readFileSync(f, 'utf8')]));
const escape = (s) => s.replace(/[$]/g, '\\$');
const unused = [];
for (const [file, src] of Object.entries(text)) {
  if (!/\.m?js$/.test(file)) continue;
  for (const [, name] of src.matchAll(/export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/g)) {
    const word = new RegExp(`(^|[^\\w$])${escape(name)}($|[^\\w$])`);
    if (!Object.entries(text).some(([other, s]) => other !== file && word.test(s))) unused.push(`${path.relative(root, file)}: ${name}`);
  }
}

// An export used only inside its own file just needs its "export" removed; one used nowhere is dead.
const result = unused.map((line) => {
  const [file, name] = line.split(': ');
  const count = (text[path.join(root, file)].match(new RegExp(`(^|[^\\w$])${escape(name)}($|[^\\w$])`, 'g')) || []).length;
  return `${line}  (${count > 1 ? 'only used in its own file: drop the export' : 'used nowhere: delete it'})`;
});
if (result.length) { console.log(result.join('\n')); console.log(`\n${result.length} to fix.`); process.exit(1); }
console.log('Nothing unused.');
