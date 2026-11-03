// Recursive-descent parser for the Java subset used in intro courses.
// Produces a plain-object AST. Syntax errors use javac's wording where possible.
import { tokenize, CompileError } from './lexer.js';

const PRIMS = new Set(['int', 'double', 'boolean', 'char', 'long', 'float', 'byte', 'short', 'void']);
const ASSIGN_OPS = new Set(['=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>=', '>>>=']);
const BIN_PREC = {
  '||': 3, '&&': 4, '|': 5, '^': 6, '&': 7, '==': 8, '!=': 8,
  '<': 9, '>': 9, '<=': 9, '>=': 9, instanceof: 9,
  '<<': 10, '>>': 10, '>>>': 10, '+': 11, '-': 11, '*': 12, '/': 12, '%': 12,
};
const MODIFIERS = new Set(['public', 'private', 'protected', 'static', 'final', 'abstract', 'synchronized', 'native', 'transient', 'volatile', 'strictfp']);

export function parse(src) {
  const toks = tokenize(src);
  let p = 0;
  const peek = (k = 0) => toks[Math.min(p + k, toks.length - 1)];
  const prev = () => toks[Math.max(0, p - 1)];
  const next = () => toks[p++];
  const is = (v, k = 0) => { const t = peek(k); return (t.t === 'op' || t.t === 'kw') && t.v === v; };
  const isId = (k = 0) => peek(k).t === 'id';
  const accept = (v) => { if (is(v)) { p++; return true; } return false; };
  const fail = (msg, tok = peek()) => { throw new CompileError(msg, tok.line, tok.col); };
  const failAfterPrev = (msg) => {
    const t = prev();
    const len = String(t.raw ?? (t.t === 'string' ? JSON.stringify(t.v) : t.v)).length;
    throw new CompileError(msg, t.line, t.col + len);
  };
  // javac reports "X expected" at the end of the previous token
  const expect = (v) => {
    if (is(v)) return next();
    if (peek().t === 'eof') fail('reached end of file while parsing');
    failAfterPrev(/^[a-z]+$/.test(v) ? `${v} expected` : `'${v}' expected`);
  };
  const ident = () => {
    if (isId()) return next();
    if (peek().t === 'eof') fail('reached end of file while parsing');
    failAfterPrev('<identifier> expected');
  };

  // ---------- types ----------
  const isPrimKw = (k = 0) => peek(k).t === 'kw' && PRIMS.has(peek(k).v);
  function parseType(allowVoid = false) {
    const t = peek();
    let base;
    if (isPrimKw()) {
      base = next().v;
      if (base === 'void' && !allowVoid) fail("'void' type not allowed here", t);
    } else if (isId()) {
      base = next().v;
      // qualified names like java.util.Scanner
      while (is('.') && isId(1)) { next(); base = next().v; }
      if (is('<')) fail('generic types (like ArrayList<Integer>) are not supported in the browser runner', peek());
    } else fail('<identifier> expected');
    let dims = 0;
    while (is('[') && is(']', 1)) { next(); next(); dims++; }
    return { base, dims, line: t.line, col: t.col };
  }
  // Is a local variable declaration starting here?
  function looksLikeDecl() {
    if (is('final')) return true;
    if (isPrimKw() && !is('.', 1)) return true;
    if (isId() && peek().v === 'var' && isId(1)) return true;
    if (isId()) {
      let k = 1;
      while (is('.', k) && peek(k + 1).t === 'id') k += 2; // qualified
      if (is('<', k)) return isId(k + 1) && (is('>', k + 2) || is(',', k + 2));
      if (peek(k).t === 'id') return true;
      if (is('[', k) && is(']', k + 1)) return true;
    }
    return false;
  }

  // ---------- compilation unit ----------
  function compilationUnit() {
    const unit = { k: 'Unit', classes: [], imports: [] };
    if (is('package')) { next(); while (!is(';') && peek().t !== 'eof') next(); expect(';'); }
    while (is('import')) {
      const t = next();
      let name = '';
      if (is('static')) { next(); name = 'static '; }
      name += ident().v;
      while (accept('.')) { if (accept('*')) { name += '.*'; break; } name += '.' + ident().v; }
      expect(';');
      unit.imports.push({ name, line: t.line });
    }
    while (peek().t !== 'eof') {
      if (accept(';')) continue;
      const mods = modifiers();
      if (is('class')) unit.classes.push(classDecl(mods));
      else if (is('interface') || is('enum') || (isId() && peek().v === 'record'))
        fail(`${peek().v} declarations are not supported in the browser runner`);
      else fail('class, interface, enum, or record expected');
    }
    if (!unit.classes.length) throw new CompileError('No class found. Your code needs a class, like: public class Main { ... }', 1, 1);
    return unit;
  }
  function modifiers() {
    const mods = new Set();
    while (peek().t === 'kw' && MODIFIERS.has(peek().v) || is('@')) {
      if (accept('@')) { ident(); if (accept('(')) { let depth = 1; while (depth && peek().t !== 'eof') { if (is('(')) depth++; if (is(')')) depth--; next(); } } continue; }
      mods.add(next().v);
    }
    return mods;
  }
  function classDecl(mods) {
    const t = expect('class');
    const name = ident().v;
    if (is('extends') || is('implements')) fail('extends and implements are not supported in the browser runner');
    expect('{');
    const members = [];
    while (!is('}')) {
      if (peek().t === 'eof') fail('reached end of file while parsing');
      if (accept(';')) continue;
      const mt = peek();
      const mm = modifiers();
      if (is('class')) { members.push(classDecl(mm)); continue; }
      const STMT_KW = ['if', 'for', 'while', 'do', 'return', 'switch', 'break', 'continue', 'else', 'case', 'default', 'try', 'throw', 'new', 'this', 'true', 'false', 'null'];
      if ((peek().t === 'kw' && STMT_KW.includes(peek().v)) || ['int', 'double', 'char', 'string'].includes(peek().t) && !isPrimKw() || (peek().t === 'op' && !is('<') && !is('@')))
        fail('illegal start of type');
      if (is('{')) fail('initializer blocks are not supported in the browser runner');
      if (isId() && peek().v === name && is('(', 1)) fail('constructors are not supported in the browser runner (use static methods)', mt);
      const type = parseType(true);
      const nameTok = ident();
      if (is('(')) {
        next();
        const params = [];
        if (!is(')')) {
          do {
            const pm = modifiers();
            const ptype = parseType();
            if (accept('...')) ptype.dims++;
            const pname = ident();
            let extra = 0;
            while (is('[') && is(']', 1)) { next(); next(); extra++; }
            params.push({ type: { ...ptype, dims: ptype.dims + extra }, name: pname.v, line: pname.line, col: pname.col, final: pm.has('final') });
          } while (accept(','));
        }
        expect(')');
        if (is('throws')) { next(); ident(); while (accept(',')) ident(); }
        let body = null;
        if (accept(';')) body = null;
        else if (is('{')) body = block();
        else failAfterPrev("';' expected"); // javac: a method header must be followed by a body or ;
        members.push({ k: 'Method', mods: mm, ret: type, name: nameTok.v, params, body, line: nameTok.line, col: nameTok.col });
      } else {
        if (type.base === 'void') fail("'(' expected", peek());
        p--; // let declarators() read the field name
        const decls = declarators(type);
        expect(';');
        members.push({ k: 'Field', mods: mm, type, decls, line: mt.line });
      }
    }
    expect('}');
    return { k: 'Class', name, mods, members, line: t.line };
  }
  function declarators(type) {
    const decls = [];
    do {
      const nt = ident();
      let dims = type.dims;
      while (is('[') && is(']', 1)) { next(); next(); dims++; }
      if (is('[')) fail(`']' expected`, peek(1));
      let init = null;
      if (accept('=')) init = is('{') ? arrayInit() : expr();
      decls.push({ name: nt.v, type: { ...type, dims }, init, line: nt.line, col: nt.col });
    } while (accept(','));
    return decls;
  }
  function arrayInit() {
    const t = expect('{');
    const elements = [];
    while (!is('}')) {
      elements.push(is('{') ? arrayInit() : expr());
      if (!accept(',')) break;
    }
    expect('}');
    return { k: 'ArrayInit', elements, line: t.line, col: t.col };
  }

  // ---------- statements ----------
  function block() {
    const t = expect('{');
    const stmts = [];
    while (!is('}')) {
      if (peek().t === 'eof') fail('reached end of file while parsing');
      stmts.push(blockStatement());
    }
    const end = expect('}');
    return { k: 'Block', stmts, line: t.line, col: t.col, endLine: end.line };
  }
  function blockStatement() {
    if (is('class')) fail('local classes are not supported in the browser runner');
    if (looksLikeDecl()) {
      const t = peek();
      const fin = accept('final');
      let type;
      if (isId() && peek().v === 'var' && isId(1)) { next(); type = { base: 'var', dims: 0, line: t.line, col: t.col }; }
      else type = parseType();
      const decls = declarators(type);
      expect(';');
      return { k: 'Local', type, decls, final: fin, line: t.line, col: t.col };
    }
    return statement();
  }
  function statement() {
    const t = peek();
    if (is('{')) return block();
    if (looksLikeDecl() && !(isId() && is('.', 1))) fail('variable declaration not allowed here');
    if (accept(';')) return { k: 'Empty', line: t.line, col: t.col };
    if (isId() && is(':', 1)) {
      const label = next().v; next();
      return { k: 'Labeled', label, body: statement(), line: t.line, col: t.col };
    }
    if (t.t === 'kw') {
      switch (t.v) {
        case 'if': {
          next(); expect('(');
          const cond = expr(); expect(')');
          const then = statement();
          let els = null;
          if (accept('else')) els = statement();
          return { k: 'If', cond, then, else: els, line: t.line, col: t.col };
        }
        case 'else': fail("'else' without 'if'");
        // eslint-disable-next-line no-fallthrough
        case 'while': {
          next(); expect('(');
          const cond = expr(); expect(')');
          return { k: 'While', cond, body: statement(), line: t.line, col: t.col };
        }
        case 'do': {
          next();
          const body = statement();
          expect('while'); expect('(');
          const cond = expr(); expect(')'); expect(';');
          return { k: 'DoWhile', body, cond, line: t.line, col: t.col };
        }
        case 'for': return forStatement();
        case 'switch': return switchStatement();
        case 'break': { next(); const label = isId() ? next().v : null; expect(';'); return { k: 'Break', label, line: t.line, col: t.col }; }
        case 'continue': { next(); const label = isId() ? next().v : null; expect(';'); return { k: 'Continue', label, line: t.line, col: t.col }; }
        case 'return': {
          next();
          const e = is(';') ? null : expr();
          expect(';');
          return { k: 'Return', expr: e, line: t.line, col: t.col };
        }
        case 'throw': { next(); const e = expr(); expect(';'); return { k: 'Throw', expr: e, line: t.line, col: t.col }; }
        case 'try': fail('try/catch is not supported in the browser runner yet');
        // eslint-disable-next-line no-fallthrough
        case 'case': case 'default': fail('orphaned ' + t.v);
        // eslint-disable-next-line no-fallthrough
        default: break;
      }
    }
    const e = expr();
    const okStmt = e.k === 'Assign' || e.k === 'IncDec' || e.k === 'Call' || e.k === 'New';
    if (!okStmt) {
      if (is(';')) throw new CompileError('not a statement', e.line, e.col);
      failAfterPrev("';' expected");
    }
    expect(';');
    return { k: 'Expr', expr: e, line: t.line, col: t.col };
  }
  function forStatement() {
    const t = next(); expect('(');
    // enhanced for
    if (looksLikeDecl()) {
      const save = p;
      accept('final');
      const type = parseType();
      if (isId() && is(':', 1)) {
        const name = next(); next();
        const iter = expr(); expect(')');
        return { k: 'ForEach', type, name: name.v, nameLine: name.line, nameCol: name.col, expr: iter, body: statement(), line: t.line, col: t.col };
      }
      p = save;
    }
    let init = [];
    if (!is(';')) {
      if (looksLikeDecl()) {
        const it = peek();
        const fin = accept('final');
        const type = parseType();
        init = [{ k: 'Local', type, decls: declarators(type), final: fin, line: it.line, col: it.col }];
      } else {
        do { const e = expr(); init.push({ k: 'Expr', expr: e, line: e.line, col: e.col }); } while (accept(','));
      }
    }
    expect(';');
    const cond = is(';') ? null : expr();
    expect(';');
    const update = [];
    if (!is(')')) { do update.push(expr()); while (accept(',')); }
    expect(')');
    return { k: 'For', init, cond, update, body: statement(), line: t.line, col: t.col };
  }
  function switchStatement() {
    const t = next(); expect('(');
    const selector = expr(); expect(')'); expect('{');
    const groups = [];
    let arrow = null;
    while (!is('}')) {
      if (peek().t === 'eof') fail('reached end of file while parsing');
      const gt = peek();
      const labels = [];
      // one or more labels
      while (is('case') || is('default')) {
        const lt = next();
        if (lt.v === 'default') labels.push({ def: true, line: lt.line, col: lt.col });
        else {
          do labels.push({ expr: ternary(), line: lt.line, col: lt.col }); while (accept(','));
        }
        if (is('->')) { if (arrow === false) fail('different case kinds used in the switch'); arrow = true; next(); break; }
        if (arrow === true) fail("'->' expected");
        arrow = false;
        expect(':');
      }
      if (!labels.length) fail("'case', 'default', or '}' expected");
      const stmts = [];
      if (arrow) {
        if (is('{')) stmts.push(block());
        else if (is('throw')) stmts.push(statement());
        else { const e = expr(); expect(';'); stmts.push({ k: 'Expr', expr: e, line: e.line, col: e.col, arrowExpr: true }); }
      } else {
        while (!is('case') && !is('default') && !is('}')) {
          if (peek().t === 'eof') fail('reached end of file while parsing');
          stmts.push(blockStatement());
        }
      }
      groups.push({ labels, stmts, line: gt.line, col: gt.col });
    }
    expect('}');
    return { k: 'Switch', selector, groups, arrow: !!arrow, line: t.line, col: t.col };
  }

  // ---------- expressions ----------
  function expr() {
    const lhs = ternary();
    if (peek().t === 'op' && ASSIGN_OPS.has(peek().v)) {
      const op = next();
      if (!(lhs.k === 'Name' || lhs.k === 'Index' || lhs.k === 'Field')) throw new CompileError('unexpected type\n  required: variable\n  found:    value', lhs.line, lhs.col);
      const value = is('{') && op.v === '=' ? fail('illegal start of expression') : expr();
      return { k: 'Assign', op: op.v, target: lhs, value, line: lhs.line, col: lhs.col, opLine: op.line, opCol: op.col };
    }
    return lhs;
  }
  function ternary() {
    const cond = binary(3);
    if (is('?')) {
      const q = next();
      const a = expr();
      expect(':');
      const b = is('(') || !isLambdaStart() ? ternaryOrAssign() : expr();
      return { k: 'Cond', cond, a, b, line: cond.line, col: cond.col, qLine: q.line };
    }
    return cond;
  }
  function ternaryOrAssign() { return ternary(); }
  function isLambdaStart() { return false; }
  function binary(minPrec) {
    let left = unary();
    while (true) {
      const t = peek();
      const op = t.t === 'op' || (t.t === 'kw' && t.v === 'instanceof') ? t.v : null;
      const prec = op != null ? BIN_PREC[op] : undefined;
      if (prec === undefined || prec < minPrec) break;
      next();
      if (op === 'instanceof') { const type = parseType(); left = { k: 'InstanceOf', expr: left, type, line: left.line, col: left.col }; continue; }
      const right = binary(prec + 1);
      left = { k: 'Binary', op, l: left, r: right, line: left.line, col: left.col, opLine: t.line, opCol: t.col };
    }
    return left;
  }
  function unary() {
    const t = peek();
    if (t.t === 'op') {
      if (t.v === '++' || t.v === '--') {
        next();
        const e = unary();
        return { k: 'IncDec', op: t.v, prefix: true, expr: e, line: t.line, col: t.col };
      }
      if (t.v === '-' && (peek(1).t === 'int' || peek(1).t === 'long') && !peek(1).hex) {
        // allow -2147483648
        next();
        const lit = next();
        const lim = lit.t === 'int' ? 2147483648 : 9223372036854775808;
        if (lit.v > lim) throw new CompileError('integer number too large', lit.line, lit.col);
        return postfix({ k: 'Literal', type: lit.t, value: -lit.v, line: t.line, col: t.col });
      }
      if (t.v === '+' || t.v === '-' || t.v === '!' || t.v === '~') {
        next();
        return { k: 'Unary', op: t.v, expr: unary(), line: t.line, col: t.col };
      }
      if (t.v === '(') {
        // cast?
        if (isPrimKw(1) && peek(1).v !== 'void') {
          let k = 2;
          while (is('[', k) && is(']', k + 1)) k += 2;
          if (is(')', k)) {
            next();
            const type = parseType();
            expect(')');
            return { k: 'Cast', type, expr: unary(), line: t.line, col: t.col };
          }
        }
        if (isId(1)) {
          let k = 2;
          while (is('.', k) && isId(k + 1)) k += 2;
          while (is('[', k) && is(']', k + 1)) k += 2;
          const after = peek(k + 1);
          if (is(')', k) && (after.t === 'id' || after.t === 'string' || after.t === 'char' || after.t === 'int' || after.t === 'double' || (after.t === 'op' && (after.v === '(' || after.v === '!' || after.v === '~')) || (after.t === 'kw' && ['new', 'this', 'true', 'false', 'null'].includes(after.v)))) {
            next();
            const type = parseType();
            expect(')');
            return { k: 'Cast', type, expr: unary(), line: t.line, col: t.col };
          }
        }
      }
    }
    return postfix(primary());
  }
  function postfix(e) {
    while (true) {
      const t = peek();
      if (is('.')) {
        next();
        if (is('class')) fail('class literals are not supported in the browser runner');
        const name = ident();
        if (is('(')) {
          const args = argList();
          e = { k: 'Call', target: e, name: name.v, args, line: e.line, col: e.col, nameLine: name.line, nameCol: name.col };
        } else e = { k: 'Field', obj: e, name: name.v, line: e.line, col: e.col, nameLine: name.line, nameCol: name.col };
      } else if (is('[')) {
        next();
        const index = expr();
        expect(']');
        e = { k: 'Index', arr: e, index, line: e.line, col: e.col, bLine: t.line, bCol: t.col };
      } else if (is('++') || is('--')) {
        next();
        e = { k: 'IncDec', op: t.v, prefix: false, expr: e, line: e.line, col: e.col };
      } else if (is('::')) fail('method references are not supported in the browser runner');
      else break;
    }
    return e;
  }
  function argList() {
    expect('(');
    const args = [];
    if (!is(')')) { do args.push(expr()); while (accept(',')); }
    expect(')');
    return args;
  }
  function primary() {
    const t = peek();
    switch (t.t) {
      case 'int':
        next();
        if (!t.hex && t.v > 2147483647) throw new CompileError('integer number too large', t.line, t.col);
        return { k: 'Literal', type: 'int', value: t.hex ? (t.v | 0) : t.v, line: t.line, col: t.col };
      case 'long': next(); return { k: 'Literal', type: 'long', value: t.v, line: t.line, col: t.col };
      case 'double': next(); return { k: 'Literal', type: 'double', value: t.v, line: t.line, col: t.col };
      case 'float': next(); return { k: 'Literal', type: 'float', value: t.v, line: t.line, col: t.col };
      case 'char': next(); return { k: 'Literal', type: 'char', value: t.v, line: t.line, col: t.col };
      case 'string': next(); return { k: 'Literal', type: 'String', value: t.v, line: t.line, col: t.col };
      case 'id': {
        next();
        if (is('(')) {
          const args = argList();
          return { k: 'Call', target: null, name: t.v, args, line: t.line, col: t.col, nameLine: t.line, nameCol: t.col };
        }
        if (is('->')) fail('lambda expressions are not supported in the browser runner');
        return { k: 'Name', name: t.v, line: t.line, col: t.col };
      }
      case 'kw':
        if (t.v === 'true' || t.v === 'false') { next(); return { k: 'Literal', type: 'boolean', value: t.v === 'true', line: t.line, col: t.col }; }
        if (t.v === 'null') { next(); return { k: 'Literal', type: 'null', value: null, line: t.line, col: t.col }; }
        if (t.v === 'new') return creator();
        if (t.v === 'this' || t.v === 'super') fail(`'${t.v}' is not supported in the browser runner (use static methods)`);
        if (PRIMS.has(t.v)) {
          // e.g. int.class or a misplaced declaration
          fail('not a statement');
        }
        if (t.v === 'switch') fail('switch expressions are not supported in the browser runner (use a switch statement)');
        break;
      case 'op':
        if (t.v === '(') {
          next();
          const e = expr();
          expect(')');
          return { ...e, paren: true };
        }
        break;
      case 'eof': fail('reached end of file while parsing');
    }
    fail('illegal start of expression');
  }
  function creator() {
    const t = next(); // new
    const tt = peek();
    let base;
    if (isPrimKw()) base = next().v;
    else if (isId()) { base = next().v; while (is('.') && isId(1)) { next(); base = next().v; } }
    else fail('<identifier> expected');
    if (is('<')) fail('generic types (like ArrayList<Integer>) are not supported in the browser runner');
    if (is('[')) {
      const dims = [];
      let extra = 0;
      while (is('[')) {
        next();
        if (is(']')) { next(); extra++; }
        else { if (extra) fail("']' expected"); dims.push(expr()); expect(']'); }
      }
      let init = null;
      if (!dims.length) {
        if (!is('{')) fail('array dimension missing');
        init = arrayInit();
      }
      return { k: 'NewArray', elem: base, dims, extra, init, line: t.line, col: t.col, typeLine: tt.line, typeCol: tt.col };
    }
    if (PRIMS.has(base)) fail("'[' expected");
    const args = argList();
    if (is('{')) fail('anonymous classes are not supported in the browser runner');
    return { k: 'New', type: base, args, line: t.line, col: t.col };
  }

  return compilationUnit();
}
