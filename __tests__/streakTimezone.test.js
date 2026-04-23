/**
 * Streak timezone correctness.
 *
 * Reproduces a real bug: a UK user (BST = UTC+1) who missed a day and then
 * logged at 00:15 local (23:15 UTC the previous day) saw the streak flicker
 * 20 → 1 → 19, then settle at 1 in the morning. Root cause: streak math used
 * the server's CURRENT_DATE (UTC) instead of the user's local date.
 *
 * The fix: compute "today" / "yesterday" as (NOW() AT TIME ZONE user_tz)::date.
 * These tests pin the behaviour by asserting the SQL carries the tz parameter
 * and that the logic returns the right number in each of the three flicker
 * moments plus the morning.
 */

jest.mock('../src/config/database', () => ({
  query: jest.fn(),
  getClient: jest.fn(),
}));

const { computeStreakFromEntries, incrementalStreak } = require('../src/controllers/streakController');

afterEach(() => jest.clearAllMocks());

// Build a mock query fn that dispatches responses based on SQL fragments.
// Every unhandled SQL fragment raises so tests don't silently pass.
function makeFn(responders) {
  return jest.fn(async (sql, params) => {
    for (const [fragment, response] of responders) {
      if (sql.includes(fragment)) {
        return typeof response === 'function' ? response(sql, params) : response;
      }
    }
    throw new Error(`Unexpected SQL in test: ${sql.slice(0, 120)}`);
  });
}

describe('incrementalStreak — UK midnight flicker scenario', () => {
  // Previous log: 2026-04-20 UK. User missed 2026-04-21 UK.
  // User now submits at 00:15 UK on 2026-04-22 (= 23:15 UTC on 2026-04-21).
  //   user-local today = 2026-04-22
  //   user-local yesterday = 2026-04-21
  // The last_entry_date (2026-04-20) is neither → streak must reset to 1.

  const USER_ID = 'user-uk';
  const UK_TZ = 'Europe/London';

  test('resets to 1 when the user missed a local day, even just past local midnight', async () => {
    const fn = makeFn([
      ['FROM users WHERE id', { rows: [{ tz: UK_TZ }] }],
      ['FROM streaks WHERE user_id', { rows: [{ current_streak: 19, last_entry_date: '2026-04-20' }] }],
      ['AT TIME ZONE', (_sql, params) => {
        expect(params).toEqual([UK_TZ]);
        // At 00:15 UK on 2026-04-22, user-local today is 2026-04-22.
        return { rows: [{ today: new Date('2026-04-22T00:00:00Z'), yesterday: new Date('2026-04-21T00:00:00Z') }] };
      }],
    ]);

    const streak = await incrementalStreak(fn, USER_ID);
    expect(streak).toBe(1);
  });

  test('still +1 when the user logged yesterday locally and now logs today', async () => {
    // Previous log: 2026-04-21 UK. Now at 00:15 UK on 2026-04-22.
    const fn = makeFn([
      ['FROM users WHERE id', { rows: [{ tz: UK_TZ }] }],
      ['FROM streaks WHERE user_id', { rows: [{ current_streak: 5, last_entry_date: '2026-04-21' }] }],
      ['AT TIME ZONE', { rows: [{ today: new Date('2026-04-22T00:00:00Z'), yesterday: new Date('2026-04-21T00:00:00Z') }] }],
    ]);

    expect(await incrementalStreak(fn, USER_ID)).toBe(6);
  });

  test('no-op when last entry is already today locally (second submit same day)', async () => {
    // Previous log written moments ago: 2026-04-22. Submit another section.
    const fn = makeFn([
      ['FROM users WHERE id', { rows: [{ tz: UK_TZ }] }],
      ['FROM streaks WHERE user_id', { rows: [{ current_streak: 6, last_entry_date: '2026-04-22' }] }],
      ['AT TIME ZONE', { rows: [{ today: new Date('2026-04-22T00:00:00Z'), yesterday: new Date('2026-04-21T00:00:00Z') }] }],
    ]);

    // BEFORE FIX: second submit at 00:15 UK saw Postgres today=04-21 so
    // last_entry_date=04-22 matched neither today nor yesterday → returned 1.
    // AFTER FIX: tz-adjusted today=04-22 matches last_entry_date → no change.
    expect(await incrementalStreak(fn, USER_ID)).toBe(6);
  });

  test('new users (no streaks row) start at 1', async () => {
    const fn = makeFn([
      ['FROM users WHERE id', { rows: [{ tz: UK_TZ }] }],
      ['FROM streaks WHERE user_id', { rows: [] }],
    ]);

    expect(await incrementalStreak(fn, USER_ID)).toBe(1);
  });

  test('defaults to UTC when the user has no timezone set', async () => {
    const fn = makeFn([
      ['FROM users WHERE id', { rows: [{ tz: 'UTC' }] }],
      ['FROM streaks WHERE user_id', { rows: [{ current_streak: 3, last_entry_date: '2026-04-21' }] }],
      ['AT TIME ZONE', (_sql, params) => {
        expect(params).toEqual(['UTC']);
        return { rows: [{ today: new Date('2026-04-22T00:00:00Z'), yesterday: new Date('2026-04-21T00:00:00Z') }] };
      }],
    ]);

    expect(await incrementalStreak(fn, USER_ID)).toBe(4);
  });
});

describe('computeStreakFromEntries — timezone parameter', () => {
  test('passes the user timezone into the recursive CTE', async () => {
    const USER_ID = 'user-uk';
    let capturedParams = null;
    const fn = makeFn([
      ['FROM users WHERE id', { rows: [{ tz: 'Europe/London' }] }],
      ['WITH RECURSIVE streak', (_sql, params) => {
        capturedParams = params;
        return { rows: [{ current_streak: 20 }] };
      }],
    ]);

    const n = await computeStreakFromEntries(fn, USER_ID);
    expect(n).toBe(20);
    expect(capturedParams).toEqual([USER_ID, 'Europe/London']);
  });

  test('SQL compares entry_date against (NOW() AT TIME ZONE $2)::date, not CURRENT_DATE', async () => {
    let capturedSql = null;
    const fn = makeFn([
      ['FROM users WHERE id', { rows: [{ tz: 'America/New_York' }] }],
      ['WITH RECURSIVE streak', (sql) => {
        capturedSql = sql;
        return { rows: [{ current_streak: 0 }] };
      }],
    ]);

    await computeStreakFromEntries(fn, 'user-us');
    expect(capturedSql).toMatch(/AT TIME ZONE \$2/);
    // If CURRENT_DATE sneaks back in, the tz-aware math is a lie.
    expect(capturedSql).not.toMatch(/CURRENT_DATE/);
  });
});
