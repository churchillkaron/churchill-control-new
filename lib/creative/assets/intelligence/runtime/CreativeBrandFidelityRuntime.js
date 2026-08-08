import crypto from "node:crypto";

import {
  CreativeShotAssetScopeRuntime,
} from "@/lib/creative/assets/isolation/runtime/CreativeShotAssetScopeRuntime";

const PROVENANCE_CONTRACT = "CREATIVE_ASSET_PROVENANCE_V1";
const BRAND_TRUTH_CONTRACT = "CREATIVE_BRAND_TRUTH_V1";
const BRAND_FIDELITY_CONTRACT = "CREATIVE_BRAND_FIDELITY_V1";
const TRUSTED_DERIVED_CONTRACT = "CREATIVE_BRAND_FIDELITY_PROVENANCE_V1";

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

function upper(value) {
  return text(value).toUpperCase();
}

function unique(values = []) {
  return [...new Set(list(values).flat(Infinity).map((value) => text(
    value?.asset_id || value?.assetId || value?.id || value,
  )).filter(Boolean))];
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => value[key] !== undefined && ![
        "created_at",
        "updated_at",
        "hash",
        "provenance_hash",
        "brand_truth_hash",
      ].includes(key))
      .sort()
      .map((key) => [key, canonical(value[key])]),
  );
}

function digest(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}

function assetId(asset = {}) {
  return text(asset.id || asset.asset_id);
}

function assetKind(asset = {}) {
  const mime = text(
    asset.mime_type ||
    asset.technical?.mime_type ||
    asset.metadata?.mime_type ||
    asset.analysis?.technical?.mime_type,
  ).toLowerCase();
  const type = text(asset.asset_type || asset.type).toLowerCase();
  const source = text(
    asset.url || asset.file_url || asset.image_url || asset.thumbnail_url,
  ).toLowerCase();

  if (mime.startsWith("image/") || type.includes("image") || /\.(jpg|jpeg|png|webp|heic|avif)(\?|$)/.test(source)) {
    return "IMAGE";
  }
  if (mime.startsWith("video/") || type.includes("video") || /\.(mp4|mov|m4v|webm|mkv)(\?|$)/.test(source)) {
    return "VIDEO";
  }
  if (mime.startsWith("audio/") || /audio|music|voice|sfx/.test(type)) {
    return "AUDIO";
  }
  if (/document|pdf|presentation|spreadsheet/.test(`${mime} ${type}`)) {
    return "DOCUMENT";
  }
  return "OTHER";
}

function rightsStatus(asset = {}) {
  return upper(
    asset.rights?.status ||
    asset.metadata?.rights?.status ||
    asset.metadata?.rights_status,
  );
}

function explicitDerivedEvidence(asset = {}) {
  const evidence = object(asset.metadata?.brand_fidelity_provenance);
  const sourceIds = unique(
    evidence.authentic_source_asset_ids ||
    evidence.source_asset_ids ||
    evidence.reference_asset_ids,
  );
  const passed =
    evidence.contract === TRUSTED_DERIVED_CONTRACT &&
    evidence.trusted === true &&
    evidence.review_passed === true &&
    sourceIds.length > 0;

  return {
    evidence,
    source_ids: sourceIds,
    passed,
  };
}

