# Security Audit Report — I Can Backend

**Date:** 2026-03-15
**Target:** i-can-backend (Node.js / Express / PostgreSQL)
**Auditor:** Claude Opus 4.6 (automated)
**Methodology:** Supply chain audit, insecure defaults scan, Semgrep static analysis (160 rules), sharp-edges review, rigorous false positive verification (Phase 1-5 with gate reviews and PoC)

---

## Executive Summary

The I Can backend is well-built with strong security fundamentals: parameterized SQL queries, bcrypt password hashing, JWT token rotation, rate limiting, and Helmet security headers. One **high-severity** issue requires immediate attention: a bypassable Apple receipt verification that could grant free premium access. The critical dependency vulnerability (`apn`) has already been fixed during this audit.

**Verified findings:** 6 true positives (1 resolved, 1 high, 4 low/informational)
**Rejected findings:** 3 false positives (with rigorous evidence)

---

## Prioritized Vulnerability List

### RESOLVED — Fixed During This Audit

#### 1. Abandoned `apn` package with vulnerable transitive dependencies

**Location:** `package.json` (formerly `"apn": "^2.2.0"`)
**Source:** Supply chain audit + npm audit
**Status:** RESOLVED — replaced with `@parse/node-apn@7.1.0`

**CVEs (now patched):**
- `jsonwebtoken <=8.5.1` (bundled by old apn): GHSA-8cf7-32gw-wr33, GHSA-hjrf-2m68-5959, GHSA-qwph-4952-7xr6
- `node-forge <=1.3.1` (bundled by old apn): 11 CVEs including prototype pollution, improper signature verification

**Verification:** `npm audit` now reports 0 vulnerabilities. `package-lock.json` confirms transitive deps updated to `jsonwebtoken@9.0.3` and `node-forge@1.3.2`. The `require('apn')` in `src/config/apns.js` has been changed to `require('@parse/node-apn')`.

---

### HIGH — Fix Before Next Deploy

#### 2. Apple JWS receipt verification root CA not pinned — premium bypass

**Location:** `src/controllers/subscriptionController.js:35-39`
**Source:** Sharp-edges analysis
**Verification:** Full Phase 1-4 deep verification with executable PoC

**Vulnerable code:**
```javascript
const rootCert = new crypto.X509Certificate(toPem(x5c[x5c.length - 1]));
if (!rootCert.subject.includes('Apple')) {
  throw new Error('Root certificate is not issued by Apple');
}
```

**Phase 1 — Data Flow Analysis:**

| Trust Boundary | Location | Attacker Control |
|----------------|----------|-----------------|
| HTTP input → `req.body.jwsRepresentation` | `subscriptionController.js:139` | Full control |
| JWS header parse → `header.x5c` array | `subscriptionController.js:12,17` | Full control (base64url decoded from attacker input) |
| x5c → PEM certificates | `subscriptionController.js:21-24` | Full control (attacker-generated certs) |
| Chain verification | `subscriptionController.js:27-33` | Passes — attacker's chain is internally consistent |
| Root subject check | `subscriptionController.js:37` | Bypassed — attacker puts "Apple" in subject CN |
| JWS signature verify | `subscriptionController.js:63-66` | Passes — attacker holds leaf private key |
| Cross-check (transactionId, productId) | `subscriptionController.js:152-157` | Bypassed — attacker controls both JWS payload and `req.body` |
| DB INSERT (premium granted) | `subscriptionController.js:167-179` | SINK — attacker gets `status='active'` subscription |

**What is NOT checked (and should be):**
- Root certificate fingerprint pinning against Apple's actual Root CA G3
- Certificate validity dates
- Key usage / extended key usage extensions
- Basic constraints extension (is the root actually a CA?)
- OCSP / CRL revocation status

**Phase 2 — Exploitability Verification:**

The attack requires exactly one authenticated HTTP request. Preconditions:
1. Attacker has a registered account (free registration, no barrier)
2. Attacker generates a self-signed ECDSA cert chain with "Apple" in subject (`openssl` one-liner)
3. No server-side validation against Apple's App Store Server API

All preconditions are trivially met.

**Phase 3 — Impact Assessment:**

- **Real impact:** Any authenticated user can obtain premium access (monthly or yearly) without paying. This is a direct revenue loss vulnerability.
- **Operational impact:** The attacker's fake `transactionId` is stored in the `subscriptions` table, which could cause data integrity issues if Apple reconciliation is ever added.
- **Blast radius:** Per-user exploitation. Each attacker must craft their own request, but the attack is automatable.

