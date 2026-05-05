// Sport feed sources. RSS only for v1. All free, high-signal.
// Add NewsAPI / GNews adapters later in this same file.

const SOURCES = {
  // General training/strength — apply to most sports
  general: [
    { name: 'Stronger by Science', url: 'https://www.strongerbyscience.com/feed/' },
    { name: 'Breaking Muscle', url: 'https://breakingmuscle.com/feed/' },
    { name: 'Outside Online', url: 'https://www.outsideonline.com/feed/' },
    { name: 'T-Nation', url: 'https://www.t-nation.com/feed/' },
  ],
  // Recovery / nutrition / sleep — explicitly seed this category
  recovery: [
    { name: 'Examine', url: 'https://examine.com/feed/' },
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
    { name: 'HoopsHype', url: 'https://hoopshype.com/feed/' },
  ],
  football: [
    { name: 'Fox Soccer', url: 'https://www.foxsports.com/stories/soccer/feed' },
  ],
  soccer: [
    { name: 'Fox Soccer', url: 'https://www.foxsports.com/stories/soccer/feed' },
  ],
  boxing: [
    { name: 'BoxingScene', url: 'https://www.boxingscene.com/rss/news.xml' },
  ],
  running: [
    { name: 'Outside Online', url: 'https://www.outsideonline.com/feed/' },
  ],
};

function sourcesForSport(sport) {
  const key = (sport || '').toLowerCase().trim();
  // Pull from general + every category bucket + sport-specific
  const sportSpecific = SOURCES[key] && key !== 'general'
                        && key !== 'recovery'
                        && key !== 'mindset'
                        && key !== 'news'
    ? SOURCES[key] : [];
  return [
    ...SOURCES.general,
    ...SOURCES.recovery,
    ...SOURCES.mindset,
    ...SOURCES.news,
    ...sportSpecific,
  ];
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

module.exports = { SOURCES, sourcesForSport, allSources };
