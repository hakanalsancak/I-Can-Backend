const { query } = require('../src/config/database');

jest.mock('../src/config/database', () => ({
  query: jest.fn(),
  getClient: jest.fn(),
}));

jest.mock('../src/services/emailService', () => ({
  sendSubscriptionEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('crypto', () => {
  const actual = jest.requireActual('crypto');
  return { ...actual, X509Certificate: jest.fn() };
});

function mockRes() {
  return {
    sendStatus: jest.fn(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
}

function makeJWS(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'ES256' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.fakesig`;
}

afterEach(() => jest.clearAllMocks());

describe('appleWebhook subscription reactivation', () => {
  beforeEach(() => {
    process.env.APPLE_BUNDLE_ID = 'com.alsancar.I-Can';
    process.env.APPLE_STOREKIT_TESTING = 'true';
    process.env.NODE_ENV = 'development';
  });

  afterEach(() => {
    delete process.env.APPLE_BUNDLE_ID;
    delete process.env.APPLE_STOREKIT_TESTING;
  });

  test.each(['DID_RECOVER', 'SUBSCRIBED'])('%s reactivates the subscription', async (notificationType) => {
    const signedPayload = makeJWS({
      notificationType,
      subtype: null,
      data: {
        signedTransactionInfo: makeJWS({
          bundleId: 'com.alsancar.I-Can',
          originalTransactionId: 'orig-123',
          productId: 'com.ican.premium.monthly',
          expiresDate: '2026-06-01T00:00:00.000Z',
        }),
      },
    });

    query
      .mockResolvedValueOnce({
        rows: [{
          id: 'sub-1',
          user_id: 'user-1',
          product_id: 'com.ican.premium.monthly',
          username: 'athlete',
          account_email: 'user@test.com',
        }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const { appleWebhook } = require('../src/controllers/subscriptionController');
    const req = { body: { signedPayload } };
    const res = mockRes();

    await appleWebhook(req, res);

    expect(query).toHaveBeenNthCalledWith(
      2,
      `UPDATE subscriptions SET status = 'active',
         current_period_start = NOW(), current_period_end = $1,
         updated_at = NOW() WHERE id = $2`,
      [new Date('2026-06-01T00:00:00.000Z'), 'sub-1']
    );
    expect(res.sendStatus).toHaveBeenCalledWith(200);
  });
});
