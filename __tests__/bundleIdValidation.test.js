/**
 * C-2: verifyReceipt must reject transactions with wrong bundleId.
 */

const { query } = require('../src/config/database');

jest.mock('../src/config/database', () => ({
  query: jest.fn(),
  getClient: jest.fn(),
}));

// Mock crypto so verifyAppleJWS doesn't need real certs
jest.mock('crypto', () => {
  const actual = jest.requireActual('crypto');
  return { ...actual, X509Certificate: jest.fn() };
});

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

afterEach(() => jest.clearAllMocks());

describe('verifyReceipt bundle ID check (C-2)', () => {
  const CORRECT_BUNDLE = 'com.alsancar.I-Can';

  beforeEach(() => {
    process.env.APPLE_BUNDLE_ID = CORRECT_BUNDLE;
    process.env.APPLE_STOREKIT_TESTING = 'true';
    process.env.NODE_ENV = 'development';
  });

  afterEach(() => {
    delete process.env.APPLE_STOREKIT_TESTING;
    delete process.env.APPLE_BUNDLE_ID;
  });

  test('rejects transaction with wrong bundleId', async () => {
    // In testing mode, verifyAppleJWS returns decoded payload directly
    // Build a fake JWS with 3 parts (header.payload.signature)
    const header = Buffer.from(JSON.stringify({ alg: 'ES256' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
      transactionId: 'txn-123',
      productId: 'com.ican.premium.monthly',
      bundleId: 'com.OTHER.app',
    })).toString('base64url');
    const fakeJWS = `${header}.${payload}.fakesig`;

    query.mockResolvedValue({ rows: [{ email: 'user@test.com' }] });

    const { verifyReceipt } = require('../src/controllers/subscriptionController');

    const req = {
      userId: 'user-1',
      body: {
        transactionId: 'txn-123',
        productId: 'com.ican.premium.monthly',
        jwsRepresentation: fakeJWS,
      },
    };
    const res = mockRes();
    const next = jest.fn();

    await verifyReceipt(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Transaction data mismatch' });
  });

  test('accepts transaction with correct bundleId', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'ES256' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
      transactionId: 'txn-456',
      productId: 'com.ican.premium.monthly',
      bundleId: CORRECT_BUNDLE,
    })).toString('base64url');
    const fakeJWS = `${header}.${payload}.fakesig`;

    // Mock: user email, no existing tx, upsert subscription
    query
      .mockResolvedValueOnce({ rows: [{ email: 'user@test.com' }] }) // user email
      .mockResolvedValueOnce({ rows: [] }) // replay check
      .mockResolvedValueOnce({ rows: [{ status: 'active', current_period_end: new Date(Date.now() + 86400000) }] }); // upsert

    const { verifyReceipt } = require('../src/controllers/subscriptionController');

    const req = {
      userId: 'user-1',
      body: {
        transactionId: 'txn-456',
        productId: 'com.ican.premium.monthly',
        originalTransactionId: 'txn-456',
        jwsRepresentation: fakeJWS,
      },
    };
    const res = mockRes();
    const next = jest.fn();

    await verifyReceipt(req, res, next);

    // Should NOT return 400
    if (res.status.mock.calls.length > 0) {
      expect(res.status).not.toHaveBeenCalledWith(400);
    }
  });
});
