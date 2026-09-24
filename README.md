# AGM Real Estate Group — Plaza 600 Proposal Micro-Site

**CONFIDENTIAL — proposal material prepared for Orton Development. Private repository. Do not make
public.**

A digital micro-site version of AGM's *Proposal for Management Services* for **Plaza 600, 600 Stewart
Street, Seattle, WA 98101** — a twenty-story, 217,322 SF Class A mixed-use commercial tower (office
primary, plaza-level retail) built in 1969 and repositioned 2023–2026.

Each proposal section is its own page in a single-file static site (`index.html`, no build step, no
dependencies). Fonts load from Google Fonts; everything else is inline. This repo is derived from
AGM's commercial and multi-family proposal templates and shares their design system exactly.

## What this is
Thirteen sections, rebuilt as an institutional, navigable micro-site:

1. About AGM · 2. Property Management Team · 3. Investment Strategy · **4. Building Systems &
Engineering** · 5. Construction, Facilities & Capital Projects · **6. Compliance, Life Safety &
Risk** · **7. Tenant Experience & Building Operations** · **8. Office & Retail Leasing Support** ·
9. Financial Management & Reporting · 10. AGM Master Insurance Program · 11. Tools & Technology ·
**12. Management Transition** · 13. Management Fees.

Bold sections are new for this asset; the remainder carry the approved commercial-template copy with
asset-specific blocks appended. The layout, palette (navy `#00202F`, brand blue `#3A8DDE`,
serif/sans pairing), and rail-and-content structure are unchanged from the AGM proposal design
system. Interaction is likewise unchanged — a per-page navy/blue summary rail, an interactive history
timeline, hover-reactive cards and pills, reveal-on-scroll, prev/next paging, a reading-progress bar,
and a light/dark toggle.

## Source material
Asset facts are drawn from the Newmark Offering Memorandum (May 2026), the rent roll dated May 2026,
the incumbent manager's recurring engineering task list (07/22/2026), and the Plaza 600 due diligence
platform AGM built for this engagement (`agm-600-building`). Where a figure was not verifiable it is
described qualitatively rather than stated — see *Editorial rules* below.

## Editorial rules applied
- **Approved language is preserved.** Copy carried over from the commercial and multi-family
  templates is reproduced verbatim, including tone, capitalization of *Ownership*, and the
  kicker / title / description / pill card grammar. New copy is written to the same pattern.
- **No unverified numbers in client-facing claims.** Building facts that appear (217,322 SF, 20
  floors, 1969/2023–26, ~$16.8M / $77 PSF, 123 stalls, 100 Walk & Transit Score) come from the OM.
  Confidential seller/broker figures — in-place rents, NOI, tenant names, the rent roll, vendor
  budget lines, the insurance indication — are deliberately **excluded**; the proposal is a
  capability document, not a diligence document.
- **Occupancy is described, not quantified.** The proposal refers to "substantial vacancy" rather
  than a percentage, so it does not go stale and does not restate the seller's confidential position.
- **Fees are set except the capital and tenant improvement coordination rate.** The management fee
  (3% of gross revenues, minimum $12,500 / month), the $12,500 one-time onboarding fee and the $150
  monthly technology fee are negotiated figures. The Capital Project & Tenant Improvement
  Coordination card still reads `Hourly Rate / % of Project Cost` and must be priced before release.
  Note it was never written as `$X`, so grepping for the placeholder tokens will not find it.

## Repository layout
This deploys as a **Cloudflare Worker with static assets** (not Pages).

```
wrangler.jsonc     Worker + static-asset config
src/index.js       the Worker — password gate, analytics injection
public/            the static site, served through the Worker
  index.html       the proposal (all 13 sections)
  _headers         edge headers
  assets/          AGM brand assets + Plaza 600 photography
print/             landscape PDF print edition (see below)
  build-print.mjs  build script — reads public/index.html, writes the PDF
  paginate.js      measurement-based paginator (runs in the browser)
  optimize-images.js  resamples photography for print resolution
  print.css        page geometry, per-page rail, folios
  fonts.css        Playfair Display + Inter, latin subsets, embedded
  plaza600-proposal.pdf   the built PDF, committed for download
```

## Local preview
```bash
cp .dev.vars.example .dev.vars      # fill in SITE_PASSWORD and GATE_SECRET
npx wrangler dev                    # http://localhost:8787
```
Opening `public/index.html` directly in a browser also works for layout checks, but bypasses the
gate and the analytics injection. Deep-link a section with the URL hash, e.g. `#systems`. (As in
the source templates, the hash is read on load only — there is no `hashchange` listener, so
editing the hash in an already-open tab requires a reload.)

