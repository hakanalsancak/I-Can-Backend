const crypto = require('crypto');
const Parser = require('rss-parser');
const { query } = require('../../config/database');
const { getClient: getOpenAIClient } = require('../../config/openai');
const {
  sourcesForSport,
  allSources,
  sportSpecificSources,
  crossSportNewsSources,
  GENERAL_KEY,
  SUPPORTED_SPORTS,
} = require('./sources');

const parser = new Parser({
  timeout: 10_000,
  customFields: {
    item: [
      ['media:content', 'mediaContent', { keepArray: true }],
      ['media:thumbnail', 'mediaThumbnail', { keepArray: true }],
      ['itunes:image', 'itunesImage'],
      ['content:encoded', 'contentEncoded'],
    ],
  },
});

// Hard cap on the raw RSS payload we'll buffer for a single source. Without this
// a misbehaving feed (HTML login page, infinite redirect, multi-MB archive) can
// balloon the heap and OOM the process.
const MAX_FEED_BYTES = 2 * 1024 * 1024; // 2 MB

// Positive signals: boost training/recovery/mindset content for the 'general' bucket
// AND rank sport-specific items (news/transfers/injuries/results float to the top of
// the 30-item slice the AI classifier sees). The score gate is bypassed for
// forcedCategory feeds (see processItems), but sorting still uses score.
const KEYWORD_HITS = [
  // Training / technique
  'training', 'trains', 'trained', 'technique', 'technical', 'drill', 'drills',
  'program', 'programme', 'workout', 'workouts', 'session', 'practice', 'practiced',
  'strength', 'strong', 'powerful', 'power', 'speed', 'agility', 'explosive',
  'cardio', 'endurance', 'stamina', 'aerobic', 'anaerobic', 'hiit', 'tempo',
  'periodization', 'periodisation', 'conditioning', 'plyometric', 'plyometrics',
  'mobility', 'flexibility', 'stretching', 'warm-up', 'warmup', 'cool-down',
  'form', 'biomechanics', 'mechanics', 'fundamentals',

  // Recovery / nutrition / sleep
  'recovery', 'recover', 'rest', 'rested', 'sleep', 'nap', 'fatigue', 'deload',
  'nutrition', 'protein', 'carbs', 'carbohydrate', 'hydration', 'hydrate',
  'electrolytes', 'creatine', 'supplement', 'supplements', 'diet', 'meal',
  'soreness', 'doms', 'massage', 'foam roller', 'ice bath', 'cold plunge', 'sauna',
  'rehab', 'rehabilitation', 'physio', 'physiotherapy', 'injury prevention',

  // Mindset / mental
  'mindset', 'focus', 'focused', 'mental', 'mental performance', 'mental health',
  'motivation', 'discipline', 'confidence', 'anxiety', 'pressure', 'composure',
  'visualization', 'visualisation', 'meditation', 'mindfulness', 'habit', 'habits',
  'resilience', 'grit', 'mentality', 'psyche', 'flow state',

  // Competition / results
  'win', 'wins', 'won', 'victory', 'beat', 'defeat', 'defeated', 'lose', 'loss',
  'comeback', 'upset', 'thriller', 'walk-off', 'overtime', 'extra time',
  'match', 'matches', 'matchup', 'game', 'fixture', 'clash', 'duel', 'showdown',
  'championship', 'champion', 'champions', 'tournament', 'cup', 'final', 'finals',
  'semifinal', 'semi-final', 'quarterfinal', 'quarter-final', 'playoff', 'playoffs',
  'series', 'league', 'season', 'opener', 'debut', 'derby', 'rivalry',
  'standings', 'ranking', 'ranked', 'ranks', 'top-ranked', 'world number',
  'medal', 'gold', 'silver', 'bronze', 'olympics', 'olympic', 'world cup',

  // Player movement / contracts
  'trade', 'traded', 'trades', 'transfer', 'transfers', 'sign', 'signs', 'signed',
  'signing', 'contract', 'contracts', 'extension', 'extends', 'extended', 'deal',
  'agreement', 'free agent', 'free agency', 'draft', 'drafted', 'pick', 'rookie',
  'retire', 'retires', 'retirement', 'unretire', 'release', 'released', 'waived',
  'cut', 'acquire', 'acquired', 'acquisition', 'loan', 'loaned', 'rumor', 'rumour',
  'reportedly', 'agrees', 'agreed', 'joins', 'leaving',

  // Injury / status
  'injury', 'injured', 'injuries', 'hurt', 'sidelined', 'questionable', 'doubtful',
  'probable', 'available', 'unavailable', 'ruled out', 'cleared', 'returned',
  'returns', 'comeback', 'surgery', 'mri', 'scan', 'sprain', 'strain', 'tear',
  'fracture', 'broken', 'concussion', 'hamstring', 'quad', 'knee', 'ankle',
  'shoulder', 'elbow', 'wrist', 'back', 'acl', 'mcl', 'achilles', 'meniscus',
  'rotator cuff', 'ucl', 'tommy john', 'day-to-day', 'il', 'injured list',

  // Coaching / management
  'coach', 'coaches', 'coached', 'coaching', 'head coach', 'assistant coach',
  'manager', 'managerial', 'hire', 'hired', 'fired', 'sacked', 'dismissed',
  'replaced', 'appointed', 'appointment', 'general manager', 'gm', 'front office',
  'owner', 'staff', 'system',

  // Records / awards
  'record', 'record-breaking', 'milestone', 'career-high', 'career best',
  'all-time', 'hall of fame', 'hof', 'mvp', 'rookie of the year',
  'player of the week', 'player of the month', 'all-star', 'all star',

  // Roster / team
  'roster', 'lineup', 'starting lineup', 'starter', 'bench', 'squad', 'club',
  'franchise', 'jersey', 'captain', 'co-captain', 'leader',

  // Basketball
  'nba', 'dunk', 'three-pointer', 'three pointer', '3-point', 'triple-double',
  'double-double', 'rebound', 'assist', 'block', 'steal', 'crossover', 'isolation',
  'pick and roll', 'pick-and-roll', 'jumper', 'layup', 'free throw', 'paint',

  // Football (NFL)
  'nfl', 'quarterback', 'qb', 'touchdown', 'td', 'interception', 'sack',
  'rushing', 'passing', 'receiving', 'reception', 'snap', 'fumble', 'red zone',
  'two-minute', 'super bowl', 'pro bowl', 'combine', 'minicamp', 'ota',

  // Soccer / football (world)
  'premier league', 'la liga', 'serie a', 'bundesliga', 'ligue 1', 'mls',
  'champions league', 'europa league', 'uefa', 'fifa', 'goal', 'goals',
  'goalkeeper', 'keeper', 'striker', 'midfielder', 'defender', 'penalty',
  'free kick', 'corner', 'offside', 'var', 'clean sheet', 'hat-trick', 'hat trick',
  'derby', 'el clasico', 'manchester', 'madrid', 'barcelona', 'liverpool',
  'arsenal', 'chelsea',

  // Boxing
  'knockout', 'ko', 'tko', 'technical knockout', 'decision', 'unanimous',
  'majority decision', 'split decision', 'draw', 'round', 'rounds', 'bout',
  'fight', 'fights', 'fighter', 'undefeated', 'unbeaten', 'undercard', 'main event',
  'title shot', 'title fight', 'belt', 'heavyweight', 'cruiserweight',
  'middleweight', 'welterweight', 'lightweight', 'featherweight', 'bantamweight',
  'pound-for-pound', 'pound for pound', 'sparring', 'jab', 'cross', 'uppercut',
  'wbc', 'wba', 'ibf', 'wbo',

  // Tennis
  'grand slam', 'australian open', 'french open', 'roland garros', 'wimbledon',
  'us open', 'atp', 'wta', 'ace', 'aces', 'serve', 'break point', 'tiebreak',
  'tie-break', 'tiebreaker', 'set point', 'match point', 'forehand', 'backhand',
  'volley', 'baseline', 'doubles', 'singles', 'seed', 'seeded', 'unseeded',
  'qualifier', 'masters 1000', 'davis cup',

  // Cricket
  'test match', 'odi', 't20', 'ipl', 'wicket', 'wickets', 'batting', 'bowler',
  'bowling', 'spinner', 'pacer', 'all-rounder', 'all rounder', 'century',
  'half-century', 'duck', 'lbw', 'caught', 'stumped', 'innings', 'over', 'overs',
  'boundary', 'six', 'sixes', 'four', 'fours', 'crease', 'pitch', 'ashes',
  'world cup',

  // Volleyball
  'spike', 'block', 'dig', 'set', 'setter', 'libero', 'outside hitter',
  'middle blocker', 'opposite', 'ace', 'serve', 'fivb', 'volleyball nations league',
  'vnl', 'beach volleyball',

  // Baseball
  'mlb', 'home run', 'homer', 'rbi', 'era', 'whip', 'strikeout', 'strikeouts',
  'no-hitter', 'perfect game', 'walk-off', 'grand slam', 'shutout', 'bullpen',
  'closer', 'starter', 'pitcher', 'pitching', 'batter', 'batting', 'slugging',
  'on-base', 'ops', 'dugout', 'mound', 'inning', 'world series', 'all-star game',
  'spring training', 'opening day',
];
// Hard junk only. Anything more nuanced (lifestyle vs. legit sport news)
// is the AI classifier's job — keyword matching can't tell "transfer rumor"
// (drop) from "transfer window analysis" (keep).
const KEYWORD_MISSES = ['gossip', 'tabloid', 'paparazzi'];
const TITLE_BLOCKLIST = /(gossip|tabloid|paparazzi)/i;

