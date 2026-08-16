import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import {
  availableProductionCapabilities,
} from "@/lib/creative/director/planner/creativeProductionCapabilities";
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
} from "@/lib/creative/director/runtime/mergeCreativeRepairedPlan";
import {
  CreativeWorkflowRegistry,
} from "@/lib/creative/director/registry/CreativeWorkflowRegistry";
import {
  unaccountedSelectedAssetIds,
} from "@/lib/creative/director/planner/creativeAssetManifestGap";
import {
  rightsEvidenceGap,
} from "@/lib/creative/director/planner/creativeRightsEvidenceGap";
import {
  applyDerivedRoleDecisions,
} from "@/lib/creative/director/planner/creativeRoleDecisionDefaults";

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
    // Withheld here for the same reason as the temporal path: never read, and the hashed storage path
    // inside it is where a director mines ids it then cannot resolve.
    rights: asset.rights || asset.metadata?.rights || {},
    consent: asset.consent || asset.metadata?.consent || {},
    restrictions: asset.restrictions || asset.metadata?.restrictions || {},
  };
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

// The repair transport asks for the plan in plan_json and the role decisions in a
// separate schema-enforced field. Requiring both meant a repair that put its role
// decisions inside plan_json -- or returned plan_json alone -- yielded null here,
// and the caller then fell back to treating the transport wrapper as the plan. The
// repair became a silent no-op: the plan was left exactly as it was and the next
// validation reported the same failures, so a repair budget of two attempts
// changed nothing at all.
//
// A parsed plan_json is enough. Role decisions come from the separate field when it
// has them and from inside the parsed plan otherwise, so either shape lands.
function structuredRepairPlan(parsed = {}) {
  const planJson = text(parsed?.plan_json);
  if (!planJson) return null;

  const plan = parseJson(planJson);
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) return null;

  const separate = object(parsed?.role_decisions);
  const embedded = object(plan.role_decisions);
  const roleDecisions = Object.keys(separate).length ? separate : embedded;

  return {
    ...plan,
    role_decisions: roleDecisions,
  };
}

// A plan is recognised by its shape rather than by the key it arrives under. The
// unwrapping used to be a fixed list of names -- result, plan,
// common_plan_contract -- so a model that wrapped its answer under any other key
// fell through to the wrapper itself. The wrapper became the plan, and validation
// reported WORKFLOW_KIND_INVALID together with every concept field missing and the
// asset manifest unaccounted: the signature of an empty top level, not of a model
// that ignored the contract.
//
// workflow_kind alone is too weak a signal, because the contract echoed back in a
// response also carries it -- operative_workflow has one, and so does every entry
// in workflow_contracts. A real plan additionally carries at least one section only
// a plan has. Direct children are checked before descending so the outermost match
// wins.
const PLAN_SECTIONS = ["concept", "role_decisions", "deliverables", "scenes", "story"];

// Sections that identify a plan arriving through the plan_json transport. Wider than PLAN_SECTIONS
// because there is no ambiguity to guard against here: the model was asked for the plan in this field,
// so anything plan-shaped in it is the plan. PLAN_SECTIONS stays narrow and keeps requiring
// workflow_kind, because findPlan searches a whole response where a contract echo can look plan-like.
const TRANSPORT_PLAN_SECTIONS = [
  "concept",
  "role_decisions",
  "deliverables",
  "scenes",
  "story",
  "asset_manifest",
  "creative_review",
  "production",
];

function looksLikePlan(value) {
  const candidate = object(value);
  if (!candidate.workflow_kind) return false;
  return PLAN_SECTIONS.some((section) => candidate[section] != null);
}

function findPlan(value, depth = 0) {
  const candidate = object(value);
  if (looksLikePlan(candidate)) return candidate;
  if (depth > 4) return null;

  const nested = Object.values(candidate).filter(
    (entry) => entry && typeof entry === "object" && !Array.isArray(entry),
  );
  for (const entry of nested) {
    if (looksLikePlan(entry)) return entry;
  }
  for (const entry of nested) {
    const found = findPlan(entry, depth + 1);
    if (found) return found;
  }
  return null;
}

