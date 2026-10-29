import {
  clamp, cleanText, dice, extractEntities, extractNumbers, hoursAgo, jaccard,
  normalizeTitle, readingTime, shortHash, tokenize, truncate, uniqueBy,
} from './util.mjs';
import { SECTION_ORDER, SECTIONS } from './sources.mjs';

/* ------------------------------------------------------------------ *
 * Classification
 * ------------------------------------------------------------------ */

const SECTION_KEYWORDS = {
  diplomacy: [
    'ceasefire', 'peace talks', 'peace deal', 'summit', 'treaty', 'sanctions', 'diplomat',
    'diplomatic', 'foreign minister', 'embassy', 'consulate', 'nato', 'un security council',
    'bilateral', 'multilateral', 'g7', 'g20', 'brics', 'asean', 'state visit', 'territorial',
    'annex', 'negotiation', 'delegation', 'armistice', 'truce', 'border talks', 'peacekeeping',
    'international court', 'icc', 'war crimes', 'prisoner swap', 'hostages', 'talks resume',
    'free movement', 'brexit', 'foreign policy', 'trade talks', 'visa', 'consular', 'apec',
    'sanctions relief', 'normalisation', 'normalization', 'peace plan',
  ],
  politics: [
    'election', 'elections', 'vote', 'voters', 'parliament', 'congress', 'senate', 'president',
    'prime minister', 'chancellor', 'coalition', 'campaign', 'bill', 'lawmakers', 'policy',
    'government', 'opposition', 'referendum', 'impeachment', 'cabinet', 'minister', 'governor',
    'mayor', 'supreme court', 'ruling party', 'legislation', 'ballot', 'poll', 'candidate',
    'white house', 'downing street', 'kremlin', 'capitol hill', 'shutdown',
  ],
  economy: [
    'inflation', 'interest rate', 'central bank', 'gdp', 'recession', 'tariff', 'trade deal',
    'exports', 'imports', 'stocks', 'shares', 'market', 'bond', 'yield', 'dollar', 'euro',
    'oil price', 'opec', 'budget', 'debt', 'deficit', 'jobs report', 'unemployment', 'wages',
    'earnings', 'ipo', 'merger', 'acquisition', 'crypto', 'bitcoin', 'housing market',
    'consumer prices', 'economy', 'economic', 'growth forecast', 'rate cut', 'rate hike',
    'investors', 'wall street', 'nasdaq', 'dow jones', 'ftse', 'currency', 'trade war',
    'current account', 'trade surplus', 'pension', 'retirement', 'oil prices', 'budget deficit',
  ],
  tech: [
    'artificial intelligence', ' ai ', 'openai', 'chatgpt', 'anthropic', 'nvidia', 'chip',
    'chips', 'semiconductor', 'quantum', 'robot', 'robotics', 'cybersecurity', 'cyberattack',
    'hack', 'hacked', 'data breach', 'software', 'platform', 'algorithm', 'smartphone',
    'iphone', 'android', 'tesla', 'spacex', 'satellite', 'social media', 'tiktok', 'cloud',
    'data center', 'gpu', 'startup', 'app', 'digital', 'automation', 'electric vehicle',
    'driverless', 'self-driving', 'crypto', 'blockchain', 'meta', 'google', 'microsoft',
    'apple', 'amazon', 'bytedance', 'huawei', 'tsmc', 'samsung', 'starlink', 'broadband',
  ],
  science: [
    'study', 'studies', 'research', 'researchers', 'scientists', 'discovery', 'climate',
    'warming', 'emissions', 'biodiversity', 'species', 'vaccine', 'virus', 'disease', 'cancer',
    'brain', 'gene', 'genes', 'dna', 'physics', 'astronomy', 'telescope', 'nasa', 'space mission',
    'mars', 'moon', 'ocean', 'earthquake', 'volcano', 'fossil', 'quantum', 'experiment',
    'patients', 'clinical trial', 'public health', 'medicine', 'neuroscience', 'ecosystem',
    'black hole', 'galaxy', 'asteroid', 'solar', 'fusion', 'particle',
  ],
  world: [
    'war', 'military', 'attack', 'strike', 'killed', 'injured', 'protest', 'crisis', 'flood',
    'wildfire', 'hurricane', 'typhoon', 'drought', 'migration', 'refugee', 'earthquake',
    'explosion', 'shooting', 'hostage', 'humanitarian', 'famine', 'disaster', 'rescue',
  ],
};