**Phase 4 — PoC:**

An executable PoC is at `poc-apple-jws-bypass.js`. It:
1. Generates a self-signed ECDSA root CA with `CN=Apple Root CA - G3 Fake`
2. Issues a leaf cert from this root
3. Constructs and signs a JWS with fake subscription data
4. Calls the vulnerable `verifyAppleJWS()` function — **verification passes, payload returned**
5. Calls a hardened version with fingerprint pinning — **verification correctly rejects**

Run: `node poc-apple-jws-bypass.js`

**Phase 5 — Gate Review:**

| Gate | Verdict | Evidence |
|------|---------|----------|
| Process gate | PASS | Full Phase 1-4 executed with data flow trace, exploitability proof, PoC |
| Reachability gate | PASS | `POST /api/subscriptions/verify` → `authenticate` → `verifyReceipt` → `verifyAppleJWS()`. Only requires valid JWT (free registration). |
| Real Impact gate | PASS | Grants `status='active'` subscription in DB. `checkPremiumAccess()` returns `true`. Revenue loss. |
| PoC Validation gate | PASS | `poc-apple-jws-bypass.js` demonstrates full exploit chain. No mocking or bypasses. |
| Math Bounds gate | N/A | Not a numeric/overflow issue. Cryptographic proof: Node.js `crypto.X509Certificate` accepts any valid PEM including self-signed; `.subject` returns full DN string; `.verify()` only checks signature, not trust anchoring. |
| Environment gate | PASS | No OS/runtime/framework protection prevents this logic bug. JWT auth gates endpoint access but does not validate JWS content. |

**VERDICT: TRUE POSITIVE (HIGH)**

**Fix:** Pin to Apple's actual root CA certificate SHA-256 fingerprint:

```javascript
const APPLE_ROOT_CA_G3_FINGERPRINT = 'b52cb02fd567e0359fe8fa4d4c41c737010f20b6f084e3cf2f49a965da7f8208';

const rootCert = new crypto.X509Certificate(toPem(x5c[x5c.length - 1]));
const rootFingerprint = rootCert.fingerprint256.replace(/:/g, '').toLowerCase();
if (rootFingerprint !== APPLE_ROOT_CA_G3_FINGERPRINT) {
  throw new Error('Root certificate is not Apple Root CA G3');
}
```

Alternatively, use Apple's official [App Store Server Library for Node.js](https://github.com/apple/app-store-server-library-node) which handles all verification correctly.

---

### LOW / INFORMATIONAL — Fix When Convenient

#### 3. SSL certificate verification disabled in non-production

**Location:** `src/config/database.js:5-7`
**Source:** Semgrep scan (rule: `bypass-tls-verification`)

**Phase 1 — Data Flow:** `process.env.NODE_ENV` (environment-controlled) → strict equality `=== 'production'` → `ssl.rejectUnauthorized` in `pg` Pool. If NODE_ENV is unset, empty, `"staging"`, or anything other than `"production"`, TLS cert verification is disabled. Connections to Neon cloud DB over public internet without cert verification are vulnerable to active MITM.

**Phase 2 — Exploitability:** Requires active MITM position between dev machine and Neon servers (e.g., compromised WiFi). Connection is still TLS-encrypted (sslmode=require in connection string), preventing passive sniffing.

**Gate Review:** Reachability PASS (code executes on startup), Real Impact LOW (dev-only, TLS still encrypted), Environment PARTIAL (production forces `rejectUnauthorized: true`).

**VERDICT: TRUE POSITIVE (Low)** — Hardening recommendation. Production is secure.

**Fix:** `ssl: { rejectUnauthorized: process.env.DB_SKIP_SSL_VERIFY !== 'true' }`

#### 4. JWT secret validation only warns in non-production

**Location:** `src/index.js:6-12`
**Source:** Insecure defaults analysis

**Phase 1 — Data Flow:** `process.env.JWT_SECRET` → length check → production: `throw Error` (hard crash), non-production: `console.warn` (app continues). If `.env.example` is copied without changing secrets (`your-jwt-secret-here` = 23 chars, below 32 minimum), the app runs with a predictable secret.

