// Floating scientific calculator with a safe expression evaluator (no eval()).
import { icon, esc } from './ui.js';

const FUNCS = {
  sqrt: Math.sqrt, abs: Math.abs, ln: Math.log, log: Math.log10, exp: Math.exp,
  sin: (x, d) => Math.sin(d ? x * Math.PI / 180 : x), cos: (x, d) => Math.cos(d ? x * Math.PI / 180 : x), tan: (x, d) => Math.tan(d ? x * Math.PI / 180 : x),
  asin: (x, d) => (d ? 180 / Math.PI : 1) * Math.asin(x), acos: (x, d) => (d ? 180 / Math.PI : 1) * Math.acos(x), atan: (x, d) => (d ? 180 / Math.PI : 1) * Math.atan(x),
};
const CONSTS = { pi: Math.PI, 'π': Math.PI, e: Math.E };

export function evaluate(expr, { degrees = false, ans = 0 } = {}) {
  const src = expr.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/√/g, 'sqrt');
  let i = 0;
  const peek = () => { while (src[i] === ' ') i++; return src[i]; };
  const fail = (m) => { throw new Error(m); };

  function number() {
    const m = src.slice(i).match(/^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i);
    if (!m) return null;
    i += m[0].length;
    return parseFloat(m[0]);
  }
  function primary() {
    const c = peek();
    if (c === '(') { i++; const v = expr0(); if (peek() !== ')') fail('Missing )'); i++; return v; }
    const n = number();
    if (n !== null) return n;
    const m = src.slice(i).match(/^[a-zπ]+/i);
    if (m) {
      const name = m[0].toLowerCase();
      i += m[0].length;
      if (name === 'ans') return ans;
      if (name in CONSTS) return CONSTS[name];
      if (name in FUNCS) {
        if (peek() === '(') { i++; const v = expr0(); if (peek() !== ')') fail('Missing )'); i++; return FUNCS[name](v, degrees); }
        return FUNCS[name](unary(), degrees);
      }
      fail(`Unknown: ${name}`);
    }
    fail('Incomplete expression');
  }
  function postfix() {
    let v = primary();
    for (;;) {
      const c = peek();
      if (c === '!') { i++; if (v < 0 || v > 170 || v % 1) fail('Bad factorial'); let r = 1; for (let k = 2; k <= v; k++) r *= k; v = r; }
      else if (c === '%') { i++; v = v / 100; }
      else break;
    }
    return v;
  }
  function power() {
    const b = postfix();
    if (peek() === '^') { i++; return Math.pow(b, unary()); }
    return b;
  }
  function unary() {
    const c = peek();
    if (c === '-') { i++; return -unary(); }
    if (c === '+') { i++; return unary(); }
    return power();
  }
  function term() {
    let v = unary();
    for (;;) {
      const c = peek();
      if (c === '*') { i++; v *= unary(); }
      else if (c === '/') { i++; const d = unary(); v /= d; }
      else if (c && /[\d(a-zπ.]/i.test(c)) v *= unary(); // implicit multiply: 2pi, 3(4)
      else break;
    }
    return v;
  }
  function expr0() {
    let v = term();
    for (;;) {
      const c = peek();
      if (c === '+') { i++; v += term(); }
      else if (c === '-') { i++; v -= term(); }
      else break;
    }
    return v;
  }
  if (!src.trim()) return 0;
  const v = expr0();
  if (peek() !== undefined) fail('Unexpected ' + src[i]);
  if (!isFinite(v)) fail(isNaN(v) ? 'Not a number' : 'Infinity');
  return v;
}

export function formatNum(v) {
  if (Number.isInteger(v)) return String(v);
  const s = Number(v.toPrecision(12)).toString();
  return s;
}

