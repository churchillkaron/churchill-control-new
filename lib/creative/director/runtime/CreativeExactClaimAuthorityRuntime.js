const BRAND_TRUTH_CONTRACT = "CREATIVE_BRAND_TRUTH_V1";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function exactBrandTruth(plan = {}) {
  const truth = object(plan.brand_truth);
  return truth.contract === BRAND_TRUTH_CONTRACT && text(truth.brand_truth_hash)
    ? truth
    : null;
}

function missionAuthorityText(mission = {}, truth = null) {
  return JSON.stringify({
    objective: mission.objective || null,
    business_goal: mission.business_goal || null,
    audience: mission.audience || null,
    constraints: mission.constraints || null,
    brand_truth: truth,
  }).toLowerCase();
}

function fontFamily(value) {
  return text(value)
    .replace(/\b(?:thin|extra[- ]?light|light|regular|medium|semi[- ]?bold|bold|extra[- ]?bold|black)\b.*$/i, "")
    .replace(/[,;]+$/g, "")
    .trim();
}

function collectExactTokens(value, path = [], out = { hexes: new Set(), fonts: new Set(), metrics: new Set(), placements: new Set() }) {
  const key = path.at(-1) || "";
  if (typeof value === "string") {
    for (const match of value.matchAll(/#[0-9a-f]{6}\b/gi)) out.hexes.add(match[0]);
    if (/font/i.test(key)) {
      const family = fontFamily(value);
      if (family) out.fonts.add(family);
    }
    if (/metric_value/i.test(key) && text(value)) out.metrics.add(text(value));
    if (/(?:^|_)(?:placement|position)$/i.test(key) || /^(?:logo|wordmark)_(?:placement|position)$/i.test(key)) {
      for (const match of value.matchAll(/\d+(?:\.\d+)?%/g)) out.placements.add(match[0]);
    }
    if (/(?:logo|wordmark).{0,80}\b\d+(?:\.\d+)?%\b/i.test(value)) {
      for (const match of value.matchAll(/\d+(?:\.\d+)?%/g)) out.placements.add(match[0]);
    }
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectExactTokens(entry, [...path, String(index)], out));
    return out;
  }
  if (!value || typeof value !== "object") return out;
  for (const [nestedKey, nested] of Object.entries(value)) {
    collectExactTokens(nested, [...path, nestedKey], out);
  }
  return out;
}

function replaceToken(value, token, replacement) {
  if (!token) return value;
  return String(value).replace(new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), replacement);
}

function replacePlacementClaims(value, key, unsupportedPlacements) {
  let next = String(value);
  const replaceUnsupported = (source) => {
    let result = source;
    for (const token of unsupportedPlacements) result = replaceToken(result, token, "design-defined safe area");
    return result;
  };
  if (/(?:^|_)(?:placement|position)$/i.test(key) || /^(?:logo|wordmark)_(?:placement|position)$/i.test(key)) return replaceUnsupported(next);
  // Free prose may contain unrelated composition percentages in the same field.
  // Scrub only the sentence/phrase that actually talks about a logo or wordmark,
  // so "logo at bottom 10%. 80% negative space" keeps the art-direction 80%.
  next = next.replace(/[^.!?]*(?:logo|wordmark)[^.!?]*[.!?]?/gi, (segment) => replaceUnsupported(segment));
  return next;
}

function transform(value, key, unsupported) {
  if (Array.isArray(value)) {
    const mapped = value.map((entry) => transform(entry, key, unsupported));
    return [...new Set(mapped.map((entry) => typeof entry === "string" ? entry : JSON.stringify(entry)))].map((entry) => {
      try { return JSON.parse(entry); } catch { return entry; }
    });
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const [nestedKey, nested] of Object.entries(value)) {
      if (/metric_value/i.test(nestedKey) && typeof nested === "string" && unsupported.metrics.has(text(nested))) {
        continue;
      }
      out[nestedKey] = transform(nested, nestedKey, unsupported);
    }
    return out;
  }
  if (typeof value !== "string") return value;

  let next = value;
  for (const token of unsupported.hexes) next = replaceToken(next, token, "evidence-bound brand color");
  for (const token of unsupported.fonts) next = replaceToken(next, token, "verified brand font");
  for (const token of unsupported.metrics) next = replaceToken(next, token, "verified business proof");
  next = replacePlacementClaims(next, key, unsupported.placements);
  return next;
}

export function groundCreativeExactClaims({ plan = {}, mission = {} } = {}) {
  const truth = exactBrandTruth(plan);
  const authority = missionAuthorityText(mission, truth);
  const tokens = collectExactTokens(plan);
  const unsupported = {
    hexes: new Set([...tokens.hexes].filter((token) => !authority.includes(token.toLowerCase()))),
    fonts: new Set([...tokens.fonts].filter((token) => !authority.includes(token.toLowerCase()))),
    metrics: new Set([...tokens.metrics].filter((token) => !authority.includes(token.toLowerCase()))),
    placements: new Set([...tokens.placements].filter((token) => !authority.includes(token.toLowerCase()))),
  };
  if (!unsupported.hexes.size && !unsupported.fonts.size && !unsupported.metrics.size && !unsupported.placements.size) return plan;
  return transform(plan, "plan", unsupported);
}

export const CreativeExactClaimAuthorityRuntime = Object.freeze({
  contract: "CREATIVE_EXACT_CLAIM_AUTHORITY_V1",
  ground: groundCreativeExactClaims,
});