**Phase 2 — Exploitability:** Requires staging/dev instance to be network-accessible AND configured with weak secret AND `NODE_ENV !== 'production'`. Production is protected by hard crash.

**Gate Review:** Reachability PASS, Real Impact LOW (non-production only), Environment PASS (production crashes).

**VERDICT: TRUE POSITIVE (Low/Informational)** — Defense-in-depth. Current design (warn in dev, crash in prod) is a common pattern.

#### 5. No "logout all devices" endpoint

**Location:** `src/controllers/authController.js:426-439`
**Source:** Sharp-edges analysis

**Phase 1 — Data Flow:** Logout at line 431 only deletes `WHERE token_hash = $1 AND user_id = $2` (single token). `MAX_REFRESH_TOKENS_PER_USER = 5` at line 12 confirms multi-device design. No endpoint exists to revoke all sessions (the bulk delete pattern exists only in `deleteAccount` at line 555).

**Phase 2 — Exploitability:** If an attacker steals a refresh token from a compromised device, the victim logging out on their own device does not revoke the stolen token. The stolen token remains valid for up to 7 days. Access tokens (1-hour lifetime) are stateless JWTs with no server-side revocation.

**Gate Review:** Reachability PASS, Real Impact LOW-MEDIUM (requires prior token theft), Environment: 7-day token expiry and 5-token cap limit exposure.

**VERDICT: TRUE POSITIVE (Low-Medium)** — Missing security feature, not a broken feature.

**Fix:** Add a `POST /api/auth/logout-all` endpoint: `DELETE FROM refresh_tokens WHERE user_id = $1`.

#### 6. Account deletion queries not wrapped in a transaction

**Location:** `src/controllers/authController.js:550-557`
**Source:** Sharp-edges analysis

**Phase 1 — Data Flow:** Eight sequential `DELETE` queries using `query()` (auto-commit per statement). If the server crashes between query 6 (refresh_tokens) and query 8 (users), the user row remains but all their data is gone.

**Phase 2 — Exploitability:** Not security-exploitable. No attacker-advantageous state is created. This is a data integrity concern (partial deletion could violate GDPR right-to-erasure requirements).

**Gate Review:** Reachability PASS, Real Impact LOW (data integrity, rare failure mode), Environment: PostgreSQL individual query atomicity limits blast radius.

**VERDICT: TRUE POSITIVE (Low — Data Integrity)**

**Fix:** Wrap in `BEGIN`/`COMMIT`/`ROLLBACK` using `getClient()`.

---

## False Positives (Rejected with Evidence)

### FP-1: CORS allows no-origin requests

**Claim:** `index.js:49` — `if (!origin) return cb(null, true)` bypasses CORS.

**Phase 1 — Data Flow:** Traced all 29 route definitions. Every sensitive endpoint (entries, friends, reports, subscriptions, etc.) is protected by the `authenticate` middleware at `auth.js:3-20`. Unauthenticated endpoints (register, login, social auth, refresh, check-username) are inherently public operations.

**Evidence:** CORS is a browser-only enforcement mechanism. Native iOS apps (the primary client) never send Origin headers. Blocking no-origin would break the app. JWT authentication is the actual access control gate, not CORS.

**VERDICT: FALSE POSITIVE** — Correct design for a mobile API backend.

### FP-2: JWT `algorithms` not pinned in `jwt.verify()`

**Claim:** `auth.js:11,27` — `jwt.verify(token, process.env.JWT_SECRET)` without `{ algorithms: ['HS256'] }` enables algorithm confusion.

**Phase 2 — Exploitability (rigorous library analysis):**

Analysis of `jsonwebtoken@9.0.3` source (`node_modules/jsonwebtoken/verify.js`):

| Attack Vector | Library Defense | Result |
|---------------|----------------|--------|
| `alg: "none"` (empty sig) | `verify.js:108-109`: if `!hasSignature && secretOrPublicKey` → `JsonWebTokenError('jwt signature is required')` | **BLOCKED** |
| `alg: "none"` (fake sig) | `verify.js:132-134`: string secret → `createSecretKey()` → type `'secret'` → auto-restrict to `['HS256','HS384','HS512']`. `'none'` not in list → `JsonWebTokenError('invalid algorithm')` | **BLOCKED** |
| `alg: "RS256"` (confusion) | Same auto-restriction: `'RS256'` not in `['HS256','HS384','HS512']` → `JsonWebTokenError('invalid algorithm')`. Additional cross-check at `verify.js:148-152`: HS requires `type === 'secret'`, RS requires `type === 'public'`. | **BLOCKED** |
| `alg: "HS384"/"HS512"` | Allowed by auto-restriction, but attacker cannot compute valid HMAC without knowing the secret (>= 32 chars, validated at startup). | **BLOCKED** (secret unknown) |

