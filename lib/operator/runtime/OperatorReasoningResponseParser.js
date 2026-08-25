function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}

function balancedObjectCandidates(source) {
  const candidates = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (character === "\\") {
        escaped = true;
        continue;
      }
      if (character === '"') inString = false;
      continue;
    }

    if (character === '"') {
      inString = true;
      continue;
    }

    if (character === "{") {
      if (depth === 0) start = index;
      depth += 1;
      continue;
    }

    if (character === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        candidates.push(source.slice(start, index + 1));
        start = -1;
      }
    }
  }

  return candidates;
}

function operatorDecisionScore(value) {
  const candidate = object(value);
  if (!candidate) return -1;

  let score = 0;
  if (Object.prototype.hasOwnProperty.call(candidate, "response_text")) score += 6;
  if (Object.prototype.hasOwnProperty.call(candidate, "intent")) score += 6;
  if (Object.prototype.hasOwnProperty.call(candidate, "project_state")) score += 4;
  if (Object.prototype.hasOwnProperty.call(candidate, "clarification")) score += 3;
  if (Object.prototype.hasOwnProperty.call(candidate, "navigation")) score += 2;
  if (Object.prototype.hasOwnProperty.call(candidate, "execution")) score += 2;
  if (Object.prototype.hasOwnProperty.call(candidate, "plan")) score += 2;
  if (Object.prototype.hasOwnProperty.call(candidate, "agreement_state")) score += 1;
  return score;
}

export function parseOperatorReasoningResponse(value) {
  const direct = object(value);
  if (direct) return direct;

  const source = text(value).replace(/^\uFEFF/, "");
  if (!source) return null;

  const candidates = [source];
  for (const match of source.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    if (match[1]) candidates.push(match[1].trim());
  }
  candidates.push(...balancedObjectCandidates(source));

  const parsed = [];
  const seen = new Set();
  for (const candidate of candidates) {
    const normalized = text(candidate);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    try {
      const result = object(JSON.parse(normalized));
      if (result) parsed.push(result);
    } catch {
      // Only exact valid JSON objects are accepted.
    }
  }

  if (!parsed.length) return null;

  return parsed
    .map((candidate, index) => ({
      candidate,
      index,
      score: operatorDecisionScore(candidate),
    }))
    .sort((left, right) => right.score - left.score || right.index - left.index)[0]
    .candidate;
}

export const OperatorReasoningResponseParser = Object.freeze({
  parse: parseOperatorReasoningResponse,
});
