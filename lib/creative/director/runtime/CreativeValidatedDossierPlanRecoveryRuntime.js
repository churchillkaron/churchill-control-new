import {
  CreativeMasterPlanRuntime,
} from "./CreativeMasterPlanRuntime";
import * as ProductionGraphRepository
  from "@/lib/creative/production-graph/repositories/ProductionGraphRepository";
import {
  assertTemporalSemanticPlan,
  validateTemporalSemanticPlan,
} from "@/lib/creative/director/validation/CreativeTemporalSemanticPlanValidator";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.validated-dossier-plan-recovery.v1",
);
const CONTRACT = "CREATIVE_VALIDATED_DOSSIER_PLAN_RECOVERY_V1";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

const DERIVED_LANGUAGE = Object.freeze([
  /approved\s+master\s+motion/gi,
  /brand\s+motion/gi,
  /delivery\s+master/gi,
  /final\s+master/gi,
  /logo\s+animation/gi,
  /logo\s+reveal/gi,
  /master\s+video/gi,
  /motion\s+logo/gi,
  /preview\s+render/gi,
  /release\s+master/gi,
  /template\s+composition/gi,
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

function uuid(value) {
  const candidate = text(value);
  return UUID_PATTERN.test(candidate) ? candidate : null;
}

function assetId(value = {}) {
  if (typeof value === "string") return uuid(value);
  return uuid(
    value.asset_id ||
    value.assetId ||
    value.creative_asset_id ||
    value.id,
  );
}

function recoveryOnly(project = {}) {
  const approval = object(project.metadata?.paid_direction_approval);
  const cumulative = object(
    project.metadata?.direction_cumulative_authorization,
  );
  return Boolean(
    approval.recovery_only === true &&
    text(approval.status).toUpperCase() === "COMPLETED" &&
    cumulative.recovery_only === true &&
    cumulative.sufficient === true &&
    cumulative.new_provider_execution_authorized === false
  );
}

function instructionCorpus(input = {}) {
  const mission = object(input.mission);
  const project = object(input.project);
  const brief = object(input.brief);
  return JSON.stringify({
    intent: input.intent,
    command: input.command,
    objective: input.objective,
    business_goal: input.business_goal,
    request: input.request,
    mission: {
      title: mission.title,
      objective: mission.objective,
      business_goal: mission.business_goal,
      description: mission.description,
      original_intent: mission.metadata?.original_intent,
    },
    project: {
      name: project.name,
      title: project.title,
      objective: project.objective,
      business_goal: project.business_goal,
      description: project.description,
      original_intent: project.metadata?.original_intent,
      asset_selection: project.metadata?.asset_selection,
    },
    brief: {
      title: brief.title,
      objective: brief.objective,
      creative_objective: brief.creative_objective,
      business_goal: brief.business_goal,
      description: brief.description,
      requested_action: brief.requested_action,
      original_intent: brief.metadata?.original_intent,
    },
  }).toLowerCase();
}

function strictOriginalSourceOnly(input = {}) {
  const source = instructionCorpus(input);
  return Boolean(
    /\b(?:verified\s+)?original\s+(?:source\s+)?assets?\s+only\b/.test(source) &&
    /\b(?:exclude|excluding|prohibit|prohibited|without|no)\b[^.]{0,220}\b(?:derived|generated|poster|campaign\s+layout|key\s*frame|crop|cropped|reframe|preview\s+render)\w*\b/.test(source)
  );
}

function currentAssets(input = {}) {
  const byId = new Map();
  for (const asset of list(input.assets)) {
    const id = assetId(asset);
    if (id) byId.set(id, asset);
  }
  return byId;
}

function manifestIds(plan = {}) {
  return new Set(
    list(plan.asset_manifest)
      .map(assetId)
      .filter(Boolean),
  );
}

function selectedAssetSubset(plan = {}, allowedIds = new Set()) {
  const prior = manifestIds(plan);
  return Boolean(
    allowedIds.size &&
    [...allowedIds].every((id) => prior.has(id))
  );
}

function sanitizeString(value, forbiddenIds) {
  let result = String(value ?? "");
  for (const id of forbiddenIds) {
    result = result.replaceAll(id, "");
  }
  for (const pattern of DERIVED_LANGUAGE) {
    result = result.replace(pattern, "deterministic brand composition");
  }
  return result.replace(/\s{2,}/g, " ").trim();
}

function sanitizeValue(value, allowedIds, forbiddenIds) {
  if (typeof value === "string") {
    const exactId = uuid(value);
    if (exactId && forbiddenIds.has(exactId)) return null;
    return sanitizeString(value, forbiddenIds);
  }
  if (Array.isArray(value)) {
    return value
      .map((entry) => sanitizeValue(entry, allowedIds, forbiddenIds))
      .filter((entry) => entry !== null && entry !== undefined);
  }
  if (!value || typeof value !== "object") return value;

  const id = assetId(value);
  if (id && forbiddenIds.has(id)) return null;

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, entry]) => [
        key,
        sanitizeValue(entry, allowedIds, forbiddenIds),
      ])
      .filter(([, entry]) => entry !== null && entry !== undefined),
  );
}