**Mathematical proof:** When `secretOrPublicKey` is a string, `createPublicKey()` fails (not valid PEM/DER), falls to `createSecretKey()`, resulting in `KeyObject.type === 'secret'`. This triggers the auto-restrict at `verify.js:132-134` to HS algorithms only. All non-HS algorithms are rejected at `verify.js:144-146`.

**VERDICT: FALSE POSITIVE** — Not exploitable with jsonwebtoken v9.0.3 + string HMAC secret. Pinning `algorithms: ['HS256']` is a hygiene improvement, not a security fix.

### FP-3: User input prompt injection in AI chat

**Claim:** User data (sport, name, mantra, journal entries) interpolated into OpenAI prompts enables prompt injection.

**Phase 1 — Data Flow:** User-controlled data → string interpolation → OpenAI `chat.completions.create()` with **no `tools`, no `function_call`, no code execution**. AI response → returned only to the same user.

**Evidence:**
- AI cannot take system actions (no function calling configured)
- No cross-user impact (each request scoped by `req.userId`)
- Worst case: user makes AI deviate from sports persona or leak system prompt (which is in source code)
- Input length-limited: sport/mantra 200 chars, name 100 chars, message 2000 chars

**VERDICT: FALSE POSITIVE** — Self-injection with no system actions, no cross-user impact, no data breach possible. Quality/abuse concern, not a security vulnerability.

---

## Supply Chain Risk Summary

| Dependency | Risk Level | Status |
|------------|-----------|--------|
| ~~**apn**~~ **@parse/node-apn** | ~~Critical~~ Resolved | Replaced during audit — 0 vulnerabilities |
| **apple-signin-auth** | Moderate | Single maintainer (a-tokyo), ~177 stars, inactive maintenance. Monitor or replace. |
| **bcryptjs** | Low | Single maintainer but actively updated (v3.0.3, Nov 2025). Monitor. |
| **node-cron** | Low | Single maintainer but actively updated (v4.2.1, Jul 2025). Monitor. |
| All others | None | Organization-backed, well-maintained |

Full supply chain report: `.supply-chain-risk-auditor/results.md`

---

## Static Analysis Summary

| Tool | Rules Run | Findings |
|------|-----------|----------|
| Semgrep (p/javascript, p/nodejs, p/jwt) | 68 | 1 (TLS bypass in dev — verified as Low) |
| Semgrep (p/owasp-top-ten, p/security-audit, p/xss) | 86 | 0 |
| Semgrep (p/sql-injection) | 6 | 0 |
| npm audit (post-fix) | — | 0 vulnerabilities |

Full Semgrep results: `static_analysis_semgrep_1/`

---

## What's Done Well

- Parameterized SQL queries throughout — 0 SQL injection findings across 160 Semgrep rules
- bcrypt with 12 rounds for password hashing
- JWT token rotation with SHA-256 hashed refresh tokens stored in DB
- Rate limiting on auth (10/15min) and AI (10/hr) endpoints
- Helmet with HSTS preload (1-year max-age)
- Secret sanitization in error handler logs (DB URLs, tokens, passwords redacted)
- Startup validation of JWT secret minimum length (32 chars) with hard crash in production
- Apple/Google OAuth token verification with audience checks and `ignoreExpiration: false`
- Reserved email domain blocking (@ican.seed, @ican.app)
- `.env` and `.p8` files properly gitignored and never committed to git history
- jsonwebtoken v9.0.3 with built-in algorithm confusion protection
- Refresh token rotation (old token deleted on refresh, new one issued)
- Per-user token limit (5 concurrent sessions, oldest evicted)

---

## Artifacts

| File | Description |
|------|-------------|
| `SECURITY_AUDIT_REPORT.md` | This report |
| `.supply-chain-risk-auditor/results.md` | Full supply chain dependency audit |
| `static_analysis_semgrep_1/` | Semgrep SARIF results and rulesets log |
| `poc-apple-jws-bypass.js` | Executable PoC for Apple JWS bypass (Finding #2) |
