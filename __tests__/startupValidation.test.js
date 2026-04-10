/**
 * C-2 / C-8: Startup validation.
 * Tests that required env vars are validated at startup.
 * Mocks dotenv so .env file doesn't interfere with test env vars.
 */

jest.mock('dotenv', () => ({ config: jest.fn() }));

describe('startup validation', () => {
  const baseEnv = {
    JWT_SECRET: 'a'.repeat(32),
    JWT_REFRESH_SECRET: 'b'.repeat(32),
    APPLE_BUNDLE_ID: 'com.alsancar.I-Can',
    DATABASE_URL: 'postgres://localhost:5432/test',
  };

  let savedEnv;

  beforeEach(() => {
    savedEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = savedEnv;
  });

  test('throws if APPLE_BUNDLE_ID is missing', () => {
    process.env = { ...baseEnv, PORT: '4001' };
    delete process.env.APPLE_BUNDLE_ID;

    expect(() => {
      jest.isolateModules(() => { require('../src/index'); });
    }).toThrow('APPLE_BUNDLE_ID must be set');
  });

  test('throws if JWT_SECRET is too short', () => {
    process.env = { ...baseEnv, PORT: '4002', JWT_SECRET: 'short' };

    expect(() => {
      jest.isolateModules(() => { require('../src/index'); });
    }).toThrow('JWT_SECRET must be set and at least 32 characters long');
  });

  test('throws if JWT_REFRESH_SECRET is missing', () => {
    process.env = { ...baseEnv, PORT: '4003' };
    delete process.env.JWT_REFRESH_SECRET;

    expect(() => {
      jest.isolateModules(() => { require('../src/index'); });
    }).toThrow('JWT_REFRESH_SECRET must be set and at least 32 characters long');
  });
});
