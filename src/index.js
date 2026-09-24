/* ============================================================================
 * AGM PROPOSAL — PASSWORD GATE  (Cloudflare Worker + static assets)
 * ----------------------------------------------------------------------------
 * LINK to this, do not IFRAME it. Framed on another domain the session cookie
 * is third-party and browsers drop it, so the password is accepted and the
 * visitor lands back on the cover page with no error — a flicker. That is not
 * a password problem and rotating SITE_PASSWORD does not fix it. A branded
 * link that REDIRECTS here is fine; a masked redirect is an iframe and is not.
 * See "Linking the proposal from another site" in README.md.
 * ----------------------------------------------------------------------------
 * Runs in front of every request to this Worker. Until a visitor submits the
 * correct password, they only ever receive the custom cover/login page below —
 * the real proposal (public/index.html) is never sent to the browser. The
 * password itself lives ONLY as an encrypted Cloudflare secret, never in this
 * code or in the client.
 *
 * The static site is bound as env.ASSETS (see wrangler.jsonc). This Worker is
 * configured with `run_worker_first: true`, so it sees every request before
 * the asset server does. If that setting is ever removed, Cloudflare serves
 * public/index.html directly and this gate is bypassed entirely.
 *
 * ── ONE-TIME SETUP ─────────────────────────────────────────────────────────
 *   npx wrangler secret put SITE_PASSWORD    # password given to recipients
 *   npx wrangler secret put GATE_SECRET      # any long random string, 40+ chars
 *
 *   Or: Cloudflare dashboard → Workers & Pages → this Worker → Settings →
 *   Variables and Secrets. Add both as Secret, then redeploy.
 *
 *   • Change the password anytime by editing SITE_PASSWORD (old links keep
 *     working; existing sessions stay valid because GATE_SECRET is unchanged).
 *   • To force everyone to re-enter, rotate GATE_SECRET or bump TOKEN_VERSION.
 *
 * ── LOCAL PREVIEW ───────────────────────────────────────────────────────────
 *   Put SITE_PASSWORD / GATE_SECRET in a `.dev.vars` file (git-ignored) and run
 *   `npx wrangler dev`  — see .dev.vars.example.
 * ========================================================================== */

const COOKIE = "agm_gate";

/* Paths served WITHOUT authentication. Deliberately an explicit allowlist and
 * not a prefix like "/assets/": the cover page needs the AGM wordmark before
 * sign-in, but everything else under /assets/ — including the Plaza 600
 * building photography — stays behind the password. */
const PUBLIC_PATHS = new Set([
  "/assets/agm-logo-black.svg",
  "/assets/agm-logo-white.svg"
]);
const TOKEN_VERSION = "v1";                 // bump to invalidate every session
const MAX_AGE = 60 * 60 * 24 * 7;           // session length: 7 days
const enc = new TextEncoder();

/* ── Session cookie SameSite ───────────────────────────────────────────────
 * Was hard-coded to None so the proposal would work inside an iframe on the
 * AGM Wix site. That backfired: the Worker answers on a *.workers.dev host,
 * workers.dev is on the Public Suffix List, so every *.workers.dev subdomain
 * is its own registrable site. An iframe of it on agmrealestategroup.com is
 * therefore CROSS-SITE, and the session cookie a THIRD-PARTY cookie — which
 * Safari blocks outright, Chrome blocks in Incognito, and Chrome is retiring
 * generally. The password was accepted, the cookie was dropped, and the gate
 * re-rendered the cover page: a flicker with no error message.
 *
 * Lax is correct once the Worker answers on proposal.agmrealestategroup.com,
 * because an iframe of that on www.agmrealestategroup.com is SAME-site (both
 * are agmrealestategroup.com) and Lax cookies are sent on same-site requests.
 *
 * COOKIE_SAMESITE exists so the two can be sequenced independently: it is a
 * plain Cloudflare variable, so reverting to None while DNS propagates needs
 * no code change or redeploy. Anything other than the three legal values
 * falls back to Lax rather than emitting a malformed cookie.
 * ------------------------------------------------------------------------- */