const TAG_MAP = [
  { tag: '人工智能', re: /\b(artificial intelligence|ai|openai|chatgpt|anthropic|grok|model|llm|agent)\b/i },
  { tag: '芯片', re: /\b(chip|chips|semiconductor|tsmc|nvidia|gpu|foundry|lithography)\b/i },
  { tag: '关税', re: /\b(tariff|tariffs|trade war|customs duty|trade deal)\b/i },
  { tag: '利率', re: /\b(interest rate|rate cut|rate hike|central bank|federal reserve|ecb)\b/i },
  { tag: '通胀', re: /\b(inflation|consumer prices|cpi|cost of living)\b/i },
  { tag: '选举', re: /\b(election|elections|vote|voters|ballot|poll)\b/i },
  { tag: '冲突', re: /\b(war|ceasefire|strike|attack|military|hostages|offensive|missile)\b/i },
  { tag: '气候', re: /\b(climate|emissions|warming|wildfire|flood|drought|storm)\b/i },
  { tag: '能源', re: /\b(oil|gas|opec|energy|pipeline|renewable|solar|nuclear power)\b/i },
  { tag: '航天', re: /\b(nasa|spacex|starlink|rocket|satellite|moon|mars|orbit|space mission)\b/i },
  { tag: '健康', re: /\b(health|vaccine|virus|disease|cancer|patients|medicine|who)\b/i },
  { tag: '贸易', re: /\b(trade|exports|imports|supply chain|shipping|wto)\b/i },
  { tag: '市场', re: /\b(stock market|stocks|shares|bond yields|earnings|selloff|wall street|nasdaq|s&p 500)\b/i },
  { tag: '监管', re: /\b(regulat|antitrust|lawmakers|ban|probe|investigation|fine)\b/i },
  { tag: '网络安全', re: /\b(cyber|hack|breach|ransomware|malware|security flaw)\b/i },
  { tag: '中东', re: /\b(israel|gaza|lebanon|iran|hezbollah|hamas|syria|yemen|saudi)\b/i },
  { tag: '乌克兰', re: /\b(ukraine|kyiv|zelensky|russia|putin|kremlin)\b/i },
  { tag: '中国', re: /\b(china|chinese|beijing|xi jinping|taiwan|hong kong)\b/i },
  { tag: '美国', re: /\b(united states|u\.s\.|america|washington|trump|congress|white house)\b/i },
  { tag: '欧盟', re: /\b(european union|eu|brussels|european commission|eurozone)\b/i },
];

function sectionScores(text, priorSection) {
  const haystack = ` ${String(text).toLowerCase().replace(/\s+/g, ' ')} `;
  const scores = Object.fromEntries(SECTION_ORDER.map((s) => [s, 0]));
  scores[priorSection] = (scores[priorSection] || 0) + 0.9;
  for (const [section, words] of Object.entries(SECTION_KEYWORDS)) {
    for (const word of words) {
      if (haystack.includes(word)) {
        scores[section] += word.length > 8 ? 1.5 : 1;
      }
    }
  }
  return scores;
}

function classify(sectionVotes, text) {
  const scores = Object.fromEntries(SECTION_ORDER.map((s) => [s, 0]));
  for (const [section, count] of Object.entries(sectionVotes)) {
    scores[section] = (scores[section] || 0) + count * 0.8;
  }
  for (const [section, value] of Object.entries(sectionScores(text, 'world'))) {
    scores[section] += value * 0.9;
  }
  return SECTION_ORDER.reduce((best, section) => (
    (scores[section] || 0) > (scores[best] || 0) ? section : best
  ), 'world');
}

function tagsFor(text) {
  const tags = [];
  for (const { tag, re } of TAG_MAP) {
    if (re.test(text)) tags.push(tag);
    if (tags.length >= 4) break;
  }
  return tags;
}

/* ------------------------------------------------------------------ *
 * Item preparation and clustering
 * ------------------------------------------------------------------ */

const SOFT_NEWS = /\b(celebrity|kardashian|taylor swift|nicki minaj|royal family|prince harry|meghan markle|markle|duchess|sussex|paparazzi|reality tv|love island|soap opera|box office|grammy|oscars?|bake off|strictly come dancing|horoscope|recipe|travel guide|best deals|shopping|fashion week|football|soccer|cricket|basketball|baseball|nfl|nba|mlb|nhl|tennis|golf|boxing|ufc|rugby|olympic|premier league|champions league|world cup|super bowl|readers share|office mistakes)\b/i;
const OPINION = /^(opinion|editorial|commentary|analysis|column)\s*[:|-]/i;
const PRODUCT_POST = /\b(review|hands-on|deals?|gift guide|how to watch|where to buy|streaming guide|prime day|black friday|best .{0,30}(buy|gift|phones?|laptops?|tablets?|headphones?|earbuds?|cameras?|tvs?|monitors?|gadgets?)|foldable phones?|folding phones?|buying guide|lowest price|price drop|dropped to .{0,20}price|discount|save \$)\b/i;
const LOW_SIGNAL = /\b(reddit|r\/\w+|tiktok|influencer|viral trend|traintok|binface|gadgets?|wearables?|how to|what to do in an emergency|republic day|independence day|national day)\b/i;

