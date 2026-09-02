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
- **Fees remain placeholders.** All amounts are `X%` / `$X` per template convention and must be
  replaced with negotiated figures before release.

## Repository layout
This deploys as a **Cloudflare Worker with static assets** (not Pages).

```
wrangler.jsonc     Worker + static-asset config
src/index.js       the Worker — password gate, analytics injection
public/            the static site, served through the Worker
  index.html       the proposal (all 13 sections)
  _headers         edge headers
  assets/          AGM brand assets + Plaza 600 photography
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
```bash
npx wrangler secret put SITE_PASSWORD    # the shared password you give recipients
npx wrangler secret put GATE_SECRET      # any long random string, 40+ chars
```

Or via the dashboard → **Workers & Pages → this Worker → Settings → Variables and Secrets**, both
marked **Secret**, then redeploy:

| Name | Value | Mark as |
|------|-------|---------|
| `SITE_PASSWORD` | the shared password you give recipients | **Secret** |
| `GATE_SECRET` | any long random string (40+ chars) — used to sign the session cookie | **Secret** |

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
- **Fee figures on the Fees page are placeholders (`X%` / `$X`) and must be replaced with the
  negotiated amounts before this is sent to Orton.** Property-level staffing and third-party costs
  are marked *At Cost* / *Included* by design — these are operating expenses, not management fees.
- The `topbar-prop` label in `public/index.html` and the `prop-name` on the cover page are already
  set to Plaza 600.
- The cover page's "Inside this proposal" list mirrors the thirteen sections; if a section is added
  or removed, update `coverHTML()` in `src/index.js` to match.

## Review checklist before release
- [ ] Replace every `X%` / `$X` fee placeholder with negotiated figures
- [ ] Confirm the property-level staffing treatment (operating expense vs. fee) with leadership
- [ ] Confirm named team members for the Management page, if Ownership expects names
- [ ] Set `SITE_PASSWORD` and `GATE_SECRET` as Worker secrets
- [ ] Set `POSTHOG_KEY` if engagement tracking is wanted for this proposal
- [ ] **Confirm the gate holds on the deployed URL**: in a private window, `/` must return the cover
      page, not the proposal. If the proposal loads with no password prompt, `run_worker_first` is
      not in effect — treat the URL as public until fixed.