const SAMESITE_VALUES = new Set(["Lax", "Strict", "None"]);
function sameSite(env) {
  const v = String(env.COOKIE_SAMESITE || "").trim();
  const match = [...SAMESITE_VALUES].find((s) => s.toLowerCase() === v.toLowerCase());
  return match || "Lax";
}

/* Attributes shared by the session cookie and the logout tombstone, so the two
 * can never drift — a logout cookie whose attributes differ from the one it is
 * clearing does not clear it. */
function cookieAttrs(env, maxAge) {
  return `Path=/; HttpOnly; Secure; SameSite=${sameSite(env)}; Max-Age=${maxAge}`;
}

/* HMAC-SHA256 → URL-safe base64 */
async function sign(secret, msg) {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return btoa(String.fromCharCode.apply(null, new Uint8Array(sig)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/* the cookie value a valid session must carry */
function gateSecret(env) { return env.GATE_SECRET || env.SITE_PASSWORD || ""; }

/* Legacy cookie: one shared session, no recipient in it. Still accepted so a
 * session issued before per-recipient codes existed is not force-logged-out. */
function expectedToken(env) {
  return sign(gateSecret(env), "authenticated:" + TOKEN_VERSION);
}

/* ── Per-recipient access codes ────────────────────────────────────────────
 * ACCESS_CODES is a JSON object mapping each password to a recipient label:
 *
 *   {"Plaza600-ABC12-DEF34":"orton-development","Plaza600-XYZ98-GHI76":"agm-internal"}
 *
 * The label is what reaches PostHog as the person's distinct_id, so "did the
 * client open it" stops being a guess. SITE_PASSWORD still works and resolves
 * to "shared", which keeps every link already sent out valid.
 *
 * A label is an identity, so it is signed into the cookie rather than merely
 * stored in it — otherwise a visitor could edit the cookie and attribute their
 * reading to someone else. The charset is deliberately narrow: the label is
 * interpolated into a cookie and into a JS string literal on the page.
 * ------------------------------------------------------------------------- */
const LABEL_OK = /^[a-z0-9][a-z0-9-]{0,39}$/;
const SHARED_LABEL = "shared";

function accessCodes(env) {
  const out = [];
  if (env.ACCESS_CODES) {
    let parsed = null;
    try { parsed = JSON.parse(String(env.ACCESS_CODES)); } catch (e) { parsed = null; }
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      for (const [pw, label] of Object.entries(parsed)) {
        const l = String(label).trim().toLowerCase();
        if (pw && LABEL_OK.test(l)) out.push([String(pw), l]);
      }
    }
  }
  if (env.SITE_PASSWORD) out.push([String(env.SITE_PASSWORD), SHARED_LABEL]);
  return out;
}

/* Which recipient does this password belong to? Every candidate is compared,
 * without short-circuiting, so the reply time does not reveal how far down the
 * list a match sat. */
function matchRecipient(env, pw) {
  let hit = null;
  for (const [candidate, label] of accessCodes(env)) {
    if (safeEqual(pw, candidate) && !hit) hit = label;
  }
  return hit;
}

function labelledToken(env, label) {
  return sign(gateSecret(env), "authenticated:" + TOKEN_VERSION + ":" + label);
}

/* Returns the recipient label a cookie proves, or null. */
async function sessionLabel(env, cookie) {
  if (!cookie) return null;
  const dot = cookie.lastIndexOf(".");
  if (dot > 0) {
    const label = cookie.slice(0, dot), sig = cookie.slice(dot + 1);
    if (!LABEL_OK.test(label)) return null;
    return safeEqual(sig, await labelledToken(env, label)) ? label : null;
  }
  return safeEqual(cookie, await expectedToken(env)) ? SHARED_LABEL : null;
}

/* constant-time string compare (avoids timing leaks on the password/cookie) */
function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const ba = enc.encode(a), bb = enc.encode(b);
  if (ba.length !== bb.length) return false;
  let out = 0;
  for (let i = 0; i < ba.length; i++) out |= ba[i] ^ bb[i];
  return out === 0;
}

function readCookie(header, name) {
  const m = (header || "").match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)"));
  return m ? m[1] : null;
}