const GENERIC_EVENT = new Set(`
say says said tell tells told announce announces announced report reports reported
new latest update updates live breaking first last next more most less
plan plans planned move moves moving step steps set sets
make makes made take takes took give gives gave get gets got
come comes came go goes went put puts keep keeps
people official officials government leader leaders country countries
state states city cities region regions area areas
day days week weeks month months year years time times
one two three four five six seven eight nine ten
could would should may might can will
amid after before during over under with without from into about
also still just even now then here there
`.split(/\s+/).filter(Boolean));

const LOCATION_NAMES = new Set(`
United States US USA America United Kingdom UK Britain China Chinese Russia Russian Ukraine Ukrainian
Israel Israeli Palestine Palestinian Gaza West Bank Iran Iranian Saudi Arabia Yemen Yemeni France French
Germany German Brazil Brazilian India Indian Japan Japanese South Korea North Korea Canada Canadian Mexico
Australian Turkey Turkish Syria Syrian Lebanon Lebanese Egypt Egyptian South Africa Nigeria Kenyan Argentina
Venezuela Colombia Chile Spain Spanish Italy Italian Poland Polish Netherlands Belgium Sweden Norway Denmark
Finland Greece Portugal Ireland Scotland Wales Pakistan Afghanistan Iraq Qatari UAE Kuwait Jordan Morocco
Algeria Tunisia Libya Sudan Ethiopia Somalia Congo Taiwan Hong Kong Singapore Malaysia Indonesia Philippines
Thailand Vietnam Myanmar Bangladesh Sri Lanka
Alabama Alaska Arizona Arkansas California Colorado Connecticut Delaware Florida Georgia Hawaii Idaho Illinois
Indiana Iowa Kansas Kentucky Louisiana Maine Maryland Massachusetts Michigan Minnesota Mississippi Missouri
Montana Nebraska Nevada Ohio Oklahoma Oregon Pennsylvania Tennessee Texas Utah Vermont Virginia Washington
Wisconsin Wyoming
Washington New York Los Angeles Chicago Houston Miami Atlanta Detroit Philadelphia Boston Seattle
San Francisco London Paris Berlin Brussels Moscow Kyiv Jerusalem Tel Aviv Gaza City Beijing Shanghai Tokyo
Seoul New Delhi Mumbai Islamabad Tehran Riyadh Cairo Pretoria Cape Town Brasilia Sao Paulo Rio de Janeiro
Buenos Aires Mexico City Ottawa Toronto Vancouver Sydney Melbourne Canberra
`.split(/\s+/).filter(Boolean));

export function isUsableItem(item, now = Date.now(), windowHours = 36) {
  if (!item?.title || !item?.url) return false;
  if (SOFT_NEWS.test(item.title)) return false;
  if (OPINION.test(item.title)) return false;
  if (PRODUCT_POST.test(item.title)) return false;
  if (LOW_SIGNAL.test(item.title)) return false;
  const published = item.publishedAt ? new Date(item.publishedAt).getTime() : 0;
  if (!published) return false;
  const age = (now - published) / 36e5;
  if (age > windowHours) return false;
  if (age < -12) return false;
  return true;
}

function prepareItem(item, now) {
  const text = `${item.title}. ${item.summary || ''}`;
  const titleTokens = new Set(tokenize(item.title));
  const summaryTokens = new Set(tokenize((item.summary || '').slice(0, 420)));
  const tokens = new Set([...titleTokens, ...summaryTokens]);
  const entities = new Set(extractEntities(`${item.title}. ${item.summary || ''}`));
  const locations = new Set();
  for (const entity of entities) {
    const words = entity.split(/\s+/);
    if (LOCATION_NAMES.has(entity) || words.some((word) => LOCATION_NAMES.has(word))) locations.add(entity);
  }
  const entityTokens = new Set();
  for (const entity of entities) {
    for (const token of tokenize(entity)) entityTokens.add(token);
  }
  const eventTokens = new Set(
    [...tokens].filter((token) => !entityTokens.has(token) && !GENERIC_EVENT.has(token)),
  );
  const weights = new Map();
  for (const token of titleTokens) weights.set(token, (weights.get(token) || 0) + 2);
  for (const token of summaryTokens) weights.set(token, (weights.get(token) || 0) + 1);
  const numbers = new Set(extractNumbers(`${item.title}. ${item.summary || ''}`));
  const ageHours = Math.max(0, hoursAgo(item.publishedAt, now));
  const source = item.source || {};
  const quality =
    (source.independent ? 4 : 0)
    + (source.tier === 1 ? 3 : source.tier === 2 ? 1.5 : 0)
    + Math.min(3, (item.summary || '').length / 120)
    + Math.max(0, 3 - ageHours / 12)
    - (/[?!]$/.test(item.title) ? 1 : 0);
  return {
    ...item,
    tokens,
    titleTokens,
    summaryTokens,
    eventTokens,
    weights,
    entities,
    locations,
    numbers,
    text,
    tags: tagsFor(text),
    quality,
    ageHours,
  };
}

