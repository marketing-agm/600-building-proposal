/**
 * Plain-text outline of the Plaza 600 management proposal.
 *
 *   node print/build-outline.mjs [--out docs/plaza600-proposal-outline.pdf]
 *
 * Every heading, paragraph and list item from all thirteen sections, in the
 * order they appear on the site, with no design. Tables are flattened to
 * bullets with the column heading prefixed to each cell so no data is lost;
 * photography and galleries are dropped.
 *
 * The content is read from the rendered DOM rather than the source, because
 * the metric counters animate up from zero and only carry their true value in
 * data-val. The page is loaded with reducedMotion so those land settled, and
 * data-val is preferred over textContent regardless.
 *
 * The per-section rail summaries live inside the page script's IIFE and are
 * not reachable from the DOM, so PAGES is re-read out of the source text.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const argOut = process.argv.indexOf("--out");
const OUT = path.resolve(ROOT, argOut > -1 ? process.argv[argOut + 1] : "docs/plaza600-proposal-outline.pdf");
const SRC = path.join(ROOT, "public/index.html");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const b = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox", "--allow-file-access-from-files"] });
const page = await b.newPage({ viewport: { width: 1600, height: 1000 }, reducedMotion: "reduce" });
await page.goto("file://" + SRC, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);

const html = fs.readFileSync(SRC, "utf8");
const at = html.indexOf("var PAGES = ");
const arr = html.slice(html.indexOf("[", at), html.indexOf("];", at) + 1);
await page.evaluate((src) => { window.__PAGES__ = eval(src); }, arr);

const out = await page.evaluate(() => {
  const PAGES = window.__PAGES__;
  const items = [];
  const push = (type, text, extra) => {
    text = (text||'').replace(/\s+/g,' ').trim();
    if (text) items.push(Object.assign({ type, text }, extra||{}));
  };
  const T = el => (el ? (el.textContent||'').replace(/\s+/g,' ').trim() : '');
  const has = (el, c) => el.classList && el.classList.contains(c);

  const pills = el => {
    const p = [...el.querySelectorAll('.pill')].map(T).filter(Boolean);
    return p.length ? ' (' + p.join('; ') + ')' : '';
  };

  function emit(el) {
    if (!el || el.nodeType !== 1) return;

    if (has(el,'sec-head')) {
      const h = T(el.querySelector('h3'));
      const k = T(el.querySelector('.kick'));
      push('h2', k ? `${h}: ${k}` : h);
      return;
    }
    if (el.tagName === 'P' && (has(el,'lead') || has(el,'table-note') || has(el,'fee-footnote') || has(el,'statute-note'))) {
      push('p', T(el)); return;
    }
    if (has(el,'metrics')) {
      for (const m of el.querySelectorAll('.metric')) {
        const vEl = m.querySelector('.m-value');
        const l = T(m.querySelector('.m-label'));
        const v = vEl ? (vEl.getAttribute('data-val') || T(vEl)) : '';
        const u = T(m.querySelector('.m-unit'));
        push('b0', l ? (v ? `${l}: ${v}${u ? ` (${u})` : ''}` : `${l}: ${u}`) : `${v} ${u}`);
      }
      return;
    }
    if (has(el,'snapshot')) {
      for (const f of el.querySelectorAll('.sfact')) {
        const l = T(f.querySelector('.sf-label')), v = T(f.querySelector('.sf-value')), n = T(f.querySelector('.sf-note'));
        push('b0', `${l}: ${v}${n ? `. ${n}` : ''}`);
      }
      return;
    }
    if (has(el,'timeline')) {
      for (const m of el.querySelectorAll('.milestone')) {
        push('b0', `${T(m.querySelector('.milestone-year'))}: ${T(m.querySelector('.milestone-title'))}. ${T(m.querySelector('.milestone-desc'))}`);
      }
      return;
    }
    if (has(el,'assets')) {
      const locs = [...el.querySelectorAll('.asset-loc')].map(T).filter(Boolean);
      if (locs.length) push('p', 'Featured assets under management: ' + locs.join('; ') + '.');
      return;
    }
    if (has(el,'footprint')) {
      push('p', `${T(el.querySelector('.fp-label'))}: ${T(el.querySelector('.fp-text'))}`); return;
    }
    if (has(el,'highlight')) {
      push('p', `${T(el.querySelector('.h-label'))}: ${T(el.querySelector('.h-value'))}`); return;
    }
    if (has(el,'sub-note')) { push('p', T(el)); return; }
    if (has(el,'feature-role')) {
      push('p', `${T(el.querySelector('.kicker'))}: ${T(el.querySelector('.role-title'))}. ${T(el.querySelector('.cell-desc'))}`);
      return;
    }
    if (has(el,'feature-row')) {
      for (const c of el.querySelectorAll('.fcell')) {
        push('b0', `${T(c.querySelector('.f-title'))}. ${T(c.querySelector('.f-desc'))}`);
      }
      return;
    }
    if (has(el,'cellgrid')) {
      for (const c of el.querySelectorAll('.cell')) {
        const t = T(c.querySelector('.cell-title')) || T(c.querySelector('.role-title'));
        const d = T(c.querySelector('.cell-desc'));
        push('b0', `${t}. ${d}${pills(c)}`);
      }
      return;
    }
    if (has(el,'funnel-rail')) {
      const grid = el.nextElementSibling && el.nextElementSibling.classList.contains('funnel-grid')
        ? el.nextElementSibling : null;
      const cols = grid ? [...grid.querySelectorAll('.funnel-col')] : [];
      if (grid) grid.dataset.consumed = '1';
      [...el.querySelectorAll('.funnel-stage')].forEach((s, i) => {
        const head = `${T(s.querySelector('.funnel-stage-label'))}: ${T(s.querySelector('.funnel-stage-title'))}`;
        const c = cols[i];
        push('b0', c ? `${head}. ${T(c.querySelector('.fn-desc'))}${pills(c)}` : head);
      });
      return;
    }
    if (has(el,'funnel-grid')) {
      if (el.dataset.consumed) return;
      for (const c of el.querySelectorAll('.funnel-col')) {
        push('b0', `${T(c.querySelector('.fn-desc'))}${pills(c)}`);
      }
      return;
    }
    if (has(el,'steps')) {
      for (const s of el.querySelectorAll('.step')) {
        push('b0', `${T(s.querySelector('.st-when'))}: ${T(s.querySelector('.st-title'))}. ${T(s.querySelector('.st-desc'))}`);
      }
      return;
    }
    if (el.tagName === 'UL' && has(el,'mp-list')) {
      for (const li of el.querySelectorAll('li')) push('b0', T(li));
      return;
    }
    if (has(el,'spec-wrap')) {
      const table = el.querySelector('table');
      if (!table) return;
      const heads = [...table.querySelectorAll('thead .colhead-row th')].map(T);
      for (const tr of table.tBodies[0].rows) {
        if (has(tr,'band')) {
          const l = T(tr.querySelector('.band-l > *:not(.band-n)')) || T(tr.querySelector('.band-l'));
          const n = T(tr.querySelector('.band-n'));
          const label = n && l.endsWith(n) ? l.slice(0, -n.length).trim() : l;
          push('p', n ? `${label} (${n})` : label);
          continue;
        }
        const cells = [...tr.cells].map(T);
        const parts = [];
        cells.forEach((c, i) => {
          if (!c) return;
          if (i === 0) parts.push(c);
          else parts.push(`${heads[i] || 'Detail'}: ${c}`);
        });
        push('b0', parts.join('. ') + '.');
      }
      return;
    }
    if (has(el,'fee-cards')) {
      for (const c of el.querySelectorAll('.fee-card')) {
        const lab = T(c.querySelector('.fc-label'));
        const ttl = T(c.querySelector('.fc-title'));
        const dsc = T(c.querySelector('.fc-desc'));
        const foot = T(c.querySelector('.fc-foot'));
        push('b0', `${lab}: ${ttl}. ${dsc}${foot ? ` ${foot}` : ''}`);
        const sec = c.querySelector('.fc-sec');
        const priceEl = c.querySelector('.fc-price');
        if (priceEl) {
          /* the recurring fee: everything in .fc-price except the onboarding block */
          const main = [...priceEl.children].filter(n => !n.classList.contains('fc-sec'));
          const amt = T(main.find(n => n.classList.contains('fc-amount')));
          const units = main.filter(n => n.classList.contains('fc-unit')).map(T).filter(Boolean);
          if (amt) push('b1', `Fee: ${amt}${units.length ? ', ' + units.join(', ') : ''}`);
        }
        if (sec) {
          const sl = T(sec.querySelector('.fc-sec-label'));
          const amt = T(sec.querySelector('.fc-amount'));
          const units = [...sec.querySelectorAll('.fc-unit')].map(T).filter(Boolean);
          push('b1', `${sl || 'Onboarding'}: ${amt}${units.length ? ', ' + units.join(', ') : ''}`);
        }
      }
      return;
    }
    if (has(el,'fee-compact-grid')) {
      for (const c of el.querySelectorAll('.fee-compact-cell')) {
        const k = T(c.querySelector('.fc-k')), n = T(c.querySelector('.fc-n'));
        const a = T(c.querySelector('.fc-a')), nt = T(c.querySelector('.fc-nt'));
        push('b0', `${k}: ${n}. ${a}${nt ? `. ${nt}` : ''}`);
      }
      return;
    }
    if (has(el,'portal')) {
      for (const f of el.querySelectorAll('.portal-feat')) {
        push('b0', `${T(f.querySelector('.pf-title'))}. ${T(f.querySelector('.pf-desc'))}`);
      }
      return;
    }
    if (has(el,'gallery')) return;      /* photography only */
    if (has(el,'block')) { for (const c of el.children) emit(c); return; }
    /* anything else: descend */
    for (const c of el.children) emit(c);
  }

  const sections = [];
  for (const p of PAGES) {
    const el = document.getElementById('page-' + p.route);
    if (!el) continue;
    items.length = 0;
    for (const c of el.children) emit(c);
    sections.push({ label: p.label, lead: p.lead, items: items.map(i => ({...i})) });
  }
  return sections;
});
await b.close();

