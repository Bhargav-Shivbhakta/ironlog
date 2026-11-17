// Type-checks a parsed Java program and turns it into fast JavaScript closures.
// Errors are reported with javac's wording, line and column.
import { parse } from './parser.js';
import { CompileError } from './lexer.js';
import { javaFormat } from './format.js';
import * as R from './runtime.js';

const { JavaThrow, JArray, jstr, newStr, S, castNum, NUMERIC, INTEGRAL, isArray, elemOf } = R;

const BREAK = { k: 1, label: null };
const CONTINUE = { k: 2, label: null };
const RETURN = { k: 3 };
const ERR = '<err>';
const MAX_DEPTH = 1200; // Java would allow more, but browsers have small stacks; deep recursion reports StackOverflowError

const WRAPPERS = { Integer: 'int', Double: 'double', Character: 'char', Boolean: 'boolean', Long: 'long', Float: 'float', Short: 'short', Byte: 'byte' };
const KNOWN_REF = new Set(['String', 'Scanner', 'Random', 'Object']);

const isNum = (t) => NUMERIC.has(t);
const isIntegral = (t) => INTEGRAL.has(t);
const binPromote = (a, b) => (a === 'double' || b === 'double' ? 'double' : a === 'float' || b === 'float' ? 'float' : a === 'long' || b === 'long' ? 'long' : 'int');
const unaryPromote = (t) => (t === 'byte' || t === 'short' || t === 'char' ? 'int' : t);
const WIDEN = { byte: ['short', 'int', 'long', 'float', 'double'], short: ['int', 'long', 'float', 'double'], char: ['int', 'long', 'float', 'double'], int: ['long', 'float', 'double'], long: ['float', 'double'], float: ['double'] };
const widens = (f, t) => f === t || (WIDEN[f] || []).includes(t);
const isRefT = (t) => t === 'String' || t === 'null' || isArray(t) || t === 'Scanner' || t === 'Random' || t === 'Object';
const fits = (v, t) => (t === 'byte' ? v >= -128 && v <= 127 : t === 'short' ? v >= -32768 && v <= 32767 : t === 'char' ? v >= 0 && v <= 65535 : true);

// value conversion when a value of type `from` is stored into `to` (after type checking)
function convFn(from, to) {
  if (from === to || !isNum(from) || !isNum(to)) return null;
  if (to === 'float') return (v) => Math.fround(v);
  if (to === 'byte' || to === 'short' || to === 'char' || (to === 'int' && from !== 'char' && from !== 'byte' && from !== 'short')) return (v) => castNum(v, from, to);
  return null;
}

class DA {
  constructor(all = false, set = new Set()) { this.all = all; this.set = set; }
  clone() { return new DA(this.all, new Set(this.set)); }
  has(s) { return this.all || this.set.has(s); }
  add(s) { if (!this.all) this.set.add(s); }
  static ALL() { return new DA(true); }
  static meet(list) {
    const real = list.filter((d) => d && !d.all);
    if (!real.length) return DA.ALL();
    const out = new Set([...real[0].set].filter((s) => real.every((d) => d.set.has(s))));
    return new DA(false, out);
  }
}