function weightedStats(aSet, bSet, aWeights, bWeights) {
  let totalA = 0;
  let totalB = 0;
  let intersection = 0;
  for (const token of aSet) {
    const weight = aWeights.get(token) || 1;
    totalA += weight;
    if (bSet.has(token)) intersection += Math.min(weight, bWeights.get(token) || 1);
  }
  for (const token of bSet) totalB += bWeights.get(token) || 1;
  return {
    intersection,
    totalA,
    totalB,
    dice: totalA + totalB ? (2 * intersection) / (totalA + totalB) : 0,
    containment: Math.min(totalA, totalB) ? intersection / Math.min(totalA, totalB) : 0,
  };
}

function similarity(a, b) {
  const title = dice(a.titleTokens, b.titleTokens);
  const body = weightedStats(a.tokens, b.tokens, a.weights, b.weights);
  const entity = jaccard(a.entities, b.entities);
  const numbers = jaccard(a.numbers, b.numbers);
  let sharedEntities = 0;
  for (const e of a.entities) if (b.entities.has(e)) sharedEntities += 1;
  let sharedNumbers = 0;
  for (const n of a.numbers) if (b.numbers.has(n)) sharedNumbers += 1;
  let eventShared = 0;
  for (const token of a.eventTokens) if (b.eventTokens.has(token)) eventShared += 1;
  let locationConflict = false;
  if (a.locations.size && b.locations.size) {
    const overlap = [...a.locations].some((location) => b.locations.has(location));
    locationConflict = !overlap;
  }
  const score = title * 0.38
    + body.dice * 0.2
    + entity * 0.2
    + numbers * 0.08
    + body.containment * 0.14;
  return {
    score, title, entity, numbers, sharedEntities, sharedNumbers, eventShared,
    containment: body.containment, locationConflict,
  };
}

function shouldMerge(result) {
  // Different named places almost always mean different events. Allow only a
  // near-identical headline to override (e.g. "Paris, France" vs "Paris").
  if (result.locationConflict && result.title < 0.62) return false;
  // Title overlap is the anchor. Summary text is deliberately not enough on
  // its own: political stories share an enormous amount of boilerplate.
  if (result.title >= 0.62) return true;
  if (result.title >= 0.38 && result.score >= 0.36) return true;
  if (result.title >= 0.26 && result.sharedEntities >= 2 && (result.eventShared >= 1 || result.title >= 0.42)) return true;
  if (result.title >= 0.2 && result.sharedEntities >= 2 && result.eventShared >= 2) return true;
  if (result.title >= 0.16 && result.sharedNumbers >= 2) return true;
  return false;
}

function clusterItems(items) {
  const sorted = [...items].sort((a, b) => b.quality - a.quality || a.ageHours - b.ageHours);
  const clusters = [];
  for (const item of sorted) {
    let best = null;
    let bestResult = null;
    for (const cluster of clusters) {
      // A cluster cannot contain two different named places. This stops
      // "campaign trail" or "election" roundups from swallowing separate events.
      if (item.locations.size) {
        const clusterLocations = new Set(cluster.items.flatMap((other) => [...other.locations]));
        if (clusterLocations.size) {
          const overlap = [...item.locations].some((location) => clusterLocations.has(location));
          if (!overlap) continue;
        }
      }
      // Prevent transitive drift: a new item must still resemble the item the
      // cluster was seeded with, not merely some distant member.
      if (cluster.items.length > 1) {
        const seedResult = similarity(item, cluster.seed);
        if (seedResult.title < 0.14 && seedResult.sharedEntities < 2) continue;
        if (seedResult.locationConflict && seedResult.title < 0.62) continue;
      }
      const candidates = cluster.items.slice(0, 6);
      let localBest = null;
      for (const other of candidates) {
        const result = similarity(item, other);
        if (result.locationConflict && result.title < 0.62) continue;
        if (!localBest || result.score > localBest.score) localBest = result;
      }
      if (!localBest) continue;
      const sameGroup = cluster.items.some((x) => x.sourceGroup === item.sourceGroup);
      if (!shouldMerge(localBest, sameGroup)) continue;
      // Penalise same-newsroom merging slightly so distinct stories survive.
      const adjusted = localBest.score - (sameGroup ? 0.035 : 0);
      if (!bestResult || adjusted > bestResult.score) {
        best = cluster;
        bestResult = { ...localBest, score: adjusted };
      }
    }
    if (best) {
      best.items.push(item);
      if (best.items.length === 1) best.seed = item;
    } else {
      clusters.push({ id: shortHash(`${item.sourceId}|${item.url}|${item.title}`, 8), items: [item], seed: item, createdAt: Date.now() });
    }
  }
  return clusters;
}

/**
 * A light second pass. Greedy clustering can leave two coherent groups apart
 * when their first seeds were worded differently; merge only strong matches.
 */
