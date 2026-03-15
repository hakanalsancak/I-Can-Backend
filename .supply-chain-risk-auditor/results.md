# Supply Chain Risk Audit Report

**Project:** i-can-backend
**Date:** 2026-03-15
**Total Dependencies Audited:** 15 (14 production + 1 dev)

---

## Executive Summary

The project has **2 critical-risk** and **2 moderate-risk** dependencies out of 15 total. The most urgent issue is the use of `apn` (node-apn), which has been **abandoned since 2017** with an open GitHub issue explicitly warning users to stop using it. The `apple-signin-auth` package is maintained by a single anonymous developer with low community scrutiny. The remaining dependencies are well-maintained, organization-backed packages with no significant risk factors.

---

## High-Risk Dependencies

| Dependency | Version | Risk Factors | Details | Suggested Alternative |
|---|---|---|---|---|
| **apn** | 2.2.0 | Unmaintained, Single maintainer | Last published **Dec 2017** (8+ years stale). 93 open issues. GitHub issue #700 explicitly says "DON'T USE THIS LIB ANYMORE". 2 individual maintainers (argon, florianreinhart). No SECURITY.md. Uses legacy APNS protocol. | **@parse/node-apn** (v7.0.1, actively maintained by Parse community, API-compatible drop-in replacement) or **apns2** (v12.2.0, modern HTTP/2 protocol) |
| **apple-signin-auth** | 2.0.0 | Single maintainer, Low popularity, Inactive maintenance | Single individual maintainer (a-tokyo). ~177 GitHub stars, ~32K weekly downloads. Snyk flags maintenance as "Inactive". No SECURITY.md. Handles security-critical auth token verification. | Implement directly using **jsonwebtoken** + Apple's public JWKS endpoint, or use **passport-apple** (more established ecosystem) |
| **bcryptjs** | 2.4.3 | Single maintainer | Single maintainer (dcode). However: ~3.8K stars, recently updated to v3.0.3 (Nov 2025), actively maintained. Risk is moderate. | **bcrypt** (native C++ addon, faster, org-maintained by kelektiv) — but bcryptjs is acceptable given active maintenance |
| **node-cron** | 3.0.3 | Single maintainer | Single maintainer (merencia). 33 open issues. However: ~3.2K stars, last update Jul 2025, actively maintained. Risk is low-moderate. | **croner** (more modern, better TypeScript support) or **bull** (if job queue semantics are needed) |

## Low-Risk Dependencies (Not Flagged)

The following dependencies are organization-backed, well-maintained, and widely adopted:

- **express** (4.21.0) — expressjs org, ~66K stars
- **cors** (2.8.5) — expressjs org
- **helmet** (8.0.0) — helmetjs org
- **morgan** (1.10.0) — expressjs org
- **express-rate-limit** (7.4.0) — express-rate-limit org
- **pg** (8.13.0) — brianc/node-postgres, widely adopted
- **jsonwebtoken** (9.0.2) — auth0-backed, fixes all known CVEs (v8.5.1 had CVE-2022-23529, CVE-2022-23540)
- **openai** (4.70.0) — OpenAI Inc.
- **google-auth-library** (9.14.0) — Google (googleapis org)
- **@neondatabase/serverless** (0.10.0) — Neon Inc.
- **dotenv** (16.4.0) — motdotla, ~19K stars, widely adopted
- **nodemon** (3.1.0, dev) — remy, ~26K stars

---

## Counts by Risk Factor

| Risk Factor | Count |
|---|---|
| Unmaintained | 1 (apn) |
| Single maintainer | 4 (apn, apple-signin-auth, bcryptjs, node-cron) |
| Low popularity | 1 (apple-signin-auth) |
| High-risk features | 0 |
| Past CVEs | 0 (jsonwebtoken v9.0.2 already patches known CVEs) |
| No security contact | 2 (apn, apple-signin-auth) |

---

## Recommendations

1. **CRITICAL — Replace `apn` immediately.** Migrate to `@parse/node-apn` (drop-in replacement) or `apns2`. The package has been abandoned for 8+ years and may have unpatched security issues in its TLS/HTTP handling.

2. **HIGH — Evaluate `apple-signin-auth` replacement.** This package handles security-critical authentication with minimal community oversight. Consider implementing Apple Sign-In verification directly using `jsonwebtoken` and Apple's JWKS endpoint, which gives you full control over the verification logic.

3. **LOW — Monitor `bcryptjs` and `node-cron`.** Both are single-maintainer but actively maintained. Pin exact versions and monitor for maintainer changes or suspicious releases.

4. **GOOD — `jsonwebtoken` v9.0.2 is current.** All known CVEs (CVE-2022-23529, CVE-2022-23540) were fixed in v9.0.0. No action needed.

5. **Run `npm audit` regularly** to catch newly disclosed vulnerabilities in transitive dependencies.
