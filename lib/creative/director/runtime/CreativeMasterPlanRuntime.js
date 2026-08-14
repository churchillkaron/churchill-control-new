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
  CREATIVE_AGENCY_ROLES,
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
import {
  mergeCreativeRepairedPlan,
} from "@/lib/creative/director/planner/mergeCreativeRepairedPlan";

const MAXIMUM_CONTRACT_REPAIR_ATTEMPTS = 2;

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

const REGISTERED_ROLE_IDS = new Set(
  CREATIVE_AGENCY_ROLES.map((role) => role.id),
);

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function singletonObjectList(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value && typeof value === "object") return [value];
  return value;
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

function normalizeRoleDecisions(value) {
  if (!Array.isArray(value)) return value;

  const normalized = {};
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return value;
    }
    const roleId = text(entry.role_id);
    if (
      !roleId ||
      !REGISTERED_ROLE_IDS.has(roleId) ||
      Object.prototype.hasOwnProperty.call(normalized, roleId)
    ) {
      return value;
    }
    const { role_id: _roleId, ...decision } = entry;
    normalized[roleId] = decision;
  }

  return Object.keys(normalized).length ? normalized : value;
}

function normalizeUnambiguousAssetAssignments(plan = {}) {
  const deliverables = singletonObjectList(plan.deliverables);
  const deliverableIds = Array.isArray(deliverables)
    ? deliverables.map((item) => text(item?.id)).filter(Boolean)
    : [];
  if (deliverableIds.length !== 1) return plan;

  const manifest = singletonObjectList(plan.asset_manifest);
  if (!Array.isArray(manifest)) return plan;

  const target = deliverableIds[0];
  let changed = false;
  const normalizedManifest = manifest.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return entry;
    }
    const disposition = text(entry.disposition).toUpperCase();
    if (
      disposition === "EXCLUDE" ||
      list(entry.assignments).length ||
      !["ASSIGNED", "REFERENCE", "REGENERATE"].includes(disposition)
    ) {
      return entry;
    }

    changed = true;
    return {
      ...entry,
      assignments: [target],
    };
  });

  return changed
    ? {
        ...plan,
        asset_manifest: normalizedManifest,
      }
    : plan;
}

function structuredRepairPlan(parsed = {}) {
  const planJson = text(parsed?.plan_json);
  const roleDecisions = object(parsed?.role_decisions);
  if (!planJson || !Object.keys(roleDecisions).length) return null;

  const plan = parseJson(planJson);
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) return null;

  return {
    ...plan,
    role_decisions: roleDecisions,
  };
}