function mergeNearDuplicateClusters(clusters) {
  const merged = [];
  const sorted = [...clusters].sort((a, b) => b.items.length - a.items.length || b.seed.quality - a.seed.quality);
  for (const cluster of sorted) {
    let target = null;
    for (const candidate of merged) {
      const result = similarity(cluster.seed, candidate.seed);
      if (result.locationConflict) continue;
      const strong = result.title >= 0.55
        || (result.title >= 0.4 && result.sharedEntities >= 2 && result.eventShared >= 2)
        || (result.title >= 0.4 && result.sharedEntities >= 1 && result.eventShared >= 3)
        || (result.title >= 0.35 && result.score >= 0.5);
      if (strong && !candidate.items.some((item) => item.url === cluster.seed.url)) {
        target = candidate;
        break;
      }
    }
    if (target) {
      target.items.push(...cluster.items);
    } else {
      merged.push(cluster);
    }
  }
  return merged;
}

/* ------------------------------------------------------------------ *
 * Story construction
 * ------------------------------------------------------------------ */

function angleLabel(title = '') {
  if (/\b(denies|denied|rejects|refuses|dismisses|disputes)\b/i.test(title)) return '否认与回应';
  if (/\b(analysis|explainer|what we know|why it matters)\b/i.test(title)) return '解释';
  if (/\b(opinion|editorial|commentary)\b/i.test(title)) return '评论';
  if (/\b(statement|announces|announced|says|said)\b/i.test(title)) return '表态';
  if (/\b(study|research|scientists|researchers)\b/i.test(title)) return '研究';
  if (/\b(live|updates)\b/i.test(title)) return '滚动更新';
  return '报道';
}

function sourceRank(a, b) {
  return Number(b.independent) - Number(a.independent)
    || (a.tier || 3) - (b.tier || 3)
    || new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0);
}

function chooseRepresentative(items) {
  return [...items].sort((a, b) => {
    const aScore = a.quality
      + (a.title.length >= 45 && a.title.length <= 150 ? 1.2 : 0)
      + Math.min(2, (a.summary || '').length / 180);
    const bScore = b.quality
      + (b.title.length >= 45 && b.title.length <= 150 ? 1.2 : 0)
      + Math.min(2, (b.summary || '').length / 180);
    return bScore - aScore;
  })[0];
}

function makeSources(items) {
  const byGroup = new Map();
  for (const item of items) {
    const key = item.sourceGroup || item.sourceId;
    const existing = byGroup.get(key);
    if (!existing || sourceRank(item, existing) < 0) byGroup.set(key, item);
  }
  return [...byGroup.values()]
    .sort(sourceRank)
    .slice(0, 6)
    .map((item) => {
      const s = item.source || {};
      return {
        id: s.id || item.sourceId,
        name: s.name || item.sourceId,
        short: s.short || (s.name || '?').slice(0, 3).toUpperCase(),
        country: s.country || '',
        countryZh: s.countryZh || '',
        type: s.type || '',
        class: s.class || 'independent',
        independent: Boolean(s.independent),
        tier: s.tier || 3,
        title: item.title,
        url: item.url,
        publishedAt: item.publishedAt,
        summary: truncate(item.summary || '', 260),
        image: item.image || '',
        imageAlt: item.imageAlt || item.title,
        imageWidth: item.imageWidth || 0,
        imageHeight: item.imageHeight || 0,
        angle: angleLabel(item.title),
      };
    });
}

function sharedFrom(items, field) {
  const counts = new Map();
  for (const item of items) {
    const group = item.sourceGroup || item.sourceId;
    for (const value of item[field]) {
      if (!counts.has(value)) counts.set(value, new Set());
      counts.get(value).add(group);
    }
  }
  return [...counts.entries()]
    .filter(([, groups]) => groups.size >= 2)
    .sort((a, b) => b[1].size - a[1].size || b[0].length - a[0].length)
    .map(([value, groups]) => ({ value, sources: groups.size }))
    .slice(0, 8);
}

function detectDispute(sources) {
  const deny = /\b(denies|denied|rejects|rejected|refuses|refused|dismisses|dismissed|disputes|disputed|not true|false)\b/i;
  const affirm = /\b(confirms|confirmed|acknowledges|acknowledged|admits|admitted|accepts|accepted)\b/i;
  const deniers = sources.filter((s) => deny.test(s.title));
  const affirmers = sources.filter((s) => affirm.test(s.title));
  return deniers.length > 0 && affirmers.length > 0
    && new Set([...deniers, ...affirmers].map((s) => s.id)).size >= 2;
}