export function classifyCreativeAssetProvenance(asset = {}) {
  const id = assetId(asset);
  const provider = text(asset.provider || asset.metadata?.provider).toLowerCase();
  const engine = text(asset.engine || asset.metadata?.engine).toLowerCase();
  const kind = assetKind(asset);
  const derived = explicitDerivedEvidence(asset);
  const rights = rightsStatus(asset);
  const explicitAiGenerated =
    asset.ai_generated === true ||
    asset.aiGenerated === true ||
    asset.metadata?.ai_generated === true;
  const generatedRights = rights.includes("GENERATED");

  let classification = "UNKNOWN";
  let trustedForBrandFidelityPrimary = false;

  if (derived.passed) {
    classification = "TRUSTED_DERIVED";
    trustedForBrandFidelityPrimary = true;
  } else if (explicitAiGenerated || generatedRights) {
    classification = "SYNTHETIC";
  } else if (
    asset.ai_generated === false &&
    (provider === "upload" || engine === "upload")
  ) {
    classification = "AUTHENTIC_UPLOAD";
    trustedForBrandFidelityPrimary = true;
  }

  return {
    contract: PROVENANCE_CONTRACT,
    asset_id: id || null,
    media_kind: kind,
    classification,
    trusted_for_brand_fidelity_primary:
      trustedForBrandFidelityPrimary && ["IMAGE", "VIDEO"].includes(kind),
    authentic_source_asset_ids: derived.source_ids,
    ai_generated: explicitAiGenerated,
    provider: provider || null,
    engine: engine || null,
    rights_status: rights || null,
    analysis_status: upper(
      asset.analysis_status ||
      asset.analysis?.status ||
      asset.metadata?.analysis_status,
    ) || null,
  };
}

export function annotateCreativeAssetsForBrandFidelity(assets = []) {
  return list(assets).map((asset) => {
    const provenance = classifyCreativeAssetProvenance(asset);
    return {
      ...asset,
      metadata: {
        ...object(asset.metadata),
        brand_fidelity_asset: provenance,
      },
    };
  });
}

export function buildCreativeAssetProvenanceManifest(assets = []) {
  const entries = list(assets)
    .map(classifyCreativeAssetProvenance)
    .filter((entry) => entry.asset_id)
    .sort((left, right) => left.asset_id.localeCompare(right.asset_id));
  const base = {
    contract: PROVENANCE_CONTRACT,
    assets: entries,
    authentic_visual_asset_ids: entries
      .filter((entry) =>
        entry.classification === "AUTHENTIC_UPLOAD" &&
        ["IMAGE", "VIDEO"].includes(entry.media_kind),
      )
      .map((entry) => entry.asset_id),
    trusted_derived_visual_asset_ids: entries
      .filter((entry) =>
        entry.classification === "TRUSTED_DERIVED" &&
        ["IMAGE", "VIDEO"].includes(entry.media_kind),
      )
      .map((entry) => entry.asset_id),
    synthetic_visual_asset_ids: entries
      .filter((entry) =>
        entry.classification === "SYNTHETIC" &&
        ["IMAGE", "VIDEO"].includes(entry.media_kind),
      )
      .map((entry) => entry.asset_id),
  };
  return {
    ...base,
    provenance_hash: digest(base),
  };
}

function candidateScore(asset = {}) {
  const provenance = classifyCreativeAssetProvenance(asset);
  if (
    provenance.classification !== "AUTHENTIC_UPLOAD" ||
    !["IMAGE", "VIDEO"].includes(provenance.media_kind)
  ) {
    return -1;
  }

  const analysis = object(asset.analysis);
  const structuredEvidence = [
    analysis.locations,
    analysis.environments,
    analysis.logos,
    analysis.brand_marks,
    analysis.products,
    analysis.detected_products,
    analysis.people,
    analysis.detected_people,
    asset.metadata?.roles,
    asset.metadata?.reference_roles,
  ].some((value) => list(value).length > 0);

  let score = 0;
  if (["VERIFIED", "ANALYSED", "ANALYZED"].includes(provenance.analysis_status)) {
    score += 100;
  }
  if (structuredEvidence) score += 50;
  if (provenance.media_kind === "IMAGE") score += 10;
  return score;
}

export function selectAuthenticPlanningReferences(assets = [], limit = 12) {
  return list(assets)
    .map((asset, index) => ({ asset, index, score: candidateScore(asset) }))
    .filter((entry) => entry.score >= 0)
    .sort((left, right) =>
      right.score - left.score ||
      left.index - right.index ||
      assetId(left.asset).localeCompare(assetId(right.asset)),
    )
    .slice(0, Math.max(1, Number(limit) || 12))
    .map((entry) => entry.asset);
}

