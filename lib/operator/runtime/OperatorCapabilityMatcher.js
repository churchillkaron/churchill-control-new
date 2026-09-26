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

const LOW_SIGNAL_TOKENS = new Set([
  "a", "an", "and", "the", "this", "that", "these", "those", "it", "its", "me", "my", "our", "your", "who", "which", "what", "does",
  "show", "tell", "give", "find", "get", "use", "using", "current", "currently", "right", "now",
  "exact", "approved", "agreed", "reviewed", "existing", "active", "new", "one", "all",
  "record", "records", "business", "organization", "organisation", "entity", "status",
  "read", "run", "apply", "make", "from", "for", "with", "into", "after",
]);

const TOKEN_CANONICAL = new Map([
  ["assigned", "assign"], ["assigning", "assign"], ["assignment", "assign"], ["assignments", "assign"],
  ["alerts", "alert"], ["bookings", "booking"], ["customers", "customer"], ["departments", "department"],
  ["documents", "document"], ["employees", "employee"], ["invoices", "invoice"], ["locations", "location"],
  ["orders", "order"], ["projects", "project"], ["quotations", "quote"], ["quotation", "quote"], ["quotes", "quote"],
  ["receivables", "receivable"], ["payables", "payable"], ["receipts", "receipt"], ["suppliers", "supplier"],
  ["vendor", "supplier"], ["vendors", "supplier"], ["teams", "team"], ["positions", "position"],
  ["constraints", "constraint"], ["activities", "activity"], ["issues", "issue"], ["obligations", "obligation"],
  ["permits", "permit"], ["workflows", "workflow"], ["messages", "message"], ["drafts", "draft"],
]);

function canonicalToken(value) {
  const source = String(value || "").trim();
  if (!source) return "";
  if (TOKEN_CANONICAL.has(source)) return TOKEN_CANONICAL.get(source);
  if (source.length > 5 && source.endsWith("ies")) return `${source.slice(0, -3)}y`;
  if (source.length > 5 && source.endsWith("ing")) return source.slice(0, -3);
  if (source.length > 4 && source.endsWith("ed")) return source.slice(0, -2);
  if (source.length > 4 && source.endsWith("s") && !source.endsWith("ss")) return source.slice(0, -1);
  return source;
}

function tokens(value) {
  return normalized(value)
    .split(" ")
    .map((item) => canonicalToken(item.trim()))
    .filter((item) => item.length > 1);
}