function verificationFor({ sources, items, section }) {
  const groups = new Set(sources.map((s) => s.id));
  const independent = sources.filter((s) => s.independent);
  const official = sources.filter((s) => s.class === 'official' || s.class === 'state');
  const thinktank = sources.filter((s) => s.class === 'thinktank');
  const countries = new Set(sources.map((s) => s.country).filter((c) => c && c !== 'INT'));
  const independentCountries = new Set(independent.map((s) => s.country).filter((c) => c && c !== 'INT'));
  const sharedEntities = sharedFrom(items, 'entities');
  const sharedNumbers = sharedFrom(items, 'numbers');
  const disputed = detectDispute(sources);
  const tierAvg = sources.reduce((sum, s) => sum + (s.tier || 3), 0) / Math.max(1, sources.length);

  let level;
  let label;
  if (disputed) {
    level = 'disputed';
    label = '表述有分歧';
  } else if (independent.length >= 3) {
    level = 'strong';
    label = '多源印证';
  } else if (independent.length === 2) {
    level = 'cross';
    label = '双源印证';
  } else if (independent.length === 1 && official.length >= 1) {
    level = 'mixed';
    label = '独立 + 官方';
  } else if (groups.size >= 2) {
    level = 'reported';
    label = '多方转述';
  } else if (independent.length === 1) {
    level = 'single';
    label = '单一信源';
  } else {
    level = 'primary';
    label = '一手信源';
  }

  let score = 28
    + independent.length * 17
    + Math.min(5, groups.size) * 3
    + Math.min(4, countries.size) * 2
    + Math.min(3, sharedEntities.length) * 2
    + Math.min(2, sharedNumbers.length) * 3
    + (tierAvg <= 1.6 ? 4 : tierAvg <= 2.2 ? 2 : 0)
    + (section === 'diplomacy' ? 2 : 0);

  if (level === 'strong') score = clamp(score + 6, 82, 98);
  else if (level === 'cross') score = clamp(score, 70, 92);
  else if (level === 'mixed') score = clamp(score, 60, 82);
  else if (level === 'reported') score = clamp(score, 48, 68);
  else if (level === 'single') score = clamp(score, 34, 54);
  else if (level === 'primary') score = clamp(score, 38, 60);
  else if (level === 'disputed') score = clamp(score, 45, 72);

  let note;
  if (level === 'strong') {
    note = `${independent.length} 家独立信源分别报道同一事件，标题与摘要共同提及${sharedEntities.length ? ` ${sharedEntities.slice(0, 3).map((e) => e.value).join('、')}` : '相同主体'}；未发现明显相反表述。`;
  } else if (level === 'cross') {
    note = `2 家独立信源报道同一事件，共同提及${sharedEntities.length ? ` ${sharedEntities.slice(0, 3).map((e) => e.value).join('、')}` : '相同主体'}；建议继续关注后续更新。`;
  } else if (level === 'mixed') {
    note = '1 家独立信源报道，另有官方或国家媒体表态。官方口径不计入独立印证，请对照原文。';
  } else if (level === 'reported') {
    note = '多家信源转述同一表态，但独立信源不足 2 家；当前只能确认“有人这样说”，不能确认事实本身。';
  } else if (level === 'single') {
    note = '目前仅 1 家独立信源报道，尚未获得第二家独立确认。本站保留该条，但降低权重。';
  } else if (level === 'primary') {
    note = '来自官方机构的一手发布。它是一手材料，但不等于独立核实。';
  } else {
    note = '信源之间出现“否认/确认”等不同表述。本站不替任何一方下结论，请对照下方原文。';
  }
  if (disputed) {
    note += ' 已检测到表述差异，建议阅读各信源原文。';
  }

  return {
    level,
    label,
    score,
    confidence: score >= 80 ? '高' : score >= 60 ? '中' : '待确认',
    independentCount: independent.length,
    independentCountries: independentCountries.size,
    officialCount: official.length,
    thinktankCount: thinktank.length,
    sourceCount: groups.size,
    countryCount: countries.size,
    sharedEntities: sharedEntities.map((e) => e.value),
    sharedNumbers: sharedNumbers.map((e) => e.value),
    disputed,
    note,
  };
}

