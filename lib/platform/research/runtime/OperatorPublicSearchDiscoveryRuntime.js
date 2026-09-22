import {
  runOperatorWebSourceRead,
} from "./OperatorWebSourceReadRuntime.js";

export const OPERATOR_PUBLIC_SEARCH_DISCOVERY_CONTRACT =
  "AVANTIQO_PUBLIC_SEARCH_DISCOVERY_V1";

const BING_SEARCH_HOST = "www.bing.com";
const DUCK_SEARCH_HOST = "lite.duckduckgo.com";
const MAX_SEARCH_QUERIES = 4;
const MAX_DISCOVERED_URLS = 24;
const MAX_FETCHED_SOURCES = 10;

function text(value, max = 4000) {
  return String(value ?? "").trim().slice(0, max);
}
function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}
function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
function normalizedTokens(value) {
  return text(value, 2000).toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/)
    .filter((item) => item.length >= 4 && !["official", "tourism", "landmarks", "technology", "geography"].includes(item));
}
function destinationScore(url, query) {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    const tokens = normalizedTokens(query);
    let score = tokens.reduce((sum, token) => sum + (host.includes(token) ? 30 : 0), 0);
    if (/\.(gov|gov\.[a-z]{2}|go\.[a-z]{2})$/.test(host)) score += 80;
    if (host.includes("wikipedia.org")) score -= 20;
    if (host.includes("britannica.com")) score -= 5;
    return score;
  } catch {
    return -1000;
  }
}
function explicitOfficialEvidence(source = {}) {
  const host = text(source.publisher, 300).toLowerCase().replace(/^www\./, "");
  const corpus = `${text(source.title, 800)} ${text(source.excerpt, 1800)}`.toLowerCase();
  return /\.(gov|gov\.[a-z]{2}|go\.[a-z]{2})$/.test(host) ||
    /\bofficial website\b|\bministry of\b|\bgovernment of\b|\btourism authority of\b/.test(corpus);
}
function blockedSearchHost(hostname) {
  const host = text(hostname, 300).toLowerCase().replace(/^www\./, "");
  return host === "bing.com" || host.endsWith(".bing.com") ||
    host === "microsoft.com" || host.endsWith(".microsoft.com") ||
    host === "duckduckgo.com" || host.endsWith(".duckduckgo.com");
}

