// "Format my code": re-indents Java with 4 spaces per level.
// Only whitespace changes (leading indentation, trailing spaces, runs of blank lines),
// so it can never change what the program does.

export function formatJava(src) {
  const lines = String(src).replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n');
  const out = [];
  const stack = [];          // open braces: 'switch' or 'block'
  let paren = 0;             // open ( and [ carried to the next line
  let inBlockComment = false;
  let inTextBlock = false;
  let pendingSwitch = false; // saw "switch (...)" and waiting for its "{"
  let blank = 0;
  let hanging = false;     // previous line was "if (...)" / "else" / loop header without a brace

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    const t = line.trim();

    if (inTextBlock) { out.push(line); scan(t); continue; }
    if (!t) { if (++blank <= 1 && out.length) out.push(''); continue; }
    blank = 0;

    let depth = stack.length;
    if (inBlockComment) {
      out.push(' '.repeat(depth * 4) + (t.startsWith('*') ? ' ' : '') + t);
      scan(t);
      continue;
    }
    // closing braces at the start of the line dedent this line
    let lead = 0;
    while (lead < t.length && (t[lead] === '}' || t[lead] === ')' || t[lead] === ']' || t[lead] === ' ')) { if (t[lead] === '}') depth--; lead++; }
    depth = Math.max(0, depth);
    // inside a switch: statements sit one level deeper than their case label
    const inner = stack[depth - 1];
    const isLabel = /^(case\b|default\b)/.test(t);
    let extra = 0;
    if (inner === 'switch' && !isLabel && !t.startsWith('}')) extra = 1;
    if (paren > 0 && !/^[)\]]/.test(t)) extra += 2; // continuation of a multi-line ( ... )
    else if (hanging && !t.startsWith('{')) extra += 1; // body of a brace-less if / else / loop
    out.push(' '.repeat((depth + extra) * 4) + t);
    const wasParen = paren > 0;
    scan(t);
    const code = t.replace(/\/\/.*$/, '').trim();
    hanging = !wasParen && paren === 0 && !inBlockComment
      && (/^(\}\s*)?(if|else\s+if|for|while)\b.*\)$/.test(code) || /^(\}\s*)?else$/.test(code));
  }
  while (out.length && out[out.length - 1] === '') out.pop();
  return out.join('\n') + '\n';

  // Walk one line of code, tracking braces, parentheses, strings and comments.
  function scan(t) {
    let i = 0;
    while (i < t.length) {
      const c = t[i], n = t[i + 1];
      if (inTextBlock) { if (t.startsWith('"""', i)) { inTextBlock = false; i += 3; } else i++; continue; }
      if (inBlockComment) { if (c === '*' && n === '/') { inBlockComment = false; i += 2; } else i++; continue; }
      if (c === '/' && n === '/') return;
      if (c === '/' && n === '*') { inBlockComment = true; i += 2; continue; }
      if (t.startsWith('"""', i)) { inTextBlock = true; i += 3; continue; }
      if (c === '"' || c === "'") { i++; while (i < t.length && t[i] !== c) { if (t[i] === '\\') i++; i++; } i++; continue; }
      if (/[A-Za-z_]/.test(c) && (i === 0 || !/[\w$]/.test(t[i - 1]))) {
        const m = /^[A-Za-z_]\w*/.exec(t.slice(i))[0];
        if (m === 'switch') pendingSwitch = true;
        i += m.length; continue;
      }
      if (c === '(' || c === '[') paren++;
      else if (c === ')' || c === ']') paren = Math.max(0, paren - 1);
      else if (c === '{') { stack.push(pendingSwitch ? 'switch' : 'block'); pendingSwitch = false; }
      else if (c === '}') stack.pop();
      else if (c === ';') pendingSwitch = false; // "switch" used as an expression without a block
      i++;
    }
  }
}