export function requiresCreativeBrandFit({ project = {}, brief = {}, plan = {} } = {}) {
  const policy = object(
    plan.quality ||
    project.metadata?.creative_quality_policy ||
    brief.creative_quality_policy ||
    brief.metadata?.creative_quality_policy,
  );
  return policy.require_brand_fit === true;
}

export function buildCreativeBrandTruth(research = {}) {
  const metadata = object(research.metadata);
  const validation = object(metadata.validation);
  if (validation.passed !== true) {
    throw new Error("CREATIVE_BRAND_TRUTH_VALIDATED_RESEARCH_REQUIRED");
  }
  const researchIdentity = text(metadata.research_identity);
  if (!research.id || !researchIdentity) {
    throw new Error("CREATIVE_BRAND_TRUTH_RESEARCH_IDENTITY_REQUIRED");
  }

  const claims = list(metadata.claims)
    .filter((claim) => claim?.verified === true)
    .map((claim) => ({
      id: claim.id || claim.claim_id || null,
      claim: claim.claim || null,
      category: claim.category || null,
      confidence: Number(claim.confidence || 0),
      public_usable: claim.public_usable === true,
      source_ids: unique(claim.source_ids),
    }));
  const sourceIds = unique(
    list(metadata.sources).map((source) => source?.id || source?.source_id),
  );

  const base = {
    contract: BRAND_TRUTH_CONTRACT,
    research_report_id: research.id,
    research_identity: researchIdentity,
    company_resolution: object(metadata.company_resolution),
    company_truth: object(metadata.company_truth),
    brand_intelligence: object(metadata.brand_intelligence),
    audience: object(research.audience),
    commercial_intelligence: object(metadata.commercial_intelligence),
    messaging: object(research.messaging),
    verified_claims: claims,
    research_source_ids: sourceIds,
    research_confidence: Number(research.confidence || 0),
  };

  return {
    ...base,
    brand_truth_hash: digest(base),
  };
}

function trustedVisualSet(provenance = {}) {
  return new Set([
    ...list(provenance.authentic_visual_asset_ids),
    ...list(provenance.trusted_derived_visual_asset_ids),
  ].map(text).filter(Boolean));
}

function provenanceById(provenance = {}) {
  return new Map(
    list(provenance.assets).map((entry) => [text(entry.asset_id), entry]),
  );
}

function assignmentIds(entry = {}) {
  return unique(entry.assignments || entry.assignment_ids || entry.targets);
}

function trustedCandidateIds({ shot = {}, scene = {}, manifest = [], trusted = new Set() } = {}) {
  const explicitPrimary = list(shot.reference_assets)
    .filter((reference) => upper(reference?.role) === "PRIMARY_SOURCE")
    .map((reference) => text(reference?.asset_id || reference?.id))
    .filter((id) => trusted.has(id));
  if (explicitPrimary.length) return unique(explicitPrimary);

  const shotId = text(shot.id);
  const sceneId = text(scene.id);
  const exact = list(manifest)
    .filter((entry) => {
      const id = text(entry?.asset_id || entry?.id);
      const disposition = upper(entry?.disposition);
      return trusted.has(id) &&
        ["ASSIGNED", "REFERENCE"].includes(disposition) &&
        assignmentIds(entry).includes(shotId);
    })
    .map((entry) => text(entry.asset_id || entry.id));
  if (exact.length) return unique(exact);

  const sceneCandidates = list(manifest)
    .filter((entry) => {
      const id = text(entry?.asset_id || entry?.id);
      const disposition = upper(entry?.disposition);
      return trusted.has(id) &&
        ["ASSIGNED", "REFERENCE"].includes(disposition) &&
        assignmentIds(entry).includes(sceneId);
    })
    .map((entry) => text(entry.asset_id || entry.id));
  return unique(sceneCandidates);
}

