const CONTRACT = "CREATIVE_BRAND_FIDELITY_SEMANTIC_BINDING_V1";

const STOP_WORDS = new Set([
  "about", "after", "again", "against", "also", "among", "around",
  "because", "before", "being", "below", "between", "both", "camera",
  "could", "each", "from", "have", "into", "itself", "more", "most",
  "other", "over", "same", "shot", "should", "some", "such", "than",
  "that", "their", "them", "then", "there", "these", "they", "this",
  "through", "under", "very", "what", "when", "where", "which", "while",
  "with", "would", "your", "using", "used", "use", "make", "made",
  "scene", "visual", "image", "video", "frame", "frames", "show", "shows",
  "showing", "view", "views", "look", "looks", "looking", "create",
  "creates", "creating", "generated", "generation", "required", "require",
  "exact", "preserve", "preserved", "maintain", "maintains", "natural",
]);

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function assetId(asset = {}) {
  return text(asset.id || asset.asset_id);
}

function normalizeWords(value) {
  return text(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) =>
      word.length >= 3 &&
      !STOP_WORDS.has(word) &&
      !/^\d+$/.test(word),
    );
}

function collectText(value, output = [], depth = 0, key = "") {
  if (value === null || value === undefined || depth > 7) return output;
  if (typeof value === "string" || typeof value === "number") {
    if (!/^(id|hash|url|uri|path|checksum|created|updated|provider|model)/i.test(key)) {
      output.push(String(value));
    }
    return output;
  }
  if (typeof value !== "object") return output;
  if (Array.isArray(value)) {
    for (const item of value) collectText(item, output, depth + 1, key);
    return output;
  }
  for (const [childKey, child] of Object.entries(value)) {
    if (/prompt|instruction|negative|repair|failure|hash|url|uri|path|checksum/i.test(childKey)) {
      continue;
    }
    collectText(child, output, depth + 1, childKey);
  }
  return output;
}

function corpusTokens(values = []) {
  const words = list(values).flatMap((value) => normalizeWords(value));
  return new Set(words);
}

function bigrams(tokens = new Set()) {
  const words = [...tokens];
  const output = new Set();
  for (let index = 0; index < words.length - 1; index += 1) {
    output.add(`${words[index]} ${words[index + 1]}`);
  }
  return output;
}

function intersectionCount(left = new Set(), right = new Set()) {
  let count = 0;
  for (const value of left) {
    if (right.has(value)) count += 1;
  }
  return count;
}

function shotSemanticCorpus(shot = {}, scene = {}) {
  const direct = [
    shot.title,
    shot.purpose,
    shot.subject,
    shot.action,
    shot.performance,
    shot.medium,
    scene.title,
    scene.objective,
    scene.emotion,
  ];
  const structured = collectText({
    location: shot.location || scene.location,
    products: shot.products || scene.products,
    actors: shot.actors || scene.actors,
    production_design: shot.production_design,
    frame_plan: shot.frame_plan,
    continuity: shot.continuity,
    graphics: shot.graphics,
  });
  return corpusTokens([...direct, ...structured]);
}

function assetSemanticCorpus(asset = {}) {
  const analysis = object(asset.analysis);
  const direct = [
    asset.name,
    asset.title,
    asset.file_name,
    analysis.summary,
    analysis.description,
    analysis.scene_type,
    ...list(analysis.tags),
    ...list(asset.tags),
    ...list(asset.metadata?.evidence_roles),
  ];
  const structured = collectText({
    environments: analysis.environments,
    objects: analysis.objects,
    activities: analysis.activities,
    logos: analysis.logos,
    visible_text: analysis.visible_text,
    product_anchors: analysis.product_anchors,
    location_anchors: analysis.location_anchors,
    recommended_uses: analysis.recommended_uses,
  });
  return corpusTokens([...direct, ...structured]);
}

function directUseDisposition(asset = {}) {
  return text(
    asset.analysis?.direct_use_disposition ||
    asset.metadata?.direct_use_disposition,
  ).toUpperCase();
}

function evidenceRoles(asset = {}) {
  return new Set(
    list(asset.metadata?.evidence_roles)
      .map((value) => text(value).toUpperCase())
      .filter(Boolean),
  );
}

function verified(asset = {}) {
  const status = text(
    asset.analysis_status ||
    asset.analysis?.status ||
    asset.metadata?.analysis_status ||
    asset.metadata?.semantic_analysis_status,
  ).toUpperCase();
  return ["VERIFIED", "ANALYSED", "ANALYZED"].includes(status);
}

