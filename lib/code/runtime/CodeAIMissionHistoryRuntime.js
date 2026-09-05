import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { verifyCodeMissionStateAttestation } from "@/lib/code/runtime/CodeMissionAttestationRuntime";

export const CODE_AI_MISSION_HISTORY_CONTRACT =
  "AVANTIQO_CODE_AI_MISSION_HISTORY_V1";

const MEMORY_TABLE = "intelligence_memories";
const ARTIFACT_SCOPE = "code_ai_commit_artifact";
const INTERVENTION_SCOPE = "code_ai_owner_intervention";
const COMMIT_ARTIFACT_CONTRACT = "AVANTIQO_CODE_AI_COMMIT_ARTIFACT_V1";
const MAX_HISTORY_ROWS = 120;
const MAX_DETAIL_PATCH_CHARS = 180000;
const MAX_SAFE_TIMELINE = 80;

function text(value, maximum = 4000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function organizationId(context = {}) {
  return text(context.organizationId || context.organization_id, 160) || null;
}

function actorId(context = {}) {
  return text(context?.actor?.id || context?.actor?.user_id, 160) || null;
}

function boundedLimit(value, fallback = 20) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(50, parsed);
}

function assertContext(context = {}) {
  const orgId = organizationId(context);
  const actor = actorId(context);
  if (!orgId) throw new Error("CODE_AI_MISSION_HISTORY_ORGANIZATION_REQUIRED");
  if (!actor) throw new Error("CODE_AI_MISSION_HISTORY_ACTOR_REQUIRED");
  return { orgId, actor };
}

function artifactMetadata(row = {}) {
  const metadata = object(row.metadata);
  if (text(metadata.contract, 180) !== COMMIT_ARTIFACT_CONTRACT) {
    throw new Error("CODE_AI_MISSION_HISTORY_ARTIFACT_CONTRACT_INVALID");
  }
  return metadata;
}

function missionState(row = {}, { orgId, actor }) {
  const metadata = artifactMetadata(row);
  if (text(metadata.actor_id, 160) !== actor) {
    throw new Error("CODE_AI_MISSION_HISTORY_ACTOR_SCOPE_MISMATCH");
  }
  const state = object(metadata.mission_state);
  if (!Object.keys(state).length) {
    throw new Error("CODE_AI_MISSION_HISTORY_STATE_MISSING");
  }
  verifyCodeMissionStateAttestation(state);
  if (text(state.organization_id, 160) !== orgId) {
    throw new Error("CODE_AI_MISSION_HISTORY_ORGANIZATION_SCOPE_MISMATCH");
  }
  if (text(state.actor_id, 160) !== actor) {
    throw new Error("CODE_AI_MISSION_HISTORY_ACTOR_SCOPE_MISMATCH");
  }
  return { metadata, state };
}

function safeVerification(state = {}) {
  return list(state.verification).slice(-24).map((entry) => ({
    at: text(entry?.at, 120) || null,
    operation_id: text(entry?.operation_id, 200) || null,
    command: text(entry?.command, 300) || null,
    args: list(entry?.args).slice(0, 16).map((arg) => text(arg, 500)).filter(Boolean),
    exit_code:
      entry?.exit_code === null || entry?.exit_code === undefined
        ? null
        : Number(entry.exit_code),
    passed: entry?.passed === true,
  }));
}

function safeTests(state = {}) {
  return list(state.tests).slice(-24).map((entry) => ({
    at: text(entry?.at, 120) || null,
    operation_id: text(entry?.operation_id, 200) || null,
    command: text(entry?.command, 300) || null,
    args: list(entry?.args).slice(0, 16).map((arg) => text(arg, 500)).filter(Boolean),
    exit_code:
      entry?.exit_code === null || entry?.exit_code === undefined
        ? null
        : Number(entry.exit_code),
    passed: entry?.passed === true,
  }));
}

