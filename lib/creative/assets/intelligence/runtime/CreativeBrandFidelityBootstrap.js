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
  CreativeBrandFidelityRuntime,
} from "./CreativeBrandFidelityRuntime";
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
    const normalized = CreativeBrandFidelityRuntime.normalizeMasterPlan({
      result,
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
});
