import "@/lib/creative/research/runtime/ResearchRuntime";

import {
  CreativeAssetsRuntime,
} from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";
import {
  CreativeProjectRuntime,
} from "@/lib/creative/projects/runtime/CreativeProjectRuntime";
import {
  CreativeMasterPlanRuntime,
} from "@/lib/creative/director/runtime/CreativeMasterPlanRuntime";
import {
  CreativeVisualProductionRouteRuntime,
} from "@/lib/creative/director/runtime/CreativeVisualProductionRouteRuntime";
import {
  CreativeBrandFidelityRuntime,
} from "./CreativeBrandFidelityRuntime";
import {
  CreativeBrandFidelitySemanticBindingRuntime,
} from "./CreativeBrandFidelitySemanticBindingRuntime";
import {
  sanitizeCreativePromptlessDirectionSpec,
} from "@/lib/creative/director/runtime/CreativePromptlessDirectionSpecRuntime";
import {
  CreativeStoryLineageContractRuntime,
} from "@/lib/creative/director/runtime/CreativeStoryLineageContractRuntime";

const ASSET_FLAG = Symbol.for(
  "avantiqo.creative.brand-fidelity.asset-context.v1",
);
const PLAN_FLAG = Symbol.for(
  "avantiqo.creative.brand-fidelity.master-plan.v1",
);

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

function unique(values = []) {
  return [...new Set(list(values).flat(Infinity).map((value) => text(
    value?.asset_id || value?.assetId || value?.id || value,
  )).filter(Boolean))];
}

function uniqueAssets(assets = []) {
  return [...new Map(
    list(assets)
      .map((asset) => [text(asset?.id || asset?.asset_id), asset])
      .filter(([id]) => Boolean(id)),
  ).values()];
}

function projectIdFrom(params = {}) {
  return text(
    params.creative_project_id ||
    params.creativeProjectId,
  );
}

function organizationIdFrom(params = {}, project = {}) {
  return text(
    params.organization_id ||
    params.organizationId ||
    project.organization_id,
  );
}

function projectRequiresBrandFit(project = {}) {
  return project.metadata?.creative_quality_policy?.require_brand_fit === true;
}