function safeTimeline(state = {}) {
  return list(state.evidence)
    .filter((entry) => {
      const kind = text(entry?.kind, 120);
      return [
        "operation",
        "failure",
        "employee_controller",
        "product_completion_criteria_evidence",
      ].includes(kind);
    })
    .slice(-MAX_SAFE_TIMELINE)
    .map((entry) => ({
      at: text(entry?.at, 120) || null,
      kind: text(entry?.kind, 120) || null,
      status: text(entry?.status, 120) || null,
      action: text(entry?.action, 120) || null,
      operation_id: text(entry?.operation_id, 200) || null,
      description: text(entry?.description, 1400) || null,
      reason: text(entry?.reason, 800) || null,
      verification_passed:
        typeof entry?.verification_passed === "boolean"
          ? entry.verification_passed
          : null,
    }));
}

function integrityProjection(row, scope) {
  try {
    const loaded = missionState(row, scope);
    return { valid: true, ...loaded, error: null };
  } catch (error) {
    return {
      valid: false,
      metadata: object(row.metadata),
      state: object(row?.metadata?.mission_state),
      error: text(error?.message || error, 500) || "CODE_AI_MISSION_HISTORY_INTEGRITY_INVALID",
    };
  }
}

function summaryProjection(row, scope) {
  const integrity = integrityProjection(row, scope);
  const metadata = integrity.metadata;
  const state = integrity.state;
  const files = list(state.files_changed).map((item) => text(item, 1000)).filter(Boolean);
  const verification = safeVerification(state);
  const patch = String(state.patch ?? "");
  const commitAttempted = metadata.commit_attempted === true;

  return {
    contract: CODE_AI_MISSION_HISTORY_CONTRACT,
    execution_key: text(metadata.execution_key, 160) || null,
    mission_id: text(state.mission_id, 240) || null,
    objective: text(state.objective, 4000) || null,
    repository_url: text(state.repository_url || metadata.repository_url, 1000) || null,
    ref: text(state.ref || metadata.ref, 160) || null,
    base_commit: text(state.base_commit || metadata.base_commit, 160) || null,
    status: text(state.status, 120) || null,
    files_changed: files,
    file_count: files.length,
    test_count: list(state.tests).length,
    verification_count: verification.length,
    verification_passed: verification.some((item) => item.passed === true),
    failure_count: list(state.failures).length,
    blocker_count: list(state.blockers).length,
    patch_present: Boolean(patch.trim()),
    patch_chars: patch.length,
    commit_attempted: commitAttempted,
    commit_attempted_at: text(metadata.commit_attempted_at, 120) || null,
    integrity_verified: integrity.valid,
    resumable: integrity.valid && !commitAttempted,
    resume_blocker: !integrity.valid
      ? integrity.error
      : commitAttempted
        ? "CODE_AI_MISSION_HISTORY_PERSISTENCE_ALREADY_ATTEMPTED"
        : null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    authorization_effect: "NONE",
    commit_authority: false,
    production_deploy_authority: false,
  };
}

async function artifactRows({ context, limit = MAX_HISTORY_ROWS } = {}) {
  const scope = assertContext(context);
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,memory_key,metadata,active,created_at,updated_at")
    .eq("organization_id", scope.orgId)
    .eq("memory_scope", ARTIFACT_SCOPE)
    .contains("metadata", { actor_id: scope.actor })
    .order("updated_at", { ascending: false })
    .limit(Math.min(MAX_HISTORY_ROWS, Math.max(1, Number(limit || MAX_HISTORY_ROWS))));
  if (result.error) throw result.error;
  return { scope, rows: result.data || [] };
}

async function interventionRows({ context, missionId }) {
  const scope = assertContext(context);
  const mission = text(missionId, 240);
  if (!mission) throw new Error("CODE_AI_MISSION_HISTORY_MISSION_ID_REQUIRED");
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,metadata,active,created_at,updated_at")
    .eq("organization_id", scope.orgId)
    .eq("memory_scope", INTERVENTION_SCOPE)
    .contains("metadata", { actor_id: scope.actor, mission_id: mission })
    .order("created_at", { ascending: true })
    .limit(120);
  if (result.error) throw result.error;
  return (result.data || []).map((row) => {
    const metadata = object(row.metadata);
    return {
      id: row.id || null,
      action: text(metadata.action, 80) || null,
      instruction: text(metadata.instruction, 2000) || null,
      status: text(metadata.status, 80) || null,
      consume_at_safe_boundary: metadata.consume_at_safe_boundary === true,
      submitted_at: text(metadata.submitted_at, 120) || row.created_at || null,
      applied_at: text(metadata.applied_at, 120) || null,
      authorization_effect: "NONE",
      commit_authority: false,
      production_deploy_authority: false,
    };
  });
}

