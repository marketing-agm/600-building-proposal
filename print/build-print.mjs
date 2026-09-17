/* ============================================================================
 * PLAZA 600 — PRINT EDITION BUILD
 * ----------------------------------------------------------------------------
 * Renders public/index.html as a landscape Letter PDF.
 *
 *   node print/build-print.mjs [--out print/plaza600-proposal.pdf]
 *
 * The proposal itself is the single source of truth. This script pulls the
 * section bodies, the design tokens and the per-section rail data straight out
 * of public/index.html, so copy edited on the site reaches the PDF on the next
 * build with nothing to keep in step by hand.
 *
 * Requires playwright-core and the Chromium at PLAYWRIGHT_BROWSERS_PATH.
 * ========================================================================== */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const PUB  = path.join(ROOT, "public");

const argOut = process.argv.indexOf("--out");
const OUT = path.resolve(ROOT, argOut > -1 ? process.argv[argOut + 1] : "print/plaza600-proposal.pdf");
const KEEP = process.argv.includes("--keep-html");

const html = fs.readFileSync(path.join(PUB, "index.html"), "utf8");

/* ------------------------------------------------------------------ extract -- */

/** Inner HTML of the element carrying `id`, by depth-counting real tags. */
function innerById(src, id) {
  const open = new RegExp(`<(\\w+)[^>]*\\bid="${id}"[^>]*>`);
  const m = open.exec(src);
  if (!m) throw new Error(`no element #${id}`);
  const start = m.index + m[0].length;
  const VOID = new Set(["img", "br", "hr", "input", "meta", "link", "source", "col", "area"]);
  const tag = /<(\/?)(\w+)([^>]*?)(\/?)>/g;
  tag.lastIndex = start;
  let depth = 0, t;
  while ((t = tag.exec(src))) {
    const [, close, name, , selfClose] = t;
    if (VOID.has(name.toLowerCase()) || selfClose) continue;
    if (close) {
      if (depth === 0) return src.slice(start, t.index);
      depth--;
    } else depth++;
  }
  throw new Error(`unbalanced #${id}`);
}

/** The proposal's own stylesheet — every <style> block in the head, in order. */
function siteCSS(src) {
  const head = src.slice(0, src.indexOf("</head>"));
  return [...head.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n");
}

/** A literal array or object assigned in the page script, read as data. */
function literal(src, name) {
  const at = src.indexOf(`var ${name} = `);
  if (at < 0) throw new Error(`no ${name}`);
  const from = src.indexOf(name === "PAGES" ? "[" : "{", at);
  const openCh = src[from], closeCh = openCh === "[" ? "]" : "}";
  let depth = 0, inStr = null, i = from;
  for (; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      if (c === "\\") i++;
      else if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'") { inStr = c; continue; }
    if (c === openCh) depth++;
    else if (c === closeCh && --depth === 0) { i++; break; }
  }
  // eslint-disable-next-line no-new-func
  return new Function(`return (${src.slice(from, i)});`)();
}

const CSS   = siteCSS(html);
const PAGES = literal(html, "PAGES");
const ICONS = literal(html, "ICONS");

const sections = PAGES.map((p) => ({
  route: p.route,
  body: innerById(html, `page-${p.route}`)
}));

/* Site paths resolve against the server root. The print document is loaded
   from disk, so rewrite them onto the public directory. */
const fileURL = (rel) => "file://" + path.join(PUB, rel).split(path.sep).join("/");
function rewrite(frag) {
  return frag
    .replace(/(src|href)="\/([^"]+)"/g, (_, a, rel) => `${a}="${fileURL(rel)}"`)
    .replace(/\sloading="lazy"/g, "")          /* nothing is below the fold on paper */
    .replace(/\stabindex="[^"]*"/g, "")
    .replace(/<button /g, "<div ")             /* buttons print with UA chrome */
    .replace(/<\/button>/g, "</div>");
}

const dataURI = (rel) =>
  "data:image/svg+xml;base64," + fs.readFileSync(path.join(PUB, rel)).toString("base64");

/* --------------------------------------------------------------- compose -- */

const printCSS = fs.readFileSync(path.join(HERE, "print.css"), "utf8");
const fontCSS  = fs.readFileSync(path.join(HERE, "fonts.css"), "utf8");
const imageJS  = fs.readFileSync(path.join(HERE, "optimize-images.js"), "utf8");
const pagerJS  = fs.readFileSync(path.join(HERE, "paginate.js"), "utf8");

