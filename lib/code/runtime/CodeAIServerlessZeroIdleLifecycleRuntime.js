export const CODE_AI_SERVERLESS_ZERO_IDLE_LIFECYCLE_CONTRACT = "AVANTIQO_CODE_LOCAL_QUEUE_LIFECYCLE_V1";

function enabled(value) { return ["1","true","yes","on"].includes(String(value ?? "").trim().toLowerCase()); }
export function codeAIServerlessZeroIdleEnabled() { return enabled(process.env.AVANTIQO_LOCAL_COMPUTE_QUEUE_ENABLED); }
export async function ensureCodeAIServerlessAcceptingWork() {
  if (!codeAIServerlessZeroIdleEnabled()) throw new Error("AVANTIQO_CODE_LOCAL_QUEUE_REQUIRED");
  return { success:true, contract:CODE_AI_SERVERLESS_ZERO_IDLE_LIFECYCLE_CONTRACT, infrastructure_provider:"AVANTIQO_LOCAL_NODE_V1", accepting_work:true, execution_transport_mode:"LOCAL_DURABLE_QUEUE", worker_mutation_performed:false, scale_to_zero_required:false };
}
export function isExactCodeAIServerlessPausedSubmissionError() { return false; }
export async function reapIdleCodeAIServerlessWorker() { return { success:true, contract:CODE_AI_SERVERLESS_ZERO_IDLE_LIFECYCLE_CONTRACT, infrastructure_provider:"AVANTIQO_LOCAL_NODE_V1", reaped:false, reason:"LOCAL_NODE_LIFECYCLE_OWNED_BY_NODE_AGENT", provider_model_call_performed:false }; }
export const CodeAIServerlessZeroIdleLifecycleRuntime=Object.freeze({ contract:CODE_AI_SERVERLESS_ZERO_IDLE_LIFECYCLE_CONTRACT, enabled:codeAIServerlessZeroIdleEnabled, ensure:ensureCodeAIServerlessAcceptingWork, reap:reapIdleCodeAIServerlessWorker });
export default CodeAIServerlessZeroIdleLifecycleRuntime;
