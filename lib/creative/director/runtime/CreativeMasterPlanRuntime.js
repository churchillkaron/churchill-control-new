import { createHash } from "node:crypto";

import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import {
  availableProductionCapabilities,
} from "@/lib/creative/director/planner/creativeProductionCapabilities";
import {
  CREATIVE_MASTER_PLAN_ROLES,
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

const MAXIMUM_CONTRACT_REPAIR_ATTEMPTS = 3;

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
  CREATIVE_MASTER_PLAN_ROLES.map((role) => role.id),
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

const MASTER_PLAN_TRANSPORT_TEXT_LIMIT = 240;

function compactInstructionText(value, limit = MASTER_PLAN_TRANSPORT_TEXT_LIMIT) {
  const source = text(value).replace(/\s+/g, " ");
  if (!source || source.length <= limit) return source;
  const sentences = source.split(/(?<=[.!?])\s+/).filter(Boolean);
  const selected = [];
  let used = 0;
  for (const sentence of sentences) {
    const next = sentence.length + (selected.length ? 1 : 0);
    if (selected.length >= 1 || used + next > limit) break;
    selected.push(sentence);
    used += next;
  }
  if (selected.length) return selected.join(" ").slice(0, limit);
  return source.slice(0, limit);
}

function compactContractForReasoning(contract = {}, workflowKind = null) {
  const compactNode = (value) => {
    if (typeof value === "string") return compactInstructionText(value);
    if (Array.isArray(value)) return value.map(compactNode);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, compactNode(child)]),
    );
  };
  const operative = text(workflowKind).toUpperCase();
  const workflowContracts = list(contract.workflow_contracts).filter((entry) =>
    !operative || text(entry?.workflow_kind).toUpperCase() === operative
  );
  return compactNode({
    contract: contract.contract,
    common_plan_contract: contract.common_plan_contract,
    pre_return_excellence_gate: contract.pre_return_excellence_gate,
    direction_review_dimensions: contract.direction_review_dimensions,
    workflow_contracts: workflowContracts,
    global_rules: contract.global_rules,
  });
}

function compactAgencyRoleSchemaForReasoning() {
  const canonical = creativeAgencyDecisionSchema();
  const exemplar = object(canonical[CREATIVE_MASTER_PLAN_ROLES[0]?.id]);
  return {
    decision_record_contract: {
      status: compactInstructionText(exemplar.status),
      decision: compactInstructionText(exemplar.decision),
      evidence: compactInstructionText(exemplar.evidence),
      confidence: compactInstructionText(exemplar.confidence),
      risks: compactInstructionText(exemplar.risks),
      repair_instructions: compactInstructionText(exemplar.repair_instructions),
    },
    roles: Object.fromEntries(
      CREATIVE_MASTER_PLAN_ROLES.map((role) => [role.id, {
        mandate: compactInstructionText(role.mandate),
        applies_to: [...role.applies_to],
      }]),
    ),
    output_shape:
      "role_decisions must be one object keyed by every exact role id above; each value follows decision_record_contract.",
  };
}

const PROVIDER_TRANSPORT_PLAN_KEYS = new Set([
  "prompt",
  "provider_prompt",
  "negative_prompt",
  "visual_prompt",
  "video_prompt",
  "provider_parameters",
]);

function stripProviderTransportDetails(value) {
  if (Array.isArray(value)) return value.map(stripProviderTransportDetails);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !PROVIDER_TRANSPORT_PLAN_KEYS.has(key))
      .map(([key, child]) => [key, stripProviderTransportDetails(child)]),
  );
}

function parseJson(value) {
  if (value && typeof value === "object") return value;
  const source = String(value || "").trim();
  if (!source) return null;

  try {
    return JSON.parse(source);
  } catch {
    // Structured-output transports occasionally append a harmless delimiter after
    // an otherwise-complete JSON object. Recover only the first complete top-level
    // JSON value; never invent or close missing structure. Truncated JSON still fails.
    const opener = source[0];
    const closer = opener === "{" ? "}" : opener === "[" ? "]" : null;
    if (!closer) return null;

    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = 0; index < source.length; index += 1) {
      const char = source[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') {
        inString = true;
        continue;
      }
      if (char === opener) depth += 1;
      else if (char === closer) depth -= 1;
      if (depth === 0) {
        const suffix = source.slice(index + 1).trim();
        if (suffix && !/^[}\]]+$/.test(suffix)) return null;
        try {
          return JSON.parse(source.slice(0, index + 1));
        } catch {
          return null;
        }
      }
    }
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

export function preserveStrongRoleDecisionPatches(basePlan = {}, repairedPlan = {}) {
  const baseRoles = object(basePlan.role_decisions);
  const repairedRoles = object(repairedPlan.role_decisions);
  if (!Object.keys(repairedRoles).length) {
    if (
      repairedPlan.role_decisions !== undefined &&
      Object.keys(baseRoles).length
    ) {
      const { role_decisions: _invalidRepairRoles, ...withoutInvalidRoles } = repairedPlan;
      return withoutInvalidRoles;
    }
    return repairedPlan;
  }

  const nextRoles = {};
  for (const [roleId, repairedRole] of Object.entries(repairedRoles)) {
    const baseRole = object(baseRoles[roleId]);
    const baseDecision = text(baseRole.decision);

    // Owned and fallback reasoning transports can occasionally collapse a strict
    // role-decision object to the enum token itself ("ACTIVE" / "NOT_REQUIRED").
    // That token is transport evidence, not a creative decision. Never let it
    // overwrite a structured decision that already survived validation, and never
    // promote it into plan state when no structured decision exists yet. Leaving
    // the role absent keeps the real contract failure visible so the next bounded
    // repair is asked for the missing decision instead of validating corrupted state.
    if (typeof repairedRole === "string") {
      const scalarStatus = text(repairedRole).toUpperCase();
      if (["ACTIVE", "NOT_REQUIRED"].includes(scalarStatus)) {
        if (baseDecision.length >= 20) nextRoles[roleId] = baseRole;
        continue;
      }
    }

    const patchRole = object(repairedRole);
    const patchDecision = text(patchRole.decision).toUpperCase();
    const transportPlaceholder =
      !text(patchRole.status) && ["ACTIVE", "NOT_REQUIRED"].includes(patchDecision);
    if (transportPlaceholder) {
      if (baseDecision.length >= 20) nextRoles[roleId] = baseRole;
      continue;
    }

    if (Object.keys(patchRole).length) nextRoles[roleId] = repairedRole;
  }

  if (!Object.keys(nextRoles).length) {
    const { role_decisions: _discardedTransportPlaceholders, ...withoutRoles } = repairedPlan;
    return withoutRoles;
  }
  return { ...repairedPlan, role_decisions: nextRoles };
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
  const planJson = parsed?.plan_json;
  if (planJson == null || planJson === "") return null;

  const plan = parseJson(planJson);
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) return null;

  const separate = object(parsed?.role_decisions);
  const embedded = object(plan.role_decisions);
  // Structured-output transports may return only the roles repaired in the
  // dedicated role_decisions field while plan_json carries the complete role
  // map. Replacing embedded with any non-empty separate object silently drops
  // valid decisions. Merge both, with explicit transport repairs winning only
  // for the role ids they actually contain.
  const roleDecisions = {
    ...embedded,
    ...separate,
  };

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

function masterPlanProviderPayload(result = {}) {
  const candidates = [
    result?.output?.raw?.output,
    result?.output?.raw,
    result?.output?.output,
    result?.output,
    result,
  ];
  for (const candidate of candidates) {
    if (candidate == null) continue;
    if (typeof candidate === "string") return candidate;
    if (typeof candidate !== "object" || Array.isArray(candidate)) continue;
    if (candidate.text != null) return candidate.text;
    if (candidate.content != null) return candidate.content;
    if (candidate.plan_json != null || candidate.workflow_kind != null || candidate.concept != null) return candidate;
  }
  return result;
}

