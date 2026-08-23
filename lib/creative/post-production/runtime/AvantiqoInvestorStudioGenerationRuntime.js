import { availableProductionCapabilities } from "@/lib/creative/director/planner/creativeProductionCapabilities";
import { AVANTIQO_INVESTOR_STUDIO_GENERATION_PLAN } from "./AvantiqoInvestorStudioGenerationPlan";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function indexCapabilities(services = []) {
  const byService = new Map();
  const byCapability = new Map();

  for (const service of list(services)) {
    const serviceId = text(service.service_id);
    if (!serviceId) continue;
    byService.set(serviceId, service);
    for (const rawCapability of list(service.capabilities)) {
      const capabilityId = text(
        rawCapability?.capability_id || rawCapability?.id || rawCapability,
      );
      if (!capabilityId) continue;
      if (!byCapability.has(capabilityId)) byCapability.set(capabilityId, []);
      byCapability.get(capabilityId).push(service);
    }
  }

  return { byService, byCapability };
}

function resolveGenerationRequirement(requirement, index) {
  const requested = text(requirement);
  if (!requested) return null;

  const directService = index.byService.get(requested);
  if (directService) {
    return {
      requested,
      resolved: true,
      service_id: directService.service_id,
      capability_id: requested,
      source: directService.source || null,
      local_execution: directService.local_execution === true,
      provider_required: directService.provider_required !== false,
    };
  }

  const services = index.byCapability.get(requested) || [];
  const service = services[0] || null;
  return {
    requested,
    resolved: Boolean(service),
    service_id: service?.service_id || null,
    capability_id: requested,
    source: service?.source || null,
    local_execution: service?.local_execution === true,
    provider_required: service ? service.provider_required !== false : null,
  };
}

function sceneJob(scene, index) {
  const requirements = list(scene.required_generation).map((requirement) =>
    resolveGenerationRequirement(requirement, index),
  );
  const missing = requirements.filter((entry) => !entry?.resolved);

  return Object.freeze({
    contract: "AVANTIQO_INVESTOR_STUDIO_SCENE_JOB_V1",
    organization_id: AVANTIQO_INVESTOR_STUDIO_GENERATION_PLAN.organization_id,
    investor_project_id: AVANTIQO_INVESTOR_STUDIO_GENERATION_PLAN.investor_project_id,
    scene: scene.scene,
    duration_seconds: scene.duration_seconds,
    capability_visual_role: scene.capability,
    objective: scene.objective,
    service_requirements: requirements,
    required_fresh_outputs: list(scene.required_fresh_outputs),
    required_business_objects: list(scene.required_business_objects),
    editorial_only: list(scene.editorial_only),
    existing_asset_policy: "GROUNDING_REFERENCE_ONLY",
    output_policy: "FRESH_GENERATION_ONLY",
    provider_selection_exposed: false,
    prompt_policy: "NO_USER_PROMPT_FIELD_STUDIO_SERIALIZES_DIRECTION_AT_PROVIDER_BOUNDARY",
    ready_to_generate: missing.length === 0,
    missing_requirements: missing.map((entry) => entry.requested),
    review_policy: "GENERATE_THEN_RENDER_WITH_LOCKED_NARRATION_THEN_USER_APPROVAL",
  });
}

export async function resolveInvestorStudioGenerationJobs({
  organizationId = AVANTIQO_INVESTOR_STUDIO_GENERATION_PLAN.organization_id,
  scenes = AVANTIQO_INVESTOR_STUDIO_GENERATION_PLAN.rebuild_scenes,
} = {}) {
  if (text(organizationId) !== AVANTIQO_INVESTOR_STUDIO_GENERATION_PLAN.organization_id) {
    throw new Error("INVESTOR_STUDIO_ORGANIZATION_MISMATCH");
  }

  const { capabilities, unexecutable } = await availableProductionCapabilities(organizationId);
  const index = indexCapabilities(capabilities);
  const requestedScenes = new Set(list(scenes).map(Number));
  const jobs = AVANTIQO_INVESTOR_STUDIO_GENERATION_PLAN.scene_generation
    .filter((scene) => requestedScenes.has(Number(scene.scene)))
    .map((scene) => sceneJob(scene, index));

  const missing = jobs.flatMap((job) =>
    job.missing_requirements.map((requirement) => ({
      scene: job.scene,
      requirement,
    })),
  );

  return Object.freeze({
    contract: "AVANTIQO_INVESTOR_STUDIO_GENERATION_RESOLUTION_V1",
    organization_id: organizationId,
    capability_source: "ORGANIZATION_SERVICE_RUNTIME_PLUS_AVANTIQO_LOCAL_CREATIVE_CORE",
    provider_selection_exposed: false,
    available_service_count: capabilities.length,
    unexecutable_services: unexecutable,
    jobs,
    ready: jobs.length > 0 && missing.length === 0,
    missing,
  });
}

export function assertInvestorStudioGenerationReady(resolution) {
  if (!resolution?.ready) {
    const missing = list(resolution?.missing)
      .map((entry) => `scene-${entry.scene}:${entry.requirement}`)
      .join(",");
    throw new Error(`INVESTOR_STUDIO_GENERATION_NOT_READY:${missing || "UNKNOWN"}`);
  }
  return resolution;
}

export default resolveInvestorStudioGenerationJobs;