const QUERY_CONCEPT_EXPANSIONS = [
  { test: /\b(on duty|staffing|staff coverage|who owns the work|who is assigned|who's assigned|people assigned|staff assigned|assigned people|assigned staff)\b/i, add: ["assignment", "assign", "operations"] },
  { test: /\b(ops warnings?|operational warnings?|operational issues?|ops issues?|unresolved issues?|open warnings?)\b/i, add: ["alert"] },
  { test: /\b(liquidity|cash position|cash pressure)\b/i, add: ["cash", "management"] },
  { test: /\b(customers? (?:still )?owe|money owed by customers|receivables?)\b/i, add: ["account", "receivable"] },
  { test: /\b(quotes?|quotations?)\b/i, add: ["quote", "commercial"] },
  { test: /\b(controlled file|controlled document|document library)\b/i, add: ["document", "file"] },
  { test: /\b(po|purchase order)\b/i, add: ["purchase", "order"] },
  { test: /\b(supplier invoice|vendor invoice|vendor bill|supplier bill)\b/i, add: ["supplier", "bill", "invoice", "finance"] },
  { test: /\b(food cost|dish cost|recipe cost|cost impact|affected dishes?)\b/i, add: ["purchase", "cost", "recipe", "dish"] },
  { test: /\b(vendor|supplier)\b/i, add: ["supplier"] },
  { test: /\b(service consumption|service usage|consumption)\b/i, add: ["usage"] },
  { test: /\b(creative production queue|creative queue|production queue)\b/i, add: ["creative", "production", "inspect"] },
  { test: /\b(measurable loss|business loss|hurting the business measurably|outcome finding)\b/i, add: ["outcome", "loss"] },
  { test: /\b(hotel arrivals?|arrivals tonight)\b/i, add: ["hotel", "booking", "arrival"] },
  { test: /\b(open work orders?|operational jobs?|work jobs?|jobs? (?:still )?open)\b/i, add: ["work", "order", "operations"] },
];

function expandedQueryTokens(value) {
  const base = tokens(value);
  const expanded = [...base];
  const source = text(value);
  for (const rule of QUERY_CONCEPT_EXPANSIONS) {
    if (!rule.test.test(source)) continue;
    for (const token of rule.add) expanded.push(canonicalToken(token));
  }
  return unique(expanded);
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
  if (LOW_SIGNAL_TOKENS.has(token)) return 0.35;
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

function contiguousNgramAffinity(message, phrases = []) {
  const queryTokens = tokens(message);
  if (queryTokens.length < 2) return 0;
  const query = ` ${queryTokens.join(" ")} `;
  let best = 0;
  for (const phrase of phrases) {
    const candidateTokens = tokens(phrase);
    for (let size = Math.min(4, candidateTokens.length); size >= 2; size -= 1) {
      for (let index = 0; index <= candidateTokens.length - size; index += 1) {
        const gram = candidateTokens.slice(index, index + size).join(" ");
        if (gram.length < 6) continue;
        if (query.includes(` ${gram} `)) {
          best = Math.max(best, size >= 4 ? 1 : size === 3 ? 0.82 : 0.58);
        }
      }
      if (best >= 1) break;
    }
  }
  return best;
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

function clauseAffinity(message, vocabulary) {
  const clauses = normalized(message)
    .split(/\b(?:and|but|while|versus|vs)\b|[,;]/g)
    .map((clause) => clause.trim())
    .filter((clause) => tokens(clause).filter((token) => !LOW_SIGNAL_TOKENS.has(token)).length >= 2);
  if (clauses.length < 2) return 0;
  let best = 0;
  for (const clause of clauses) {
    const clauseTokens = tokens(clause);
    const primary = weightedCoverage(clauseTokens, vocabulary.primaryTokens, { fuzzy: true });
    const secondary = weightedCoverage(clauseTokens, vocabulary.secondaryTokens, { fuzzy: true });
    best = Math.max(best, primary * 0.7 + secondary * 0.3);
  }
  return Math.min(1, best);
}

function actionIntentAffinity(message, capability) {
  const query = normalized(message);
  const action = canonicalToken(capability?.action || "");
  if (!query || !action) return 0;
  const patterns = {
    create: /\b(create|new|add|open|raise|make|start a new|save this upload)\b/i,
    assign: /\b(assign|assigned to|give .* to|owner)\b/i,
    send: /\b(send|dispatch)\b/i,
    draft: /\b(draft|prepare .* reply|do not send|don't send)\b/i,
    post: /\b(post|mark .* paid|record payment|paid into)\b/i,
    receive: /\b(receive|received into|into stock)\b/i,
    update: /\b(update|change|revise|correct)\b/i,
    upsert: /\b(update|replace|revise|recost)\b/i,
    correct: /\b(correct|fix|move .* date|shift .* date)\b/i,
  };
  const pattern = patterns[action];
  return pattern && pattern.test(query) ? 1 : 0;
}

function matchesMode(capability, modes) {
  if (!Array.isArray(modes) || !modes.length) return true;
  return modes.includes(normalized(capability?.mode));
}

function relevance(capability, message, modes) {
  if (!matchesMode(capability, modes)) return null;
  const queryTokens = expandedQueryTokens(message);
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
  const secondaryPhrase = phraseAffinity(message, vocabulary.secondary);
  const conceptAffinity = Math.max(
    contiguousNgramAffinity(message, vocabulary.primary),
    contiguousNgramAffinity(message, vocabulary.secondary),
  );
  const clause = clauseAffinity(message, vocabulary);
  const actionIntent = actionIntentAffinity(message, capability);
  const score = Math.max(
    0,
    Math.min(
      1,
      primaryCoverage * 0.36 +
        secondaryCoverage * 0.15 +
        schemaCoverage * 0.06 +
        fuzzyPrimaryCoverage * 0.10 +
        fuzzySchemaCoverage * 0.04 +
        Math.min(1, reverseCoverage * 2) * 0.01 +
        phrase * 0.10 +
        secondaryPhrase * 0.04 +
        conceptAffinity * 0.10 +
        clause * 0.03 +
        actionIntent * 0.08,
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
    secondary_phrase_affinity: secondaryPhrase,
    concept_affinity: conceptAffinity,
    clause_affinity: clause,
    action_intent_affinity: actionIntent,
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
