import {
  rankOperatorCapabilities,
} from "./OperatorCapabilityMatcher";

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
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
  const resolution = resolveOperatorBusinessRead({
    message,
    capabilities,
    limit: Math.min(12, Number(limit) || 18),
  });

  if (!resolution) {
    return {
      resolution: null,
      capabilities: list(fallback).slice(0, limit),
    };
  }

  const selected = [];
  const seen = new Set();
  for (const capability of [...resolution.capabilities, ...list(fallback)]) {
    const key = text(capability?.key);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    selected.push(capability);
    if (selected.length >= limit) break;
  }

  return {
    resolution: {
      confidence: resolution.confidence,
      separation: resolution.separation,
      capability_keys: resolution.capability_keys,
      ranked: resolution.ranked,
    },
    capabilities: selected,
  };
}

export default resolveOperatorBusinessRead;