function buildStory(cluster, index, now) {
  const items = cluster.items;
  const rep = chooseRepresentative(items) || items[0];
  const sectionVotes = {};
  for (const item of items) {
    sectionVotes[item.section] = (sectionVotes[item.section] || 0) + 1;
  }
  const combinedText = items.map((i) => `${i.title}. ${i.summary || ''}`).join(' ').slice(0, 4000);
  let section = classify(sectionVotes, combinedText);
  const sources = makeSources(items);
  const imageSource = sources.find((source) => source.image);
  const storyImage = imageSource ? {
    url: imageSource.image,
    alt: imageSource.imageAlt || imageSource.title,
    width: imageSource.imageWidth || 0,
    height: imageSource.imageHeight || 0,
    credit: imageSource.name,
    creditUrl: imageSource.url,
    sourceId: imageSource.id,
  } : null;
  const summaryItem = [...items]
    .filter((i) => (i.summary || '').length >= 50)
    .sort((a, b) => (b.summary || '').length - (a.summary || '').length)[0];
  const summary = cleanText(summaryItem?.summary || rep.summary || '', 420);
  const latest = items.reduce((max, item) => {
    const t = item.publishedAt ? new Date(item.publishedAt).getTime() : 0;
    return t > max ? t : max;
  }, 0);
  const earliest = items.reduce((min, item) => {
    const t = item.publishedAt ? new Date(item.publishedAt).getTime() : Infinity;
    return t < min ? t : min;
  }, Infinity);
  const entities = sharedFrom(items, 'entities').map((e) => e.value);
  if (!entities.length) entities.push(...(rep.entities ? [...rep.entities].slice(0, 5) : []));
  const tags = tagsFor(combinedText);
  if (!tags.length) tags.push(SECTIONS[section].label);
  // A story whose dominant frame is AI, chips, space or cyber belongs in the
  // technology section even if its sources sit in world/politics desks.
  const techTag = tags.find((tag) => ['人工智能', '芯片', '航天', '网络安全'].includes(tag));
  if (techTag && section !== 'tech' && section !== 'science') section = 'tech';
  if (tags.includes('市场') && (section === 'tech' || section === 'politics')) section = 'economy';
  if (section === 'politics' && /\b(free movement|brexit|eu summit|european union)\b/i.test(combinedText)) {
    section = 'diplomacy';
  }
  const verification = verificationFor({ sources, items, section });
  const age = Math.max(0, hoursAgo(new Date(latest || now).toISOString(), now));
  const importance = clamp(
    Math.min(70, verification.independentCount * 14 + verification.sourceCount * 6)
    + verification.score * 0.22
    + Math.max(0, 16 - age * 0.45)
    + (section === 'diplomacy' || section === 'politics' ? 5 : 0)
    + (tags.includes('冲突') ? 4 : 0)
    + Math.min(6, (summary || '').length / 70),
    1, 100,
  );
  return {
    id: `s-${cluster.id}`,
    rank: index + 1,
    section,
    sectionLabel: SECTIONS[section].label,
    title_en: rep.title,
    title_zh: '',
    summary_en: summary,
    summary_zh: '',
    url: rep.url,
    image: storyImage,
    publishedAt: latest ? new Date(latest).toISOString() : now,
    firstPublishedAt: Number.isFinite(earliest) ? new Date(earliest).toISOString() : null,
    sourceCount: verification.sourceCount,
    articleCount: items.length,
    verification,
    sources,
    entities: [...new Set(entities)].slice(0, 8),
    numbers: verification.sharedNumbers.slice(0, 5),
    tags: tags.slice(0, 4),
    readingTime: readingTime(summary),
    importance: Math.round(importance),
    tagsText: tags.join(' '),
  };
}

/* ------------------------------------------------------------------ *
 * Edition assembly
 * ------------------------------------------------------------------ */

function pickHero(stories) {
  return stories.find((s) => s.verification.independentCount >= 1 && s.summary_en.length >= 45)
    || stories[0];
}

function pickTop(stories, hero, count = 3) {
  const chosen = [];
  const usedSections = new Set([hero.section]);
  for (const story of stories) {
    if (story.id === hero.id) continue;
    if (chosen.length >= count) break;
    if (usedSections.has(story.section) && chosen.length < count - 1) continue;
    chosen.push(story);
    usedSections.add(story.section);
  }
  for (const story of stories) {
    if (chosen.length >= count) break;
    if (story.id !== hero.id && !chosen.some((s) => s.id === story.id)) chosen.push(story);
  }
  return chosen;
}

export function makeEditorNote({ feedsOk, feedsConfigured, articlesUsed, stories, verified, topEntities }) {
  const focus = topEntities.slice(0, 3).join('、') || '多条国际线索';
  return `今日，${feedsOk}/${feedsConfigured} 家信源可用，共筛出 ${articlesUsed} 条可核验报道，归并为 ${stories} 条线索；其中 ${verified} 条获得两家以上独立信源交叉印证。版面焦点集中在${focus}。我们保留单一信源条目，但会明确标注，不把“有人报道”等同于“已经发生”。`;
}