function rowForMission(rows, missionId) {
  const mission = text(missionId, 240);
  if (!mission) throw new Error("CODE_AI_MISSION_HISTORY_MISSION_ID_REQUIRED");
  return rows.find((row) =>
    text(row?.metadata?.mission_state?.mission_id, 240) === mission
  ) || null;
}

export async function listCodeAIMissionHistory({
  context = {},
  limit = 20,
} = {}) {
  const requested = boundedLimit(limit, 20);
  const loaded = await artifactRows({ context, limit: MAX_HISTORY_ROWS });
  const seen = new Set();
  const sessions = [];
  for (const row of loaded.rows) {
    const projected = summaryProjection(row, loaded.scope);
    if (!projected.mission_id || seen.has(projected.mission_id)) continue;
    seen.add(projected.mission_id);
    sessions.push(projected);
    if (sessions.length >= requested) break;
  }
  return {
    contract: CODE_AI_MISSION_HISTORY_CONTRACT,
    sessions,
    count: sessions.length,
    actor_scoped: true,
    organization_scoped: true,
    raw_reasoning_returned: false,
    raw_resume_state_returned: false,
    authorization_effect: "NONE",
  };
}

export async function loadCodeAIMissionHistoryDetail({
  context = {},
  missionId,
} = {}) {
  const loaded = await artifactRows({ context, limit: MAX_HISTORY_ROWS });
  const row = rowForMission(loaded.rows, missionId);
  if (!row) return { found: false, session: null };

  const integrity = integrityProjection(row, loaded.scope);
  const summary = summaryProjection(row, loaded.scope);
  const state = integrity.state;
  const patch = String(state.patch ?? "");
  const interventions = await interventionRows({ context, missionId: summary.mission_id });

  return {
    found: true,
    session: {
      ...summary,
      tests: safeTests(state),
      verification: safeVerification(state),
      interventions,
      timeline: safeTimeline(state),
      blockers: list(state.blockers).slice(-24).map((item) => text(item, 1000)).filter(Boolean),
      failures: list(state.failures).slice(-20).map((item) => ({
        at: text(item?.at, 120) || null,
        operation_id: text(item?.operation_id, 200) || null,
        action: text(item?.action, 120) || null,
        message: text(item?.message, 1000) || null,
      })),
      patch: patch.slice(0, MAX_DETAIL_PATCH_CHARS) || null,
      patch_truncated: patch.length > MAX_DETAIL_PATCH_CHARS,
      raw_reasoning_returned: false,
      raw_resume_state_returned: false,
    },
  };
}

export async function loadCodeAIMissionResumeSnapshot({
  context = {},
  missionId,
} = {}) {
  const loaded = await artifactRows({ context, limit: MAX_HISTORY_ROWS });
  const row = rowForMission(loaded.rows, missionId);
  if (!row) return { found: false, resume_state: null };
  const { metadata, state } = missionState(row, loaded.scope);
  if (metadata.commit_attempted === true) {
    throw new Error("CODE_AI_MISSION_HISTORY_PERSISTENCE_ALREADY_ATTEMPTED");
  }
  return {
    found: true,
    contract: CODE_AI_MISSION_HISTORY_CONTRACT,
    execution_key: text(metadata.execution_key, 160) || null,
    mission_id: text(state.mission_id, 240) || null,
    objective: text(state.objective, 4000) || null,
    repository_url: text(state.repository_url, 1000) || null,
    ref: text(state.ref, 160) || "main",
    resume_state: state,
    integrity_verified: true,
    authorization_effect: "NONE",
    commit_authority: false,
    production_deploy_authority: false,
  };
}

export const CodeAIMissionHistoryRuntime = Object.freeze({
  contract: CODE_AI_MISSION_HISTORY_CONTRACT,
  list: listCodeAIMissionHistory,
  detail: loadCodeAIMissionHistoryDetail,
  resume: loadCodeAIMissionResumeSnapshot,
  actor_scoped: true,
  organization_scoped: true,
  raw_reasoning_returned: false,
});

export default CodeAIMissionHistoryRuntime;
