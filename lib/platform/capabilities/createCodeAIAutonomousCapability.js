import { executeAutonomousCodeMission } from "@/lib/code/runtime/CodeAIAutonomousRuntime";
import {
  attestCodeMissionState,
  verifyCodeMissionStateAttestation,
} from "@/lib/code/runtime/CodeMissionAttestationRuntime";
import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";

const REQUIRED_PERMISSION = "platform.code.ai.execute";
const RESTORABLE_MISSION_STATUSES = new Set([
  "completed",
  "repair_required",
  "verification_required",
  "replan_required",
  "blocked",
  "running",
]);

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function actorId(context = {}) {
  return text(context?.actor?.id || context?.actor?.user_id) || null;
}

function assertResumeScope(resumeState, context) {
  const resume = object(resumeState);
  if (!Object.keys(resume).length) return;
  verifyCodeMissionStateAttestation(resume);
  const organizationId = text(context?.organizationId);
  if (!organizationId || text(resume.organization_id) !== organizationId) {
    throw new Error("CODE_AI_AUTONOMOUS_RESUME_ORGANIZATION_MISMATCH");
  }
  if (text(resume.actor_id) !== actorId(context)) {
    throw new Error("CODE_AI_AUTONOMOUS_RESUME_ACTOR_MISMATCH");
  }
}

function resumeStateForExecution(resumeState) {
  const resume = object(resumeState);
  if (text(resume.status) !== "planner_pending") return resumeState || null;

  const evidence = [...list(resume.evidence)].reverse();
  const restoredStatus = evidence
    .map((entry) => text(entry?.status))
    .find((status) => RESTORABLE_MISSION_STATUSES.has(status));
  if (!restoredStatus) {
    throw new Error("CODE_AI_AUTONOMOUS_PENDING_RESUME_STATUS_EVIDENCE_REQUIRED");
  }

  return {
    ...resume,
    status: restoredStatus,
    blockers: restoredStatus === "blocked" ? list(resume.blockers) : [],
  };
}

export function createCodeAIAutonomousCapability() {
  const manifest = defineCapability({
    domain: "platform",
    capability: "code_ai_autonomous",
    action: "execute",
    description:
      "Run an Avantiqo-owned autonomous software-engineering mission: inspect the repository, plan from observed evidence, use shared governed research when needed, edit through bounded source operations, execute development checks, inspect failures, repair, verify, and continue until complete or genuinely blocked. Persistent GitHub commits remain a separate governed capability.",
    permissions: [REQUIRED_PERMISSION],
    events: [],
    tags: [
      "platform",
      "code-ai",
      "autonomous",
      "software-engineering",
      "research",
      "repair-loop",
      "verification",
      "owned-orchestration",
    ],
    transactional: false,
    aiEnabled: true,
    operatorEnabled: true,
    operatorMode: "write",
    operatorAutoExecute: true,
    operatorRequiresConfirmation: false,
    contextScope: "organization",
    risk: "low",
    reversible: true,
    inputSchema: {
      type: "object",
      required: ["objective", "repository_url"],
      properties: {
        objective: { type: "string", minLength: 1, maxLength: 4000 },
        repository_url: { type: "string", minLength: 1, maxLength: 500 },
        ref: { type: "string", maxLength: 160, default: "main" },
        resume_state: { type: "object" },
        max_iterations: { type: "integer", minimum: 1, maximum: 24, default: 16 },
        timeout_ms: { type: "integer", minimum: 30000, maximum: 1200000 },
      },
      additionalProperties: false,
    },
  });

  function authorize({ context }) {
    return requireExecutionPermission(context, REQUIRED_PERMISSION);
  }

  async function execute({ context, payload = {} }) {
    assertResumeScope(payload.resume_state, context);
    const result = await executeAutonomousCodeMission({
      context,
      objective: payload.objective,
      repository_url: payload.repository_url,
      ref: payload.ref || "main",
      resume_state: resumeStateForExecution(payload.resume_state),
      max_iterations: payload.max_iterations,
      timeout_ms: payload.timeout_ms || null,
    });

    if (result?.state) {
      result.state = attestCodeMissionState({
        ...result.state,
        organization_id: context.organizationId,
        actor_id: actorId(context),
      });
    }
    return result;
  }

  return { manifest, authorize, execute };
}

export default createCodeAIAutonomousCapability;
