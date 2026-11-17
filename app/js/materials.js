// Reads the WORDS out of a professor's course files, in the browser. Nothing is uploaded as a file:
// only the text is saved with the class (staff only), labelled by where it came from ("slide 12",
// "page 3"), so everything made from it can say which lecture it is based on.
// Reads: PDF, PowerPoint (.pptx), Word (.docx), text and Markdown. Pictures, diagrams and handwriting
// in slides are not read.

export const MAX_FILE_BYTES = 150 * 1024 * 1024;   // big slide decks are mostly pictures; only their text is kept
export const MAX_FILE_CHARS = 1500000;             // about 250,000 words: more than any one course file
export const ACCEPT = '.pdf,.pptx,.docx,.txt,.md,.markdown';

let jszip = null;
const loadJSZip = () => (globalThis.JSZip ? Promise.resolve(globalThis.JSZip) : (jszip ||= new Promise((res, rej) => {
  const s = document.createElement('script');
  s.src = 'vendor/jszip.min.js';
  s.onload = () => res(globalThis.JSZip);
  s.onerror = () => rej(new Error("Couldn't load the file reader. Check your internet connection and try again."));
  document.head.appendChild(s);
})));

let pdfjs = null;
async function loadPdfjs() {
  if (pdfjs) return pdfjs;
  let lib;
  try { lib = await import('../vendor/pdfjs/pdf.min.js'); }
  catch { throw new Error("Couldn't load the PDF reader. Check your internet connection and try again."); }
  lib.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.js', import.meta.url).href;
  return (pdfjs = lib);
}