function preFilter(item, opts = {}) {
  const minBodyLen = opts.minBodyLen ?? 200;
  if (!item.title) return false;
  if (TITLE_BLOCKLIST.test(item.title)) return false;
  const body = (item.contentSnippet || item.content || '').toString();
  if (body.length < minBodyLen) return false;
  return true;
}

function score(item) {
  const haystack = `${item.title} ${item.contentSnippet || ''} ${item.content || ''}`.toLowerCase();
  let s = 0;
  for (const kw of KEYWORD_HITS) {
    if (haystack.includes(kw)) s += 3;
  }
  for (const kw of KEYWORD_MISSES) {
    if (haystack.includes(kw)) s -= 5;
  }
  return s;
}

function hashUrl(url) {
  return crypto.createHash('sha256').update(url).digest('hex');
}

async function fetchFeedXml(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'user-agent': 'ICanBot/1.0 (+rss)' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (ct && !/(xml|rss|atom|text)/.test(ct)) {
      throw new Error(`unexpected content-type: ${ct}`);
    }
    const reader = res.body.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_FEED_BYTES) {
        try { await reader.cancel(); } catch (_) { /* ignore */ }
        throw new Error(`feed exceeds ${MAX_FEED_BYTES} bytes`);
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString('utf8');
  } finally {
    clearTimeout(timer);
  }
}

