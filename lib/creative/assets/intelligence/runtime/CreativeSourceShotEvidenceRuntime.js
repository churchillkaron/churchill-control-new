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

function phrasePattern(phrase) {
  const words = normalize(phrase).split(" ").filter(Boolean);
  if (!words.length) return null;
  return new RegExp(`(?:^|\\s)${words.join("\\s+")}(?:$|\\s)`, "i");
}

function hasPhrase(value, phrase) {
  const pattern = phrasePattern(phrase);
  return Boolean(pattern && pattern.test(` ${normalize(value)} `));
}

function flattenText(value, output = []) {
  if (value === null || value === undefined) return output;
  if (["string", "number", "boolean"].includes(typeof value)) {
    const rendered = text(value);
    if (rendered) output.push(rendered);
    return output;
  }
  if (Array.isArray(value)) {
    for (const item of value) flattenText(item, output);
    return output;
  }
  if (typeof value === "object") {
    for (const child of Object.values(value)) flattenText(child, output);
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

const ANCHORS = [
  {
    id: "DOOR_OR_THRESHOLD",
    triggers: ["door", "doorway", "threshold", "door handle", "wooden door"],
    evidence: ["door", "doorway", "threshold", "door handle", "wooden door"],
    fields: ["objects", "evidence"],
  },
  {
    id: "ENTRANCE_OR_EXTERIOR",
    triggers: ["entrance", "exterior", "outside", "facade"],
    evidence: ["entrance", "exterior", "outside", "facade", "street"],
    fields: ["environments", "location_anchors", "evidence"],
  },
  {
    id: "HANDSHAKE",
    triggers: ["handshake", "shake hands", "shaking hands"],
    evidence: ["handshake", "shake hands", "shaking hands"],
    fields: ["activities", "evidence"],
  },
  {
    id: "FOOD_DISH",
    triggers: ["dish", "plate", "food", "meal"],
    evidence: ["dish", "plate", "food", "meal"],
    fields: ["objects", "evidence"],
  },
  {
    id: "DRINKS_OR_TOAST",
    triggers: ["drink", "drinks", "toast", "glasses", "cocktail"],
    evidence: ["drink", "drinks", "glass", "glasses", "cocktail", "beer", "toast"],
    fields: ["objects", "activities", "evidence"],
  },
  {
    id: "POOL_TABLE",
    triggers: ["pool table", "pool balls", "cue", "billiard"],
    evidence: ["pool table", "pool balls", "cue", "billiard"],
    fields: ["objects", "evidence"],
  },
  {
    id: "SHUFFLEBOARD",
    triggers: ["shuffleboard", "puck", "scoring lane"],
    evidence: ["shuffleboard", "puck", "scoring lane"],
    fields: ["objects", "evidence"],
  },
  {
    id: "WAITSTAFF_OR_SERVICE",
    triggers: ["waitstaff", "waiter", "waitress", "server", "staff serving"],
    evidence: ["waitstaff", "waiter", "waitress", "server", "staff serving"],
    fields: ["visible_subjects", "activities", "evidence"],
  },
  {
    id: "LIVE_BAND_OR_STAGE",
    triggers: ["live band", "band", "stage", "musician", "live music"],
    evidence: ["live band", "band", "stage", "musician", "live music", "singer", "guitar", "drums"],
    fields: ["visible_subjects", "objects", "activities", "evidence"],
  },
  {
    id: "CROWD_OR_GUEST_GROUP",
    triggers: ["crowd", "guests", "group of guests", "people celebrating"],
    evidence: ["crowd", "guests", "group of people", "audience", "customers", "multiple people"],
    fields: ["visible_subjects", "evidence"],
  },
  {
    id: "CHURCHILL_LOGO",
    triggers: ["churchill logo", "logo", "brand mark"],
    evidence: ["churchill", "logo", "brand mark"],
    fields: ["logos", "visible_text", "evidence"],
  },
];

function shotRequirementText(shot = {}) {
  return flattenText({
    title: shot.title,
    purpose: shot.purpose,
    subject: shot.subject,
    action: shot.action,
    performance: shot.performance,
    opening_frame: shot.opening_frame,
    closing_frame: shot.closing_frame,
    frame_plan: shot.frame_plan,
    camera: shot.camera,
    production_design: shot.production_design,
    props: shot.props,
    location: shot.location,
  }).join(" ");
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
    ...list(shot.reference_asset_ids),
    ...list(shot.referenceAssetIds),
    ...list(shot.identity_requirements?.reference_asset_ids),
    ...list(shot.identity_requirements?.referenceAssetIds),
    ...list(shot.performance_contract?.identity_reference_asset_ids),
    ...list(shot.performance_contract?.identityReferenceAssetIds),
  ].map(assetId).filter(Boolean))];
}

function fieldClaims(asset, field) {
  const analysis = object(asset.analysis);
  const output = claims(analysis[field], `analysis.${field}`);
  for (const [index, sample] of list(analysis.frame_samples).entries()) {
    output.push(...claims(
      sample?.analysis?.[field],
      `analysis.frame_samples[${index}].analysis.${field}`,
    ));
  }
  return output;
}

function qualifyingClaims(asset, anchor, minimumConfidence = 60) {
  const rows = anchor.fields.flatMap((field) => fieldClaims(asset, field));
  return rows.filter((row) => {
    if (row.confidence !== null && Number(row.confidence) < minimumConfidence) {
      return false;
    }
    return anchor.evidence.some((phrase) => hasPhrase(row.value, phrase));
  });
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
    const requirementText = shotRequirementText(shot);
    const required = ANCHORS.filter((anchor) =>
      anchor.triggers.some((phrase) => hasPhrase(requirementText, phrase)));
    const checks = required.map((anchor) => {
      const matched = sourceAssets.flatMap((asset) =>
        qualifyingClaims(asset, anchor, minimum_confidence).map((claim) => ({
          asset_id: asset.id,
          ...claim,
        })));
      return {
        anchor: anchor.id,
        passed: matched.length > 0,
        matched,
      };
    });
    const failed = checks.filter((check) => !check.passed).map((check) => check.anchor);
    const passed = sourceIds.length > 0 &&
      sourceAssets.length === sourceIds.length &&
      failed.length === 0;

    if (!sourceIds.length) blockers.push(`SHOT_SOURCE_ASSETS_REQUIRED:${shotId}`);
    for (const id of sourceIds) {
      if (!byId.has(id)) blockers.push(`SHOT_SOURCE_ASSET_NOT_FOUND:${shotId}:${id}`);
    }
    for (const anchor of failed) {
      blockers.push(`SOURCE_DOES_NOT_EVIDENCE_REQUIRED_ANCHOR:${shotId}:${anchor}`);
    }

    results.push({
      shot_id: shotId,
      scene_number: shot.scene_number ?? null,
      shot_number: shot.shot_number ?? null,
      source_asset_ids: sourceIds,
      required_anchors: checks,
      failed_anchors: failed,
      passed,
    });
  }

  return {
    contract: "CREATIVE_SOURCE_SHOT_EVIDENCE_V3",
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
  contract: "CREATIVE_SOURCE_SHOT_EVIDENCE_V3",
  evaluate: evaluateCreativeSourceShotEvidence,
  assert: assertCreativeSourceShotEvidenceReady,
  boundAssetIds,
});
