// Java-compatible number formatting: Double.toString, Float.toString and java.util.Formatter (printf).

// Shortest decimal digits of a double: { neg, digits: '12345', exp } where value = 0.digits * 10^exp
function shortest(x) {
  const s = Math.abs(x).toExponential(); // shortest round-trip digits, e.g. "1.2345e+4"
  const [mant, e] = s.split('e');
  const digits = mant.replace('.', '').replace(/0+$/, '') || '0';
  return { neg: x < 0 || Object.is(x, -0), digits, exp: Number(e) + 1 };
}

export function doubleToString(x) {
  if (Number.isNaN(x)) return 'NaN';
  if (x === Infinity) return 'Infinity';
  if (x === -Infinity) return '-Infinity';
  if (x === 0) return Object.is(x, -0) ? '-0.0' : '0.0';
  const { neg, digits, exp } = shortest(x);
  const ax = Math.abs(x);
  let out;
  if (ax >= 1e-3 && ax < 1e7) {
    if (exp <= 0) out = '0.' + '0'.repeat(-exp) + digits;
    else if (exp >= digits.length) out = digits + '0'.repeat(exp - digits.length) + '.0';
    else out = digits.slice(0, exp) + '.' + digits.slice(exp);
  } else {
    const m = digits.length > 1 ? digits[0] + '.' + digits.slice(1) : digits + '.0';
    out = m + 'E' + (exp - 1);
  }
  return (neg ? '-' : '') + out;
}

export function floatToString(x) {
  if (Number.isNaN(x) || !Number.isFinite(x) || x === 0) return doubleToString(x);
  // shortest digits that round-trip through float32
  const ax = Math.abs(x);
  let digitsStr = null;
  for (let p = 1; p <= 9; p++) {
    const s = ax.toPrecision(p);
    if (Math.fround(Number(s)) === ax) { digitsStr = s; break; }
  }
  return doubleToString((x < 0 ? -1 : 1) * Number(digitsStr ?? ax));
}

// Round a non-negative decimal (digits/exp form) half-up to `prec` fraction digits. Returns string like "12.35".
function roundHalfUpFixed(x, prec) {
  if (x === 0) return prec > 0 ? '0.' + '0'.repeat(prec) : '0';
  const { digits, exp } = shortest(x);
  // integer string of value * 10^prec, as digit array
  // value = 0.d1d2d3... * 10^exp ; scaled = digits shifted by exp+prec
  const shift = exp + prec; // number of digits before the rounding point
  let intDigits;
  let roundUp = false;
  if (shift <= 0) {
    intDigits = '0';
    roundUp = shift === 0 && Number(digits[0]) >= 5;
  } else if (shift >= digits.length) {
    intDigits = digits + '0'.repeat(shift - digits.length);
  } else {
    intDigits = digits.slice(0, shift);
    roundUp = Number(digits[shift]) >= 5;
  }
  let arr = intDigits.split('').map(Number);
  if (roundUp) {
    let i = arr.length - 1;
    while (i >= 0) { if (arr[i] === 9) { arr[i] = 0; i--; } else { arr[i]++; break; } }
    if (i < 0) arr.unshift(1);
  }
  let s = arr.join('').replace(/^0+(?=\d)/, '');
  if (prec > 0) {
    s = s.padStart(prec + 1, '0');
    s = s.slice(0, s.length - prec) + '.' + s.slice(s.length - prec);
  }
  return s;
}

function sciHalfUp(x, prec, upper) {
  if (x === 0) return (prec > 0 ? '0.' + '0'.repeat(prec) : '0') + (upper ? 'E+00' : 'e+00');
  const { digits, exp } = shortest(x);
  let d = digits.split('').map(Number);
  const keep = prec + 1;
  let e = exp - 1;
  if (d.length > keep) {
    const up = d[keep] >= 5;
    d = d.slice(0, keep);
    if (up) {
      let i = d.length - 1;
      while (i >= 0) { if (d[i] === 9) { d[i] = 0; i--; } else { d[i]++; break; } }
      if (i < 0) { d.unshift(1); d.pop(); e++; }
    }
  }
  while (d.length < keep) d.push(0);
  const mant = d[0] + (prec > 0 ? '.' + d.slice(1).join('') : '');
  const es = (e < 0 ? '-' : '+') + String(Math.abs(e)).padStart(2, '0');
  return mant + (upper ? 'E' : 'e') + es;
}

