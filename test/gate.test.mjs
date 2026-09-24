/* ============================================================================
 * GATE REGRESSION TEST
 * ----------------------------------------------------------------------------
 *   node test/gate.test.mjs        (no dependencies, no package.json — plain
 *                                   node, so the Cloudflare build never sees a
 *                                   manifest it might try to install)
 *
 * Drives real Requests through the Worker's own fetch handler with a stubbed
 * ASSETS binding. Covers three things that have each been a live incident or a
 * near miss:
 *
 *   1. The session cookie's SameSite value. Hard-coded None once broke the
 *      embed on the AGM Wix site: cross-site iframe, third-party cookie,
 *      browsers dropped it. See "Embedding" in README.md.
 *   2. The difference between the two failure paths — a dropped cookie renders
 *      the cover page with NO error, a wrong password renders 401 with one.
 *      Confusing them sent us rotating a password that was never wrong.
 *   3. The gate staying shut: the proposal body and the building photography
 *      must never appear without a valid cookie.
 * ========================================================================== */
import worker from "../src/index.js";

const PW = "test-password-not-a-real-one";
const baseEnv = {
  SITE_PASSWORD: PW,
  GATE_SECRET: "x".repeat(48),
  ASSETS: { fetch: () => new Response("<html><body>PROPOSAL BODY</body></html>",
            { headers: { "content-type": "text/html" } }) }
};
const ORIGIN = "https://proposal.agmrealestategroup.com";
const call = (path, opts = {}, env = baseEnv) =>
  worker.fetch(new Request(ORIGIN + path, opts), env, {});
const form = (pw) => ({ method: "POST", body: new URLSearchParams({ password: pw }) });

let fails = 0;
const t = (name, cond, detail = "") => {
  if (!cond) fails++;
  console.log((cond ? "  ok   " : "  FAIL ") + name + (cond ? "" : "  << " + detail));
};

console.log("\n— correct password, default config —");
let r = await call("/__access", form(PW));
let sc = r.headers.get("set-cookie") || "";
t("303 redirect", r.status === 303, "got " + r.status);
t("Location carries the sign-in signal", r.headers.get("location") === "/?welcome=1",
  r.headers.get("location"));
t("SameSite=Lax by default", /SameSite=Lax/.test(sc), sc);
t("not SameSite=None", !/SameSite=None/.test(sc), sc);
t("Secure and HttpOnly", /Secure/.test(sc) && /HttpOnly/.test(sc), sc);
t("seven-day Max-Age", /Max-Age=604800/.test(sc), sc);

console.log("\n— that cookie authenticates —");
r = await call("/", { headers: { Cookie: sc.split(";")[0] } });
let body = await r.text();
t("serves the proposal", r.status === 200 && body.includes("PROPOSAL BODY"), r.status);

console.log("\n— dropped cookie: the SILENT path (the flicker) —");
r = await call("/");
body = await r.text();
t("200, cover page", r.status === 200, r.status);
t("shows NO error message", !body.includes("Incorrect password"), "error text leaked");
t("does not serve the proposal", !body.includes("PROPOSAL BODY"), "LEAKED");

console.log("\n— wrong password: the LOUD path —");
r = await call("/__access", form("wrong"));
t("303 to ?e=denied", r.status === 303 && /\?e=denied$/.test(r.headers.get("location") || ""),
  r.headers.get("location"));
r = await call("/?e=denied");
body = await r.text();
t("401 status", r.status === 401, r.status);
t("shows 'Incorrect password'", body.includes("Incorrect password"), "missing");

console.log("\n— COOKIE_SAMESITE override —");
r = await call("/__access", form(PW), { ...baseEnv, COOKIE_SAMESITE: "None" });
t("None honoured", /SameSite=None/.test(r.headers.get("set-cookie") || ""), "");
r = await call("/__access", form(PW), { ...baseEnv, COOKIE_SAMESITE: "garbage; Path=/evil" });
sc = r.headers.get("set-cookie") || "";
t("junk falls back to Lax", /SameSite=Lax/.test(sc), sc);
t("junk cannot inject cookie attributes", !/evil/.test(sc), sc);