function normalizedPlan(result) {
  const output = result?.output?.output || result?.output || result || {};
  const parsed = parseJson(output.text || output.content || output);
  const repairedTransport = structuredRepairPlan(parsed);
  // The parsed value is still the last resort, so a response that genuinely has no
  // plan in it fails validation with its real failures rather than disappearing.
  // plan_json is where the model was told to put the plan, so a parsed one wins on being plan-shaped
  // rather than on carrying one particular field.
  //
  // This gate was object(repairedTransport).workflow_kind. A still returned a complete plan inside
  // plan_json -- title, thesis, signature device, refused devices, asset manifest, creative review --
  // with workflow_kind under operative_workflow instead of at the top level, echoing the shape of the
  // request. The whole plan was therefore discarded in favour of the transport envelope, whose only
  // concept was a stub, and validation reported eight absent concept fields and an unaccounted manifest.
  // One misplaced field became eight false ones, and the real fault was invisible in the report.
  const transportPlan = object(repairedTransport);
  const plan = TRANSPORT_PLAN_SECTIONS.some((section) => transportPlan[section] != null)
    ? repairedTransport
    : findPlan(parsed) || parsed;
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
    // Naming the ids actually missing, rather than restating the rule. Manifest
    // completeness is the most persistent failure this contract produces, and it
    // survived repair attempts that were handed the rule and the full id list but never
    // the difference between them. Which ids are absent is mechanically knowable, so it
    // is computed rather than left for the model to work out -- the same approach
    // already used for roles missing evidence and steps missing an output spec.
    //
    // Only the omission is supplied. The disposition for each remains a creative
    // decision and is not chosen here.
    unaccounted_selected_asset_ids: unaccountedSelectedAssetIds(plan, assets),
    // What is on file for rights and consent, so the plan can state an honest position instead of
    // choosing between asserting rights it cannot evidence and saying nothing.
    ...rightsEvidenceGap(assets),
    rights_position_rule:
      "State the rights position for the selected assets explicitly. Where a rights or consent record is absent, say so and say what that permits -- internal review, a named channel, a hold pending clearance -- rather than asserting verified rights or omitting the subject. Never invent a right, a consent, a licence or a release.",
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

// The request hands over the contracts for all seven registered workflows and left
// the model to work out which one governed the job. For temporal work that meant
// the mandatory story and scenes sections went unmentioned as requirements, and
// plans came back with the common sections complete and every story field plus
// scenes absent -- the validator then rejected them on nine REQUIRED_TEXT_MISSING
// failures and SCENES_REQUIRED.
//
// The workflow is usually already knowable before the call: the project or brief
// declares it, and the registry maps declarations like VIDEO or IMAGE onto a
// registered kind. Resolving it here lets the request name the operative contract
// and its required sections instead of implying them.
//
// Resolution is registry-driven and non-throwing. An unrecognised declaration
// yields null and the model chooses from the full contract exactly as before, so
// this only ever adds guidance -- it never invents a workflow or narrows the
// contract on a guess.
function operativeWorkflow({ project = {}, brief = {} } = {}) {
  const candidates = [
    brief.workflow_kind,
    brief.creative_medium,
    project.metadata?.workflow_kind,
    project.metadata?.creative_medium,
    project.production_type,
  ];

  for (const candidate of candidates) {
    const resolved = CreativeWorkflowRegistry.resolveAlias(candidate);
    if (!resolved) continue;
    return {
      workflow_kind: resolved.workflow_kind,
      declared_as: resolved.declared_value,
      contract: CreativeMasterPlanContractRegistry.getWorkflowContract(
        resolved.workflow_kind,
      ),
    };
  }

  return null;
}

function decisionRequest({
  mission,
  project,
  brief,
  assets,
  quality_policy,
  available_production_capabilities,
  unexecutable_services = [],
}) {
  const operative = operativeWorkflow({ project, brief });
  return {
    // Scoped to the workflow that governs when it is known. The other six contracts were forty per
    // cent of this request and described media the job is not in.
    contract: CreativeMasterPlanContractRegistry.buildDecisionContract(
      operative?.workflow_kind || null,
    ),
    operative_workflow: operative,
    unexecutable_services,
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

// When the operative workflow is already known, say so and name the sections its
// contract makes mandatory. Left to infer this from a bundle of seven workflow
// contracts, plans came back missing the workflow-specific sections entirely.
function operativeWorkflowInstructions(request) {
  const operative = request?.operative_workflow;
  if (!operative?.workflow_kind) return [];

  const required = Array.isArray(operative.contract?.required_sections)
    ? operative.contract.required_sections.filter(Boolean)
    : [];

  const executor = text(operative.contract?.executor);

  return [
    `This job's workflow_kind is ${operative.workflow_kind}, declared as ${operative.declared_as}. Return exactly that workflow_kind. Only the other six workflow contracts are context; operative_workflow.contract is the one that governs.`,
    // Naming the operative contract without this line invited the model to treat it
    // as the entire specification and drop the common sections: a still case came
    // back missing concept.creative_system, which lives in common_plan_contract and
    // is required for every workflow.
    "contract.common_plan_contract applies in full to every workflow, including this one. Complete every section it defines -- concept above all -- and treat the operative workflow contract as additional requirements on top of it, never as a replacement for it.",
    required.length
      ? `The ${operative.workflow_kind} contract additionally makes these sections mandatory and complete: ${required.join(", ")}. A plan missing any of them is invalid, so populate every field the contract defines for each.`
      : null,
    executor === "UNIVERSAL"
      ? "This workflow executes on the universal capability graph, so every deliverable requires a non-empty production_steps array naming registered service/capability pairs. A deliverable with no production steps is invalid."
      : null,
  ].filter(Boolean);
}

// Naming the services the organization has enabled but cannot execute is more
// useful than leaving them out entirely: a director reaching for an obvious
// capability for the brief -- sound effects for a sound package -- otherwise plans
// against it and loses the whole plan at the decision gate.
function unexecutableServiceInstructions(request) {
  const unexecutable = Array.isArray(request?.unexecutable_services)
    ? request.unexecutable_services.filter((entry) => entry?.service_id)
    : [];
  if (!unexecutable.length) return [];

  const names = unexecutable.map((entry) => entry.service_id).join(", ");
  return [
    `These services are enabled for the organization but cannot be executed and are deliberately absent from the allowed pairs: ${names}. Do not reference them in any production step. Achieve the intent with an allowed pair, or state in the plan that the deliverable requires a capability the organization cannot currently execute.`,
  ];
}

function serializeForReasoning(request) {
  return [
    "Execute the supplied Creative Master Plan decision contract.",
    ...operativeWorkflowInstructions(request),
    "Return exactly one strict JSON object representing the final accountable master plan.",
    // A still returned its workflow_kind inside operative_workflow, echoing the request, and left the
    // top level without one. That is a single misplaced field, but it also made the plan unrecognisable
    // to the transport unwrapper, which fell back to the envelope and reported every concept field as
    // absent instead.
    "workflow_kind must be a top-level key of the plan you return. operative_workflow in the request is context describing the job; echoing it back is not the same as declaring workflow_kind, and a plan without one at the top level is invalid.",
    "Treat the attached contract and verified context as the only source of creative ontology, production capabilities and constraints.",
    "The quality policy is system-owned and immutable. Design under it; do not reinterpret, lower, replace or negotiate it.",
    "Use only service/capability pairs listed in execution_checklist.allowed_service_capability_pairs. Never invent a service, capability or provider.",
    ...unexecutableServiceInstructions(request),
    // This asked for "a manifest entry with an evidence-backed disposition" and got exactly that: an id
    // and a disposition, with reason, confidence and assignments all null on every entry. Six assets
    // produced eighteen failures for fields the instruction never named. Naming them costs one line.
    "Account for every execution_checklist.selected_asset_ids entry exactly once in asset_manifest. When execution_checklist.unaccounted_selected_asset_ids is non-empty those exact ids are the ones currently missing: add an entry for each. Every entry needs all of asset_id, disposition, a reason of real substance, confidence as a number from 0 to 100, and assignments listing the deliverable ids it serves -- assignments may be empty only for EXCLUDE. An entry carrying only an id and a disposition is incomplete.",
    // Every temporal film so far mined ids out of asset payloads: a hashed storage filename used as a
    // PRIMARY_SOURCE on 29 shots of one film, for an asset it had already named correctly elsewhere.
    // The universal path lists the ids but never said what is not one.
    "execution_checklist.selected_asset_ids holds the only asset ids that exist. Copy them character for character and reference no other value as an asset id: a checksum, a hashed storage path, a file name and any other field of an asset payload are not its id.",
    "Return role_decisions as one JSON object keyed by exact registered role_id, never as an array.",
    "Every production step must contain a non-empty evidence-derived output_spec JSON object.",
    // A still asked ai.image.generate to replicate the neon CC sign and the metallic CC logo, named both
    // in its continuity anchors, and included no step that composites either from source. Two independent
    // reviewers failed it for neon colour fidelity and halo artifacts, correctly: a generated brand mark is
    // approximately the right colour with nearly the right edges, which is how a logo reads as counterfeit.
    "Any mark whose exact appearance is the point -- a logo, wordmark, neon sign, signage, exact text, a product's own geometry -- must be composited or placed from its source asset by a named production step, and the generating step must be instructed to leave room for it rather than to reproduce it. State which marks are composited, which step does it, and what the generated layer omits. Naming a mark in continuity_anchors and then generating it is not fidelity. If execution_checklist.allowed_service_capability_pairs contains no capability that can composite or place a layer, do not plan the step and do not generate the mark as though the limitation were absent: name the marks that cannot be reproduced faithfully, name the missing capability, and put it in creative_review.repair_before_production.",
    "Do not invent category templates, provider prompts, provider parameters, currencies, formats, channels, audiences, styles or technical defaults.",
    "Internally explore and reject weak directions before returning one primary direction.",
    "Complete creative_review precisely. If the direction is generic, derivative, weakly evidenced or insufficiently crafted, repair it before returning rather than marking it passed.",
    "Fields defined as arrays by the contract must be JSON arrays even when there is only one item.",
    // This path produces temporal plans too. A new video project has no master plan yet, so the routed
    // pipeline resolves no master and materializeDirection falls back here, and the result is then validated
    // by the temporal rules -- which demand per-shot safety arrays and reject a blank. Those two
    // requirements were written into the temporal runtime's own prompt and never into this one, so an eight
    // second clip came back with negative_constraints, known_failure_modes and repair_instructions absent on
    // every shot, "Balanced." for a lighting contrast and "None." for a focus transition.
    "When you return scenes and shots, every shot needs negative_constraints, known_failure_modes and repair_instructions, each holding at least one real entry specific to that shot. Never return them empty.",
    "State absence as a decision, never as a blank. \"none\", \"N/A\" and an empty string are rejected, and so are bare adjectives like \"balanced\" or \"natural\". A locked-off frame has no movement path and the way to say so is to say it: \"locked off on sticks, the frame does not move for the whole shot\". A shot with no props says \"no props, the bare doorway is the point\". Absence is often the strongest choice available and this is how you make it.",
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
  attempt = 1,
}) {
  return {
    // The budget is no longer a single attempt, and telling the model this is its
    // only pass while a second one follows misrepresents the process. validation
    // re-runs between attempts, so validation_failure below is always the set still
    // outstanding rather than the original list.
    task: `Repair this Creative Master Plan so it satisfies the canonical master-plan and decision-gate contracts without weakening or changing the creative mission. This is repair attempt ${attempt} of at most ${MAXIMUM_CONTRACT_REPAIR_ATTEMPTS}; resolve every listed failure now rather than deferring any of them to a later attempt.`,
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
            attempt,
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
  const merged = mergeCreativeRepairedPlan(plan, repaired);
  return {
    // Merged onto the plan that went in rather than replacing it, so a repair that
    // returns plan_json without a section it was not asked to touch does not drop
    // that section. When the repair does return a complete plan the merge is a
    // no-op over it.
    plan: applyDerivedRoleDecisions(
      applySystemOwnedPolicy(
        normalizeUnambiguousCapabilityPairs(merged, capabilities),
        qualityPolicy,
      ),
      CREATIVE_AGENCY_ROLES,
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

    const [qualityPolicy, capabilityContext] = await Promise.all([
      Promise.resolve(qualityPolicyFor(project, brief)),
      availableProductionCapabilities(organization_id),
    ]);
    const capabilities = capabilityContext.capabilities;
    const normalizedAssets = list(assets).map(assetIdentity);
    const request = decisionRequest({
      mission,
      project,
      brief,
      assets: normalizedAssets,
      quality_policy: qualityPolicy,
      available_production_capabilities: capabilities,
      unexecutable_services: capabilityContext.unexecutable,
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
      let plan = applyDerivedRoleDecisions(
        applySystemOwnedPolicy(
          normalizeUnambiguousCapabilityPairs(modelPlan, capabilities),
          qualityPolicy,
        ),
        CREATIVE_AGENCY_ROLES,
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
          if (attempt === MAXIMUM_CONTRACT_REPAIR_ATTEMPTS) {
            // The plan travels with the failure so rejected direction is still readable rather than
            // reduced to the reason it was refused.
            validationError.rejected_plan = plan;
            throw validationError;
          }
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
