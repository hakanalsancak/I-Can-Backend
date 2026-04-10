/**
 * C-1: removeFriend must use a transaction so both sides are deleted atomically.
 */

const { query } = require('../src/config/database');
const { removeFriend } = require('../src/controllers/friendController');

jest.mock('../src/config/database', () => ({
  query: jest.fn(),
  getClient: jest.fn(),
}));

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

afterEach(() => jest.clearAllMocks());

describe('removeFriend (C-1: transaction safety)', () => {
  test('wraps both DELETEs in BEGIN/COMMIT', async () => {
    query.mockResolvedValue({ rows: [] });

    const req = { userId: 'user-1', params: { id: 'user-2' } };
    const res = mockRes();
    const next = jest.fn();

    await removeFriend(req, res, next);

    const calls = query.mock.calls.map(c => c[0]);
    expect(calls[0]).toBe('BEGIN');
    expect(calls[1]).toMatch(/DELETE FROM friendships/);
    expect(calls[2]).toMatch(/DELETE FROM friendships/);
    expect(calls[3]).toBe('COMMIT');
    expect(res.json).toHaveBeenCalledWith({ success: true });
    expect(next).not.toHaveBeenCalled();
  });

  test('rolls back if second DELETE fails', async () => {
    query
      .mockResolvedValueOnce() // BEGIN
      .mockResolvedValueOnce() // first DELETE
      .mockRejectedValueOnce(new Error('connection lost')) // second DELETE
      .mockResolvedValueOnce(); // ROLLBACK

    const req = { userId: 'user-1', params: { id: 'user-2' } };
    const res = mockRes();
    const next = jest.fn();

    await removeFriend(req, res, next);

    const calls = query.mock.calls.map(c => c[0]);
    expect(calls[0]).toBe('BEGIN');
    expect(calls[3]).toBe('ROLLBACK');
    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(res.json).not.toHaveBeenCalled();
  });

  test('rolls back if first DELETE fails', async () => {
    query
      .mockResolvedValueOnce() // BEGIN
      .mockRejectedValueOnce(new Error('timeout')) // first DELETE
      .mockResolvedValueOnce(); // ROLLBACK

    const req = { userId: 'user-1', params: { id: 'user-2' } };
    const res = mockRes();
    const next = jest.fn();

    await removeFriend(req, res, next);

    const rollbackCall = query.mock.calls.find(c => c[0] === 'ROLLBACK');
    expect(rollbackCall).toBeDefined();
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});
