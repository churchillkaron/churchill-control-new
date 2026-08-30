import crypto from "node:crypto";

export const AVANTIQO_LIVE_EXECUTION_CONTRACT =
  "AVANTIQO_LIVE_EXECUTION_V1";

const MEMORY_TABLE = "intelligence_memories";
const MEMORY_SCOPE = "avantiqo_live_execution";
const MEMORY_SOURCE = "avantiqo_live_execution_runtime";
const MAX_EVENTS = 60;

function text(value, maximum = 4000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function actorId(context = {}) {
  return text(context?.actor?.id || context?.actor?.user_id, 160) || null;
}

function organizationId(context = {}) {
  return text(context.organizationId || context.organization_id, 160) || null;
}

function rowKey(actor) {
  return `avantiqo_live_execution:v1:${crypto
    .createHash("sha256")
    .update(actor, "utf8")
    .digest("hex")
    .slice(0, 32)}`;
}

async function adminClient() {
  const runtime = await import("../../shared/supabase/admin.js");
  return runtime.supabaseAdmin;
}

function compactEvent(event = {}) {
  const source = object(event);
  return {
    at: text(source.at, 80) || new Date().toISOString(),
    lane: text(source.lane, 80) || "intelligence",
    phase: text(source.phase, 120) || "WORKING",
    status: text(source.status, 80) || "running",
    description: text(source.description, 1000) || null,
    capability_key: text(source.capability_key, 300) || null,
    operation_id: text(source.operation_id, 240) || null,
    action: text(source.action, 120) || null,
    files_changed: list(source.files_changed)
      .map((item) => text(item, 1000))
      .filter(Boolean)
      .slice(0, 50),
    command: text(source.command, 500) || null,
    command_args: list(source.command_args)
      .map((item) => text(item, 400))
      .filter(Boolean)
      .slice(0, 24),
    read_only: source.read_only === true,
    mutation_possible: source.mutation_possible === true,
    mutation_running: source.mutation_running === true,
    paid_execution_possible: source.paid_execution_possible === true,
    paid_execution_running: source.paid_execution_running === true,
    verification_running: source.verification_running === true,
    verification_passed:
      source.verification_passed === true
        ? true
        : source.verification_passed === false
          ? false
          : null,
    reason: text(source.reason, 1000) || null,
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
    .eq("memory_key", rowKey(actor))
    .eq("active", true)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

async function writeState(context, state) {
  const orgId = organizationId(context);
  const actor = actorId(context);
  if (!orgId || !actor) {
    return { persisted: false, reason: "AVANTIQO_LIVE_EXECUTION_SCOPE_UNAVAILABLE" };
  }
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
      memory_key: rowKey(actor),
      memory_type: "fact",
      subject: "Avantiqo Live Execution",
      content: `Live execution ${text(state.status, 80) || "running"}: ${text(state.latest_event?.description, 500) || text(state.latest_event?.phase, 120) || "working"}.`,
      importance: 0.01,
      confidence: 1,
      source: MEMORY_SOURCE,
      active: true,
      metadata: {
        contract: AVANTIQO_LIVE_EXECUTION_CONTRACT,
        actor_id: actor,
        live_execution: state,
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
    live_execution: state,
  };
}

export async function beginAvantiqoLiveExecution({
  context = {},
  lane = "intelligence",
  description = "Understanding the request and checking current context.",
} = {}) {
  const now = new Date().toISOString();
  const event = compactEvent({
    at: now,
    lane,
    phase: "REQUEST_RECEIVED",
    status: "running",
    description,
    read_only: true,
  });
  return writeState(context, {
    contract: AVANTIQO_LIVE_EXECUTION_CONTRACT,
    execution_id: crypto.randomUUID(),
    status: "running",
    active: true,
    stop_requested: false,
    stop_requested_at: null,
    started_at: now,
    updated_at: now,
    latest_event: event,
    events: [event],
    raw_reasoning_persisted: false,
    source_content_persisted: false,
    secrets_persisted: false,
  });
}

export async function publishAvantiqoLiveExecution({
  context = {},
  event = {},
} = {}) {
  const previous = await loadRow(context);
  const previousState = object(previous?.metadata?.live_execution);
  if (!Object.keys(previousState).length) {
    return beginAvantiqoLiveExecution({
      context,
      lane: event.lane,
      description: event.description,
    });
  }
  const compact = compactEvent(event);
  const terminal = ["completed", "failed", "cancelled", "blocked"].includes(
    text(compact.status, 80).toLowerCase(),
  );
  const now = new Date().toISOString();
  const state = {
    ...previousState,
    status: terminal ? compact.status : "running",
    active: !terminal,
    updated_at: now,
    latest_event: compact,
    events: [...list(previousState.events), compact].slice(-MAX_EVENTS),
    raw_reasoning_persisted: false,
    source_content_persisted: false,
    secrets_persisted: false,
  };
  return writeState(context, state);
}

export async function loadAvantiqoLiveExecution({ context = {} } = {}) {
  const row = await loadRow(context);
  if (!row?.id) return { found: false, live_execution: null };
  const metadata = object(row.metadata);
  if (text(metadata.actor_id, 160) !== actorId(context)) {
    throw new Error("AVANTIQO_LIVE_EXECUTION_ACTOR_SCOPE_MISMATCH");
  }
  return {
    found: true,
    row_id: row.id,
    updated_at: row.updated_at || null,
    live_execution: object(metadata.live_execution),
  };
}

export async function requestAvantiqoLiveExecutionStop({ context = {} } = {}) {
  const loaded = await loadAvantiqoLiveExecution({ context });
  if (!loaded.found) {
    return { requested: false, reason: "AVANTIQO_LIVE_EXECUTION_NOT_FOUND" };
  }
  const previous = object(loaded.live_execution);
  const now = new Date().toISOString();
  const event = compactEvent({
    at: now,
    lane: text(previous.latest_event?.lane, 80) || "operator",
    phase: "STOP_REQUESTED",
    status: "running",
    description: "Stop requested by the operator. Avantiqo will stop at the next safe execution boundary.",
    read_only: true,
    reason: "USER_STOP_REQUESTED",
  });
  const state = {
    ...previous,
    stop_requested: true,
    stop_requested_at: now,
    updated_at: now,
    latest_event: event,
    events: [...list(previous.events), event].slice(-MAX_EVENTS),
  };
  const written = await writeState(context, state);
  return {
    requested: written.persisted === true,
    execution_id: previous.execution_id || null,
    stop_requested_at: now,
  };
}

export async function avantiqoLiveExecutionStopRequested({ context = {} } = {}) {
  const loaded = await loadAvantiqoLiveExecution({ context });
  return loaded.found === true && loaded.live_execution?.stop_requested === true;
}

export async function assertAvantiqoLiveExecutionContinue({
  context = {},
  error_code = "AVANTIQO_EXECUTION_STOP_REQUESTED",
} = {}) {
  if (await avantiqoLiveExecutionStopRequested({ context })) {
    throw new Error(error_code);
  }
  return true;
}

export const AvantiqoLiveExecutionRuntime = Object.freeze({
  contract: AVANTIQO_LIVE_EXECUTION_CONTRACT,
  max_events: MAX_EVENTS,
  begin: beginAvantiqoLiveExecution,
  publish: publishAvantiqoLiveExecution,
  load: loadAvantiqoLiveExecution,
  requestStop: requestAvantiqoLiveExecutionStop,
  stopRequested: avantiqoLiveExecutionStopRequested,
  assertContinue: assertAvantiqoLiveExecutionContinue,
});

export default AvantiqoLiveExecutionRuntime;
