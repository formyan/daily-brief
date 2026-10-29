/**
 * Source registry.
 *
 * Selection principle: primary reporting from internationally recognised
 * outlets, wire services, public broadcasters, official institutions and
 * research organisations. State-funded outlets are included for official
 * positions, but are never counted as independent confirmation.
 *
 * `group` is used to prevent two feeds from the same newsroom being counted
 * as two independent sources.
 */

export const SECTION_ORDER = ['diplomacy', 'politics', 'economy', 'tech', 'science', 'world'];

export const SECTIONS = {
  diplomacy: { label: '外交', en: 'Diplomacy', kicker: '谈判、联盟与冲突' },
  politics: { label: '政治', en: 'Politics', kicker: '权力、选举与政策' },
  economy: { label: '经济', en: 'Economy', kicker: '市场、贸易与政策' },
  tech: { label: '科技', en: 'Technology', kicker: '算力、产品与监管' },
  science: { label: '科学', en: 'Science', kicker: '发现、健康与地球' },
  world: { label: '国际', en: 'World', kicker: '来自各地区的现场' },
};

export const SOURCES = [
  /* ----------------------------- World ----------------------------- */
  {
    id: 'bbc-world', group: 'bbc', name: 'BBC News', short: 'BBC', section: 'world',
    url: 'https://feeds.bbci.co.uk/news/world/rss.xml', home: 'https://www.bbc.com/news/world',
    country: 'GB', countryZh: '英国', type: '公共广播', class: 'independent', independent: true, tier: 1,
    note: '英国公共广播机构，编辑独立。',
  },
  {
    id: 'guardian-world', group: 'guardian', name: 'The Guardian', short: 'GU', section: 'world',
    url: 'https://www.theguardian.com/world/rss', home: 'https://www.theguardian.com/world',
    country: 'GB', countryZh: '英国', type: '商业媒体', class: 'independent', independent: true, tier: 1,
    note: '英国综合性日报，以国际调查报道见长。',
  },
  {
    id: 'npr-world', group: 'npr', name: 'NPR', short: 'NPR', section: 'world',
    url: 'https://feeds.npr.org/1004/rss.xml', home: 'https://www.npr.org/sections/world/',
    country: 'US', countryZh: '美国', type: '公共广播', class: 'independent', independent: true, tier: 1,
    note: '美国非营利公共广播机构。',
  },
  {
    id: 'aljazeera', group: 'aljazeera', name: 'Al Jazeera', short: 'AJ', section: 'world',
    url: 'https://www.aljazeera.com/xml/rss/all.xml', home: 'https://www.aljazeera.com/',
    country: 'QA', countryZh: '卡塔尔', type: '公共资助媒体', class: 'independent', independent: true, tier: 1,
    note: '卡塔尔公共资助的国际新闻机构，重点覆盖中东与全球南方。',
  },
  {
    id: 'france24', group: 'france24', name: 'France 24', short: 'F24', section: 'world',
    url: 'https://www.france24.com/en/rss', home: 'https://www.france24.com/en/',
    country: 'FR', countryZh: '法国', type: '公共广播', class: 'independent', independent: true, tier: 1,
    note: '法国国际公共广播机构。',
  },
  {
    id: 'dw-top', group: 'dw', name: 'Deutsche Welle', short: 'DW', section: 'world',
    url: 'https://rss.dw.com/rdf/rss-en-top', home: 'https://www.dw.com/en/',
    country: 'DE', countryZh: '德国', type: '公共广播', class: 'independent', independent: true, tier: 1,
    note: '德国国际公共广播机构。',
  },
  {
    id: 'cbc-world', group: 'cbc', name: 'CBC News', short: 'CBC', section: 'world',
    url: 'https://www.cbc.ca/webfeed/rss/rss-world', home: 'https://www.cbc.ca/news/world',
    country: 'CA', countryZh: '加拿大', type: '公共广播', class: 'independent', independent: true, tier: 1,
    note: '加拿大公共广播机构。',
  },
  {
    id: 'scmp', group: 'scmp', name: 'South China Morning Post', short: 'SCMP', section: 'world',
    url: 'https://www.scmp.com/rss/91/feed', home: 'https://www.scmp.com/',
    country: 'HK', countryZh: '中国香港', type: '商业媒体', class: 'independent', independent: true, tier: 2,
    note: '总部位于香港的英文媒体，侧重亚洲与中国议题。',
  },
  {
    id: 'japantimes', group: 'japantimes', name: 'The Japan Times', short: 'JT', section: 'world',
    url: 'https://www.japantimes.co.jp/feed/', home: 'https://www.japantimes.co.jp/',
    country: 'JP', countryZh: '日本', type: '商业媒体', class: 'independent', independent: true, tier: 2,
    note: '日本历史最久的英文日报。',
  },
  {
    id: 'straitstimes', group: 'straitstimes', name: 'The Straits Times', short: 'ST', section: 'world',
    url: 'https://www.straitstimes.com/news/world/rss.xml', home: 'https://www.straitstimes.com/world',
    country: 'SG', countryZh: '新加坡', type: '商业媒体', class: 'independent', independent: true, tier: 2,
    note: '新加坡主流英文日报，覆盖东南亚与亚洲。',
  },
  {
    id: 'indianexpress', group: 'indianexpress', name: 'The Indian Express', short: 'IE', section: 'world',
    url: 'https://indianexpress.com/feed/', home: 'https://indianexpress.com/',
    country: 'IN', countryZh: '印度', type: '商业媒体', class: 'independent', independent: true, tier: 2,
    note: '印度全国性英文日报。',
  },

  /* ---------------------------- Politics --------------------------- */
  {
    id: 'bbc-politics', group: 'bbc', name: 'BBC Politics', short: 'BBC', section: 'politics',
    url: 'https://feeds.bbci.co.uk/news/politics/rss.xml', home: 'https://www.bbc.com/news/politics',
    country: 'GB', countryZh: '英国', type: '公共广播', class: 'independent', independent: true, tier: 1,
    note: '英国议会与政府报道。',
  },
  {
    id: 'politico-us', group: 'politico', name: 'Politico', short: 'PO', section: 'politics',
    url: 'https://rss.politico.com/politics-news.xml', home: 'https://www.politico.com/',
    country: 'US', countryZh: '美国', type: '商业媒体', class: 'independent', independent: true, tier: 1,
    note: '美国政治与政策专业媒体。',
  },
  {
    id: 'thehill', group: 'thehill', name: 'The Hill', short: 'HILL', section: 'politics',
    url: 'https://thehill.com/feed/', home: 'https://thehill.com/',
    country: 'US', countryZh: '美国', type: '商业媒体', class: 'independent', independent: true, tier: 2,
    note: '专注美国国会与政府政策。',
  },
  {
    id: 'axios', group: 'axios', name: 'Axios', short: 'AX', section: 'politics',
    url: 'https://api.axios.com/feed/', home: 'https://www.axios.com/',
    country: 'US', countryZh: '美国', type: '商业媒体', class: 'independent', independent: true, tier: 2,
    note: '美国政治与商业快讯媒体。',
  },
  {
    id: 'politico-eu', group: 'politico-eu', name: 'Politico Europe', short: 'PO EU', section: 'politics',
    url: 'https://www.politico.eu/feed/', home: 'https://www.politico.eu/',
    country: 'BE', countryZh: '比利时', type: '商业媒体', class: 'independent', independent: true, tier: 2,
    note: '欧洲政治与政策专业媒体。',
  },
  {
    id: 'euractiv', group: 'euractiv', name: 'Euractiv', short: 'EUR', section: 'politics',
    url: 'https://www.euractiv.com/feed/', home: 'https://www.euractiv.com/',
    country: 'BE', countryZh: '比利时', type: '商业媒体', class: 'independent', independent: true, tier: 3,
    note: '专注欧盟政策进程的泛欧媒体。',
  },

  /* ---------------------------- Economy ---------------------------- */
  {
    id: 'ft-world', group: 'ft', name: 'Financial Times', short: 'FT', section: 'economy',
    url: 'https://www.ft.com/world?format=rss', home: 'https://www.ft.com/world',
    country: 'GB', countryZh: '英国', type: '商业媒体', class: 'independent', independent: true, tier: 1,
    note: '全球财经与国际事务权威媒体。',
  },
  {
    id: 'cnbc-top', group: 'cnbc', name: 'CNBC', short: 'CNBC', section: 'economy',
    url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html', home: 'https://www.cnbc.com/',
    country: 'US', countryZh: '美国', type: '商业媒体', class: 'independent', independent: true, tier: 2,
    note: '美国商业与市场新闻频道。',
  },
  {
    id: 'economist-finance', group: 'economist', name: 'The Economist', short: 'ECON', section: 'economy',
    url: 'https://www.economist.com/finance-and-economics/rss.xml', home: 'https://www.economist.com/finance-and-economics',
    country: 'GB', countryZh: '英国', type: '商业媒体', class: 'independent', independent: true, tier: 1,
    note: '英国财经与国际时事周刊。',
  },
  {
    id: 'marketwatch', group: 'marketwatch', name: 'MarketWatch', short: 'MW', section: 'economy',
    url: 'https://feeds.marketwatch.com/marketwatch/topstories/', home: 'https://www.marketwatch.com/',
    country: 'US', countryZh: '美国', type: '商业媒体', class: 'independent', independent: true, tier: 2,
    note: '道琼斯旗下市场新闻网站。',
  },
  {
    id: 'ecb', group: 'ecb', name: 'European Central Bank', short: 'ECB', section: 'economy',
    url: 'https://www.ecb.europa.eu/rss/press.html', home: 'https://www.ecb.europa.eu/press/html/index.en.html',
    country: 'EU', countryZh: '欧盟', type: '官方机构', class: 'official', independent: false, tier: 1,
    note: '欧元区货币政策与监管的一手信息。',
  },
  {
    id: 'fed', group: 'fed', name: 'Federal Reserve', short: 'FED', section: 'economy',
    url: 'https://www.federalreserve.gov/feeds/press_all.xml', home: 'https://www.federalreserve.gov/newsevents.htm',
    country: 'US', countryZh: '美国', type: '官方机构', class: 'official', independent: false, tier: 1,
    note: '美联储新闻稿与政策声明。',
  },

  /* ----------------------------- Tech ------------------------------ */
  {
    id: 'ars', group: 'ars', name: 'Ars Technica', short: 'ARS', section: 'tech',
    url: 'https://feeds.arstechnica.com/arstechnica/index', home: 'https://arstechnica.com/',
    country: 'US', countryZh: '美国', type: '商业媒体', class: 'independent', independent: true, tier: 1,
    note: '深度科技与科学报道。',
  },
  {
    id: 'verge', group: 'verge', name: 'The Verge', short: 'VERGE', section: 'tech',
    url: 'https://www.theverge.com/rss/index.xml', home: 'https://www.theverge.com/',
    country: 'US', countryZh: '美国', type: '商业媒体', class: 'independent', independent: true, tier: 2,
    note: '消费科技与数字文化媒体。',
  },
  {
    id: 'wired', group: 'wired', name: 'WIRED', short: 'WIRED', section: 'tech',
    url: 'https://www.wired.com/feed/rss', home: 'https://www.wired.com/',
    country: 'US', countryZh: '美国', type: '商业媒体', class: 'independent', independent: true, tier: 2,
    note: '科技、商业与文化的长篇报道。',
  },
  {
    id: 'mit-tr', group: 'mit-tr', name: 'MIT Technology Review', short: 'MIT TR', section: 'tech',
    url: 'https://www.technologyreview.com/feed/', home: 'https://www.technologyreview.com/',
    country: 'US', countryZh: '美国', type: '学术媒体', class: 'independent', independent: true, tier: 1,
    note: '麻省理工学院旗下科技媒体。',
  },
  {
    id: 'techcrunch', group: 'techcrunch', name: 'TechCrunch', short: 'TC', section: 'tech',
    url: 'https://techcrunch.com/feed/', home: 'https://techcrunch.com/',
    country: 'US', countryZh: '美国', type: '商业媒体', class: 'independent', independent: true, tier: 2,
    note: '创业与科技产业新闻。',
  },
  {
    id: 'ieee-spectrum', group: 'ieee', name: 'IEEE Spectrum', short: 'IEEE', section: 'tech',
    url: 'https://spectrum.ieee.org/feeds/feed.rss', home: 'https://spectrum.ieee.org/',
    country: 'US', countryZh: '美国', type: '专业机构', class: 'independent', independent: true, tier: 1,
    note: 'IEEE 旗下工程与技术媒体。',
  },
  {
    id: 'register', group: 'register', name: 'The Register', short: 'REG', section: 'tech',
    url: 'https://www.theregister.com/feed/', home: 'https://www.theregister.com/',
    country: 'GB', countryZh: '英国', type: '商业媒体', class: 'independent', independent: true, tier: 2,
    note: '英国企业技术与基础设施媒体。',
  },

  /* ---------------------------- Science ---------------------------- */
  {
    id: 'nature', group: 'nature', name: 'Nature', short: 'NAT', section: 'science',
    url: 'https://www.nature.com/nature.rss', home: 'https://www.nature.com/',
    country: 'GB', countryZh: '英国', type: '学术期刊', class: 'independent', independent: true, tier: 1,
    note: '国际顶级综合性科学期刊。',
  },
  {
    id: 'science', group: 'science', name: 'Science', short: 'SCI', section: 'science',
    url: 'https://www.science.org/rss/news_current.xml', home: 'https://www.science.org/news',
    country: 'US', countryZh: '美国', type: '学术期刊', class: 'independent', independent: true, tier: 1,
    note: '美国科学促进会旗下期刊新闻。',
  },
  {
    id: 'sciencedaily', group: 'sciencedaily', name: 'ScienceDaily', short: 'SD', section: 'science',
    url: 'https://www.sciencedaily.com/rss/top/science.xml', home: 'https://www.sciencedaily.com/',
    country: 'US', countryZh: '美国', type: '科学聚合', class: 'independent', independent: true, tier: 3,
    note: '聚合高校与研究机构新闻稿；以原始论文为准。',
  },
  {
    id: 'mitnews', group: 'mitnews', name: 'MIT News', short: 'MIT', section: 'science',
    url: 'https://news.mit.edu/rss/feed', home: 'https://news.mit.edu/',
    country: 'US', countryZh: '美国', type: '学术机构', class: 'independent', independent: true, tier: 2,
    note: '麻省理工学院官方研究新闻。',
  },
  {
    id: 'nasa', group: 'nasa', name: 'NASA', short: 'NASA', section: 'science',
    url: 'https://www.nasa.gov/rss/dyn/breaking_news.rss', home: 'https://www.nasa.gov/news/',
    country: 'US', countryZh: '美国', type: '官方机构', class: 'official', independent: false, tier: 1,
    note: '美国国家航空航天局官方发布。',
  },
  {
    id: 'who', group: 'who', name: 'World Health Organization', short: 'WHO', section: 'science',
    url: 'https://www.who.int/rss-feeds/news-english.xml', home: 'https://www.who.int/news-room',
    country: 'INT', countryZh: '国际组织', type: '国际组织', class: 'official', independent: false, tier: 1,
    note: '世界卫生组织官方新闻与公共卫生通报。',
  },

  /* --------------------------- Diplomacy --------------------------- */
  {
    id: 'unnews', group: 'un', name: 'UN News', short: 'UN', section: 'diplomacy',
    url: 'https://news.un.org/feed/subscribe/en/news/all/rss.xml', home: 'https://news.un.org/en/',
    country: 'INT', countryZh: '国际组织', type: '国际组织', class: 'official', independent: false, tier: 1,
    note: '联合国官方新闻服务。',
  },
  {
    id: 'foreignpolicy', group: 'foreignpolicy', name: 'Foreign Policy', short: 'FP', section: 'diplomacy',
    url: 'https://foreignpolicy.com/feed/', home: 'https://foreignpolicy.com/',
    country: 'US', countryZh: '美国', type: '商业媒体', class: 'independent', independent: true, tier: 2,
    note: '美国国际事务与外交政策媒体。',
  },
  {
    id: 'diplomat', group: 'diplomat', name: 'The Diplomat', short: 'DIP', section: 'diplomacy',
    url: 'https://thediplomat.com/feed/', home: 'https://thediplomat.com/',
    country: 'JP', countryZh: '日本', type: '商业媒体', class: 'independent', independent: true, tier: 2,
    note: '专注亚太地缘政治与外交。',
  },
  {
    id: 'state-dept', group: 'state', name: 'U.S. Department of State', short: 'STATE', section: 'diplomacy',
    url: 'https://www.state.gov/rss-feed/press-releases/feed/', home: 'https://www.state.gov/press-releases/',
    country: 'US', countryZh: '美国', type: '官方机构', class: 'official', independent: false, tier: 1,
    note: '美国国务院新闻稿与声明，代表官方立场。',
  },
  {
    id: 'brookings', group: 'brookings', name: 'Brookings Institution', short: 'BROOK', section: 'diplomacy',
    url: 'https://www.brookings.edu/feed/', home: 'https://www.brookings.edu/',
    country: 'US', countryZh: '美国', type: '智库', class: 'thinktank', independent: true, tier: 2,
    note: '美国公共政策研究机构。',
  },
  {
    id: 'rand', group: 'rand', name: 'RAND Corporation', short: 'RAND', section: 'diplomacy',
    url: 'https://www.rand.org/news/rss.xml', home: 'https://www.rand.org/news.html',
    country: 'US', countryZh: '美国', type: '智库', class: 'thinktank', independent: true, tier: 2,
    note: '美国国家安全与公共政策研究机构。',
  },
  {
    id: 'foreignaffairs', group: 'foreignaffairs', name: 'Foreign Affairs', short: 'FA', section: 'diplomacy',
    url: 'https://www.foreignaffairs.com/rss.xml', home: 'https://www.foreignaffairs.com/',
    country: 'US', countryZh: '美国', type: '商业媒体', class: 'independent', independent: true, tier: 2,
    note: '美国外交关系委员会旗下国际事务杂志。',
  },
  {
    id: 'eu-commission', group: 'eu-commission', name: 'European Commission', short: 'EU', section: 'diplomacy',
    url: 'https://ec.europa.eu/commission/presscorner/api/rss?language=en', home: 'https://ec.europa.eu/commission/presscorner/home/en',
    country: 'EU', countryZh: '欧盟', type: '官方机构', class: 'official', independent: false, tier: 1,
    note: '欧盟委员会官方新闻稿。',
  },

  /* ----------------------- Official positions ---------------------- */
  {
    id: 'cgtn-world', group: 'cgtn', name: 'CGTN', short: 'CGTN', section: 'world',
    url: 'https://www.cgtn.com/subscribe/rss/section/world.xml', home: 'https://www.cgtn.com/world',
    country: 'CN', countryZh: '中国', type: '国家媒体', class: 'state', independent: false, tier: 2,
    note: '中国国际电视台，反映中国官方立场；不计入独立印证。',
  },
  {
    id: 'globaltimes', group: 'globaltimes', name: 'Global Times', short: 'GT', section: 'world',
    url: 'https://www.globaltimes.cn/rss/outbrain.xml', home: 'https://www.globaltimes.cn/',
    country: 'CN', countryZh: '中国', type: '国家媒体', class: 'state', independent: false, tier: 3,
    note: '中国官媒旗下国际评论媒体；不计入独立印证。',
  },
  {
    id: 'ecns', group: 'ecns', name: 'ECNS', short: 'ECNS', section: 'world',
    url: 'https://www.ecns.cn/rss/rss.xml', home: 'https://www.ecns.cn/',
    country: 'CN', countryZh: '中国', type: '国家媒体', class: 'state', independent: false, tier: 3,
    note: '中国新闻社英文网站；提供中国视角，不计入独立印证。',
  },
  {
    id: 'tass', group: 'tass', name: 'TASS', short: 'TASS', section: 'world',
    url: 'https://tass.com/rss/v2.xml', home: 'https://tass.com/',
    country: 'RU', countryZh: '俄罗斯', type: '国家媒体', class: 'state', independent: false, tier: 2,
    note: '俄罗斯国家通讯社，反映俄罗斯官方立场；不计入独立印证。',
  },
  {
    id: 'moscowtimes', group: 'moscowtimes', name: 'The Moscow Times', short: 'MT', section: 'world',
    url: 'https://www.themoscowtimes.com/rss/news', home: 'https://www.themoscowtimes.com/',
    country: 'RU', countryZh: '俄罗斯', type: '独立媒体', class: 'independent', independent: true, tier: 2,
    note: '独立英文媒体，在俄罗斯境外运营。',
  },
];

/** Feeds we deliberately do not fetch in this environment, with a reason. */
export const UNAVAILABLE_SOURCES = [
  {
    id: 'reuters-world', group: 'reuters', name: 'Reuters', short: 'RTRS', section: 'world',
    home: 'https://www.reuters.com/world/', country: 'GB', countryZh: '英国', type: '通讯社',
    class: 'independent', independent: true, tier: 1, reason: '公开 RSS 已停止服务，等待官方接口。',
  },
  {
    id: 'ap-world', group: 'ap', name: 'Associated Press', short: 'AP', section: 'world',
    home: 'https://apnews.com/world-news', country: 'US', countryZh: '美国', type: '通讯社',
    class: 'independent', independent: true, tier: 1, reason: 'RSS 入口受访问策略限制，未纳入自动抓取。',
  },
];

export function getSource(id) {
  return SOURCES.find((s) => s.id === id) || null;
}

export const SOURCE_BY_ID = new Map(SOURCES.map((s) => [s.id, s]));
