function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function normalized(value) {
  return text(value)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\u0e00-\u0e7f\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value) {
  return normalized(value)
    .split(" ")
    .map((item) => item.trim())
    .filter((item) => item.length > 1);
}

function unique(values = []) {
  return Array.from(new Set(values.map(text).filter(Boolean)));
}

function compactToken(value) {
  return normalized(value).replace(/\s+/g, "");
}

function tokenSimilarity(left, right) {
  const a = compactToken(left);
  const b = compactToken(right);
  if (!a || !b) return 0;
  if (a === b) return 1;

  const shortest = Math.min(a.length, b.length);
  if (shortest >= 4 && (a.startsWith(b) || b.startsWith(a))) {
    return Math.min(0.94, shortest / Math.max(a.length, b.length) + 0.32);
  }

  if (shortest < 4) return 0;

  const aBigrams = new Set();
  const bBigrams = new Set();
  for (let index = 0; index < a.length - 1; index += 1) {
    aBigrams.add(a.slice(index, index + 2));
  }
  for (let index = 0; index < b.length - 1; index += 1) {
    bBigrams.add(b.slice(index, index + 2));
  }
  if (!aBigrams.size || !bBigrams.size) return 0;

  let intersection = 0;
  for (const gram of aBigrams) {
    if (bBigrams.has(gram)) intersection += 1;
  }
  const union = new Set([...aBigrams, ...bBigrams]).size;
  return union ? intersection / union : 0;
}

export function schemaVocabulary(schema = {}) {
  if (!schema || typeof schema !== "object") return [];
  const properties = schema.properties && typeof schema.properties === "object"
    ? schema.properties
    : {};
  const output = [];
  for (const [name, definition] of Object.entries(properties)) {
    output.push(name);
    if (definition && typeof definition === "object") {
      output.push(definition.title, definition.description);
      if (Array.isArray(definition.enum)) output.push(...definition.enum);
    }
  }
  return unique(output);
}

export function capabilityVocabulary(capability = {}) {
  const primary = unique([
    capability.key,
    capability.name,
    capability.domain,
    capability.capability,
    capability.action,
    capability.document,
    capability.workspace_id,
    capability.item_id,
    ...list(capability.operator_aliases),
    ...list(capability.aliases),
  ]);
  const schema = unique([
    ...schemaVocabulary(capability.input_schema),
    ...schemaVocabulary(capability.output_schema),
  ]);
  const secondary = unique([
    capability.description,
    capability.search_text,
    capability.group_name,
    ...list(capability.tags),
    ...list(capability.operator_examples),
    ...list(capability.examples),
  ]);
  return {
    primary,
    secondary,
    schema,
    primaryTokens: tokens(primary.join(" ")),
    secondaryTokens: tokens(secondary.join(" ")),
    schemaTokens: tokens(schema.join(" ")),
  };
}

function tokenWeight(token) {
  return Math.max(1, Math.min(8, token.length - 1));
}

function weightedCoverage(queryTokens, candidateTokens, {
  fuzzy = false,
  minimumSimilarity = 0.58,
} = {}) {
  if (!queryTokens.length || !candidateTokens.length) return 0;
  const candidate = new Set(candidateTokens);
  let total = 0;
  let matched = 0;

  for (const token of queryTokens) {
    const weight = tokenWeight(token);
    total += weight;
    if (candidate.has(token)) {
      matched += weight;
      continue;
    }
    if (!fuzzy) continue;

    let best = 0;
    for (const candidateToken of candidateTokens) {
      best = Math.max(best, tokenSimilarity(token, candidateToken));
      if (best >= 0.94) break;
    }
    if (best >= minimumSimilarity) {
      matched += weight * Math.min(0.9, best);
    }
  }
  return total > 0 ? matched / total : 0;
}

