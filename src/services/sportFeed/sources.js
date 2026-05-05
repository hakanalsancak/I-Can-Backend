// Sport feed sources. RSS only for v1. All free, high-signal.
// Add NewsAPI / GNews adapters later in this same file.

const SOURCES = {
  // General training/strength — apply to most sports
  general: [
    { name: 'Stronger by Science', url: 'https://www.strongerbyscience.com/feed/' },
    { name: 'Breaking Muscle', url: 'https://breakingmuscle.com/feed/' },
    { name: 'Outside Online', url: 'https://www.outsideonline.com/feed/' },
  ],
  // Recovery / nutrition / sleep — explicitly seed this category
  recovery: [
    { name: 'Sleep Foundation', url: 'https://www.sleepfoundation.org/feed' },
    { name: 'Precision Nutrition', url: 'https://www.precisionnutrition.com/feed' },
  ],
  // Mindset / mental performance
  mindset: [
    { name: 'James Clear', url: 'https://jamesclear.com/feed' },
    { name: 'Mindful', url: 'https://www.mindful.org/feed/' },
    { name: 'Farnam Street', url: 'https://fs.blog/feed/' },
  ],
  // Competition news / rule changes
  news: [
    { name: 'ESPN Top Headlines', url: 'https://www.espn.com/espn/rss/news' },
  ],
  // Sport-specific — keys match users.sport values (lowercased)
  basketball: [
    { name: 'ESPN NBA', url: 'https://www.espn.com/espn/rss/nba/news' },
  ],
  football: [
    { name: 'ESPN NFL', url: 'https://www.espn.com/espn/rss/nfl/news' },
  ],
  soccer: [
    { name: 'ESPN Soccer', url: 'https://www.espn.com/espn/rss/soccer/news' },
  ],
  boxing: [
    { name: 'ESPN Boxing', url: 'https://www.espn.com/espn/rss/boxing/news' },
  ],
  tennis: [
    { name: 'ESPN Tennis', url: 'https://www.espn.com/espn/rss/tennis/news' },
  ],
  cricket: [
    { name: 'ESPN Cricinfo', url: 'https://www.espncricinfo.com/rss/content/story/feeds/0.xml' },
  ],
};

const GENERAL_KEY = 'general';
const NON_SPORT_KEYS = new Set(['general', 'recovery', 'mindset', 'news']);
const SUPPORTED_SPORTS = ['basketball', 'tennis', 'boxing', 'cricket', 'soccer', 'football'];

function sportSpecificSources(sport) {
  const key = (sport || '').toLowerCase().trim();
  if (NON_SPORT_KEYS.has(key)) return [];
  return SOURCES[key] || [];
}

function generalSources() {
  return [
    ...SOURCES.general,
    ...SOURCES.recovery,
    ...SOURCES.mindset,
    ...SOURCES.news,
  ];
}

// Back-compat alias still used by the seed endpoint
function sourcesForSport(sport) {
  return [...generalSources(), ...sportSpecificSources(sport)];
}

function allSources() {
  const seen = new Set();
  const out = [];
  for (const list of Object.values(SOURCES)) {
    for (const s of list) {
      if (!seen.has(s.url)) {
        seen.add(s.url);
        out.push(s);
      }
    }
  }
  return out;
}

module.exports = {
  SOURCES,
  sourcesForSport,
  allSources,
  sportSpecificSources,
  generalSources,
  GENERAL_KEY,
  SUPPORTED_SPORTS,
};
