// The Java code editor used in practice and in exams (CodeMirror 6, bundled in vendor/codemirror.js).
// It behaves like the editors on LeetCode-style sites: line numbers, syntax colours, auto-indent,
// matching brackets, Tab to indent, Ctrl/Cmd+Z and Shift+Ctrl/Cmd+Z, Ctrl/Cmd+/ to comment out, and
// selection and cursor keys that work the same as everywhere else on Mac, Windows and iPad.
// Practice adds suggestions as you type and Find (Ctrl/Cmd+F); exams leave both out.
import {
  EditorState, Compartment, StateEffect, StateField, RangeSetBuilder,
  EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, dropCursor,
  rectangularSelection, highlightSpecialChars, Decoration, GutterMarker, gutterLineClass,
  defaultKeymap, history, historyKeymap, indentWithTab,
  indentOnInput, bracketMatching, syntaxHighlighting, HighlightStyle, indentUnit,
  closeBrackets, closeBracketsKeymap, autocompletion, completionKeymap, snippetCompletion,
  searchKeymap, highlightSelectionMatches, java, tags as t,
} from '../../vendor/codemirror.js';

// colours come from CSS classes (light and dark themes in app.css)
const javaHighlight = HighlightStyle.define([
  { tag: [t.keyword, t.modifier, t.controlKeyword, t.operatorKeyword, t.definitionKeyword], class: 'tok-kw' },
  { tag: [t.typeName, t.className, t.standard(t.typeName)], class: 'tok-type' },
  { tag: [t.string, t.special(t.string), t.character], class: 'tok-str' },
  { tag: [t.number, t.bool, t.null], class: 'tok-num' },
  { tag: [t.lineComment, t.blockComment, t.docComment, t.comment], class: 'tok-com' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], class: 'tok-fn' },
  { tag: [t.annotation, t.meta], class: 'tok-meta' },
]);

// ---------- compile errors: red line and red line number, cleared as soon as the code changes
const setErrors = StateEffect.define();
const errorField = StateField.define({
  create: () => new Set(),
  update(lines, tr) {
    for (const e of tr.effects) if (e.is(setErrors)) return new Set(e.value);
    return tr.docChanged && lines.size ? new Set() : lines;
  },
});
const errLineDeco = Decoration.line({ class: 'cm-errline' });
const errLines = EditorView.decorations.compute([errorField, 'doc'], (state) => {
  const b = new RangeSetBuilder();
  const lines = [...state.field(errorField)].filter((n) => n >= 1 && n <= state.doc.lines).sort((x, y) => x - y);
  for (const n of lines) { const l = state.doc.line(n); b.add(l.from, l.from, errLineDeco); }
  return b.finish();
});
const errMarker = new (class extends GutterMarker { constructor() { super(); this.elementClass = 'cm-errgutter'; } })();
const errGutter = gutterLineClass.compute([errorField, 'doc'], (state) => {
  const b = new RangeSetBuilder();
  const lines = [...state.field(errorField)].filter((n) => n >= 1 && n <= state.doc.lines).sort((x, y) => x - y);
  for (const n of lines) { const l = state.doc.line(n); b.add(l.from, l.from, errMarker); }
  return b.finish();
});

// ---------- suggestions (practice only)
const KEYWORDS = ['public', 'private', 'static', 'void', 'int', 'double', 'boolean', 'char', 'long', 'String', 'final',
  'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue', 'return', 'new', 'class', 'true', 'false', 'null'];
const STATIC = ['System.out.println()', 'System.out.print()', 'System.out.printf()', 'String.format()', 'String.valueOf()',
  'Integer.parseInt()', 'Double.parseDouble()', 'Integer.MAX_VALUE', 'Integer.MIN_VALUE', 'Arrays.toString()', 'Arrays.sort()',
  'Math.max()', 'Math.min()', 'Math.abs()', 'Math.pow()', 'Math.sqrt()', 'Math.round()', 'Math.floor()', 'Math.ceil()', 'Math.random()', 'Math.PI'];
const MEMBERS = ['nextInt()', 'nextDouble()', 'next()', 'nextLine()', 'nextBoolean()', 'hasNextInt()', 'hasNext()', 'hasNextLine()',
  'length()', 'length', 'charAt()', 'equals()', 'equalsIgnoreCase()', 'substring()', 'indexOf()', 'lastIndexOf()', 'toUpperCase()',
  'toLowerCase()', 'trim()', 'contains()', 'startsWith()', 'endsWith()', 'compareTo()', 'isEmpty()', 'replace()', 'split()'];
const SNIPPETS = [
  ['sout', 'System.out.println(${});', 'System.out.println(…);'],
  ['souf', 'System.out.printf("${}%n");', 'System.out.printf("…%n");'],
  ['fori', 'for (int i = 0; i < ${n}; i++) {\n\t${}\n}', 'for loop with i'],
  ['whil', 'while (${condition}) {\n\t${}\n}', 'while loop'],
  ['ifel', 'if (${condition}) {\n\t${}\n} else {\n\t\n}', 'if / else'],
  ['psvm', 'public static void main(String[] args) {\n\t${}\n}', 'main method'],
  ['scan', 'Scanner ${scnr} = new Scanner(System.in);', 'new Scanner(System.in)'],
];
const call = (label, type, from) => (label.endsWith('()') ? snippetCompletion(label.slice(0, -2) + '(${})', { label, type }) : { label, type });
function javaCompletions(context) {
  const word = context.matchBefore(/[A-Za-z_][\w.]*/);
  if (!word || (word.text.length < 2 && !context.explicit)) return null;
  const text = word.text, dot = text.lastIndexOf('.');
  if (dot >= 0) {
    const head = text.slice(0, dot + 1);
    const statics = STATIC.filter((s) => s.startsWith(head)).map((s) => call(s.slice(head.length), 'function'));
    const options = statics.length ? statics : MEMBERS.map((m) => call(m, m.endsWith('()') ? 'method' : 'property'));
    return { from: word.from + dot + 1, options, validFor: /^\w*$/ };
  }
  const own = new Set();
  const doc = context.state.doc.toString();
  for (const m of doc.matchAll(/\b[A-Za-z_]\w{2,}\b/g)) if (m.index + m[0].length !== word.to) own.add(m[0]);
  const options = [
    ...SNIPPETS.map(([label, tpl, detail]) => snippetCompletion(tpl, { label, detail, type: 'text', boost: 2 })),
    ...KEYWORDS.map((k) => ({ label: k, type: 'keyword' })),
    ...STATIC.map((s) => call(s, 'function')),
    ...[...own].filter((w) => !KEYWORDS.includes(w)).map((w) => ({ label: w, type: 'variable', boost: -1 })),
  ];
  return { from: word.from, options, validFor: /^[\w]*$/ };
}