export function buildEdition({
  items, feedStats, date, now = Date.now(), maxStories = 32, windowHours = 36,
}) {
  const usable = items
    .filter((item) => isUsableItem(item, now, windowHours))
    .map((item) => prepareItem(item, now));

  // Keep a source from flooding the edition.
  const bySource = new Map();
  const capped = [];
  for (const item of usable.sort((a, b) => b.quality - a.quality || b.ageHours - a.ageHours)) {
    const key = item.sourceGroup || item.sourceId;
    const count = bySource.get(key) || 0;
    if (count >= 8) continue;
    bySource.set(key, count + 1);
    capped.push(item);
  }

  const clusters = mergeNearDuplicateClusters(clusterItems(capped));
  const allStories = clusters
    .map((cluster, index) => buildStory(cluster, index, now))
    .filter((s) => s.title_en && s.sourceCount >= 1)
    .sort((a, b) => b.importance - a.importance || new Date(b.publishedAt) - new Date(a.publishedAt));

  // A front page that is 80% US politics is not a useful international brief.
  // Reserve a minimum per section, then fill remaining slots by importance.
  if (process.env.DEBUG_BRIEF) {
    const counts = Object.fromEntries(SECTION_ORDER.map((section) => [
      section, allStories.filter((s) => s.section === section).length,
    ]));
    console.log('[analyze] all stories by section', counts, 'total', allStories.length);
    for (const section of SECTION_ORDER) {
      console.log(`[analyze] ${section}:`, allStories.filter((s) => s.section === section).slice(0, 6).map((s) => `${s.sourceCount}/${s.articleCount} ${s.title_en.slice(0, 80)}`));
    }
  }
  const minPerSection = 5;
  const maxPerSection = 7;
  const selected = [];
  const selectedIds = new Set();
  for (const section of SECTION_ORDER) {
    const list = allStories.filter((s) => s.section === section).slice(0, minPerSection);
    for (const story of list) {
      selected.push(story);
      selectedIds.add(story.id);
    }
  }
  const sectionCounts = new Map();
  for (const story of selected) sectionCounts.set(story.section, (sectionCounts.get(story.section) || 0) + 1);
  for (const story of allStories) {
    if (selected.length >= maxStories) break;
    if (selectedIds.has(story.id)) continue;
    const count = sectionCounts.get(story.section) || 0;
    if (count >= maxPerSection) continue;
    selected.push(story);
    selectedIds.add(story.id);
    sectionCounts.set(story.section, count + 1);
  }
  const stories = selected
    .sort((a, b) => (
      b.verification.independentCount - a.verification.independentCount
      || b.importance - a.importance
      || new Date(b.publishedAt) - new Date(a.publishedAt)
    ))
    .slice(0, maxStories)
    .map((s, i) => ({ ...s, rank: i + 1 }));

  if (!stories.length) {
    return {
      date,
      generatedAt: new Date(now).toISOString(),
      status: 'empty',
      hero: null,
      topStories: [],
      stories: [],
      sections: [],
      brief: [],
      stats: { feedsConfigured: feedStats.configured, feedsOk: feedStats.ok, articlesFetched: feedStats.fetched, articlesUsed: 0, stories: 0, verified: 0, independentSources: 0, countries: 0 },
      editorNote: '本期没有获得足够的新鲜报道。请检查网络或稍后手动更新。',
    };
  }

  const hero = pickHero(stories);
  const topStories = pickTop(stories, hero, 3);
  const topEntities = (() => {
    const counts = new Map();
    for (const story of [hero, ...topStories, ...stories.slice(0, 8)]) {
      for (const entity of story.entities.slice(0, 3)) counts.set(entity, (counts.get(entity) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([e]) => e).slice(0, 6);
  })();

  const sections = SECTION_ORDER.map((section) => {
    const list = stories.filter((s) => s.section === section).slice(0, 5);
    return {
      id: section,
      ...SECTIONS[section],
      count: stories.filter((s) => s.section === section).length,
      storyIds: list.map((s) => s.id),
    };
  }).filter((s) => s.count > 0);

  const verified = stories.filter((s) => s.verification.independentCount >= 2).length;
  const independentSources = new Set(
    stories.flatMap((s) => s.sources.filter((x) => x.independent).map((x) => x.id)),
  ).size;
  const countries = new Set(
    stories.flatMap((s) => s.sources.map((x) => x.country).filter((c) => c && c !== 'INT')),
  ).size;
  const categories = new Set(stories.map((s) => s.section)).size;

  const brief = stories.slice(0, 6).map((s) => ({
    id: s.id,
    title: s.title_en,
    section: s.sectionLabel,
    sourceCount: s.sourceCount,
    verification: s.verification.label,
  }));

  return {
    date,
    generatedAt: new Date(now).toISOString(),
    status: 'live',
    heroId: hero.id,
    topIds: topStories.map((s) => s.id),
    hero,
    topStories,
    stories,
    sections,
    brief,
    stats: {
      feedsConfigured: feedStats.configured,
      feedsOk: feedStats.ok,
      articlesFetched: feedStats.fetched,
      articlesUsed: usable.length,
      stories: stories.length,
      verified,
      independentSources,
      countries,
      categories,
      sources: feedStats.ok,
    },
    topEntities,
    editorNote: makeEditorNote({
      feedsOk: feedStats.ok,
      feedsConfigured: feedStats.configured,
      articlesUsed: usable.length,
      stories: stories.length,
      verified,
      topEntities,
    }),
  };
}

export { clusterItems, prepareItem, similarity, shouldMerge };