async function fetchSource(source) {
  try {
    const xml = await fetchFeedXml(source.url);
    const feed = await parser.parseString(xml);
    return (feed.items || []).map(it => ({
      sourceName: source.name,
      title: (it.title || '').trim(),
      link: (it.link || '').trim(),
      content: (it.contentSnippet || it.content || '').trim().slice(0, 4000),
      pubDate: it.isoDate || it.pubDate || null,
      image: extractImage(it),
    }));
  } catch (err) {
    console.error(`RSS fetch failed for ${source.name}: ${err.message}`);
    return [];
  }
}

function extractImage(item) {
  // 1. enclosure (most common for podcasts/news)
  if (item.enclosure?.url && /^https?:\/\//.test(item.enclosure.url)) {
    return item.enclosure.url;
  }
  // 2. media:content (used by ESPN, NYT, etc.)
  if (Array.isArray(item.mediaContent)) {
    for (const m of item.mediaContent) {
      const url = m?.$?.url;
      if (url && /^https?:\/\//.test(url)) return url;
    }
  }
  // 3. media:thumbnail
  if (Array.isArray(item.mediaThumbnail)) {
    for (const m of item.mediaThumbnail) {
      const url = m?.$?.url;
      if (url && /^https?:\/\//.test(url)) return url;
    }
  }
  // 4. itunes:image
  if (item.itunesImage?.$?.href) return item.itunesImage.$.href;
  // 5. inline <img> in content / description
  const html = `${item.contentEncoded || ''} ${item.content || ''} ${item.contentSnippet || ''}`;
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (m && /^https?:\/\//.test(m[1])) return m[1];
  return null;
}

async function existsByHash(hash) {
  const r = await query('SELECT 1 FROM sport_articles WHERE hash = $1 LIMIT 1', [hash]);
  return r.rows.length > 0;
}

async function classifyBatch(items) {
  if (items.length === 0) return [];
  const client = getOpenAIClient();

  const userPrompt = items.map((it, i) => (
    `[${i}] TITLE: ${it.title}\nBODY: ${it.content.slice(0, 800)}`
  )).join('\n\n');

  const completion = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.2,
    max_tokens: 1500,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `You are a content classifier for an athlete app.
Return JSON with key "items": array.
For each input article, return:
{
  "index": int,
  "keep": bool,
  "category": "training" | "recovery" | "mindset" | "news",
  "relevance_score": 0-100,
  "headline": string (max 70 chars, action-led, no clickbait),
  "summary_bullets": [string, string, string] (each max 90 chars)
}

Category definitions — pick the BEST single fit:
- "recovery" = sleep, nutrition, hydration, mobility, stretching, injury rehab, soreness, deload, fatigue. Pick this even if the article briefly mentions training.
- "mindset" = focus, motivation, discipline, anxiety, confidence, habit-building, mental performance, pre-competition mental prep, philosophy applied to athletics.
- "news" = competition results, rule changes, official events, sport-specific updates that don't belong elsewhere.
- "training" = ONLY if it's primarily about workouts, drills, lifting programs, sets/reps, technique, periodization. Default away from training when the article fits another category.

Drop (keep=false) when:
- Pure tabloid / paparazzi / dating / family gossip about an athlete's private life
- Generic listicle ("Top 10 ...") with no substance
- Promotional / buying guide / product review
- Fashion, "style icon", off-field lifestyle puff pieces

Keep legitimate sport news — match results, trades, transfers, contract
extensions, rule changes, injury updates, comeback stories. Those are the
news an athlete reader expects. Use category="news" for them.`,
      },
      { role: 'user', content: userPrompt },
    ],
  });

  const raw = completion.choices?.[0]?.message?.content || '{"items":[]}';
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  return Array.isArray(parsed.items) ? parsed.items : [];
}