function installAssetContext() {
  if (CreativeAssetsRuntime[ASSET_FLAG]) return;
  const listWithoutBrandContext = CreativeAssetsRuntime.list.bind(
    CreativeAssetsRuntime,
  );
  Object.defineProperty(CreativeAssetsRuntime, ASSET_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  CreativeAssetsRuntime.list = async function listWithBrandFidelityContext(params = {}) {
    const current = await listWithoutBrandContext(params);
    const projectId = projectIdFrom(params);
    if (!projectId) {
      return CreativeBrandFidelityRuntime.annotateAssets(current);
    }

    const project = await CreativeProjectRuntime.get(projectId);
    if (!project || !projectRequiresBrandFit(project)) {
      return CreativeBrandFidelityRuntime.annotateAssets(current);
    }

    const organizationId = organizationIdFrom(params, project);
    if (!organizationId || text(project.organization_id) !== organizationId) {
      throw new Error("CREATIVE_BRAND_FIDELITY_PROJECT_SCOPE_INVALID");
    }

    const organizationAssets = await listWithoutBrandContext({
      organization_id: organizationId,
      limit: Math.max(Number(params.limit || 200), 1000),
    });
    const authenticPlanningReferences =
      CreativeBrandFidelityRuntime.planningReferences(organizationAssets, 16);
    if (!authenticPlanningReferences.length) {
      throw new Error("CREATIVE_BRAND_FIT_AUTHENTIC_VISUAL_REFERENCE_REQUIRED");
    }

    return CreativeBrandFidelityRuntime.annotateAssets(
      uniqueAssets([
        ...current,
        ...authenticPlanningReferences,
      ]),
    );
  };
}

function bindShotSemantics(result = {}, assets = []) {
  const plan = object(result.plan);
  const provenance = CreativeBrandFidelityRuntime.buildProvenance(assets);
  const assetMap = new Map(
    list(assets)
      .map((asset) => [text(asset?.id || asset?.asset_id), asset])
      .filter(([id]) => Boolean(id)),
  );
  const bindings = [];
  const productionRoutes = [];
  const scenes = list(plan.scenes).map((scene) => ({
    ...scene,
    shots: list(scene.shots).map((shot) => {
      if (shot.generation?.required !== true) return shot;

      const binding = CreativeBrandFidelitySemanticBindingRuntime.bind({
        shot,
        scene,
        assets,
        provenance,
      });
      if (!binding.confident || !binding.primary_asset_id) {
        throw new Error(
          `CREATIVE_BRAND_FIDELITY_SEMANTIC_ASSET_BINDING_REQUIRED:${text(shot.id) || "unknown"}`,
        );
      }

      const primaryAsset = assetMap.get(text(binding.primary_asset_id));
      if (!primaryAsset) {
        throw new Error(
          `CREATIVE_BRAND_FIDELITY_PRIMARY_ASSET_REQUIRED:${text(shot.id) || "unknown"}`,
        );
      }

      const productionRoute = CreativeVisualProductionRouteRuntime.resolve({
        shot,
        primary_asset: primaryAsset,
        binding,
      });

      bindings.push({
        shot_id: shot.id || null,
        scene_id: scene.id || null,
        ...binding,
      });
      productionRoutes.push({
        shot_id: shot.id || null,
        scene_id: scene.id || null,
        ...productionRoute,
      });

      const referenceAssets = binding.reference_asset_ids.map((assetId) => ({
        asset_id: assetId,
        role: assetId === binding.primary_asset_id
          ? "PRIMARY_SOURCE"
          : "REFERENCE",
        reason: assetId === binding.primary_asset_id
          ? "Deterministically selected authentic primary source from verified shot semantics."
          : "Deterministically selected authentic supporting reference from verified shot semantics.",
      }));
      const generation = object(shot.generation);

      return {
        ...shot,
        assets: [binding.primary_asset_id],
        primary_source_asset_id: binding.primary_asset_id,
        reference_assets: referenceAssets,
        reference_asset_ids: unique(binding.reference_asset_ids),
        production_route: productionRoute,
        generation: {
          ...generation,
          primary_source_asset_id: binding.primary_asset_id,
          production_route: productionRoute,
          provider_parameters: {
            ...object(generation.provider_parameters),
            primary_source_asset_id: binding.primary_asset_id,
            reference_asset_ids: unique(binding.reference_asset_ids),
            semantic_asset_binding_contract: binding.contract,
            visual_production_route_contract: productionRoute.contract,
            visual_production_mode: productionRoute.mode,
            premium_keyframe_required: productionRoute.premium_keyframe_required,
            enhancement_required: productionRoute.enhancement_required,
          },
        },
        metadata: {
          ...object(shot.metadata),
          semantic_asset_binding: binding,
          semantic_asset_binding_contract: binding.contract,
          semantic_asset_binding_verified: true,
          visual_production_route: productionRoute,
          visual_production_route_contract: productionRoute.contract,
          visual_production_mode: productionRoute.mode,
          visual_production_route_paid_generation_authorized: false,
        },
      };
    }),
  }));

  return {
    ...result,
    plan: {
      ...plan,
      scenes,
      asset_provenance: provenance,
      semantic_asset_binding: {
        contract: "CREATIVE_BRAND_FIDELITY_SEMANTIC_BINDING_SET_V1",
        passed: true,
        binding_count: bindings.length,
        bindings,
        provider_calls_executed: false,
      },
      visual_production_routing: {
        contract: CreativeVisualProductionRouteRuntime.contract,
        route_count: productionRoutes.length,
        routes: productionRoutes,
        least_destructive_transformation_required: true,
        provider_calls_executed: false,
        paid_generation_authorized: false,
      },
    },
  };
}

function rebuildStoryLineage(result = {}) {
  const research = object(result.research);
  if (!research.id) {
    throw new Error("CREATIVE_BRAND_FIDELITY_RESEARCH_REQUIRED");
  }
  const promptless = sanitizeCreativePromptlessDirectionSpec(
    object(result.plan),
  );
  const rebuilt = CreativeStoryLineageContractRuntime.build({
    plan: promptless.plan,
    research,
  });
  const validation = CreativeStoryLineageContractRuntime.assert(rebuilt.plan);
  return {
    ...result,
    plan: rebuilt.plan,
    story_lineage: rebuilt.lineage,
    story_lineage_validation: validation,
    promptless_direction_spec: promptless.evidence?.validation || null,
    promptless_direction_sanitization: promptless.evidence || null,
  };
}

function installMasterPlanBrandFidelity() {
  if (CreativeMasterPlanRuntime[PLAN_FLAG]) return;
  const createWithoutBrandFidelity = CreativeMasterPlanRuntime.create.bind(
    CreativeMasterPlanRuntime,
  );
  Object.defineProperty(CreativeMasterPlanRuntime, PLAN_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  CreativeMasterPlanRuntime.create = async function createBrandGroundedMasterPlan(input = {}) {
    const result = await createWithoutBrandFidelity(input);
    const project = object(input.project);
    const brief = object(input.brief);
    const assets = CreativeBrandFidelityRuntime.annotateAssets(input.assets || []);

    const semanticallyBound = projectRequiresBrandFit(project)
      ? bindShotSemantics(result, assets)
      : result;
    const normalized = CreativeBrandFidelityRuntime.normalizeMasterPlan({
      result: semanticallyBound,
      project,
      brief,
      assets,
    });

    if (normalized.plan?.brand_fidelity?.required !== true) {
      return normalized;
    }

    return rebuildStoryLineage(normalized);
  };
}

installAssetContext();
installMasterPlanBrandFidelity();

export const CreativeBrandFidelityBootstrap = Object.freeze({
  installed: true,
  asset_context_installed: true,
  master_plan_brand_fidelity_installed: true,
  semantic_asset_binding_installed: true,
  visual_production_routing_installed: true,
});