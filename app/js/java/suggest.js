// Java keyword, API and snippet suggestions for the code editor (keyboards with a mouse/trackpad;
// phones already have their own keyboard suggestions, so this stays off on touch screens).
// Up/Down to choose, Enter or Tab to insert, Esc to close.

const KEYWORDS = ['public', 'private', 'static', 'void', 'int', 'double', 'boolean', 'char', 'long', 'String', 'final',
  'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue', 'return', 'new', 'class',
  'true', 'false', 'null', 'import java.util.Scanner;'];
const API = [
  'System.out.println()', 'System.out.print()', 'System.out.printf()', 'String.format()', 'Scanner',
  'new Scanner(System.in)', 'Integer.parseInt()', 'Double.parseDouble()', 'Integer.MAX_VALUE', 'Integer.MIN_VALUE',
  'Math.max()', 'Math.min()', 'Math.abs()', 'Math.pow()', 'Math.sqrt()', 'Math.round()', 'Math.floor()', 'Math.ceil()', 'Math.random()',
  '.nextInt()', '.nextDouble()', '.next()', '.nextLine()', '.hasNextInt()', '.hasNext()',
  '.length()', '.length', '.charAt()', '.equals()', '.equalsIgnoreCase()', '.substring()', '.indexOf()', '.toUpperCase()',
  '.toLowerCase()', '.trim()', '.contains()', '.startsWith()', '.compareTo()', '.isEmpty()',
];
// type the short name, press Tab: | marks where the cursor goes
const SNIPPETS = {
  sout: 'System.out.println(|);',
  souf: 'System.out.printf("|%n");',
  fori: 'for (int i = 0; i < |; i++) {\n    \n}',
  psvm: 'public static void main(String[] args) {\n    |\n}',
  ifel: 'if (|) {\n    \n} else {\n    \n}',
  whil: 'while (|) {\n    \n}',
};

export function attachSuggestions({ jar, editor, host }) {
  if (matchMedia('(pointer: coarse)').matches) return () => {};
  const box = document.createElement('ul');
  box.className = 'suggest';
  box.setAttribute('role', 'listbox');
  box.id = 'suggest-' + Math.random().toString(36).slice(2, 7);
  box.hidden = true;
  host.appendChild(box);
  let items = [], sel = 0, token = '';

  const indentOf = (text, pos) => { const ls = text.lastIndexOf('\n', pos - 1) + 1; return /^ */.exec(text.slice(ls))[0]; };

  function candidates(tok, text) {
    if (tok.length < 2) return [];
    const out = [];
    if (SNIPPETS[tok]) out.push({ label: tok + ' → ' + SNIPPETS[tok].split('\n')[0].replace('|', '…'), insert: SNIPPETS[tok], snippet: true });
    const dot = tok.lastIndexOf('.');
    const words = new Set();
    // identifiers already in this file (variables, methods)
    for (const m of text.matchAll(/\b[A-Za-z_]\w{2,}\b/g)) words.add(m[0]);
    const pool = [...KEYWORDS, ...API, ...words];
    for (const w of pool) {
      let full = w;
      if (dot >= 0) {
        // "scnr.ne" -> member suggestions like ".nextInt()"
        const member = tok.slice(dot);
        if (w.startsWith('.') && w.startsWith(member) && w !== member) full = tok.slice(0, dot) + w;
        else if (!w.startsWith('.') && w.startsWith(tok) && w !== tok) full = w;
        else continue;
      } else if (w.startsWith('.') || !w.startsWith(tok) || w === tok) continue;
      if (!out.some((o) => o.insert === full)) out.push({ label: full, insert: full });
      if (out.length >= 8) break;
    }
    return out;
  }

  function close() { box.hidden = true; items = []; editor.removeAttribute('aria-activedescendant'); }
  function paint() {
    box.innerHTML = items.map((it, i) => `<li role="option" id="${box.id}-${i}" aria-selected="${i === sel}" data-i="${i}">${it.snippet ? '<span class="snip">snippet</span>' : ''}${it.label.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</li>`).join('');
    editor.setAttribute('aria-activedescendant', `${box.id}-${sel}`);
  }
  function place() {
    const s = window.getSelection();
    if (!s.rangeCount) return;
    const r = s.getRangeAt(0).cloneRange();
    r.collapse(true);
    let rect = r.getClientRects()[0];
    if (!rect) { const span = document.createElement('span'); span.textContent = '​'; r.insertNode(span); rect = span.getBoundingClientRect(); span.remove(); }
    const h = host.getBoundingClientRect();
    box.style.left = Math.max(4, Math.min(rect.left - h.left + host.scrollLeft, host.scrollLeft + h.width - 260)) + 'px';
    box.style.top = (rect.bottom - h.top + host.scrollTop + 4) + 'px';
  }
  function update() {
    const text = jar.toString();
    const pos = jar.save().start;
    const m = /[A-Za-z_.][\w.]*$/.exec(text.slice(0, pos));
    token = m ? m[0] : '';
    const after = text[pos];
    if (!token || (after && /\w/.test(after))) return close();
    items = candidates(token, text);
    sel = 0;
    if (!items.length) return close();
    box.hidden = false;
    paint();
    place();
  }
  function accept(i = sel) {
    const it = items[i];
    if (!it) return;
    const text = jar.toString();
    const pos = jar.save().start;
    const start = pos - token.length;
    const ind = indentOf(text, start);
    let ins = it.insert.replace(/\n/g, '\n' + ind);
    let caret = ins.indexOf('|');
    ins = ins.replace('|', '');
    if (caret < 0) caret = ins.endsWith('()') ? ins.length - 1 : ins.length; // inside the brackets of a call
    jar.updateCode(text.slice(0, start) + ins + text.slice(pos));
    jar.restore({ start: start + caret, end: start + caret });
    close();
    editor.focus();
  }

  const onKeyCapture = (ev) => {
    if (box.hidden) return;
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { sel = (sel + (ev.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length; paint(); }
    else if (ev.key === 'Enter' || ev.key === 'Tab') accept();
    else if (ev.key === 'Escape') close();
    else return;
    ev.preventDefault();
    ev.stopPropagation();
  };
  const onKeyUp = (ev) => {
    if (['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape', 'Shift', 'Control', 'Meta', 'Alt'].includes(ev.key)) return;
    if (ev.key.length === 1 || ev.key === 'Backspace') update(); else close();
  };
  host.addEventListener('keydown', onKeyCapture, true);
  editor.addEventListener('keyup', onKeyUp);
  editor.addEventListener('blur', () => setTimeout(close, 150));
  box.addEventListener('mousedown', (ev) => { const li = ev.target.closest('[data-i]'); if (li) { ev.preventDefault(); accept(Number(li.dataset.i)); } });
  return () => { host.removeEventListener('keydown', onKeyCapture, true); box.remove(); };
}
