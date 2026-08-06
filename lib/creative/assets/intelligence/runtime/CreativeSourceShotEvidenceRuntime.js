function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function normalize(value) {
  return text(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const GENERIC_TERMS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "in",
  "into", "is", "it", "its", "of", "on", "or", "the", "their", "this",
  "to", "with", "within", "without", "through", "toward", "towards", "while",
  "shot", "scene", "frame", "frames", "opening", "closing", "open", "close",
  "camera", "framing", "composition", "visual", "visible", "view", "viewer",
  "source", "verified", "exact", "same", "state", "content", "physical",
  "preserve", "preserved", "maintain", "introduce", "introduced", "adding",
  "added", "new", "clear", "clearly", "present", "begin", "end", "move",
  "moves", "moving", "movement", "attention", "focus", "change", "changes",
  "progression", "different", "authentic", "real", "only", "no", "not",
  "required", "requirement", "direction", "detail", "details", "evidence",
]);

const SHOT_EVIDENCE_FIELDS = [
  ["subject"],
  ["action"],
  ["performance"],
  ["opening_frame"],
  ["closing_frame"],
  ["frame_plan", "opening_frame"],
  ["frame_plan", "progression"],
  ["frame_plan", "progression_frames"],
  ["frame_plan", "closing_frame"],
  ["production_design", "preserve"],
  ["production_design", "environment"],
  ["production_design", "materials"],
  ["production_design", "texture_detail"],
  ["props"],
  ["location"],
  ["identity_requirements", "visible_identity_anchors"],
  ["product_requirements", "visible_product_anchors"],
  ["continuity", "identity"],
  ["continuity", "product"],
  ["continuity", "location"],
  ["continuity", "wardrobe"],
  ["continuity", "spatial_geography"],
];

function flattenText(value, output = [], seen = new Set(), depth = 0) {
  if (depth > 16 || value === null || value === undefined) return output;
  if (["string", "number", "boolean"].includes(typeof value)) {
    const rendered = text(value);
    if (rendered) output.push(rendered);
    return output;
  }
  if (typeof value !== "object" || seen.has(value)) return output;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) flattenText(item, output, seen, depth + 1);
    return output;
  }
  for (const child of Object.values(value)) {
    flattenText(child, output, seen, depth + 1);
  }
  return output;
}

function claims(value, path, inheritedConfidence = null, output = []) {
  if (value === null || value === undefined) return output;
  if (["string", "number", "boolean"].includes(typeof value)) {
    const rendered = text(value);
    if (rendered) {
      output.push({
        path,
        value: rendered,
        confidence: inheritedConfidence,
      });
    }
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      claims(item, `${path}[${index}]`, inheritedConfidence, output));
    return output;
  }
  if (typeof value === "object") {
    const localConfidence = Number(value.confidence);
    const confidence = Number.isFinite(localConfidence)
      ? localConfidence
      : inheritedConfidence;
    for (const [key, child] of Object.entries(value)) {
      if (key === "confidence") continue;
      claims(child, `${path}.${key}`, confidence, output);
    }
  }
  return output;
}

function valueAt(source, path) {
  let current = source;
  for (const key of path) {
    if (current === null || current === undefined) return null;
    current = current[key];
  }
  return current;
}

function tokens(value) {
  return [...new Set(
    normalize(value)
      .split(" ")
      .filter((token) => token.length > 2 && !GENERIC_TERMS.has(token)),
  )];
}

function intersection(left = [], right = []) {
  const rightSet = new Set(right);
  return left.filter((value) => rightSet.has(value));
}

function assetId(value) {
  if (typeof value === "string" || typeof value === "number") return text(value);
  return text(
    value?.asset_id ||
      value?.assetId ||
      value?.creative_asset_id ||
      value?.creativeAssetId ||
      value?.id,
  );
}

function boundAssetIds(shot = {}) {
  return [...new Set([
    shot.primary_source_asset_id,
    shot.primarySourceAssetId,
    shot.generation?.primary_source_asset_id,
    shot.generation?.primarySourceAssetId,
    shot.metadata?.primary_source_asset_id,
    shot.metadata?.primarySourceAssetId,
    shot.source_evidence_contract?.source_asset_id,
    shot.source_evidence_contract?.sourceAssetId,
    ...list(shot.reference_asset_ids),
    ...list(shot.referenceAssetIds),
    ...list(shot.identity_requirements?.reference_asset_ids),
    ...list(shot.identity_requirements?.referenceAssetIds),
    ...list(shot.performance_contract?.identity_reference_asset_ids),
    ...list(shot.performance_contract?.identityReferenceAssetIds),
  ].map(assetId).filter(Boolean))];
}