function normalizedPlan(result, { patch = false } = {}) {
  const output = result?.output || result || {};
  const raw = object(output.raw || result?.raw);
  const rawOutput = raw?.output || raw?.result?.output || null;
  const parsed = parseJson(
    rawOutput?.text ||
    rawOutput?.content ||
    rawOutput ||
    output.text ||
    output.content ||
    output,
  );
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

  const normalizedBindings = normalizeUnambiguousAssetAssignments(
    stripProviderTransportDetails(plan),
  );
  const commonPlan = object(normalizedBindings.common_plan_contract);
  const storyArchitecture = object(normalizedBindings.story_architecture);
  const promotedSections = { ...normalizedBindings };
  for (const section of ["concept", "creative_review", "deliverables", "asset_manifest", "story", "production", "scenes", "role_decisions", "quality"]) {
    if (promotedSections[section] == null && commonPlan[section] != null) {
      promotedSections[section] = commonPlan[section];
    }
  }
  // Temporal providers may correctly place the authored excerpt under
  // story_architecture while the canonical validator consumes top-level story/scenes.
  // Promote those sections rather than treating a structurally valid nested plan as
  // scene-less and then burning contract-repair budget on false asset failures.
  if (promotedSections.story == null && storyArchitecture.story != null) {
    promotedSections.story = storyArchitecture.story;
  }
  if (promotedSections.scenes == null && storyArchitecture.scenes != null) {
    promotedSections.scenes = storyArchitecture.scenes;
  }

  const concept = object(promotedSections.concept);
  const operativeWorkflow = object(promotedSections.operative_workflow);
  const promotedConcept = {
    ...Object.fromEntries(
      [
        "title",
        "creative_thesis",
        "hook",
        "message",
        "narrative",
        "creative_system",
        "visual_system",
        "emotional_promise",
        "call_to_action",
        "signature_device",
        "refused_devices",
      ]
        .filter((field) => concept[field] == null && normalizedBindings[field] != null)
        .map((field) => [field, normalizedBindings[field]]),
    ),
    ...concept,
  };

  const normalized = {
    ...promotedSections,
  };

  const workflowKind = promotedSections.workflow_kind || operativeWorkflow.workflow_kind || null;
  if (!patch || workflowKind) normalized.workflow_kind = workflowKind;

  if (!patch || promotedSections.asset_manifest !== undefined) {
    normalized.asset_manifest = singletonObjectList(promotedSections.asset_manifest);
  }
  if (!patch || promotedSections.deliverables !== undefined) {
    normalized.deliverables = singletonObjectList(promotedSections.deliverables);
  }
  if (!patch || promotedSections.role_decisions !== undefined) {
    normalized.role_decisions = normalizeRoleDecisions(promotedSections.role_decisions);
  }

  const hasConceptPatch = promotedSections.concept !== undefined || commonPlan.concept !== undefined;
  if (!patch || hasConceptPatch) {
    normalized.concept = {
      ...promotedConcept,
      ...((!patch || promotedConcept.creative_system || promotedConcept.visual_system)
        ? {
            creative_system: promotedConcept.creative_system || promotedConcept.visual_system || null,
            visual_system: promotedConcept.visual_system || promotedConcept.creative_system || null,
          }
        : {}),
    };
  }

  return stripProviderTransportDetails(normalized);
}

function audienceDepthText(value, depth = 0) {
  if (value == null || depth > 5) return "";
  if (["string", "number", "boolean"].includes(typeof value)) return text(value);
  if (Array.isArray(value)) return value.map((entry) => audienceDepthText(entry, depth + 1)).filter(Boolean).join(" ");
  if (typeof value === "object") return Object.values(value).map((entry) => audienceDepthText(entry, depth + 1)).filter(Boolean).join(" ");
  return "";
}

function applyAuthoritativeBriefAudience(plan = {}, brief = {}) {
  const concept = object(plan.concept);
  if (audienceDepthText(concept.target_audience).length >= 60) return plan;

  const briefAudience = brief?.target_audience;
  const primary = typeof briefAudience === "string"
    ? text(briefAudience)
    : text(object(briefAudience).primary);
  const businessTruth = text(brief?.business_goal || brief?.creative_objective);
  if (!primary || !businessTruth) return plan;

  return {
    ...plan,
    concept: {
      ...concept,
      target_audience: {
        ...(typeof concept.target_audience === "object" ? object(concept.target_audience) : {}),
        primary,
        business_truth: businessTruth,
        derived_from_authoritative_brief: true,
      },
    },
  };
}

function normalizeLegacyCreativeReviewContract(plan = {}) {
  const review = object(plan.creative_review);
  const evidence = [
    ...list(review.repair_instructions),
    ...list(review.craft_risks),
    ...list(review.finishing_requirements),
  ].map(text).filter((entry) => entry.length >= 40);
  const existingFinishing = list(review.finishing_requirements).map(text).filter(Boolean);
  const derivedFinishing = existingFinishing.length >= 2
    ? existingFinishing
    : evidence.slice(0, 2);
  const weakestLink = text(review.weakest_link) || evidence[0] || "";
  if (derivedFinishing.length < 2 && !weakestLink) return plan;
  return {
    ...plan,
    creative_review: {
      ...review,
      ...(derivedFinishing.length >= 2 ? {
        finishing_requirements: derivedFinishing,
        ...(existingFinishing.length < 2 ? { finishing_requirements_derived_from_legacy_review: true } : {}),
      } : {}),
      ...(weakestLink && !text(review.weakest_link) ? {
        weakest_link: weakestLink,
        weakest_link_derived_from_existing_review: true,
      } : {}),
    },
  };
}

function applySystemOwnedPolicy(plan = {}, qualityPolicy = {}, brief = {}) {
  return {
    ...normalizeLegacyCreativeReviewContract(applyAuthoritativeBriefAudience(plan, brief)),
    quality: {
      ...qualityPolicy,
    },
  };
}

function applySemanticMissionContract(plan = {}, { mission = {}, project = {}, brief = {} } = {}) {
  return {
    ...plan,
    semantic_mission_contract: semanticMissionContractSnapshot({ mission, project, brief }),
  };
}

function normalizeLegacyDeliverableContract(deliverable = {}) {
  const current = object(deliverable);
  const type = text(current.type);
  const title = text(current.title);
  const format = text(current.format);
  const resolution = text(current.resolution);
  const duration = finite(current.duration);
  const deliveryPath = text(current.delivery_path);
  const hasPurpose = Boolean(text(current.purpose));
  const existingOutputSpec = object(current.output_spec);
  const canDerive = Boolean(type && title && (format || resolution || duration !== null || deliveryPath));
  if (!canDerive || (hasPurpose && Object.keys(existingOutputSpec).length)) return current;

  const details = [
    format ? `${format} format` : null,
    resolution ? `${resolution} master` : null,
    duration !== null ? `${duration}-second duration` : null,
  ].filter(Boolean).join(', ');

  return {
    ...current,
    ...(!hasPurpose
      ? { purpose: `Deliver the final ${title}${details ? ` as a ${details}` : ''} for the approved creative mission.` }
      : {}),
    ...(Object.keys(existingOutputSpec).length
      ? {}
      : {
          output_spec: {
            type,
            ...(format ? { format } : {}),
            ...(resolution ? { resolution } : {}),
            ...(duration !== null ? { duration_seconds: duration } : {}),
            ...(deliveryPath ? { delivery_path: deliveryPath } : {}),
            derived_from_legacy_deliverable_contract: true,
          },
        }),
  };
}