function assetEvidence(asset = {}) {
  return [
    asset.name,
    asset.title,
    asset.file_name,
    asset.description,
    asset.metadata?.original_file_name,
    asset.metadata?.asset_role,
    asset.metadata?.role,
    asset.analysis?.description,
    ...list(asset.tags),
    ...list(asset.analysis?.tags),
  ].map(text).filter(Boolean).join(" ").toLowerCase();
}

function primaryBrandAsset(assetsById = new Map()) {
  return [...assetsById.entries()]
    .map(([id, asset]) => ({
      id,
      asset,
      evidence: assetEvidence(asset),
    }))
    .filter((entry) =>
      /\b(?:logo|brand\s+mark|wordmark|identity\s+mark)\b/.test(
        entry.evidence,
      ),
    )
    .sort((left, right) => {
      const leftExact = /\b(?:primary|approved|exact)\b/.test(left.evidence)
        ? 1
        : 0;
      const rightExact = /\b(?:primary|approved|exact)\b/.test(right.evidence)
        ? 1
        : 0;
      return rightExact - leftExact || left.id.localeCompare(right.id);
    })[0] || null;
}

function manifestEntry(asset = {}, id, retained = null) {
  const source = object(retained);
  return {
    ...source,
    asset_id: id,
    disposition: text(source.disposition).toUpperCase() || "REFERENCE",
    reason:
      text(source.reason) ||
      "Use only according to verified original-source role, rights, quality and continuity evidence.",
    confidence: Number.isFinite(Number(source.confidence))
      ? Number(source.confidence)
      : 80,
    assignments: list(source.assignments),
    restrictions: object(source.restrictions || asset.restrictions),
    continuity_anchors: object(source.continuity_anchors),
    repair_requirements: list(source.repair_requirements).length
      ? list(source.repair_requirements)
      : [
          "Preserve verified identity, product, venue and source provenance",
        ],
  };
}

function finalBrandShot(shot = {}) {
  const corpus = [
    shot.title,
    shot.purpose,
    shot.subject,
    shot.action,
    shot.graphics,
  ].map((value) =>
    typeof value === "string" ? value : JSON.stringify(value || {}),
  ).join(" ").toLowerCase();
  return Boolean(
    shot.generation?.required === false &&
    /\b(?:end\s+card|brand\s+mark|logo|invitation)\b/.test(corpus)
  );
}

function rebindShot(shot = {}, {
  allowedIds,
  forbiddenIds,
  brandAsset,
} = {}) {
  const sanitized = object(
    sanitizeValue(shot, allowedIds, forbiddenIds),
  );
  const references = list(sanitized.reference_assets)
    .filter((entry) => {
      const id = assetId(entry);
      return !id || allowedIds.has(id);
    });
  const referenceIds = list(sanitized.reference_asset_ids)
    .map(assetId)
    .filter((id) => id && allowedIds.has(id));
  const assets = list(sanitized.assets)
    .filter((entry) => {
      const id = assetId(entry);
      return !id || allowedIds.has(id);
    });

  if (!finalBrandShot(sanitized) || !brandAsset) {
    return {
      ...sanitized,
      reference_assets: references,
      reference_asset_ids: referenceIds,
      assets,
    };
  }

  const retainedReferences = references.filter((entry) => {
    const id = assetId(entry);
    return !id || id !== brandAsset.id;
  });
  return {
    ...sanitized,
    generation: {
      ...object(sanitized.generation),
      required: false,
    },
    graphics: {
      ...object(sanitized.graphics),
      logo: {
        ...object(sanitized.graphics?.logo),
        required: true,
        exact_asset_required: true,
        asset_id: brandAsset.id,
        role: "PRIMARY_BRAND_MARK",
      },
      render_text_outside_generated_pixels: true,
    },
    reference_assets: [
      ...retainedReferences,
      {
        asset_id: brandAsset.id,
        role: "EXACT_PRIMARY_BRAND_MARK",
      },
    ],
    reference_asset_ids: [
      ...new Set([...referenceIds, brandAsset.id]),
    ],
    assets,
  };
}

