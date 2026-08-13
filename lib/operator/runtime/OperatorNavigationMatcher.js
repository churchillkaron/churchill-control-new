function text(value) {
  return String(value ?? "").trim();
}

function normalizedSpeech(value) {
  return text(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9\u0e00-\u0e7f\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function comparableTokens(value) {
  return normalizedSpeech(value)
    .split(" ")
    .filter(Boolean)
    .map((token) => token.length > 4 && token.endsWith("s")
      ? token.slice(0, -1)
      : token);
}

function navigationQuery(message) {
  const clean = normalizedSpeech(message);
  const patterns = [
    /^(?:please )?(?:go|navigate|switch|take me|bring me)(?: to)? (.+)$/,
    /^(?:please )?(?:open|enter|visit|launch) (.+)$/,
    /^(?:please )?(?:show me|bring up) (.+)$/,
  ];

  for (const pattern of patterns) {
    const match = clean.match(pattern);
    if (!match?.[1]) continue;
    return match[1]
      .replace(/^the /, "")
      .replace(/ (?:page|workspace|screen|section|module)$/, "")
      .trim();
  }

  return "";
}

function targetAliases(target = {}) {
  const route = normalizedSpeech(target.route);
  const routeParts = route.split(" ").filter(Boolean);
  const routeTail = routeParts.slice(-2).join(" ");
  const aliases = [
    target.name,
    target.item_id,
    route,
    routeTail,
    routeParts[routeParts.length - 1],
  ];

  if (target.kind === "domain") {
    aliases.push(target.domain_id, target.id);
  }

  if (/design studio/i.test(text(target.name))) {
    aliases.push("studio", "creative studio", "creative");
  }

  return [...new Set(aliases.map(normalizedSpeech).filter(Boolean))];
}

function aliasScore(query, alias) {
  if (!query || !alias) return 0;
  if (query === alias) return 1;

  const queryTokens = comparableTokens(query);
  const aliasTokens = comparableTokens(alias);
  if (!queryTokens.length || !aliasTokens.length) return 0;

  const querySet = new Set(queryTokens);
  const aliasSet = new Set(aliasTokens);
  const overlap = queryTokens.filter((token) => aliasSet.has(token)).length;
  const queryCovered = overlap / querySet.size;
  const aliasCovered = overlap / aliasSet.size;

  if (queryCovered === 1) return 0.88 + Math.min(0.08, aliasCovered * 0.08);
  if (aliasCovered === 1 && queryCovered >= 0.75) {
    return 0.82 + Math.min(0.08, queryCovered * 0.08);
  }
  return queryCovered * 0.55 + aliasCovered * 0.25;
}

export function resolveInstantOperatorNavigation({
  message,
  targets = [],
} = {}) {
  const query = navigationQuery(message);
  if (!query || !Array.isArray(targets) || !targets.length) return null;

  const ranked = targets
    .map((target) => {
      const score = Math.max(
        0,
        ...targetAliases(target).map((alias) => aliasScore(query, alias)),
      );
      return {
        target,
        score: score + (target.kind === "domain" && score === 1 ? 0.08 : 0),
      };
    })
    .filter((entry) => entry.score >= 0.82)
    .sort((left, right) => right.score - left.score);

  if (!ranked.length) return null;

  const top = ranked[0];
  const alternatives = ranked
    .filter((entry) => top.score - entry.score < 0.055)
    .slice(0, 4);

  if (alternatives.length > 1) {
    return {
      matched: false,
      ambiguous: true,
      query,
      alternatives: alternatives.map((entry) => entry.target),
    };
  }

  return {
    matched: true,
    ambiguous: false,
    query,
    target: top.target,
    alternatives: [],
  };
}
