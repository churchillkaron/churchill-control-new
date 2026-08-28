export const CODE_AI_WORKER_LEASE_TOUCH_CONTRACT =
  "AVANTIQO_CODE_AI_WORKER_LEASE_TOUCH_V1";

const MEMORY_TABLE = "intelligence_memories";
const MEMORY_SCOPE = "code_ai_worker_session";
const MEMORY_KEY = "code_ai_worker_session:v2:shared";
const MAX_IDLE_MS = 30 * 60 * 1000;

function text(value, maximum = 4000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function boundedIdleMs(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return MAX_IDLE_MS;
  return Math.max(60_000, Math.min(MAX_IDLE_MS, Math.trunc(parsed)));
}

function controlOrganizationId() {
  const value = text(process.env.AVANTIQO_CODE_WORKER_CONTROL_ORGANIZATION_ID, 200);
  if (!value) throw new Error("AVANTIQO_CODE_WORKER_CONTROL_ORGANIZATION_ID_REQUIRED");
  return value;
}

async function adminClient() {
  const runtime = await import("../../shared/supabase/admin.js");
  return runtime.supabaseAdmin;
}

export async function touchReadyCodeAIWorkerLease({ idle_ms = MAX_IDLE_MS } = {}) {
  const supabaseAdmin = await adminClient();
  const organizationId = controlOrganizationId();
  const rowResult = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,metadata,updated_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", MEMORY_SCOPE)
    .eq("memory_key", MEMORY_KEY)
    .eq("active", true)
    .maybeSingle();
  if (rowResult.error) throw rowResult.error;
  const row = rowResult.data;
  if (!row?.id) return { touched: false, reason: "WORKER_SESSION_MISSING" };

  const metadata = object(row.metadata);
  const session = object(metadata.session);
  const expiresAt = Date.parse(text(session.expires_at, 100));
  if (
    text(session.state, 80).toUpperCase() !== "READY" ||
    session.engine_ready !== true ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= Date.now()
  ) {
    return { touched: false, reason: "WORKER_SESSION_NOT_READY" };
  }

  const idleMs = boundedIdleMs(idle_ms);
  const now = new Date();
  const nextSession = {
    ...session,
    last_activity_at: now.toISOString(),
    expires_at: new Date(now.getTime() + idleMs).toISOString(),
    idle_ms: idleMs,
  };
  const update = await supabaseAdmin
    .from(MEMORY_TABLE)
    .update({
      metadata: {
        ...metadata,
        session: nextSession,
      },
      updated_at: now.toISOString(),
    })
    .eq("id", row.id)
    .eq("updated_at", row.updated_at)
    .select("id,updated_at")
    .maybeSingle();
  if (update.error) throw update.error;
  if (!update.data?.id) {
    return { touched: false, reason: "WORKER_SESSION_STATE_RACE" };
  }
  return {
    touched: true,
    contract: CODE_AI_WORKER_LEASE_TOUCH_CONTRACT,
    state: "READY",
    expires_at: nextSession.expires_at,
    idle_ms: idleMs,
    pod_created: false,
    warmup_performed: false,
    health_probe_performed: false,
    pod_deleted: false,
  };
}

export const CodeAIWorkerLeaseTouchRuntime = Object.freeze({
  contract: CODE_AI_WORKER_LEASE_TOUCH_CONTRACT,
  max_idle_ms: MAX_IDLE_MS,
  touchReady: touchReadyCodeAIWorkerLease,
});

export default CodeAIWorkerLeaseTouchRuntime;
