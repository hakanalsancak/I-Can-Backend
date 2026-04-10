/**
 * C-8: Graceful shutdown — SIGTERM/SIGINT handlers are registered.
 */

jest.mock('dotenv', () => ({ config: jest.fn() }));

describe('graceful shutdown (C-8)', () => {
  let savedEnv;
  const listeners = {};

  beforeEach(() => {
    savedEnv = { ...process.env };
    process.env = {
      ...savedEnv,
      JWT_SECRET: 'a'.repeat(32),
      JWT_REFRESH_SECRET: 'b'.repeat(32),
      APPLE_BUNDLE_ID: 'com.alsancar.I-Can',
      DATABASE_URL: 'postgres://localhost:5432/test',
      PORT: '4010',
    };

    jest.spyOn(process, 'on').mockImplementation((event, handler) => {
      listeners[event] = handler;
    });
  });

  afterEach(() => {
    process.env = savedEnv;
    jest.restoreAllMocks();
  });

  test('registers SIGTERM and SIGINT handlers on startup', () => {
    jest.isolateModules(() => { require('../src/index'); });

    expect(listeners).toHaveProperty('SIGTERM');
    expect(typeof listeners.SIGTERM).toBe('function');
    expect(listeners).toHaveProperty('SIGINT');
    expect(typeof listeners.SIGINT).toBe('function');
  });
});
