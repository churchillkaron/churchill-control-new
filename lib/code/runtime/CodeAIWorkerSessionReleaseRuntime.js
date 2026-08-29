import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  reapExpiredCodeAIWorkerSession,
  CODE_AI_WORKER_SESSION_CONTRACT,
} from "./CodeAIWorkerSessionRuntime.js";

export const CODE_AI_WORKER_SESSION_RELEASE_CONTRACT =
  "AVANTIQO_CODE_AI_WORKER_SESSION_RELEASE_V1";

const MEMORY_TABLE = "intelligence_memories";
const MEMORY_SCOPE = "code_ai_worker_session";
const MEMORY_KEY = "code_ai_worker_session:v2:shared";
const NO_POD_DIRECT_RELEASE_STATES = new Set(["FAILED", "STARTING", "EXPIRED"]);

function text(value, maximum = 1000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function controlOrganizationId() {
  const value = text(process.env.AVANTIQO_CODE_WORKER_CONTROL_ORGANIZATION_ID, 160);
  if (!value) throw new Error("AVANTIQO_CODE_WORKER_CONTROL_ORGANIZATION_ID_REQUIRED");
  return value;
}

async function directReleaseNoPod(loaded, session, reason) {
  const state = text(session.state, 80).toUpperCase();
  if (text(session.pod_id) || !NO_POD_DIRECT_RELEASE_STATES.has(state)) return null;
  const now = new Date();
  const releaseReason = text(reason, 500) || "EXPLICIT_RELEASE";
  const metadata = {
    ...object(loaded.metadata),
    session: {
      ...session,
      state: "EXPIRED",
      pod_id: null,
      pod_base_url: null,
      engine_ready: false,
      expired_at: text(session.expired_at, 100) || now.toISOString(),
      expires_at: new Date(now.getTime() - 1000).toISOString(),
      release_requested_at: now.toISOString(),
      release_request_reason: releaseReason,
      release_reason: releaseReason,
      pod_deletion_verified: true,
      pod_deletion_required: false,
    },
    contains_worker_token: false,
  };
  const updated = await supabaseAdmin
    .from(MEMORY_TABLE)
    .update({ metadata, updated_at: now.toISOString() })
    .eq("id", loaded.id)
    .eq("updated_at", loaded.updated_at)
    .select("id,updated_at")
    .maybeSingle();
  if (updated.error) throw updated.error;
  if (!updated.data?.id) {
    throw new Error("CODE_AI_WORKER_SESSION_RELEASE_STATE_RACE_RETRY_REQUIRED");
  }
  return {
    success: true,
    contract: CODE_AI_WORKER_SESSION_RELEASE_CONTRACT,
    worker_session_contract: CODE_AI_WORKER_SESSION_CONTRACT,
    found: true,
    released: true,
    reason: releaseReason,
    previous_session_state: state || null,
    pod_deletion_verified: true,
    pod_deletion_required: false,
    session_state: "EXPIRED",
    contains_worker_token: false,
  };
}

export async function releaseCodeAIWorkerSession({ reason = "EXPLICIT_RELEASE" } = {}) {
  const organizationId = controlOrganizationId();
  const loaded = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,metadata,updated_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", MEMORY_SCOPE)
    .eq("memory_key", MEMORY_KEY)
    .eq("active", true)
    .maybeSingle();
  if (loaded.error) throw loaded.error;
  if (!loaded.data?.id) {
    return {
      success: true,
      contract: CODE_AI_WORKER_SESSION_RELEASE_CONTRACT,
      worker_session_contract: CODE_AI_WORKER_SESSION_CONTRACT,
      found: false,
      released: false,
      reason: "NO_WORKER_SESSION",
    };
  }

  const session = object(object(loaded.data.metadata).session);
  if (!Object.keys(session).length) {
    return {
      success: true,
      contract: CODE_AI_WORKER_SESSION_RELEASE_CONTRACT,
      worker_session_contract: CODE_AI_WORKER_SESSION_CONTRACT,
      found: true,
      released: false,
      reason: "NO_SESSION_STATE",
    };
  }
  if (session.state === "EXPIRED" && !text(session.pod_id)) {
    return {
      success: true,
      contract: CODE_AI_WORKER_SESSION_RELEASE_CONTRACT,
      worker_session_contract: CODE_AI_WORKER_SESSION_CONTRACT,
      found: true,
      released: true,
      reason: "ALREADY_EXPIRED",
    };
  }

  const direct = await directReleaseNoPod(loaded.data, session, reason);
  if (direct) return direct;

  const now = new Date();
  const metadata = {
    ...object(loaded.data.metadata),
    session: {
      ...session,
      expires_at: new Date(now.getTime() - 1000).toISOString(),
      release_requested_at: now.toISOString(),
      release_request_reason: text(reason, 500) || "EXPLICIT_RELEASE",
    },
    contains_worker_token: false,
  };
  const updated = await supabaseAdmin
    .from(MEMORY_TABLE)
    .update({ metadata, updated_at: now.toISOString() })
    .eq("id", loaded.data.id)
    .eq("updated_at", loaded.data.updated_at)
    .select("id,updated_at")
    .maybeSingle();
  if (updated.error) throw updated.error;
  if (!updated.data?.id) {
    throw new Error("CODE_AI_WORKER_SESSION_RELEASE_STATE_RACE_RETRY_REQUIRED");
  }

  const reaped = await reapExpiredCodeAIWorkerSession();
  if (reaped.reaped !== true || reaped.session_state !== "EXPIRED") {
    throw new Error("CODE_AI_WORKER_SESSION_EXPLICIT_RELEASE_NOT_VERIFIED");
  }

  return {
    success: true,
    contract: CODE_AI_WORKER_SESSION_RELEASE_CONTRACT,
    worker_session_contract: CODE_AI_WORKER_SESSION_CONTRACT,
    found: true,
    released: true,
    reason: text(reason, 500) || "EXPLICIT_RELEASE",
    pod_deletion_verified: true,
    pod_deletion_required: true,
    session_state: "EXPIRED",
    contains_worker_token: false,
  };
}

export const CodeAIWorkerSessionReleaseRuntime = Object.freeze({
  contract: CODE_AI_WORKER_SESSION_RELEASE_CONTRACT,
  release: releaseCodeAIWorkerSession,
});

export default CodeAIWorkerSessionReleaseRuntime;
