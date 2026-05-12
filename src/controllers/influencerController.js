const { query } = require('../config/database');

// Codes are stored uppercase and trimmed. Apple's redemption sheet is also
// case-insensitive, so normalising here keeps both sides consistent.
const CODE_REGEX = /^[A-Z0-9_-]{3,32}$/;

function normalizeCode(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().toUpperCase();
  if (!CODE_REGEX.test(trimmed)) return null;
  return trimmed;
}

// POST /api/subscriptions/claim-code
// Body: { code }
// Records the user's intent to redeem an influencer code so we can attribute
// the upcoming Apple offer-code redemption to the right influencer. Does NOT
// grant any discount on its own — Apple does that via the offer code itself.
exports.claimCode = async (req, res, next) => {
  try {
    const code = normalizeCode(req.body && req.body.code);
    if (!code) {
      return res.status(400).json({ error: 'Invalid code format' });
    }

    const result = await query(
      `SELECT code, influencer_name FROM influencer_codes
       WHERE code = $1 AND active = TRUE`,
      [code]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Code not found or inactive' });
    }

    await query(
      `INSERT INTO pending_code_claim (user_id, code, created_at, expires_at)
       VALUES ($1, $2, NOW(), NOW() + INTERVAL '1 hour')
       ON CONFLICT (user_id) DO UPDATE SET
         code = EXCLUDED.code,
         created_at = NOW(),
         expires_at = NOW() + INTERVAL '1 hour'`,
      [req.userId, code]
    );

    res.json({
      ok: true,
      code,
      influencerName: result.rows[0].influencer_name,
      discountPercent: 20,
    });
  } catch (err) {
    next(err);
  }
};

module.exports.normalizeCode = normalizeCode;