function normalizeBrandFitShot({
  shot = {},
  scene = {},
  manifest = [],
  provenance = {},
} = {}) {
  const trusted = trustedVisualSet(provenance);
  const byId = provenanceById(provenance);
  const currentPrimary = text(
    shot.primary_source_asset_id ||
    shot.generation?.primary_source_asset_id,
  );
  let primary = currentPrimary && trusted.has(currentPrimary)
    ? currentPrimary
    : null;

  if (!primary) {
    const candidates = trustedCandidateIds({
      shot,
      scene,
      manifest,
      trusted,
    });
    if (candidates.length === 1) {
      [primary] = candidates;
    } else if (trusted.size === 1) {
      [primary] = [...trusted];
    } else {
      throw new Error(
        `CREATIVE_BRAND_FIT_TRUSTED_PRIMARY_SOURCE_REQUIRED:${text(shot.id) || "unknown"}:${candidates.join(",") || "NO_UNAMBIGUOUS_AUTHENTIC_ASSIGNMENT"}`,
      );
    }
  }

  const primaryEvidence = byId.get(primary);
  if (!primaryEvidence?.trusted_for_brand_fidelity_primary) {
    throw new Error(
      `CREATIVE_BRAND_FIT_PRIMARY_SOURCE_NOT_TRUSTED:${text(shot.id) || "unknown"}:${primary}`,
    );
  }

  const filteredReferences = list(shot.reference_assets)
    .filter((reference) => {
      const id = text(reference?.asset_id || reference?.id);
      const evidence = byId.get(id);
      if (!id || !evidence) return false;
      if (evidence.classification === "SYNTHETIC") return false;
      return true;
    })
    .map((reference) => ({
      ...reference,
      role: text(reference?.asset_id || reference?.id) === primary
        ? "PRIMARY_SOURCE"
        : upper(reference?.role) === "PRIMARY_SOURCE"
          ? "REFERENCE"
          : reference.role,
    }));

  if (!filteredReferences.some((reference) =>
    text(reference?.asset_id || reference?.id) === primary &&
    upper(reference?.role) === "PRIMARY_SOURCE",
  )) {
    filteredReferences.unshift({
      asset_id: primary,
      role: "PRIMARY_SOURCE",
      reason: "Trusted brand-fidelity primary source selected from authenticated production assets.",
    });
  }

  const referenceIds = unique([
    filteredReferences.map((reference) => reference?.asset_id || reference?.id),
    primary,
  ]);
  const generation = object(shot.generation);

  return {
    ...shot,
    assets: [primary],
    primary_source_asset_id: primary,
    reference_assets: filteredReferences,
    reference_asset_ids: referenceIds,
    generation: {
      ...generation,
      primary_source_asset_id: primary,
      provider_parameters: {
        ...object(generation.provider_parameters),
        primary_source_asset_id: primary,
        brand_fidelity_primary_source_required: true,
      },
    },
    metadata: {
      ...object(shot.metadata),
      brand_fidelity_primary_source_asset_id: primary,
      brand_fidelity_primary_source_classification:
        primaryEvidence.classification,
    },
  };
}

function brandRules(existing = [], brandTruth = {}, fidelity = {}) {
  return [
    ...list(existing).filter((rule) =>
      rule?.contract !== BRAND_TRUTH_CONTRACT &&
      rule?.contract !== BRAND_FIDELITY_CONTRACT,
    ),
    brandTruth,
    {
      contract: BRAND_FIDELITY_CONTRACT,
      required: true,
      brand_truth_hash: brandTruth.brand_truth_hash,
      provenance_hash: fidelity.provenance_hash,
      trusted_primary_source_asset_ids:
        fidelity.trusted_primary_source_asset_ids,
      synthetic_visual_asset_ids: fidelity.synthetic_visual_asset_ids,
      synthetic_assets_may_not_establish_brand_identity_or_location: true,
      trusted_primary_source_required_for_generated_visual_shots: true,
      post_generation_brand_review_required: true,
    },
  ];
}