function shotRoleHints(shot = {}, scene = {}) {
  const corpus = corpusTokens(collectText({
    title: shot.title,
    purpose: shot.purpose,
    subject: shot.subject,
    location: shot.location || scene.location,
    products: shot.products || scene.products,
    graphics: shot.graphics,
    production_design: shot.production_design,
  }));
  return {
    location: Object.keys(object(shot.location || scene.location)).length > 0 ||
      ["venue", "location", "environment", "interior", "exterior", "entrance", "room", "space"]
        .some((token) => corpus.has(token)),
    brand: ["brand", "logo", "sign", "signage", "identity"]
      .some((token) => corpus.has(token)),
    product: list(shot.products || scene.products).length > 0 ||
      ["product", "dish", "food", "drink", "menu", "package"]
        .some((token) => corpus.has(token)),
  };
}

function scoreAsset({ asset = {}, shotTokens = new Set(), shotBigrams = new Set(), hints = {} } = {}) {
  const assetTokens = assetSemanticCorpus(asset);
  const assetBigrams = bigrams(assetTokens);
  const tokenOverlap = intersectionCount(shotTokens, assetTokens);
  const bigramOverlap = intersectionCount(shotBigrams, assetBigrams);
  const roles = evidenceRoles(asset);
  const disposition = directUseDisposition(asset);
  let score = tokenOverlap * 4 + bigramOverlap * 8;

  if (verified(asset)) score += 5;
  if (disposition === "DIRECT_USE") score += 6;
  if (disposition === "REFERENCE_ONLY") score += 2;
  if (hints.location && roles.has("LOCATION")) score += 14;
  if (hints.brand && roles.has("BRAND")) score += 14;
  if (hints.product && roles.has("PRODUCT")) score += 12;

  return {
    asset_id: assetId(asset),
    score,
    token_overlap: tokenOverlap,
    bigram_overlap: bigramOverlap,
    verified: verified(asset),
    direct_use_disposition: disposition || null,
    evidence_roles: [...roles],
    matched_tokens: [...shotTokens].filter((token) => assetTokens.has(token)).sort(),
  };
}

function trustedVisualAsset(asset = {}, provenanceById = new Map()) {
  const id = assetId(asset);
  const evidence = provenanceById.get(id);
  return Boolean(
    id &&
    evidence?.trusted_for_brand_fidelity_primary === true &&
    evidence?.media_kind === "IMAGE",
  );
}

function confidenceFor(ranked = []) {
  const top = ranked[0];
  const second = ranked[1];
  if (!top || top.score < 12) return false;
  if (!second) return true;
  const margin = top.score - second.score;
  return margin >= 4 || top.score >= Math.max(28, second.score * 1.25);
}

export function bindCreativeBrandFidelityShotSemantics({
  shot = {},
  scene = {},
  assets = [],
  provenance = {},
} = {}) {
  const provenanceById = new Map(
    list(provenance.assets)
      .map((entry) => [text(entry.asset_id), entry])
      .filter(([id]) => id),
  );
  const candidates = list(assets)
    .filter((asset) => trustedVisualAsset(asset, provenanceById));
  const shotTokens = shotSemanticCorpus(shot, scene);
  const shotBigrams = bigrams(shotTokens);
  const hints = shotRoleHints(shot, scene);
  const ranked = candidates
    .map((asset) => scoreAsset({ asset, shotTokens, shotBigrams, hints }))
    .filter((entry) => entry.asset_id)
    .sort((left, right) =>
      right.score - left.score ||
      right.bigram_overlap - left.bigram_overlap ||
      right.token_overlap - left.token_overlap ||
      left.asset_id.localeCompare(right.asset_id),
    );

  const confident = confidenceFor(ranked);
  const primary = confident ? ranked[0] : null;
  const supportFloor = primary
    ? Math.max(12, Math.floor(primary.score * 0.45))
    : Number.POSITIVE_INFINITY;
  const references = primary
    ? ranked
        .filter((entry, index) =>
          index === 0 ||
          (entry.score >= supportFloor && entry.asset_id !== primary.asset_id),
        )
        .slice(0, 4)
    : [];

  return {
    contract: CONTRACT,
    confident,
    primary_asset_id: primary?.asset_id || null,
    reference_asset_ids: references.map((entry) => entry.asset_id),
    primary_score: primary?.score || 0,
    second_score: ranked[1]?.score || 0,
    score_margin: primary ? primary.score - (ranked[1]?.score || 0) : 0,
    candidate_count: ranked.length,
    shot_semantic_tokens: [...shotTokens].sort(),
    ranked_candidates: ranked.slice(0, 8),
    selection_policy: {
      verified_authentic_or_trusted_derived_only: true,
      image_references_only: true,
      deterministic: true,
      provider_calls_required: false,
      minimum_primary_score: 12,
      ambiguity_fails_closed: true,
      maximum_reference_count: 4,
    },
  };
}

export const CreativeBrandFidelitySemanticBindingRuntime = Object.freeze({
  contract: CONTRACT,
  bind: bindCreativeBrandFidelityShotSemantics,
});