function normalizeUnambiguousCapabilityPairs(plan = {}, capabilities = []) {
  const byService = new Map(
    list(capabilities).map((service) => [
      text(service.service_id),
      list(service.capabilities).map(text).filter(Boolean),
    ]),
  );
  const servicesByCapability = new Map();
  for (const [serviceId, serviceCapabilities] of byService.entries()) {
    for (const capabilityId of serviceCapabilities) {
      const matches = servicesByCapability.get(capabilityId) || [];
      matches.push(serviceId);
      servicesByCapability.set(capabilityId, matches);
    }
  }

  const normalizeStep = (step) => {
    if (!step || typeof step !== "object" || Array.isArray(step)) {
      return step;
    }

    const serviceId = text(step.service);
    const capabilityId = text(step.capability);
    const allowed = byService.get(serviceId);

    if (!capabilityId) return step;

    if (allowed?.includes(capabilityId)) return step;

    if (allowed?.length === 1) {
      return {
        ...step,
        capability: allowed[0],
      };
    }

    const capabilityServices = servicesByCapability.get(capabilityId) || [];
    if ((!allowed || !serviceId) && capabilityServices.length === 1) {
      return {
        ...step,
        service: capabilityServices[0],
      };
    }

    return step;
  };

  const normalized = {
    ...plan,
  };

  if (Array.isArray(plan.deliverables)) {
    normalized.deliverables = plan.deliverables.map((deliverable) => {
      const upgraded = normalizeLegacyDeliverableContract(deliverable);
      return {
        ...upgraded,
        production_steps: Array.isArray(upgraded?.production_steps)
          ? upgraded.production_steps.map(normalizeStep)
          : upgraded?.production_steps,
      };
    });
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

function clearResolvedCapabilityRepair(plan = {}, capabilities = []) {
  const review = object(plan.creative_review);
  const repairs = Array.isArray(review.repair_before_production)
    ? review.repair_before_production.map(text).filter(Boolean)
    : [text(review.repair_before_production)].filter(Boolean);
  if (!repairs.length) return plan;

  const availablePairs = new Set(
    list(capabilities).flatMap((service) =>
      list(service.capabilities).map((capability) => `${text(service.service_id)}::${text(capability)}`),
    ),
  );
  const steps = [
    ...list(plan.deliverables).flatMap((deliverable) => list(deliverable?.production_steps)),
    ...list(plan.production?.cross_deliverable_steps),
    ...list(plan.scenes).flatMap((scene) => list(scene?.shots).map((shot) => shot?.generation)),
  ].filter(Boolean);

  const unresolvedPair = steps.some((step) => {
    const serviceId = text(step?.service);
    const capabilityId = text(step?.capability);
    return serviceId && capabilityId && !availablePairs.has(`${serviceId}::${capabilityId}`);
  });
  if (unresolvedPair) return plan;

  const capabilityOnly = repairs.every((repair) => {
    const value = text(repair).toLowerCase();
    return value.includes('capability') && (value.includes('missing') || value.includes('not listed') || value.includes('not available') || value.includes('requires'));
  });
  if (!capabilityOnly) return plan;

  return {
    ...plan,
    creative_review: {
      ...review,
      repair_before_production: [],
    },
  };
}

const CONCEPT_RESTART_FAILURE_CODES = Object.freeze([
  "SEMANTIC_CORE_MECHANISM_NOT_DRAMATIZED",
  "SEMANTIC_TECHNOLOGY_FUTURE_LANGUAGE_MISSING",
  "CREATIVE_WORLD_CLASS_CONCEPT_BASELINE_FAILED",
]);

function conceptRestartRequired(error) {
  const message = text(error?.message || error);
  return CONCEPT_RESTART_FAILURE_CODES.some((code) => message.includes(code));
}

function validatePlan({ plan, assets, capabilities }) {
  const validation = assertCreativeMasterPlan({
    plan,
    assets,
    require_temporal_direction: false,
  });
  const decisionValidation = assertCreativeMasterPlanDecision({
    plan,
    available_capabilities: capabilities,
    require_temporal_council: false,
    require_temporal_direction: false,
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
  return CREATIVE_MASTER_PLAN_ROLES.map((role) => ({
    role_id: role.id,
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

function strictMasterStorySchema() {
  return {
    type: "object",
    properties: {
      beginning: { type: "string" },
      middle: { type: "string" },
      payoff: { type: "string" },
      chapters: {
        type: "array",
        minItems: 2,
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            narrative_role: { type: "string" },
            story_progression: { type: "string" },
            emotional_progression: { type: "string" },
            transition_to_next: { type: "string" },
          },
          required: [
            "id",
            "title",
            "narrative_role",
            "story_progression",
            "emotional_progression",
            "transition_to_next",
          ],
          additionalProperties: false,
        },
      },
    },
    required: ["beginning", "middle", "payoff", "chapters"],
    additionalProperties: false,
  };
}

function repairStructuredOutputFormat() {
  const roleProperties = Object.fromEntries(
    CREATIVE_MASTER_PLAN_ROLES.map((role) => [
      role.id,
      strictRoleDecisionSchema(role),
    ]),
  );
  const roleIds = CREATIVE_MASTER_PLAN_ROLES.map((role) => role.id);
  const properties = {
    plan_json: {
      type: "string",
      description:
        "Repair patch serialized as one valid JSON object string. Return only top-level keys that must change to resolve the supplied validation failures; omitted keys retain their reviewed values. Do not include role_decisions inside this string; role_decisions are returned separately in the schema-enforced field.",
    },
    role_decisions: {
      type: "object",
      properties: roleProperties,
      required: roleIds,
      additionalProperties: false,
    },
    master_story: {
      anyOf: [strictMasterStorySchema(), { type: "null" }],
      description:
        "Complete full-work story architecture when immutable.semantic_mission_contract.master_story_required=true; otherwise return null. The master story describes the whole requested work while plan_json top-level scenes remain scoped to the current generation excerpt/chapter.",
    },
  };

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
              "Repair patch serialized as one valid JSON object string. Return only top-level keys that must change to resolve the supplied validation failures; omitted keys retain their reviewed values. Do not include role_decisions inside this string; role_decisions are returned separately in the schema-enforced field.",
          },
          role_decisions: {
            type: "object",
            description:
              "Repair only role decisions named by the supplied validation failures. When no role decision failed, return an empty object so the repair budget stays focused on the failed plan paths; existing reviewed role decisions are preserved by merge semantics.",
            properties: roleProperties,
            required: [],
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
  return CREATIVE_MASTER_PLAN_ROLES
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
      workflowKind === "STILL"
        ? "role_decisions must be one JSON object keyed by exact registered role_id, never an array. For STILL work executive_creative_director, brand_director, art_director, production_designer and asset_intelligence_director are mandatory ACTIVE authorities and may not be NOT_REQUIRED. Governance roles quality_director, rights_safety_director and release_director are also mandatory ACTIVE. Other eligible roles may be ACTIVE or NOT_REQUIRED with a concrete reason. ACTIVE roles require decision, evidence and confidence. Every registered role must still have an explicit status."
        : "role_decisions must be one JSON object keyed by exact registered role_id, never an array. applies_to defines workflow eligibility, not mandatory activation. For eligible roles, choose ACTIVE when the mission actually needs that discipline; otherwise choose NOT_REQUIRED and provide a concrete decision explaining why. ACTIVE roles require decision, evidence and confidence. Every registered role must still have an explicit status.",
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
    const contract = CreativeMasterPlanContractRegistry.getWorkflowContract(
      resolved.workflow_kind,
    );
    return {
      workflow_kind: resolved.workflow_kind,
      declared_as: resolved.declared_value,
      required_sections: Array.isArray(contract?.required_sections)
        ? contract.required_sections
        : [],
      executor: contract?.executor || null,
    };
  }

  return null;
}

function masterPlanAssetEvidence(asset = {}) {
  const analysis = object(asset.analysis);
  const analysisKeys = [
    "summary", "description", "scene_type", "visible_subjects", "activities",
    "environments", "objects", "logos", "visible_text", "recommended_uses",
    "incompatible_uses", "semantic_fitness", "technical_quality",
    "motion_characteristics", "location_anchors", "product_anchors", "evidence",
  ];
  return {
    asset_id: asset.asset_id,
    asset_type: asset.asset_type,
    name: asset.name,
    description: asset.description,
    analysis: Object.fromEntries(
      analysisKeys
        .filter((key) => analysis[key] !== undefined && analysis[key] !== null)
        .map((key) => [key, analysis[key]]),
    ),
    tags: asset.tags,
    rights: asset.rights || {},
    consent: asset.consent || {},
    restrictions: asset.restrictions || {},
  };
}

function creativeProjectPromptSnapshot(project = {}) {
  const metadata = object(project.metadata);
  return {
    id: project.id || null,
    objective: project.objective || null,
    production_type: project.production_type || null,
    target_duration: project.target_duration ?? null,
    target_channels: project.target_channels || [],
    target_languages: project.target_languages || [],
    metadata: {
      organization_name: metadata.organization_name || null,
      organization_industry: metadata.organization_industry || null,
      selected_asset_ids: list(metadata.selected_asset_ids),
      creative_quality_policy: object(metadata.creative_quality_policy),
      semantic_quality_policy: object(metadata.semantic_quality_policy),
      creative_fresh_direction_rejection_memory: object(
        metadata.creative_fresh_direction_rejection_memory,
      ),
      desired_outcome: metadata.desired_outcome || null,
      communication_goal: metadata.communication_goal || null,
      tone: metadata.tone || null,
      emotion: metadata.emotion || null,
      rejected_direction_history: Array.isArray(metadata.rejected_direction_history)
        ? metadata.rejected_direction_history
        : [],
      creative_direction_constraints: Array.isArray(metadata.creative_direction_constraints)
        ? metadata.creative_direction_constraints
        : [],
      creative_direction_human_rejection: object(metadata.creative_direction_human_rejection),
    },
  };
}

function creativeMissionPromptSnapshot(mission = {}) {
  const metadata = object(mission.metadata);
  return {
    id: mission.id || null,
    title: mission.title || null,
    objective: mission.objective || null,
    business_goal: mission.business_goal || null,
    audience: mission.audience || null,
    channels: mission.channels || [],
    metadata: {
      target_duration: metadata.target_duration ?? null,
      desired_outcome: metadata.desired_outcome || null,
      production_type: metadata.production_type || null,
      promptless_input: metadata.promptless_input === true,
      publication_requires_human_approval:
        metadata.publication_requires_human_approval === true,
      production_dossier_approval_required:
        metadata.production_dossier_approval_required === true,
    },
  };
}

function creativeBriefPromptSnapshot(brief = {}) {
  const metadata = object(brief.metadata);
  const grounding = object(metadata.creative_grounding);
  return {
    id: brief.id || null,
    title: brief.title || null,
    business_goal: brief.business_goal || null,
    creative_objective: brief.creative_objective || null,
    desired_outcome: brief.desired_outcome || null,
    communication_goal: brief.communication_goal || null,
    target_audience: object(brief.target_audience),
    markets: list(brief.markets),
    languages: list(brief.languages),
    channels: list(brief.channels),
    duration_seconds: brief.duration_seconds ?? brief.target_duration ?? null,
    tone: brief.tone || null,
    emotion: brief.emotion || null,
    requested_action: brief.requested_action || null,
    metadata: {
      creative_constraints: list(metadata.creative_constraints),
      creative_solution_source: metadata.creative_solution_source || null,
      grounding_reference_authority: object(metadata.grounding_reference_authority),
      creative_grounding: {
        benchmark_lab: object(grounding.benchmark_lab),
        grounding_reference_authority: object(grounding.grounding_reference_authority),
      },
      first_generation_stop_required: metadata.first_generation_stop_required === true,
      user_preapproved_pre_generation_planning: metadata.user_preapproved_pre_generation_planning === true,
    },
  };
}

function semanticMissionContractSnapshot({ mission = {}, project = {}, brief = {} } = {}) {
  const missionMetadata = object(mission.metadata);
  const projectMetadata = object(project.metadata);
  const briefMetadata = object(brief.metadata);
  const briefMissionMetadata = object(briefMetadata.mission_metadata);
  const first = (key, fallback = null) =>
    projectMetadata[key] ?? missionMetadata[key] ?? briefMissionMetadata[key] ?? fallback;
  const required = (key) =>
    projectMetadata[key] === true || missionMetadata[key] === true || briefMissionMetadata[key] === true;
  const semanticText = [
    mission.objective, mission.business_goal, mission.title,
    brief.creative_objective, brief.business_goal, brief.title,
    missionMetadata.desired_outcome, briefMetadata.desired_outcome,
  ].map(text).filter(Boolean).join(" ");
  const inferred = {
    global_scale_required: /\b(global|worldwide|world[- ]scale|across countries|many industries|cross[- ]industry)\b/i.test(semanticText),
    technology_ai_future_required: /\b(ai|artificial intelligence|intelligence|intelligent|technology|future)\b/i.test(semanticText),
    core_mechanism_dramatization_required: /\b(hero mechanism|core mechanism|brain|intelligence as (?:the )?hero|central mechanism)\b/i.test(semanticText),
  };

  return {
    autonomous_story_required: required("autonomous_story_required"),
    master_story_required: required("master_story_required"),
    full_master_film_target_minutes: first("full_master_film_target_minutes"),
    generate_only_chapter_1: required("generate_only_chapter_1"),
    chapter_number: first("chapter_number"),
    chapter_role: first("chapter_role"),
    generation_excerpt_duration_seconds:
      project.target_duration ?? brief.duration_seconds ?? first("target_duration"),
    global_scale_required: required("global_scale_required") || inferred.global_scale_required,
    universe_scale_required: required("universe_scale_required"),
    technology_ai_future_required: required("technology_ai_future_required") || inferred.technology_ai_future_required,
    core_mechanism_dramatization_required: required("core_mechanism_dramatization_required") || inferred.core_mechanism_dramatization_required,
    core_mechanism: first("core_mechanism") || (inferred.core_mechanism_dramatization_required ? "the mission-defined intelligence/brain mechanism" : null),
    benchmark_floor: list(first("benchmark_floor", [])),
    benchmark_is_floor_not_template: required("benchmark_is_floor_not_template"),
    reuse_prior_storyline: first("reuse_prior_storyline"),
    reuse_prior_shotlist: first("reuse_prior_shotlist"),
    rejected_direction_history: list(first("rejected_direction_history", [])),
  };
}

function semanticMissionInstructions(request = {}) {
  const contract = object(request.semantic_mission_contract);
  if (contract.master_story_required !== true) return [];
  return [
    "The semantic mission requires a COMPLETE master story for the whole work before production planning. This is a structural requirement, not optional creative commentary.",
    `Return story_architecture.master_story with substantive beginning, middle, payoff and an ordered chapters array covering the full-film target ${contract.full_master_film_target_minutes || "specified by the mission"} minutes. Each chapter must state its narrative role and progression clearly enough that later chapters can be produced without inventing a new story.`,
    contract.generate_only_chapter_1 === true
      ? `Only the requested excerpt/chapter is being prepared for generation now. Keep top-level scenes scoped to that excerpt (target ${contract.generation_excerpt_duration_seconds || "the requested excerpt duration"} seconds); do not expand scenes to the full film merely because master_story describes the whole work.`
      : null,
    contract.core_mechanism_dramatization_required === true
      ? `The proposition's causal core must be dramatized as a story-bearing mechanism, not reduced to a feature list or software demo. The identified core mechanism is ${contract.core_mechanism || "the evidence-supported mechanism you must resolve from the brief and research"}. Show what enters it, what changes inside it, how its parts coordinate, and what human/world consequence emerges. The mechanism may be mysterious before it is named, but its behavior must be sensorially and emotionally legible.`
      : null,
    contract.global_scale_required === true
      ? "The story must earn genuine global/systemic scale. One generic office, one local incident or one software-use case is insufficient as the governing world. Connect the mechanism to multiple real-world systems, industries, geographies or human consequences without turning the film into a checklist montage."
      : null,
    contract.universe_scale_required === true
      ? "Universe/cosmic scale is part of the requested visual language, but it must reveal systemic scale or mechanism meaning rather than function as decorative space imagery. Every cosmic or planetary perspective must causally connect back to the mechanism and to human stakes."
      : null,
    contract.technology_ai_future_required === true
      ? "Technology, intelligence and the future must be materially present in the authored world through mechanism behavior, graphic/VFX language, sound, decision-making or transformation. Do not satisfy this with generic holograms, floating dashboards or blue network lines."
      : null,
    list(contract.rejected_direction_history).length
      ? `The following creative territories were explicitly rejected and must not be renamed, reskinned or structurally replayed: ${JSON.stringify(list(contract.rejected_direction_history))}. Invent a materially different governing idea.`
      : null,
    list(contract.benchmark_floor).length
      ? `The explicit benchmark floor is ${list(contract.benchmark_floor).join(", ")}. Score and select relative to their creative ambition, tension, sensory authorship and finish, never merely against internal schema compliance. If the returned direction would feel like ordinary category advertising beside those references, reject it and invent again. For premium business/technology brand films, office stress, fragmented tools, dashboards/UI, invoices, approvals, admin work and problem-product-relief arcs may appear only as incidental evidence; they must never be the central dramatic engine. Build the film around an ownable authored phenomenon, mechanism or world whose consequences reveal the proposition cinematically. ${contract.benchmark_is_floor_not_template === true ? "These references are a floor, never templates to copy." : "Do not copy their literal scenes or devices."}`
      : null,
    "Copy semantic_mission_contract into the returned plan unchanged. The contract is system-owned and must not be weakened, omitted or reinterpreted.",
  ].filter(Boolean);
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
  const reasoningAssets = Array.isArray(assets) ? assets.map(masterPlanAssetEvidence) : [];
  return {
    // Scoped to the workflow that governs when it is known. The other six contracts were forty per
    // cent of this request and described media the job is not in.
    contract: compactContractForReasoning(
      CreativeMasterPlanContractRegistry.buildDecisionContract(
        operative?.workflow_kind || null,
      ),
      operative?.workflow_kind || null,
    ),
    operative_workflow: operative,
    semantic_mission_contract: semanticMissionContractSnapshot({ mission, project, brief }),
    unexecutable_services,
    agency_role_schema:
      compactAgencyRoleSchemaForReasoning(),
    execution_checklist: executionChecklist({
      assets,
      capabilities: available_production_capabilities,
    }),
    context: {
      mission: creativeMissionPromptSnapshot(mission),
      project: creativeProjectPromptSnapshot(project),
      brief: creativeBriefPromptSnapshot(brief),
      assets: reasoningAssets,
      quality_policy,
      production_capability_authority:
        "Use execution_checklist.allowed_service_capability_pairs as the exact executable capability authority.",
    },
  };
}

// When the operative workflow is already known, say so and name the sections its
// contract makes mandatory. Left to infer this from a bundle of seven workflow
// contracts, plans came back missing the workflow-specific sections entirely.
function operativeWorkflowInstructions(request) {
  const operative = request?.operative_workflow;
  if (!operative?.workflow_kind) return [];

  const required = Array.isArray(operative.required_sections)
    ? operative.required_sections.filter(Boolean)
    : [];

  const executor = text(operative.executor);

  return [
    `This job's workflow_kind is ${operative.workflow_kind}, declared as ${operative.declared_as}. Return exactly that workflow_kind. contract.workflow_contract is the governing workflow contract; operative_workflow is only a compact routing summary.`,
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
    ...semanticMissionInstructions(request),
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
    "For STILL work, return a top-level art_direction object satisfying the operative workflow schema. It is the binding Art Director + Production Designer dossier: governing visual idea, focal hierarchy, composition, negative space, depth, materials, light/palette, typography, exact brand-asset treatment, responsive crop rules, production-world rules, image-worker requirements, finishing requirements, forbidden devices and intended-vs-rendered review criteria. The image worker executes this dossier; it does not invent or replace it.",
    // A still asked ai.image.generate to replicate the neon CC sign and the metallic CC logo, named both
    // in its continuity anchors, and included no step that composites either from source. Two independent
    // reviewers failed it for neon colour fidelity and halo artifacts, correctly: a generated brand mark is
    // approximately the right colour with nearly the right edges, which is how a logo reads as counterfeit.
    "Any mark whose exact appearance is the point -- a logo, wordmark, neon sign, signage, exact text, a product's own geometry -- must be composited or placed from its source asset by a named production step, and the generating step must be instructed to leave room for it rather than to reproduce it. State which marks are composited, which step does it, and what the generated layer omits. Naming a mark in continuity_anchors and then generating it is not fidelity. If execution_checklist.allowed_service_capability_pairs contains no capability that can composite or place a layer, do not plan the step and do not generate the mark as though the limitation were absent: name the marks that cannot be reproduced faithfully, name the missing capability, and put it in creative_review.repair_before_production.",
    "Do not invent category templates, provider prompts, provider parameters, currencies, formats, channels, audiences, styles or technical defaults.",
    "Internally explore and reject weak directions before returning one primary direction.",
    "When context.project.metadata.creative_fresh_direction_rejection_memory is present, it is authoritative negative lineage memory from an explicit rejection. Do not rename, reskin, hybridize, partially preserve or independently recreate the rejected concept, governing metaphor, signature device, visual system, causal narrative engine, or abstract proof mechanism. Create a materially different direction grounded in the mission and verified evidence. The rejection memory is a prohibition, never a seed.",
    "When the mission's differentiator lives inside a core mechanism, do not default to the category's usual user-problem / interface-demo / relieved-user arc. First test a mechanism-led cinematic idea in which the audience experiences the causal core itself -- its inputs, coordination, transformation, scale and consequences -- as authored story material.",
    "If the mission spans technology, intelligence, future systems or global scale, do not collapse the governing story into one generic office or one ordinary software task. Human stakes still matter, but they must connect to the larger system the brief actually asks the audience to feel.",
    "Complete creative_review precisely. If the direction is generic, derivative, weakly evidenced, insufficiently crafted, or visibly below any declared benchmark floor, repair it before returning rather than marking it passed. Contract compliance is never a reason to award a world-class score.",
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
    "When context.project.metadata.protected_opening_authority is present, treat it as immutable creative authority. The opening described there must survive into the Master Plan exactly in meaning: do not replace multiple independent world signals with one shipment, one supplier, one timestamp, one company, or one ordinary business event, and do not move product explanation into the protected opening.",
    "When context.project.metadata.defer_product_explanation_until_later_chapters is true, ordinary business-event proof belongs after the protected opening. Later causal proof may not retroactively redefine the protected opening as one business incident.",
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
      "The provider response is schema-enforced. Return only non-story repair patches in plan_json, all registered agency role decisions in role_decisions, and the complete full-work story in the dedicated master_story field when immutable.semantic_mission_contract.master_story_required=true; otherwise master_story is null.",
    immutable: {
      quality_policy: qualityPolicy,
      semantic_mission_contract: semanticMissionContractSnapshot({ mission, project, brief }),
      selected_assets: assets.map(masterPlanAssetEvidence),
      production_capability_authority:
        "Use execution_checklist.allowed_service_capability_pairs as the exact executable capability authority.",
      mission: creativeMissionPromptSnapshot(mission),
      project: creativeProjectPromptSnapshot(project),
      brief: creativeBriefPromptSnapshot(brief),
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
      "immutable.semantic_mission_contract is system-owned authority. When master_story_required=true, the dedicated schema-enforced master_story field must contain substantive beginning, middle, payoff and an ordered chapters array covering the requested full work. Keep master_story out of plan_json. If generate_only_chapter_1=true, do not expand or replace the existing excerpt scenes; master_story describes the complete work while top-level scenes remain the current generation excerpt.",
      "Satisfy every execution_checklist obligation explicitly before returning.",
      "Return only the repair patch needed for the listed validation failures; do not rewrite already-valid creative structure.",
      "plan_json must contain one complete valid JSON object representing only the repair patch. Omit unchanged top-level keys; merge semantics preserve them. Omit role_decisions because role_decisions are supplied in the separate schema-enforced field.",
      "When repairing a nested object, return only the nested keys that change. When repairing scenes or shots, include stable ids for every structural entry you patch so unmentioned scenes and shots remain intact. Do not re-emit the whole plan merely for completeness.",
      "Every field defined as an array in the Creative Master Plan must remain a JSON array, including singleton values.",
      "Every production step must contain a non-empty evidence-derived output_spec JSON object; resolve every execution_checklist.required_nonempty_output_spec_steps entry.",
      "Every ACTIVE role must contain a concrete decision and real evidence references grounded in immutable context. Change a role to NOT_REQUIRED only when the discipline is genuinely unnecessary and explain that decision concretely.",
      "creative_review.rejected_patterns must contain at least three substantive items.",
      "creative_review.craft_risks must contain at least two distinct concrete medium-specific items.",
      "creative_review.finishing_requirements must contain at least two distinct concrete finishing items.",
      "creative_review.repair_before_production must be an empty JSON array only after all direction-level repairs are actually resolved.",
      "Every failed path named in validation_failure.validation.failures must be materially repaired in plan_json. Do not spend the repair call polishing unrelated fields while a failed path remains unchanged.",
      "If concept.creative_system or concept.visual_system failed for shallowness, replace abstract labels with a concrete medium-specific craft system covering camera, staging, light, material/VFX behavior, sound/edit rhythm, graphic language and how the visible Avantiqo brain evolves through the story.",
      "If creative_review failed, return a complete creative_review patch with passed, overall_score, all required dimensions, selected_direction_reason, at least three rejected_patterns, weakest_link, at least two craft_risks, at least two finishing_requirements, and repair_before_production. Scores may rise only when the repaired plan substantively earns them.",
      "Do not lower quality scores or thresholds merely to pass validation. Scores must truthfully describe the repaired work.",
      "Do not invent evidence, rights, assets, services, capabilities, providers, currencies, channels, formats or business facts.",
      "Use only service/capability pairs present in execution_checklist.allowed_service_capability_pairs.",
      "Do not add provider prompts, negative prompts, provider parameters or provider identities.",
    ],
  };
}

function recoveredStoryAuthority(project = {}) {
  const recovery = object(project?.metadata?.creative_story_lineage_recovery);
  const master = object(recovery.master);
  const plan = Object.keys(object(master.plan)).length ? object(master.plan) : master;
  const valid =
    recovery.contract === "CREATIVE_STORY_LINEAGE_RECOVERY_V1" &&
    recovery.user_authorized === true &&
    (!recovery.creative_project_id || text(recovery.creative_project_id) === text(project.id)) &&
    Object.keys(plan).length > 0;
  return valid ? { recovery, master, plan } : null;
}

function isAuthorizedRecoveredStory(project = {}, plan = {}) {
  const authority = recoveredStoryAuthority(project);
  if (!authority) return false;
  const recoveredConcept = object(authority.plan.concept);
  const candidateConcept = object(plan.concept);
  const recoveredId = text(authority.plan.selected_concept_id || recoveredConcept.id);
  const candidateId = text(plan.selected_concept_id || candidateConcept.id);
  if (recoveredId && candidateId && recoveredId !== candidateId) return false;
  return true;
}

function recoveredStoryFingerprint(plan = {}) {
  const source = object(plan);
  return JSON.stringify({
    concept: object(source.concept),
    story: object(source.story),
    creative_system: source.creative_system ?? null,
    signature_images: source.signature_images ?? null,
    selected_concept_id: source.selected_concept_id ?? object(source.concept).id ?? null,
  });
}

function preserveAuthorizedRecoveredStory(project = {}, candidatePlan = {}) {
  const authority = recoveredStoryAuthority(project);
  if (!authority) return candidatePlan;
  const recoveredPlan = authority.plan;
  const candidate = object(candidatePlan);
  const recoveredConcept = object(recoveredPlan.concept);
  const candidateConcept = object(candidate.concept);
  return {
    ...candidate,
    concept: {
      ...structuredClone(recoveredConcept),
      ...(candidateConcept.target_audience !== undefined
        ? { target_audience: structuredClone(candidateConcept.target_audience) }
        : {}),
    },
    story: structuredClone(recoveredPlan.story),
    creative_system: structuredClone(recoveredPlan.creative_system),
    signature_images: structuredClone(recoveredPlan.signature_images),
    concept_candidates: structuredClone(recoveredPlan.concept_candidates),
    concept_council: structuredClone(recoveredPlan.concept_council),
    selected_concept_id: recoveredPlan.selected_concept_id,
    story_lineage_lock: {
      contract: "CREATIVE_STORY_LINEAGE_LOCK_V1",
      selected_concept_id: text(recoveredPlan.selected_concept_id || recoveredConcept.id),
      concept_title: text(recoveredConcept.title),
      story_hash: createHash("sha256").update(recoveredStoryFingerprint(recoveredPlan)).digest("hex"),
      immutable_story_body: true,
      creative_story_lineage_recovery: authority.recovery.contract,
    },
  };
}

function recoveredDecisionReviewOnlyFailure(error = null) {
  const message = text(error?.message || error);
  const marker = "CREATIVE_MASTER_PLAN_DECISION_GATE_FAILED:";
  const start = message.indexOf(marker);
  if (start < 0) return false;
  const codeText = message.slice(start + marker.length).split(" :: ")[0];
  const codes = codeText.split(",").map(text).filter(Boolean);
  if (!codes.length) return false;
  const allowed = new Set([
    "TARGET_AUDIENCE_TRUTH_TOO_SHALLOW",
    "CREATIVE_REVIEW_NOT_PASSED",
    "CREATIVE_REVIEW_SCORE_BELOW_STANDARD",
    "CREATIVE_REVIEW_DIMENSION_BELOW_STANDARD",
    "CREATIVE_REVIEW_SELECTION_REASON_SHALLOW",
    "CREATIVE_REVIEW_REJECTED_PATTERNS_REQUIRED",
    "CREATIVE_REVIEW_WEAKEST_LINK_REQUIRED",
    "CREATIVE_REVIEW_CRAFT_RISKS_REQUIRED",
    "CREATIVE_REVIEW_FINISHING_REQUIREMENTS_REQUIRED",
    "CREATIVE_REVIEW_REPAIR_REMAINS",
  ]);
  return codes.every((code) => allowed.has(code));
}

async function repairRecoveredDecisionReview({
  organization_id,
  mission = {},
  project = {},
  brief = {},
  plan = {},
  qualityPolicy = {},
  validationError = null,
} = {}) {
  const concept = object(plan.concept);
  const story = object(plan.story);
  const thresholds = {
    overall: Math.max(
      90,
      finite(
        qualityPolicy.minimum_direction_score ??
        qualityPolicy.minimum_release_score ??
        qualityPolicy.minimum_scene_score,
      ) ?? 90,
    ),
  };
  thresholds.dimension = Math.max(85, Math.min(95, thresholds.overall - 4));

  const evidence = {
    mission: creativeMissionPromptSnapshot(mission),
    project: creativeProjectPromptSnapshot(project),
    brief: {
      creative_objective: brief?.creative_objective || null,
      business_goal: brief?.business_goal || null,
      communication_goal: brief?.communication_goal || null,
      desired_outcome: brief?.desired_outcome || null,
      target_audience: brief?.target_audience || null,
      tone: brief?.tone || null,
      emotion: brief?.emotion || null,
    },
    concept: {
      title: concept.title || null,
      creative_thesis: concept.creative_thesis || null,
      central_proposition: concept.central_proposition || null,
      target_audience: concept.target_audience || null,
      hook: concept.hook || null,
      message: concept.message || null,
      narrative: concept.narrative || null,
      creative_system: concept.creative_system || null,
      emotional_promise: concept.emotional_promise || null,
      brand_fit: concept.brand_fit || null,
      causal_story: concept.causal_story || story.causal_story || null,
      human_stakes: concept.human_stakes || null,
      signature_images: list(concept.signature_images).slice(0, 6),
      dramatic_question: concept.dramatic_question || null,
      governing_world_rule: concept.governing_world_rule || null,
      environment_progression: concept.environment_progression || null,
      performance_integration: concept.performance_integration || null,
    },
    story: {
      hook: story.hook || null,
      audience_tension: story.audience_tension || null,
      escalation: story.escalation || null,
      observable_proof: story.observable_proof || null,
      turn: story.turn || null,
      resolution: story.resolution || null,
      emotional_arc: story.emotional_arc || null,
      anti_cliche_strategy: story.anti_cliche_strategy || null,
    },
    validation_failure: validationError?.message || String(validationError || ""),
    quality_floor: thresholds,
  };

  const result = await ServiceExecutionRuntime.execute({
    organization_id,
    service_id: "ai.reasoning.execute",
    provider_id: null,
    category: "CREATIVE_DIRECTION",
    input: {
      quantity: 1,
      execution_lane: "deep",
      max_output_tokens: 5000,
      response_format: { type: "json_object" },
      prompt: [
        "You are Avantiqo's accountable senior creative reviewer.",
        "Review ONLY the supplied recovered creative direction. Do not rewrite, replace, extend or reinterpret the story, concept, characters, geography, governing device, sequence of events or brand reveal.",
        "Do not use prior project history. Do not invent statistics, market facts, user research, rights, assets or business claims.",
        "Your job is only to produce the missing target-audience truth and accountable creative-review evidence required by the current decision gate.",
        "This is a cinematic brand film, not a product demo. Do not require the target audience, a CTO, a manager, an office, a dashboard, UI, monitoring screen, sensor readout, workflow diagram or other literal enterprise proxy to appear on screen in order for audience truth or strategic specificity to pass.",
        "The audience may understand the brand through metaphor, physical causality, scale progression, sound, pacing and an earned reveal. Judge whether those cinematic devices carry the intended meaning; do not convert abstraction into product explanation.",
        "Treat the existing irreversible causal chain as authoritative evidence: stillness -> leaf unfurls -> stone cracks and water flows -> child places the broken tool in the stone well -> infrastructure coheres -> city grid reactivates -> Avantiqo reveal. Do not ask to replace this chain with a business-system demonstration.",
        "Do not penalize the film merely because the protagonist is not visibly labeled with a profession. The human observer represents human attention and choice; audience relevance is a communication question, not a casting requirement.",
        "If a clarity repair is genuinely necessary, it must stay inside the immutable story and may adjust only execution such as timing, framing, physical cue emphasis, sound punctuation, continuity or reveal legibility. Never prescribe a manager, office, dashboard, UI, network map, sensor reading, log entry, product interface or new story beat.",
        "Return strict JSON only with exactly this shape:",
        JSON.stringify({
          target_audience: {
            primary: "",
            desire: "",
            contradiction: "",
            obstacle: "",
            belief_or_behavior: "",
            evidence_basis: "",
          },
          creative_review: {
            passed: false,
            overall_score: 0,
            dimensions: {
              strategic_specificity: 0,
              originality: 0,
              ownability: 0,
              audience_truth: 0,
              brand_truth: 0,
              medium_fitness: 0,
              craft_specificity: 0,
              factual_discipline: 0,
              language_specificity: 0,
              production_feasibility: 0,
              finishing_readiness: 0,
            },
            selected_direction_reason: "",
            rejected_patterns: ["", "", ""],
            weakest_link: "",
            craft_risks: ["", ""],
            finishing_requirements: ["", ""],
            repair_before_production: [],
          },
        }),
        "Score truthfully. The overall floor is " + thresholds.overall + " and every dimension floor is " + thresholds.dimension + ".",
        "If the direction does not deserve those scores, set passed=false and put concrete unresolved work in repair_before_production. Never inflate a score merely to pass.",
        "target_audience must be grounded only in the mission and the human/brand truth visible in the supplied concept. evidence_basis must say what supplied evidence supports it; no invented external research.",
        "Audience truth is review metadata, not a command to insert professional roles, dashboards, logs, sensors, interfaces, enterprise workflows, supply-chain scenes, CTO/CIO scenes, or any other explanatory business imagery into this locked film.",
        "Do not fail this direction merely because the enterprise audience is not literally depicted. Judge whether the existing poetic story can emotionally and strategically resonate with that audience while remaining abstract, cinematic and human.",
        "Do not require a measurable technical proxy, UI event, dashboard update, sensor reading, log entry, workflow trigger or other literal system proof. The governing story is natural emergence through stillness and attention; evaluate that exact cinematic proposition on its own terms.",
        "repair_before_production may contain only craft or finishing work that preserves the exact story body. It must never request new narrative beats, new professional context, new business-system scenes or a different causal mechanism.",
        "rejected_patterns must describe weaker approaches this exact direction deliberately avoids. craft_risks and finishing_requirements must be film-specific.",
        "EVIDENCE:",
        JSON.stringify(evidence),
      ].join("\n"),
    },
    metadata: {
      module: "CREATIVE",
      operation: "CREATIVE_LINEAGE_DECISION_REVIEW_V1",
      creative_direction_request_hash: createHash("sha256").update(JSON.stringify({
        operation: "CREATIVE_LINEAGE_DECISION_REVIEW_V1",
        review_policy: "CINEMATIC_BRAND_FILM_LINEAGE_REVIEW_V2",
        story: recoveredStoryFingerprint(plan),
        validation_message: validationError?.message || String(validationError || ""),
      })).digest("hex"),
      creative_lineage_review_policy: "CINEMATIC_BRAND_FILM_LINEAGE_REVIEW_V2",
      creative_story_lineage_hash: createHash("sha256").update(recoveredStoryFingerprint(plan)).digest("hex"),
      creative_mission_id: mission.id || null,
      creative_project_id: project.id,
      recovered_story_locked: true,
      story_mutation_authority: false,
    },
  });

  const parsed = parseJson(masterPlanProviderPayload(result));
  const output = object(parsed?.output || parsed);
  const targetAudience = object(output.target_audience);
  const review = object(output.creative_review);
  if (!Object.keys(targetAudience).length || !Object.keys(review).length) {
    throw new Error("CREATIVE_LINEAGE_DECISION_REVIEW_JSON_REQUIRED");
  }

  return {
    plan: {
      ...plan,
      concept: {
        ...concept,
        target_audience: targetAudience,
      },
      creative_review: review,
    },
    usage: result.usage || null,
    billing: result.billing || null,
    provider: result.provider || null,
    model: result.model || null,
    specialized_decision_review: true,
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
  settled_result = null,
  settled_only = false,
}) {
  const executeRepair = (repairPlan, repairValidationError) => {
    const repairRequestHash = createHash("sha256").update(JSON.stringify({
      operation: "MASTER_PLAN_CONTRACT_REPAIR_V1",
      attempt,
      story: recoveredStoryFingerprint(repairPlan),
      validation_message: repairValidationError?.message || String(repairValidationError || ""),
    })).digest("hex");
    return ServiceExecutionRuntime.execute({
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
            plan: repairPlan,
            validationError: repairValidationError,
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
      execution_lane: "fast",
      max_output_tokens: 20000,
      // The owned reasoning lane guarantees JSON-object finalization today, while
      // provider-side json_schema enforcement is not universal. Local validation is
      // the authority either way, so request the transport all certified providers
      // can actually honor and keep the exact repair contract in the payload.
      response_format: { type: "json_object" },
    },
    metadata: {
      module: "CREATIVE",
      operation: "MASTER_PLAN_CONTRACT_REPAIR_V1",
      creative_direction_request_hash: repairRequestHash,
      creative_story_lineage_hash: createHash("sha256").update(recoveredStoryFingerprint(plan)).digest("hex"),
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
  };

  const materialize = (basePlan, result) => {
    const repaired = normalizedPlan(result, { patch: true });
    if (!repaired) throw new Error("CREATIVE_MASTER_PLAN_REPAIR_JSON_REQUIRED");
    const merged = mergeCreativeRepairedPlan(basePlan, repaired);
    return applyDerivedRoleDecisions(
      applySystemOwnedPolicy(
        normalizeUnambiguousCapabilityPairs(merged, capabilities),
        qualityPolicy,
      ),
      CREATIVE_MASTER_PLAN_ROLES,
    );
  };

  if (settled_only && !settled_result) {
    throw new Error("CREATIVE_MASTER_PLAN_SETTLED_REPAIR_REQUIRED");
  }
  let result = settled_result || await executeRepair(plan, validationError);
  let repairedPlan = materialize(plan, result);
  let rejectedSettledResult = false;

  if (settled_result) {
    try {
      validatePlan({ plan: repairedPlan, assets, capabilities });
    } catch (settledValidationError) {
      rejectedSettledResult = true;
      if (settled_only) {
        settledValidationError.rejected_plan = repairedPlan;
        throw settledValidationError;
      }
      result = await executeRepair(repairedPlan, settledValidationError);
      repairedPlan = materialize(repairedPlan, result);
    }
  }

  return {
    plan: repairedPlan,
    usage: result.usage || null,
    billing: result.billing || null,
    provider: result.provider || null,
    model: result.model || null,
    rejected_settled_result: rejectedSettledResult,
  };
}

export const CreativeMasterPlanRuntime = Object.freeze({
  async validateExistingPlan({
    organization_id,
    mission = {},
    project = {},
    brief = {},
    assets = [],
    plan: existingPlan = {},
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!project.id) throw new Error("creative_project_id required");

    const [qualityPolicy, capabilityContext] = await Promise.all([
      Promise.resolve(qualityPolicyFor(project, brief)),
      availableProductionCapabilities(organization_id),
    ]);
    const capabilities = capabilityContext.capabilities;
    const normalizedAssets = list(assets).map(assetIdentity);
    const plan = applyDerivedRoleDecisions(
      applySystemOwnedPolicy(
        normalizeUnambiguousCapabilityPairs(existingPlan, capabilities),
        qualityPolicy,
      ),
      CREATIVE_MASTER_PLAN_ROLES,
    );
    const { validation, decisionValidation } = validatePlan({
      plan,
      assets: normalizedAssets,
      capabilities,
    });
    return {
      plan,
      validation,
      decision_validation: decisionValidation,
      repairs: [],
      available_production_capabilities: capabilities,
      validation_only: true,
    };
  },

  async repairExistingPlan({
    organization_id,
    mission = {},
    project = {},
    brief = {},
    assets = [],
    plan: existingPlan = {},
    repair_results = [],
    settled_only = false,
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!project.id) throw new Error("creative_project_id required");

    const [qualityPolicy, capabilityContext] = await Promise.all([
      Promise.resolve(qualityPolicyFor(project, brief)),
      availableProductionCapabilities(organization_id),
    ]);
    const capabilities = capabilityContext.capabilities;
    const normalizedAssets = list(assets).map(assetIdentity);
    let plan = preserveAuthorizedRecoveredStory(
      project,
      applyDerivedRoleDecisions(
        applySemanticMissionContract(
          applySystemOwnedPolicy(
            normalizeUnambiguousCapabilityPairs(existingPlan, capabilities),
            qualityPolicy,
            brief,
          ),
          { mission, project, brief },
        ),
        CREATIVE_MASTER_PLAN_ROLES,
      ),
    );
    const settledRepairResults = list(repair_results);
    let settledRepairReplayAllowed = true;
    const repairs = [];
    let validation;
    let decisionValidation;

    for (let attempt = 0; attempt <= MAXIMUM_CONTRACT_REPAIR_ATTEMPTS; attempt += 1) {
      try {
        ({ validation, decisionValidation } = validatePlan({
          plan,
          assets: normalizedAssets,
          capabilities,
        }));
        return {
          plan,
          validation,
          decision_validation: decisionValidation,
          repairs,
          available_production_capabilities: capabilities,
        };
      } catch (validationError) {
        if (attempt === MAXIMUM_CONTRACT_REPAIR_ATTEMPTS) {
          validationError.rejected_plan = plan;
          throw validationError;
        }
        const repair = await repairInvalidPlan({
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
          settled_result: settledRepairReplayAllowed ? settledRepairResults[attempt] || null : null,
          settled_only,
        });
        if (repair.rejected_settled_result === true) settledRepairReplayAllowed = false;
        repairs.push(repair);
        plan = preserveAuthorizedRecoveredStory(project, repair.plan);
      }
    }
    throw new Error("CREATIVE_MASTER_PLAN_REPAIR_EXHAUSTED");
  },

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
      const policyBoundPlan = applySystemOwnedPolicy(
        clearResolvedCapabilityRepair(
          normalizeUnambiguousCapabilityPairs(modelPlan, capabilities),
          capabilities,
        ),
        qualityPolicy,
        brief,
      );
      const missionBoundPlan = applySemanticMissionContract(
        policyBoundPlan,
        { mission, project, brief },
      );
      let plan = preserveAuthorizedRecoveredStory(
        project,
        applyDerivedRoleDecisions(
          missionBoundPlan,
          CREATIVE_MASTER_PLAN_ROLES,
        ),
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
          if (conceptRestartRequired(validationError)) {
            validationError.rejected_plan = plan;
            validationError.creative_direction_restart_required = true;
            throw validationError;
          }
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
  async resumeFromResult({
    organization_id,
    mission = {},
    project = {},
    brief = {},
    assets = [],
    result = {},
    repair_results = [],
    settled_only = false,
    defer_semantic_mission_contract = false,
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!project.id) throw new Error("creative_project_id required");

    const [qualityPolicy, capabilityContext] = await Promise.all([
      Promise.resolve(qualityPolicyFor(project, brief)),
      availableProductionCapabilities(organization_id),
    ]);
    const capabilities = capabilityContext.capabilities;
    const normalizedAssets = list(assets).map(assetIdentity);

    try {
      const modelPlan = normalizedPlan(result);
      if (!modelPlan) throw new Error("CREATIVE_MASTER_PLAN_JSON_REQUIRED");
      const policyPlan = applySystemOwnedPolicy(
        clearResolvedCapabilityRepair(
          normalizeUnambiguousCapabilityPairs(modelPlan, capabilities),
          capabilities,
        ),
        qualityPolicy,
        brief,
      );
      let plan = applyDerivedRoleDecisions(
        defer_semantic_mission_contract
          ? policyPlan
          : applySemanticMissionContract(policyPlan, { mission, project, brief }),
        CREATIVE_MASTER_PLAN_ROLES,
      );
      let validation;
      let decisionValidation;
      let contractRepair = null;
      const settledRepairResults = list(repair_results);
      let settledRepairReplayAllowed = true;

      for (let attempt = 0; attempt <= MAXIMUM_CONTRACT_REPAIR_ATTEMPTS; attempt += 1) {
        try {
          ({ validation, decisionValidation } = validatePlan({
            plan,
            assets: normalizedAssets,
            capabilities,
          }));
          break;
        } catch (validationError) {
          if (conceptRestartRequired(validationError)) {
            validationError.rejected_plan = plan;
            validationError.creative_direction_restart_required = true;
            throw validationError;
          }
          if (attempt === MAXIMUM_CONTRACT_REPAIR_ATTEMPTS) {
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
            settled_result: settledRepairReplayAllowed ? settledRepairResults[attempt] || null : null,
            settled_only,
          });
          if (contractRepair.rejected_settled_result === true) settledRepairReplayAllowed = false;
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
        provider: result.provider || result.output?.provider || null,
        model: result.model || result.output?.model || null,
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
          : { executed: false },
        fallback: false,
        degraded: false,
        resumed_from_result: true,
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