export function normalizeCreativeMasterPlanBrandFidelity({
  result = {},
  project = {},
  brief = {},
  assets = [],
} = {}) {
  const plan = object(result.plan);
  const required = requiresCreativeBrandFit({ project, brief, plan });
  const provenance = buildCreativeAssetProvenanceManifest(assets);
  if (!required) {
    return {
      ...result,
      plan: {
        ...plan,
        asset_provenance: provenance,
      },
    };
  }

  const research = object(result.research);
  const brandTruth = buildCreativeBrandTruth(research);
  const trusted = trustedVisualSet(provenance);
  if (!trusted.size) {
    throw new Error("CREATIVE_BRAND_FIT_AUTHENTIC_VISUAL_REFERENCE_REQUIRED");
  }

  const manifest = list(plan.asset_manifest).map((entry) => {
    const id = text(entry?.asset_id || entry?.id);
    const evidence = provenanceById(provenance).get(id);
    if (evidence?.classification !== "SYNTHETIC") {
      return {
        ...entry,
        brand_fidelity_classification: evidence?.classification || "UNKNOWN",
      };
    }
    return {
      ...entry,
      disposition: "EXCLUDE",
      reason:
        "Synthetic asset excluded from brand-fidelity production unless an explicit trusted-derived provenance contract is present.",
      assignments: [],
      brand_fidelity_classification: "SYNTHETIC",
    };
  });

  const fidelity = {
    contract: BRAND_FIDELITY_CONTRACT,
    required: true,
    passed: true,
    research_report_id: brandTruth.research_report_id,
    research_identity: brandTruth.research_identity,
    brand_truth_hash: brandTruth.brand_truth_hash,
    provenance_hash: provenance.provenance_hash,
    authentic_visual_asset_ids: provenance.authentic_visual_asset_ids,
    trusted_derived_visual_asset_ids:
      provenance.trusted_derived_visual_asset_ids,
    trusted_primary_source_asset_ids: [...trusted],
    synthetic_visual_asset_ids: provenance.synthetic_visual_asset_ids,
    synthetic_assets_may_not_establish_brand_identity_or_location: true,
    trusted_primary_source_required_for_generated_visual_shots: true,
    post_generation_brand_review_required: true,
  };

  const scenes = list(plan.scenes).map((scene) => ({
    ...scene,
    brand_rules: brandRules(scene.brand_rules, brandTruth, fidelity),
    shots: list(scene.shots).map((shot) =>
      normalizeBrandFitShot({
        shot,
        scene,
        manifest,
        provenance,
      }),
    ),
  }));

  return {
    ...result,
    plan: {
      ...plan,
      asset_manifest: manifest,
      brand_truth: brandTruth,
      asset_provenance: provenance,
      brand_fidelity: fidelity,
      scenes,
      production: {
        ...object(plan.production),
        brand_fit_required: true,
        brand_truth_hash: brandTruth.brand_truth_hash,
        asset_provenance_hash: provenance.provenance_hash,
        trusted_primary_source_required: true,
        post_generation_brand_review_required: true,
      },
    },
    brand_truth: brandTruth,
    asset_provenance: provenance,
    brand_fidelity: fidelity,
  };
}

function requireValue(value, code) {
  if (!value) throw new Error(code);
  return value;
}

function brandRule(rules = [], contract) {
  return list(rules).find((rule) => rule?.contract === contract) || null;
}

function generatedVisualTask(task = {}) {
  const type = upper(task.type);
  return ["GENERATE_IMAGE", "GENERATE_VIDEO"].includes(type);
}

