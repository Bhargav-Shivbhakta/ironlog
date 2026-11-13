// Runtime values and library for the browser Java runner.
import { doubleToString, floatToString } from './format.js';

// A Java exception thrown while the program runs.
export class JavaThrow extends Error {
  constructor(cls, msg = null) {
    super(msg == null ? cls : `${cls}: ${msg}`);
    this.cls = cls;
    this.msg = msg;
    this.javaStack = null;
  }
}
// The program called System.exit
export class ExitSignal extends Error { constructor(code) { super('exit'); this.code = code; } }
// Ran too long
export class TimeLimit extends Error { constructor() { super('time limit'); } }

let hashSeed = 0x1b6d3586;
export class JArray {
  constructor(elem, data) { this.elem = elem; this.a = data; this.hash = (hashSeed = (hashSeed * 1103515245 + 12345) >>> 0); }
}

export const NUMERIC = new Set(['byte', 'short', 'char', 'int', 'long', 'float', 'double']);
export const INTEGRAL = new Set(['byte', 'short', 'char', 'int', 'long']);
export const isArray = (t) => t.endsWith('[]');
export const elemOf = (t) => t.slice(0, -2);
export const isRef = (t) => t === 'String' || t === 'null' || isArray(t) || t === 'Scanner' || t === 'Random' || t === 'Object';

export function defaultValue(t) {
  if (t === 'boolean') return false;
  if (NUMERIC.has(t)) return 0;
  return null;
}

const ARRAY_CODE = { int: 'I', double: 'D', char: 'C', boolean: 'Z', long: 'J', float: 'F', byte: 'B', short: 'S' };
export function arrayTypeCode(t) {
  // t like 'int[]' or 'String[][]'
  let dims = 0; let base = t;
  while (base.endsWith('[]')) { base = base.slice(0, -2); dims++; }
  return '['.repeat(dims) + (ARRAY_CODE[base] || 'Ljava.lang.' + base + ';');
}

// Java's String.valueOf for a value of static type t
export function jstr(t, v) {
  if (v === null || v === undefined) return 'null';
  switch (t) {
    case 'double': return doubleToString(v);
    case 'float': return floatToString(v);
    case 'char': return String.fromCharCode(v);
    case 'boolean': return v ? 'true' : 'false';
    case 'int': case 'long': case 'short': case 'byte': return String(v);
    default:
      if (v instanceof JArray) return arrayTypeCode(v.elem + '[]') + '@' + v.hash.toString(16);
      if (v instanceof Scanner) return 'java.util.Scanner[delimiters=\\p{javaWhitespace}+]';
      return String(v);
  }
}

// Runtime-created strings are String objects so == compares identity like Java.
export const newStr = (s) => new String(s); // eslint-disable-line no-new-wrappers
export const S = (v) => (v === null ? null : String(v));

export function aioobe(i, len) { return new JavaThrow('java.lang.ArrayIndexOutOfBoundsException', `Index ${i} out of bounds for length ${len}`); }
export function sioobe(i, len) { return new JavaThrow('java.lang.StringIndexOutOfBoundsException', `Index ${i} out of bounds for length ${len}`); }
export function npe(what) { return new JavaThrow('java.lang.NullPointerException', what); }

