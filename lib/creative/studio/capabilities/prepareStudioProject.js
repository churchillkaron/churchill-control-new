import { CreativeMissionRuntime } from "@/lib/creative/missions/runtime/CreativeMissionRuntime";
import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";

const REQUIRED_PERMISSION = "creative.mission.create";

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value)
    ? value.map((item) => text(item)).filter(Boolean)
    : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export const manifest = defineCapability({
  domain: "creative",
  capability: "studio",
  action: "prepareProject",
  description:
    "Prepare a real Creative Studio project from an agreed brief. Creates the mission, project, brief, and initial Studio state only; it does not generate paid media, publish, or authorize publication. Operator missions may supply a stable request_ref so the created project can be verified and safely bound into later production steps.",
  permissions: [REQUIRED_PERMISSION],
  events: ["creative.studio.project.prepared"],
  tags: ["creative", "studio", "brief", "project", "draft", "operator-reference"],
  transactional: true,
  aiEnabled: true,
  operatorEnabled: true,
  operatorMode: "draft",
  operatorAutoExecute: false,
  operatorRequiresConfirmation: true,
  risk: "medium",
  reversible: false,
  approval: { required: false, boundary: "conversation_confirmation" },
  inputSchema: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "Short working title for the Studio project.",
      },
      objective: {
        type: "string",
        description: "The concrete business and creative outcome to achieve.",
      },
      request_ref: {
        type: "string",
        description:
          "Stable opaque reference for this exact operator request. Used to verify/recover the created Studio project without guessing a generated project ID.",
      },
      audience: {
        type: "object",
        description: "Known target-audience facts, without invented demographics.",
        additionalProperties: true,
      },
      channels: {
        type: "array",
        items: { type: "string" },
        description: "Requested output channels or placements.",
      },
      tone: { type: "string" },
      call_to_action: { type: "string" },
      desired_outcome: { type: "string" },
      target_languages: {
        type: "array",
        items: { type: "string" },
      },
      target_duration: {
        type: "number",
        description: "Requested duration in seconds, when relevant.",
      },
      budget_ceiling: {
        type: "number",
        description: "Maximum production budget. This does not approve spend.",
      },
      constraints: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: ["title", "objective"],
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    properties: {
      status: { const: "PREPARED" },
      request_ref: { type: ["string", "null"] },
      creative_mission_id: { type: "string" },
      creative_project_id: { type: "string" },
      creative_brief_id: { type: "string" },
      publish_authorized: { const: false },
    },
    required: [
      "status",
      "creative_mission_id",
      "creative_project_id",
      "creative_brief_id",
      "publish_authorized",
    ],
  },
});

export function validate({ payload = {} }) {
  if (!text(payload.title)) {
    const error = new Error("CREATIVE_STUDIO_TITLE_REQUIRED");
    error.status = 400;
    throw error;
  }
  if (!text(payload.objective)) {
    const error = new Error("CREATIVE_STUDIO_OBJECTIVE_REQUIRED");
    error.status = 400;
    throw error;
  }
  return true;
}

export function authorize({ context }) {
  return requireExecutionPermission(context, REQUIRED_PERMISSION);
}

export async function execute({ context, payload = {} }) {
  const organizationId = context.organizationId;
  const targetDuration = positiveNumber(payload.target_duration);
  const budgetCeiling = Number(payload.budget_ceiling);
  const requestRef = text(payload.request_ref) || null;
  const mission = await CreativeMissionRuntime.create({
    organization_id: organizationId,
    title: text(payload.title),
    business_goal: text(payload.objective),
    objective: text(payload.objective),
    status: "draft",
    approval_state: "not_required",
    audience: object(payload.audience),
    channels: list(payload.channels),
    metadata: {
      source: "AVANTIQO_OPERATOR",
      source_type: "operator_chat",
      source_reference: requestRef,
      prepared_by_party_id:
        context.actor?.partyId ||
        context.actor?.party_id ||
        context.metadata?.partyId ||
        null,
      desired_outcome: text(payload.desired_outcome),
      tone: text(payload.tone),
      call_to_action: text(payload.call_to_action),
      target_languages: list(payload.target_languages),
      target_duration: targetDuration,
      constraints: list(payload.constraints),
      budget_ceiling:
        Number.isFinite(budgetCeiling) && budgetCeiling >= 0
          ? budgetCeiling
          : null,
      public_publish_authorized: false,
      publish_authorized: false,
      publication_requires_human_approval: true,
      production_dossier_approval_required: true,
    },
  });
  const prepared = await CreativeMissionRuntime.start(mission.id);

  return {
    status: "PREPARED",
    request_ref: requestRef,
    title: prepared.title,
    objective: prepared.objective,
    creative_mission_id: prepared.id,
    creative_project_id:
      prepared.runtime_context?.creative_project_id || null,
    creative_brief_id:
      prepared.runtime_context?.creative_brief_id || null,
    creative_state_id:
      prepared.runtime_context?.creative_state_id || null,
    publish_authorized: false,
    publication_requires_human_approval: true,
  };
}