function groupThousands(intStr) {
  return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export class FormatError extends Error {
  constructor(cls, msg) { super(msg); this.cls = cls; }
}

// args: array of {type, value}. toStr(type, value) converts for %s.
// Returns { text, error } where error is a FormatError thrown after partial output.
export function javaFormat(fmt, args, toStr) {
  let out = '';
  let argi = 0;
  const re = /%(\d+\$)?([-#+ 0,(<]*)?(\d+)?(\.\d+)?([a-zA-Z%])/g;
  let last = 0;
  let m;
  while ((m = re.exec(fmt))) {
    out += fmt.slice(last, m.index);
    last = re.lastIndex;
    const [, argIndex, flagsRaw = '', widthRaw, precRaw, conv] = m;
    const flags = flagsRaw;
    const width = widthRaw ? Number(widthRaw) : 0;
    const prec = precRaw ? Number(precRaw.slice(1)) : null;
    const left = flags.includes('-');
    const pad = (s, numeric) => {
      if (s.length >= width) return s;
      if (left) return s + ' '.repeat(width - s.length);
      if (numeric && flags.includes('0')) {
        const sign = /^[-+ ]/.test(s) ? s[0] : '';
        const body = sign ? s.slice(1) : s;
        return sign + '0'.repeat(width - s.length) + body;
      }
      return ' '.repeat(width - s.length) + s;
    };
    if (conv === 'n') { out += '\n'; continue; }
    if (conv === '%') { out += pad('%', false); continue; }
    if (!'dsSfcbBxXoeEgG'.includes(conv)) {
      return { text: out, error: new FormatError('java.util.UnknownFormatConversionException', `Conversion = '${conv}'`) };
    }
    let arg;
    if (argIndex) arg = args[Number(argIndex.slice(0, -1)) - 1];
    else arg = args[argi++];
    if (arg === undefined) return { text: out, error: new FormatError('java.util.MissingFormatArgumentException', `Format specifier '${m[0]}'`) };
    const { type, value } = arg;
    const boxName = { int: 'Integer', long: 'Long', short: 'Short', byte: 'Byte', double: 'Double', float: 'Float', char: 'Character', boolean: 'Boolean', String: 'String' }[type] || 'Object';
    const bad = () => ({ text: out, error: new FormatError('java.util.IllegalFormatConversionException', `${conv} != java.lang.${boxName}`) });
    const isInt = ['int', 'long', 'short', 'byte'].includes(type);
    const isFloat = type === 'double' || type === 'float';
    switch (conv) {
      case 'd': {
        if (value === null) { out += pad('null', false); break; }
        if (!isInt) return bad();
        let s = String(Math.abs(value));
        if (flags.includes(',')) s = groupThousands(s);
        if (value < 0) s = flags.includes('(') ? '(' + s + ')' : '-' + s;
        else if (flags.includes('+')) s = '+' + s;
        else if (flags.includes(' ')) s = ' ' + s;
        out += pad(s, true);
        break;
      }
      case 'x': case 'X': case 'o': {
        if (!isInt) return bad();
        let v = value;
        if (v < 0) v = type === 'long' ? BigInt.asUintN(64, BigInt(v)) : (v >>> 0);
        let s = v.toString(conv === 'o' ? 8 : 16);
        if (conv === 'X') s = s.toUpperCase();
        out += pad(s, true);
        break;
      }
      case 'f': case 'e': case 'E': case 'g': case 'G': {
        if (value === null) { out += pad('null', false); break; }
        if (!isFloat) return bad();
        let s;
        if (Number.isNaN(value)) s = 'NaN';
        else if (!Number.isFinite(value)) s = (value < 0 ? '-' : flags.includes('+') ? '+' : '') + 'Infinity';
        else {
          const p = prec ?? 6;
          const ax = Math.abs(value);
          if (conv === 'f') {
            s = roundHalfUpFixed(ax, p);
            if (flags.includes(',')) { const [i, f] = s.split('.'); s = groupThousands(i) + (f !== undefined ? '.' + f : ''); }
          } else if (conv === 'e' || conv === 'E') s = sciHalfUp(ax, p, conv === 'E');
          else {
            const pp = p === 0 ? 1 : p;
            if (ax !== 0 && (ax < 1e-4 || ax >= Math.pow(10, pp))) s = sciHalfUp(ax, pp - 1, conv === 'G');
            else { const intLen = ax < 1 ? 1 : Math.floor(Math.log10(ax)) + 1; s = roundHalfUpFixed(ax, Math.max(0, pp - intLen)); }
          }
          const neg = value < 0 || Object.is(value, -0);
          if (neg) s = flags.includes('(') ? '(' + s + ')' : '-' + s;
          else if (flags.includes('+')) s = '+' + s;
          else if (flags.includes(' ')) s = ' ' + s;
        }
        out += pad(s, true);
        break;
      }
      case 'c': {
        if (value === null) { out += pad('null', false); break; }
        if (type !== 'char' && !(isInt && type !== 'long')) return bad();
        out += pad(String.fromCharCode(value), false);
        break;
      }
      case 'b': case 'B': {
        let s = value === null ? 'false' : type === 'boolean' ? String(value) : 'true';
        if (conv === 'B') s = s.toUpperCase();
        out += pad(s, false);
        break;
      }
      case 's': case 'S': {
        let s = toStr(type, value);
        if (prec != null) s = s.slice(0, prec);
        if (conv === 'S') s = s.toUpperCase();
        out += pad(s, false);
        break;
      }
    }
  }
  out += fmt.slice(last);
  return { text: out, error: null };
}