// ---------- small text helpers (exported for the tests)
export const xmlText = (s) => String(s)
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&amp;/g, '&');
export const tidy = (s) => String(s).replace(/\u0000/g, '').replace(/[ \t ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
export const countWords = (s) => (String(s).match(/[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu) || []).length;
const attr = (tag, name) => (tag.match(new RegExp(`\\b${name}="([^"]*)"`)) || [])[1] || '';

// paragraphs of a DrawingML text body (slides, notes): <a:p> … <a:t>text</a:t> … </a:p>
export function slideParagraphs(xml) {
  const out = [];
  for (const p of String(xml).split(/<\/a:p>/)) {
    const line = [...p.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>|<a:br\s*\/?>|<a:tab\s*\/?>/g)]
      .map((m) => (m[0].startsWith('<a:br') ? '\n' : m[0].startsWith('<a:tab') ? ' ' : xmlText(m[1]))).join('');
    if (line.trim()) out.push(line.trim());
  }
  return out;
}
// paragraphs of a Word document: <w:p> … <w:t>text</w:t> … </w:p>, with heading paragraphs marked
export function wordParagraphs(xml) {
  const out = [];
  for (const p of String(xml).split(/<\/w:p>/)) {
    const text = [...p.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:br\s*\/?>|<w:tab\s*\/?>|<w:cr\s*\/?>/g)]
      .map((m) => (m[0].startsWith('<w:t>') || m[0].startsWith('<w:t ') ? xmlText(m[1]) : m[0].startsWith('<w:tab') ? ' ' : '\n')).join('').trim();
    if (!text) continue;
    out.push({ text, heading: /<w:pStyle\s[^>]*w:val="(Heading|Title|heading|title)[^"]*"/.test(p) });
  }
  return out;
}

// long text without pages: split at headings (or every ~3,500 characters) so each part can be named
export function splitSections(paras, word = 'section') {
  const parts = [];
  let cur = null;
  const start = (label) => { cur = { label, text: '' }; parts.push(cur); };
  for (const p of paras) {
    if (p.heading) { start(p.text.slice(0, 70)); cur.text = p.text; continue; }
    if (!cur || (cur.auto && cur.text.length > 3500)) { start(`${word} ${parts.filter((x) => x.auto).length + 1}`); cur.auto = true; }
    cur.text += (cur.text ? '\n' : '') + p.text;
  }
  return parts.map(({ label, text }) => ({ label, text }));
}

// ---------- one reader per kind of file
async function readPdf(file) {
  const lib = await loadPdfjs();
  let doc;
  try { doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise; }
  catch (e) { throw new Error(e?.name === 'PasswordException' ? 'This PDF is locked with a password. Save a copy without the password first.' : "This PDF couldn't be opened. Try saving it again as a PDF."); }
  const parts = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const tc = await page.getTextContent();
    parts.push({ label: `page ${n}`, text: tc.items.map((it) => (it.str || '') + (it.hasEOL ? '\n' : ' ')).join('') });
    page.cleanup?.();
  }
  await doc.destroy?.();
  return { kind: 'pdf', unit: 'page', parts };
}

async function readPptx(file) {
  const JSZip = await loadJSZip();
  let zip;
  try { zip = await JSZip.loadAsync(file); } catch { throw new Error("This PowerPoint file couldn't be opened. Open it and save it again as .pptx."); }
  const read = async (path) => (zip.file(path) ? zip.file(path).async('string') : '');
  // the order slides are shown in (not always the order of the file names)
  const rels = await read('ppt/_rels/presentation.xml.rels');
  const pres = await read('ppt/presentation.xml');
  const target = {};
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) target[attr(m[0], 'Id')] = attr(m[0], 'Target');
  let order = [...pres.matchAll(/<p:sldId\b[^>]*>/g)].map((m) => target[attr(m[0], 'r:id')]).filter(Boolean)
    .map((t) => (t.startsWith('/') ? t.slice(1) : 'ppt/' + t)).filter((p) => zip.file(p));
  if (!order.length) {
    order = Object.keys(zip.files).filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
      .sort((a, b) => Number(a.match(/(\d+)\.xml$/)[1]) - Number(b.match(/(\d+)\.xml$/)[1]));
  }
  if (!order.length) throw new Error('No slides were found in this file. Is it a PowerPoint (.pptx) file?');
  const parts = [];
  for (let i = 0; i < order.length; i++) {
    const path = order[i];
    let text = slideParagraphs(await read(path)).join('\n');
    // speaker notes often hold what the professor actually says
    const srel = await read(path.replace(/slides\/(slide\d+\.xml)$/, 'slides/_rels/$1.rels'));
    const noteT = [...srel.matchAll(/<Relationship\b[^>]*>/g)].map((m) => attr(m[0], 'Target')).find((t) => /notesSlides\/notesSlide\d+\.xml$/.test(t));
    if (noteT) {
      const notes = slideParagraphs(await read('ppt/' + noteT.replace(/^\.\.\//, ''))).filter((l) => !/^\d+$/.test(l)).join('\n');
      if (notes.trim()) text += `${text ? '\n' : ''}Speaker notes: ${notes}`;
    }
    parts.push({ label: `slide ${i + 1}`, text });
  }
  return { kind: 'pptx', unit: 'slide', parts };
}

async function readDocx(file) {
  const JSZip = await loadJSZip();
  let zip;
  try { zip = await JSZip.loadAsync(file); } catch { throw new Error("This Word file couldn't be opened. Open it and save it again as .docx."); }
  const xml = zip.file('word/document.xml') ? await zip.file('word/document.xml').async('string') : '';
  if (!xml) throw new Error("This doesn't look like a Word (.docx) file.");
  return { kind: 'docx', unit: 'section', parts: splitSections(wordParagraphs(xml)) };
}

async function readText(file) {
  const raw = (await file.text()).replace(/\r\n?/g, '\n');
  const paras = raw.split(/\n{2,}/).map((t) => t.trim()).filter(Boolean)
    .map((t) => ({ text: t, heading: /^#{1,3}\s+\S/.test(t) && !t.includes('\n') }))
    .map((p) => (p.heading ? { ...p, text: p.text.replace(/^#+\s+/, '') } : p));
  return { kind: 'text', unit: 'section', parts: splitSections(paras) };
}

const OLD = { ppt: 'PowerPoint 97-2003 (.ppt)', doc: 'Word 97-2003 (.doc)', key: 'Keynote', pages: 'Pages', odp: 'OpenDocument', odt: 'OpenDocument' };

// → { name, kind, unit, size, parts: [{ label, text }], words, chars, emptyParts }
export async function readMaterial(file) {
  const name = String(file.name || 'file');
  const ext = (name.match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase() || '';
  if (file.size > MAX_FILE_BYTES) throw new Error('This file is over 150 MB. Save a smaller copy (for slides: File → Compress Pictures) and add that.');
  if (!file.size) throw new Error('This file is empty.');
  let r;
  if (ext === 'pdf') r = await readPdf(file);
  else if (ext === 'pptx') r = await readPptx(file);
  else if (ext === 'docx') r = await readDocx(file);
  else if (['txt', 'md', 'markdown'].includes(ext)) r = await readText(file);
  else if (OLD[ext]) throw new Error(`${OLD[ext]} files can't be read. Open it and save it as a PDF${ext === 'ppt' || ext === 'key' || ext === 'odp' ? ' or PowerPoint (.pptx)' : ' or Word (.docx)'}, then add that.`);
  else if (/^(png|jpe?g|gif|heic|webp|tiff?)$/.test(ext)) throw new Error("Pictures can't be read. Add the slides or document the picture came from, or type the notes into a text file.");
  else throw new Error('This kind of file can\'t be read. Use PDF, PowerPoint (.pptx), Word (.docx) or a text file.');
  const parts = r.parts.map((p) => ({ label: p.label, text: tidy(p.text) }));
  const chars = parts.reduce((n, p) => n + p.text.length, 0);
  if (chars > MAX_FILE_CHARS) throw new Error('This file has more text than one course file should (over about 250,000 words). Split it into smaller files.');
  const emptyParts = parts.filter((p) => !p.text).length;
  const words = parts.reduce((n, p) => n + countWords(p.text), 0);
  if (!words) throw new Error(r.kind === 'pdf'
    ? 'No words could be read from this PDF. It is probably scanned pages or pictures. Add the original slides or document instead.'
    : 'No words could be read from this file. It may contain only pictures.');
  return { name, kind: r.kind, unit: r.unit, size: file.size, parts, words, chars, emptyParts };
}

// Firestore documents hold up to 1 MB: pack the parts into chunks of at most `max` characters
export function packChunks(parts, max = 200000) {
  const chunks = [];
  let cur = [], n = 0;
  const flush = () => { if (cur.length) { chunks.push(cur); cur = []; n = 0; } };
  for (const p of parts) {
    let text = p.text, piece = 0;
    while (text.length > max) {              // one enormous part: cut it
      flush();
      chunks.push([{ label: piece ? `${p.label} (continued)` : p.label, text: text.slice(0, max) }]);
      text = text.slice(max); piece++;
    }
    const part = { label: piece ? `${p.label} (continued)` : p.label, text };
    if (n + text.length > max) flush();
    cur.push(part); n += text.length;
  }
  flush();
  return chunks;
}
