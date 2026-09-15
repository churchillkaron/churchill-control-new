import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";
import { CreativeStateEngine } from "@/lib/creative/state/CreativeStateEngine";

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
  tags: ["creative", "studio", "project", "read", "verification", "operator-reference", "workflow-state", "continuity"],
  operatorAliases: [
    "where are we in studio",
    "where did the creative project stop",
    "what failed in the studio project",
    "what happens next in studio",
    "check the creative workflow state",
    "check the current creative checkpoint",
  ],
  operatorExamples: [
    "Where are we in this Creative Studio project?",
    "What failed, and what happens next?",
    "Check the current Studio checkpoint before we continue.",
  ],
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
      workflow_stage: { type: ["string", "null"] },
      workflow_updated_at: { type: ["string", "null"] },
      execution_locked: { type: "boolean" },
      execution_locked_at: { type: ["string", "null"] },
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
  const { resolveOperatorCreativeProject } = await import(
    "@/lib/creative/studio/OperatorCreativeProjectReferenceRuntime"
  );
  const resolved = await resolveOperatorCreativeProject({
    organizationId: context.organizationId,
    creativeProjectId: payload.creative_project_id,
    requestRef: payload.request_ref,
  });
  const project = resolved.project;
  const missionId = resolved.mission?.id || text(project.creative_mission_id) || null;
  const workflowState = missionId
    ? await CreativeStateEngine.get({ creative_mission_id: missionId })
    : null;

  return {
    status: "FOUND",
    request_ref: resolved.request_ref || null,
    creative_mission_id: missionId,
    creative_project_id: project.id,
    project_status: text(project.status) || null,
    project_name: text(project.name) || null,
    production_type: text(project.production_type) || null,
    workflow_stage: text(workflowState?.stage) || null,
    workflow_updated_at: text(workflowState?.updated_at) || null,
    execution_locked: workflowState?.execution_lock === true,
    execution_locked_at: text(workflowState?.locked_at) || null,
  };
}
