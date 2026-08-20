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

function navigationCommandSpeech(value) {
  return normalizedSpeech(value)
    .replace(/^(?:can|could|would|will)\s+you\s+/, "")
    .replace(/\s+please(?:\s+for\s+me)?$/, "")
    .replace(/\s+for\s+me$/, "")
    .trim();
}

function comparableToken(value) {
  const token = normalizedSpeech(value);
  return token.length > 4 && token.endsWith("s")
    ? token.slice(0, -1)
    : token;
}

function comparableTokens(value) {
  return normalizedSpeech(value)
    .split(" ")
    .filter(Boolean)
    .map(comparableToken)
    .filter(Boolean);
}

function navigationIntent(message) {
  const clean = navigationCommandSpeech(message);
  const patterns = [
    /^(?:please )?(?:go|navigate|switch|take me|bring me)(?: to)? (.+)$/,
    /^(?:please )?(?:open|enter|visit|launch) (.+)$/,
    /^(?:please )?(?:show me|bring up) (.+)$/,
  ];

  for (const pattern of patterns) {
    const match = clean.match(pattern);
    if (!match?.[1]) continue;
    return {
      explicit: true,
      query: match[1]
        .replace(/^the /, "")
        .replace(/ (?:page|workspace|screen|section|module)$/, "")
        .trim(),
    };
  }

  return {
    explicit: false,
    query: "",
  };
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

function editDistance(left, right) {
  const a = comparableToken(left);
  const b = comparableToken(right);
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let row = 1; row <= a.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= b.length; column += 1) {
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + (a[row - 1] === b[column - 1] ? 0 : 1),
      );
    }
    previous = current;
  }

  return previous[b.length];
}

function consonantSkeleton(value) {
  return comparableToken(value)
    .replace(/[aeiouy]/g, "")
    .replace(/(.)\1+/g, "$1");
}

function normalizedEditSimilarity(left, right) {
  const a = comparableToken(left);
  const b = comparableToken(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const maximum = Math.max(a.length, b.length);
  return Math.max(0, 1 - editDistance(a, b) / maximum);
}

function tokenSimilarity(left, right) {
  const a = comparableToken(left);
  const b = comparableToken(right);
  if (!a || !b) return 0;
  if (a === b) return 1;

  const lexical = normalizedEditSimilarity(a, b);
  if (a.length < 4 || b.length < 4) return lexical;

  const aSkeleton = consonantSkeleton(a);
  const bSkeleton = consonantSkeleton(b);
  const phonetic =
    aSkeleton && bSkeleton
      ? normalizedEditSimilarity(aSkeleton, bSkeleton)
      : 0;

  return Math.max(lexical, phonetic * 0.94);
}

function directionalCoverage(sourceTokens, targetTokens) {
  if (!sourceTokens.length || !targetTokens.length) return 0;

  const scores = sourceTokens.map((source) =>
    Math.max(
      0,
      ...targetTokens.map((target) => tokenSimilarity(source, target)),
    ),
  );

  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

function aliasScore(query, alias) {
  if (!query || !alias) return 0;
  if (query === alias) return 1;

  const queryTokens = comparableTokens(query);
  const aliasTokens = comparableTokens(alias);
  if (!queryTokens.length || !aliasTokens.length) return 0;

  const queryCoverage = directionalCoverage(queryTokens, aliasTokens);
  const aliasCoverage = directionalCoverage(aliasTokens, queryTokens);
  const exactOverlap = queryTokens.filter((token) => aliasTokens.includes(token)).length;
  const exactCoverage = exactOverlap / Math.max(queryTokens.length, aliasTokens.length);

  const balanced = queryCoverage * 0.46 + aliasCoverage * 0.46 + exactCoverage * 0.08;

  if (queryTokens.length === aliasTokens.length && balanced >= 0.72) {
    return Math.min(0.99, balanced + 0.08);
  }

  if (aliasCoverage >= 0.9 && queryTokens.length <= aliasTokens.length + 1) {
    return Math.min(0.97, balanced + 0.05);
  }

  return balanced;
}

export function resolveInstantOperatorNavigation({
  message,
  targets = [],
} = {}) {
  const intent = navigationIntent(message);
  if (!intent.explicit) return null;

  const query = intent.query;
  if (!query || !Array.isArray(targets) || !targets.length) {
    return {
      explicit_navigation: true,
      matched: false,
      ambiguous: false,
      unresolved: true,
      query,
      target: null,
      alternatives: [],
    };
  }

  const ranked = targets
    .map((target) => {
      const baseScore = Math.max(
        0,
        ...targetAliases(target).map((alias) => aliasScore(query, alias)),
      );
      return {
        target,
        score:
          baseScore +
          (target.kind === "domain" && baseScore >= 0.82 ? 0.055 : 0),
      };
    })
    .filter((entry) => entry.score >= 0.76)
    .sort((left, right) => right.score - left.score);

  if (!ranked.length) {
    return {
      explicit_navigation: true,
      matched: false,
      ambiguous: false,
      unresolved: true,
      query,
      target: null,
      alternatives: [],
    };
  }

  const top = ranked[0];
  const alternatives = ranked
    .filter((entry) => top.score - entry.score < 0.065)
    .slice(0, 4);

  if (alternatives.length > 1) {
    return {
      explicit_navigation: true,
      matched: false,
      ambiguous: true,
      unresolved: false,
      query,
      target: null,
      alternatives: alternatives.map((entry) => entry.target),
    };
  }

  return {
    explicit_navigation: true,
    matched: true,
    ambiguous: false,
    unresolved: false,
    query,
    target: top.target,
    alternatives: [],
  };
}
