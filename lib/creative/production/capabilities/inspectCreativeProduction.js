import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";
import { ProductionRuntime } from "@/lib/creative/production/runtime/ProductionRuntime";
import { resolveOperatorCreativeProject } from "@/lib/creative/studio/OperatorCreativeProjectReferenceRuntime";

const REQUIRED_PERMISSION = "creative.mission.create";

function text(value) {
  return String(value ?? "").trim();
}

function count(queue, key) {
  return Array.isArray(queue?.[key]) ? queue[key].length : 0;
}

function productionStatus(queue) {
  if (count(queue, "failed")) return "FAILED";
  if (count(queue, "blocked")) return "BLOCKED";
  if (count(queue, "running")) return "RUNNING";
  if (count(queue, "review")) return "REVIEW";
  if (count(queue, "ready") || count(queue, "waiting")) return "READY";
  if (count(queue, "completed")) return "SETTLED";
  return "NO_TASKS";
}

export const manifest = defineCapability({
  domain: "creative",
  capability: "production",
  action: "inspect",
  description:
    "Inspect the real Creative production queue and shared Cinematic Coverage intelligence for one canonical Studio project. Returns bounded queue counts, production state, and coverage readiness for Chat, AI Creative Studio, and Pro Studio. This is read-only and never dispatches providers, spends wallet balance, or publishes.",
  permissions: [REQUIRED_PERMISSION],
  events: [],
  tags: ["creative", "video", "production", "queue", "read", "verification", "coverage"],
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
      require_production_activity: {
        type: "boolean",
        description:
          "When true, fail verification unless the queue proves production activity exists for this project.",
      },
    },
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    properties: {
      status: { type: "string" },
      request_ref: { type: ["string", "null"] },
      creative_project_id: { type: "string" },
      production_activity: { type: "boolean" },
      total: { type: "number" },
      ready: { type: "number" },
      waiting: { type: "number" },
      running: { type: "number" },
      review: { type: "number" },
      completed: { type: "number" },
      failed: { type: "number" },
      blocked: { type: "number" },
      coverage_status: { type: "string" },
      coverage_contract: { type: "string" },
      coverage_directed: { type: "number" },
      camera_directed: { type: "number" },
      continuity_directed: { type: "number" },
      coverage_issue_count: { type: "number" },
    },
    required: ["status", "creative_project_id", "production_activity", "total"],
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
  const inspected = await ProductionRuntime.inspectCoverage({
    organization_id: context.organizationId,
    creative_project_id: resolved.project.id,
  });
  const queue = inspected.queue || {};
  const coverage = inspected.coverage || {};
  const counts = {
    ready: count(queue, "ready"),
    waiting: count(queue, "waiting"),
    running: count(queue, "running"),
    review: count(queue, "review"),
    completed: count(queue, "completed"),
    failed: count(queue, "failed"),
    blocked: count(queue, "blocked"),
  };
  const total = Number(queue?.total || Object.values(counts).reduce((sum, value) => sum + value, 0));
  const productionActivity =
    counts.running + counts.review + counts.completed + counts.failed + counts.blocked > 0;

  if (payload.require_production_activity === true && !productionActivity) {
    const error = new Error("CREATIVE_PRODUCTION_ACTIVITY_NOT_VERIFIED");
    error.status = 409;
    throw error;
  }

  return {
    status: productionStatus(queue),
    request_ref: resolved.request_ref || null,
    creative_project_id: resolved.project.id,
    production_activity: productionActivity,
    total,
    ...counts,
    coverage_status: text(coverage.status) || "NO_TASKS",
    coverage_contract: text(coverage.contract) || null,
    coverage_directed: Number(coverage.coverage_directed || 0),
    camera_directed: Number(coverage.camera_directed || 0),
    continuity_directed: Number(coverage.continuity_directed || 0),
    coverage_issue_count: Array.isArray(coverage.issues) ? coverage.issues.length : 0,
    coverage_issues: Array.isArray(coverage.issues) ? coverage.issues.slice(0, 12) : [],
  };
}