/* ------------------------------------------------------------------ render */
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

let body = `<header class="cover">
  <h1>Plaza 600</h1>
  <p class="sub">Management Proposal</p>
  <p class="meta">AGM Real Estate Group &middot; 600 Stewart Street, Seattle</p>
  <p class="meta">Prepared for Orton Development</p>
  <p class="note">Plain-text outline of the digital proposal. Every heading, paragraph and
  list item in the order it appears on the site. Tables are rendered as bullet lists.
  Photography and layout are omitted.</p>
</header>`;

out.forEach((sec, i) => {
  body += `<section><h1>${String(i + 1).padStart(2, "0")}. ${esc(sec.label)}</h1>`;
  if (sec.lead) body += `<p class="summary">${esc(sec.lead)}</p>`;
  let open = null;
  const close = () => { if (open) { body += "</ul>"; open = null; } };
  for (const it of sec.items) {
    if (it.type === "h2") { close(); body += `<h2>${esc(it.text)}</h2>`; }
    else if (it.type === "p") { close(); body += `<p>${esc(it.text)}</p>`; }
    else if (it.type === "b0" || it.type === "b1") {
      if (open !== it.type) { close(); body += `<ul class="${it.type === "b1" ? "l1" : "l0"}">`; open = it.type; }
      body += `<li>${esc(it.text)}</li>`;
    }
  }
  close();
  body += "</section>";
});

