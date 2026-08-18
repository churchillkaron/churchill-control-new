import {
  rankOperatorCapabilities,
} from "./OperatorCapabilityMatcher";

const OPERATOR_READ_CHAIN_KEY = "platform.operator_read_chain.execute";

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function readCapabilities(capabilities = []) {
  return list(capabilities).filter(
    (capability) => text(capability?.mode).toLowerCase() === "read",
  );
}

function diverseReads(capabilities = [], limit = 18) {
  const groups = new Map();
  for (const capability of readCapabilities(capabilities)) {
    if (text(capability?.key) === OPERATOR_READ_CHAIN_KEY) continue;
    const group = text(capability?.domain) || "_";
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(capability);
  }

  const groupKeys = [...groups.keys()].sort();
  const output = [];
  let row = 0;
  while (output.length < limit) {
    let added = false;
    for (const group of groupKeys) {
      const capability = groups.get(group)?.[row];
      if (!capability) continue;
      output.push(capability);
      added = true;
      if (output.length >= limit) break;
    }
    if (!added) break;
    row += 1;
  }
  return output;
}

function appendUnique(selected, seen, capabilities, limit) {
  for (const capability of list(capabilities)) {
    const key = text(capability?.key);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    selected.push(capability);
    if (selected.length >= limit) break;
  }
}

function readChainCapability(capabilities = []) {
  return list(capabilities).find(
    (capability) => text(capability?.key) === OPERATOR_READ_CHAIN_KEY,
  ) || null;
}

export function rankOperatorReadCapabilities({
  message,
  capabilities = [],
  limit = 12,
} = {}) {
  return rankOperatorCapabilities({
    message,
    capabilities,
    modes: ["read"],
    limit,
  });
}

export function resolveOperatorBusinessRead({
  message,
  capabilities = [],
  limit = 6,
} = {}) {
  const ranked = rankOperatorReadCapabilities({ message, capabilities, limit });
  if (!ranked.length) return null;

  const top = ranked[0];
  const second = ranked[1] || null;
  const separation = second ? Math.max(0, top.score - second.score) : top.score;
  const confidence = Math.max(
    0,
    Math.min(0.99, top.score * 0.82 + Math.min(0.3, separation) * 0.6),
  );

  return {
    confidence,
    separation,
    capability_keys: ranked
      .map((entry) => text(entry.capability?.key))
      .filter(Boolean),
    capabilities: ranked.map((entry) => entry.capability),
    ranked: ranked.map((entry) => ({
      capability_key: text(entry.capability?.key),
      score: entry.score,
      primary_coverage: entry.primary_coverage,
      secondary_coverage: entry.secondary_coverage,
      phrase_affinity: entry.phrase_affinity,
    })),
  };
}

export function prioritizeOperatorBusinessReads({
  message,
  capabilities = [],
  fallback = [],
  limit = 18,
} = {}) {
  const boundedLimit = Math.max(1, Number(limit) || 18);
  const source = list(capabilities);
  const resolution = resolveOperatorBusinessRead({
    message,
    capabilities: source,
    limit: Math.min(12, boundedLimit),
  });
  const chain = readChainCapability(source);
  const selected = [];
  const seen = new Set();

  if (resolution) {
    appendUnique(selected, seen, resolution.capabilities, boundedLimit);
    appendUnique(selected, seen, fallback, boundedLimit);
    if (selected.length < boundedLimit && chain) {
      appendUnique(selected, seen, [chain], boundedLimit);
    }
    if (selected.length < boundedLimit) {
      appendUnique(
        selected,
        seen,
        diverseReads(source, boundedLimit),
        boundedLimit,
      );
    }
  } else {
    if (chain) appendUnique(selected, seen, [chain], boundedLimit);
    appendUnique(
      selected,
      seen,
      diverseReads(source, boundedLimit),
      boundedLimit,
    );
    if (selected.length < boundedLimit) {
      appendUnique(selected, seen, fallback, boundedLimit);
    }
  }

  return {
    resolution: resolution
      ? {
          confidence: resolution.confidence,
          separation: resolution.separation,
          capability_keys: resolution.capability_keys,
          ranked: resolution.ranked,
        }
      : null,
    capabilities: selected,
  };
}

export default resolveOperatorBusinessRead;