let panel = null;
export function toggleCalculator(force) {
  if (panel && force !== true) { closeCalculator(); return; }
  if (panel) return;
  let degrees = false, ans = 0;
  const history = [];
  panel = document.createElement('div');
  panel.className = 'calc';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Calculator');
  const keys = [
    ['sin(', 'cos(', 'tan(', 'ln(', 'log('],
    ['√(', '^', '(', ')', '÷'],
    ['7', '8', '9', 'π', '×'],
    ['4', '5', '6', '!', '−'],
    ['1', '2', '3', '%', '+'],
    ['0', '.', 'ans', 'C', '='],
  ];
  panel.innerHTML = `
    <div class="calc-head" data-drag>
      <span>Calculator</span>
      <button class="calc-mode" data-mode title="Angle unit">RAD</button>
      <button class="icon-btn small" data-close aria-label="Close calculator">${icon('x')}</button>
    </div>
    <div class="calc-hist" aria-live="polite"></div>
    <input class="calc-input" aria-label="Expression" autocomplete="off" spellcheck="false" placeholder="0">
    <div class="calc-out" aria-live="polite"></div>
    <div class="calc-keys">${keys.flat().map((k) => `<button data-k="${esc(k)}" class="${k === '=' ? 'eq' : /^[\d.]$/.test(k) ? 'num' : ''}">${esc(k)}</button>`).join('')}</div>`;
  document.body.appendChild(panel);
  document.body.classList.add('calc-open');
  // On touch screens use the calculator's own keys instead of popping up the phone keyboard
  const touch = matchMedia('(pointer: coarse)').matches;
  if (touch) panel.querySelector('.calc-input').setAttribute('inputmode', 'none');
  const input = panel.querySelector('.calc-input');
  const out = panel.querySelector('.calc-out');
  const hist = panel.querySelector('.calc-hist');
  const preview = () => {
    try { const v = evaluate(input.value, { degrees, ans }); out.textContent = input.value.trim() ? '= ' + formatNum(v) : ''; out.classList.remove('err'); }
    catch { out.textContent = ''; }
  };
  const run = () => {
    try {
      const v = evaluate(input.value, { degrees, ans });
      history.push(`${input.value} = ${formatNum(v)}`);
      while (history.length > 4) history.shift();
      hist.innerHTML = history.map((h) => `<div>${esc(h)}</div>`).join('');
      ans = v;
      input.value = formatNum(v);
      out.textContent = '';
    } catch (e) { out.textContent = e.message; out.classList.add('err'); }
  };
  panel.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.close !== undefined) return toggleCalculator();
    if (b.dataset.mode !== undefined) { degrees = !degrees; b.textContent = degrees ? 'DEG' : 'RAD'; preview(); return; }
    const k = b.dataset.k;
    if (k === '=') run();
    else if (k === 'C') { input.value = ''; out.textContent = ''; }
    else {
      const s = input.selectionStart ?? input.value.length;
      input.value = input.value.slice(0, s) + k + input.value.slice(input.selectionEnd ?? s);
      input.selectionStart = input.selectionEnd = s + k.length;
      preview();
    }
    if (!touch) input.focus();
  });
  input.addEventListener('input', preview);
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); run(); }
    if (e.key === 'Escape') toggleCalculator();
  });
  // drag
  const head = panel.querySelector('[data-drag]');
  head.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    const r = panel.getBoundingClientRect();
    const dx = e.clientX - r.left, dy = e.clientY - r.top;
    head.setPointerCapture(e.pointerId);
    const move = (ev) => {
      panel.style.left = Math.max(0, Math.min(innerWidth - r.width, ev.clientX - dx)) + 'px';
      panel.style.top = Math.max(0, Math.min(innerHeight - 40, ev.clientY - dy)) + 'px';
      panel.style.right = 'auto'; panel.style.bottom = 'auto';
    };
    const up = () => { head.removeEventListener('pointermove', move); head.removeEventListener('pointerup', up); };
    head.addEventListener('pointermove', move);
    head.addEventListener('pointerup', up);
  });
  if (!touch) input.focus();
}
export const calculatorOpen = () => !!panel;
export function closeCalculator() { if (panel) { panel.remove(); panel = null; } document.body.classList.remove('calc-open'); }
