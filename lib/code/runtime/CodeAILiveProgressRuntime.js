import crypto from "node:crypto";

export const CODE_AI_LIVE_PROGRESS_CONTRACT =
  "AVANTIQO_CODE_AI_LIVE_PROGRESS_V1";

const MEMORY_TABLE = "intelligence_memories";
const MEMORY_SCOPE = "code_ai_live_progress";
const MEMORY_SOURCE = "code_ai_live_progress_runtime";
const MAX_EVENTS = 40;
const ACTIVE_WORKER_IDLE_MS = 30 * 60 * 1000;

function text(value, maximum = 4000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function enabled(value) {
  return ["1", "true", "yes", "on"].includes(text(value, 20).toLowerCase());
}

async function adminClient() {
  const runtime = await import("../../shared/supabase/admin.js");
  return runtime.supabaseAdmin;
}

async function refreshActiveWorkerLease() {
  if (!enabled(process.env.AVANTIQO_CODE_WORKER_SESSION_ENABLED)) return false;
  try {
    const runtime = await import("./CodeAIWorkerLeaseTouchRuntime.js");
    const result = await runtime.touchReadyCodeAIWorkerLease({
      idle_ms: ACTIVE_WORKER_IDLE_MS,
    });
    return result?.touched === true;
  } catch (error) {
    console.error(JSON.stringify({
      event: "AVANTIQO_CODE_ACTIVE_LEASE_REFRESH_FAILED",
      reason: text(error?.message || error, 300),
      mission_execution_blocked: false,
      worker_lifecycle_mutation_performed: false,
      secrets_printed: false,
    }));
    return false;
  }
}

function actorId(context = {}) {
  return text(context?.actor?.id || context?.actor?.user_id, 160) || null;
}

function organizationId(context = {}) {
  return text(context.organizationId || context.organization_id, 160) || null;
}

function memoryKey(actor) {
  const digest = crypto.createHash("sha256").update(actor, "utf8").digest("hex").slice(0, 32);
  return `code_ai_live_progress:v1:${digest}`;
}

function compactEvent(event = {}) {
  const source = object(event);
  return {
    at: text(source.at, 80) || new Date().toISOString(),
    phase: text(source.phase, 80) || "WORKING",
    status: text(source.status, 80) || "running",
    mission_id: text(source.mission_id, 200) || null,
    reasoning_call: Number.isFinite(Number(source.reasoning_call))
      ? Number(source.reasoning_call)
      : null,
    operation_id: text(source.operation_id, 200) || null,
    action: text(source.action, 80) || null,
    description: text(source.description, 700) || null,
    files_changed: list(source.files_changed)
      .map((item) => text(item, 1000))
      .filter(Boolean)
      .slice(0, 40),
    command: text(source.command, 300) || null,
    command_args: list(source.command_args)
      .map((item) => text(item, 300))
      .slice(0, 20),
    exit_code: Number.isFinite(Number(source.exit_code)) ? Number(source.exit_code) : null,
    verification_passed:
      source.verification_passed === true
        ? true
        : source.verification_passed === false
          ? false
          : null,
    reason: text(source.reason, 700) || null,
    raw_reasoning_persisted: false,
    source_content_persisted: false,
    secrets_persisted: false,
  };
}

function compactSkill(skill = {}) {
  const source = object(skill);
  const lifecycle = object(source.lifecycle);
  return {
    skill_id: text(source.skill_id, 160) || null,
    type: text(source.type, 120) || null,
    title: text(source.title, 700) || null,
    area: text(source.area, 500) || null,
    confidence: Number.isFinite(Number(source.confidence)) ? Number(source.confidence) : null,
    support_count: Number(source.support_count || 0),
    objective_relevance_score: Number(source.objective_relevance_score || 0),
    skill_rank_score: Number(source.skill_rank_score || 0),
    repair_pattern: source.repair_pattern === true,
    verifier_count: list(source.verifiers).length,
    source_mission_count: list(source.source_missions).length,
    lifecycle_state: text(lifecycle.lifecycle_state, 80) || "UNOBSERVED",
    lifecycle_score: Number.isFinite(Number(lifecycle.lifecycle_score))
      ? Number(lifecycle.lifecycle_score)
      : null,
    suppressed: lifecycle.suppressed === true,
    decaying: lifecycle.decaying === true,
    promotion_candidate: lifecycle.promotion_candidate === true,
    current_head_revalidation_required: true,
    authorization_effect: "NONE",
  };
}

function compactEngineeringMemory(memory = {}) {
  const source = object(memory);
  return {
    evaluated: source.evaluated === true,
    count: Number(source.count || 0),
    utility_adjusted_ranking: source.utility_adjusted_ranking === true,
    suppressed_candidate_count: Number(source.suppressed_candidate_count || 0),
    matches: list(source.matches).slice(0, 3).map((match) => ({
      mission_id: text(match?.mission_id, 240) || null,
      objective: text(match?.objective, 700) || null,
      relevance_score: Number(match?.relevance_score || 0),
      currentness_status: text(match?.currentness_status, 80) || null,
      files_changed_count: list(match?.files_changed).length,
      successful_verifier_count: list(match?.successful_verifiers).length,
      repaired_verifier_count: list(match?.repaired_verifiers).length,
    })),
    current_head_revalidation_required: true,
    patch_replay_allowed: false,
    raw_reasoning_returned: false,
    authorization_effect: "NONE",
  };
}

function compactFormedSkills(value = {}) {
  const source = object(value);
  return {
    evaluated: source.evaluated === true,
    count: Number(source.count || 0),
    positive_utility_sessions: Number(source.positive_utility_sessions || 0),
    lifecycle_evaluated: source.lifecycle_evaluated === true,
    lifecycle_suppressed_count: Number(source.lifecycle_suppressed_count || 0),
    equivalent_skill_merge_count: Number(source.equivalent_skill_merge_count || 0),
    broad_skill_split_count: Number(source.broad_skill_split_count || 0),
    skills: list(source.skills).slice(0, 4).map(compactSkill),
    current_head_revalidation_required: true,
    persisted_as_trusted_rule: false,
    automatic_knowledge_promotion: false,
    authorization_effect: "NONE",
  };
}

function projectionFromState(state = {}, event = null) {
  const source = object(state);
  const latestVerification = list(source.verification).slice(-1)[0] || null;
  const latestTest = list(source.tests).slice(-1)[0] || null;
  return {
    contract: CODE_AI_LIVE_PROGRESS_CONTRACT,
    mission_id: text(source.mission_id, 200) || text(event?.mission_id, 200) || null,
    objective: text(source.objective, 1200) || null,
    repository_url: text(source.repository_url, 500) || null,
    ref: text(source.ref, 160) || null,
    state_status: text(source.status, 100) || text(event?.status, 80) || "running",
    current_operation_id:
      text(source.current_operation_id, 200) || text(event?.operation_id, 200) || null,
    completed_operation_count: list(source.completed_operation_ids).length,
    files_changed: list(source.files_changed)
      .map((item) => text(item, 1000))
      .filter(Boolean)
      .slice(0, 100),
    verified_engineering_memory: compactEngineeringMemory(source.verified_engineering_memory),
    formed_engineering_skills: compactFormedSkills(source.formed_engineering_skills),
    latest_verification_passed:
      latestVerification?.passed === true
        ? true
        : latestVerification?.passed === false
          ? false
          : null,
    latest_verification_operation_id: text(latestVerification?.operation_id, 200) || null,
    latest_test_command: text(latestTest?.command, 300) || null,
    latest_test_args: list(latestTest?.args).slice(0, 20).map((item) => text(item, 300)),
    latest_test_exit_code: Number.isFinite(Number(latestTest?.exit_code))
      ? Number(latestTest.exit_code)
      : null,
    failure_count: list(source.failures).length,
    blocker_count: list(source.blockers).length,
    updated_at: new Date().toISOString(),
    warm_worker_idle_ms: ACTIVE_WORKER_IDLE_MS,
    active_work_refreshes_worker_lease: true,
    active_lease_refresh_is_lifecycle_non_mutating: true,
    raw_reasoning_persisted: false,
    source_content_persisted: false,
    secrets_persisted: false,
  };
}

async function loadRow(context) {
  const orgId = organizationId(context);
  const actor = actorId(context);
  if (!orgId || !actor) return null;
  const supabaseAdmin = await adminClient();
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,metadata,updated_at")
    .eq("organization_id", orgId)
    .eq("memory_scope", MEMORY_SCOPE)
    .eq("memory_key", memoryKey(actor))
    .eq("active", true)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

export async function publishCodeAILiveProgress({
  context = {},
  state = {},
  event = {},
} = {}) {
  const workerLeaseRefreshed = await refreshActiveWorkerLease();
  const orgId = organizationId(context);
  const actor = actorId(context);
  if (!orgId || !actor) {
    return {
      persisted: false,
      reason: "CODE_AI_LIVE_PROGRESS_SCOPE_UNAVAILABLE",
      worker_lease_refreshed: workerLeaseRefreshed,
    };
  }

  const previous = await loadRow(context);
  const previousMetadata = object(previous?.metadata);
  const previousProgress = object(previousMetadata.live_progress);
  const compact = compactEvent(event);
  const events = [...list(previousProgress.events), compact].slice(-MAX_EVENTS);
  const projection = projectionFromState(state, compact);
  const now = new Date().toISOString();
  const supabaseAdmin = await adminClient();

  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .upsert({
      organization_id: orgId,
      party_id: null,
      entity_id: null,
      conversation_id: null,
      source_turn_id: null,
      memory_scope: MEMORY_SCOPE,
      memory_key: memoryKey(actor),
      memory_type: "fact",
      subject: "Code AI Live Progress",
      content: `Live Code mission status: ${projection.state_status}. Current phase: ${compact.phase}.`,
      importance: 0.02,
      confidence: 1,
      source: MEMORY_SOURCE,
      active: true,
      metadata: {
        contract: CODE_AI_LIVE_PROGRESS_CONTRACT,
        actor_id: actor,
        live_progress: {
          ...projection,
          latest_event: compact,
          events,
        },
        ordinary_memory_recall: false,
        authorization_effect: "NONE",
      },
      updated_at: now,
    }, {
      onConflict: "organization_id,memory_scope,memory_key",
    })
    .select("id,updated_at")
    .maybeSingle();

  if (result.error) throw result.error;
  return {
    persisted: Boolean(result.data?.id),
    row_id: result.data?.id || null,
    updated_at: result.data?.updated_at || now,
    worker_lease_refreshed: workerLeaseRefreshed,
    live_progress: {
      ...projection,
      latest_event: compact,
      events,
    },
  };
}

export async function loadCodeAILiveProgress({ context = {} } = {}) {
  const orgId = organizationId(context);
  const actor = actorId(context);
  if (!orgId || !actor) {
    return { found: false, live_progress: null };
  }
  const row = await loadRow(context);
  if (!row?.id) return { found: false, live_progress: null };
  const metadata = object(row.metadata);
  if (text(metadata.actor_id, 160) !== actor) {
    throw new Error("CODE_AI_LIVE_PROGRESS_ACTOR_SCOPE_MISMATCH");
  }
  return {
    found: true,
    row_id: row.id,
    updated_at: row.updated_at || null,
    live_progress: object(metadata.live_progress),
  };
}

export const CodeAILiveProgressRuntime = Object.freeze({
  contract: CODE_AI_LIVE_PROGRESS_CONTRACT,
  publish: publishCodeAILiveProgress,
  load: loadCodeAILiveProgress,
  max_events: MAX_EVENTS,
  active_worker_idle_ms: ACTIVE_WORKER_IDLE_MS,
});

export default CodeAILiveProgressRuntime;