function decodeDuckDestination(value) {
  try {
    const raw = text(value, 4000);
    const url = new URL(raw, "https://duckduckgo.com");
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host === "duckduckgo.com" || host.endsWith(".duckduckgo.com")) {
      const encoded = text(url.searchParams.get("uddg"), 4000);
      if (!encoded) return null;
      const target = new URL(decodeURIComponent(encoded));
      if (!["http:", "https:"].includes(target.protocol) || blockedSearchHost(target.hostname)) return null;
      target.hash = "";
      return target.toString();
    }
    if (!["http:", "https:"].includes(url.protocol) || blockedSearchHost(url.hostname)) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function decodeBingDestination(value) {
  try {
    const url = new URL(text(value, 4000));
    if (url.hostname.toLowerCase().replace(/^www\./, "") !== "bing.com") return url.toString();
    if (!url.pathname.startsWith("/ck/a")) return null;
    const encoded = text(url.searchParams.get("u"), 4000);
    if (!encoded.startsWith("a1")) return null;
    const base64 = encoded.slice(2).replace(/-/g, "+").replace(/_/g, "/");
    const padded = `${base64}${"=".repeat((4 - (base64.length % 4)) % 4)}`;
    const decoded = Buffer.from(padded, "base64").toString("utf8");
    const target = new URL(decoded);
    if (!["http:", "https:"].includes(target.protocol) || blockedSearchHost(target.hostname)) return null;
    target.hash = "";
    return target.toString();
  } catch {
    return null;
  }
}

async function discoverQuery(query, sourceReader) {
  const duckUrl = `https://${DUCK_SEARCH_HOST}/lite/?q=${encodeURIComponent(query)}`;
  try {
    const duckPage = await sourceReader({ payload: { url: duckUrl, max_characters: 18000 } });
    const duckResults = unique(list(duckPage.links).map(decodeDuckDestination))
      .sort((left, right) => destinationScore(right, query) - destinationScore(left, query))
      .slice(0, MAX_DISCOVERED_URLS);
    if (duckResults.length >= 4) return duckResults;
  } catch {}
  const bingUrl = `https://${BING_SEARCH_HOST}/search?q=${encodeURIComponent(query)}&count=12&setlang=en`;
  const bingPage = await sourceReader({ payload: { url: bingUrl, max_characters: 12000 } });
  return unique(list(bingPage.links).map(decodeBingDestination))
    .sort((left, right) => destinationScore(right, query) - destinationScore(left, query))
    .slice(0, MAX_DISCOVERED_URLS);
}
export async function runOperatorPublicSearchDiscovery({
  context = {},
  payload = {},
  sourceReader = runOperatorWebSourceRead,
} = {}) {
  const organizationId = text(context.organizationId || context.organization_id, 160);
  if (!organizationId) throw new Error("PUBLIC_SEARCH_DISCOVERY_ORGANIZATION_REQUIRED");
  const query = text(payload.query, 4000);
  if (!query) throw new Error("PUBLIC_SEARCH_DISCOVERY_QUERY_REQUIRED");
  const suppliedQueries = list(payload.queries).map((item) => text(item, 1200)).filter(Boolean);
  const queries = unique(suppliedQueries.length ? suppliedQueries : [query]).slice(0, MAX_SEARCH_QUERIES);
  const seedUrls = unique(list(payload.seed_urls).map((item) => text(item, 2000)).filter(Boolean)).slice(0, 10);

  const discoveredGroups = await Promise.all(
    queries.map((item) => discoverQuery(item, sourceReader).catch(() => [])),
  );
  const discovered = [];
  const seen = new Set();
  for (const url of seedUrls) {
    if (!url || seen.has(url)) continue;
    try {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol) || blockedSearchHost(parsed.hostname)) continue;
      parsed.hash = "";
      seen.add(parsed.toString());
      discovered.push(parsed.toString());
    } catch {}
  }
  for (let rank = 0; rank < MAX_DISCOVERED_URLS && discovered.length < MAX_DISCOVERED_URLS; rank += 1) {
    for (const group of discoveredGroups) {
      const url = group[rank];
      if (!url || seen.has(url)) continue;
      seen.add(url);
      discovered.push(url);
      if (discovered.length >= MAX_DISCOVERED_URLS) break;
    }
  }
  if (!discovered.length) throw new Error("PUBLIC_SEARCH_DISCOVERY_NO_RESULTS");

  const fetched = await Promise.all(discovered.slice(0, MAX_FETCHED_SOURCES).map(async (url, index) => {
    try {
      const source = await sourceReader({ payload: { url, max_characters: 8000 } });
      const record = {
        id: `public-source-${index + 1}`,
        url: source.final_url || url,
        title: source.title || null,
        publisher: new URL(source.final_url || url).hostname,
        excerpt: text(source.content, 2600),
        retrieved_at: source.retrieved_at || new Date().toISOString(),
      };
      const official = explicitOfficialEvidence(record);
      return {
        ...record,
        official,
        primary: official,
      };
    } catch {
      return null;
    }
  }));
  const sources = fetched.filter((item) => item?.excerpt);
  if (sources.length < 2) {
    throw new Error(`PUBLIC_SEARCH_DISCOVERY_MINIMUM_SOURCES_NOT_MET:${sources.length}:2`);
  }
  return {
    contract: OPERATOR_PUBLIC_SEARCH_DISCOVERY_CONTRACT,
    status: "PUBLIC_EVIDENCE_DISCOVERED",
    query,
    queries,
    seed_urls: seedUrls,
    sources,
    answer: `Discovered and safely fetched ${sources.length} public source(s).`,
    evidence: {
      search_transport: "PUBLIC_SEARCH_HTML",
      search_provider_intelligence_used: false,
      external_intelligence_provider_used: false,
      owned_reasoning_required: true,
      internet_content_untrusted: true,
    },
    governance: {
      authorization_effect: "NONE",
      permission_effect: "NONE",
      execution_effect: "NONE",
      secrets_allowed: false,
      external_actions_allowed: false,
    },
  };
}

export default runOperatorPublicSearchDiscovery;
