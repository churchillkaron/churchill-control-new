export const CODE_AI_WORKER_SESSION_CONTRACT = "AVANTIQO_CODE_AI_WORKER_SESSION_V4_LOCAL";
function enabled(value) { return ["1","true","yes","on"].includes(String(value ?? "").trim().toLowerCase()); }
function state() { const ready=enabled(process.env.AVANTIQO_LOCAL_COMPUTE_QUEUE_ENABLED); return { success:true, contract:CODE_AI_WORKER_SESSION_CONTRACT, infrastructure_provider:"AVANTIQO_LOCAL_NODE_V1", execution_transport_mode:"LOCAL_DURABLE_QUEUE", ready, warming:false, reason:ready?"LOCAL_COMPUTE_QUEUE_CONFIGURED":"AVANTIQO_LOCAL_COMPUTE_QUEUE_REQUIRED", state:ready?"READY":"UNAVAILABLE", engine_loaded:false, cached_model_found:false, session_id:null, expires_at:null, idle_ms:0, worker_started:false, worker_session_created:false, scale_to_zero_required:false, raw_reasoning_persisted:false }; }
export async function reapExpiredCodeAIWorkerSession(){ return { ...state(), reaped:false, session_state:"NOT_REQUIRED" }; }
export async function ensureCodeAIWorkerSession(){ return state(); }
export async function resolveCodeAIWorkerSessionTransport(){ const current=state(); return current.ready ? current : null; }
export const CodeAIWorkerSessionRuntime=Object.freeze({ contract:CODE_AI_WORKER_SESSION_CONTRACT, ensure:ensureCodeAIWorkerSession, resolve:resolveCodeAIWorkerSessionTransport, reap:reapExpiredCodeAIWorkerSession });
export default CodeAIWorkerSessionRuntime;