function allAssetClaims(asset = {}) {
  const output = claims(object(asset.analysis), "analysis");
  const metadataEvidence = object(asset.metadata?.semantic_evidence);
  if (Object.keys(metadataEvidence).length) {
    output.push(...claims(metadataEvidence, "metadata.semantic_evidence"));
  }
  return output;
}

function explicitEvidenceRequirements(shot = {}) {
  const contract = object(shot.source_evidence_contract);
  const sourceAssetId = text(
    contract.source_asset_id ||
    contract.sourceAssetId,
  ) || null;
  return list(contract.claims).map((claim, index) => {
    const value = text(claim?.value || claim?.claim || claim?.text);
    return {
      id: `explicit-${index + 1}`,
      source: "SOURCE_EVIDENCE_CONTRACT",
      source_asset_id: sourceAssetId,
      path: text(claim?.path) || null,
      value,
      tokens: tokens(value),
      minimum_confidence: Number.isFinite(Number(claim?.confidence))
        ? Number(claim.confidence)
        : null,
    };
  }).filter((requirement) => requirement.value && requirement.tokens.length);
}

function dynamicEvidenceRequirements(shot = {}) {
  const output = [];
  const seen = new Set();
  for (const fieldPath of SHOT_EVIDENCE_FIELDS) {
    const values = flattenText(valueAt(shot, fieldPath));
    for (const value of values) {
      const normalized = normalize(value);
      const requirementTokens = tokens(value);
      if (!normalized || !requirementTokens.length || seen.has(normalized)) continue;
      seen.add(normalized);
      output.push({
        id: `dynamic-${output.length + 1}`,
        source: "STRUCTURED_SHOT_FIELD",
        source_asset_id: null,
        path: `shot.${fieldPath.join(".")}`,
        value: text(value),
        tokens: requirementTokens,
        minimum_confidence: null,
      });
      if (output.length >= 24) return output;
    }
  }
  return output;
}

function requirementsFor(shot = {}) {
  const explicit = explicitEvidenceRequirements(shot);
  if (explicit.length) {
    return {
      mode: "EXPLICIT_SOURCE_EVIDENCE_CONTRACT",
      requirements: explicit,
    };
  }
  const dynamic = dynamicEvidenceRequirements(shot);
  return {
    mode: dynamic.length
      ? "DYNAMIC_STRUCTURED_SHOT_REQUIREMENTS"
      : "SOURCE_BINDING_ONLY",
    requirements: dynamic,
  };
}

function confidencePass(row, requirement, minimumConfidence) {
  const required = Math.max(
    Number(minimumConfidence || 0),
    Number(requirement.minimum_confidence || 0),
  );
  return row.confidence === null || Number(row.confidence) >= required;
}

function matchStrength(requirement, row) {
  const requiredValue = normalize(requirement.value);
  const claimValue = normalize(row.value);
  if (!requiredValue || !claimValue) return 0;
  if (requirement.path && requirement.path === row.path && requiredValue === claimValue) {
    return 1;
  }
  if (requiredValue === claimValue) return 1;
  if (
    requirement.tokens.length > 1 &&
    (claimValue.includes(requiredValue) || requiredValue.includes(claimValue))
  ) return 0.95;

  const claimTokens = tokens(row.value);
  if (!claimTokens.length) return 0;
  const overlap = intersection(requirement.tokens, claimTokens);
  if (!overlap.length) return 0;
  if (requirement.tokens.length === 1) return 1;

  const requirementCoverage = overlap.length / requirement.tokens.length;
  const claimCoverage = overlap.length / claimTokens.length;
  if (overlap.length >= 3 && requirementCoverage >= 0.5) {
    return Math.min(0.9, 0.5 + requirementCoverage * 0.4);
  }
  if (overlap.length >= 2 && requirementCoverage >= 0.67) {
    return Math.min(0.88, 0.45 + requirementCoverage * 0.4 + claimCoverage * 0.1);
  }
  return 0;
}

