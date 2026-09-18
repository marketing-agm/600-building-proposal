/* ============================================================================
 * PLAZA 600 — PRINT PAGINATOR
 * ----------------------------------------------------------------------------
 * Runs in the browser, inside the print document assembled by build-print.mjs.
 *
 * Chromium's own page breaking is not used. It cannot repeat a table header,
 * cannot re-letter a continuation panel, and it splits a two-column card grid
 * mid-row, which leaves a half-empty band at the foot of the page. Instead this
 * script measures real laid-out heights and fills each sheet unit by unit:
 *
 *   1. Every section is decomposed into atoms — the smallest pieces that may
 *      stand alone. A card grid, a register table, a step list and a bullet
 *      list are splittable atoms; a metric strip, a photo band and a callout
 *      are not.
 *   2. Atoms are appended to the live sheet one at a time and the sheet is
 *      measured after each. The first atom that does not fit ends the page.
 *   3. A splittable atom that does not fit whole is cut on a unit boundary —
 *      whole table rows, whole grid rows (never a single cell of a pair),
 *      whole steps, whole list items — and the remainder opens the next sheet
 *      with its header repeated and CONTINUED set on the rail.
 *   4. A heading left stranded at the foot of a page is pulled forward with
 *      the content it introduces.
 *
 * Folios are stamped after pagination, once the total is known.
 * ========================================================================== */
