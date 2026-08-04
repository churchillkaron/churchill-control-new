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

function unique(values = []) {
  const result = [];
  const seen = new Set();
  for (const value of values.flat(Infinity)) {
    if (value === null || value === undefined || value === "") continue;
    const key = typeof value === "object"
      ? JSON.stringify(value)
      : text(value).toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function sourceAnalysis(value = {}) {
  return object(
    value.analysis ||
      value.intelligence?.source_asset_analysis ||
      value.metadata?.source_asset_analysis ||
      value.metadata?.source_asset_metadata?.analysis,
  );
}

function semanticFieldsFromAnalysis(analysis = {}) {
  const intelligence = object(analysis.intelligence);
  const anchors = object(
    analysis.continuity_anchors || intelligence.continuity_anchors,
  );
  const visibleInventory = object(
    analysis.visible_inventory || intelligence.visible_inventory,
  );

  return {
    description: text(
      analysis.description ||
        intelligence.description ||
        analysis.summary ||
        intelligence.summary,
    ),
    summary: text(analysis.summary || intelligence.summary),
    tags: unique([
      list(analysis.tags),
      list(intelligence.tags),
      list(intelligence.labels),
    ]),
    visible_subjects: unique([
      list(analysis.visible_subjects),
      list(analysis.detected_people),
      list(analysis.people),
      list(intelligence.visible_subjects),
      list(intelligence.detected_people),
      list(visibleInventory.people),
      list(anchors.people),
    ]),
    objects: unique([
      list(analysis.objects),
      list(analysis.detected_products),
      list(analysis.products),
      list(intelligence.objects),
      list(intelligence.detected_products),
      list(visibleInventory.products),
      list(anchors.products),
    ]),
    activities: unique([
      list(analysis.activities),
      list(intelligence.activities),
    ]),
    environments: unique([
      list(analysis.environments),
      list(analysis.detected_locations),
      list(analysis.locations),
      list(intelligence.environments),
      list(intelligence.detected_locations),
      list(visibleInventory.locations),
      list(anchors.locations),
    ]),
    visible_text: unique([
      list(analysis.visible_text),
      list(intelligence.visible_text),
    ]),
    logos: unique([
      list(analysis.logos),
      list(intelligence.logos),
    ]),
    evidence: unique([
      list(analysis.evidence),
      list(intelligence.evidence),
    ]),
  };
}

function evidenceCount(fields = {}) {
  return Object.values(fields).reduce((sum, value) => {
    if (Array.isArray(value)) return sum + value.length;
    return sum + (text(value) ? 1 : 0);
  }, 0);
}

export function creativeAssetSemanticEvidence(value = {}) {
  const analysis = sourceAnalysis(value);
  const fields = semanticFieldsFromAnalysis(analysis);
  const count = evidenceCount(fields);
  const status = text(
    analysis.status ||
      analysis.semantic_status ||
      value.metadata?.semantic_analysis_status,
  ).toUpperCase();
  const confidence = Number(
    analysis.asset_confidence ??
      analysis.confidence ??
      analysis.intelligence?.confidence ??
      0,
  );
  const verified = status === "VERIFIED" && count > 0;

  return {
    contract: "CREATIVE_ASSET_SEMANTIC_EVIDENCE_V1",
    status: verified
      ? "VERIFIED"
      : count > 0
        ? "PRESENT_NOT_VERIFIED"
        : status === "UNVERIFIED"
          ? "UNVERIFIED"
          : "MISSING",
    verified,
    evidence_count: count,
    confidence: Number.isFinite(confidence) ? confidence : 0,
    fields,
    analysis,
  };
}

export function creativeAssetNodeIntelligence(analysis = {}, score = 0) {
  const evidence = creativeAssetSemanticEvidence({ analysis });
  return {
    quality_score: Number(score || 0),
    brand_match_score: Number(
      analysis.brand_relevance_score ||
        analysis.brand_score ||
        0,
    ),
    reuse_score: Number(analysis.reuse_score || 0),
    safety_status: evidence.verified ? "REVIEW_REQUIRED" : "UNVERIFIED",
    analysis_status: evidence.verified ? "VERIFIED" : evidence.status,
    confidence: evidence.confidence,
    description: evidence.fields.description,
    summary: evidence.fields.summary,
    tags: evidence.fields.tags,
    detected_people: evidence.fields.visible_subjects,
    detected_products: evidence.fields.objects,
    detected_locations: evidence.fields.environments,
    activities: evidence.fields.activities,
    visible_text: evidence.fields.visible_text,
    logos: evidence.fields.logos,
    evidence: evidence.fields.evidence,
    source_asset_analysis: analysis,
    semantic_evidence_contract: evidence.contract,
    semantic_evidence_count: evidence.evidence_count,
    semantic_verified: evidence.verified,
    rights_risks: list(analysis.rights_risks),
    consent_risks: list(analysis.consent_risks),
    privacy_risks: list(analysis.privacy_risks),
  };
}

export function assertCreativeAssetSemanticReady(value = {}, label = "CREATIVE_ASSET") {
  const evidence = creativeAssetSemanticEvidence(value);
  if (!evidence.verified) {
    const id = text(
      value.id ||
        value.asset_id ||
        value.creative_asset_id ||
        value.metadata?.source_creative_asset_id,
    ) || "unknown";
    throw new Error(
      `${label}_SEMANTIC_EVIDENCE_REQUIRED:${id}:${evidence.status}:evidence=${evidence.evidence_count}`,
    );
  }
  return evidence;
}

export function assertCreativeSourceAssetsSemanticReady({
  assets = [],
  required_asset_ids = [],
} = {}) {
  const byId = new Map(
    list(assets).map((asset) => [
      text(asset.id || asset.asset_id || asset.creative_asset_id),
      asset,
    ]),
  );
  const required = [...new Set(list(required_asset_ids).map(text).filter(Boolean))];
  const blockers = [];
  const evidence = [];

  for (const id of required) {
    const asset = byId.get(id);
    if (!asset) {
      blockers.push(`SOURCE_ASSET_NOT_FOUND:${id}`);
      continue;
    }
    const result = creativeAssetSemanticEvidence(asset);
    evidence.push({ asset_id: id, ...result });
    if (!result.verified) {
      blockers.push(
        `SOURCE_ASSET_SEMANTIC_EVIDENCE_REQUIRED:${id}:${result.status}:evidence=${result.evidence_count}`,
      );
    }
  }

  if (blockers.length) {
    const error = new Error(
      `CREATIVE_SOURCE_ASSET_SEMANTIC_GATE_BLOCKED:${blockers.join(",")}`,
    );
    error.blockers = blockers;
    error.evidence = evidence;
    throw error;
  }

  return {
    contract: "CREATIVE_SOURCE_ASSET_SEMANTIC_GATE_V1",
    passed: true,
    required_asset_count: required.length,
    evidence,
  };
}

export const CreativeAssetSemanticEvidenceRuntime = Object.freeze({
  contract: "CREATIVE_ASSET_SEMANTIC_EVIDENCE_V1",
  inspect: creativeAssetSemanticEvidence,
  nodeIntelligence: creativeAssetNodeIntelligence,
  assertAsset: assertCreativeAssetSemanticReady,
  assertSources: assertCreativeSourceAssetsSemanticReady,
});
