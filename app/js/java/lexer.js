// Java tokenizer for the browser Java runner.
// Produces tokens: { t: 'id'|'kw'|'int'|'long'|'double'|'float'|'char'|'string'|'op'|'eof', v, line, col, end }

export class CompileError extends Error {
  constructor(message, line, col) {
    super(message);
    this.line = line;
    this.col = col;
  }
}

const KEYWORDS = new Set([
  'abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char', 'class', 'const', 'continue',
  'default', 'do', 'double', 'else', 'enum', 'extends', 'final', 'finally', 'float', 'for', 'goto', 'if',
  'implements', 'import', 'instanceof', 'int', 'interface', 'long', 'native', 'new', 'package', 'private',
  'protected', 'public', 'return', 'short', 'static', 'strictfp', 'super', 'switch', 'synchronized', 'this',
  'throw', 'throws', 'transient', 'try', 'void', 'volatile', 'while', 'true', 'false', 'null', 'var',
]);

// longest first
const OPS = [
  '>>>=', '<<=', '>>=', '>>>', '...', '->', '::', '++', '--', '&&', '||', '==', '!=', '<=', '>=', '+=', '-=', '*=',
  '/=', '%=', '&=', '|=', '^=', '<<', '>>',
  '(', ')', '{', '}', '[', ']', ';', ',', '.', '@', '=', '>', '<', '!', '~', '?', ':', '+', '-', '*', '/', '&', '|',
  '^', '%',
];