## PDF print edition
A landscape Letter (11in x 8.5in) PDF of the whole proposal is built from the same
`public/index.html`, so the site is the only place copy is edited.

```bash
cd print
npm install                 # playwright-core only; Chromium must already be present
npm run build               # writes print/plaza600-proposal.pdf
npm run build:debug         # also keeps print/.print-build.html to open in a browser
```

The build needs a Chromium binary. It looks in `$CHROME_PATH`, then under
`$PLAYWRIGHT_BROWSERS_PATH` (default `/opt/pw-browsers`). On a machine with none, install one
with `npx playwright install chromium` and point `CHROME_PATH` at it.

`print/package.json` deliberately sits in `print/`, not the repository root. Cloudflare Workers
Builds installs dependencies when it finds a manifest at the root, and the deploy has no need of
any.

### How pagination works
Chromium's own page breaking is not used: it cannot repeat a table header, cannot mark a panel as
continued, and it splits a two-column card grid mid-row, which leaves a half-empty band at the
foot of the page. `paginate.js` instead decomposes each section into the smallest pieces that may
stand alone, measures real laid-out heights, and fills each sheet unit by unit.

- Register tables, card grids, step lists, bullet lists and fee cards are **splittable** and are
  cut on unit boundaries — whole rows, whole grid rows (never one cell of a pair), whole steps.
  A table header repeats on every continuation sheet.
- Metric strips, photo bands, callouts, the timeline and the funnel rail are **atomic** and move
  whole.
- A continuation sheet carries **CONTINUED** on the left rail in place of the section summary.
- A heading, or a heading and the paragraph introducing it, is never left at the foot of a page
  with its content overleaf.
- Each section is laid out several times against progressively lower ceilings and the layout that
  wastes the least paper is kept, so a section does not end on a lone callout.
- Whatever slack is left on a sheet is spent on the joints between units rather than pooling in
  one void at the bottom.
- Folios are stamped after pagination, once the total is known. The cover is page 1 and carries
  no folio.

The build fails (exit 1) if any single unit is taller than one sheet, since that is the one case
where content would be silently clipped.

### Print-specific notes
- The sheet is 11in wide, so the site's own breakpoints see a 1056px viewport and hold the desktop
  layout, but the content column beside the rail is only ~7.1in. `print.css` sets the measures and
  column counts for that width and inherits the rest of the site stylesheet unchanged.
- Fonts are embedded as latin woff2 subsets so the PDF renders identically offline. Regenerate
  them only if the site's font stack changes.
- Photography is resampled through a canvas to roughly 300dpi for its printed size. Without that
  step the PDF is about 10MB; with it, under 4MB, with no visible difference on paper.
- Interactive affordances (hover states, the scroll-reveal fade, buttons) are neutralised for
  print. The scroll-reveal fade in particular must stay neutralised — sections print blank
  otherwise.

## Deploy — Cloudflare Workers
This project uses Workers, not Pages. The other AGM proposal repos are Pages projects; this one
diverges deliberately.

**From the CLI:**
```bash
npx wrangler deploy
```

**From the dashboard (Workers Builds, connected to Git):**

| Setting | Value |
|---|---|
| Build command | *(empty)* |
| Deploy command | `npx wrangler deploy` |
| Root directory | `/` |

There is no "build output directory" setting for a Worker — the output directory is declared as
`assets.directory` in `wrangler.jsonc`. Leave the build command empty; there is no build step.

Either field can carry `npx wrangler deploy` and the deploy will succeed; what matters is that the
*other* field is genuinely empty. A stray value there is executed as a shell command after the
deploy has already completed — e.g. a leftover `/` produces `/bin/sh: 1: /: Permission denied` and
marks the build failed even though the Worker went live. Check the log for
`Deployed <name> triggers` and a Version ID before believing a red build badge.

### Previewing a branch before it reaches production
Pages gives every branch an automatic preview URL. Workers does not; it uses
**versions** instead, and the distinction matters:

| | What it does |
|---|---|
| `npx wrangler versions upload` | Uploads a new **version** and returns its own preview URL. Production traffic is untouched. This is the branch-preview equivalent. |
| `npx wrangler deploy` | Uploads a version **and** points production traffic at it. |

To preview any branch locally:
```bash
git checkout <branch>
npx wrangler versions upload      # prints a preview URL
```

`preview_urls` must be `true` in `wrangler.jsonc` for those URLs to be issued.
The gate applies to them exactly as it does to production, because
`run_worker_first` makes the Worker handle every request on every hostname.

