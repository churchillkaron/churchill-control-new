import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";
import { resolveOperatorCreativeProject } from "@/lib/creative/studio/OperatorCreativeProjectReferenceRuntime";

const REQUIRED_PERMISSION = "creative.mission.create";

function text(value) {
  return String(value ?? "").trim();
}

export const manifest = defineCapability({
  domain: "creative",
  capability: "studio",
  action: "inspectProject",
  description:
    "Read the canonical Creative Studio project created for an operator request_ref or an exact creative_project_id. This is the verification/read boundary for chat-driven Creative missions and never generates media, mutates the project, spends wallet balance, or publishes.",
  permissions: [REQUIRED_PERMISSION],
  events: [],
  tags: ["creative", "studio", "project", "read", "verification", "operator-reference"],
  transactional: false,
  aiEnabled: true,
  operatorEnabled: true,
  operatorMode: "read",
  operatorAutoExecute: true,
  operatorRequiresConfirmation: false,
  risk: "low",
  reversible: true,
  approval: "none",
  contextScope: "organization",
  inputSchema: {
    type: "object",
    properties: {
      request_ref: { type: "string" },
      creative_project_id: { type: "string" },
    },
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    properties: {
      status: { const: "FOUND" },
      request_ref: { type: ["string", "null"] },
      creative_mission_id: { type: ["string", "null"] },
      creative_project_id: { type: "string" },
      project_status: { type: ["string", "null"] },
      project_name: { type: ["string", "null"] },
      production_type: { type: ["string", "null"] },
    },
    required: ["status", "creative_project_id"],
  },
});

export function validate({ payload = {} }) {
  if (!text(payload.request_ref) && !text(payload.creative_project_id)) {
    const error = new Error("CREATIVE_OPERATOR_PROJECT_REFERENCE_REQUIRED");
    error.status = 400;
    throw error;
  }
  return true;
}

export function authorize({ context }) {
  return requireExecutionPermission(context, REQUIRED_PERMISSION);
}

export async function execute({ context, payload = {} }) {
  const resolved = await resolveOperatorCreativeProject({
    organizationId: context.organizationId,
    creativeProjectId: payload.creative_project_id,
    requestRef: payload.request_ref,
  });
  const project = resolved.project;

  return {
    status: "FOUND",
    request_ref: resolved.request_ref || null,
    creative_mission_id:
      resolved.mission?.id || text(project.creative_mission_id) || null,
    creative_project_id: project.id,
    project_status: text(project.status) || null,
    project_name: text(project.name) || null,
    production_type: text(project.production_type) || null,
  };
}