function rebindPlan(plan = {}, assetsById = new Map(), graph = {}) {
  const allowedIds = new Set(assetsById.keys());
  const priorManifest = list(plan.asset_manifest);
  const priorIds = manifestIds(plan);
  const forbiddenIds = new Set(
    [...priorIds].filter((id) => !allowedIds.has(id)),
  );
  const brandAsset = primaryBrandAsset(assetsById);
  const retainedById = new Map(
    priorManifest
      .map((entry) => [assetId(entry), entry])
      .filter(([id]) => id && allowedIds.has(id)),
  );
  const sanitized = object(
    sanitizeValue(plan, allowedIds, forbiddenIds),
  );
  const scenes = list(sanitized.scenes).map((scene) => ({
    ...scene,
    shots: list(scene.shots).map((shot) =>
      rebindShot(shot, {
        allowedIds,
        forbiddenIds,
        brandAsset,
      }),
    ),
  }));
  const assetManifest = [...assetsById.entries()].map(([id, asset]) =>
    manifestEntry(asset, id, retainedById.get(id)),
  );

  const rebound = {
    ...sanitized,
    asset_manifest: assetManifest,
    scenes,
    production: {
      ...object(sanitized.production),
      deterministic_brand_compositing_required: true,
      validated_dossier_plan_recovery_contract: CONTRACT,
      validated_dossier_plan_recovery_provider_execution: false,
      validated_dossier_plan_recovery_customer_charge: false,
      strict_original_source_only: true,
      source_asset_rebind_required: true,
      source_asset_rebind_allowed_asset_ids: [...allowedIds],
      source_asset_rebind_removed_asset_ids: [...forbiddenIds],
    },
    validation: {
      ...object(sanitized.validation),
      validated_dossier_plan_recovery: {
        contract: CONTRACT,
        source_production_graph_id: graph.id || null,
        source_production_graph_status: graph.status || null,
        source_asset_count: priorIds.size,
        rebound_asset_count: allowedIds.size,
        removed_asset_ids: [...forbiddenIds],
        exact_primary_brand_asset_id: brandAsset?.id || null,
        provider_execution_required: false,
        customer_charge_required: false,
        media_generation_authorized: false,
        publication_authorized: false,
      },
    },
  };

  const serialized = JSON.stringify(rebound);
  const leaked = [...forbiddenIds].filter((id) => serialized.includes(id));
  if (leaked.length) {
    throw new Error(
      `CREATIVE_VALIDATED_DOSSIER_REBIND_FORBIDDEN_ASSET_LEAK:` +
      leaked.join(","),
    );
  }
  if (brandAsset && !serialized.includes(brandAsset.id)) {
    throw new Error(
      "CREATIVE_VALIDATED_DOSSIER_REBIND_BRAND_ASSET_MISSING",
    );
  }

  const validation = validateTemporalSemanticPlan(rebound);
  assertTemporalSemanticPlan(rebound);
  return { plan: rebound, validation, forbiddenIds, brandAsset };
}

async function recover(input = {}) {
  const project = object(input.project);
  if (!recoveryOnly(project) || !strictOriginalSourceOnly(input)) {
    return null;
  }

  const assetsById = currentAssets(input);
  if (!assetsById.size) return null;

  const graphs = await ProductionGraphRepository.listByProject({
    organization_id: input.organization_id,
    creative_project_id: project.id,
  });

  for (const graph of graphs) {
    const snapshot = object(graph.metadata?.approval_plan_snapshot);
    if (!Object.keys(snapshot).length) continue;
    const semantic = validateTemporalSemanticPlan(snapshot);
    if (!semantic.passed) continue;
    if (!selectedAssetSubset(snapshot, new Set(assetsById.keys()))) continue;

    const rebound = rebindPlan(snapshot, assetsById, graph);
    return {
      plan: rebound.plan,
      validation: {
        passed: true,
        temporal_semantic_validation: rebound.validation,
        validated_dossier_plan_recovery:
          rebound.plan.validation?.validated_dossier_plan_recovery,
      },
      provider: null,
      model: null,
      usage: {
        calls: 0,
        items: [],
        recovered_from_validated_dossier: true,
      },
      billing: {
        calls: 0,
        items: [],
        new_customer_charge: false,
      },
      fallback: false,
      degraded: false,
      chunked_temporal_direction: true,
      validated_dossier_plan_recovery: {
        contract: CONTRACT,
        source_production_graph_id: graph.id,
        source_production_graph_status: graph.status || null,
        removed_asset_ids: [...rebound.forbiddenIds],
        exact_primary_brand_asset_id: rebound.brandAsset?.id || null,
        original_provider_result_reused: false,
        validated_plan_snapshot_reused: true,
        new_provider_execution: false,
        new_customer_charge: false,
        media_generation_authorized: false,
        publication_authorized: false,
      },
    };
  }

  throw new Error(
    "CREATIVE_VALIDATED_DOSSIER_SOURCE_ONLY_PLAN_RECOVERY_MISSING",
  );
}

function install() {
  if (CreativeMasterPlanRuntime[INSTALL_FLAG]) return;

  const createWithoutValidatedDossierRecovery =
    CreativeMasterPlanRuntime.create.bind(CreativeMasterPlanRuntime);

  Object.defineProperty(CreativeMasterPlanRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  CreativeMasterPlanRuntime.create =
    async function createWithValidatedDossierRecovery(input = {}) {
      const recovered = await recover(input);
      return recovered || createWithoutValidatedDossierRecovery(input);
    };
}

install();

export const CreativeValidatedDossierPlanRecoveryRuntime = {
  installed: true,
  recover,
  rebindPlan,
};
