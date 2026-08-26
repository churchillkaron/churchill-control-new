import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import {
  delegateSecretaryJob,
  listSecretaryJobs,
  readSecretaryJob,
} from "@/lib/operator/secretary/SecretaryJobIntakeRuntime";

function text(value) {
  return String(value ?? "").trim();
}

const ACTIONS = {
  delegate: {
    mode: "write",
    risk: "medium",
    reversible: true,
    confirm: true,
    description:
      "Delegate a durable business objective to Avantiqo Executive Secretary. The Secretary owns planning, execution, follow-up and closure while preserving approval gates for high-authority actions.",
    aliases: [
      "secretary handle this for me",
      "take care of this",
      "I need you to handle this",
      "delegate this to my secretary",
      "secretary arrange this",
      "secretary sort this out",
    ],
    execute: delegateSecretaryJob,
  },
  list: {
    mode: "read",
    risk: "low",
    reversible: true,
    description:
      "List durable Executive Secretary jobs, including queued, active, waiting, review-required and completed work.",
    aliases: [
      "what is my secretary working on",
      "show secretary jobs",
      "what have you handled for me",
      "show delegated work",
    ],
    execute: listSecretaryJobs,
  },
  read: {
    mode: "read",
    risk: "low",
    reversible: true,
    description:
      "Read one Executive Secretary job with its durable execution plan, progress, evidence, waiting state and completion result.",
    aliases: [
      "show secretary job status",
      "what happened with that secretary job",
      "show delegated job progress",
      "give me the status of this job",
    ],
    execute: readSecretaryJob,
  },
};

function schemaFor(action) {
  if (action === "delegate") {
    return {
      type: "object",
      properties: {
        objective: { type: "string" },
        success_criteria: { type: "array", items: { type: "string" } },
        autonomy_level: {
          type: "string",
          enum: ["PLAN_ONLY", "EXECUTE_WITH_GATES", "EXECUTE_WITHIN_POLICY"],
        },
        approval_policy: { type: "object" },
        entity_id: { type: "string" },
        timezone: { type: "string" },
        max_attempts: { type: "number" },
        metadata: { type: "object" },
      },
      required: ["objective"],
      additionalProperties: false,
    };
  }
  if (action === "list") {
    return {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: [
            "QUEUED",
            "PLANNING",
            "ACTIVE",
            "WAITING",
            "REVIEW_REQUIRED",
            "COMPLETED",
            "FAILED",
            "CANCELLED",
          ],
        },
        entity_id: { type: "string" },
        limit: { type: "number" },
      },
      additionalProperties: false,
    };
  }
  return {
    type: "object",
    properties: { job_id: { type: "string" } },
    required: ["job_id"],
    additionalProperties: false,
  };
}

export function createSecretaryJobCapability(action) {
  const config = ACTIONS[action];
  if (!config) throw new Error(`SECRETARY_JOB_CAPABILITY_ACTION_UNSUPPORTED:${text(action)}`);

  const manifest = defineCapability({
    domain: "platform",
    capability: "secretary_job",
    action,
    name: `Executive Secretary job ${action}`,
    document: "secretary_job",
    description: config.description,
    permissions: [],
    events: [`platform.secretary_job.${action}`],
    tags: ["platform", "secretary", "executive-secretary", "delegation", "durable-job", config.mode],
    operatorAliases: config.aliases,
    operatorExamples: config.aliases.slice(0, 4),
    transactional: config.mode !== "read",
    aiEnabled: true,
    operatorEnabled: true,
    operatorMode: config.mode,
    operatorAutoExecute: config.mode === "read",
    operatorRequiresConfirmation: config.confirm === true,
    contextScope: "organization",
    risk: config.risk,
    reversible: config.reversible,
    approval: config.confirm === true
      ? { required: false, boundary: "conversation_confirmation" }
      : { required: false },
    inputSchema: schemaFor(action),
  });

  function authorize({ context }) {
    return Boolean(
      text(context?.organizationId) &&
      text(context?.metadata?.partyId || context?.actor?.partyId || context?.actor?.party_id),
    );
  }

  async function execute({ context, payload = {} }) {
    return config.execute({ context, payload });
  }

  return { manifest, authorize, execute };
}

export default createSecretaryJobCapability;