const DATE = new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });
const COVER_META = [
  "Prepared for Ownership",
  "600 Stewart Street &middot; Seattle, Washington",
  "Twenty stories &middot; 217,322 rentable square feet",
  DATE
].join("<br>");

const doc = `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
<meta charset="UTF-8" />
<title>AGM Real Estate Group — Plaza 600 Proposal — Print Edition</title>
<style>${fontCSS}</style>
<style>${CSS}</style>
<style>${printCSS}</style>
</head>
<body>
<div id="source">
${sections.map((s) => `<div id="src-${s.route}">${rewrite(s.body)}</div>`).join("\n")}
</div>
<div id="sheets"></div>
<script>
window.PRINT_PAGES  = ${JSON.stringify(PAGES)};
window.PRINT_ICONS  = ${JSON.stringify(ICONS)};
window.PRINT_LOGO_WHITE = ${JSON.stringify(dataURI("assets/agm-logo-white.svg"))};
window.PRINT_LOGO_BLACK = ${JSON.stringify(dataURI("assets/agm-logo-black.svg"))};
window.PRINT_COVER_META = ${JSON.stringify(COVER_META)};
window.PRINT_DATE   = ${JSON.stringify(DATE)};
</script>
<script>${imageJS}</script>
<script>${pagerJS}</script>
</body>
</html>`;

const tmp = path.join(ROOT, "print", ".print-build.html");
fs.writeFileSync(tmp, doc);

/* ----------------------------------------------------------------- render -- */

const { chromium } = await import("playwright-core");

function findChromium() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  const dirs = fs.readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort();
  for (const d of dirs.reverse()) {
    for (const rel of ["chrome-linux/chrome", "chrome-linux/headless_shell"]) {
      const p = path.join(base, d, rel);
      if (fs.existsSync(p)) return p;
    }
  }
  throw new Error(`no Chromium under ${base}`);
}

const browser = await chromium.launch({
  executablePath: findChromium(),
  args: ["--no-sandbox", "--font-render-hinting=none", "--allow-file-access-from-files"]
});
const page = await browser.newPage({ viewport: { width: 1056, height: 816 } });

const problems = [];
page.on("pageerror", (e) => problems.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") problems.push("console: " + m.text()); });

await page.goto("file://" + tmp, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
await page.waitForFunction(() => document.documentElement.dataset.paginated === "1", { timeout: 60000 });

const result = await page.evaluate(() => window.PRINT_RESULT);
const resampled = await page.evaluate(() =>
  (window.PRINT_IMAGE_REPORT || []).filter((r) => r.change !== "kept").length);

/* Every sheet is a fixed 11in x 8.5in box; anything taller means a single unit
   outgrew a page and is being clipped, which must not pass silently. */
const overflow = await page.evaluate(() =>
  [...document.querySelectorAll(".sheet")].map((s, i) => {
    const flow = s.querySelector(".p-flow");
    if (!flow) return null;
    const body = s.querySelector(".p-body");
    const cs = getComputedStyle(body);
    const avail = body.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const over = Math.round(flow.getBoundingClientRect().height - avail);
    return over > 1 ? { page: i + 1, over } : null;
  }).filter(Boolean)
);

await page.pdf({
  path: OUT,
  width: "11in",
  height: "8.5in",
  printBackground: true,
  preferCSSPageSize: true,
  margin: { top: 0, right: 0, bottom: 0, left: 0 }
});

await browser.close();
if (!KEEP) fs.unlinkSync(tmp);

/* ------------------------------------------------------------------ report -- */

const kb = Math.round(fs.statSync(OUT).size / 1024);
console.log(`${path.relative(ROOT, OUT)}  ${result.total} pages  ${kb}KB`);
console.log(`usable height per sheet: ${Math.round(result.avail)}px`);
console.log(`images resampled for print: ${resampled}`);
for (const s of result.perSection) {
  console.log(`  ${s.route.padEnd(12)} ${s.pages} page${s.pages === 1 ? "" : "s"}`);
}
if (overflow.length) {
  console.error("\nCLIPPED CONTENT — a unit is taller than one page:");
  for (const o of overflow) console.error(`  page ${o.page}: ${o.over}px over`);
}
if (problems.length) {
  console.error("\nbrowser reported:");
  for (const p of problems.slice(0, 20)) console.error("  " + p);
}
process.exit(overflow.length ? 1 : 0);