// ---------- Scanner over a fixed input string (like piping a file into System.in) ----------
const WS = /\s/;
export class Scanner {
  constructor(input) { this.s = input || ''; this.pos = 0; this.closed = false; }
  _skipWs() { while (this.pos < this.s.length && WS.test(this.s[this.pos])) this.pos++; }
  _peekToken() {
    let p = this.pos;
    while (p < this.s.length && WS.test(this.s[p])) p++;
    if (p >= this.s.length) return null;
    let e = p;
    while (e < this.s.length && !WS.test(this.s[e])) e++;
    return { tok: this.s.slice(p, e), end: e };
  }
  _check() { if (this.closed) throw new JavaThrow('java.lang.IllegalStateException', 'Scanner closed'); }
  next() {
    this._check();
    const t = this._peekToken();
    if (!t) throw new JavaThrow('java.util.NoSuchElementException');
    this.pos = t.end;
    return newStr(t.tok);
  }
  _nextNum(test, conv, name) {
    this._check();
    const t = this._peekToken();
    if (!t) throw new JavaThrow('java.util.NoSuchElementException');
    if (!test(t.tok)) throw new JavaThrow('java.util.InputMismatchException');
    this.pos = t.end;
    return conv(t.tok);
  }
  nextInt() { return this._nextNum(isIntStr, (x) => Number(x.replace(/,/g, '')), 'int'); }
  nextLong() { return this._nextNum(isLongStr, (x) => Number(x), 'long'); }
  nextDouble() { return this._nextNum(isDoubleStr, (x) => Number(x.replace(/,/g, '')), 'double'); }
  nextFloat() { return Math.fround(this.nextDouble()); }
  nextBoolean() { return this._nextNum((x) => /^(true|false)$/i.test(x), (x) => x.toLowerCase() === 'true', 'boolean'); }
  nextLine() {
    this._check();
    if (this.pos >= this.s.length) throw new JavaThrow('java.util.NoSuchElementException', 'No line found');
    let e = this.s.indexOf('\n', this.pos);
    let line;
    if (e === -1) { line = this.s.slice(this.pos); this.pos = this.s.length; }
    else { line = this.s.slice(this.pos, e); this.pos = e + 1; }
    return newStr(line.replace(/\r$/, ''));
  }
  hasNext() { this._check(); return this._peekToken() !== null; }
  hasNextInt() { this._check(); const t = this._peekToken(); return !!t && isIntStr(t.tok); }
  hasNextLong() { this._check(); const t = this._peekToken(); return !!t && isLongStr(t.tok); }
  hasNextDouble() { this._check(); const t = this._peekToken(); return !!t && isDoubleStr(t.tok); }
  hasNextBoolean() { this._check(); const t = this._peekToken(); return !!t && /^(true|false)$/i.test(t.tok); }
  hasNextLine() { this._check(); return this.pos < this.s.length; }
  close() { this.closed = true; }
}
function isIntStr(x) {
  if (!/^[+-]?(\d{1,3}(,\d{3})+|\d+)$/.test(x)) return false;
  const v = Number(x.replace(/,/g, ''));
  return v >= -2147483648 && v <= 2147483647;
}
function isLongStr(x) { return /^[+-]?\d+$/.test(x) && Math.abs(Number(x)) <= 9223372036854775807; }
function isDoubleStr(x) { return /^[+-]?((\d{1,3}(,\d{3})+|\d+)(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(x) || /^[+-]?(NaN|Infinity)$/.test(x); }

// ---------- conversions ----------
export function castNum(v, from, to) {
  if (from === to) return v;
  switch (to) {
    case 'double': return v;
    case 'float': return Math.fround(v);
    case 'long':
      if (from === 'double' || from === 'float') {
        if (Number.isNaN(v)) return 0;
        if (v >= 9223372036854775807) return 9223372036854775807;
        if (v <= -9223372036854775808) return -9223372036854775808;
        return Math.trunc(v) || 0;
      }
      return v;
    case 'int': {
      if (from === 'double' || from === 'float') {
        if (Number.isNaN(v)) return 0;
        if (v >= 2147483647) return 2147483647;
        if (v <= -2147483648) return -2147483648;
        return Math.trunc(v) | 0;
      }
      if (from === 'long') return Number(BigInt.asIntN(32, BigInt(Math.trunc(v))));
      return v | 0;
    }
    case 'short': return (castNum(v, from, 'int') << 16) >> 16;
    case 'byte': return (castNum(v, from, 'int') << 24) >> 24;
    case 'char': return castNum(v, from, 'int') & 0xffff;
    default: return v;
  }
}

export function parseIntJava(s, radix = 10) {
  const str = s === null ? null : String(s);
  if (str === null) throw new JavaThrow('java.lang.NumberFormatException', 'Cannot parse null string: null');
  const ok = radix === 10 ? /^[+-]?\d+$/.test(str) : new RegExp(`^[+-]?[0-9a-${String.fromCharCode(86 + radix)}]+$`, 'i').test(str);
  const v = parseInt(str, radix);
  if (!ok || v > 2147483647 || v < -2147483648) throw new JavaThrow('java.lang.NumberFormatException', `For input string: "${str}"${radix !== 10 ? ` under radix ${radix}` : ''}`);
  return v;
}
export function parseDoubleJava(s) {
  if (s === null) throw new JavaThrow('java.lang.NullPointerException');
  const str = String(s).trim();
  if (!/^[+-]?((\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?[fFdD]?|NaN|Infinity)$/.test(str)) throw new JavaThrow('java.lang.NumberFormatException', `For input string: "${String(s)}"`);
  return Number(str.replace(/[fFdD]$/, ''));
}

export function arraysToString(arr) {
  if (arr === null) return 'null';
  return '[' + arr.a.map((v) => jstr(arr.elem, v)).join(', ') + ']';
}

export function javaCompareStrings(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const d = a.charCodeAt(i) - b.charCodeAt(i);
    if (d) return d;
  }
  return a.length - b.length;
}

// Java regex -> JS regex (good enough for split/matches/replaceAll in intro courses)
export function jsRegex(pattern, flags = '') {
  try { return new RegExp(pattern.replace(/\\p\{Alpha\}/g, '[A-Za-z]').replace(/\\p\{Punct\}/g, '[!-\\/:-@\\[-`{-~]'), flags); }
  catch { throw new JavaThrow('java.util.regex.PatternSyntaxException', pattern); }
}
export function javaSplit(str, pattern, limit = 0) {
  const re = pattern.length === 1 && !'.$|()[{^?*+\\'.includes(pattern) ? pattern : jsRegex(pattern, 'g');
  let parts = str.split(re);
  if (str.length > 0 && parts.length > 1 && parts[0] === '' && typeof re !== 'string') {
    // Java removes a leading empty string only when the match at index 0 is zero-width; keep JS behaviour otherwise
  }
  if (limit === 0) { while (parts.length > 1 && parts[parts.length - 1] === '') parts.pop(); if (parts.length === 1 && parts[0] === '' && str === '') return ['']; }
  return parts;
}
