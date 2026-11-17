// Turns question Markdown (with $math$ and code) into HTML.
import { marked } from '../vendor/marked.esm.js';

marked.setOptions({ gfm: true, breaks: false });

const cache = new Map();

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderMath(tex, display) {
  if (window.katex) {
    try { return window.katex.renderToString(tex, { displayMode: display, throwOnError: false, output: 'html' }); } catch {}
  }
  return `<code>${esc(tex)}</code>`;
}

// Pull math out before Markdown runs so underscores/asterisks inside formulas survive.
function protectMath(src) {
  const store = [];
  const keep = (html) => { store.push(html); return `@@MATH${store.length - 1}@@`; };
  let out = '';
  // leave code spans and fenced blocks alone
  const parts = src.split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]+`)/g);
  for (const part of parts) {
    if (/^(```|~~~|`)/.test(part)) { out += part; continue; }
    let p = part.replace(/\$\$([\s\S]+?)\$\$/g, (_, t) => keep(renderMath(t.trim(), true)));
    p = p.replace(/\\\[([\s\S]+?)\\\]/g, (_, t) => keep(renderMath(t.trim(), true)));
    p = p.replace(/\\\(([\s\S]+?)\\\)/g, (_, t) => keep(renderMath(t.trim(), false)));
    // $...$ inline: no space just inside the dollars and no digit right after the closing one,
    // so prices like "$5 and $10" are left alone
    p = p.replace(/(^|[^\\$])\$(?=\S)((?:\\\$|[^$\n])+?)(?<=\S)\$(?!\d)/g, (_, pre, t) => pre + keep(renderMath(t, false)));
    out += p.replace(/\\\$/g, '$');
  }
  return { text: out, store };
}

// Exam files and assignments can be uploaded by instructors and TAs, so their HTML is never
// trusted: only formatting tags and safe attributes survive, and links/images must be web,
// mail or in-page addresses. Anything that could run code (scripts, event handlers,
// javascript: links, iframes, forms, styles) is removed.
const OK_TAGS = new Set(['p', 'br', 'hr', 'strong', 'b', 'em', 'i', 'u', 's', 'del', 'ins', 'mark', 'small', 'sub', 'sup', 'kbd', 'code', 'pre', 'blockquote',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'a', 'img', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'div', 'details', 'summary', 'figure', 'figcaption', 'abbr']);
const DROP_WITH_CONTENT = new Set(['script', 'style', 'iframe', 'object', 'embed', 'noscript', 'template', 'svg', 'math', 'form', 'textarea', 'select', 'button', 'input', 'link', 'meta', 'base', 'frame', 'frameset', 'audio', 'video', 'source', 'track', 'canvas', 'portal']);
const OK_ATTRS = new Set(['href', 'src', 'alt', 'title', 'colspan', 'rowspan', 'align', 'start', 'type', 'width', 'height', 'lang', 'open', 'loading', 'class']);
const safeUrl = (u, img) => {
  const v = String(u).trim().replace(/[\u0000-\u0020]/g, '');
  if (/^(https?:|mailto:)/i.test(v)) return true;
  if (img && /^data:image\/(png|gif|jpe?g|webp);/i.test(v)) return true;
  return !/^[a-z][a-z0-9+.-]*:/i.test(v); // relative links and #anchors, but no other schemes (javascript:, data:, vbscript:…)
};
export function sanitize(html) {
  if (typeof document === 'undefined') return html;
  const t = document.createElement('template');
  t.innerHTML = html;
  const walk = (node) => {
    for (const el of [...node.children]) {
      const tag = el.tagName.toLowerCase();
      if (DROP_WITH_CONTENT.has(tag)) { el.remove(); continue; }
      walk(el);
      if (!OK_TAGS.has(tag)) { el.replaceWith(...el.childNodes); continue; }
      for (const { name, value } of [...el.attributes]) {
        const n = name.toLowerCase();
        if (!OK_ATTRS.has(n) || ((n === 'href' || n === 'src') && !safeUrl(value, n === 'src'))
          || (n === 'class' && !/^language-[\w+#-]+$/.test(value))) el.removeAttribute(name); // only code-highlighting classes
      }
      if (tag === 'a' && el.hasAttribute('href') && /^https?:/i.test(el.getAttribute('href'))) { el.setAttribute('rel', 'noopener noreferrer'); el.setAttribute('target', '_blank'); }
    }
  };
  walk(t.content);
  return t.innerHTML;
}

export function md(src, { inline = false } = {}) {
  const key = (inline ? 'i:' : 'b:') + src;
  if (cache.has(key)) return cache.get(key);
  const { text, store } = protectMath(String(src ?? ''));
  let html = sanitize(inline ? marked.parseInline(text) : marked.parse(text));
  // maths is added after cleaning: it's produced by KaTeX (which doesn't allow links or scripts)
  html = html.replace(/@@MATH(\d+)@@/g, (_, i) => store[Number(i)]);
  html = html.replace(/<img /g, '<img loading="lazy" ');
  // code blocks can scroll sideways, so make them reachable with the keyboard
  html = html.replace(/<pre>/g, '<pre tabindex="0">');
  html = html.replace(/<table>/g, '<div class="table-wrap"><table>').replace(/<\/table>/g, '</table></div>');
  if (cache.size > 2000) cache.clear();
  cache.set(key, html);
  return html;
}

export function highlight(root) {
  if (!window.hljs) return;
  root.querySelectorAll('pre code:not([data-hl])').forEach((el) => {
    el.setAttribute('data-hl', '1');
    try { window.hljs.highlightElement(el); } catch {}
  });
}

// Plain-text preview of a question (for lists)
export function snippet(src, n = 120) {
  const t = String(src ?? '')
    .replace(/```[^\n]*\n([\s\S]*?)```/g, (_, code) => { const first = code.split('\n').map((l) => l.trim()).find(Boolean) || ''; return first ? ` \`${first.replace(/`/g, '')}${code.trim().includes('\n') ? ' …' : ''}\` ` : ' '; })
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' [image] ')
    .replace(/^\s*\|.*$/gm, ' ')
    .replace(/\$\$([^$]+)\$\$/g, '$$$1$$')
    .replace(/[*`#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (t.length <= n) return t;
  let cut = t.slice(0, n - 1);
  // don't cut a $math$ span in half
  if ((cut.match(/(?<!\\)\$/g) || []).length % 2) cut = cut.slice(0, cut.lastIndexOf('$'));
  return cut.trimEnd() + '…';
}
