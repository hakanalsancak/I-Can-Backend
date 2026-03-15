const { query } = require('../config/database');
const crypto = require('crypto');

// Validates Apple StoreKit 2 JWS signed transaction.
// Returns the decoded payload if valid, throws on failure.
function verifyAppleJWS(jwsRepresentation) {
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

  // Verify the root certificate is Apple's Root CA G3 by SHA-256 fingerprint
  const APPLE_ROOT_CA_G3_SHA256 = '63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79';
  const rootCert = new crypto.X509Certificate(toPem(x5c[x5c.length - 1]));
  if (rootCert.fingerprint256 !== APPLE_ROOT_CA_G3_SHA256) {
    throw new Error('Root certificate is not Apple Root CA G3');
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

const VALID_PRODUCT_IDS = new Set([
  'com.hakanalsancak.ican.premium.monthly',
  'com.hakanalsancak.ican.premium.yearly',
]);

exports.getStatus = async (req, res, next) => {
  try {
    const userResult = await query('SELECT email FROM users WHERE id = $1', [req.userId]);
    const email = userResult.rows.length > 0 ? (userResult.rows[0].email || '') : '';
    const isGuest = email.startsWith('guest_') && email.endsWith('@ican.app');
    if (isGuest) {
      return res.json({ status: 'none', isPremium: false });
    }

    const result = await query(
      'SELECT * FROM subscriptions WHERE user_id = $1',
      [req.userId]
    );

    if (result.rows.length === 0) {
      return res.json({ status: 'none', isPremium: false });
    }

    const sub = result.rows[0];
    const now = new Date();
    let isPremium = false;

    if (sub.status === 'trial' && sub.trial_end && new Date(sub.trial_end) > now) {
      isPremium = true;
    } else if (sub.status === 'active' && sub.current_period_end && new Date(sub.current_period_end) > now) {
      isPremium = true;
    }

    res.json({
      status: sub.status,
      isPremium,
      trialEnd: sub.trial_end,
      currentPeriodEnd: sub.current_period_end,
      productId: sub.product_id,
    });
  } catch (err) {
    next(err);
  }
};

exports.verifyReceipt = async (req, res, next) => {
  try {
    const { transactionId, productId, originalTransactionId } = req.body;
    if (!transactionId || !productId) {
      return res.status(400).json({ error: 'Transaction ID and product ID are required' });
    }

    const userResult = await query('SELECT email FROM users WHERE id = $1', [req.userId]);
    if (userResult.rows.length > 0) {
      const email = userResult.rows[0].email || '';
      if (email.startsWith('guest_') && email.endsWith('@ican.app')) {
        return res.status(403).json({
          error: 'Create an account or sign in to subscribe. Guest accounts cannot store subscriptions.',
          code: 'GUEST_ACCOUNT',
        });
      }
    }

    if (!VALID_PRODUCT_IDS.has(productId)) {
      return res.status(400).json({ error: 'Invalid product ID' });
    }

    const { jwsRepresentation } = req.body;
    if (!jwsRepresentation) {
      return res.status(400).json({ error: 'JWS transaction representation is required' });
    }

    let jwsPayload;
    try {
      jwsPayload = verifyAppleJWS(jwsRepresentation);
    } catch (err) {
      return res.status(400).json({ error: 'Apple transaction verification failed: ' + err.message });
    }

    // Cross-check: ensure the JWS payload matches claimed values
    if (
      String(jwsPayload.transactionId) !== String(transactionId) ||
      jwsPayload.productId !== productId
    ) {
      return res.status(400).json({ error: 'Transaction data mismatch' });
    }

    const periodEnd = new Date();
    const isYearly = productId && productId.includes('yearly');
    if (isYearly) {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    } else {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    }

    const result = await query(
      `INSERT INTO subscriptions (user_id, apple_transaction_id, product_id, status,
       current_period_start, current_period_end)
       VALUES ($1, $2, $3, 'active', NOW(), $4)
       ON CONFLICT (user_id) DO UPDATE SET
         apple_transaction_id = EXCLUDED.apple_transaction_id,
         product_id = EXCLUDED.product_id,
         status = 'active',
         current_period_start = NOW(),
         current_period_end = EXCLUDED.current_period_end,
         updated_at = NOW()
       RETURNING *`,
      [req.userId, originalTransactionId || transactionId, productId, periodEnd]
    );

    const sub = result.rows[0];
    res.json({
      status: sub.status,
      isPremium: true,
      currentPeriodEnd: sub.current_period_end,
    });
  } catch (err) {
    next(err);
  }
};
