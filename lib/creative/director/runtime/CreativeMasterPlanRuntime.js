import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import {
  OrganizationServiceRuntime,
} from "@/lib/platform/service-runtime/services/runtime/OrganizationServiceRuntime";
import {
  resolveServiceCapabilities,
} from "@/lib/platform/service-runtime/services/resolver/ServiceCapabilityResolver";
import {
  creativeAgencyDecisionSchema,
} from "@/lib/creative/director/registry/CreativeAgencyRoleRegistry";
import {
  CreativeMasterPlanContractRegistry,
} from "@/lib/creative/director/registry/CreativeMasterPlanContractRegistry";
import {
  assertCreativeMasterPlan,
} from "@/lib/creative/director/validation/CreativeMasterPlanValidator";
import {
  assertCreativeMasterPlanDecision,
} from "@/lib/creative/director/validation/CreativeMasterPlanDecisionGate";

const QUALITY_NUMBER_FIELDS = Object.freeze([
  "minimum_scene_score",
  "regenerate_below_score",
]);

const QUALITY_BOOLEAN_FIELDS = Object.freeze([
  "require_brand_fit",
  "require_non_ai_feel",
  "require_identity_continuity",
  "require_product_continuity",
  "require_story_progression",
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

function finite(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseJson(value) {
  if (value && typeof value === "object") return value;
  try {
    return JSON.parse(String(value || ""));
  } catch {
    return null;
  }
}

function qualityPolicyFor(project = {}, brief = {}) {
  const policy = object(
    project.metadata?.creative_quality_policy ||
      brief.creative_quality_policy ||
      brief.metadata?.creative_quality_policy,
  );

  if (!Object.keys(policy).length) {
    throw new Error("CREATIVE_QUALITY_POLICY_REQUIRED");
  }
  if (!text(policy.version)) {
    throw new Error("CREATIVE_QUALITY_POLICY_VERSION_REQUIRED");
  }

  for (const field of QUALITY_NUMBER_FIELDS) {
    const value = finite(policy[field]);
    if (value === null || value < 0 || value > 100) {
      throw new Error(
        `CREATIVE_QUALITY_POLICY_${field.toUpperCase()}_INVALID`,
      );
    }
  }

  if (Number(policy.regenerate_below_score) > Number(policy.minimum_scene_score)) {
    throw new Error("CREATIVE_QUALITY_POLICY_REGENERATION_THRESHOLD_INVALID");
  }

  for (const field of QUALITY_BOOLEAN_FIELDS) {
    if (typeof policy[field] !== "boolean") {
      throw new Error(
        `CREATIVE_QUALITY_POLICY_${field.toUpperCase()}_REQUIRED`,
      );
    }
  }

  return Object.freeze({
    version: text(policy.version),
    ...Object.fromEntries(
      QUALITY_NUMBER_FIELDS.map((field) => [field, Number(policy[field])]),
    ),
    ...Object.fromEntries(
      QUALITY_BOOLEAN_FIELDS.map((field) => [field, policy[field]]),
    ),
  });
}

function assetIdentity(asset = {}) {
  const id = text(asset.id || asset.asset_id);
  if (!id) throw new Error("CREATIVE_SELECTED_ASSET_ID_REQUIRED");

  return {
    asset_id: id,
    asset_type: asset.asset_type || asset.type || null,
    name: asset.name || asset.title || asset.file_name || null,
    description: asset.description || asset.analysis?.description || null,
    analysis: asset.analysis || {},
    tags: list(asset.tags || asset.analysis?.tags),
    url: asset.url || asset.file_url || asset.image_url || null,
    rights: asset.rights || asset.metadata?.rights || {},
    consent: asset.consent || asset.metadata?.consent || {},
    restrictions: asset.restrictions || asset.metadata?.restrictions || {},
  };
}

async function availableProductionCapabilities(organizationId) {
  const categories = await OrganizationServiceRuntime.list(organizationId);
  const services = list(categories).flatMap((category) =>
    list(category?.services).map((service) => ({
      ...service,
      category_id: category.id || null,
      category_name: category.name || null,
    })),
  );

  const enabled = services.filter((service) =>
    text(service.status).toUpperCase() === "ACTIVE" &&
    service.usage_enabled !== false,
  );

  const resolved = enabled.map((service) => {
    const capabilities = resolveServiceCapabilities(service.service_id);
    if (!capabilities?.service_id || !list(capabilities.capabilities).length) {
      return null;
    }
    return {
      organization_service_id: service.id || null,
      service_id: capabilities.service_id,
      name: capabilities.name || service.service_id,
      category_id: service.category_id,
      category_name: service.category_name,
      source: capabilities.source || null,
      capabilities: list(capabilities.capabilities),
      status: service.status,
      usage_enabled: service.usage_enabled !== false,
      billing_enabled: service.billing_enabled !== false,
    };
  }).filter(Boolean);

  if (!resolved.some((service) => service.service_id === "ai.reasoning.execute")) {
    throw new Error("CREATIVE_REASONING_SERVICE_NOT_ENABLED");
  }

  return resolved;
}

function normalizedPlan(result) {
  const output = result?.output?.output || result?.output || result || {};
  const parsed = parseJson(output.text || output.content || output);
  const plan = parsed?.result || parsed || null;
  if (!plan || typeof plan !== "object") return null;

  const concept = object(plan.concept);
  return {
    ...plan,
    concept: {
      ...concept,
      creative_system:
        concept.creative_system || concept.visual_system || null,
      visual_system:
        concept.visual_system || concept.creative_system || null,
    },
  };
}

function applySystemOwnedPolicy(plan = {}, qualityPolicy = {}) {
  return {
    ...plan,
    quality: {
      ...qualityPolicy,
    },
  };
}

function decisionRequest({
  mission,
  project,
  brief,
  assets,
  quality_policy,
  available_production_capabilities,
}) {
  return {
    contract:
      CreativeMasterPlanContractRegistry.buildDecisionContract(),
    agency_role_schema:
      creativeAgencyDecisionSchema(),
    context: {
      mission,
      project,
      brief,
      assets,
      quality_policy,
      available_production_capabilities,
    },
  };
}

function serializeForReasoning(request) {
  return [
    "Execute the supplied Creative Master Plan decision contract.",
    "Return exactly one strict JSON object representing the final accountable master plan.",
    "Treat the attached contract and verified context as the only source of creative ontology, production capabilities and constraints.",
    "The quality policy is system-owned and immutable. Design under it; do not reinterpret, lower, replace or negotiate it.",
    "Use only service/capability pairs listed in context.available_production_capabilities. Never invent a service, capability or provider.",
    "Do not invent category templates, provider prompts, provider parameters, currencies, formats, channels, audiences, styles or technical defaults.",
    "Internally explore and reject weak directions before returning one primary direction.",
    "Complete creative_review precisely. If the direction is generic, derivative, weakly evidenced or insufficiently crafted, repair it before returning rather than marking it passed.",
    "For non-temporal workflows, production_steps are mandatory and must contain explicit registered service/capability requirements rather than downstream default recipes.",
    "Return JSON only.",
    JSON.stringify(request),
  ].join("\n");
}

export const CreativeMasterPlanRuntime = Object.freeze({
  async create({
    organization_id,
    mission = {},
    project = {},
    brief = {},
    assets = [],
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!project.id) throw new Error("creative_project_id required");

    const [qualityPolicy, capabilities] = await Promise.all([
      Promise.resolve(qualityPolicyFor(project, brief)),
      availableProductionCapabilities(organization_id),
    ]);
    const normalizedAssets = list(assets).map(assetIdentity);
    const request = decisionRequest({
      mission,
      project,
      brief,
      assets: normalizedAssets,
      quality_policy: qualityPolicy,
      available_production_capabilities: capabilities,
    });

    try {
      const result = await ServiceExecutionRuntime.execute({
        organization_id,
        service_id: "ai.reasoning.execute",
        provider_id: null,
        category: "CREATIVE_DIRECTION",
        input: {
          prompt: serializeForReasoning(request),
          quantity: 1,
          max_output_tokens: 20000,
          response_format: { type: "json_object" },
        },
        metadata: {
          module: "CREATIVE",
          operation: "MASTER_PLAN_DYNAMIC_V2",
          creative_mission_id: mission.id || null,
          creative_project_id: project.id,
          creative_quality_policy_version: qualityPolicy.version,
          creative_direction_contract:
            CreativeMasterPlanContractRegistry.contract,
          creative_direction_persistence: "STRUCTURED_ONLY",
          provider_prompt_boundary: "EXECUTION_TRANSPORT_ONLY",
          degraded_direction_allowed: false,
          production_capability_context_required: true,
          quality_policy_authority: "SYSTEM_OWNED",
        },
      });

      const modelPlan = normalizedPlan(result);
      if (!modelPlan) throw new Error("CREATIVE_MASTER_PLAN_JSON_REQUIRED");
      const plan = applySystemOwnedPolicy(modelPlan, qualityPolicy);

      const validation = assertCreativeMasterPlan({
        plan,
        assets: normalizedAssets,
      });
      const decisionValidation = assertCreativeMasterPlanDecision({
        plan,
        available_capabilities: capabilities,
        require_temporal_council: false,
      });

      return {
        plan: {
          ...plan,
          degraded: false,
          release_blocked: false,
          validation,
          decision_validation: decisionValidation,
        },
        validation,
        decision_validation: decisionValidation,
        available_production_capabilities: capabilities,
        provider: result.provider || null,
        model: result.model || null,
        usage: result.usage || null,
        billing: result.billing || null,
        fallback: false,
        degraded: false,
      };
    } catch (error) {
      const failure = new Error(
        `CREATIVE_DIRECTION_FAILED_CLOSED:${error?.message || String(error)}`,
      );
      failure.cause = error;
      failure.validation = error?.validation || null;
      throw failure;
    }
  },
  availableProductionCapabilities,
});