function matchingClaims({
  requirement,
  sourceAssets,
  minimumConfidence,
}) {
  const matches = [];
  for (const asset of sourceAssets) {
    if (
      requirement.source_asset_id &&
      text(asset.id) !== text(requirement.source_asset_id)
    ) continue;

    for (const row of allAssetClaims(asset)) {
      if (!confidencePass(row, requirement, minimumConfidence)) continue;
      const strength = matchStrength(requirement, row);
      if (strength < 0.67) continue;
      matches.push({
        asset_id: asset.id,
        path: row.path,
        value: row.value,
        confidence: row.confidence,
        match_strength: Number(strength.toFixed(4)),
      });
    }
  }
  return matches.sort((left, right) =>
    right.match_strength - left.match_strength ||
    text(left.asset_id).localeCompare(text(right.asset_id)) ||
    text(left.path).localeCompare(text(right.path)),
  );
}

export function evaluateCreativeSourceShotEvidence({
  shots = [],
  assets = [],
  minimum_confidence = 60,
} = {}) {
  const byId = new Map(list(assets).map((asset) => [text(asset.id), asset]));
  const results = [];
  const blockers = [];

  for (const [index, shot] of list(shots).entries()) {
    const shotId = text(shot.id) || `shot-${index + 1}`;
    const sourceIds = boundAssetIds(shot);
    const sourceAssets = sourceIds.map((id) => byId.get(id)).filter(Boolean);
    const requirementSet = requirementsFor(shot);
    const checks = requirementSet.requirements.map((requirement) => {
      const matched = matchingClaims({
        requirement,
        sourceAssets,
        minimumConfidence,
      });
      return {
        anchor: requirement.id,
        requirement_id: requirement.id,
        requirement_source: requirement.source,
        requirement_path: requirement.path,
        requirement_value: requirement.value,
        requirement_tokens: requirement.tokens,
        source_asset_id: requirement.source_asset_id,
        passed: matched.length > 0,
        matched,
      };
    });
    const failed = checks
      .filter((check) => !check.passed)
      .map((check) => check.requirement_id);
    const passed = sourceIds.length > 0 &&
      sourceAssets.length === sourceIds.length &&
      failed.length === 0;

    if (!sourceIds.length) blockers.push(`SHOT_SOURCE_ASSETS_REQUIRED:${shotId}`);
    for (const id of sourceIds) {
      if (!byId.has(id)) blockers.push(`SHOT_SOURCE_ASSET_NOT_FOUND:${shotId}:${id}`);
    }
    for (const requirementId of failed) {
      blockers.push(
        `SOURCE_DOES_NOT_EVIDENCE_REQUIRED_PROPOSITION:${shotId}:${requirementId}`,
      );
    }

    results.push({
      shot_id: shotId,
      scene_number: shot.scene_number ?? null,
      shot_number: shot.shot_number ?? null,
      source_asset_ids: sourceIds,
      evidence_mode: requirementSet.mode,
      required_propositions: checks,
      failed_propositions: failed,
      required_anchors: checks,
      failed_anchors: failed,
      passed,
    });
  }

  return {
    contract: "CREATIVE_SOURCE_SHOT_EVIDENCE_V4",
    minimum_confidence,
    shot_count: results.length,
    passed_shot_count: results.filter((result) => result.passed).length,
    failed_shot_count: results.filter((result) => !result.passed).length,
    results,
    blockers,
    readiness: blockers.length ? "FAIL" : "PASS",
  };
}

export function assertCreativeSourceShotEvidenceReady(input = {}) {
  const result = evaluateCreativeSourceShotEvidence(input);
  if (result.blockers.length) {
    const error = new Error(
      `CREATIVE_SOURCE_SHOT_EVIDENCE_GATE_BLOCKED:${result.blockers.join(",")}`,
    );
    error.blockers = result.blockers;
    error.results = result.results;
    throw error;
  }
  return result;
}

export const CreativeSourceShotEvidenceRuntime = Object.freeze({
  contract: "CREATIVE_SOURCE_SHOT_EVIDENCE_V4",
  evaluate: evaluateCreativeSourceShotEvidence,
  assert: assertCreativeSourceShotEvidenceReady,
  boundAssetIds,
});