function normalizedPlan(result) {
  const output = result?.output?.output || result?.output || result || {};
  const parsed = parseJson(output.text || output.content || output);
  const repairedTransport = structuredRepairPlan(parsed);
  const plan =
    object(repairedTransport).workflow_kind
      ? repairedTransport
      : object(parsed?.result).workflow_kind
        ? parsed.result
        : object(parsed?.plan).workflow_kind
          ? parsed.plan
          : object(parsed?.common_plan_contract).workflow_kind
            ? parsed.common_plan_contract
            : parsed;
  if (!plan || typeof plan !== "object") return null;

  const normalizedBindings = normalizeUnambiguousAssetAssignments(plan);
  const concept = object(normalizedBindings.concept);
  return {
    ...normalizedBindings,
    asset_manifest: singletonObjectList(normalizedBindings.asset_manifest),
    deliverables: singletonObjectList(normalizedBindings.deliverables),
    role_decisions: normalizeRoleDecisions(normalizedBindings.role_decisions),
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

function normalizeUnambiguousCapabilityPairs(plan = {}, capabilities = []) {
  const byService = new Map(
    list(capabilities).map((service) => [
      text(service.service_id),
      list(service.capabilities).map(text).filter(Boolean),
    ]),
  );

  const normalizeStep = (step) => {
    if (!step || typeof step !== "object" || Array.isArray(step)) {
      return step;
    }

    const serviceId = text(step.service);
    const capabilityId = text(step.capability);
    const allowed = byService.get(serviceId);

    if (
      !serviceId ||
      !capabilityId ||
      !allowed ||
      allowed.length !== 1 ||
      allowed.includes(capabilityId)
    ) {
      return step;
    }

    return {
      ...step,
      capability: allowed[0],
    };
  };

  const normalized = {
    ...plan,
  };

  if (Array.isArray(plan.deliverables)) {
    normalized.deliverables = plan.deliverables.map((deliverable) => ({
      ...deliverable,
      production_steps: Array.isArray(deliverable?.production_steps)
        ? deliverable.production_steps.map(normalizeStep)
        : deliverable?.production_steps,
    }));
  }

  if (Array.isArray(plan.production?.cross_deliverable_steps)) {
    normalized.production = {
      ...object(plan.production),
      cross_deliverable_steps:
        plan.production.cross_deliverable_steps.map(normalizeStep),
    };
  }

  if (Array.isArray(plan.scenes)) {
    normalized.scenes = plan.scenes.map((scene) => ({
      ...scene,
      shots: Array.isArray(scene?.shots)
        ? scene.shots.map((shot) => ({
            ...shot,
            generation: normalizeStep(shot?.generation),
          }))
        : scene?.shots,
    }));
  }

  return normalized;
}

function validatePlan({ plan, assets, capabilities }) {
  const validation = assertCreativeMasterPlan({
    plan,
    assets,
  });
  const decisionValidation = assertCreativeMasterPlanDecision({
    plan,
    available_capabilities: capabilities,
    require_temporal_council: false,
  });
  return { validation, decisionValidation };
}

function allowedCapabilityPairs(capabilities = []) {
  return list(capabilities).flatMap((service) =>
    list(service.capabilities).map((capability) => ({
      service: text(service.service_id),
      capability: text(capability),
    })),
  );
}

function roleChecklist(workflowKind = null) {
  const normalizedWorkflow = text(workflowKind).toUpperCase();
  return CREATIVE_AGENCY_ROLES.map((role) => ({
    role_id: role.id,
    mandate: role.mandate,
    applies_to: [...role.applies_to],
    eligible:
      Boolean(normalizedWorkflow) &&
      (role.applies_to.includes("ALL") ||
        role.applies_to.includes(normalizedWorkflow)),
  }));
}

function strictRoleDecisionSchema(role) {
  return {
    type: "object",
    description: role.mandate,
    properties: {
      status: {
        type: "string",
        enum: ["ACTIVE", "NOT_REQUIRED"],
      },
      decision: {
        type: "string",
        description:
          "Concrete role decision when ACTIVE, or concrete reason the discipline is unnecessary when NOT_REQUIRED.",
      },
      evidence: {
        type: "array",
        items: { type: "string" },
        description:
          "Exact evidence references grounded in the supplied mission, project, brief, assets, research or approved history. ACTIVE roles require real evidence; NOT_REQUIRED roles may return an empty array.",
      },
      confidence: {
        type: "number",
      },
      risks: {
        type: "array",
        items: { type: "string" },
      },
      repair_instructions: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: [
      "status",
      "decision",
      "evidence",
      "confidence",
      "risks",
      "repair_instructions",
    ],
    additionalProperties: false,
  };
}

function repairStructuredOutputFormat() {
  const roleProperties = Object.fromEntries(
    CREATIVE_AGENCY_ROLES.map((role) => [
      role.id,
      strictRoleDecisionSchema(role),
    ]),
  );
  const roleIds = CREATIVE_AGENCY_ROLES.map((role) => role.id);

  return {
    type: "json_schema",
    json_schema: {
      name: "creative_master_plan_contract_repair",
      strict: true,
      schema: {
        type: "object",
        properties: {
          plan_json: {
            type: "string",
            description:
              "Complete repaired Creative Master Plan serialized as one valid JSON object string. Do not include role_decisions inside this string; role_decisions are returned separately in the schema-enforced field.",
          },
          role_decisions: {
            type: "object",
            properties: roleProperties,
            required: roleIds,
            additionalProperties: false,
          },
        },
        required: ["plan_json", "role_decisions"],
        additionalProperties: false,
      },
    },
  };
}

function deliverableList(plan = {}) {
  const normalized = singletonObjectList(plan.deliverables);
  return Array.isArray(normalized) ? normalized : [];
}

function requiredNonemptyOutputSpecSteps(plan = {}) {
  return deliverableList(plan).flatMap((deliverable) =>
    list(deliverable?.production_steps)
      .filter((step) => !Object.keys(object(step?.output_spec)).length)
      .map((step) => ({
        deliverable_id: text(deliverable?.id) || null,
        step_id: text(step?.id) || null,
        title: text(step?.title) || null,
        purpose: text(step?.purpose) || null,
        service: text(step?.service) || null,
        capability: text(step?.capability) || null,
      })),
  );
}

function activeRolesMissingEvidence(plan = {}) {
  const decisions = object(plan.role_decisions);
  return CREATIVE_AGENCY_ROLES
    .filter((role) => {
      const decision = object(decisions[role.id]);
      return (
        text(decision.status).toUpperCase() === "ACTIVE" &&
        !list(decision.evidence).length
      );
    })
    .map((role) => role.id);
}

function executionChecklist({ plan = {}, assets = [], capabilities = [] } = {}) {
  const workflowKind = text(plan.workflow_kind).toUpperCase() || null;
  return {
    workflow_kind: workflowKind,
    selected_asset_ids: list(assets)
      .map((asset) => text(asset.asset_id || asset.id))
      .filter(Boolean),
    asset_manifest_rule:
      "Every selected_asset_id must appear exactly once in asset_manifest. Choose its evidence-backed disposition. EXCLUDE keeps the asset accounted for and may have no assignment; ASSIGNED, REFERENCE and REGENERATE require explicit assignments.",
    agency_roles: roleChecklist(workflowKind),
    agency_role_rule:
      "role_decisions must be one JSON object keyed by exact registered role_id, never an array. applies_to defines workflow eligibility, not mandatory activation. For eligible roles, choose ACTIVE when the mission actually needs that discipline; otherwise choose NOT_REQUIRED and provide a concrete decision explaining why. ACTIVE roles require decision, evidence and confidence. Every registered role must still have an explicit status.",
    active_roles_missing_evidence: activeRolesMissingEvidence(plan),
    allowed_service_capability_pairs: allowedCapabilityPairs(capabilities),
    required_nonempty_output_spec_steps: requiredNonemptyOutputSpecSteps(plan),
    production_step_rule:
      "For UNIVERSAL production steps use only an allowed_service_capability_pair. Every step requires a non-empty evidence-derived output_spec JSON object, depends_on must be a JSON array, requirements must be a JSON object, and quality_gate must be the JSON boolean true or false. For any required_nonempty_output_spec_steps entry, repair output_spec from the existing step purpose and verified context; if the step is genuinely unnecessary, remove it and repair its dependency graph instead of inventing technical defaults.",
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
    execution_checklist: executionChecklist({
      assets,
      capabilities: available_production_capabilities,
    }),
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
    "Use only service/capability pairs listed in execution_checklist.allowed_service_capability_pairs. Never invent a service, capability or provider.",
    "Account for every execution_checklist.selected_asset_ids entry exactly once in asset_manifest.",
    "Return role_decisions as one JSON object keyed by exact registered role_id, never as an array.",
    "Every production step must contain a non-empty evidence-derived output_spec JSON object.",
    "Do not invent category templates, provider prompts, provider parameters, currencies, formats, channels, audiences, styles or technical defaults.",
    "Internally explore and reject weak directions before returning one primary direction.",
    "Complete creative_review precisely. If the direction is generic, derivative, weakly evidenced or insufficiently crafted, repair it before returning rather than marking it passed.",
    "Fields defined as arrays by the contract must be JSON arrays even when there is only one item.",
    "For non-temporal workflows, production_steps are mandatory and must contain explicit registered service/capability requirements rather than downstream default recipes.",
    "Return JSON only.",
    JSON.stringify(request),
  ].join("\n");
}

function repairRequest({
  plan,
  validationError,
  mission,
  project,
  brief,
  assets,
  qualityPolicy,
  capabilities,
}) {
  return {
    task:
      "Repair this Creative Master Plan exactly once so it satisfies the canonical master-plan and decision-gate contracts without weakening or changing the creative mission.",
    transport:
      "The provider response is schema-enforced. Return the complete repaired plan without role_decisions as serialized JSON in plan_json, and return all registered agency role decisions in the separate schema-enforced role_decisions object.",
    immutable: {
      quality_policy: qualityPolicy,
      selected_assets: assets,
      available_production_capabilities: capabilities,
      mission,
      project,
      brief,
    },
    execution_checklist: executionChecklist({
      plan,
      assets,
      capabilities,
    }),
    validation_failure: {
      message: validationError?.message || String(validationError),
      validation: validationError?.validation || null,
    },
    plan,
    rules: [
      "Preserve the strongest creative thesis and evidence-backed direction; repair contract shape, missing required depth, invalid capability references and unresolved direction-level weaknesses.",
      "Satisfy every execution_checklist obligation explicitly before returning.",
      "plan_json must contain one complete valid JSON object for the repaired Creative Master Plan and must omit role_decisions because role_decisions are supplied in the separate schema-enforced field.",
      "Every field defined as an array in the Creative Master Plan must remain a JSON array, including singleton values.",
      "Every production step must contain a non-empty evidence-derived output_spec JSON object; resolve every execution_checklist.required_nonempty_output_spec_steps entry.",
      "Every ACTIVE role must contain a concrete decision and real evidence references grounded in immutable context. Change a role to NOT_REQUIRED only when the discipline is genuinely unnecessary and explain that decision concretely.",
      "creative_review.rejected_patterns must contain at least three substantive items.",
      "creative_review.craft_risks must contain at least two distinct concrete medium-specific items.",
      "creative_review.finishing_requirements must contain at least two distinct concrete finishing items.",
      "creative_review.repair_before_production must be an empty JSON array only after all direction-level repairs are actually resolved.",
      "Do not lower quality scores or thresholds merely to pass validation. Scores must truthfully describe the repaired work.",
      "Do not invent evidence, rights, assets, services, capabilities, providers, currencies, channels, formats or business facts.",
      "Use only service/capability pairs present in execution_checklist.allowed_service_capability_pairs.",
      "Do not add provider prompts, negative prompts, provider parameters or provider identities.",
    ],
  };
}

async function repairInvalidPlan({
  organization_id,
  mission,
  project,
  brief,
  assets,
  qualityPolicy,
  capabilities,
  plan,
  validationError,
  attempt = 1,
}) {
  const result = await ServiceExecutionRuntime.execute({
    organization_id,
    service_id: "ai.reasoning.execute",
    provider_id: null,
    category: "CREATIVE_DIRECTION",
    input: {
      prompt: [
        "Execute this bounded Creative Master Plan contract repair.",
        "Follow the provider-enforced Structured Output schema exactly.",
        JSON.stringify(
          repairRequest({
            plan,
            validationError,
            mission,
            project,
            brief,
            assets,
            qualityPolicy,
            capabilities,
          }),
        ),
      ].join("\n"),
      quantity: 1,
      max_output_tokens: 20000,
      response_format: repairStructuredOutputFormat(),
    },
    metadata: {
      module: "CREATIVE",
      operation: "MASTER_PLAN_CONTRACT_REPAIR_V1",
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
      bounded_contract_repair: true,
      contract_repair_attempt: attempt,
      maximum_contract_repair_attempts: MAXIMUM_CONTRACT_REPAIR_ATTEMPTS,
      contract_repair_transport: "OPENAI_STRUCTURED_OUTPUT_JSON_SCHEMA",
    },
  });

  const repaired = normalizedPlan(result);
  if (!repaired) throw new Error("CREATIVE_MASTER_PLAN_REPAIR_JSON_REQUIRED");
  return {
    // Merged onto the plan that went in rather than replacing it, so a repair that
    // returns plan_json without a section it was not asked to touch does not drop
    // that section. When the repair does return a complete plan the merge is a
    // no-op over it.
    plan: applySystemOwnedPolicy(
      normalizeUnambiguousCapabilityPairs(
        mergeCreativeRepairedPlan(plan, repaired),
        capabilities,
      ),
      qualityPolicy,
    ),
    usage: result.usage || null,
    billing: result.billing || null,
    provider: result.provider || null,
    model: result.model || null,
  };
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
      let plan = applySystemOwnedPolicy(
        normalizeUnambiguousCapabilityPairs(modelPlan, capabilities),
        qualityPolicy,
      );
      let validation;
      let decisionValidation;
      let contractRepair = null;

      // One repair attempt was not enough to satisfy this contract. The plan must
      // carry an explicit decision for all 21 registered agency roles, self-certify
      // its creative review at the quality floor, and reference only enabled
      // service/capability pairs; a single pass would fix the reported failure and
      // surface the next one, and the run then failed with that improvement thrown
      // away. Each attempt is driven by the validation failures still outstanding,
      // so a later pass addresses what the earlier one missed rather than repeating
      // it. Bounded because every attempt is a paid reasoning call, and the run
      // still fails closed when the contract is not met -- attempts buy revisions,
      // never a relaxed contract.
      for (
        let attempt = 0;
        attempt <= MAXIMUM_CONTRACT_REPAIR_ATTEMPTS;
        attempt += 1
      ) {
        try {
          ({ validation, decisionValidation } = validatePlan({
            plan,
            assets: normalizedAssets,
            capabilities,
          }));
          break;
        } catch (validationError) {
          if (attempt === MAXIMUM_CONTRACT_REPAIR_ATTEMPTS) throw validationError;
          contractRepair = await repairInvalidPlan({
            organization_id,
            mission,
            project,
            brief,
            assets: normalizedAssets,
            qualityPolicy,
            capabilities,
            plan,
            validationError,
            attempt: attempt + 1,
          });
          plan = contractRepair.plan;
        }
      }

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
        contract_repair: contractRepair
          ? {
              executed: true,
              usage: contractRepair.usage,
              billing: contractRepair.billing,
              provider: contractRepair.provider,
              model: contractRepair.model,
            }
          : {
              executed: false,
            },
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