// ---------- look
const look = EditorView.theme({
  '&': { height: '100%', fontSize: 'var(--code-user, var(--code-size, 14px))', backgroundColor: 'var(--surface)', color: 'var(--ink)' },
  '.cm-scroller': { fontFamily: 'var(--mono)', lineHeight: '1.6', overflow: 'auto' },
  '.cm-content': { padding: '10px 0 40px', caretColor: 'var(--ink)' },
  '.cm-gutters': { backgroundColor: 'var(--surface-2)', color: 'var(--muted)', borderRight: '1px solid var(--line)' },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 10px 0 12px', minWidth: '2.6em' },
  '.cm-activeLine': { backgroundColor: 'var(--code-active, rgba(120,130,160,.08))' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--ink)', fontWeight: '700' },
  '&.cm-focused': { outline: 'none' },
  '&.cm-focused .cm-cursor': { borderLeftColor: 'var(--ink)', borderLeftWidth: '2px' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': { backgroundColor: 'var(--code-sel, rgba(60,110,230,.25)) !important' },
  '.cm-matchingBracket': { backgroundColor: 'var(--code-match, rgba(60,160,90,.22))', outline: '1px solid var(--code-match-line, rgba(60,160,90,.6))' },
  '.cm-errline': { backgroundColor: 'var(--bad-soft)' },
  '.cm-errgutter': { color: 'var(--bad) !important', fontWeight: '700' },
  '.cm-tooltip.cm-tooltip-autocomplete': { border: '1px solid var(--line-strong)', backgroundColor: 'var(--surface)', borderRadius: '8px', overflow: 'hidden' },
  '.cm-tooltip-autocomplete > ul > li': { padding: '3px 10px !important', fontFamily: 'var(--mono)' },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: 'var(--accent-soft)', color: 'var(--ink)' },
  '.cm-completionDetail': { color: 'var(--muted)', fontStyle: 'normal', marginLeft: '.6em' },
  '.cm-panels': { backgroundColor: 'var(--surface-2)', color: 'var(--ink)' },
});

export function createCodeEditor(parent, { doc = '', exam = false, label = 'Java code', onChange, onRun, onTest } = {}) {
  const shortcuts = [];
  if (onTest) shortcuts.push({ key: 'Mod-Enter', run: () => { onTest(); return true; } });
  if (onRun) shortcuts.push({ key: 'Shift-Mod-Enter', run: () => { onRun(); return true; } });
  const extensions = [
    lineNumbers(), highlightActiveLineGutter(), highlightActiveLine(), highlightSpecialChars(), history(),
    drawSelection(), dropCursor(), rectangularSelection(), indentOnInput(), bracketMatching(), closeBrackets(),
    EditorState.tabSize.of(4), indentUnit.of('    '), java(), syntaxHighlighting(javaHighlight), look, EditorView.lineWrapping,
    errorField, errLines, errGutter,
    EditorView.contentAttributes.of({ tabindex: '0', 'aria-label': label, autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', 'data-editor': '' }),
    keymap.of([...shortcuts, ...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab,
      ...(exam ? [] : [...searchKeymap, ...completionKeymap])]),
    EditorView.updateListener.of((u) => { if (u.docChanged) onChange?.(u.state.doc.toString()); }),
  ];
  if (!exam) extensions.push(highlightSelectionMatches(), autocompletion({ override: [javaCompletions], icons: false, activateOnTyping: !matchMedia('(pointer: coarse)').matches }));
  const view = new EditorView({ state: EditorState.create({ doc, extensions }), parent });
  const lineStart = (n) => view.state.doc.line(Math.max(1, Math.min(view.state.doc.lines, n))).from;
  return {
    view,
    getValue: () => view.state.doc.toString(),
    setValue(text) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
    },
    setErrorLines(lines) { view.dispatch({ effects: setErrors.of([...(lines || [])]) }); },
    focus: () => view.focus(),
    goToLine(n) {
      const pos = lineStart(n);
      view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: 'center' }) });
      view.focus();
    },
    currentLine: () => view.state.doc.lineAt(view.state.selection.main.head).number,
    destroy: () => view.destroy(),
  };
}

// Code text size, remembered on this device (A− / A+ buttons)
const SIZE_KEY = 'qp1:code-size';
export function codeSize(step = 0) {
  let n = 14;
  try { n = Number(localStorage.getItem(SIZE_KEY)) || 14; } catch {}
  if (step) { n = Math.max(11, Math.min(24, n + step)); try { localStorage.setItem(SIZE_KEY, String(n)); } catch {} }
  document.documentElement.style.setProperty('--code-user', n + 'px');
  return n;
}
