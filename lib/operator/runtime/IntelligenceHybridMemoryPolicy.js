const DEFAULT_RRF_K = 50;

function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

function rankMap(entries = []) {
  const map = new Map();
  entries.forEach((entry, index) => {
    const id = String(entry?.id || "").trim();
    if (!id || map.has(id)) return;
    map.set(id, index + 1);
  });
  return map;
}

function entryMap(...lists) {
  const map = new Map();
  for (const list of lists) {
    for (const entry of Array.isArray(list) ? list : []) {
      const id = String(entry?.id || "").trim();
      if (id && !map.has(id)) map.set(id, entry);
    }
  }
  return map;
}

export function reciprocalRank(rank, k = DEFAULT_RRF_K) {
  const value = Number(rank);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return 1 / (Math.max(1, Number(k) || DEFAULT_RRF_K) + value);
}

export function fuseIntelligenceMemoryCandidates({
  deterministic = [],
  vector = [],
  deterministicWeight = 1,
  vectorWeight = 1,
  rrfK = DEFAULT_RRF_K,
  limit = 24,
} = {}) {
  const deterministicRanks = rankMap(deterministic);
  const vectorRanks = rankMap(vector);
  const records = entryMap(deterministic, vector);
  const ids = new Set([...deterministicRanks.keys(), ...vectorRanks.keys()]);

  return Array.from(ids)
    .map((id) => {
      const deterministicRank = deterministicRanks.get(id) || null;
      const vectorRank = vectorRanks.get(id) || null;
      const source = records.get(id) || { id };
      const vectorScore = vectorRank
        ? clamp01(source.vector_score ?? source.similarity ?? source.semantic_similarity ?? 0)
        : null;
      const fusedScore =
        reciprocalRank(deterministicRank, rrfK) * Math.max(0, Number(deterministicWeight) || 0) +
        reciprocalRank(vectorRank, rrfK) * Math.max(0, Number(vectorWeight) || 0);

      return {
        ...source,
        id,
        deterministic_rank: deterministicRank,
        vector_rank: vectorRank,
        vector_score: vectorScore,
        hybrid_rrf_score: fusedScore,
        retrieval_mode: vectorRanks.size ? "hybrid_rrf" : "deterministic_fallback",
      };
    })
    .sort((left, right) => {
      if (right.hybrid_rrf_score !== left.hybrid_rrf_score) {
        return right.hybrid_rrf_score - left.hybrid_rrf_score;
      }
      const leftRank = left.deterministic_rank || Number.MAX_SAFE_INTEGER;
      const rightRank = right.deterministic_rank || Number.MAX_SAFE_INTEGER;
      return leftRank - rightRank;
    })
    .slice(0, Math.max(1, Math.min(100, Number(limit) || 24)));
}

export const IntelligenceHybridMemoryPolicy = Object.freeze({
  reciprocalRank,
  fuse: fuseIntelligenceMemoryCandidates,
});
