import {
  ensureCodeAIWorkerSession,
  CODE_AI_WORKER_SESSION_CONTRACT,
} from "@/lib/code/runtime/CodeAIWorkerSessionRuntime";
import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";

const REQUIRED_PERMISSION = "platform.code.ai.execute";
const DEFAULT_IDLE_MS = 30 * 60 * 1000;
const MAX_IDLE_MS = 30 * 60 * 1000;

function boundedIdleMs(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_IDLE_MS;
  return Math.max(60_000, Math.min(MAX_IDLE_MS, Math.trunc(parsed)));
}

export function createCodeAIWarmCapability() {
  const manifest = defineCapability({
    domain: "platform",
    capability: "code_ai_warm",
    action: "prepare",
    description:
      "Prepare Avantiqo Code for interactive work before a coding mission exists. This governed prewarm starts or resumes the bounded shared Code worker session and requires the cached FP8 model plus loaded vLLM engine before reporting ready. It performs no customer inference, consumes no Code employee reasoning-call budget, performs no wallet mutation, does not touch source, does not commit, and does not deploy.",
    permissions: [REQUIRED_PERMISSION],
    events: [],
    tags: [
      "platform",
      "code-ai",
      "prewarm",
      "interactive-latency",
      "engine-ready",
      "zero-reasoning",
      "zero-wallet",
      "non-mutating",
    ],
    transactional: false,
    aiEnabled: false,
    operatorEnabled: true,
    operatorMode: "read",
    operatorAutoExecute: true,
    operatorRequiresConfirmation: false,
    contextScope: "organization",
    risk: "low",
    reversible: true,
    inputSchema: {
      type: "object",
      properties: {
        warm_session_idle_ms: {
          type: "integer",
          minimum: 60000,
          maximum: MAX_IDLE_MS,
          default: DEFAULT_IDLE_MS,
          description:
            "Bounded idle window for keeping the already-loaded Code engine available for the interactive coding session.",
        },
      },
      additionalProperties: false,
    },
  });

  function authorize({ context }) {
    return requireExecutionPermission(context, REQUIRED_PERMISSION);
  }

  async function execute({ payload = {} }) {
    const startedAt = Date.now();
    const worker = await ensureCodeAIWorkerSession({
      idle_ms: boundedIdleMs(payload.warm_session_idle_ms),
    });
    return {
      success: worker?.ready === true,
      contract: "AVANTIQO_CODE_AI_PREWARM_V1",
      worker_session_contract: worker?.contract || CODE_AI_WORKER_SESSION_CONTRACT,
      status: worker?.ready === true ? "ready" : "warming",
      ready: worker?.ready === true,
      warming: worker?.warming === true,
      reason: worker?.reason || null,
      engine_loaded: worker?.engine_loaded === true,
      cached_model_found: worker?.cached_model_found === true,
      session_id: worker?.session_id || null,
      expires_at: worker?.expires_at || null,
      idle_ms: worker?.idle_ms || null,
      elapsed_ms: Date.now() - startedAt,
      reasoning_calls_used: 0,
      customer_inference_performed: false,
      wallet_mutation_performed: false,
      source_mutation_performed: false,
      github_write_performed: false,
      production_deploy_performed: false,
      contains_worker_token: false,
      raw_reasoning_persisted: false,
    };
  }

  return { manifest, authorize, execute };
}

export default createCodeAIWarmCapability;