console.log("\n— logout clears with matching attributes —");
sc = (await call("/__logout")).headers.get("set-cookie") || "";
t("Max-Age=0", /Max-Age=0/.test(sc), sc);
t("SameSite matches the session cookie", /SameSite=Lax/.test(sc), sc);

console.log("\n— the gate stays shut —");
body = await (await call("/assets/property/building-photo-dusk.jpg")).text();
t("photography stays behind the gate", !body.includes("PROPOSAL BODY"), "leaked");
t("wordmark stays public", (await call("/assets/agm-logo-white.svg")).status === 200, "");

/* ── per-recipient access codes ─────────────────────────────────────────── */
const CODES = { "code-orton": "orton-development", "code-agm": "agm-internal" };
const multiEnv = { ...baseEnv, ACCESS_CODES: JSON.stringify(CODES) };
const labelOf = (setCookie) => (setCookie.split(";")[0].split("=")[1] || "").split(".")[0];

console.log("\n— each code issues its own labelled session —");
for (const [code, label] of Object.entries(CODES)) {
  r = await call("/__access", form(code), multiEnv);
  sc = r.headers.get("set-cookie") || "";
  t(`${code} -> ${label}`, labelOf(sc) === label, labelOf(sc));
  t(`${code} redirects to /?welcome=1`, r.headers.get("location") === "/?welcome=1",
    r.headers.get("location"));
}

console.log("\n— SITE_PASSWORD still works, as 'shared' —");
r = await call("/__access", form(PW), multiEnv);
sc = r.headers.get("set-cookie") || "";
t("labelled 'shared'", labelOf(sc) === "shared", labelOf(sc));

console.log("\n— a label cannot be forged —");
r = await call("/__access", form("code-agm"), multiEnv);
const agmCookie = (r.headers.get("set-cookie") || "").split(";")[0];
const forged = agmCookie.replace("agm-internal", "orton-development");
r = await call("/", { headers: { Cookie: forged } }, multiEnv);
body = await r.text();
t("swapped label is rejected", !body.includes("PROPOSAL BODY"), "FORGERY ACCEPTED");
r = await call("/", { headers: { Cookie: "agm_gate=orton-development.notasignature" } }, multiEnv);
body = await r.text();
t("bare label with junk signature rejected", !body.includes("PROPOSAL BODY"), "FORGERY ACCEPTED");

console.log("\n— a legacy cookie is still honoured —");
const legacyEnv = { ...multiEnv };
r = await call("/__access", form(PW), { SITE_PASSWORD: PW, GATE_SECRET: baseEnv.GATE_SECRET,
                                        ASSETS: baseEnv.ASSETS });
t("wrong code is refused", (await call("/__access", form("not-a-code"), multiEnv)).headers.get("location")
  === "https://proposal.agmrealestategroup.com/?e=denied", "");

console.log("\n— malformed ACCESS_CODES does not open the gate —");
for (const bad of ["not json", "[]", '{"pw":"BAD LABEL!"}', '{"pw":""}', "null"]) {
  const e = { ...baseEnv, ACCESS_CODES: bad };
  r = await call("/__access", form("pw"), e);
  t(`${bad.slice(0, 18)} refused`, /\?e=denied$/.test(r.headers.get("location") || ""),
    r.headers.get("location"));
}

console.log("\n— the recipient reaches the page —");
r = await call("/__access", form("code-orton"), multiEnv);
const ortonCookie = (r.headers.get("set-cookie") || "").split(";")[0];
const phEnv = { ...multiEnv, POSTHOG_KEY: "phc_test",
  ASSETS: { fetch: () => new Response(
    "<html><head><script>window.AGM_RECIPIENT = '';</script></head><body>PROPOSAL BODY</body></html>",
    { headers: { "content-type": "text/html" } }) } };
body = await (await call("/", { headers: { Cookie: ortonCookie } }, phEnv)).text();
t("AGM_RECIPIENT is filled in", body.includes("window.AGM_RECIPIENT = 'orton-development';"),
  "not injected");

console.log("\n— analytics stays off without a key —");
body = await (await call("/", { headers: { Cookie: ortonCookie } }, multiEnv)).text();
t("placeholder untouched", !body.includes("orton-development"), "leaked without a key");

console.log(fails ? `\n${fails} FAILURES\n` : "\nall assertions pass\n");
process.exit(fails ? 1 : 0);