export function compileProgram(source, { expectedClass = null } = {}) {
  const errors = [];
  let unit;
  try { unit = parse(source); }
  catch (e) {
    if (e instanceof CompileError) return { errors: [{ line: e.line, col: e.col, message: e.message }] };
    throw e;
  }
  const err = (node, message, line, col) => {
    if (errors.length >= 30) return;
    const l = line ?? node?.line ?? 1, c = col ?? node?.col ?? 1;
    if (errors.some((x) => x.line === l && x.col === c && x.message === message)) return;
    errors.push({ line: l, col: c, message });
  };

  // ---------- runtime state for a single run ----------
  let rt = null;
  const tick = () => {
    if (++rt.steps >= rt.nextCheck) {
      rt.nextCheck = rt.steps + 20000;
      if (rt.steps > rt.maxSteps || (rt.deadline && Date.now() > rt.deadline)) throw new R.TimeLimit();
    }
  };
  const write = (s) => { rt.out.push(s); rt.outLen += s.length; if (rt.outLen > 2_000_000) throw new JavaThrow('OutputLimit', 'Your program printed too much output (over 2 MB). Is there an infinite loop?'); };
  const thrower = (e) => () => { throw e; };

  // ---------- collect classes, fields, methods ----------
  const classes = new Map();
  for (const c of unit.classes) {
    if (classes.has(c.name)) err(c, `duplicate class: ${c.name}`);
    const info = { name: c.name, node: c, fields: new Map(), methods: new Map(), statics: {} };
    classes.set(c.name, info);
    for (const m of c.members) {
      if (m.k === 'Class') { err(m, 'nested classes are not supported in the browser runner'); continue; }
      if (m.k === 'Field') {
        for (const d of m.decls) {
          if (info.fields.has(d.name)) err(d, `variable ${d.name} is already defined in class ${c.name}`);
          info.fields.set(d.name, { name: d.name, typeNode: d.type, type: null, static: m.mods.has('static'), final: m.mods.has('final'), init: d.init, decl: d, cls: info, constVal: undefined });
        }
      } else if (m.k === 'Method') {
        const list = info.methods.get(m.name) || [];
        const minfo = { name: m.name, node: m, static: m.mods.has('static'), cls: info, params: null, ret: null, body: null, nLocals: 0 };
        list.push(minfo);
        info.methods.set(m.name, list);
      }
    }
  }
  const publicClasses = unit.classes.filter((c) => c.mods.has('public'));
  if (expectedClass) {
    for (const c of publicClasses) if (c.name !== expectedClass) err(c, `class ${c.name} is public, should be declared in a file named ${c.name}.java`, c.line, c.col);
  }

  // ---------- types ----------
  function resolveType(tn, where = null) {
    let base = tn.base;
    if (WRAPPERS[base]) base = WRAPPERS[base];
    if (base === 'var') return 'var';
    if (!(['int', 'double', 'boolean', 'char', 'long', 'float', 'byte', 'short', 'void'].includes(base) || KNOWN_REF.has(base))) {
      if (base === 'ArrayList' || base === 'List' || base === 'HashMap' || base === 'Map')
        err(tn, `${base} is not supported in the browser runner yet (use arrays)`);
      else if (classes.has(base)) err(tn, 'objects of your own classes are not supported in the browser runner (use static methods)');
      else err(tn, `cannot find symbol\n  symbol:   class ${base}\n  location: class ${where?.name ?? unit.classes[0].name}`);
      return ERR;
    }
    return base + '[]'.repeat(tn.dims);
  }
  for (const c of classes.values()) {
    for (const f of c.fields.values()) f.type = resolveType(f.typeNode, c);
    for (const list of c.methods.values()) {
      for (const m of list) {
        m.ret = resolveType(m.node.ret, c);
        m.params = m.node.params.map((p) => resolveType(p.type, c));
        const sig = m.params.join(',');
        if (list.some((o) => o !== m && o.params && o.params.join(',') === sig))
          err(m.node, `method ${m.name}(${sig}) is already defined in class ${c.name}`);
      }
    }
  }
  const sigText = (m) => `${m.name}(${m.params.join(',')})`;

  // ---------- compile context ----------
  let ctx = null; // { cls, method, scopes, nSlots, targets, da, isStatic }
  const lookupVar = (name) => {
    for (let i = ctx.scopes.length - 1; i >= 0; i--) {
      const v = ctx.scopes[i].get(name);
      if (v) return v;
    }
    return null;
  };
  const dupMsg = (name) => `variable ${name} is already defined in method ${ctx.method.name}(${ctx.method.params.join(',')})`;
  const declare = (name, type, node, final = false, reported = false) => {
    const existing = lookupVar(name);
    if (existing) {
      // like javac: report it and keep using the original variable (avoids follow-on errors)
      if (!reported) err(node, dupMsg(name), node.line, node.col);
      return existing;
    }
    const v = { name, type, slot: ctx.nSlots++, final, constVal: undefined };
    ctx.scopes[ctx.scopes.length - 1].set(name, v);
    return v;
  };

  // ---------- expressions ----------
  // returns { t, f(fr), c?: constant value, lv?: { get(fr), set(fr, v), type, name, final, varRef } }
  function E(node, expected = null) {
    const r = expr0(node, expected);
    if (r.t === 'var') r.t = ERR;
    return r;
  }
  const bad = () => ({ t: ERR, f: () => { throw new Error('compile error'); } });
  const lit = (t, v) => ({ t, f: () => v, c: v });

  function checkBoolean(e, node) {
    if (e.t !== 'boolean' && e.t !== ERR) err(node, `incompatible types: ${e.t} cannot be converted to boolean`);
  }
  function assignCheck(from, to, node, constVal) {
    if (from === to || from === ERR || to === ERR) return true;
    if (to === 'Object') return true;
    if (from === 'void') { err(node, `incompatible types: void cannot be converted to ${to}`); return false; }
    if (from === 'null' && isRefT(to)) return true;
    if (isNum(from) && isNum(to)) {
      if (widens(from, to)) return true;
      if (constVal !== undefined && typeof constVal === 'number' && ['int', 'short', 'char', 'byte'].includes(from) && ['byte', 'short', 'char'].includes(to) && fits(constVal, to)) return true;
      err(node, `incompatible types: possible lossy conversion from ${from} to ${to}`);
      return false;
    }
    err(node, `incompatible types: ${from} cannot be converted to ${to}`);
    return false;
  }
  // wraps e so its value is converted to `to`
  function coerce(e, to) {
    const cf = convFn(e.t, to);
    if (!cf) return e.f;
    const f = e.f;
    return (fr) => cf(f(fr));
  }

  function expr0(node, expected) {
    switch (node.k) {
      case 'Literal': {
        if (node.type === 'String') return lit('String', node.value);
        if (node.type === 'long') return lit('long', node.value);
        return lit(node.type, node.value);
      }
      case 'Name': return nameExpr(node);
      case 'Field': return fieldExpr(node);
      case 'Index': return indexExpr(node);
      case 'Call': return callExpr(node);
      case 'New': return newExpr(node);
      case 'NewArray': return newArrayExpr(node);
      case 'ArrayInit': {
        if (!expected || !isArray(expected)) { err(node, 'illegal initializer for ' + (expected || 'this type')); return bad(); }
        return arrayInitExpr(node, expected);
      }
      case 'Unary': return unaryExpr(node);
      case 'IncDec': return incDecExpr(node);
      case 'Binary': return binaryExpr(node);
      case 'Assign': return assignExpr(node);
      case 'Cond': return condExpr(node);
      case 'Cast': return castExpr(node);
      case 'InstanceOf': err(node, 'instanceof is not supported in the browser runner'); return bad();
      default: err(node, 'illegal start of expression'); return bad();
    }
  }

  function nameExpr(node) {
    const v = lookupVar(node.name);
    if (v) {
      if (!ctx.skipDA && !ctx.da.has(v.slot)) err(node, `variable ${node.name} might not have been initialized`);
      const slot = v.slot;
      const r = { t: v.type, f: (fr) => fr.L[slot], lv: { type: v.type, name: v.name, final: v.final, varRef: v, get: (fr) => fr.L[slot], set: (fr, x) => { fr.L[slot] = x; } } };
      if (v.final && v.constVal !== undefined) r.c = v.constVal;
      return r;
    }
    const f = ctx.cls.fields.get(node.name);
    if (f) return fieldRef(f, node);
    if (classes.has(node.name) || ['Math', 'System', 'Integer', 'Double', 'Character', 'String', 'Arrays', 'Long', 'Boolean', 'Float'].includes(node.name)) {
      return { t: 'class:' + node.name, f: () => null, isClass: node.name };
    }
    err(node, `cannot find symbol\n  symbol:   variable ${node.name}\n  location: class ${ctx.cls.name}`);
    return bad();
  }
  function fieldRef(f, node) {
    if (!f.static && ctx.isStatic) { err(node, `non-static variable ${f.name} cannot be referenced from a static context`); return bad(); }
    const holder = f.cls.statics;
    const name = f.name;
    const r = { t: f.type, f: () => holder[name], lv: { type: f.type, name, final: f.final, field: f, get: () => holder[name], set: (fr, x) => { holder[name] = x; } } };
    if (f.final && f.constVal !== undefined) r.c = f.constVal;
    return r;
  }

  const STATIC_FIELDS = {
    Math: { PI: ['double', Math.PI], E: ['double', Math.E] },
    Integer: { MAX_VALUE: ['int', 2147483647], MIN_VALUE: ['int', -2147483648] },
    Long: { MAX_VALUE: ['long', 9223372036854775807], MIN_VALUE: ['long', -9223372036854775808] },
    Double: { MAX_VALUE: ['double', Number.MAX_VALUE], MIN_VALUE: ['double', Number.MIN_VALUE], POSITIVE_INFINITY: ['double', Infinity], NEGATIVE_INFINITY: ['double', -Infinity], NaN: ['double', NaN] },
    Character: { MAX_VALUE: ['char', 0xffff], MIN_VALUE: ['char', 0] },
  };
  function fieldExpr(node) {
    // System.out / System.in handled at call sites; here: arr.length, Math.PI, Class.field
    if (node.obj.k === 'Name' && !lookupVar(node.obj.name) && !ctx.cls.fields.has(node.obj.name)) {
      const cn = node.obj.name;
      if (cn === 'System' && (node.name === 'out' || node.name === 'err' || node.name === 'in')) return { t: 'stream:' + node.name, f: () => node.name };
      if (STATIC_FIELDS[cn]?.[node.name]) { const [t, v] = STATIC_FIELDS[cn][node.name]; return lit(t, v); }
      if (classes.has(cn)) {
        const f = classes.get(cn).fields.get(node.name);
        if (f) return fieldRef(f, node);
        err(node, `cannot find symbol\n  symbol:   variable ${node.name}\n  location: class ${cn}`, node.nameLine, node.nameCol);
        return bad();
      }
    }
    const o = E(node.obj);
    if (o.t === ERR) return bad();
    if (isArray(o.t)) {
      if (node.name === 'length') {
        const f = o.f;
        return { t: 'int', f: (fr) => { const a = f(fr); if (a === null) throw R.npe('Cannot read the array length because the array is null'); return a.a.length; } };
      }
    }
    if (o.t.startsWith('class:')) {
      err(node, `cannot find symbol\n  symbol:   variable ${node.name}\n  location: class ${o.t.slice(6)}`, node.nameLine, node.nameCol);
      return bad();
    }
    if (!isRefT(o.t)) { err(node, `${o.t} cannot be dereferenced`, node.nameLine, node.nameCol - 1); return bad(); }
    err(node, `cannot find symbol\n  symbol:   variable ${node.name}\n  location: ${describe(node.obj, o.t)}`, node.nameLine, node.nameCol - 1);
    return bad();
  }
  function describe(objNode, t) {
    return objNode.k === 'Name' ? `variable ${objNode.name} of type ${t}` : `class ${t}`;
  }

  function indexExpr(node) {
    const a = E(node.arr);
    const i = E(node.index);
    if (a.t === ERR) return bad();
    if (!isArray(a.t)) { err(node, `array required, but ${a.t} found`, node.bLine, node.bCol); return bad(); }
    if (i.t !== ERR && !(isIntegral(i.t) && i.t !== 'long')) {
      if (i.t === 'long' || i.t === 'double' || i.t === 'float') err(node.index, `incompatible types: possible lossy conversion from ${i.t} to int`);
      else err(node.index, `incompatible types: ${i.t} cannot be converted to int`);
    }
    const af = a.f, ifn = i.f;
    const get = (fr) => {
      const arr = af(fr); const idx = ifn(fr);
      if (arr === null) throw R.npe('Cannot load from array because it is null');
      if (idx < 0 || idx >= arr.a.length) throw R.aioobe(idx, arr.a.length);
      return arr.a[idx];
    };
    const et = elemOf(a.t);
    return {
      t: et, f: get,
      lv: {
        type: et, name: null,
        // for compound assignment we must evaluate array and index once
        ref: (fr) => {
          const arr = af(fr); const idx = ifn(fr);
          if (arr === null) throw R.npe('Cannot store to array because it is null');
          if (idx < 0 || idx >= arr.a.length) throw R.aioobe(idx, arr.a.length);
          return { get: () => arr.a[idx], set: (v) => { arr.a[idx] = v; } };
        },
      },
    };
  }

  function newExpr(node) {
    const args = node.args.map((a) => E(a));
    if (node.type === 'Scanner') {
      if (args.length !== 1 || args[0].t !== 'stream:in') {
        if (args.length === 1 && args[0].t === 'String') {
          const f = args[0].f;
          return { t: 'Scanner', f: (fr) => new R.Scanner(String(f(fr))) };
        }
        err(node, 'The browser runner supports new Scanner(System.in)');
        return bad();
      }
      return { t: 'Scanner', f: () => rt.newScanner() };
    }
    if (node.type === 'Random') {
      return { t: 'Random', f: () => ({ random: true }) };
    }
    if (node.type === 'String') {
      if (args.length === 0) return { t: 'String', f: () => newStr('') };
      if (args.length === 1 && args[0].t === 'String') { const f = args[0].f; return { t: 'String', f: (fr) => newStr(String(f(fr))) }; }
      if (args.length === 1 && args[0].t === 'char[]') { const f = args[0].f; return { t: 'String', f: (fr) => newStr(f(fr).a.map((c) => String.fromCharCode(c)).join('')) }; }
    }
    const exc = /^(IllegalArgumentException|IllegalStateException|RuntimeException|ArithmeticException|Exception|ArrayIndexOutOfBoundsException|NumberFormatException|UnsupportedOperationException)$/.exec(node.type);
    if (exc) {
      const msgF = args[0]?.f;
      const cls = (node.type === 'Exception' ? 'java.lang.' : 'java.lang.') + node.type;
      return { t: 'Throwable', f: (fr) => new JavaThrow(cls, msgF ? S(msgF(fr)) : null) };
    }
    if (classes.has(node.type)) err(node, 'creating objects of your own classes is not supported in the browser runner (use static methods)');
    else err(node, `cannot find symbol\n  symbol:   class ${node.type}\n  location: class ${ctx.cls.name}`);
    return bad();
  }

  function newArrayExpr(node) {
    let base = WRAPPERS[node.elem] || node.elem;
    if (!(['int', 'double', 'boolean', 'char', 'long', 'float', 'byte', 'short'].includes(base) || KNOWN_REF.has(base))) {
      err(node, `cannot find symbol\n  symbol:   class ${node.elem}\n  location: class ${ctx.cls.name}`, node.typeLine, node.typeCol);
      return bad();
    }
    const totalDims = node.dims.length + node.extra;
    const type = base + '[]'.repeat(totalDims);
    if (node.init) return arrayInitExpr(node.init, type);
    const dimEs = node.dims.map((d) => {
      const e = E(d);
      if (e.t !== ERR && !(isIntegral(e.t) && e.t !== 'long')) {
        if (['long', 'double', 'float'].includes(e.t)) err(d, `incompatible types: possible lossy conversion from ${e.t} to int`);
        else err(d, `incompatible types: ${e.t} cannot be converted to int`);
      }
      return e.f;
    });
    const make = (lens, depth, t) => {
      const n = lens[depth];
      if (n < 0) throw new JavaThrow('java.lang.NegativeArraySizeException', String(n));
      const et = elemOf(t);
      const arr = new Array(n);
      if (depth + 1 < lens.length) for (let i = 0; i < n; i++) arr[i] = make(lens, depth + 1, et);
      else arr.fill(R.defaultValue(et));
      return new JArray(et, arr);
    };
    return { t: type, f: (fr) => make(dimEs.map((f) => f(fr)), 0, type) };
  }
  function arrayInitExpr(node, type) {
    const et = elemOf(type);
    const items = node.elements.map((el) => {
      const e = el.k === 'ArrayInit' ? (isArray(et) ? arrayInitExpr(el, et) : (err(el, `illegal initializer for ${et}`), bad())) : E(el, et);
      assignCheck(e.t, et, el, e.c);
      return coerce(e, et);
    });
    return { t: type, f: (fr) => new JArray(et, items.map((f) => f(fr))) };
  }

  function unaryExpr(node) {
    const e = E(node.expr);
    if (e.t === ERR) return bad();
    const f = e.f;
    if (node.op === '!') {
      if (e.t !== 'boolean') { err(node, `bad operand type ${e.t} for unary operator '!'`); return bad(); }
      return e.c !== undefined ? lit('boolean', !e.c) : { t: 'boolean', f: (fr) => !f(fr) };
    }
    if (!isNum(e.t)) { err(node, `bad operand type ${e.t} for unary operator '${node.op}'`); return bad(); }
    const t = unaryPromote(e.t);
    if (node.op === '+') return { t, f, c: e.c };
    if (node.op === '-') {
      const op = t === 'int' ? (v) => (-v) | 0 : t === 'float' ? (v) => Math.fround(-v) : (v) => -v;
      return e.c !== undefined ? lit(t, op(e.c)) : { t, f: (fr) => op(f(fr)) };
    }
    if (node.op === '~') {
      if (!isIntegral(t)) { err(node, `bad operand type ${e.t} for unary operator '~'`); return bad(); }
      return { t, f: (fr) => ~f(fr) };
    }
    return bad();
  }

  function lvalueOf(node, plainAssign = false) {
    const save = ctx.skipDA;
    ctx.skipDA = plainAssign && node.k === 'Name';
    const e = E(node);
    ctx.skipDA = save;
    if (e.t === ERR) return null;
    if (!e.lv) { err(node, 'unexpected type\n  required: variable\n  found:    value'); return null; }
    return e;
  }
  function incDecExpr(node) {
    const e = lvalueOf(node.expr);
    if (!e) return bad();
    if (!isNum(e.t)) { err(node, `bad operand type ${e.t} for unary operator '${node.op}'`); return bad(); }
    if (e.lv.final) { err(node.expr, `cannot assign a value to final variable ${e.lv.name}`); return bad(); }
    if (e.lv.varRef) ctx.da.add(e.lv.varRef.slot);
    const t = e.t;
    const d = node.op === '++' ? 1 : -1;
    const step = t === 'int' ? (v) => (v + d) | 0 : t === 'double' || t === 'long' ? (v) => v + d : (v) => castNum(v + d, 'double', t);
    const pre = node.prefix;
    if (e.lv.ref) {
      const ref = e.lv.ref;
      return { t, f: (fr) => { const r = ref(fr); const old = r.get(); const nv = step(old); r.set(nv); return pre ? nv : old; } };
    }
    const { get, set } = e.lv;
    return { t, f: (fr) => { const old = get(fr); const nv = step(old); set(fr, nv); return pre ? nv : old; } };
  }

  function arith(op, t, node) {
    switch (t) {
      case 'int':
        switch (op) {
          case '+': return (a, b) => (a + b) | 0;
          case '-': return (a, b) => (a - b) | 0;
          case '*': return (a, b) => Math.imul(a, b);
          case '/': return (a, b) => { if (b === 0) throw new JavaThrow('java.lang.ArithmeticException', '/ by zero'); return (a / b) | 0; };
          case '%': return (a, b) => { if (b === 0) throw new JavaThrow('java.lang.ArithmeticException', '/ by zero'); return (a % b) | 0; };
          case '<<': return (a, b) => a << b;
          case '>>': return (a, b) => a >> b;
          case '>>>': return (a, b) => (a >>> b) | 0;
          case '&': return (a, b) => a & b;
          case '|': return (a, b) => a | b;
          case '^': return (a, b) => a ^ b;
        }
        break;
      case 'long': {
        const w = (x) => (Number.isSafeInteger(x) ? x : Number(BigInt.asIntN(64, BigInt(Math.trunc(x)))));
        switch (op) {
          case '+': return (a, b) => w(a + b);
          case '-': return (a, b) => w(a - b);
          case '*': return (a, b) => (Number.isSafeInteger(a * b) ? a * b : Number(BigInt.asIntN(64, BigInt(a) * BigInt(b))));
          case '/': return (a, b) => { if (b === 0) throw new JavaThrow('java.lang.ArithmeticException', '/ by zero'); return Math.trunc(a / b) || 0; };
          case '%': return (a, b) => { if (b === 0) throw new JavaThrow('java.lang.ArithmeticException', '/ by zero'); return (a % b) || 0; };
          case '<<': return (a, b) => Number(BigInt.asIntN(64, BigInt(a) << BigInt(b & 63)));
          case '>>': return (a, b) => Number(BigInt(a) >> BigInt(b & 63));
          case '>>>': return (a, b) => Number(BigInt.asIntN(64, BigInt.asUintN(64, BigInt(a)) >> BigInt(b & 63)));
          case '&': return (a, b) => Number(BigInt(a) & BigInt(b));
          case '|': return (a, b) => Number(BigInt(a) | BigInt(b));
          case '^': return (a, b) => Number(BigInt(a) ^ BigInt(b));
        }
        break;
      }
      case 'float':
      case 'double': {
        const r = t === 'float' ? Math.fround : (x) => x;
        switch (op) {
          case '+': return (a, b) => r(a + b);
          case '-': return (a, b) => r(a - b);
          case '*': return (a, b) => r(a * b);
          case '/': return (a, b) => r(a / b);
          case '%': return (a, b) => r(a % b);
        }
        break;
      }
      case 'boolean':
        switch (op) {
          case '&': return (a, b) => a && b;
          case '|': return (a, b) => a || b;
          case '^': return (a, b) => a !== b;
        }
    }
    err(node, `bad operand types for binary operator '${op}'`);
    return null;
  }

  function binaryExpr(node) {
    const op = node.op;
    if (op === '&&' || op === '||') {
      const a = E(node.l);
      const daAfterL = ctx.da.clone();
      const b = E(node.r);
      ctx.da = daAfterL; // assignments in the right side are not definitely made
      if (a.t === ERR || b.t === ERR) return bad();
      if (a.t !== 'boolean' || b.t !== 'boolean') { err(node, `bad operand types for binary operator '${op}'\n  first type:  ${a.t}\n  second type: ${b.t}`, node.opLine, node.opCol); return bad(); }
      const af = a.f, bf = b.f;
      if (a.c !== undefined && b.c !== undefined) return lit('boolean', op === '&&' ? a.c && b.c : a.c || b.c);
      return { t: 'boolean', f: op === '&&' ? (fr) => af(fr) && bf(fr) : (fr) => af(fr) || bf(fr) };
    }
    const a = E(node.l);
    const b = E(node.r);
    if (a.t === ERR || b.t === ERR) return bad();
    const badTypes = () => { err(node, `bad operand types for binary operator '${op}'\n  first type:  ${a.t}\n  second type: ${b.t}`, node.opLine, node.opCol); return bad(); };
    if (a.t === 'void' || b.t === 'void') { err(a.t === 'void' ? node.l : node.r, "'void' type not allowed here"); return bad(); }
    const af = a.f, bf = b.f;
    // string concatenation
    if (op === '+' && (a.t === 'String' || b.t === 'String')) {
      const at = a.t, bt = b.t;
      if (a.c !== undefined && b.c !== undefined) return lit('String', jstr(at, a.c) + jstr(bt, b.c));
      return { t: 'String', f: (fr) => { const x = af(fr); const y = bf(fr); return newStr(jstr(at, x) + jstr(bt, y)); } };
    }
    if (op === '==' || op === '!=') {
      let cmp;
      if (isNum(a.t) && isNum(b.t)) cmp = (x, y) => x === y;
      else if (a.t === 'boolean' && b.t === 'boolean') cmp = (x, y) => x === y;
      else if (isRefT(a.t) && isRefT(b.t) && (a.t === b.t || a.t === 'null' || b.t === 'null' || a.t === 'Object' || b.t === 'Object')) cmp = (x, y) => x === y;
      else return badTypes();
      if (a.c !== undefined && b.c !== undefined && isNum(a.t)) return lit('boolean', op === '==' ? a.c === b.c : a.c !== b.c);
      return { t: 'boolean', f: op === '==' ? (fr) => cmp(af(fr), bf(fr)) : (fr) => !cmp(af(fr), bf(fr)) };
    }
    if (op === '<' || op === '>' || op === '<=' || op === '>=') {
      if (!isNum(a.t) || !isNum(b.t)) return badTypes();
      const fns = { '<': (x, y) => x < y, '>': (x, y) => x > y, '<=': (x, y) => x <= y, '>=': (x, y) => x >= y };
      const c = fns[op];
      if (a.c !== undefined && b.c !== undefined) return lit('boolean', c(a.c, b.c));
      return { t: 'boolean', f: (fr) => c(af(fr), bf(fr)) };
    }
    let t;
    if (op === '<<' || op === '>>' || op === '>>>') {
      if (!isIntegral(a.t) || !isIntegral(b.t)) return badTypes();
      t = unaryPromote(a.t);
    } else if ((op === '&' || op === '|' || op === '^') && a.t === 'boolean' && b.t === 'boolean') t = 'boolean';
    else {
      if (!isNum(a.t) || !isNum(b.t)) return badTypes();
      if ((op === '&' || op === '|' || op === '^') && (!isIntegral(a.t) || !isIntegral(b.t))) return badTypes();
      t = binPromote(a.t, b.t);
    }
    const fn = arith(op, t, node);
    if (!fn) return bad();
    const ca = convFn(a.t, t), cb = convFn(b.t, t);
    const fa = ca ? (fr) => ca(af(fr)) : af;
    const fb = cb ? (fr) => cb(bf(fr)) : bf;
    if (a.c !== undefined && b.c !== undefined && !((op === '/' || op === '%') && b.c === 0 && isIntegral(t))) {
      return lit(t, fn(ca ? ca(a.c) : a.c, cb ? cb(b.c) : b.c));
    }
    return { t, f: (fr) => fn(fa(fr), fb(fr)) };
  }

  function assignExpr(node) {
    const target = lvalueOf(node.target, node.op === '=');
    if (!target) { E(node.value); return bad(); }
    const lv = target.lv;
    const t = target.t;
    if (lv.final && !(lv.varRef && !ctx.da.has(lv.varRef.slot) && node.op === '=')) {
      err(node.target, `cannot assign a value to final variable ${lv.name}`);
    }
    if (node.op === '=') {
      // reading the target is not needed for plain assignment; undo the "might not have been initialized" check
      const v = E(node.value, t);
      assignCheck(v.t, t, node.value, v.c);
      if (lv.varRef) ctx.da.add(lv.varRef.slot);
      const vf = coerce(v, t);
      if (lv.ref) { const ref = lv.ref; return { t, f: (fr) => { const r = ref(fr); const x = vf(fr); r.set(x); return x; } }; }
      const set = lv.set;
      return { t, f: (fr) => { const x = vf(fr); set(fr, x); return x; } };
    }
    // compound
    const op = node.op.slice(0, -1);
    const v = E(node.value);
    if (v.t === ERR || t === ERR) return bad();
    if (lv.varRef) ctx.da.add(lv.varRef.slot);
    let combine;
    if (op === '+' && t === 'String') {
      const vt = v.t;
      combine = (old, x) => newStr(jstr('String', old) + jstr(vt, x));
    } else {
      let pt;
      if (t === 'boolean' && v.t === 'boolean' && (op === '&' || op === '|' || op === '^')) pt = 'boolean';
      else if (!isNum(t) || !isNum(v.t)) { err(node, `bad operand types for binary operator '${op}'\n  first type:  ${t}\n  second type: ${v.t}`, node.opLine, node.opCol); return bad(); }
      else pt = op === '<<' || op === '>>' || op === '>>>' ? unaryPromote(t) : binPromote(t, v.t);
      const fn = arith(op, pt, node);
      if (!fn) return bad();
      const back = isNum(t) && pt !== t ? (x) => castNum(x, pt, t) : (x) => x;
      const ct = convFn(t, pt), cv = convFn(v.t, pt);
      combine = (old, x) => back(fn(ct ? ct(old) : old, cv ? cv(x) : x));
    }
    const vf = v.f;
    if (lv.ref) { const ref = lv.ref; return { t, f: (fr) => { const r = ref(fr); const nv = combine(r.get(), vf(fr)); r.set(nv); return nv; } }; }
    const { get, set } = lv;
    return { t, f: (fr) => { const old = get(fr); const nv = combine(old, vf(fr)); set(fr, nv); return nv; } };
  }

  function condExpr(node) {
    const c = E(node.cond);
    checkBoolean(c, node.cond);
    const da0 = ctx.da.clone();
    const a = E(node.a);
    const daA = ctx.da; ctx.da = da0.clone();
    const b = E(node.b);
    ctx.da = DA.meet([daA, ctx.da]);
    if (a.t === ERR || b.t === ERR || c.t === ERR) return bad();
    let t;
    if (a.t === b.t) t = a.t;
    else if (isNum(a.t) && isNum(b.t)) {
      // constant int fitting in the other narrow type
      if (a.c !== undefined && a.t === 'int' && ['char', 'short', 'byte'].includes(b.t) && fits(a.c, b.t)) t = b.t;
      else if (b.c !== undefined && b.t === 'int' && ['char', 'short', 'byte'].includes(a.t) && fits(b.c, a.t)) t = a.t;
      else t = binPromote(a.t, b.t);
    } else if (a.t === 'null' && isRefT(b.t)) t = b.t;
    else if (b.t === 'null' && isRefT(a.t)) t = a.t;
    else if (a.t === 'void' || b.t === 'void') { err(node, "'void' type not allowed here"); return bad(); }
    else t = 'Object';
    const cf = c.f, fa = coerce(a, t), fb = coerce(b, t);
    if (c.c !== undefined && a.c !== undefined && b.c !== undefined) return lit(t, c.c ? (convFn(a.t, t) || ((x) => x))(a.c) : (convFn(b.t, t) || ((x) => x))(b.c));
    return { t, f: (fr) => (cf(fr) ? fa(fr) : fb(fr)) };
  }

  function castExpr(node) {
    const to = resolveType(node.type, ctx.cls);
    const e = E(node.expr);
    if (to === ERR || e.t === ERR) return bad();
    const f = e.f;
    if (to === e.t) return { t: to, f, c: e.c };
    if (isNum(to) && isNum(e.t)) {
      const from = e.t;
      if (e.c !== undefined) return lit(to, castNum(e.c, from, to));
      return { t: to, f: (fr) => castNum(f(fr), from, to) };
    }
    if (isRefT(to) && (e.t === 'null' || e.t === 'Object')) return { t: to, f };
    err(node, `incompatible types: ${e.t} cannot be converted to ${to}`);
    return bad();
  }

  // ---------- method calls ----------
  function argSummary(args) { return args.map((a) => a.t).join(','); }
  function applicable(m, args) {
    if (m.params.length !== args.length) return false;
    return m.params.every((p, i) => {
      const a = args[i];
      if (a.t === ERR || p === ERR) return true;
      if (a.t === p) return true;
      if (p === 'Object') return true;
      if (a.t === 'null' && isRefT(p)) return true;
      return isNum(a.t) && isNum(p) && widens(a.t, p);
    });
  }
  function moreSpecific(m1, m2) { return m1.params.every((p, i) => p === m2.params[i] || (isNum(p) && isNum(m2.params[i]) && widens(p, m2.params[i]))); }

  function callUser(node, cls, name, args, viaClassName) {
    const list = cls.methods.get(name);
    if (!list) {
      err(node, `cannot find symbol\n  symbol:   method ${name}(${argSummary(args)})\n  location: class ${cls.name}`, node.nameLine, node.nameCol);
      return bad();
    }
    if (args.some((a) => a.t === ERR)) return bad();
    const cands = list.filter((m) => applicable(m, args));
    let m;
    if (!cands.length) {
      if (list.length === 1) {
        const only = list[0];
        if (only.params.length !== args.length) {
          err(node, `method ${name} in class ${cls.name} cannot be applied to given types;\n  required: ${only.params.join(',') || 'no arguments'}\n  found:    ${argSummary(args) || 'no arguments'}\n  reason: actual and formal argument lists differ in length`, node.nameLine, node.nameCol);
        } else {
          const i = only.params.findIndex((p, k) => !applicable({ params: [p] }, [args[k]]));
          const a = args[i], p = only.params[i];
          if (isNum(a.t) && isNum(p)) err(node.args[i], `incompatible types: possible lossy conversion from ${a.t} to ${p}`);
          else err(node.args[i], `incompatible types: ${a.t} cannot be converted to ${p}`);
        }
      } else {
        err(node, `no suitable method found for ${name}(${argSummary(args)})\n${list.map((c) => `    method ${cls.name}.${sigText(c)} is not applicable`).join('\n')}`, node.nameLine, node.nameCol);
      }
      return bad();
    }
    m = cands.find((c) => cands.every((o) => moreSpecific(c, o)));
    if (!m) { err(node, `reference to ${name} is ambiguous`, node.nameLine, node.nameCol); return bad(); }
    if (!m.static && (ctx.isStatic || viaClassName)) { err(node, `non-static method ${sigText(m)} cannot be referenced from a static context`, node.nameLine, node.nameCol); return bad(); }
    const argFs = args.map((a, i) => coerce(a, m.params[i]));
    const n = argFs.length;
    return {
      t: m.ret,
      f: (fr) => {
        const vals = new Array(n);
        for (let i = 0; i < n; i++) vals[i] = argFs[i](fr);
        return invoke(m, vals);
      },
    };
  }

  function invoke(m, vals) {
    if (++rt.depth > MAX_DEPTH) { const so = new JavaThrow('java.lang.StackOverflowError'); so.javaStack = stackNow(); throw so; }
    tick();
    const fr = { L: new Array(m.nLocals), ret: undefined, line: m.node.line, m };
    for (let i = 0; i < vals.length; i++) fr.L[i] = vals[i];
    rt.stack.push(fr);
    try {
      m.body(fr);
      return fr.ret;
    } catch (e) {
      if (e instanceof RangeError) { const so = new JavaThrow('java.lang.StackOverflowError'); so.javaStack = []; throw so; }
      if (e instanceof JavaThrow && !e.javaStack) e.javaStack = stackNow();
      throw e;
    } finally {
      rt.stack.pop();
      rt.depth--;
    }
  }
  const stackNow = () => rt.stack.map((fr) => ({ cls: fr.m.cls.name, method: fr.m.name, line: fr.line })).reverse();

  const needArgs = (node, args, types, name) => {
    // types: array of allowed type checks for each arg
    if (args.length !== types.length) { err(node, `method ${name} cannot be applied to given types;\n  required: ${types.map((t) => t.label).join(',') || 'no arguments'}\n  found:    ${argSummary(args) || 'no arguments'}\n  reason: actual and formal argument lists differ in length`, node.nameLine, node.nameCol); return false; }
    for (let i = 0; i < args.length; i++) {
      if (args[i].t === ERR) return false;
      if (!types[i].ok(args[i].t)) {
        if (types[i].num && isNum(args[i].t)) err(node.args[i], `incompatible types: possible lossy conversion from ${args[i].t} to ${types[i].label}`);
        else err(node.args[i], `incompatible types: ${args[i].t} cannot be converted to ${types[i].label}`);
        return false;
      }
    }
    return true;
  };
  const T = {
    int: { label: 'int', num: true, ok: (t) => ['int', 'char', 'short', 'byte'].includes(t) },
    long: { label: 'long', num: true, ok: (t) => isNum(t) && widens(t, 'long') },
    double: { label: 'double', num: true, ok: (t) => isNum(t) },
    String: { label: 'String', ok: (t) => t === 'String' || t === 'null' },
    char: { label: 'char', num: true, ok: (t) => t === 'char' },
    charOrString: { label: 'String', ok: (t) => t === 'String' || t === 'char' || t === 'int' },
    any: { label: 'Object', ok: (t) => t !== 'void' },
    bool: { label: 'boolean', ok: (t) => t === 'boolean' },
  };

  function callExpr(node) {
    // unqualified call: method of the current class
    if (!node.target) {
      const args = node.args.map((a) => E(a));
      return callUser(node, ctx.cls, node.name, args, false);
    }
    // System.out.println etc.
    const tgtNode = node.target;
    if (tgtNode.k === 'Field' && tgtNode.obj.k === 'Name' && tgtNode.obj.name === 'System' && !lookupVar('System') && (tgtNode.name === 'out' || tgtNode.name === 'err')) {
      return printCall(node, tgtNode.name);
    }
    if (tgtNode.k === 'Name' && !lookupVar(tgtNode.name) && !ctx.cls.fields.has(tgtNode.name)) {
      const cn = tgtNode.name;
      if (classes.has(cn)) {
        const args = node.args.map((a) => E(a));
        return callUser(node, classes.get(cn), node.name, args, false);
      }
      const r = staticLibCall(node, cn);
      if (r) return r;
    }
    const target = E(tgtNode);
    const args = node.args.map((a) => E(a));
    if (target.t === ERR || args.some((a) => a.t === ERR)) return bad();
    if (target.t.startsWith('class:')) {
      err(node, `cannot find symbol\n  symbol:   method ${node.name}(${argSummary(args)})\n  location: class ${target.t.slice(6)}`, node.nameLine, node.nameCol);
      return bad();
    }
    if (target.t === 'String') return stringMethod(node, target, args);
    if (target.t === 'Scanner') return scannerMethod(node, target, args);
    if (target.t === 'Random') return randomMethod(node, target, args);
    if (isArray(target.t)) {
      if (node.name === 'length' && !args.length) { err(node, `cannot find symbol\n  symbol:   method length()\n  location: ${describe(tgtNode, target.t)}`, node.nameLine, node.nameCol - 1); return bad(); }
      if (node.name === 'clone' && !args.length) { const f = target.f; return { t: target.t, f: (fr) => { const a = f(fr); return new JArray(a.elem, a.a.slice()); } }; }
      err(node, `cannot find symbol\n  symbol:   method ${node.name}(${argSummary(args)})\n  location: ${describe(tgtNode, target.t)}`, node.nameLine, node.nameCol - 1);
      return bad();
    }
    if (!isRefT(target.t)) { err(node, `${target.t} cannot be dereferenced`, node.nameLine, node.nameCol - 1); return bad(); }
    err(node, `cannot find symbol\n  symbol:   method ${node.name}(${argSummary(args)})\n  location: ${describe(tgtNode, target.t)}`, node.nameLine, node.nameCol - 1);
    return bad();
  }

  function printCall(node, stream) {
    const args = node.args.map((a) => E(a));
    if (args.some((a) => a.t === ERR)) return bad();
    const emit = stream === 'out' ? write : (s) => { rt.err.push(s); };
    const name = node.name;
    if (name === 'println' || name === 'print') {
      if (args.length > 1) { err(node, `no suitable method found for ${name}(${argSummary(args)})`, node.nameLine, node.nameCol); return bad(); }
      if (name === 'print' && args.length === 0) { err(node, `no suitable method found for print(no arguments)`, node.nameLine, node.nameCol); return bad(); }
      if (args[0]?.t === 'void') { err(node.args[0], "'void' type not allowed here"); return bad(); }
      const nl = name === 'println' ? '\n' : '';
      if (!args.length) return { t: 'void', f: () => { emit('\n'); } };
      const at = args[0].t, af = args[0].f;
      if (at === 'char[]') return { t: 'void', f: (fr) => { const a = af(fr); emit(a.a.map((c) => String.fromCharCode(c)).join('') + nl); } };
      return { t: 'void', f: (fr) => { emit(jstr(at, af(fr)) + nl); } };
    }
    if (name === 'printf' || name === 'format') {
      if (!args.length || args[0].t !== 'String') { err(node, `no suitable method found for ${name}(${argSummary(args)})`, node.nameLine, node.nameCol); return bad(); }
      const fmtF = args[0].f;
      const rest = args.slice(1).map((a) => ({ t: a.t, f: a.f }));
      if (rest.some((a) => a.t === 'void')) { err(node, "'void' type not allowed here"); return bad(); }
      return {
        t: 'void',
        f: (fr) => {
          const fmt = fmtF(fr);
          if (fmt === null) throw R.npe();
          const vals = rest.map((a) => ({ type: a.t, value: a.f(fr) }));
          const { text, error } = javaFormat(String(fmt), vals, jstr);
          emit(text);
          if (error) throw new JavaThrow(error.cls, error.message);
        },
      };
    }
    if (name === 'flush' || name === 'close') return { t: 'void', f: () => {} };
    err(node, `cannot find symbol\n  symbol:   method ${name}(${argSummary(args)})\n  location: variable ${stream} of type PrintStream`, node.nameLine, node.nameCol);
    return bad();
  }

  function staticLibCall(node, cn) {
    const known = ['Math', 'Integer', 'Double', 'Character', 'String', 'Arrays', 'Long', 'Boolean', 'System', 'Float'];
    if (!known.includes(cn)) return null;
    const args = node.args.map((a) => E(a));
    if (args.some((a) => a.t === ERR)) return bad();
    const name = node.name;
    const A = args.map((a) => a.f);
    const notFound = () => { err(node, `cannot find symbol\n  symbol:   method ${name}(${argSummary(args)})\n  location: class ${cn}`, node.nameLine, node.nameCol); return bad(); };
    const num1 = (fn, rt2 = 'double') => { if (!needArgs(node, args, [T.double], `${cn}.${name}`)) return bad(); const a = A[0]; return { t: rt2, f: (fr) => fn(a(fr)) }; };
    if (cn === 'Math') {
      switch (name) {
        case 'abs': {
          if (!needArgs(node, args, [T.double], 'Math.abs')) return bad();
          const t = unaryPromote(args[0].t), a = A[0];
          return { t, f: t === 'int' ? (fr) => Math.abs(a(fr)) | 0 : (fr) => Math.abs(a(fr)) };
        }
        case 'max': case 'min': {
          if (!needArgs(node, args, [T.double, T.double], 'Math.' + name)) return bad();
          const t = binPromote(unaryPromote(args[0].t), unaryPromote(args[1].t));
          const a = A[0], b = A[1];
          const fn = name === 'max' ? Math.max : Math.min;
          return { t, f: (fr) => fn(a(fr), b(fr)) };
        }
        case 'pow': { if (!needArgs(node, args, [T.double, T.double], 'Math.pow')) return bad(); const a = A[0], b = A[1]; return { t: 'double', f: (fr) => Math.pow(a(fr), b(fr)) }; }
        case 'sqrt': return num1(Math.sqrt);
        case 'cbrt': return num1(Math.cbrt);
        case 'floor': return num1(Math.floor);
        case 'ceil': return num1(Math.ceil);
        case 'rint': return num1((x) => { const r = Math.round(x); return Math.abs(x % 1) === 0.5 ? 2 * Math.round(x / 2) : r; });
        case 'round': {
          if (!needArgs(node, args, [T.double], 'Math.round')) return bad();
          const a = A[0];
          if (args[0].t === 'float') return { t: 'int', f: (fr) => castNum(Math.floor(a(fr) + 0.5), 'double', 'int') };
          return { t: 'long', f: (fr) => castNum(Math.floor(a(fr) + 0.5), 'double', 'long') };
        }
        case 'random': if (!needArgs(node, args, [], 'Math.random')) return bad(); return { t: 'double', f: () => rt.random() };
        case 'sin': return num1(Math.sin); case 'cos': return num1(Math.cos); case 'tan': return num1(Math.tan);
        case 'asin': return num1(Math.asin); case 'acos': return num1(Math.acos); case 'atan': return num1(Math.atan);
        case 'exp': return num1(Math.exp); case 'log': return num1(Math.log); case 'log10': return num1(Math.log10);
        case 'signum': return num1(Math.sign);
        case 'toRadians': return num1((x) => x / 180 * Math.PI);
        case 'toDegrees': return num1((x) => x * 180 / Math.PI);
        case 'hypot': { if (!needArgs(node, args, [T.double, T.double], 'Math.hypot')) return bad(); const a = A[0], b = A[1]; return { t: 'double', f: (fr) => Math.hypot(a(fr), b(fr)) }; }
        case 'atan2': { if (!needArgs(node, args, [T.double, T.double], 'Math.atan2')) return bad(); const a = A[0], b = A[1]; return { t: 'double', f: (fr) => Math.atan2(a(fr), b(fr)) }; }
        case 'floorDiv': case 'floorMod': {
          if (!needArgs(node, args, [T.long, T.long], 'Math.' + name)) return bad();
          const t = binPromote(unaryPromote(args[0].t), unaryPromote(args[1].t)); const a = A[0], b = A[1];
          return { t, f: (fr) => { const x = a(fr), y = b(fr); if (y === 0) throw new JavaThrow('java.lang.ArithmeticException', '/ by zero'); return name === 'floorDiv' ? Math.floor(x / y) : ((x % y) + y) % y; } };
        }
        default: return notFound();
      }
    }
    if (cn === 'Integer' || cn === 'Long') {
      const it = cn === 'Integer' ? 'int' : 'long';
      switch (name) {
        case 'parseInt': case 'parseLong': case 'valueOf': {
          if (args.length === 1 && (args[0].t === 'int' || args[0].t === 'long') && name === 'valueOf') { const a = A[0]; return { t: it, f: a }; }
          if (!needArgs(node, args, args.length === 2 ? [T.String, T.int] : [T.String], `${cn}.${name}`)) return bad();
          const a = A[0], r = A[1];
          return { t: it, f: (fr) => R.parseIntJava(a(fr), r ? r(fr) : 10) };
        }
        case 'toString': { if (!needArgs(node, args, [T.long], `${cn}.toString`)) return bad(); const a = A[0]; return { t: 'String', f: (fr) => newStr(String(a(fr))) }; }
        case 'toBinaryString': case 'toHexString': case 'toOctalString': {
          if (!needArgs(node, args, [T.long], `${cn}.${name}`)) return bad();
          const a = A[0], radix = name === 'toBinaryString' ? 2 : name === 'toHexString' ? 16 : 8;
          return { t: 'String', f: (fr) => newStr((it === 'int' ? a(fr) >>> 0 : BigInt.asUintN(64, BigInt(a(fr)))).toString(radix)) };
        }
        case 'max': case 'min': case 'sum': {
          if (!needArgs(node, args, [T.long, T.long], `${cn}.${name}`)) return bad();
          const a = A[0], b = A[1];
          return { t: it, f: (fr) => (name === 'max' ? Math.max(a(fr), b(fr)) : name === 'min' ? Math.min(a(fr), b(fr)) : it === 'int' ? (a(fr) + b(fr)) | 0 : a(fr) + b(fr)) };
        }
        case 'compare': { if (!needArgs(node, args, [T.long, T.long], `${cn}.compare`)) return bad(); const a = A[0], b = A[1]; return { t: 'int', f: (fr) => Math.sign(a(fr) - b(fr)) }; }
        default: return notFound();
      }
    }
    if (cn === 'Double' || cn === 'Float') {
      switch (name) {
        case 'parseDouble': case 'parseFloat': case 'valueOf': {
          if (args.length === 1 && isNum(args[0].t)) { const a = A[0]; return { t: 'double', f: a }; }
          if (!needArgs(node, args, [T.String], `${cn}.${name}`)) return bad();
          const a = A[0]; return { t: cn === 'Float' ? 'float' : 'double', f: (fr) => (cn === 'Float' ? Math.fround(R.parseDoubleJava(a(fr))) : R.parseDoubleJava(a(fr))) };
        }
        case 'isNaN': { if (!needArgs(node, args, [T.double], 'Double.isNaN')) return bad(); const a = A[0]; return { t: 'boolean', f: (fr) => Number.isNaN(a(fr)) }; }
        case 'isInfinite': { if (!needArgs(node, args, [T.double], 'Double.isInfinite')) return bad(); const a = A[0]; return { t: 'boolean', f: (fr) => Math.abs(a(fr)) === Infinity }; }
        case 'toString': { if (!needArgs(node, args, [T.double], 'Double.toString')) return bad(); const a = A[0]; return { t: 'String', f: (fr) => newStr(jstr('double', a(fr))) }; }
        case 'compare': { if (!needArgs(node, args, [T.double, T.double], 'Double.compare')) return bad(); const a = A[0], b = A[1]; return { t: 'int', f: (fr) => Math.sign(a(fr) - b(fr)) }; }
        case 'max': case 'min': case 'sum': { if (!needArgs(node, args, [T.double, T.double], 'Double.' + name)) return bad(); const a = A[0], b = A[1]; return { t: 'double', f: (fr) => (name === 'max' ? Math.max(a(fr), b(fr)) : name === 'min' ? Math.min(a(fr), b(fr)) : a(fr) + b(fr)) }; }
        default: return notFound();
      }
    }
    if (cn === 'Boolean') {
      if (name === 'parseBoolean' && needArgs(node, args, [T.String], 'Boolean.parseBoolean')) { const a = A[0]; return { t: 'boolean', f: (fr) => { const v = a(fr); return v !== null && String(v).toLowerCase() === 'true'; } }; }
      if (name === 'toString' && needArgs(node, args, [T.bool], 'Boolean.toString')) { const a = A[0]; return { t: 'String', f: (fr) => newStr(String(a(fr))) }; }
      return notFound();
    }
    if (cn === 'Character') {
      const c1 = (fn, rtype = 'boolean') => { if (!needArgs(node, args, [{ label: 'char', num: true, ok: (t) => t === 'char' || t === 'int' }], 'Character.' + name)) return bad(); const a = A[0]; return { t: rtype, f: (fr) => fn(a(fr)) }; };
      const ch = (c) => String.fromCharCode(c);
      switch (name) {
        case 'isDigit': return c1((c) => /\p{Nd}/u.test(ch(c)));
        case 'isLetter': return c1((c) => /\p{L}/u.test(ch(c)));
        case 'isLetterOrDigit': return c1((c) => /[\p{L}\p{Nd}]/u.test(ch(c)));
        case 'isAlphabetic': return c1((c) => /\p{Alphabetic}/u.test(ch(c)));
        case 'isUpperCase': return c1((c) => /\p{Lu}/u.test(ch(c)));
        case 'isLowerCase': return c1((c) => /\p{Ll}/u.test(ch(c)));
        case 'isWhitespace': case 'isSpaceChar': return c1((c) => /\s/.test(ch(c)));
        case 'toUpperCase': return c1((c) => ch(c).toUpperCase().charCodeAt(0), args[0]?.t === 'int' ? 'int' : 'char');
        case 'toLowerCase': return c1((c) => ch(c).toLowerCase().charCodeAt(0), args[0]?.t === 'int' ? 'int' : 'char');
        case 'getNumericValue': return c1((c) => { const d = parseInt(ch(c), 36); return Number.isNaN(d) ? -1 : d; }, 'int');
        case 'toString': case 'valueOf': if (name === 'valueOf') return c1((c) => c, 'char'); return c1((c) => newStr(ch(c)), 'String');
        default: return notFound();
      }
    }
    if (cn === 'String') {
      if (name === 'valueOf' || name === 'copyValueOf') {
        if (args.length !== 1) return notFound();
        const at = args[0].t, a = A[0];
        if (at === 'char[]') return { t: 'String', f: (fr) => newStr(a(fr).a.map((c) => String.fromCharCode(c)).join('')) };
        return { t: 'String', f: (fr) => newStr(jstr(at, a(fr))) };
      }
      if (name === 'format') {
        if (!args.length || args[0].t !== 'String') return notFound();
        const fmtF = A[0];
        const rest = args.slice(1);
        return { t: 'String', f: (fr) => { const vals = rest.map((x) => ({ type: x.t, value: x.f(fr) })); const { text, error } = javaFormat(String(fmtF(fr)), vals, jstr); if (error) throw new JavaThrow(error.cls, error.message); return newStr(text); } };
      }
      if (name === 'join') {
        if (args.length < 1 || args[0].t !== 'String') return notFound();
        const sep = A[0];
        if (args.length === 2 && args[1].t === 'String[]') { const a = A[1]; return { t: 'String', f: (fr) => newStr(a(fr).a.map((x) => jstr('String', x)).join(String(sep(fr)))) }; }
        const rest = args.slice(1);
        return { t: 'String', f: (fr) => newStr(rest.map((x) => jstr(x.t, x.f(fr))).join(String(sep(fr)))) };
      }
      return notFound();
    }
    if (cn === 'Arrays') {
      const arr0 = args[0] && isArray(args[0].t);
      switch (name) {
        case 'toString': { if (args.length !== 1 || !arr0) return notFound(); const a = A[0]; return { t: 'String', f: (fr) => newStr(R.arraysToString(a(fr))) }; }
        case 'sort': {
          if (!arr0 || (args.length !== 1 && args.length !== 3)) return notFound();
          const a = A[0], et = elemOf(args[0].t);
          const cmp = et === 'String' ? (x, y) => R.javaCompareStrings(String(x), String(y)) : (x, y) => (x < y ? -1 : x > y ? 1 : 0);
          const from = A[1], to = A[2];
          return { t: 'void', f: (fr) => { const arr = a(fr); if (from) { const i = from(fr), j = to(fr); const part = arr.a.slice(i, j).sort(cmp); arr.a.splice(i, j - i, ...part); } else arr.a.sort(cmp); } };
        }
        case 'fill': {
          if (args.length !== 2 || !arr0) return notFound();
          const et = elemOf(args[0].t);
          assignCheck(args[1].t, et, node.args[1], args[1].c);
          const a = A[0], v = coerce(args[1], et);
          return { t: 'void', f: (fr) => { a(fr).a.fill(v(fr)); } };
        }
        case 'copyOf': case 'copyOfRange': {
          if (!arr0) return notFound();
          const a = A[0], n1 = A[1], n2 = A[2], et = elemOf(args[0].t);
          return { t: args[0].t, f: (fr) => { const src = a(fr).a; let out; if (name === 'copyOf') { const n = n1(fr); out = src.slice(0, n); while (out.length < n) out.push(R.defaultValue(et)); } else out = src.slice(n1(fr), n2(fr)); return new JArray(et, out); } };
        }
        case 'equals': { if (args.length !== 2) return notFound(); const a = A[0], b = A[1]; return { t: 'boolean', f: (fr) => { const x = a(fr), y = b(fr); if (x === y) return true; if (!x || !y || x.a.length !== y.a.length) return false; return x.a.every((v, i) => (typeof v === 'object' && v !== null ? String(v) === String(y.a[i]) : v === y.a[i])); } }; }
        default: return notFound();
      }
    }
    if (cn === 'System') {
      if (name === 'exit') { if (!needArgs(node, args, [T.int], 'System.exit')) return bad(); const a = A[0]; return { t: 'void', f: (fr) => { throw new R.ExitSignal(a(fr)); } }; }
      if (name === 'currentTimeMillis' || name === 'nanoTime') return { t: 'long', f: () => (name === 'nanoTime' ? Math.round(performance.now() * 1e6) : Date.now()) };
      return notFound();
    }
    return null;
  }

  function stringMethod(node, target, args) {
    const name = node.name;
    const s = target.f;
    const A = args.map((a) => a.f);
    const get = (fr) => {
      const v = s(fr);
      if (v === null) throw R.npe(`Cannot invoke "String.${name}()" because ${node.target.k === 'Name' ? `"${node.target.name}"` : 'the value'} is null`);
      return String(v);
    };
    const nf = () => { err(node, `cannot find symbol\n  symbol:   method ${name}(${argSummary(args)})\n  location: ${describe(node.target, 'String')}`, node.nameLine, node.nameCol - 1); return bad(); };
    const sig = (types) => needArgs(node, args, types, `String.${name}`);
    switch (name) {
      case 'length': if (!sig([])) return bad(); return { t: 'int', f: (fr) => get(fr).length };
      case 'charAt': if (!sig([T.int])) return bad(); return { t: 'char', f: (fr) => { const str = get(fr); const i = A[0](fr); if (i < 0 || i >= str.length) throw R.sioobe(i, str.length); return str.charCodeAt(i); } };
      case 'isEmpty': if (!sig([])) return bad(); return { t: 'boolean', f: (fr) => get(fr).length === 0 };
      case 'isBlank': if (!sig([])) return bad(); return { t: 'boolean', f: (fr) => get(fr).trim().length === 0 };
      case 'substring': {
        if (args.length === 1) { if (!sig([T.int])) return bad(); return { t: 'String', f: (fr) => { const str = get(fr); const b = A[0](fr); if (b < 0 || b > str.length) throw new JavaThrow('java.lang.StringIndexOutOfBoundsException', `Range [${b}, ${str.length}) out of bounds for length ${str.length}`); return newStr(str.slice(b)); } }; }
        if (!sig([T.int, T.int])) return bad();
        return { t: 'String', f: (fr) => { const str = get(fr); const b = A[0](fr), e = A[1](fr); if (b < 0 || e > str.length || b > e) throw new JavaThrow('java.lang.StringIndexOutOfBoundsException', `Range [${b}, ${e}) out of bounds for length ${str.length}`); return newStr(str.slice(b, e)); } };
      }
      case 'indexOf': case 'lastIndexOf': {
        if (args.length < 1 || args.length > 2 || !T.charOrString.ok(args[0].t) || (args[1] && !T.int.ok(args[1].t))) return nf();
        const at = args[0].t;
        const needle = (fr) => (at === 'String' ? String(A[0](fr)) : String.fromCharCode(A[0](fr)));
        const from = A[1];
        return { t: 'int', f: (fr) => { const str = get(fr); const n = needle(fr); return name === 'indexOf' ? str.indexOf(n, from ? Math.max(0, from(fr)) : 0) : (from ? (from(fr) < 0 ? -1 : str.lastIndexOf(n, from(fr))) : str.lastIndexOf(n)); } };
      }
      case 'equals': if (!sig([T.any])) return bad(); { const at = args[0].t; return { t: 'boolean', f: (fr) => { const a = get(fr); const b = A[0](fr); return b !== null && (at === 'String' || at === 'Object') && a === String(b); } }; }
      case 'equalsIgnoreCase': if (!sig([T.String])) return bad(); return { t: 'boolean', f: (fr) => { const b = A[0](fr); return b !== null && get(fr).toLowerCase() === String(b).toLowerCase(); } };
      case 'compareTo': if (!sig([T.String])) return bad(); return { t: 'int', f: (fr) => { const a = get(fr); const b = A[0](fr); if (b === null) throw R.npe(); return R.javaCompareStrings(a, String(b)); } };
      case 'compareToIgnoreCase': if (!sig([T.String])) return bad(); return { t: 'int', f: (fr) => R.javaCompareStrings(get(fr).toLowerCase(), String(A[0](fr)).toLowerCase()) };
      case 'toUpperCase': if (!sig([])) return bad(); return { t: 'String', f: (fr) => newStr(get(fr).toUpperCase()) };
      case 'toLowerCase': if (!sig([])) return bad(); return { t: 'String', f: (fr) => newStr(get(fr).toLowerCase()) };
      case 'trim': if (!sig([])) return bad(); return { t: 'String', f: (fr) => newStr(get(fr).replace(/^[\x00-\x20]+|[\x00-\x20]+$/g, '')) };
      case 'strip': if (!sig([])) return bad(); return { t: 'String', f: (fr) => newStr(get(fr).trim()) };
      case 'contains': if (!sig([T.String])) return bad(); return { t: 'boolean', f: (fr) => get(fr).includes(String(A[0](fr))) };
      case 'startsWith': if (!sig([T.String])) return bad(); return { t: 'boolean', f: (fr) => get(fr).startsWith(String(A[0](fr))) };
      case 'endsWith': if (!sig([T.String])) return bad(); return { t: 'boolean', f: (fr) => get(fr).endsWith(String(A[0](fr))) };
      case 'concat': if (!sig([T.String])) return bad(); return { t: 'String', f: (fr) => newStr(get(fr) + String(A[0](fr))) };
      case 'repeat': if (!sig([T.int])) return bad(); return { t: 'String', f: (fr) => { const n = A[0](fr); if (n < 0) throw new JavaThrow('java.lang.IllegalArgumentException', 'count is negative: ' + n); return newStr(get(fr).repeat(n)); } };
      case 'replace': {
        if (args.length !== 2) return nf();
        if (args[0].t === 'char' && args[1].t === 'char') return { t: 'String', f: (fr) => newStr(get(fr).split(String.fromCharCode(A[0](fr))).join(String.fromCharCode(A[1](fr)))) };
        if (!sig([T.String, T.String])) return bad();
        return { t: 'String', f: (fr) => newStr(get(fr).split(String(A[0](fr))).join(String(A[1](fr)))) };
      }
      case 'replaceAll': case 'replaceFirst': if (!sig([T.String, T.String])) return bad(); return { t: 'String', f: (fr) => newStr(get(fr).replace(R.jsRegex(String(A[0](fr)), name === 'replaceAll' ? 'g' : ''), String(A[1](fr)).replace(/\$(\d)/g, '$$$1'))) };
      case 'matches': if (!sig([T.String])) return bad(); return { t: 'boolean', f: (fr) => R.jsRegex('^(?:' + String(A[0](fr)) + ')$').test(get(fr)) };
      case 'split': {
        if (!(args.length === 1 ? sig([T.String]) : sig([T.String, T.int]))) return bad();
        return { t: 'String[]', f: (fr) => new JArray('String', R.javaSplit(get(fr), String(A[0](fr)), A[1] ? A[1](fr) : 0).map(newStr)) };
      }
      case 'toCharArray': if (!sig([])) return bad(); return { t: 'char[]', f: (fr) => new JArray('char', [...get(fr)].map((c) => c.charCodeAt(0))) };
      case 'hashCode': if (!sig([])) return bad(); return { t: 'int', f: (fr) => { let h = 0; for (const c of get(fr)) h = (Math.imul(31, h) + c.charCodeAt(0)) | 0; return h; } };
      case 'toString': case 'intern': if (!sig([])) return bad(); return { t: 'String', f: (fr) => (name === 'intern' ? get(fr) : s(fr)) };
      case 'chars': default: return nf();
    }
  }

  function scannerMethod(node, target, args) {
    const name = node.name;
    const s = target.f;
    const ret = { nextInt: 'int', nextDouble: 'double', nextLong: 'long', nextFloat: 'float', nextBoolean: 'boolean', next: 'String', nextLine: 'String', hasNext: 'boolean', hasNextInt: 'boolean', hasNextDouble: 'boolean', hasNextLong: 'boolean', hasNextBoolean: 'boolean', hasNextLine: 'boolean', close: 'void' }[name];
    if (!ret) { err(node, `cannot find symbol\n  symbol:   method ${name}(${argSummary(args)})\n  location: ${describe(node.target, 'Scanner')}`, node.nameLine, node.nameCol - 1); return bad(); }
    if (args.length) { err(node, `method ${name} in class Scanner cannot be applied to given types;\n  required: no arguments\n  found:    ${argSummary(args)}\n  reason: actual and formal argument lists differ in length`, node.nameLine, node.nameCol); return bad(); }
    return { t: ret, f: (fr) => { const sc = s(fr); if (sc === null) throw R.npe(`Cannot invoke "java.util.Scanner.${name}()" because the Scanner is null`); return sc[name](); } };
  }
  function randomMethod(node, target, args) {
    const A = args.map((a) => a.f);
    switch (node.name) {
      case 'nextInt':
        if (!args.length) return { t: 'int', f: () => (rt.random() * 4294967296 - 2147483648) | 0 };
        if (args.length === 1) return { t: 'int', f: (fr) => { const n = A[0](fr); if (n <= 0) throw new JavaThrow('java.lang.IllegalArgumentException', 'bound must be positive'); return Math.floor(rt.random() * n); } };
        return { t: 'int', f: (fr) => { const a = A[0](fr), b = A[1](fr); return a + Math.floor(rt.random() * (b - a)); } };
      case 'nextDouble': return { t: 'double', f: () => rt.random() };
      case 'nextBoolean': return { t: 'boolean', f: () => rt.random() < 0.5 };
      default: err(node, `cannot find symbol\n  symbol:   method ${node.name}(${argSummary(args)})\n  location: class Random`, node.nameLine, node.nameCol); return bad();
    }
  }

  // ---------- statements ----------
  // Each compiled statement: (fr) => undefined | signal.  Also returns completes (boolean) for flow analysis.
  function S_(node) {
    const r = stmt(node);
    return r;
  }
  function stmt(node) {
    const line = node.line;
    switch (node.k) {
      case 'Block': {
        ctx.scopes.push(new Map());
        const r = blockBody(node.stmts);
        ctx.scopes.pop();
        return r;
      }
      case 'Empty': return { f: () => undefined, completes: true };
      case 'Local': {
        const parts = [];
        for (const d of node.decls) {
          const dup = !!lookupVar(d.name);
          if (dup) err(d, dupMsg(d.name), d.line, d.col);
          let type = node.type.base === 'var' ? 'var' : resolveType(d.type, ctx.cls);
          let initF = null, constVal;
          if (d.init) {
            const e = E(d.init, type === 'var' ? null : type);
            if (type === 'var') { type = e.t === 'null' ? ERR : e.t; if (e.t === 'null') err(d, 'cannot infer type for local variable ' + d.name + '\n  (variable initializer is \'null\')'); }
            else assignCheck(e.t, type, d.init, e.c);
            initF = coerce(e, type);
            if (node.final && e.c !== undefined) constVal = (convFn(e.t, type) || ((x) => x))(e.c);
          } else if (type === 'var') { err(d, `cannot infer type for local variable ${d.name}\n  (cannot use 'var' on variable without initializer)`); type = ERR; }
          const v = declare(d.name, type, d, node.final, dup);
          if (!dup) v.constVal = constVal;
          if (initF) ctx.da.add(v.slot);
          const slot = v.slot;
          parts.push(initF ? (fr) => { fr.L[slot] = initF(fr); } : null);
        }
        const fs = parts.filter(Boolean);
        return { f: (fr) => { fr.line = line; for (let i = 0; i < fs.length; i++) fs[i](fr); }, completes: true };
      }
      case 'Expr': {
        const e = E(node.expr);
        const f = e.f;
        return { f: (fr) => { fr.line = line; f(fr); }, completes: true };
      }
      case 'If': {
        const c = E(node.cond);
        checkBoolean(c, node.cond);
        const da0 = ctx.da.clone();
        const a = S_(node.then);
        const daA = a.completes ? ctx.da : DA.ALL();
        let b = null, daB;
        ctx.da = da0.clone();
        if (node.else) { b = S_(node.else); daB = b.completes ? ctx.da : DA.ALL(); }
        else daB = da0;
        ctx.da = DA.meet([daA, daB]);
        const cf = c.f, af = a.f, bf = b ? b.f : null;
        return {
          f: bf ? (fr) => { fr.line = line; return cf(fr) ? af(fr) : bf(fr); } : (fr) => { fr.line = line; if (cf(fr)) return af(fr); return undefined; },
          completes: !b || a.completes || b.completes,
        };
      }
      case 'While': case 'For': return loopStmt(node, null);
      case 'DoWhile': return doStmt(node, null);
      case 'ForEach': return forEachStmt(node, null);
      case 'Labeled': {
        if (['While', 'For', 'DoWhile', 'ForEach'].includes(node.body.k)) {
          return node.body.k === 'DoWhile' ? doStmt(node.body, node.label) : node.body.k === 'ForEach' ? forEachStmt(node.body, node.label) : loopStmt(node.body, node.label);
        }
        const target = { kind: 'label', label: node.label, hasBreak: false, breakDAs: [] };
        ctx.targets.push(target);
        const b = S_(node.body);
        ctx.targets.pop();
        const lbl = node.label, bf = b.f;
        ctx.da = DA.meet([b.completes ? ctx.da : DA.ALL(), ...target.breakDAs]);
        return { f: (fr) => { const s = bf(fr); if (s && s.k === 1 && s.label === lbl) return undefined; return s; }, completes: b.completes || target.hasBreak };
      }
      case 'Switch': return switchStmt(node);
      case 'Break': {
        let t = null;
        for (let i = ctx.targets.length - 1; i >= 0; i--) {
          const x = ctx.targets[i];
          if (node.label ? x.label === node.label : x.kind !== 'label') { t = x; break; }
        }
        if (!t) err(node, node.label ? `undefined label: ${node.label}` : 'break outside switch or loop');
        else { t.hasBreak = true; t.breakDAs.push(ctx.da.clone()); }
        ctx.da = DA.ALL();
        const sig = node.label ? { k: 1, label: node.label } : BREAK;
        return { f: (fr) => { fr.line = line; return sig; }, completes: false };
      }
      case 'Continue': {
        let t = null;
        for (let i = ctx.targets.length - 1; i >= 0; i--) {
          const x = ctx.targets[i];
          if (x.kind === 'loop' && (!node.label || x.label === node.label)) { t = x; break; }
        }
        if (!t) err(node, node.label ? `undefined label: ${node.label}` : 'continue outside of loop');
        else t.contDAs.push(ctx.da.clone());
        ctx.da = DA.ALL();
        const sig = node.label ? { k: 2, label: node.label } : CONTINUE;
        return { f: (fr) => { fr.line = line; return sig; }, completes: false };
      }
      case 'Return': {
        const m = ctx.method;
        let f;
        if (node.expr) {
          const e = E(node.expr, m.ret);
          if (m.ret === 'void') err(node.expr, 'incompatible types: unexpected return value');
          else assignCheck(e.t, m.ret, node.expr, e.c);
          const vf = coerce(e, m.ret);
          f = (fr) => { fr.line = line; fr.ret = vf(fr); return RETURN; };
        } else {
          if (m.ret !== 'void' && m.ret !== ERR) err(node, 'incompatible types: missing return value');
          f = (fr) => { fr.line = line; return RETURN; };
        }
        ctx.da = DA.ALL();
        return { f, completes: false };
      }
      case 'Throw': {
        const e = E(node.expr);
        const ef = e.f;
        ctx.da = DA.ALL();
        return { f: (fr) => { fr.line = line; const x = ef(fr); throw x instanceof JavaThrow ? x : new JavaThrow('java.lang.RuntimeException'); }, completes: false };
      }
      default:
        err(node, 'this statement is not supported in the browser runner');
        return { f: () => undefined, completes: true };
    }
  }
  function blockBody(stmts) {
    const fs = [];
    let completes = true;
    let reportedUnreachable = false;
    for (const s of stmts) {
      if (!completes && !reportedUnreachable) { err(s, 'unreachable statement'); reportedUnreachable = true; }
      const r = s.k === 'Local' || s.k === 'Class' ? stmt(s) : S_(s);
      fs.push(r.f);
      if (completes) completes = r.completes;
    }
    const n = fs.length;
    if (n === 0) return { f: () => undefined, completes: true };
    if (n === 1) return { f: fs[0], completes };
    return {
      f: (fr) => {
        for (let i = 0; i < n; i++) { const s = fs[i](fr); if (s !== undefined) return s; }
        return undefined;
      },
      completes,
    };
  }

  function loopStmt(node, label) {
    const line = node.line;
    ctx.scopes.push(new Map());
    const inits = [];
    if (node.k === 'For') for (const s of node.init) inits.push(stmt(s).f);
    const c = node.cond ? E(node.cond) : lit('boolean', true);
    if (node.cond) checkBoolean(c, node.cond);
    const daAfterCond = ctx.da.clone();
    const target = { kind: 'loop', label, hasBreak: false, breakDAs: [], contDAs: [] };
    ctx.targets.push(target);
    const body = S_(node.body);
    const updates = node.k === 'For' ? node.update.map((u) => E(u).f) : [];
    ctx.targets.pop();
    ctx.scopes.pop();
    const infinite = c.c === true;
    ctx.da = infinite ? DA.meet(target.breakDAs.length ? target.breakDAs : [DA.ALL()]) : DA.meet([daAfterCond, ...target.breakDAs]);
    const cf = c.f, bf = body.f;
    const nu = updates.length, ni = inits.length;
    const f = (fr) => {
      fr.line = line;
      for (let i = 0; i < ni; i++) inits[i](fr);
      while (true) {
        tick();
        fr.line = line;
        if (!cf(fr)) break;
        const s = bf(fr);
        if (s !== undefined) {
          if (s.k === 1) { if (s.label === null || s.label === label) break; return s; }
          if (s.k === 2) { if (!(s.label === null || s.label === label)) return s; }
          else return s;
        }
        for (let i = 0; i < nu; i++) updates[i](fr);
      }
      return undefined;
    };
    return { f, completes: !infinite || target.hasBreak };
  }
  function doStmt(node, label) {
    const line = node.line;
    const target = { kind: 'loop', label, hasBreak: false, breakDAs: [], contDAs: [] };
    ctx.targets.push(target);
    const body = S_(node.body);
    ctx.targets.pop();
    ctx.da = DA.meet([body.completes ? ctx.da : DA.ALL(), ...target.contDAs]);
    const c = E(node.cond);
    checkBoolean(c, node.cond);
    const infinite = c.c === true;
    ctx.da = infinite ? DA.meet(target.breakDAs.length ? target.breakDAs : [DA.ALL()]) : DA.meet([ctx.da, ...target.breakDAs]);
    const cf = c.f, bf = body.f;
    const f = (fr) => {
      while (true) {
        tick();
        const s = bf(fr);
        if (s !== undefined) {
          if (s.k === 1) { if (s.label === null || s.label === label) break; return s; }
          if (s.k === 2) { if (!(s.label === null || s.label === label)) return s; }
          else return s;
        }
        fr.line = node.cond.line || line;
        if (!cf(fr)) break;
      }
      return undefined;
    };
    return { f, completes: (!infinite && (body.completes || target.contDAs.length > 0)) || target.hasBreak };
  }
  function forEachStmt(node, label) {
    const line = node.line;
    const arr = E(node.expr);
    ctx.scopes.push(new Map());
    let vt = node.type.base === 'var' ? (isArray(arr.t) ? elemOf(arr.t) : ERR) : resolveType(node.type, ctx.cls);
    if (arr.t !== ERR && !isArray(arr.t)) err(node.expr, `for-each not applicable to expression type\n  required: array or java.lang.Iterable\n  found:    ${arr.t}`);
    else if (arr.t !== ERR) assignCheck(elemOf(arr.t), vt, node, undefined);
    const v = declare(node.name, vt, { line: node.nameLine, col: node.nameCol });
    ctx.da.add(v.slot);
    const da0 = ctx.da.clone();
    const target = { kind: 'loop', label, hasBreak: false, breakDAs: [], contDAs: [] };
    ctx.targets.push(target);
    const body = S_(node.body);
    ctx.targets.pop();
    ctx.scopes.pop();
    ctx.da = DA.meet([da0, ...target.breakDAs]);
    const af = arr.f, bf = body.f, slot = v.slot;
    const cv = isArray(arr.t) ? convFn(elemOf(arr.t), vt) : null;
    return {
      f: (fr) => {
        fr.line = line;
        const a = af(fr);
        if (a === null) throw R.npe('Cannot read the array length because the array is null');
        const items = a.a;
        for (let i = 0; i < items.length; i++) {
          tick();
          fr.L[slot] = cv ? cv(items[i]) : items[i];
          const s = bf(fr);
          if (s !== undefined) {
            if (s.k === 1) { if (s.label === null || s.label === label) break; return s; }
            if (s.k === 2) { if (!(s.label === null || s.label === label)) return s; }
            else return s;
          }
        }
        return undefined;
      },
      completes: true,
    };
  }
  function switchStmt(node) {
    const line = node.line;
    const sel = E(node.selector);
    let st = sel.t;
    if (st !== ERR && !['int', 'char', 'short', 'byte', 'String'].includes(st)) { err(node.selector, `selector type ${st} is not allowed`); st = ERR; }
    const da0 = ctx.da.clone();
    ctx.scopes.push(new Map());
    const target = { kind: 'switch', label: null, hasBreak: false, breakDAs: [] };
    ctx.targets.push(target);
    const valueToGroup = new Map();
    let defaultGroup = -1;
    const groupFs = [];
    let prevCompletes = false, prevDA = null;
    let lastCompletes = true, anyCompletes = false;
    node.groups.forEach((g, gi) => {
      for (const lb of g.labels) {
        if (lb.def) { if (defaultGroup >= 0) err(lb, 'duplicate default label'); defaultGroup = gi; continue; }
        const e = E(lb.expr);
        if (e.t === ERR || st === ERR) continue;
        if (e.c === undefined) { err(lb.expr, 'constant expression required'); continue; }
        if (st === 'String' ? e.t !== 'String' : !(isNum(e.t) && (e.t === st || (e.t === 'int' && fits(e.c, st)) || (st === 'int' && ['char', 'short', 'byte'].includes(e.t))))) {
          if (st === 'String' || e.t === 'String' || e.t === 'boolean') err(lb.expr, `incompatible types: ${e.t} cannot be converted to ${st}`);
          else err(lb.expr, `incompatible types: possible lossy conversion from ${e.t} to ${st}`);
          continue;
        }
        const key = st === 'String' ? String(e.c) : e.c;
        if (valueToGroup.has(key)) err(lb.expr, 'duplicate case label');
        else valueToGroup.set(key, gi);
      }
      ctx.da = node.arrow ? da0.clone() : DA.meet(prevCompletes && prevDA ? [da0, prevDA] : [da0]);
      const r = blockBody(g.stmts);
      groupFs.push(r.f);
      prevCompletes = r.completes; prevDA = ctx.da;
      lastCompletes = r.completes;
      if (r.completes) anyCompletes = true;
      if (node.arrow && r.completes) target.breakDAs.push(ctx.da.clone());
    });
    ctx.targets.pop();
    ctx.scopes.pop();
    const hasDefault = defaultGroup >= 0;
    const exits = [...target.breakDAs];
    if (!node.arrow && lastCompletes) exits.push(ctx.da);
    if (!hasDefault) exits.push(da0);
    ctx.da = node.groups.length ? DA.meet(exits) : da0;
    const sf = sel.f, n = groupFs.length, arrow = node.arrow;
    const isStr = st === 'String';
    const f = (fr) => {
      fr.line = line;
      let v = sf(fr);
      if (isStr) { if (v === null) throw R.npe('Cannot invoke "String.hashCode()" because the switch value is null'); v = String(v); }
      let start = valueToGroup.has(v) ? valueToGroup.get(v) : defaultGroup;
      if (start < 0) return undefined;
      for (let i = start; i < n; i++) {
        const s = groupFs[i](fr);
        if (s !== undefined) {
          if (s.k === 1 && s.label === null) return undefined;
          return s;
        }
        if (arrow) return undefined;
      }
      return undefined;
    };
    const completes = !hasDefault || target.hasBreak || (arrow ? true : lastCompletes) || node.groups.length === 0;
    return { f, completes: arrow ? (!hasDefault || target.hasBreak || anyCompletes) : completes };
  }

  // ---------- compile methods ----------
  for (const c of classes.values()) {
    // static field initializers
    const inits = [];
    for (const f of c.fields.values()) {
      if (!f.static) continue;
      ctx = { cls: c, method: { name: '<clinit>', params: [], ret: 'void' }, scopes: [new Map()], nSlots: 0, targets: [], da: DA.ALL(), isStatic: true };
      const name = f.name;
      if (f.init) {
        const e = f.init.k === 'ArrayInit' ? (isArray(f.type) ? arrayInitExpr(f.init, f.type) : (err(f.init, `illegal initializer for ${f.type}`), bad())) : E(f.init, f.type);
        assignCheck(e.t, f.type, f.init, e.c);
        if (f.final && e.c !== undefined) f.constVal = (convFn(e.t, f.type) || ((x) => x))(e.c);
        const vf = coerce(e, f.type);
        const holder = c.statics;
        inits.push((fr) => { holder[name] = vf(fr); });
      } else {
        const holder = c.statics; const dv = R.defaultValue(f.type);
        inits.push(() => { holder[name] = dv; });
      }
    }
    c.clinit = inits;
    for (const list of c.methods.values()) {
      for (const m of list) {
        if (!m.node.body) { err(m.node, 'missing method body, or declare abstract'); continue; }
        ctx = { cls: c, method: m, scopes: [new Map()], nSlots: 0, targets: [], da: new DA(), isStatic: m.static };
        m.node.params.forEach((p, i) => { const v = declare(p.name, m.params[i], p, p.final); ctx.da.add(v.slot); });
        const body = blockBody(m.node.body.stmts);
        if (body.completes && m.ret !== 'void' && m.ret !== ERR) {
          const ln = source.split('\n')[m.node.body.endLine - 1] || '';
          err(m.node.body, 'missing return statement', m.node.body.endLine, (ln.lastIndexOf('}') + 1) || 1);
        }
        m.body = body.f;
        m.nLocals = ctx.nSlots;
      }
    }
  }

  errors.sort((a, b) => a.line - b.line); // stable: same-line errors stay in javac's reporting order
  if (errors.length) return { errors };

  // ---------- entry point ----------
  const mainClass = (expectedClass && classes.get(expectedClass)) || [...classes.values()].find((c) => c.methods.get('main')?.some((m) => m.static && m.params.length === 1 && m.params[0] === 'String[]')) || classes.get(publicClasses[0]?.name) || [...classes.values()][0];
  const main = mainClass.methods.get('main')?.find((m) => m.static && m.ret === 'void' && m.params.length === 1 && m.params[0] === 'String[]');

  function run(input = '', { maxSteps = 50_000_000, timeLimitMs = 0, random = Math.random } = {}) {
    rt = {
      out: [], err: [], outLen: 0, steps: 0, nextCheck: 20000, maxSteps, deadline: timeLimitMs ? Date.now() + timeLimitMs : 0,
      stack: [], depth: 0, random,
      newScanner: () => (rt.sharedScanner ||= new R.Scanner(input)),
    };
    const result = { stdout: '', stderr: '', exception: null, exitCode: 0, timedOut: false };
    try {
      if (!main) {
        result.stderr = `Error: Main method not found in class ${mainClass.name}, please define the main method as:\n   public static void main(String[] args)`;
        result.exitCode = 1;
        return result;
      }
      const boot = { L: [], line: 1, m: { name: '<clinit>', cls: mainClass, node: { line: 1 } } };
      rt.stack.push(boot);
      for (const c of classes.values()) for (const f of c.clinit) f(boot);
      rt.stack.pop();
      invoke(main, [new JArray('String', [])]);
    } catch (e) {
      if (e instanceof R.ExitSignal) result.exitCode = e.code;
      else if (e instanceof R.TimeLimit) { result.timedOut = true; result.exitCode = 124; }
      else if (e instanceof JavaThrow && e.cls === 'OutputLimit') { result.outputLimit = true; result.exitCode = 1; rt.err.push(e.msg + '\n'); }
      else if (e instanceof JavaThrow) {
        result.exception = { cls: e.cls, message: e.msg, stack: e.javaStack || [] };
        result.exitCode = 1;
        const trace = (e.javaStack || []).map((s) => `\tat ${s.cls}.${s.method}(${s.cls}.java:${s.line})`).join('\n');
        rt.err.push(`Exception in thread "main" ${e.cls}${e.msg != null ? ': ' + e.msg : ''}\n${trace}\n`);
      } else if (e instanceof RangeError) {
        result.exception = { cls: 'java.lang.StackOverflowError', message: null, stack: [] };
        rt.err.push('Exception in thread "main" java.lang.StackOverflowError\n');
        result.exitCode = 1;
      } else throw e;
    }
    result.stdout = rt.out.join('');
    result.stderr = rt.err.join('') + result.stderr;
    return result;
  }

  return { errors: [], run, className: mainClass.name };
}