const doc = `<!doctype html><html><head><meta charset="utf-8">
<title>Plaza 600 Management Proposal &mdash; Outline</title>
<style>
  @page { size: letter portrait; margin: 0.85in 0.9in 0.95in; }
  * { box-sizing: border-box; }
  body { font: 10.5pt/1.5 Georgia, "Times New Roman", serif; color:#000; margin:0; }
  .cover { page-break-after: always; padding-top: 2.1in; }
  .cover h1 { font-size: 30pt; margin:0 0 6pt; letter-spacing:-.01em; }
  .cover .sub { font-size: 16pt; margin:0 0 26pt; }
  .cover .meta { font-size: 11pt; margin:0 0 3pt; }
  .cover .note { font-size: 9.5pt; font-style: italic; margin-top: 30pt; max-width: 4.6in; line-height:1.55; }
  section { page-break-before: always; }
  h1 { font-size: 16pt; margin: 0 0 10pt; padding-bottom: 6pt; border-bottom: 1.5pt solid #000; page-break-after: avoid; }
  h2 { font-size: 11.5pt; margin: 20pt 0 7pt; page-break-after: avoid; }
  p  { margin: 0 0 9pt; orphans: 2; widows: 2; }
  p.summary { font-style: italic; margin: 0 0 14pt; }
  ul { margin: 0 0 9pt; padding-left: 20pt; }
  ul.l1 { padding-left: 42pt; margin-top: -5pt; }
  li { margin: 0 0 5pt; orphans: 2; widows: 2; }
  ul.l1 li { list-style-type: circle; }
</style></head><body>${body}</body></html>`;

const b2 = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
const p2 = await b2.newPage();
await p2.setContent(doc, { waitUntil: "load" });
await p2.pdf({
  path: OUT, format: "Letter", printBackground: true, displayHeaderFooter: true,
  headerTemplate: "<div></div>",
  footerTemplate: `<div style="width:100%;font:8pt Georgia,serif;color:#000;padding:0 0.9in;display:flex;justify-content:space-between;">
      <span>Plaza 600 &middot; Management Proposal &middot; AGM Real Estate Group</span><span class="pageNumber"></span></div>`,
  margin: { top: "0.85in", bottom: "0.95in", left: "0.9in", right: "0.9in" },
});
await b2.close();

const items = out.reduce((n, s) => n + s.items.length, 0);
console.log(`${path.relative(ROOT, OUT)}  ${out.length} sections  ${items} items  ${Math.round(fs.statSync(OUT).size / 1024)}KB`);