export function assertCreativeBrandFidelityPipeline(pipeline = {}) {
  const plan = object(pipeline.master_plan?.plan);
  const fidelity = object(plan.brand_fidelity);
  if (fidelity.required !== true) {
    return {
      contract: BRAND_FIDELITY_CONTRACT,
      required: false,
      passed: true,
    };
  }
  if (
    fidelity.contract !== BRAND_FIDELITY_CONTRACT ||
    fidelity.passed !== true ||
    !text(fidelity.brand_truth_hash) ||
    !text(fidelity.provenance_hash)
  ) {
    throw new Error("CREATIVE_BRAND_FIDELITY_CONTRACT_REQUIRED");
  }

  const research = object(pipeline.research);
  const researchValidation = object(research.metadata?.validation);
  if (researchValidation.passed !== true) {
    throw new Error("CREATIVE_PIPELINE_VALIDATED_RESEARCH_REQUIRED");
  }
  if (text(research.id) !== text(fidelity.research_report_id)) {
    throw new Error("CREATIVE_PIPELINE_RESEARCH_BRAND_TRUTH_MISMATCH");
  }

  requireValue(pipeline.strategy?.id, "CREATIVE_PIPELINE_STRATEGY_REQUIRED");
  requireValue(pipeline.concept?.id, "CREATIVE_PIPELINE_CONCEPT_REQUIRED");
  requireValue(pipeline.storyboard?.id, "CREATIVE_PIPELINE_STORYBOARD_REQUIRED");
  if (!list(pipeline.scenes).length) {
    throw new Error("CREATIVE_PIPELINE_SCENES_REQUIRED");
  }
  if (!list(pipeline.shots).length) {
    throw new Error("CREATIVE_PIPELINE_SHOTS_REQUIRED");
  }

  const lineage = object(plan.story_lineage || plan.metadata?.story_lineage);
  for (const key of [
    "research_report_id",
    "research_identity",
    "selected_concept_hash",
    "story_contract_hash",
    "master_plan_hash",
  ]) {
    if (!text(lineage[key])) {
      throw new Error(`CREATIVE_PIPELINE_STORY_LINEAGE_${key.toUpperCase()}_REQUIRED`);
    }
  }
  if (
    text(lineage.research_report_id) !== text(fidelity.research_report_id) ||
    text(lineage.research_identity) !== text(fidelity.research_identity)
  ) {
    throw new Error("CREATIVE_PIPELINE_STORY_RESEARCH_LINEAGE_MISMATCH");
  }

  const trusted = new Set(
    list(fidelity.trusted_primary_source_asset_ids).map(text).filter(Boolean),
  );
  const generatedShots = list(pipeline.shots).filter((shot) =>
    shot.generation?.required === true,
  );
  for (const shot of generatedShots) {
    const primary = text(
      shot.primary_source_asset_id ||
      shot.generation?.primary_source_asset_id,
    );
    if (!primary || !trusted.has(primary)) {
      throw new Error(
        `CREATIVE_PIPELINE_TRUSTED_PRIMARY_SOURCE_REQUIRED:${shot.id || "unknown"}`,
      );
    }
    if (!list(shot.assets).map(text).includes(primary)) {
      throw new Error(
        `CREATIVE_PIPELINE_PRIMARY_SOURCE_NOT_MATERIALIZED:${shot.id || "unknown"}:${primary}`,
      );
    }
    const truth = brandRule(shot.brand_rules, BRAND_TRUTH_CONTRACT) ||
      brandRule(
        list(pipeline.scenes).find((scene) => text(scene.id) === text(shot.scene_id))?.brand_rules,
        BRAND_TRUTH_CONTRACT,
      );
    if (!truth || text(truth.brand_truth_hash) !== text(fidelity.brand_truth_hash)) {
      throw new Error(
        `CREATIVE_PIPELINE_SHOT_BRAND_TRUTH_REQUIRED:${shot.id || "unknown"}`,
      );
    }
  }

  const graph = object(pipeline.optimizedGraph || pipeline.graph);
  requireValue(graph.id, "CREATIVE_PIPELINE_PRODUCTION_GRAPH_REQUIRED");
  const graphLineage = object(graph.metadata?.story_lineage);
  if (
    text(graphLineage.story_contract_hash) !== text(lineage.story_contract_hash) ||
    text(graphLineage.master_plan_hash) !== text(lineage.master_plan_hash)
  ) {
    throw new Error("CREATIVE_PIPELINE_GRAPH_STORY_LINEAGE_MISMATCH");
  }
  if (
    generatedShots.length > 0 &&
    Number(graph.metadata?.generated_media_perceptual_review_count || 0) <
      generatedShots.length
  ) {
    throw new Error("CREATIVE_PIPELINE_POST_GENERATION_REVIEW_GRAPH_REQUIRED");
  }

  const tasks = list(pipeline.tasks);
  if (!tasks.length) throw new Error("CREATIVE_PIPELINE_PRODUCTION_TASKS_REQUIRED");
  const visualTasks = tasks.filter(generatedVisualTask);
  for (const task of visualTasks) {
    const primary = text(
      task.input?.primary_source_asset_id ||
      task.input?.generation?.primary_source_asset_id ||
      task.input?.requirements?.primary_source_asset_id,
    );
    if (!primary || !trusted.has(primary)) {
      throw new Error(
        `CREATIVE_PIPELINE_TASK_TRUSTED_PRIMARY_SOURCE_REQUIRED:${task.id || "unknown"}`,
      );
    }
    const rules = list(task.input?.requirements?.brand_rules);
    const truth = brandRule(rules, BRAND_TRUTH_CONTRACT);
    const taskFidelity = brandRule(rules, BRAND_FIDELITY_CONTRACT);
    if (
      !truth ||
      !taskFidelity ||
      text(truth.brand_truth_hash) !== text(fidelity.brand_truth_hash) ||
      text(taskFidelity.provenance_hash) !== text(fidelity.provenance_hash)
    ) {
      throw new Error(
        `CREATIVE_PIPELINE_TASK_BRAND_FIDELITY_EVIDENCE_REQUIRED:${task.id || "unknown"}`,
      );
    }

    const scope = object(task.input?.requirements?.asset_scope);
    if (!CreativeShotAssetScopeRuntime.verify(scope)) {
      throw new Error(
        `CREATIVE_PIPELINE_TASK_ASSET_SCOPE_REQUIRED:${task.id || "unknown"}`,
      );
    }
    if (
      text(scope.primary_source_asset_id) !== primary ||
      !list(scope.creative_asset_ids).map(text).includes(primary)
    ) {
      throw new Error(
        `CREATIVE_PIPELINE_TASK_ASSET_SCOPE_PRIMARY_MISMATCH:${task.id || "unknown"}`,
      );
    }
  }

  return {
    contract: BRAND_FIDELITY_CONTRACT,
    required: true,
    passed: true,
    research_report_id: fidelity.research_report_id,
    brand_truth_hash: fidelity.brand_truth_hash,
    provenance_hash: fidelity.provenance_hash,
    strategy_id: pipeline.strategy.id,
    concept_id: pipeline.concept.id,
    storyboard_id: pipeline.storyboard.id,
    scene_count: list(pipeline.scenes).length,
    shot_count: list(pipeline.shots).length,
    generated_visual_task_count: visualTasks.length,
    perceptual_review_count: Number(
      graph.metadata?.generated_media_perceptual_review_count || 0,
    ),
    provider_calls_executed: false,
    publication_authorized: false,
  };
}

export const CreativeBrandFidelityRuntime = Object.freeze({
  contracts: {
    provenance: PROVENANCE_CONTRACT,
    brand_truth: BRAND_TRUTH_CONTRACT,
    brand_fidelity: BRAND_FIDELITY_CONTRACT,
    trusted_derived: TRUSTED_DERIVED_CONTRACT,
  },
  classify: classifyCreativeAssetProvenance,
  annotateAssets: annotateCreativeAssetsForBrandFidelity,
  buildProvenance: buildCreativeAssetProvenanceManifest,
  planningReferences: selectAuthenticPlanningReferences,
  requiresBrandFit: requiresCreativeBrandFit,
  buildBrandTruth: buildCreativeBrandTruth,
  normalizeMasterPlan: normalizeCreativeMasterPlanBrandFidelity,
  assertPipeline: assertCreativeBrandFidelityPipeline,
});