async function ingestFromSources(sport, sources, opts = {}) {
  const allItems = [];
  for (const src of sources) {
    const items = await fetchSource(src);
    allItems.push(...items);
  }
  return processItems(sport, allItems, opts);
}

async function processItems(sport, allItems, opts = {}) {
  const minScore = opts.minScore ?? 3;
  const minBodyLen = opts.minBodyLen ?? 200;
  const minRelevance = opts.minRelevance ?? 60;
  const forcedCategory = opts.forcedCategory ?? null;

  // Stage 1: hard filter
  const stage1 = allItems.filter(item => preFilter(item, { minBodyLen }));

  // Stage 2: dedup by URL hash. Keyword score gates the 'general' bucket toward
  // training-shaped content; sport-specific feeds (forcedCategory set) skip the
  // score gate entirely — the AI classifier decides what's worth keeping.
  const candidates = [];
  for (const item of stage1) {
    if (!item.link) continue;
    const hash = hashUrl(item.link);
    if (await existsByHash(hash)) continue;
    const s = score(item);
    if (!forcedCategory && s < minScore) continue;
    candidates.push({ ...item, hash, score: s });
  }

  // Cap how many we send to the AI per run to control cost
  const top = candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, 30);

  if (top.length === 0) return { fetched: allItems.length, kept: 0 };

  // Stage 3: AI classify in batches of 10
  const kept = [];
  for (let i = 0; i < top.length; i += 10) {
    const batch = top.slice(i, i + 10);
    let decisions;
    try {
      decisions = await classifyBatch(batch);
    } catch (err) {
      console.error('Classify batch failed:', err.message);
      continue;
    }
    for (const d of decisions) {
      if (!d || d.keep !== true || (d.relevance_score ?? 0) < minRelevance) continue;
      const item = batch[d.index];
      if (!item) continue;
      const summary = Array.isArray(d.summary_bullets)
        ? d.summary_bullets.slice(0, 3).map(s => String(s).slice(0, 90)).join('\n')
        : '';
      if (!summary) continue;
      const headline = String(d.headline || item.title).slice(0, 200);
      kept.push({
        sport,
        category: forcedCategory
          ? forcedCategory
          : (['training', 'recovery', 'mindset', 'news'].includes(d.category)
             ? d.category
             : 'training'),
        title: headline,
        original_title: item.title,
        summary,
        source_name: item.sourceName,
        source_url: item.link,
        image_url: item.image || null,
        relevance_score: Math.max(0, Math.min(100, parseInt(d.relevance_score, 10) || 0)),
        published_at: item.pubDate ? new Date(item.pubDate) : new Date(),
        hash: item.hash,
      });
    }
  }

  // Stage 4: insert
  for (const a of kept) {
    try {
      await query(
        `INSERT INTO sport_articles
           (sport, category, title, original_title, summary, source_name,
            source_url, image_url, relevance_score, published_at, hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (hash) DO NOTHING`,
        [
          a.sport, a.category, a.title, a.original_title, a.summary,
          a.source_name, a.source_url, a.image_url, a.relevance_score,
          a.published_at, a.hash,
        ]
      );
    } catch (err) {
      console.error('Insert article failed:', err.message);
    }
  }

  return { fetched: allItems.length, kept: kept.length };
}