#### Build settings for automatic branch previews
Workers Builds runs a different command depending on the branch. Both must be
set correctly, or non-production branches deploy to production:

| Field | Value | Runs on |
|-------|-------|---------|
| Build command | *(empty)* | every build |
| Deploy command | `npx wrangler deploy` | the production branch only |
| Version command | `npx wrangler versions upload` | non-production branches |

**Do not put `npx wrangler deploy` in the Build command.** The build command runs
on every branch, so a deploy there publishes any pushed branch straight to
production and the version command never gets the chance to make a preview.

### `run_worker_first` is load-bearing
`wrangler.jsonc` sets `assets.run_worker_first: true`. This is what makes the Worker see every
request before Cloudflare's asset server answers it.

**Remove it and the gate is bypassed completely** — `public/index.html` is served directly, with no
cover page and no password. This was verified locally: with the flag off, an unauthenticated request
to `/` returns the full proposal. Do not remove it, and re-test the gate if it is ever touched.

## Access gate — custom password screen (Worker)
The site is protected by a **custom-designed cover / login screen** (a minimal, institutional
white split layout — explanatory copy on the left, password panel on the right, AGM logo top-right),
served by the Worker (`src/index.js`). This runs **server-side**: until the correct password is
submitted, the visitor only ever receives the cover page — the actual proposal
(`public/index.html`) is never sent to the browser. The password lives only as an encrypted
Cloudflare secret, never in the code or the client.

This replaces the standard Zero Trust login screen with AGM's own branded page.

### One-time setup (required before the site will unlock)

| Name | Value | Type |
|------|-------|------|
| `SITE_PASSWORD` | the shared password you give recipients | **Secret** |
| `GATE_SECRET` | any long random string (40+ chars) — signs the session cookie | **Secret** |

Generate the signing key with `openssl rand -hex 32`.

**Via the CLI** (unambiguous, writes to the runtime store by definition):
```bash
npx wrangler secret put SITE_PASSWORD
npx wrangler secret put GATE_SECRET
npx wrangler secret list          # confirms what is actually bound at runtime
```

**Via the dashboard** — read the two traps below first. They cost an hour on the first deploy.

#### Trap 1 — there are TWO "Variables and secrets" sections on one page
Worker → **Settings** has a section list in the right-hand sidebar:

```
Variables and secrets   ← RUNTIME. Use this one. Your Worker reads these as env.X
Observability
Runtime
Builds
  └─ Variables and secrets   ← BUILD-TIME. Only the build command sees these.
Trigger events
General
Danger zone
```

Both cards are labelled identically and look identical (Type dropdown, "Value encrypted",
Rotate). The build-time one is nested inside the **Builds** section, among Git repository, Build
configuration, Branch control, API token and Deploy Hooks. Secrets placed there never reach the
running Worker, and the gate stays stuck on "Access is not configured yet". Use the sidebar to
confirm which section you are in before typing.

#### Trap 2 — Type must be Secret, not Text
Plain **Text** variables set only in the dashboard are **wiped by `npx wrangler deploy`**, because
wrangler treats `wrangler.jsonc` as the source of truth for `vars` and this config declares none.
Since the build command *is* `npx wrangler deploy`, a Text variable survives until the next push
and then silently breaks the gate. Encrypted **Secrets** are preserved across deploys.

Saving a runtime secret creates a new Worker *version*. Check **Deployments** to confirm the newest
version is the one taking traffic — a saved change is not necessarily a live one.

- Until `SITE_PASSWORD` is set, the site fails closed (shows a "not configured yet" notice).
- **Change the password** anytime by editing `SITE_PASSWORD` (existing links keep working; open
  sessions stay valid because `GATE_SECRET` is unchanged).
- **Force everyone to re-enter** by rotating `GATE_SECRET` (or bumping `TOKEN_VERSION` in the
  middleware).
- Sessions last 7 days (`MAX_AGE`); `/__logout` clears the cookie.
- The cover screen's copy (title, description, "Inside this proposal" list, contact line) lives in the
  `coverHTML()` function at the bottom of `src/index.js`.

### Local preview
Copy `.dev.vars.example` → `.dev.vars` (git-ignored), fill in the two values, and run
`npx wrangler dev`.

### What is public before sign-in
Only the two AGM wordmark files (`/assets/agm-logo-black.svg`, `/assets/agm-logo-white.svg`) are
served without authentication, because the cover page displays the logo. This is an explicit
allowlist in `src/index.js` (`PUBLIC_PATHS`), **not** a `/assets/*` prefix rule — the Plaza 600
building photography under `/assets/property/` stays behind the password. If you add an image the
cover page needs, add its exact path to `PUBLIC_PATHS`; do not widen it to a prefix.

