// Sport feed sources. RSS only for v1. All free, high-signal.
// Add NewsAPI / GNews adapters later in this same file.

const SOURCES = {
  // Cross-sport headlines, surfaced to every user regardless of sport selection.
  news: [
    { name: 'ESPN Top Headlines', url: 'https://www.espn.com/espn/rss/news' },
    { name: 'BBC Sport', url: 'http://feeds.bbci.co.uk/sport/rss.xml' },
    { name: 'Sky Sports', url: 'https://www.skysports.com/rss/12040' },
    { name: 'CBS Sports', url: 'https://www.cbssports.com/rss/headlines/' },
    { name: 'The Guardian Sport', url: 'https://www.theguardian.com/sport/rss' },
    { name: 'Yahoo Sports', url: 'https://sports.yahoo.com/rss/' },
  ],
  // Sport-specific — keys match users.sport values (lowercased)
  basketball: [
    { name: 'ESPN NBA', url: 'https://www.espn.com/espn/rss/nba/news' },
    { name: 'CBS Sports NBA', url: 'https://www.cbssports.com/rss/headlines/nba/' },
    { name: 'Yahoo Sports NBA', url: 'https://sports.yahoo.com/nba/rss.xml' },
    { name: 'HoopsHype', url: 'https://hoopshype.com/feed/' },
    { name: 'Bleacher Report NBA', url: 'https://bleacherreport.com/articles/feed?tag_id=19' },
    { name: 'SB Nation NBA', url: 'https://www.sbnation.com/rss/nba/index.xml' },
    { name: 'NBC Sports NBA', url: 'https://www.nbcsports.com/nba/rss.xml' },
    { name: 'The Guardian NBA', url: 'https://www.theguardian.com/sport/nba/rss' },
  ],
  football: [
    { name: 'ESPN NFL', url: 'https://www.espn.com/espn/rss/nfl/news' },
    { name: 'CBS Sports NFL', url: 'https://www.cbssports.com/rss/headlines/nfl/' },
    { name: 'Yahoo Sports NFL', url: 'https://sports.yahoo.com/nfl/rss.xml' },
    { name: 'Pro Football Talk', url: 'https://profootballtalk.nbcsports.com/feed/' },
    { name: 'Bleacher Report NFL', url: 'https://bleacherreport.com/articles/feed?tag_id=10' },
    { name: 'SB Nation NFL', url: 'https://www.sbnation.com/rss/nfl/index.xml' },
    { name: 'NBC Sports NFL', url: 'https://www.nbcsports.com/nfl/rss.xml' },
    { name: 'Pro Football Rumors', url: 'https://www.profootballrumors.com/feed' },
  ],
  soccer: [
    { name: 'ESPN Soccer', url: 'https://www.espn.com/espn/rss/soccer/news' },
    { name: 'Goal.com', url: 'https://www.goal.com/feeds/en/news?fmt=rss' },
    { name: 'BBC Sport Football', url: 'http://feeds.bbci.co.uk/sport/football/rss.xml' },
    { name: 'The Guardian Football', url: 'https://www.theguardian.com/football/rss' },
    { name: 'Football365', url: 'https://www.football365.com/feed' },
    { name: 'Sky Sports Football', url: 'https://www.skysports.com/rss/12040' },
    { name: 'Football Italia', url: 'https://www.football-italia.net/rss.xml' },
    { name: 'SB Nation Soccer', url: 'https://www.sbnation.com/rss/soccer/index.xml' },
  ],
  boxing: [
    { name: 'ESPN Boxing', url: 'https://www.espn.com/espn/rss/boxing/news' },
    { name: 'BoxingScene', url: 'https://www.boxingscene.com/rss/news.xml' },
    { name: 'The Ring Magazine', url: 'https://www.ringtv.com/feed/' },
    { name: 'Bad Left Hook', url: 'https://www.badlefthook.com/rss/current.xml' },
    { name: 'BoxingNews24', url: 'https://www.boxingnews24.com/feed/' },
    { name: 'World Boxing News', url: 'https://www.worldboxingnews.net/feed/' },
    { name: 'BBC Sport Boxing', url: 'http://feeds.bbci.co.uk/sport/boxing/rss.xml' },
  ],
  tennis: [
    { name: 'ESPN Tennis', url: 'https://www.espn.com/espn/rss/tennis/news' },
    { name: 'Tennis.com', url: 'https://www.tennis.com/rss/' },
    { name: 'Tennis World USA', url: 'https://www.tennisworldusa.org/rss/all-news.rss' },
    { name: 'BBC Sport Tennis', url: 'http://feeds.bbci.co.uk/sport/tennis/rss.xml' },
    { name: 'The Guardian Tennis', url: 'https://www.theguardian.com/sport/tennis/rss' },
    { name: 'Tennis365', url: 'https://www.tennis365.com/feed' },
    { name: 'Tennishead', url: 'https://www.tennishead.net/feed/' },
  ],
  cricket: [
    { name: 'ESPN Cricinfo', url: 'https://www.espncricinfo.com/rss/content/story/feeds/0.xml' },
    { name: 'BBC Sport Cricket', url: 'http://feeds.bbci.co.uk/sport/cricket/rss.xml' },
    { name: 'The Guardian Cricket', url: 'https://www.theguardian.com/sport/cricket/rss' },
    { name: 'Cricket.com.au', url: 'https://www.cricket.com.au/rss/news' },
    { name: 'Sky Sports Cricket', url: 'https://www.skysports.com/rss/12040/12174' },
    { name: 'Wisden', url: 'https://wisden.com/feed' },
    { name: 'Cricket Country', url: 'https://www.cricketcountry.com/feed' },
  ],
  volleyball: [
    { name: 'Volleyball Magazine', url: 'https://volleyballmag.com/feed/' },
    { name: 'Volleyball World', url: 'https://en.volleyballworld.com/rss/news.xml' },
    { name: 'Pro Volleyball News', url: 'https://www.provolleyball.com/feed/' },
    { name: 'Volleyball Source', url: 'https://volleyballsource.com/feed/' },
  ],
  baseball: [
    { name: 'ESPN MLB', url: 'https://www.espn.com/espn/rss/mlb/news' },
    { name: 'CBS Sports MLB', url: 'https://www.cbssports.com/rss/headlines/mlb/' },
    { name: 'Yahoo Sports MLB', url: 'https://sports.yahoo.com/mlb/rss.xml' },
    { name: 'MLB Trade Rumors', url: 'https://www.mlbtraderumors.com/feed' },
    { name: 'Bleacher Report MLB', url: 'https://bleacherreport.com/articles/feed?tag_id=12' },
    { name: 'SB Nation MLB', url: 'https://www.sbnation.com/rss/mlb/index.xml' },
    { name: 'NBC Sports MLB', url: 'https://www.nbcsports.com/mlb/rss.xml' },
    { name: 'FanGraphs', url: 'https://blogs.fangraphs.com/feed/' },
  ],
};

const GENERAL_KEY = 'general';
const NON_SPORT_KEYS = new Set(['news']);
const SUPPORTED_SPORTS = ['basketball', 'tennis', 'boxing', 'cricket', 'soccer', 'football', 'volleyball', 'baseball'];

function sportSpecificSources(sport) {
  const key = (sport || '').toLowerCase().trim();
  if (NON_SPORT_KEYS.has(key)) return [];
  return SOURCES[key] || [];
}

function crossSportNewsSources() {
  return [...SOURCES.news];
}

// Back-compat alias still used by the seed endpoint
function sourcesForSport(sport) {
  return [...crossSportNewsSources(), ...sportSpecificSources(sport)];
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
  crossSportNewsSources,
  GENERAL_KEY,
  SUPPORTED_SPORTS,
};
