export const CODE_AI_WORKER_SESSION_CONTRACT =
  "AVANTIQO_CODE_AI_WORKER_SESSION_V3";

function text(value) {
  return String(value ?? "").trim();
}

function modalConfigured() {
  const baseUrl = text(process.env.AVANTIQO_CODE_MODAL_BASE_URL);
  const gateway = text(process.env.AVANTIQO_CODE_MODAL_GATEWAY_TOKEN);
  const tokenId = text(process.env.AVANTIQO_CODE_MODAL_PROXY_TOKEN_ID);
  const tokenSecret = text(process.env.AVANTIQO_CODE_MODAL_PROXY_TOKEN_SECRET);
  return Boolean(
    baseUrl &&
    (gateway.length >= 40 || (tokenId.startsWith("wk-") && tokenSecret.startsWith("ws-")))
  );
}

function state() {
  const ready = modalConfigured();
  return {
    success: true,
    contract: CODE_AI_WORKER_SESSION_CONTRACT,
    infrastructure_provider: "MODAL_H100_ASYNC_V1",
    execution_transport_mode: "MODAL_SCALE_TO_ZERO",
    ready,
    warming: false,
    reason: ready ? "MODAL_SCALE_TO_ZERO_NO_PREWARM_REQUIRED" : "AVANTIQO_CODE_MODAL_CONFIGURATION_REQUIRED",
    state: ready ? "READY" : "UNAVAILABLE",
    engine_loaded: false,
    cached_model_found: false,
    session_id: null,
    expires_at: null,
    idle_ms: 0,
    worker_started: false,
    worker_session_created: false,
    scale_to_zero_required: true,
    raw_reasoning_persisted: false,
  };
}

export async function reapExpiredCodeAIWorkerSession() {
  return { ...state(), reaped: false, session_state: "NOT_REQUIRED" };
}

export async function ensureCodeAIWorkerSession() {
  return state();
}

export async function resolveCodeAIWorkerSessionTransport() {
  const current = state();
  return current.ready ? current : null;
}

export const CodeAIWorkerSessionRuntime = Object.freeze({
  contract: CODE_AI_WORKER_SESSION_CONTRACT,
  ensure: ensureCodeAIWorkerSession,
  resolve: resolveCodeAIWorkerSessionTransport,
  reap: reapExpiredCodeAIWorkerSession,
});

export default CodeAIWorkerSessionRuntime;
