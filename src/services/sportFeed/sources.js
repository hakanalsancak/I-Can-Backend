// Sport feed sources. RSS only for v1. All free, high-signal.
// Add NewsAPI / GNews adapters later in this same file.

const SOURCES = {
  // General training/strength/recovery — apply to most sports
  general: [
    { name: 'Stronger by Science', url: 'https://www.strongerbyscience.com/feed/' },
    { name: 'Breaking Muscle', url: 'https://breakingmuscle.com/feed/' },
    { name: 'Outside Online', url: 'https://www.outsideonline.com/feed/' },
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
  const specific = SOURCES[key] || [];
  return [...SOURCES.general, ...specific];
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