// Public: ingest cross-sport news + this user's sport. Used by the manual seed
// endpoint. Everything is forced into the 'news' category.
async function ingestForSport(sport) {
  const cross = await ingestFromSources(
    GENERAL_KEY,
    crossSportNewsSources(),
    { minScore: 0, minBodyLen: 80, minRelevance: 40, forcedCategory: 'news' }
  );
  const specific = await ingestFromSources(
    sport,
    sportSpecificSources(sport),
    { minScore: 0, minBodyLen: 80, minRelevance: 40, forcedCategory: 'news' }
  );
  return {
    general: cross,
    sport: specific,
    fetched: cross.fetched + specific.fetched,
    kept: cross.kept + specific.kept,
  };
}

async function ingestAllSports() {
  const summary = {};

  // Pass 1: cross-sport news headlines (tagged sport='general', category='news').
  try {
    summary[GENERAL_KEY] = await ingestFromSources(
      GENERAL_KEY,
      crossSportNewsSources(),
      { minScore: 0, minBodyLen: 80, minRelevance: 40, forcedCategory: 'news' }
    );
  } catch (err) {
    console.error('General ingest failed:', err.message);
    summary[GENERAL_KEY] = { error: err.message };
  }

  // Pass 2: sport-specific feeds per supported sport. AI classifier drops gossip
  // and decides relevance; everything kept is category='news'.
  for (const sport of SUPPORTED_SPORTS) {
    try {
      summary[sport] = await ingestFromSources(
        sport,
        sportSpecificSources(sport),
        { minScore: 0, minBodyLen: 80, minRelevance: 40, forcedCategory: 'news' }
      );
    } catch (err) {
      console.error(`Sport ${sport} ingest failed:`, err.message);
      summary[sport] = { error: err.message };
    }
  }

  return summary;
}

async function pruneOldArticles(daysToKeep = 60) {
  await query(
    `DELETE FROM sport_articles
      WHERE published_at < NOW() - INTERVAL '1 day' * $1`,
    [daysToKeep]
  );
}

module.exports = { ingestAllSports, ingestForSport, pruneOldArticles };
