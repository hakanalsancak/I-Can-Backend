const crypto = require('crypto');
const Parser = require('rss-parser');
const { query } = require('../../config/database');
const { getClient: getOpenAIClient } = require('../../config/openai');
const {
  sourcesForSport,
  allSources,
  sportSpecificSources,
  generalSources,
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

const KEYWORD_HITS = [
  'training', 'technique', 'drill', 'program', 'workout', 'strength',
  'recovery', 'sleep', 'mobility', 'nutrition', 'protein',
  'mindset', 'focus', 'mental', 'mental performance',
  'periodization', 'conditioning', 'injury prevention',
];
const KEYWORD_MISSES = [
  'salary', 'contract', 'dating', 'gossip', 'wife', 'girlfriend',
  'arrested', 'scandal', 'rumor', 'rumour', 'transfer', 'net worth',
  'lifestyle', 'celebrity', 'fashion', 'style icon',
];
const TITLE_BLOCKLIST = /(transfer|rumou?r|girlfriend|wife|salary|net worth|arrested|scandal)/i;

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

async function fetchSource(source) {
  try {
    const feed = await parser.parseURL(source.url);
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
- Pure entertainment / gossip / celebrity / lifestyle
- Generic listicle ("Top 10 ...") with no actionable content
- Promotional / buying guide / product review
- Not actionable for a serious athlete
- About transfers, salaries, contracts, personal life`,
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

  // Stage 1: hard filter
  const stage1 = allItems.filter(item => preFilter(item, { minBodyLen }));

  // Stage 2: keyword score, drop dup URLs we already stored
  const candidates = [];
  for (const item of stage1) {
    if (!item.link) continue;
    const hash = hashUrl(item.link);
    if (await existsByHash(hash)) continue;
    const s = score(item);
    if (s < minScore) continue;
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
        category: ['training', 'recovery', 'mindset', 'news'].includes(d.category)
          ? d.category
          : 'training',
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

// Public: ingest both general (cross-sport) feeds and the sport-specific ones.
// Used by the manual seed endpoint for a single user's sport.
async function ingestForSport(sport) {
  const general = await ingestFromSources(GENERAL_KEY, generalSources());
  const specific = await ingestFromSources(sport, sportSpecificSources(sport));
  return {
    general,
    sport: specific,
    fetched: general.fetched + specific.fetched,
    kept: general.kept + specific.kept,
  };
}

async function ingestAllSports() {
  const summary = {};

  // Pass 1: general feeds once — articles tagged sport='general'
  try {
    summary[GENERAL_KEY] = await ingestFromSources(GENERAL_KEY, generalSources());
  } catch (err) {
    console.error('General ingest failed:', err.message);
    summary[GENERAL_KEY] = { error: err.message };
  }

  // Pass 2: sport-specific feeds per supported sport.
  // Use minScore: 0 because ESPN sport feeds skew news/results, not training keywords;
  // the AI classifier still drops gossip and decides relevance.
  for (const sport of SUPPORTED_SPORTS) {
    try {
      summary[sport] = await ingestFromSources(
        sport,
        sportSpecificSources(sport),
        { minScore: 0, minBodyLen: 80, minRelevance: 40 }
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