### Linking the proposal from another site

**Link to the proposal. Do not put it in an iframe.** A branded link on another site is fine and is
what the Wix pages are for; framing the proposal inside one is what breaks it.

An embed only works if the proposal is served from a subdomain of the site doing the embedding.
Framed from a `*.workers.dev` URL it does not work and cannot be made to work.

This is not a preference. `workers.dev` is on the
[Public Suffix List](https://publicsuffix.org/), which makes every `*.workers.dev` subdomain its own
registrable site. An `<iframe>` of one on `agmrealestategroup.com` is therefore **cross-site**, and
the session cookie the gate issues is a **third-party cookie**. Safari blocks those outright, Chrome
blocks them in Incognito, and Chrome is retiring them generally.

#### The failure is silent, which is what makes it expensive
A blocked cookie does **not** look like a blocked cookie. The password is accepted, the gate issues
the session, the browser discards it, and the redirect to `/` lands back on the cover page with no
error. To the visitor the screen just flickers and nothing happens — indistinguishable from a wrong
password, except that a wrong password redirects to `/?e=denied` and renders "Incorrect password.
Please try again." with a `401`. **If someone reports the password not working and there is no error
message on screen, it is this, not the password.** Do not rotate `SITE_PASSWORD`: it is not the
cause, and rotating it invalidates whatever link has already gone out.

This is how it presented in September 2026, embedded on the Wix page at
`www.agmrealestategroup.com/plaza600proposal`.

#### The fix: link to it, do not frame it
Point the branded Wix URL at the proposal with a plain **301/302 redirect** instead of an embed:

```
www.agmrealestategroup.com/plaza600proposal   --301-->   <worker>.workers.dev
```

The branded per-property link is the thing being handed out; it does not have to be the address in
the bar. After a redirect the visitor is on the Worker **top-level**, so the session cookie is
first-party and no browser blocks it — Safari and Incognito included. No DNS work, no code change.
The trade-off is that the address bar then shows the `workers.dev` hostname.

> **Do not use a masked or cloaked redirect.** Wix offers one on some plans, described as keeping
> your URL in the address bar. It does that by loading the target in a frame, which is the same
> cross-site iframe that caused this, and it will fail the same way.

There is **no Wix-side cookie setting that fixes this.** The cookie is set by this Worker, not by
Wix, and the decision to drop it is the visitor's browser applying its third-party cookie policy.
Wix's cookie controls govern its own consent banner and its own analytics cookies; a consent banner
can *block* an embed until consent is given, but nothing there can exempt a third-party cookie from
Safari's or Chrome's policy.

#### The other fix: a real custom domain
Serving the Worker from `proposal.agmrealestategroup.com` makes an iframe on
`www.agmrealestategroup.com` *same-site* — both are `agmrealestategroup.com` — so the cookie is not
third-party and the embed works, with the branded URL kept in the address bar.

This requires `agmrealestategroup.com` to be an active zone in Cloudflare, with its nameservers
delegated there. A CNAME at an external DNS provider pointing at a `workers.dev` hostname does not
work; Cloudflare will not serve a Worker for a Host header the account does not own as a zone. If
the domain currently lives at Wix, this means migrating DNS, which is its own project.

Order matters if you take this route: attach the domain and confirm it serves **before** setting
`workers_dev: false`, because that removes the only hostname the Worker answers on.

#### `COOKIE_SAMESITE`
The session cookie is `SameSite=Lax`, which is correct for a first-party site and for a same-site
subdomain iframe. Set the optional `COOKIE_SAMESITE` Cloudflare variable to `None` to go back to the
old cross-site behaviour while DNS propagates — it is a plain variable, so it takes effect without a
code change or a redeploy. Any value other than `Lax`, `Strict` or `None` falls back to `Lax` rather
than emitting a malformed cookie.

`None` is a stopgap, not a fix: it *permits* a third-party cookie, it does not stop browsers blocking
one. On a cross-site embed it will keep failing in Safari and in Incognito however it is set.

#### Regression test
`node test/gate.test.mjs` drives real requests through the Worker's own fetch handler with a stubbed
assets binding. No dependencies and no root `package.json`, so the Cloudflare build never sees a
manifest. It asserts the cookie attributes, that a dropped cookie and a wrong password stay
distinguishable, and that neither the proposal body nor the building photography is ever served
without a valid session.

### Note on Zero Trust
This shared-password gate is intentionally simple and needs no per-user setup. If you ever need
**per-person access with an audit trail** (who opened it, when), use Cloudflare Zero Trust Access
instead — but that uses Cloudflare's own login flow, not this custom screen. Don't enable both at once.

## Analytics (PostHog)
The site is fully instrumented for PostHog across **both** the login/cover page and the proposal.
Turn it on by setting these as **environment variables** on the Worker (Settings → Variables and
Secrets), then redeploy:

| Name | Value |
|------|-------|
| `POSTHOG_KEY` | your **Project API Key** (PostHog → Settings → Project → *Project API Key*, starts with `phc_`) |
| `POSTHOG_HOST` | *(optional)* `https://us.i.posthog.com` (US, default) or `https://eu.i.posthog.com` (EU) |

Until `POSTHOG_KEY` is set, analytics stays off — no requests, no errors. The key lives only in
Cloudflare (nothing committed to the repo): the Worker injects it into the cover page and fills in
the proposal's inline placeholder as `public/index.html` is served. (You can still hard-code the key
directly in `index.html`'s marked `<head>` block instead, but that only covers the proposal, not the
gate page, and puts the key in the repo — the env var is preferred.)