(function () {
  "use strict";

  var SRC    = document.getElementById("source");
  var OUT    = document.getElementById("sheets");
  var PAGES  = window.PRINT_PAGES;
  var ICONS  = window.PRINT_ICONS;
  var TOTAL  = PAGES.length;

  /* ------------------------------------------------------------------ rail -- */

  function pad(n) { return (n < 10 ? "0" : "") + n; }

  function iconSVG(nav) {
    var paths = ICONS[nav] || ICONS.about;
    return '<span class="p-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      paths + "</svg></span>";
  }

  function ticker(i) {
    var s = "";
    for (var k = 1; k <= TOTAL; k++) s += "<i class='" + (k === i ? "cur" : k < i ? "done" : "") + "'></i>";
    return s;
  }

  function railHTML(p, i, continued) {
    /* The wordmark is a sibling of both panels, not a child of the navy one, so
       it spans the full rail and carries through the blue block below — as on
       the site, where .rail-watermark is a child of .rail-stick. Nested inside
       the navy panel it would be clipped at the colour break by that panel's
       own overflow:hidden. It is emitted last so it paints over both grounds. */
    return (
      '<div class="p-rail">' +
        '<div class="p-rail-navy">' +
          iconSVG(p.nav) +
          '<p class="p-eyebrow">' + p.eyebrow + "</p>" +
          '<h2 class="p-title">' + p.t1 + '<span class="hl">' + p.t2 + "</span></h2>" +
          '<div class="p-mark"><img src="' + window.PRINT_LOGO_WHITE + '" alt="AGM Real Estate Group" /></div>' +
        "</div>" +
        '<div class="p-rail-blue">' +
          (continued
            ? '<p class="p-continued">Continued</p>'
            : '<p class="p-lead">' + p.lead + "</p>") +
          '<div class="p-rail-foot">' +
            '<div class="p-label">' + p.label + "</div>" +
            '<div class="p-ticker">' + ticker(i) + "</div>" +
            '<div class="p-num">' + pad(i) + " / " + pad(TOTAL) + "</div>" +
          "</div>" +
        "</div>" +
        '<div class="p-watermark" aria-hidden="true"><span>AGM</span></div>' +
      "</div>"
    );
  }

  function newSheet(p, i, continued) {
    var sheet = document.createElement("div");
    sheet.className = "sheet";
    sheet.innerHTML =
      railHTML(p, i, continued) +
      '<div class="p-body"><div class="p-flow"></div>' +
        '<div class="p-folio"><span class="p-conf">Confidential</span>' +
        '<span class="p-sec">' + p.label + "</span>" +
        '<span class="p-page"></span></div></div>';
    OUT.appendChild(sheet);
    return sheet;
  }

  /* --------------------------------------------------------------- measure -- */

  var AVAIL = 0;   /* usable height of .p-flow, px */

  function measureAvail() {
    var probe = newSheet(PAGES[0], 1, false);
    var body  = probe.querySelector(".p-body");
    var cs    = getComputedStyle(body);
    AVAIL = body.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    probe.remove();
  }

  /* ----------------------------------------------------------------- atoms -- */
  /* An atom is { node, kind, keepNext, split? }. `split` describes how the
     node may be cut: `unit` selects the repeatable children, `group` how many
     of them travel together (a two-column grid moves in pairs so a page never
     ends on half a row), `min` the fewest groups worth leaving behind, and
     `shell` builds the empty container that carries them. */

  function cls(el) { return el.classList; }

  function chunkPairs(items, n) {
    var out = [], i;
    for (i = 0; i < items.length; i += n) out.push(items.slice(i, i + n));
    return out;
  }

  /* rows of a fee grid: a .full cell occupies a whole row on its own */
  function feeRows(cells) {
    var rows = [], cur = [];
    cells.forEach(function (c) {
      if (cls(c).contains("full")) {
        if (cur.length) { rows.push(cur); cur = []; }
        rows.push([c]);
      } else {
        cur.push(c);
        if (cur.length === 2) { rows.push(cur); cur = []; }
      }
    });
    if (cur.length) rows.push(cur);
    return rows;
  }

  /* rows of a register table: a band row is a group header and never ends a
     page, so it travels with the first data row beneath it */
  function tableRows(rows) {
    var out = [], i = 0;
    while (i < rows.length) {
      if (cls(rows[i]).contains("band")) {
        var grp = [rows[i]];
        if (rows[i + 1]) { grp.push(rows[i + 1]); i += 2; } else { i += 1; }
        out.push(grp);
      } else if (cls(rows[i]).contains("total")) {
        /* a total row follows the row above it */
        if (out.length) out[out.length - 1].push(rows[i]);
        else out.push([rows[i]]);
        i += 1;
      } else {
        out.push([rows[i]]);
        i += 1;
      }
    }
    return out;
  }

  function shellOf(el) {
    var s = el.cloneNode(false);
    s.removeAttribute("style");
    return s;
  }

  function atomFor(el) {
    var c = cls(el);

    /* a register table arrives wrapped for horizontal scroll on screen; on
       paper the wrapper has no purpose and would hide the split */
    if (c.contains("spec-wrap")) {
      var table = el.querySelector("table");
      return {
        node: table, kind: "table", keepNext: false,
        split: {
          rows: function (t) { return tableRows(Array.prototype.slice.call(t.tBodies[0].rows)); },
          min: 2,
          shell: function (t) {
            var s = shellOf(t);
            s.appendChild(t.tHead.cloneNode(true));
            s.appendChild(document.createElement("tbody"));
            return s;
          },
          target: function (s) { return s.tBodies[0]; }
        }
      };
    }

    if (c.contains("cellgrid")) {
      return {
        node: el, kind: "cellgrid", keepNext: false,
        split: {
          rows: function (g) {
            var n = c.contains("cols-1") ? 1 : 2;
            return chunkPairs(Array.prototype.slice.call(g.children), n);
          },
          min: 1,
          shell: shellOf,
          target: function (s) { return s; },
          onShell: function (s, placed) {
            /* continuation panels carry on numbering rather than restarting */
            s.style.counterReset = "cardnum " + placed;
          }
        }
      };
    }

    if (c.contains("fee-compact-grid")) {
      return {
        node: el, kind: "feegrid", keepNext: false,
        split: {
          rows: function (g) { return feeRows(Array.prototype.slice.call(g.children)); },
          min: 1, shell: shellOf, target: function (s) { return s; }
        }
      };
    }

    if (c.contains("steps") || c.contains("fee-cards")) {
      return {
        node: el, kind: "stack", keepNext: false,
        split: {
          rows: function (g) { return chunkPairs(Array.prototype.slice.call(g.children), 1); },
          min: 1, shell: shellOf, target: function (s) { return s; }
        }
      };
    }

    if (el.tagName === "UL" && c.contains("mp-list")) {
      return {
        node: el, kind: "list", keepNext: false,
        split: {
          rows: function (g) { return chunkPairs(Array.prototype.slice.call(g.children), 1); },
          min: 2, shell: shellOf, target: function (s) { return s; }
        }
      };
    }

    /* a heading, a lead paragraph introducing one, and a funnel stage rail all
       mean nothing without the content beneath them */
    if (c.contains("sec-head"))    return { node: el, kind: "head",   keepNext: true };
    if (c.contains("funnel-rail")) return { node: el, kind: "funnel", keepNext: true };

    return { node: el, kind: "atom", keepNext: false };
  }

  /* `.block` is the site's generic topic wrapper, and its children page
     independently. But the class is also applied to components that carry
     their own layout — `.metrics block` is one grid, not four atoms — so a
     wrapper is only a wrapper when `block` (with `reveal`) is all it is. */
  function isWrapper(el) {
    if (!cls(el).contains("block")) return false;
    return Array.prototype.every.call(el.classList, function (c) {
      return c === "block" || c === "reveal";
    });
  }

  function atomsFor(section) {
    var atoms = [];
    Array.prototype.forEach.call(section.children, function (child) {
      if (isWrapper(child)) {
        Array.prototype.slice.call(child.children).forEach(function (k, i) {
          var a = atomFor(k);
          if (i === 0) a.groupStart = true;
          atoms.push(a);
        });
      } else {
        atoms.push(atomFor(child));
      }
    });
    return atoms;
  }

  /* ------------------------------------------------------------ pagination -- */

  function trySplit(flow, atom, cap) {
    var sp = atom.split;
    var rows = sp.rows(atom.node);
    if (rows.length < 2) return null;

    var shell = sp.shell(atom.node);
    if (atom.groupStart) shell.classList.add("p-group");
    flow.appendChild(shell);

    var tgt = sp.target(shell), placed = 0, i;
    for (i = 0; i < rows.length; i++) {
      rows[i].forEach(function (n) { tgt.appendChild(n); });
      if (flow.getBoundingClientRect().height > cap + 0.5) {
        rows[i].forEach(function (n) { n.remove(); });
        break;
      }
      placed++;
    }
    /* every remaining group must still have somewhere to go */
    if (placed < sp.min || placed === rows.length) { shell.remove(); return null; }

    var count = 0;
    rows.slice(0, placed).forEach(function (g) { count += g.length; });
    if (sp.onShell) sp.onShell(shell, 0);

    var rest = sp.shell(atom.node);
    var rtgt = sp.target(rest);
    rows.slice(placed).forEach(function (g) {
      g.forEach(function (n) { rtgt.appendChild(n); });
    });
    if (sp.onShell) sp.onShell(rest, count);

    return { node: rest, kind: atom.kind, keepNext: false, split: sp, isRest: true };
  }

  var sheets = [];   /* { el, route } in output order */

  /* Fill sheets for one section against a ceiling of `cap` px and return the
     sheets produced. Nothing is placed past AVAIL, so a lower cap only moves
     content later — it never clips. */
  function fill(p, index, cap) {
    var section = SRC.querySelector("#src-" + p.route).cloneNode(true);
    var queue   = atomsFor(section);
    var made    = [];
    var sheet, flow;

    function open(continued) {
      sheet = newSheet(p, index, continued);
      flow  = sheet.querySelector(".p-flow");
      made.push(sheet);
    }

    /* A heading, or a heading and the paragraph that introduces it, must not be
       left at the foot of a page with its content overleaf. */
    function isIntro(el) {
      if (el.classList.contains("sec-head") || el.classList.contains("funnel-rail")) return true;
      if (el.classList.contains("lead")) {
        var prev = el.previousElementSibling;
        return !!prev && prev.classList.contains("sec-head");
      }
      return false;
    }

    function nextSheet() {
      var carry = [];
      while (flow.children.length > 1 && isIntro(flow.lastElementChild)) {
        var last = flow.lastElementChild;
        carry.unshift(last);
        flow.removeChild(last);
      }
      open(true);
      carry.forEach(function (n) { flow.appendChild(n); });
    }

    function room() { return flow.getBoundingClientRect().height <= cap + 0.5; }

    open(false);

    var guard = 0;
    while (queue.length) {
      if (++guard > 6000) throw new Error("paginator did not converge on " + p.route);
      var atom = queue.shift();
      var node = atom.node;
      if (atom.groupStart && !atom.isRest) node.classList.add("p-group");

      flow.appendChild(node);
      if (room()) continue;
      flow.removeChild(node);

      /* alone on an empty sheet: split if possible, otherwise let the unit
         stand — the hard ceiling is AVAIL, and the caller checks for clipping */
      if (!flow.firstElementChild) {
        var solo = atom.split ? trySplit(flow, atom, Math.max(cap, AVAIL)) : null;
        if (solo) { queue.unshift(solo); nextSheet(); continue; }
        flow.appendChild(node);
        nextSheet();
        continue;
      }

      var rest = atom.split ? trySplit(flow, atom, cap) : null;
      if (rest) { nextSheet(); queue.unshift(rest); continue; }
      queue.unshift(atom);
      nextSheet();
    }
    return made;
  }

  function usedOf(sheet) {
    return sheet.querySelector(".p-flow").getBoundingClientRect().height;
  }

  /* How badly a run of sheets wastes paper. Squaring the shortfall makes one
     nearly empty sheet cost far more than several comfortably full ones, which
     is what "cut it cleanly, no odd gap" means in practice. The final sheet of
     a section is judged too — a section that ends on a lone callout reads as a
     mistake — but at a discount, since some sections simply end short. */
  function waste(made) {
    var total = 0;
    made.forEach(function (s, i) {
      var gap = Math.max(0, AVAIL - usedOf(s));
      var w = (i === made.length - 1) ? 0.55 : 1;
      total += w * gap * gap;
    });
    return total;
  }

  var CAPS = [1, 0.95, 0.9, 0.86, 0.82, 0.78, 0.74, 0.7, 0.66, 0.62];

  function paginateSection(p, index) {
    var best = null;
    for (var i = 0; i < CAPS.length; i++) {
      var made = fill(p, index, AVAIL * CAPS[i]);
      var cand = { made: made, pages: made.length, waste: waste(made) };
      if (!best || cand.pages < best.pages ||
          (cand.pages === best.pages && cand.waste < best.waste)) {
        if (best) best.made.forEach(function (s) { s.remove(); });
        best = cand;
      } else {
        made.forEach(function (s) { s.remove(); });
      }
      /* a lower cap can only push content later, so once it costs a page
         there is nothing further down the list worth trying */
      if (best && cand.pages > best.pages) break;
    }
    best.made.forEach(function (s) { sheets.push({ el: s, route: p.route }); });
  }

  /* ------------------------------------------------------------------ run --- */

  function run() {
  measureAvail();

  PAGES.forEach(function (p, i) { paginateSection(p, i + 1); });

  /* first page of each section, for the contents list on the cover */
  var firstOf = {};
  sheets.forEach(function (s, i) {
    if (!(s.route in firstOf)) firstOf[s.route] = i + 2;   /* +1 cover, +1 to 1-base */
  });

  /* cover, prepended once the contents are known */
  var cover = document.createElement("div");
  cover.className = "sheet cover";
  cover.innerHTML =
    '<div class="cover-inner">' +
      '<div class="cover-left">' +
        '<div class="p-watermark" aria-hidden="true"><span>AGM</span></div>' +
        '<p class="cover-org">AGM Real Estate Group</p>' +
        '<h1 class="cover-title">Proposal for<br>Management Services</h1>' +
        '<p class="cover-prop">Plaza 600<br>600 Stewart Street, Seattle</p>' +
        '<div class="cover-meta">' + window.PRINT_COVER_META + "</div>" +
      "</div>" +
      '<div class="cover-right">' +
        '<img class="cover-logo" src="' + window.PRINT_LOGO_BLACK + '" alt="AGM Real Estate Group" />' +
        '<p class="cover-toc-label">Contents</p>' +
        '<ul class="cover-toc">' +
          PAGES.map(function (p, i) {
            return '<li><span class="n">' + pad(i + 1) + '</span><span class="t">' +
              p.label + '</span><span class="pg">' + firstOf[p.route] + "</span></li>";
          }).join("") +
        "</ul>" +
        '<div class="cover-foot"><span class="c">Confidential</span><span>' +
          window.PRINT_DATE + "</span></div>" +
      "</div>" +
    "</div>";
  OUT.insertBefore(cover, OUT.firstChild);

  /* A sheet that ends well short of the foot reads as an accident. Nothing can
     be invented to fill it, but the space it does have can be spent on the
     joints between units instead of pooling in one void at the bottom. The
     added space is bounded, and re-measured, so no sheet is pushed over. */
  function distribute() {
    var MAX_JOINT = 46;   /* px — beyond this the page reads as sparse, not airy */
    OUT.querySelectorAll(".p-flow").forEach(function (flow) {
      var units = flow.children.length;
      if (units < 2) return;
      var gap = AVAIL - flow.getBoundingClientRect().height;
      if (gap < 60) return;
      /* a heading stays tight to the text it introduces, so that joint is not
         one of the ones the slack is spent on */
      var joints = [];
      for (var j = 1; j < units; j++) {
        if (flow.children[j - 1].classList.contains("sec-head")) continue;
        joints.push(flow.children[j]);
      }
      if (!joints.length) return;
      var add = Math.min(MAX_JOINT, Math.floor((gap * 0.72) / joints.length));
      if (add < 6) return;
      var applied = [];
      joints.forEach(function (el) {
        var base = parseFloat(getComputedStyle(el).marginTop) || 0;
        applied.push([el, el.style.marginTop]);
        el.style.marginTop = (base + add) + "px";
      });
      if (flow.getBoundingClientRect().height > AVAIL) {
        applied.forEach(function (pair) { pair[0].style.marginTop = pair[1]; });
      }
    });
  }
  distribute();

  /* folios: the cover is page 1 but carries no folio */
  var all = OUT.querySelectorAll(".sheet");
  var total = all.length;
  for (var i = 0; i < total; i++) {
    var f = all[i].querySelector(".p-page");
    if (f) f.textContent = (i + 1) + " / " + total;
  }

  window.PRINT_RESULT = {
    total: total,
    perSection: PAGES.map(function (p) {
      return { route: p.route, pages: sheets.filter(function (s) { return s.route === p.route; }).length };
    }),
    avail: AVAIL
  };
  document.documentElement.setAttribute("data-paginated", "1");
  }

  /* images are resampled for print before anything is measured, because the
     swap changes nothing about layout only if it has already happened */
  (window.PRINT_IMAGES_READY || Promise.resolve()).then(run);
})();
