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
    session_state: "EXPIRED",
    contains_worker_token: false,
  };
}

export const CodeAIWorkerSessionReleaseRuntime = Object.freeze({
  contract: CODE_AI_WORKER_SESSION_RELEASE_CONTRACT,
  release: releaseCodeAIWorkerSession,
});

export default CodeAIWorkerSessionReleaseRuntime;