What it tracks once the key is set:
- **Cover / login page** — a `$pageview` on load and a `gate_viewed` event (tagged `surface: gate`),
  plus autocapture of the Access click. Lets you see who reaches the gate and whether they bounce.
  The password field is masked in session replays.
- **Proposal — visits** — a virtual `$pageview` per section (URL carries the `#section` hash).
- **Proposal — tab navigation** — a `tab_click` event with `to`, `from`, and `method` (`nav_tab`,
  `pager`, `rail_ticker`, `keyboard`, `brand`).
- **Proposal — time on each tab** — a `section_time` event with `section`, `section_label`, and
  `seconds` when a section is left (open section flushed on tab-hide / exit via `capture_pageleave`).
- **Everything, both pages** — `autocapture` (every click/interaction), **session replays**, and
  click/scroll **heatmaps** are enabled.

All events are tagged with `proposal: plaza600-microsite` (and `surface: gate` on the cover
page) so you can filter gate traffic from in-proposal activity.

## Operational notes
- `public/_headers` enforces `noindex` and security headers at the edge. The Worker also sets them
  on every response it returns (`withSecurityHeaders`), so the guarantee does not depend on
  `_headers` support.
- Property photography lives in `public/assets/property/` (sourced from the OM image set in the
  `agm-600-building` repo) and is used in the About snapshot, the capital-program strip, and the
  retail-operations strip. Swap in higher-resolution originals when available — filenames are
  referenced directly in `index.html`.
- Featured-asset tiles in the *About* portfolio grid still point at the shared AGM portfolio imagery
  (`public/assets/bellevue.png` and siblings).
- **One fee figure on the Fees page is still unpriced: the Capital Project & Tenant Improvement
  Coordination rate, which reads `Hourly Rate / % of Project Cost`.** It must be set before this is
  sent to Orton. Every other amount is negotiated. Property-level staffing and third-party costs
  are marked *At Cost* / *Included* by design — these are operating expenses, not management fees.
- The `topbar-prop` label in `public/index.html` and the `prop-name` on the cover page are already
  set to Plaza 600.
- The cover page's "Inside this proposal" list mirrors the thirteen sections; if a section is added
  or removed, update `coverHTML()` in `src/index.js` to match.

## Review checklist before release
- [ ] Price the Capital Project & Tenant Improvement Coordination rate. Do not verify this by
      grepping `X%` / `$X` — that returns nothing, because the card states a basis rather than a
      placeholder token. Read the card, and check the fee footnote names nothing still outstanding
- [ ] Confirm whether Specialized Role Fees (*Tailored per scope*) needs a figure before release
- [ ] Confirm the property-level staffing treatment (operating expense vs. fee) with leadership
- [ ] Confirm named team members for the Management page, if Ownership expects names
- [ ] Set `SITE_PASSWORD` and `GATE_SECRET` as Worker secrets
- [ ] If the proposal is reached through a branded link on another site, confirm that link is a
      plain redirect and NOT an iframe or a masked redirect — see "Embedding the proposal in
      another site". An embed silently fails to log anyone in on Safari or in Incognito
- [ ] Set `POSTHOG_KEY` if engagement tracking is wanted for this proposal
- [ ] Rebuild the PDF (`cd print && npm run build`) after any copy change, and commit it — the
      committed PDF is what gets emailed, and it does not update itself
- [ ] **Confirm the gate holds on the deployed URL**: in a private window, `/` must return the cover
      page, not the proposal. If the proposal loads with no password prompt, `run_worker_first` is
      not in effect — treat the URL as public until fixed.