function phraseAffinity(message, phrases = []) {
  const query = normalized(message);
  if (!query) return 0;
  let affinity = 0;
  for (const phrase of phrases) {
    const candidate = normalized(phrase);
    if (!candidate || candidate.length < 3) continue;
    if (query === candidate) {
      affinity = Math.max(affinity, 1);
      continue;
    }
    if (query.includes(candidate)) {
      affinity = Math.max(affinity, Math.min(0.95, candidate.length / query.length + 0.25));
      continue;
    }
    if (candidate.includes(query) && query.length >= 4) {
      affinity = Math.max(affinity, Math.min(0.8, query.length / candidate.length + 0.15));
    }
  }
  return affinity;
}

function matchesMode(capability, modes) {
  if (!Array.isArray(modes) || !modes.length) return true;
  return modes.includes(normalized(capability?.mode));
}

function relevance(capability, message, modes) {
  if (!matchesMode(capability, modes)) return null;
  const queryTokens = tokens(message);
  if (!queryTokens.length) return null;
  const vocabulary = capabilityVocabulary(capability);
  const primaryCoverage = weightedCoverage(queryTokens, vocabulary.primaryTokens);
  const secondaryCoverage = weightedCoverage(queryTokens, vocabulary.secondaryTokens);
  const schemaCoverage = weightedCoverage(queryTokens, vocabulary.schemaTokens);
  const fuzzyPrimaryCoverage = weightedCoverage(
    queryTokens,
    vocabulary.primaryTokens,
    { fuzzy: true },
  );
  const fuzzySchemaCoverage = weightedCoverage(
    queryTokens,
    vocabulary.schemaTokens,
    { fuzzy: true, minimumSimilarity: 0.64 },
  );
  const queryVocabulary = [
    ...vocabulary.primaryTokens,
    ...vocabulary.secondaryTokens,
    ...vocabulary.schemaTokens,
  ];
  const reverseCoverage = weightedCoverage(queryVocabulary, queryTokens, {
    fuzzy: true,
    minimumSimilarity: 0.7,
  });
  const phrase = phraseAffinity(message, vocabulary.primary);
  const score = Math.max(
    0,
    Math.min(
      1,
      primaryCoverage * 0.34 +
        secondaryCoverage * 0.12 +
        schemaCoverage * 0.12 +
        fuzzyPrimaryCoverage * 0.14 +
        fuzzySchemaCoverage * 0.08 +
        Math.min(1, reverseCoverage * 2) * 0.06 +
        phrase * 0.14,
    ),
  );
  if (score <= 0) return null;
  return {
    capability,
    score,
    primary_coverage: primaryCoverage,
    secondary_coverage: secondaryCoverage,
    schema_coverage: schemaCoverage,
    fuzzy_primary_coverage: fuzzyPrimaryCoverage,
    fuzzy_schema_coverage: fuzzySchemaCoverage,
    phrase_affinity: phrase,
  };
}

export function rankOperatorCapabilities({
  message,
  capabilities = [],
  modes = null,
  limit = 12,
} = {}) {
  return list(capabilities)
    .map((capability, index) => ({ index, relevance: relevance(capability, message, modes) }))
    .filter((entry) => entry.relevance)
    .sort((a, b) =>
      b.relevance.score - a.relevance.score ||
      b.relevance.phrase_affinity - a.relevance.phrase_affinity ||
      b.relevance.primary_coverage - a.relevance.primary_coverage ||
      b.relevance.schema_coverage - a.relevance.schema_coverage ||
      a.index - b.index,
    )
    .slice(0, Math.max(1, Math.min(Number(limit) || 12, 48)))
    .map((entry) => entry.relevance);
}

export function resolveOperatorCapabilityMatch(options = {}) {
  const ranked = rankOperatorCapabilities(options);
  if (!ranked.length) return null;
  const top = ranked[0];
  const second = ranked[1] || null;
  const separation = second ? Math.max(0, top.score - second.score) : top.score;
  return {
    top,
    ranked,
    separation,
    confidence: Math.max(
      0,
      Math.min(0.99, top.score * 0.82 + Math.min(0.3, separation) * 0.6),
    ),
  };
}

export default rankOperatorCapabilities;
