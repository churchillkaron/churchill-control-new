export const CODE_AI_SERVERLESS_ZERO_IDLE_LIFECYCLE_CONTRACT =
  "AVANTIQO_CODE_MODAL_ZERO_IDLE_LIFECYCLE_V1";

function text(value) { return String(value ?? "").trim(); }
function modalConfigured() {
  const baseUrl = text(process.env.AVANTIQO_CODE_MODAL_BASE_URL);
  const gateway = text(process.env.AVANTIQO_CODE_MODAL_GATEWAY_TOKEN);
  const tokenId = text(process.env.AVANTIQO_CODE_MODAL_PROXY_TOKEN_ID);
  const tokenSecret = text(process.env.AVANTIQO_CODE_MODAL_PROXY_TOKEN_SECRET);
  return Boolean(baseUrl && (gateway.length >= 40 || (tokenId.startsWith("wk-") && tokenSecret.startsWith("ws-"))));
}

export function codeAIServerlessZeroIdleEnabled() { return true; }

export async function ensureCodeAIServerlessAcceptingWork() {
  if (!modalConfigured()) throw new Error("AVANTIQO_CODE_MODAL_CONFIGURATION_REQUIRED");
  return {
    success: true,
    contract: CODE_AI_SERVERLESS_ZERO_IDLE_LIFECYCLE_CONTRACT,
    infrastructure_provider: "MODAL_H100_ASYNC_V1",
    accepting_work: true,
    execution_transport_mode: "MODAL_SCALE_TO_ZERO",
    worker_mutation_performed: false,
    scale_to_zero_required: true,
  };
}

export function isExactCodeAIServerlessPausedSubmissionError() { return false; }

export async function reapIdleCodeAIServerlessWorker() {
  return {
    success: true,
    contract: CODE_AI_SERVERLESS_ZERO_IDLE_LIFECYCLE_CONTRACT,
    infrastructure_provider: "MODAL_H100_ASYNC_V1",
    reaped: false,
    reason: "MODAL_OWNS_SCALE_TO_ZERO_LIFECYCLE",
    provider_model_call_performed: false,
  };
}

export const CodeAIServerlessZeroIdleLifecycleRuntime = Object.freeze({
  contract: CODE_AI_SERVERLESS_ZERO_IDLE_LIFECYCLE_CONTRACT,
  enabled: codeAIServerlessZeroIdleEnabled,
  ensure: ensureCodeAIServerlessAcceptingWork,
  reap: reapIdleCodeAIServerlessWorker,
});

export default CodeAIServerlessZeroIdleLifecycleRuntime;
