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

## Local preview
Open `index.html` in a browser. That's it. Deep-link a section with the URL hash, e.g.
`index.html#systems`. (As in the source templates, the hash is read on load only — there is no
`hashchange` listener, so editing the hash in an already-open tab requires a reload.)

## Deploy — Cloudflare Pages (AGM standard pattern)
1. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git** → select this repo.
2. Settings: Framework preset **None** · Build command **(empty)** · Build output directory **/**
3. Every push to `main` auto-deploys production; every branch/PR gets its own preview URL.

## Access gate — custom password screen (Pages Functions)
The site is protected by a **custom-designed cover / login screen** (a minimal, institutional
white split layout — explanatory copy on the left, password panel on the right, AGM logo top-right),
served by a Cloudflare Pages Function (`functions/_middleware.js`). This runs **server-side**: until
the correct password is submitted, the visitor only ever receives the cover page — the actual
proposal (`index.html`) is never sent to the browser. The password lives only as an encrypted
Cloudflare secret, never in the code or the client.

This replaces the standard Zero Trust login screen with AGM's own branded page.

### One-time setup (required before the site will unlock)
Cloudflare dashboard → **Workers & Pages → this project → Settings → Variables and Secrets**. Add
both of these for **Production _and_ Preview**, then redeploy:

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
  `coverHTML()` function at the bottom of `functions/_middleware.js`.

### Local preview
Copy `.dev.vars.example` → `.dev.vars` (git-ignored), fill in the two values, and run
`npx wrangler pages dev .`.

### Note on Zero Trust
This shared-password gate is intentionally simple and needs no per-user setup. If you ever need
**per-person access with an audit trail** (who opened it, when), use Cloudflare Zero Trust Access
instead — but that uses Cloudflare's own login flow, not this custom screen. Don't enable both at once.

## Analytics (PostHog)
The site is fully instrumented for PostHog across **both** the login/cover page and the proposal.
Turn it on by setting these as **environment variables** in the Cloudflare Pages project (Settings →
Variables and Secrets), for **Production _and_ Preview**, then redeploy:

| Name | Value |
|------|-------|
| `POSTHOG_KEY` | your **Project API Key** (PostHog → Settings → Project → *Project API Key*, starts with `phc_`) |
| `POSTHOG_HOST` | *(optional)* `https://us.i.posthog.com` (US, default) or `https://eu.i.posthog.com` (EU) |

Until `POSTHOG_KEY` is set, analytics stays off — no requests, no errors. The key lives only in
Cloudflare (nothing committed to the repo): the gate function injects it into the cover page and fills
in the proposal's inline placeholder as `index.html` is served. (You can still hard-code the key
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
- `_headers` enforces `noindex` and security headers at the edge.
- Property photography lives in `assets/property/` (sourced from the OM image set in the
  `agm-600-building` repo) and is used in the About snapshot, the capital-program strip, and the
  retail-operations strip. Swap in higher-resolution originals when available — filenames are
  referenced directly in `index.html`.
- Featured-asset tiles in the *About* portfolio grid still point at the shared AGM portfolio imagery
  (`assets/bellevue.png` and siblings).
- **Fee figures on the Fees page are placeholders (`X%` / `$X`) and must be replaced with the
  negotiated amounts before this is sent to Orton.** Property-level staffing and third-party costs
  are marked *At Cost* / *Included* by design — these are operating expenses, not management fees.
- The `topbar-prop` label in `index.html` and the `prop-name` on the cover page are already set to
  Plaza 600.
- The cover page's "Inside this proposal" list mirrors the thirteen sections; if a section is added
  or removed, update `coverHTML()` in `functions/_middleware.js` to match.

## Review checklist before release
- [ ] Replace every `X%` / `$X` fee placeholder with negotiated figures
- [ ] Confirm the property-level staffing treatment (operating expense vs. fee) with leadership
- [ ] Confirm named team members for the Management page, if Ownership expects names
- [ ] Set `SITE_PASSWORD` and `GATE_SECRET` in Cloudflare Pages, Production **and** Preview
- [ ] Set `POSTHOG_KEY` if engagement tracking is wanted for this proposal
