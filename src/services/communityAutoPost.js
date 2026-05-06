const { query } = require('../config/database');

// Bot accounts are the seeded leaderboard users (email LIKE '%@ican.seed').
// They have full_name, country, sport, and a streak row already.
// This service generates fresh community posts authored by those bots so the
// For You feed stays active without auto-posting on behalf of real users.

const GENERIC_TEXTS = [
  "Showed up. That's the whole post.",
  "Tired today. Trained anyway.",
  "Small reps, big difference.",
  "Discipline > motivation.",
  "Made it harder on purpose.",
  "Recovery day done right.",
  "Felt slow. Pushed through.",
  "Quiet morning. Loud effort.",
  "Hydrate. Sleep. Repeat.",
  "Form first. Speed second.",
  "Nothing fancy — just consistent.",
  "Better than yesterday.",
  "Weak side day. Hated it. Needed it.",
  "Mind was off. Body still showed up.",
  "One more rep mindset today.",
  "Eat. Train. Recover. Stack days.",
  "Easy day on paper. Not in reality.",
  "Counting reps, not minutes.",
  "Mobility first. Always.",
  "Trust the process even when it's boring.",
];

const SPORT_TEXTS = {
  soccer: [
    "First touch drills until they're boring. Then more.",
    "Sprint, recover, sprint. 6x.",
    "Weak foot finishing. Embarrassing → workable.",
    "Set piece reps after team session.",
  ],
  basketball: [
    "500 form shots before lift. No skips.",
    "Free throws under fatigue. Money rep was the last one.",
    "Defensive slides until legs lit up.",
    "Pull-up middy work. Footwork first.",
  ],
  tennis: [
    "Serve toss, serve toss, serve toss. Fixed.",
    "Crosscourt rallies, no errors for 20.",
    "Footwork ladder before hitting.",
    "Backhand down the line — finally clicking.",
  ],
  boxing: [
    "Bag work until the gloves felt heavy.",
    "Rounds of pad work. Hands up.",
    "Footwork drills > everything today.",
    "Sparring went 3 rounds. Learned more in 9 minutes than 9 weeks.",
  ],
  cricket: [
    "Net session. Defense → drives.",
    "Throwdowns until the timing came back.",
    "Spin bowling reps. Length is everything.",
    "Catching practice in the afternoon sun.",
  ],
  football: [
    "Route running. Crisp cuts. No drift.",
    "Position drills + film after.",
    "Conditioning at the end. Brutal.",
    "Footwork bag → cone work → sled.",
  ],
};

const STREAK_TEMPLATES = [
  (n) => `${n}-day streak. Don't break it.`,
  (n) => `${n} days in. Just getting started.`,
  (n) => `Day ${n}. Showed up again.`,
  (n) => `${n} straight. The hard part is the boring part.`,
];

const STREAK_MILESTONES = [7, 14, 30, 60, 100, 200, 365, 500, 1000];

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickBodyForBot(bot) {
  // 25% chance of a streak-style post if their streak hits a milestone, else
  // a sport-flavored or generic line.
  const streak = bot.current_streak || 0;
  if (streak > 0 && STREAK_MILESTONES.includes(streak) && Math.random() < 0.25) {
    return { type: 'streak', body: pickRandom(STREAK_TEMPLATES)(streak), milestone: streak };
  }
  const sportPool = bot.sport && SPORT_TEXTS[bot.sport];
  const useSport = sportPool && Math.random() < 0.6;
  const body = useSport ? pickRandom(sportPool) : pickRandom(GENERIC_TEXTS);
  return { type: 'text', body, milestone: null };
}

// Generate up to `count` bot posts. Picks bots that haven't posted in the last
// `cooldownHours` to spread activity across the seed pool.
async function generateBotPosts(count = 4, cooldownHours = 18) {
  const candidates = await query(
    `SELECT u.id, u.full_name, u.sport, COALESCE(s.current_streak, 0) AS current_streak
       FROM users u
       LEFT JOIN streaks s ON s.user_id = u.id
      WHERE u.email LIKE '%@ican.seed'
        AND NOT EXISTS (
          SELECT 1 FROM posts p
           WHERE p.author_id = u.id
             AND p.deleted_at IS NULL
             AND p.created_at > NOW() - ($1::int * INTERVAL '1 hour')
        )
      ORDER BY RANDOM()
      LIMIT $2`,
    [cooldownHours, count]
  );

  const created = [];
  for (const bot of candidates.rows) {
    const { type, body, milestone } = pickBodyForBot(bot);
    const metadata = milestone ? { milestone } : {};
    try {
      const inserted = await query(
        `INSERT INTO posts (author_id, type, visibility, body, metadata, sport)
         VALUES ($1, $2, 'public', $3, $4::jsonb, $5)
         RETURNING id`,
        [bot.id, type, body, JSON.stringify(metadata), bot.sport || null]
      );
      if (inserted.rows[0]?.id) created.push(inserted.rows[0].id);
    } catch (err) {
      console.error(`Bot post insert failed for ${bot.id}:`, err.message);
    }
  }
  return created;
}

module.exports = { generateBotPosts };