export function tokenize(src) {
  const toks = [];
  let i = 0, line = 1, col = 1;
  const n = src.length;
  const adv = (k = 1) => {
    for (let j = 0; j < k; j++) {
      if (src[i] === '\n') { line++; col = 1; } else col++;
      i++;
    }
  };
  const err = (msg, l = line, c = col) => { throw new CompileError(msg, l, c); };

  const readEscape = () => {
    // at backslash
    const l = line, c = col;
    adv();
    const ch = src[i];
    const simple = { n: '\n', t: '\t', b: '\b', r: '\r', f: '\f', s: ' ', '"': '"', "'": "'", '\\': '\\' };
    if (ch in simple) { adv(); return simple[ch]; }
    if (ch === 'u') {
      while (src[i] === 'u') adv();
      const hex = src.slice(i, i + 4);
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) err('illegal unicode escape', l, c);
      adv(4);
      return String.fromCharCode(parseInt(hex, 16));
    }
    if (/[0-7]/.test(ch)) {
      let oct = '';
      while (oct.length < 3 && /[0-7]/.test(src[i]) && parseInt(oct + src[i], 8) <= 255) { oct += src[i]; adv(); }
      return String.fromCharCode(parseInt(oct, 8));
    }
    err('illegal escape character in string literal', l, c);
  };

  while (i < n) {
    const ch = src[i];
    // whitespace
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f') { adv(); continue; }
    // comments
    if (ch === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') adv(); continue; }
    if (ch === '/' && src[i + 1] === '*') {
      const l = line, c = col;
      adv(2);
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) adv();
      if (i >= n) err('unclosed comment', l, c);
      adv(2);
      continue;
    }
    const l = line, c = col, start = i;
    // identifiers / keywords
    if (/[A-Za-z_$]/.test(ch)) {
      while (i < n && /[A-Za-z0-9_$]/.test(src[i])) adv();
      const v = src.slice(start, i);
      toks.push({ t: KEYWORDS.has(v) && v !== 'var' ? 'kw' : 'id', v, line: l, col: c });
      continue;
    }
    // numbers
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(src[i + 1] || ''))) {
      let text = '';
      let isFloat = false;
      if (ch === '0' && /[xX]/.test(src[i + 1] || '')) {
        adv(2);
        while (i < n && /[0-9a-fA-F_]/.test(src[i])) adv();
        text = src.slice(start, i).replace(/_/g, '');
        let suffix = '';
        if (/[lL]/.test(src[i] || '')) { suffix = 'L'; adv(); }
        const val = parseInt(text.slice(2), 16);
        toks.push({ t: suffix ? 'long' : 'int', v: val, raw: src.slice(start, i), line: l, col: c, hex: true });
        continue;
      }
      if (ch === '0' && /[bB]/.test(src[i + 1] || '')) {
        adv(2);
        while (i < n && /[01_]/.test(src[i])) adv();
        text = src.slice(start + 2, i).replace(/_/g, '');
        let suffix = '';
        if (/[lL]/.test(src[i] || '')) { suffix = 'L'; adv(); }
        toks.push({ t: suffix ? 'long' : 'int', v: parseInt(text, 2), raw: src.slice(start, i), line: l, col: c, hex: true });
        continue;
      }
      while (i < n && /[0-9_]/.test(src[i])) adv();
      if (src[i] === '.' && /[0-9]/.test(src[i + 1] || '')) { isFloat = true; adv(); while (i < n && /[0-9_]/.test(src[i])) adv(); }
      else if (src[i] === '.' && !/[A-Za-z_]/.test(src[i + 1] || '')) { isFloat = true; adv(); }
      if (/[eE]/.test(src[i] || '') && /[0-9+-]/.test(src[i + 1] || '')) {
        isFloat = true; adv();
        if (src[i] === '+' || src[i] === '-') adv();
        if (!/[0-9]/.test(src[i] || '')) err('malformed floating-point literal', l, c);
        while (i < n && /[0-9_]/.test(src[i])) adv();
      }
      text = src.slice(start, i).replace(/_/g, '');
      let t = isFloat ? 'double' : 'int';
      if (/[lL]/.test(src[i] || '') && !isFloat) { t = 'long'; adv(); }
      else if (/[fF]/.test(src[i] || '')) { t = 'float'; adv(); }
      else if (/[dD]/.test(src[i] || '')) { t = 'double'; adv(); }
      const raw = src.slice(start, i);
      if (t === 'int') {
        if (text.length > 1 && text[0] === '0') {
          const val = parseInt(text, 8);
          toks.push({ t, v: val, raw, line: l, col: c, hex: true });
        } else {
          const val = Number(text);
          toks.push({ t, v: val, raw, line: l, col: c });
        }
      } else if (t === 'long') {
        toks.push({ t, v: Number(text), raw, line: l, col: c });
      } else {
        toks.push({ t, v: t === 'float' ? Math.fround(Number(text)) : Number(text), raw, line: l, col: c });
      }
      if (/[A-Za-z_]/.test(src[i] || '')) err(`';' expected`, line, col);
      continue;
    }
    // char literal
    if (ch === "'") {
      adv();
      let v;
      if (src[i] === '\\') v = readEscape();
      else if (src[i] === "'" ) err('empty character literal', l, c);
      else if (src[i] === '\n' || i >= n) err('unclosed character literal', l, c);
      else { v = src[i]; adv(); }
      if (src[i] !== "'") err('unclosed character literal', l, c);
      adv();
      toks.push({ t: 'char', v: v.charCodeAt(0), line: l, col: c });
      continue;
    }
    // string literal (text blocks not supported)
    if (ch === '"') {
      if (src.startsWith('"""', i)) err('text blocks are not supported in the browser runner', l, c);
      adv();
      let v = '';
      while (true) {
        if (i >= n || src[i] === '\n') err('unclosed string literal', l, c);
        if (src[i] === '"') { adv(); break; }
        if (src[i] === '\\') v += readEscape();
        else { v += src[i]; adv(); }
      }
      toks.push({ t: 'string', v, line: l, col: c });
      continue;
    }
    // operators
    let matched = null;
    for (const op of OPS) if (src.startsWith(op, i)) { matched = op; break; }
    if (matched) {
      adv(matched.length);
      toks.push({ t: 'op', v: matched, line: l, col: c });
      continue;
    }
    if (ch === '“' || ch === '”') err('illegal character: \'\\u' + ch.charCodeAt(0).toString(16) + '\' (a curly quote; use a straight " quote)', l, c);
    err(`illegal character: '${ch === '#' ? '#' : '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0')}'`, l, c);
  }
  toks.push({ t: 'eof', v: '<EOF>', line, col });
  return toks;
}