function htmlHeaders(extra) {
  return Object.assign({
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store, must-revalidate",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
    "Content-Security-Policy": "frame-ancestors *",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer"
  }, extra || {});
}

/* Apply the security headers to a static-asset response. public/_headers is
 * also honoured by the asset server, but the Worker sits in front of every
 * response so setting them here makes the guarantee unconditional. Caching
 * headers are left as the asset server set them. */
function withSecurityHeaders(res) {
  const headers = new Headers(res.headers);
  headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("Content-Security-Policy", "frame-ancestors *");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

/* ── PostHog analytics ─────────────────────────────────────────────────────
 * Configured once via Cloudflare env vars (no key committed to the repo):
 *   POSTHOG_KEY   = your Project API Key (starts with "phc_")   [required to turn on]
 *   POSTHOG_HOST  = https://us.i.posthog.com  (US, default) or  https://eu.i.posthog.com
 * When POSTHOG_KEY is set, tracking is injected into BOTH the cover/login page
 * (below) and the proposal (index.html, by filling in its inline placeholder).
 * Off entirely when POSTHOG_KEY is absent. Inputs are masked in replays.
 * ------------------------------------------------------------------------- */
const POSTHOG_PLACEHOLDER = "phc_REPLACE_WITH_YOUR_PROJECT_API_KEY";
function posthogHost(env) { return env.POSTHOG_HOST || "https://us.i.posthog.com"; }

/* Standard PostHog loader + init, used on the cover page. `surface` tags events
 * so you can tell gate visits apart from in-proposal activity. */
function posthogSnippet(key, host, surface, denied) {
  if (!key) return "";
  const k = String(key).replace(/[<'\\]/g, "");
  const h = String(host).replace(/[<'\\]/g, "");
  const s = String(surface).replace(/[<'\\]/g, "");
  const d = denied ? "true" : "false";
  return `<script>
  !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug getPageViewId captureTraceFeedback captureTraceMetric".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
  posthog.init('${k}', {
    api_host: '${h}',
    person_profiles: 'always',
    autocapture: true,
    capture_pageview: true,
    capture_pageleave: true,
    enable_heatmaps: true,
    // Replay is off by decision: this records a named client reading a
    // proposal. maskAllInputs stays as defence in depth if it is ever re-enabled.
    disable_session_recording: true,
    session_recording: { maskAllInputs: true }
  });
  posthog.register({ proposal: 'plaza600-microsite', surface: '${s}' });
  posthog.capture('gate_viewed', { denied: ${d} });
</script>`;
}

/* Activate the proposal's own inline PostHog by filling in the env key/host as
 * the static index.html streams through the gate. Untouched when no key. */
async function withProposalAnalytics(res, env, recipient) {
  if (!env.POSTHOG_KEY) return res;
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("text/html")) return res;
  let body = await res.text();
  body = body.split(POSTHOG_PLACEHOLDER).join(String(env.POSTHOG_KEY));
  // The recipient label the signed session cookie proved. The page calls
  // posthog.identify() with it, so section times, tab clicks and the sign-in
  // event all attach to a named person instead of an anonymous id. Re-checked
  // against LABEL_OK here because this is interpolated into a JS string.
  if (recipient && LABEL_OK.test(recipient)) {
    body = body.split("window.AGM_RECIPIENT = '';")
               .join("window.AGM_RECIPIENT = '" + recipient + "';");
  }
  if (env.POSTHOG_HOST) {
    body = body.split("window.AGM_POSTHOG_HOST = 'https://us.i.posthog.com';")
               .join("window.AGM_POSTHOG_HOST = '" + String(env.POSTHOG_HOST) + "';");
  }
  const headers = new Headers(res.headers);
  headers.delete("content-length");                 // body length changed
  return new Response(body, { status: res.status, statusText: res.statusText, headers });
}

export default {
  async fetch(request, env, ctx) {
    return handle(request, env);
  }
};

async function handle(request, env) {
  const url = new URL(request.url);

  // Serve the static site from the assets binding. In Pages Functions this was
  // context.next(); under Workers it is an explicit fetch against the binding.
  const asset = () => env.ASSETS.fetch(request);

  // The AGM wordmark is served without authentication so the cover/login page
  // can display it before sign-in. Nothing else is public.
  if (PUBLIC_PATHS.has(url.pathname)) return withSecurityHeaders(await asset());

  // Fail closed if the operator hasn't configured a password yet.
  if (!env.SITE_PASSWORD) {
    return new Response(
      coverHTML({
        error: "Access is not configured yet. Set the SITE_PASSWORD secret on this Cloudflare Worker, then redeploy.",
        analytics: posthogSnippet(env.POSTHOG_KEY, posthogHost(env), "gate")
      }),
      { status: 503, headers: htmlHeaders() }
    );
  }

  // Log out.
  if (url.pathname === "/__logout") {
    const headers = new Headers({ Location: "/" });
    headers.append("Set-Cookie", `${COOKIE}=; ${cookieAttrs(env, 0)}`);
    return new Response(null, { status: 303, headers });
  }

  // Password submission.
  if (request.method === "POST" && url.pathname === "/__access") {
    let pw = "";
    try { pw = String((await request.formData()).get("password") || ""); } catch (e) {}
    const label = matchRecipient(env, pw);
    if (label) {
      const token = label + "." + (await labelledToken(env, label));
      // ?welcome=1 is the one-time sign-in signal the proposal turns into a
      // gate_unlocked event and then strips from the URL. It grants nothing:
      // the signed cookie below is the only thing that authenticates, so the
      // parameter is safe to forge and useless on its own.
      const headers = new Headers({ Location: "/?welcome=1" });
      headers.append(
        "Set-Cookie",
        `${COOKIE}=${token}; ${cookieAttrs(env, MAX_AGE)}`
      );
      return new Response(null, { status: 303, headers });  // → home, now authenticated
    }
    return Response.redirect(url.origin + "/?e=denied", 303);
  }

  // Authenticated? Serve the requested asset (the real site), with analytics
  // switched on if a PostHog key is configured.
  const token = readCookie(request.headers.get("Cookie"), COOKIE);
  const who = await sessionLabel(env, token);
  if (who) {
    return withSecurityHeaders(await withProposalAnalytics(await asset(), env, who));
  }

  // Otherwise, show the cover/login screen for any path.
  const denied = url.searchParams.get("e") === "denied";
  return new Response(
    coverHTML({
      error: denied ? "Incorrect password. Please try again." : "",
      analytics: posthogSnippet(env.POSTHOG_KEY, posthogHost(env), "gate", denied)
    }),
    { status: denied ? 401 : 200, headers: htmlHeaders() }
  );
}


/* ── the custom cover / login screen (institutional split layout) ────────── */
function coverHTML({ error, analytics }) {
  const err = (error || "").replace(/</g, "&lt;");
  const ph = analytics || "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="robots" content="noindex, nofollow" />
${ph}
<title>AGM Real Estate Group &mdash; Plaza 600 Proposal &mdash; Access</title>
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%233A8DDE' d='M4 27 16 5l12 22h-5l-7-13-7 13z'/%3E%3C/svg%3E" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,600;0,700;1,500;1,600&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
<style>
  :root{
    --ink:#0A2540; --ink-70:rgba(10,37,64,0.70); --ink-55:rgba(10,37,64,0.55);
    --ink-40:rgba(10,37,64,0.40); --line:#E6EAEF; --line-strong:#D6DCE4;
    --accent:#3A8DDE; --accent-2:#3DA6F1; --bg:#FAFBFC; --sheet:#FFFFFF;
    --serif:'Playfair Display', Georgia, 'Times New Roman', serif;
    --sans:'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }
  *{box-sizing:border-box;}
  html,body{height:100%;}
  body{margin:0; background:var(--bg); color:var(--ink); font-family:var(--sans); font-size:14px; -webkit-font-smoothing:antialiased; text-rendering:optimizeLegibility; padding:clamp(16px,2.4vw,34px);}
  .sheet{background:var(--sheet); border:1px solid var(--line-strong); border-radius:2px; min-height:calc(100vh - clamp(32px,4.8vw,68px)); display:grid; grid-template-rows:auto 1fr auto; box-shadow:0 1px 2px rgba(10,37,64,.03), 0 18px 50px rgba(10,37,64,.05);}
  .head{display:flex; align-items:center; justify-content:space-between; padding:clamp(20px,2.3vw,30px) clamp(26px,3.6vw,56px); border-bottom:1px solid var(--line);}
  .head .eyebrow{font-size:11px; font-weight:600; letter-spacing:.2em; text-transform:uppercase; color:var(--ink-55);}
  .logo{display:flex; align-items:center;}
  .logo img{display:block; height:34px; width:auto;}
  .body{display:grid; grid-template-columns:1.32fr 1fr; min-height:0;}
  .col{padding:clamp(40px,5vw,84px) clamp(28px,4vw,64px);}
  .col.left{display:flex; flex-direction:column; justify-content:center;}
  .col.right{display:flex; flex-direction:column; justify-content:center; align-items:center; background:var(--accent-2); color:#fff;}
  .kicker{font-size:11px; font-weight:600; letter-spacing:.18em; text-transform:uppercase; color:var(--accent); margin:0 0 22px;}
  .title{font-family:var(--serif); font-weight:600; font-size:clamp(30px,3.7vw,50px); line-height:1.1; letter-spacing:-.01em; color:var(--ink); margin:0 0 10px;}
  .prop-name{font-family:var(--serif); font-weight:500; font-size:clamp(19px,2.4vw,30px); line-height:1.18; letter-spacing:-.01em; color:var(--accent-2); margin:0 0 26px;}
  .lead{font-size:15.5px; line-height:1.72; color:var(--ink-70); margin:0; max-width:38ch;}
  .inside{margin-top:40px; padding-top:26px; border-top:1px solid var(--line);}
  .inside .in-label{font-size:10.5px; font-weight:600; letter-spacing:.18em; text-transform:uppercase; color:var(--ink-40); margin-bottom:16px;}
  .inside ul{margin:0; padding:0; list-style:none; display:grid; grid-template-columns:1fr 1fr; gap:11px 30px;}
  .inside li{font-size:13px; color:var(--ink-70); display:flex; align-items:baseline; gap:10px; line-height:1.35;}
  .inside li::before{content:""; flex:0 0 auto; width:5px; height:5px; border-radius:50%; background:var(--accent); transform:translateY(-1px);}
  .login{max-width:340px; width:100%;}
  .login p.help{font-size:13.5px; line-height:1.65; color:rgba(255,255,255,0.92); margin:0 0 28px;}
  .field{margin-bottom:14px;}
  .field label{display:block; font-size:10.5px; font-weight:600; letter-spacing:.14em; text-transform:uppercase; color:rgba(255,255,255,0.9); margin-bottom:9px;}
  .field input{width:100%; font-family:var(--sans); font-size:14.5px; color:var(--ink); background:#fff; border:1px solid rgba(255,255,255,0.55); border-radius:6px; padding:14px 16px; outline:none; transition:border-color .15s ease, box-shadow .15s ease;}
  .field input::placeholder{color:var(--ink-40);}
  .field input:focus{border-color:#fff; box-shadow:0 0 0 3px rgba(255,255,255,0.35);}
  .btn{width:100%; font-family:var(--sans); font-weight:600; font-size:13px; letter-spacing:.14em; text-transform:uppercase; color:var(--ink); background:#fff; border:1px solid #fff; border-radius:6px; padding:15px 20px; cursor:pointer; transition:background .16s ease, transform .12s ease, box-shadow .16s ease;}
  .btn:hover{background:var(--accent-2); border-color:#fff;}
  .btn:active{transform:translateY(0);}
  .err{min-height:0; margin-top:12px; font-size:12.5px; color:#fff; font-weight:600;}
  .err:not(:empty){display:inline-block; background:rgba(10,37,64,0.30); border:1px solid rgba(255,255,255,0.45); padding:8px 13px; border-radius:6px;}
  .login .assist{margin-top:26px; padding-top:20px; border-top:1px solid rgba(255,255,255,0.28); font-size:12px; line-height:1.6; color:rgba(255,255,255,0.75);}
  .login .assist a{color:#fff; text-decoration:none; font-weight:600;}
  .login .assist a:hover{text-decoration:underline;}
  .foot{display:flex; align-items:center; justify-content:space-between; gap:20px; flex-wrap:wrap; padding:clamp(16px,1.8vw,24px) clamp(26px,3.6vw,56px); border-top:1px solid var(--line);}
  .foot .contact{font-size:12px; color:var(--accent); font-variant-numeric:tabular-nums;}
  .foot .conf{font-size:10.5px; font-weight:600; letter-spacing:.16em; text-transform:uppercase; color:var(--accent);}
  @media(max-width:860px){
    .body{grid-template-columns:1fr;}
    .col.right{border-top:1px solid rgba(255,255,255,0.25);}
    .col{padding:clamp(34px,7vw,56px) clamp(26px,7vw,48px);}
    .login{max-width:none;}
  }
  @media(max-width:520px){
    .logo img{height:28px;}
    .foot{flex-direction:column; align-items:flex-start; gap:8px;}
  }
</style>
</head>
<body>
  <div class="sheet">
    <header class="head">
      <span class="eyebrow">AGM Real Estate Group, LLC</span>
      <span class="logo">
        <img src="/assets/agm-logo-black.svg" alt="AGM Real Estate Group" />
      </span>
    </header>

    <div class="body">
      <section class="col left">
        <h1 class="title">Proposal for Management&nbsp;Services</h1>
        <div class="prop-name">Plaza 600 &mdash; 600 Stewart Street, Seattle</div>
        <p class="lead">AGM Real Estate Group&rsquo;s fully integrated platform spans syndication, asset management, property management, construction management, advisory services, and development &mdash; supporting a diverse portfolio of commercial, multi-family, mixed-use, and community association investments across the region.</p>
        <div class="inside">
          <div class="in-label">Proposal Table of Contents</div>
          <ul>
            <li>About AGM</li>
            <li>Property Management Team</li>
            <li>Investment Strategy</li>
            <li>Building Systems &amp; Engineering</li>
            <li>Construction &amp; Facilities</li>
            <li>Compliance, Life Safety &amp; Risk</li>
            <li>Tenant Experience &amp; Operations</li>
            <li>Office &amp; Retail Leasing Support</li>
            <li>Financial Management &amp; Reporting</li>
            <li>AGM Master Insurance Program</li>
            <li>Tools &amp; Technology</li>
            <li>Management Transition</li>
            <li>Management Fees</li>
          </ul>
        </div>
      </section>

      <section class="col right">
        <form class="login" id="gate" method="POST" action="/__access" autocomplete="off">
          <p class="help">This document is private. Enter the password provided with your invitation to continue.</p>
          <div class="field">
            <label for="pw">Password</label>
            <input type="password" name="password" id="pw" placeholder="Enter password" autocomplete="current-password" required />
          </div>
          <button type="submit" class="btn">Access Proposal</button>
          <div class="err" role="alert" id="err">${err}</div>
          <div class="assist">Need the password? Contact AGM at <a href="tel:+12066228600">206.622.8600</a>.</div>
        </form>
      </section>
    </div>

    <footer class="foot">
      <span class="contact">206.622.8600 &nbsp;&middot;&nbsp; <a href="https://www.agmrealestategroup.com" style="color:inherit;">agmrealestategroup.com</a> &nbsp;&middot;&nbsp; 12330 Northup Way, Bellevue, WA 98005</span>
      <span class="conf">Confidential</span>
    </footer>
  </div>
  <script>
    (function(){
      var input=document.getElementById('pw'), err=document.getElementById('err');
      if(input && err && err.textContent.trim()){ input.focus(); }
    })();
  </script>
</body>
</html>`;
}
