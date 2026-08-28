import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  ensureCodeAIWorkerSession,
  CODE_AI_WORKER_SESSION_CONTRACT,
} from "@/lib/code/runtime/CodeAIWorkerSessionRuntime";

const DEFAULT_IDLE_MS = 30 * 60 * 1000;
const MAX_IDLE_MS = 30 * 60 * 1000;

function text(value) {
  return String(value ?? "").trim();
}

function boundedIdleMs(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_IDLE_MS;
  return Math.max(60_000, Math.min(MAX_IDLE_MS, Math.trunc(parsed)));
}

function enabled(value) {
  return ["1", "true", "yes", "on"].includes(text(value).toLowerCase());
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const organizationId = text(body.organizationId || body.organization_id);
    if (!organizationId) {
      return Response.json(
        { success: false, error: "organization_id required" },
        { status: 400 },
      );
    }

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) {
      return Response.json(
        { success: false, error: access.error },
        { status: access.status || 403 },
      );
    }

    if (!enabled(process.env.AVANTIQO_CODE_WORKER_SESSION_ENABLED)) {
      return Response.json({
        success: true,
        contract: "AVANTIQO_CODE_OPERATOR_PREWARM_V1",
        status: "disabled",
        ready: false,
        warming: false,
        reason: "CODE_AI_WORKER_SESSION_INFRASTRUCTURE_NOT_ENABLED",
        reasoning_calls_used: 0,
        customer_inference_performed: false,
        wallet_mutation_performed: false,
        source_mutation_performed: false,
        production_deploy_performed: false,
        raw_reasoning_persisted: false,
      });
    }

    const worker = await ensureCodeAIWorkerSession({
      idle_ms: boundedIdleMs(body.warm_session_idle_ms),
    });

    return Response.json({
      success: true,
      contract: "AVANTIQO_CODE_OPERATOR_PREWARM_V1",
      worker_session_contract: worker?.contract || CODE_AI_WORKER_SESSION_CONTRACT,
      status: worker?.ready === true ? "ready" : "warming",
      ready: worker?.ready === true,
      warming: worker?.warming === true,
      reason: worker?.reason || null,
      engine_loaded: worker?.engine_loaded === true,
      cached_model_found: worker?.cached_model_found === true,
      expires_at: worker?.expires_at || null,
      idle_ms: worker?.idle_ms || null,
      reasoning_calls_used: 0,
      customer_inference_performed: false,
      wallet_mutation_performed: false,
      source_mutation_performed: false,
      github_write_performed: false,
      production_deploy_performed: false,
      contains_worker_token: false,
      raw_reasoning_persisted: false,
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        contract: "AVANTIQO_CODE_OPERATOR_PREWARM_V1",
        status: "failed",
        error: text(error?.message || error).slice(0, 700) || "CODE_PREWARM_FAILED",
        reasoning_calls_used: 0,
        customer_inference_performed: false,
        wallet_mutation_performed: false,
        source_mutation_performed: false,
        production_deploy_performed: false,
        raw_reasoning_persisted: false,
      },
      { status: 500 },
    );
  }
}