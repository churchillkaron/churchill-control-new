import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { completeSecretaryExecutiveDirective } from "@/lib/operator/secretary/SecretaryExecutiveDirectiveRegisterRuntime";
import {
  resolveSecretaryAdministrativeCoverage,
  resolveSecretaryCanonicalOwner,
  secretaryAdministrativeCoverageMetadata,
} from "@/lib/operator/secretary/SecretaryAdministrativeCoverageRoutingRuntime";

const CONTRACT = "AVANTIQO_EXECUTIVE_SECRETARY_DIRECTIVE_FOLLOW_THROUGH_V1";
const REGISTER_CONTRACT = "AVANTIQO_EXECUTIVE_SECRETARY_DIRECTIVE_REGISTER_V1";
const DIRECTIVE_SOURCE = "secretary_directive_register";
const LEDGER_KEY = "directive_register_v1";
const FOLLOW_KEY = "directive_follow_through_v1";
const DELIVERY_MODES = new Set(["TRACK_ONLY", "DELIVER_EXACT"]);
const RESPONSE_KINDS = new Set(["ACKNOWLEDGED", "NEEDS_CLARIFICATION", "DECLINED"]);
const TASK_TERMINAL = new Set(["DONE", "CANCELLED"]);
const JOB_TERMINAL = new Set(["COMPLETED", "FAILED", "CANCELLED"]);
const HIGH_AUTHORITY_PATTERN = /\b(?:pay(?:ment)?|transfer|wire|refund|sign(?:ature)?|approve|approval|accept\s+(?:an?\s+)?(?:offer|contract|agreement)|purchase|buy|book|reserve|bind|authorize|authorise|execute\s+(?:a\s+)?(?:contract|agreement)|submit\s+(?:a\s+)?(?:filing|return|application))\b/i;

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function exactText(value, field, { required = false, limit = 20000 } = {}) {
  if (value === undefined || value === null) {
    if (required) throw new Error(`SECRETARY_DIRECTIVE_FOLLOW_THROUGH_${field.toUpperCase()}_REQUIRED`);
    return null;
  }
  const raw = String(value);
  if (!raw.trim()) {
    if (required) throw new Error(`SECRETARY_DIRECTIVE_FOLLOW_THROUGH_${field.toUpperCase()}_REQUIRED`);
    return null;
  }
  if (raw.length > limit) throw new Error(`SECRETARY_DIRECTIVE_FOLLOW_THROUGH_${field.toUpperCase()}_TOO_LONG`);
  return raw;
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function organizationId(context = {}) {
  const id = text(context.organizationId, 120);
  if (!id) throw new Error("SECRETARY_ORGANIZATION_REQUIRED");
  return id;
}

function actorPartyId(context = {}) {
  const id = text(context.actor?.partyId || context.actor?.party_id || context.metadata?.partyId, 120);
  if (!id) throw new Error("SECRETARY_REQUESTED_BY_PARTY_REQUIRED");
  return id;
}

function iso(value, field, { required = false } = {}) {
  const raw = text(value, 180);
  if (!raw) {
    if (required) throw new Error(`SECRETARY_DIRECTIVE_FOLLOW_THROUGH_${field.toUpperCase()}_REQUIRED`);
    return null;
  }
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) throw new Error(`SECRETARY_DIRECTIVE_FOLLOW_THROUGH_${field.toUpperCase()}_INVALID`);
  return new Date(parsed).toISOString();
}

function deterministicUuid(seed) {
  const chars = createHash("sha256").update(seed).digest("hex").slice(0, 32).split("");
  chars[12] = "5";
  chars[16] = ((Number.parseInt(chars[16], 16) & 0x3) | 0x8).toString(16);
  const hex = chars.join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function safetyFlags() {
  return {
    directive_inferred: false,
    directive_issued_by_secretary: false,
    target_inferred: false,
    due_at_inferred: false,
    acknowledgement_inferred: false,
    acceptance_inferred: false,
    commitment_inferred: false,
    progress_inferred: false,
    completion_inferred: false,
    directive_completion_inferred: false,
    execution_link_inferred: false,
    payment_authority_created: false,
    signing_authority_created: false,
    booking_authority_created: false,
    approval_authority_delegated: false,
    binding_authority_delegated: false,
    platform_permissions_mutated: false,
    external_authority_used: false,
  };
}

async function one(result) {
  const resolved = await result;
  if (resolved.error) throw resolved.error;
  return resolved.data || null;
}

async function many(result) {
  const resolved = await result;
  if (resolved.error) throw resolved.error;
  return Array.isArray(resolved.data) ? resolved.data : [];
}

async function administrativeRouting({ organization, actor, instruction, at = new Date().toISOString() }) {
  const canonicalOwner = await resolveSecretaryCanonicalOwner({ organizationId: organization }) || actor;
  const routing = await resolveSecretaryAdministrativeCoverage({
    organizationId: organization,
    ownerPartyId: canonicalOwner,
    scope: "FOLLOW_UP_COORDINATION",
    instruction,
    at,
    requiresOwnerAuthority: false,
  });
  if (routing.coverage_routing_review_required === true) {
    throw new Error(`SECRETARY_DIRECTIVE_FOLLOW_THROUGH_COVERAGE_REVIEW_REQUIRED:${routing.routing_reason}`);
  }
  const operational = text(routing.operational_assignee_party_id, 120) || canonicalOwner;
  if (actor !== canonicalOwner && actor !== operational) {
    throw new Error("SECRETARY_DIRECTIVE_FOLLOW_THROUGH_ACTOR_NOT_AUTHORIZED");
  }
  return { canonicalOwner, operational, routing };
}

async function requireParty(organization, partyId, field = "TARGET") {
  const id = text(partyId, 120);
  if (!id) throw new Error(`SECRETARY_DIRECTIVE_FOLLOW_THROUGH_${field}_PARTY_REQUIRED`);
  const party = await one(
    supabaseAdmin.from("parties")
      .select("id,display_name,legal_name,email,phone,party_type,status,metadata")
      .eq("organization_id", organization)
      .eq("id", id)
      .maybeSingle(),
  );
  if (!party) throw new Error(`SECRETARY_DIRECTIVE_FOLLOW_THROUGH_${field}_PARTY_NOT_FOUND`);
  if (text(party.status, 80).toUpperCase() === "INACTIVE") {
    throw new Error(`SECRETARY_DIRECTIVE_FOLLOW_THROUGH_${field}_PARTY_INACTIVE`);
  }
  return party;
}

async function contactActionPlan(organization, partyId, instructionText, deliveryMode = "DELIVER_EXACT") {
  const profile = await one(
    supabaseAdmin.from("secretary_contact_profiles")
      .select("preferred_channel,allow_messages")
      .eq("organization_id", organization)
      .eq("party_id", partyId)
      .maybeSingle(),
  );
  const highAuthority = HIGH_AUTHORITY_PATTERN.test(String(instructionText ?? ""));
  if (deliveryMode === "TRACK_ONLY" || profile?.allow_messages === false || highAuthority) {
    return {
      action_type: "REVIEW",
      execution_ready: false,
      high_authority_review_required: highAuthority,
    };
  }
  const preferred = text(profile?.preferred_channel, 120).toLowerCase();
  return {
    action_type: preferred.includes("email") ? "EMAIL" : "MESSAGE",
    execution_ready: true,
    high_authority_review_required: false,
  };
}

function registerLedger(task) {
  const ledger = object(object(task.metadata)[LEDGER_KEY]);
  if (ledger.contract !== REGISTER_CONTRACT) {
    throw new Error("SECRETARY_DIRECTIVE_FOLLOW_THROUGH_REGISTER_CONTRACT_INVALID");
  }
  return {
    ...ledger,
    versions: list(ledger.versions),
    history: list(ledger.history),
  };
}

function currentVersion(ledger) {
  const id = text(ledger.current_version_id, 120);
  return id ? ledger.versions.find((row) => row.version_id === id) || null : null;
}

function versionById(ledger, versionId) {
  const id = text(versionId, 120);
  return id ? ledger.versions.find((row) => row.version_id === id) || null : null;
}

function emptyFollowState() {
  return {
    contract: CONTRACT,
    revision: 0,
    current_run_id: null,
    runs: [],
    history: [],
    ...safetyFlags(),
  };
}

function followState(task) {
  const raw = object(object(task.metadata)[FOLLOW_KEY]);
  if (!raw.contract) return emptyFollowState();
  if (raw.contract !== CONTRACT) throw new Error("SECRETARY_DIRECTIVE_FOLLOW_THROUGH_CONTRACT_INVALID");
  return {
    ...emptyFollowState(),
    ...raw,
    runs: list(raw.runs),
    history: list(raw.history),
  };
}

function currentRun(state) {
  const id = text(state.current_run_id, 120);
  return id ? state.runs.find((run) => run.run_id === id) || null : null;
}

async function loadDirectiveTask(organization, directiveId) {
  const id = text(directiveId, 120);
  if (!id) throw new Error("SECRETARY_DIRECTIVE_FOLLOW_THROUGH_DIRECTIVE_REQUIRED");
  const task = await one(
    supabaseAdmin.from("secretary_tasks")
      .select("*")
      .eq("organization_id", organization)
      .eq("id", id)
      .maybeSingle(),
  );
  if (!task || task.source !== DIRECTIVE_SOURCE) {
    throw new Error("SECRETARY_DIRECTIVE_FOLLOW_THROUGH_DIRECTIVE_NOT_FOUND");
  }
  registerLedger(task);
  return task;
}

async function mutateFollowState({ organization, directiveId, actor, auth, producer }) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const task = await loadDirectiveTask(organization, directiveId);
    const ledger = registerLedger(task);
    const state = followState(task);
    const produced = await producer({ task, ledger, state });
    if (produced.replay_safe === true) {
      return { task, ledger, state, replay_safe: true, output: object(produced.output) };
    }
    const nextState = produced.state;
    const metadata = {
      ...object(task.metadata),
      [FOLLOW_KEY]: nextState,
      secretary_directive_follow_through: true,
      secretary_directive_follow_through_contract: CONTRACT,
      canonical_owner_party_id: auth.canonicalOwner,
      operational_assignee_party_id: auth.operational,
      directive_ledger_task_is_execution_work: false,
      ...secretaryAdministrativeCoverageMetadata(auth.routing),
      ...safetyFlags(),
    };
    const updatedAt = new Date().toISOString();
    const updated = await supabaseAdmin.from("secretary_tasks")
      .update({ metadata, updated_at: updatedAt })
      .eq("organization_id", organization)
      .eq("id", task.id)
      .eq("updated_at", task.updated_at)
      .select("*")
      .maybeSingle();
    if (updated.error) throw updated.error;
    if (updated.data) {
      return {
        task: updated.data,
        ledger: registerLedger(updated.data),
        state: followState(updated.data),
        replay_safe: false,
        output: object(produced.output),
      };
    }
  }
  throw new Error("SECRETARY_DIRECTIVE_FOLLOW_THROUGH_CONCURRENT_UPDATE_RETRY_REQUIRED");
}

function followUpId(runId, kind) {
  return deterministicUuid(`avantiqo-secretary-directive-follow-through-v1:${runId}:${kind}`);
}

function deliveryInstruction(version, target, mode) {
  const targetName = text(target.display_name || target.legal_name || target.id, 300);
  if (mode === "TRACK_ONLY") {
    return text([
      `Review delivery evidence for the executive directive addressed to ${targetName}.`,
      "Do not send or restate the directive automatically in TRACK_ONLY mode.",
      "Do not infer receipt, acknowledgment, acceptance, commitment, progress, or completion.",
    ].join(" "), 4000);
  }
  return text([
    `Transmit this executive instruction exactly to ${targetName}, preserving the instruction text without paraphrase:`,
    String(version.instruction_text ?? ""),
    "Ask only for explicit acknowledgment of receipt or a clarification request.",
    "Acknowledgment is not acceptance, a commitment, or completion.",
  ].join("\n"), 20000);
}

function acknowledgementChaseInstruction(version) {
  return text([
    "Follow up once for explicit acknowledgment of the recorded executive directive.",
    `Instruction: ${String(version.instruction_text ?? "")}`,
    "Ask whether it was received and understood, or whether clarification is required.",
    "Do not infer acknowledgment, acceptance, commitment, progress, or completion from silence, delivery, read status, or activity.",
  ].join("\n"), 20000);
}

function progressInstruction(version) {
  return text([
    "Request a factual progress update on the recorded executive directive.",
    `Instruction: ${String(version.instruction_text ?? "")}`,
    version.due_at ? `Explicit directive due date: ${version.due_at}.` : null,
    "Ask for current status, blockers, and an expected completion timestamp only if the target can state them explicitly.",
    "Do not infer performance, urgency, misconduct, acceptance, commitment, or completion.",
  ].filter(Boolean).join("\n"), 20000);
}

function dueReviewInstruction(version) {
  return text([
    "Review the executive directive because its explicit due timestamp has arrived without explicit directive completion evidence.",
    `Instruction: ${String(version.instruction_text ?? "")}`,
    version.due_at ? `Explicit due date: ${version.due_at}.` : null,
    "This is temporal status only. Do not infer breach, misconduct, poor performance, cancellation, or completion.",
  ].filter(Boolean).join("\n"), 20000);
}

function completionEvidenceReviewInstruction(version, execution) {
  return text([
    "Linked execution is terminal while the executive directive itself is still current.",
    `Instruction: ${String(version.instruction_text ?? "")}`,
    execution.task ? `Linked task status: ${execution.task.status}.` : null,
    execution.job ? `Linked job status: ${execution.job.status}.` : null,
    "Obtain explicit directive completion evidence before closing the directive. Terminal linked work is not directive completion evidence by itself.",
  ].filter(Boolean).join("\n"), 20000);
}

async function ensureFollowUp({ task, run, kind, dueAt, contactPartyId, actionPlan, instruction }) {
  const id = followUpId(run.run_id, kind);
  const existing = await one(
    supabaseAdmin.from("secretary_follow_ups")
      .select("*")
      .eq("organization_id", task.organization_id)
      .eq("id", id)
      .maybeSingle(),
  );
  if (existing) return existing;
  const metadata = object(task.metadata);
  const inserted = await supabaseAdmin.from("secretary_follow_ups").insert({
    id,
    organization_id: task.organization_id,
    entity_id: task.entity_id || null,
    owner_party_id: metadata.canonical_owner_party_id || task.owner_party_id || null,
    contact_party_id: contactPartyId || null,
    task_id: task.id,
    action_type: actionPlan.action_type,
    reason: text(instruction, 20000),
    status: "PENDING",
    due_at: iso(dueAt, "follow_up_due_at", { required: true }),
    created_by_party_id: metadata.operational_assignee_party_id || metadata.canonical_owner_party_id || task.owner_party_id || null,
    metadata: {
      execution_owner: actionPlan.execution_ready ? "SECRETARY" : "EXECUTIVE",
      execution_ready: actionPlan.execution_ready === true && ["MESSAGE", "EMAIL"].includes(actionPlan.action_type),
      execution_instruction: text(instruction, 20000),
      secretary_owned: true,
      secretary_directive_follow_through: true,
      secretary_directive_follow_through_contract: CONTRACT,
      directive_id: task.id,
      directive_version_id: run.version_id,
      directive_follow_through_run_id: run.run_id,
      directive_follow_through_kind: kind,
      directive_ledger_task_is_execution_work: false,
      delivery_mode: run.delivery_mode,
      high_authority_review_required: actionPlan.high_authority_review_required === true,
      ...safetyFlags(),
    },
  }).select("*").single();
  if (inserted.error) {
    if (inserted.error.code === "23505") {
      return one(
        supabaseAdmin.from("secretary_follow_ups")
          .select("*")
          .eq("organization_id", task.organization_id)
          .eq("id", id)
          .single(),
      );
    }
    throw inserted.error;
  }
  return inserted.data;
}

async function cancelPendingRunFollowUps({ task, runId, kinds = null, reason }) {
  const rows = await many(
    supabaseAdmin.from("secretary_follow_ups")
      .select("id,metadata")
      .eq("organization_id", task.organization_id)
      .eq("task_id", task.id)
      .eq("status", "PENDING")
      .limit(500),
  );
  const allowedKinds = kinds ? new Set(kinds) : null;
  const ids = rows.filter((row) => {
    const metadata = object(row.metadata);
    if (metadata.secretary_directive_follow_through !== true) return false;
    if (metadata.directive_follow_through_run_id !== runId) return false;
    if (allowedKinds && !allowedKinds.has(text(metadata.directive_follow_through_kind, 120))) return false;
    return true;
  }).map((row) => row.id);
  if (!ids.length) return [];
  const now = new Date().toISOString();
  const updated = await supabaseAdmin.from("secretary_follow_ups")
    .update({ status: "CANCELLED", result: text(reason, 1000), completed_at: now, updated_at: now })
    .eq("organization_id", task.organization_id)
    .in("id", ids);
  if (updated.error) throw updated.error;
  return ids;
}

async function runFollowUps(task, run) {
  return many(
    supabaseAdmin.from("secretary_follow_ups")
      .select("*")
      .eq("organization_id", task.organization_id)
      .eq("task_id", task.id)
      .order("due_at", { ascending: true })
      .limit(500),
  ).then((rows) => rows.filter((row) => object(row.metadata).directive_follow_through_run_id === run.run_id));
}

async function executionSnapshot(organization, version) {
  let task = null;
  let job = null;
  const taskId = text(version?.execution_task_id, 120);
  const jobId = text(version?.execution_job_id, 120);
  if (taskId) {
    task = await one(
      supabaseAdmin.from("secretary_tasks")
        .select("id,title,status,source,due_at")
        .eq("organization_id", organization)
        .eq("id", taskId)
        .maybeSingle(),
    );
  }
  if (jobId) {
    job = await one(
      supabaseAdmin.from("secretary_jobs")
        .select("id,objective,status,next_action_at,completed_at")
        .eq("organization_id", organization)
        .eq("id", jobId)
        .maybeSingle(),
    );
  }
  return {
    task,
    job,
    terminal: Boolean(
      (task && TASK_TERMINAL.has(text(task.status, 80).toUpperCase())) ||
      (job && JOB_TERMINAL.has(text(job.status, 80).toUpperCase())),
    ),
    completion_inferred: false,
  };
}

async function materializeRun(task, run, version, target) {
  const created = [];
  const deliveryPlan = await contactActionPlan(task.organization_id, target.id, version.instruction_text, run.delivery_mode);
  created.push(await ensureFollowUp({
    task,
    run,
    kind: run.delivery_mode === "DELIVER_EXACT" ? "DIRECTIVE_DELIVERY" : "DELIVERY_REVIEW",
    dueAt: run.delivery_at || run.started_at,
    contactPartyId: run.delivery_mode === "DELIVER_EXACT" ? target.id : null,
    actionPlan: deliveryPlan,
    instruction: deliveryInstruction(version, target, run.delivery_mode),
  }));

  if (run.acknowledgement_due_at && !run.response_recorded) {
    const ackPlan = await contactActionPlan(task.organization_id, target.id, version.instruction_text, "DELIVER_EXACT");
    created.push(await ensureFollowUp({
      task,
      run,
      kind: "ACKNOWLEDGEMENT_CHASE",
      dueAt: run.acknowledgement_due_at,
      contactPartyId: ackPlan.execution_ready ? target.id : null,
      actionPlan: ackPlan,
      instruction: acknowledgementChaseInstruction(version),
    }));
  }

  if (run.progress_check_at && run.state === "ACTIVE") {
    const progressPlan = await contactActionPlan(task.organization_id, target.id, version.instruction_text, "DELIVER_EXACT");
    created.push(await ensureFollowUp({
      task,
      run,
      kind: "PROGRESS_CHECK",
      dueAt: run.progress_check_at,
      contactPartyId: progressPlan.execution_ready ? target.id : null,
      actionPlan: progressPlan,
      instruction: progressInstruction(version),
    }));
  }

  if (version.due_at && run.state === "ACTIVE") {
    created.push(await ensureFollowUp({
      task,
      run,
      kind: "DUE_REVIEW",
      dueAt: version.due_at,
      contactPartyId: null,
      actionPlan: { action_type: "REVIEW", execution_ready: false, high_authority_review_required: false },
      instruction: dueReviewInstruction(version),
    }));
  }

  return created;
}

async function summarize(task, preferredRunId = null) {
  const ledger = registerLedger(task);
  const state = followState(task);
  const run = preferredRunId
    ? state.runs.find((item) => item.run_id === preferredRunId) || null
    : currentRun(state) || state.runs[state.runs.length - 1] || null;
  const version = run ? versionById(ledger, run.version_id) : currentVersion(ledger);
  const execution = version ? await executionSnapshot(task.organization_id, version) : { task: null, job: null, terminal: false, completion_inferred: false };
  return {
    status: "completed",
    contract: CONTRACT,
    directive_id: task.id,
    directive_state: ledger.state,
    directive_current_version_id: ledger.current_version_id || null,
    run,
    runs: state.runs,
    history: state.history,
    follow_ups: run ? await runFollowUps(task, run) : [],
    execution,
    directive_ledger_task_is_execution_work: false,
    ...safetyFlags(),
  };
}

function validateSchedule(startedAt, candidate, field) {
  if (!candidate) return;
  if (Date.parse(candidate) < Date.parse(startedAt)) {
    throw new Error(`SECRETARY_DIRECTIVE_FOLLOW_THROUGH_${field}_BEFORE_START`);
  }
}

export async function startSecretaryDirectiveFollowThrough({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const directiveId = text(payload.directive_id || payload.directiveId, 120);
  const versionId = text(payload.current_version_id || payload.currentVersionId, 120);
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 500);
  const startedAt = iso(payload.started_at || payload.startedAt, "started_at", { required: true });
  const deliveryAt = iso(payload.delivery_at || payload.deliveryAt, "delivery_at") || startedAt;
  const acknowledgementDueAt = iso(payload.acknowledgement_due_at || payload.acknowledgementDueAt, "acknowledgement_due_at");
  const progressCheckAt = iso(payload.progress_check_at || payload.progressCheckAt, "progress_check_at");
  const deliveryMode = text(payload.delivery_mode || payload.deliveryMode || "TRACK_ONLY", 80).toUpperCase();
  if (!directiveId) throw new Error("SECRETARY_DIRECTIVE_FOLLOW_THROUGH_DIRECTIVE_REQUIRED");
  if (!versionId) throw new Error("SECRETARY_DIRECTIVE_FOLLOW_THROUGH_CURRENT_VERSION_REQUIRED");
  if (!evidenceId) throw new Error("SECRETARY_DIRECTIVE_FOLLOW_THROUGH_EVIDENCE_REQUIRED");
  if (!DELIVERY_MODES.has(deliveryMode)) throw new Error("SECRETARY_DIRECTIVE_FOLLOW_THROUGH_DELIVERY_MODE_INVALID");
  validateSchedule(startedAt, deliveryAt, "DELIVERY_AT");
  validateSchedule(startedAt, acknowledgementDueAt, "ACKNOWLEDGEMENT_DUE_AT");
  validateSchedule(startedAt, progressCheckAt, "PROGRESS_CHECK_AT");

  const auth = await administrativeRouting({
    organization,
    actor,
    instruction: "Start Secretary follow-through for an already-recorded executive directive. Do not turn the directive ledger into execution work or infer target, acceptance, commitment, progress, completion, or authority.",
    at: startedAt,
  });

  const result = await mutateFollowState({
    organization,
    directiveId,
    actor,
    auth,
    producer: async ({ ledger, state }) => {
      if (ledger.state !== "CURRENT" || ledger.current_version_id !== versionId) {
        throw new Error("SECRETARY_DIRECTIVE_FOLLOW_THROUGH_STALE_VERSION_REJECTED");
      }
      const version = currentVersion(ledger);
      if (!version) throw new Error("SECRETARY_DIRECTIVE_FOLLOW_THROUGH_CURRENT_VERSION_NOT_FOUND");
      const targetPartyId = text(version.target_party_id, 120);
      if (!targetPartyId) throw new Error("SECRETARY_DIRECTIVE_FOLLOW_THROUGH_EXPLICIT_TARGET_PARTY_REQUIRED");
      await requireParty(organization, targetPartyId);
      const runId = deterministicUuid(`avantiqo-secretary-directive-follow-through-v1:${organization}:${directiveId}:${versionId}`);
      const existing = state.runs.find((run) => run.run_id === runId);
      if (existing) {
        const samePlan = existing.start_evidence_id === evidenceId
          && existing.started_at === startedAt
          && existing.delivery_at === deliveryAt
          && existing.delivery_mode === deliveryMode
          && (existing.acknowledgement_due_at || null) === (acknowledgementDueAt || null)
          && (existing.progress_check_at || null) === (progressCheckAt || null);
        if (samePlan) return { replay_safe: true, output: { run_id: runId } };
        throw new Error("SECRETARY_DIRECTIVE_FOLLOW_THROUGH_PLAN_ALREADY_EXISTS");
      }
      const revision = Number(state.revision || 0) + 1;
      const staleRunIds = state.runs.filter((run) => run.state === "ACTIVE").map((run) => run.run_id);
      const runs = state.runs.map((run) => run.state === "ACTIVE"
        ? { ...run, state: "SUPERSEDED", superseded_at: startedAt }
        : run);
      const run = {
        run_id: runId,
        directive_id: directiveId,
        version_id: versionId,
        state: "ACTIVE",
        target_party_id: targetPartyId,
        start_evidence_id: evidenceId,
        started_at: startedAt,
        delivery_mode: deliveryMode,
        delivery_at: deliveryAt,
        acknowledgement_due_at: acknowledgementDueAt,
        progress_check_at: progressCheckAt,
        response_recorded: false,
        acknowledged: false,
        acknowledgement_history: [],
        progress_history: [],
        high_authority_instruction: HIGH_AUTHORITY_PATTERN.test(String(version.instruction_text ?? "")),
        delivery_auto_execution_allowed: deliveryMode === "DELIVER_EXACT" && !HIGH_AUTHORITY_PATTERN.test(String(version.instruction_text ?? "")),
        directive_ledger_task_is_execution_work: false,
        ...safetyFlags(),
      };
      runs.push(run);
      return {
        state: {
          ...state,
          revision,
          current_run_id: runId,
          runs: runs.slice(-100),
          history: [...state.history, {
            event: "DIRECTIVE_FOLLOW_THROUGH_STARTED",
            revision,
            run_id: runId,
            version_id: versionId,
            target_party_id: targetPartyId,
            evidence_id: evidenceId,
            started_at: startedAt,
            delivery_mode: deliveryMode,
            acknowledgement_due_at: acknowledgementDueAt,
            progress_check_at: progressCheckAt,
            recorded_by_party_id: actor,
          }].slice(-500),
          ...safetyFlags(),
        },
        output: { run_id: runId, stale_run_ids: staleRunIds },
      };
    },
  });

  for (const staleRunId of list(result.output.stale_run_ids)) {
    await cancelPendingRunFollowUps({
      task: result.task,
      runId: staleRunId,
      reason: "Follow-through run superseded by a newer directive version run.",
    });
  }

  const runId = result.output.run_id || currentRun(result.state)?.run_id;
  const state = followState(result.task);
  const run = state.runs.find((item) => item.run_id === runId);
  const ledger = registerLedger(result.task);
  const version = versionById(ledger, run.version_id);
  const target = await requireParty(organization, run.target_party_id);
  await materializeRun(result.task, run, version, target);

  return {
    ...(await summarize(result.task, run.run_id)),
    status: "started",
    replay_safe: result.replay_safe,
    exact_directive_delivery: run.delivery_mode === "DELIVER_EXACT",
    high_authority_delivery_review_required: run.high_authority_instruction === true,
    schedules_inferred: false,
  };
}

export async function readSecretaryDirectiveFollowThrough({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  actorPartyId(context);
  const task = await loadDirectiveTask(organization, payload.directive_id || payload.directiveId);
  return summarize(task, text(payload.run_id || payload.runId, 120) || null);
}

export async function listSecretaryDirectiveFollowThrough({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  actorPartyId(context);
  const limit = Math.min(300, Math.max(1, Number(payload.limit || 100)));
  const tasks = await many(
    supabaseAdmin.from("secretary_tasks")
      .select("*")
      .eq("organization_id", organization)
      .eq("source", DIRECTIVE_SOURCE)
      .order("updated_at", { ascending: false })
      .limit(limit),
  );
  const managed = tasks.filter((task) => object(object(task.metadata)[FOLLOW_KEY]).contract === CONTRACT);
  const items = await Promise.all(managed.map((task) => summarize(task)));
  return {
    status: "completed",
    contract: CONTRACT,
    items,
    active_count: items.filter((item) => item.run?.state === "ACTIVE").length,
    returned_count: items.length,
    ...safetyFlags(),
  };
}

export async function recordSecretaryDirectiveAcknowledgement({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const directiveId = text(payload.directive_id || payload.directiveId, 120);
  const versionId = text(payload.current_version_id || payload.currentVersionId, 120);
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 500);
  const respondedAt = iso(payload.responded_at || payload.respondedAt, "responded_at", { required: true });
  const responseKind = text(payload.response_kind || payload.responseKind, 80).toUpperCase();
  const responseText = exactText(payload.response_text ?? payload.responseText, "response_text", { required: false, limit: 20000 });
  if (!directiveId) throw new Error("SECRETARY_DIRECTIVE_FOLLOW_THROUGH_DIRECTIVE_REQUIRED");
  if (!versionId) throw new Error("SECRETARY_DIRECTIVE_FOLLOW_THROUGH_CURRENT_VERSION_REQUIRED");
  if (!evidenceId) throw new Error("SECRETARY_DIRECTIVE_FOLLOW_THROUGH_EVIDENCE_REQUIRED");
  if (!RESPONSE_KINDS.has(responseKind)) throw new Error("SECRETARY_DIRECTIVE_FOLLOW_THROUGH_RESPONSE_KIND_INVALID");

  const auth = await administrativeRouting({
    organization,
    actor,
    instruction: "Record explicit target response evidence for an executive directive. Acknowledgment is not acceptance, commitment, or completion.",
    at: respondedAt,
  });
  const result = await mutateFollowState({
    organization,
    directiveId,
    actor,
    auth,
    producer: async ({ ledger, state }) => {
      const run = currentRun(state);
      if (!run || run.state !== "ACTIVE" || run.version_id !== versionId) {
        throw new Error("SECRETARY_DIRECTIVE_FOLLOW_THROUGH_ACTIVE_RUN_REQUIRED");
      }
      if (ledger.state !== "CURRENT" || ledger.current_version_id !== versionId) {
        throw new Error("SECRETARY_DIRECTIVE_FOLLOW_THROUGH_STALE_VERSION_REJECTED");
      }
      const duplicate = list(run.acknowledgement_history).some((row) => row.evidence_id === evidenceId
        && row.responded_at === respondedAt
        && row.response_kind === responseKind
        && (row.response_text || null) === (responseText || null));
      if (duplicate) return { replay_safe: true, output: { run_id: run.run_id } };
      const revision = Number(state.revision || 0) + 1;
      const event = {
        evidence_id: evidenceId,
        responded_at: respondedAt,
        response_kind: responseKind,
        response_text: responseText,
        recorded_by_party_id: actor,
        acknowledgement_inferred: false,
        acceptance_inferred: false,
        commitment_inferred: false,
        completion_inferred: false,
      };
      const runs = state.runs.map((item) => item.run_id === run.run_id
        ? {
          ...item,
          response_recorded: true,
          acknowledged: responseKind === "ACKNOWLEDGED",
          latest_response_kind: responseKind,
          latest_response_at: respondedAt,
          acknowledgement_history: [...list(item.acknowledgement_history), event].slice(-100),
        }
        : item);
      return {
        state: {
          ...state,
          revision,
          runs,
          history: [...state.history, {
            event: "DIRECTIVE_TARGET_RESPONSE_RECORDED",
            revision,
            run_id: run.run_id,
            version_id: versionId,
            evidence_id: evidenceId,
            response_kind: responseKind,
            responded_at: respondedAt,
            recorded_by_party_id: actor,
          }].slice(-500),
          ...safetyFlags(),
        },
        output: { run_id: run.run_id },
      };
    },
  });

  const run = followState(result.task).runs.find((item) => item.run_id === result.output.run_id);
  await cancelPendingRunFollowUps({
    task: result.task,
    runId: run.run_id,
    kinds: ["ACKNOWLEDGEMENT_CHASE"],
    reason: `Explicit target response recorded: ${responseKind}`,
  });
  if (["NEEDS_CLARIFICATION", "DECLINED"].includes(responseKind)) {
    const ledger = registerLedger(result.task);
    const version = versionById(ledger, run.version_id);
    await ensureFollowUp({
      task: result.task,
      run,
      kind: "EXECUTIVE_RESPONSE_REVIEW",
      dueAt: respondedAt,
      contactPartyId: null,
      actionPlan: { action_type: "REVIEW", execution_ready: false, high_authority_review_required: false },
      instruction: text([
        `Review explicit target response ${responseKind} for the executive directive.`,
        `Instruction: ${String(version?.instruction_text ?? "")}`,
        responseText ? `Exact response: ${responseText}` : null,
        "Do not infer directive cancellation, acceptance, commitment, misconduct, or completion.",
      ].filter(Boolean).join("\n"), 20000),
    });
  }
  return {
    ...(await summarize(result.task, run.run_id)),
    status: "response_recorded",
    replay_safe: result.replay_safe,
    response_kind: responseKind,
    acknowledgement_is_acceptance: false,
    acknowledgement_is_commitment: false,
    acknowledgement_is_completion: false,
  };
}

export async function recordSecretaryDirectiveProgress({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const directiveId = text(payload.directive_id || payload.directiveId, 120);
  const versionId = text(payload.current_version_id || payload.currentVersionId, 120);
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 500);
  const recordedAt = iso(payload.recorded_at || payload.recordedAt, "recorded_at", { required: true });
  const statusText = exactText(payload.status_text ?? payload.statusText, "status_text", { required: true, limit: 20000 });
  const blockers = exactText(payload.blockers, "blockers", { required: false, limit: 20000 });
  const expectedCompletionAt = iso(payload.expected_completion_at || payload.expectedCompletionAt, "expected_completion_at");
  if (!directiveId) throw new Error("SECRETARY_DIRECTIVE_FOLLOW_THROUGH_DIRECTIVE_REQUIRED");
  if (!versionId) throw new Error("SECRETARY_DIRECTIVE_FOLLOW_THROUGH_CURRENT_VERSION_REQUIRED");
  if (!evidenceId) throw new Error("SECRETARY_DIRECTIVE_FOLLOW_THROUGH_EVIDENCE_REQUIRED");

  const auth = await administrativeRouting({
    organization,
    actor,
    instruction: "Record factual progress evidence for an executive directive without inferring performance, delay cause, commitment, or completion.",
    at: recordedAt,
  });
  const result = await mutateFollowState({
    organization,
    directiveId,
    actor,
    auth,
    producer: async ({ ledger, state }) => {
      const run = currentRun(state);
      if (!run || run.state !== "ACTIVE" || run.version_id !== versionId) {
        throw new Error("SECRETARY_DIRECTIVE_FOLLOW_THROUGH_ACTIVE_RUN_REQUIRED");
      }
      if (ledger.state !== "CURRENT" || ledger.current_version_id !== versionId) {
        throw new Error("SECRETARY_DIRECTIVE_FOLLOW_THROUGH_STALE_VERSION_REJECTED");
      }
      const duplicate = list(run.progress_history).some((row) => row.evidence_id === evidenceId
        && row.recorded_at === recordedAt
        && row.status_text === statusText
        && (row.blockers || null) === (blockers || null)
        && (row.expected_completion_at || null) === (expectedCompletionAt || null));
      if (duplicate) return { replay_safe: true, output: { run_id: run.run_id } };
      const revision = Number(state.revision || 0) + 1;
      const progress = {
        evidence_id: evidenceId,
        recorded_at: recordedAt,
        status_text: statusText,
        blockers,
        expected_completion_at: expectedCompletionAt,
        recorded_by_party_id: actor,
        progress_inferred: false,
        completion_inferred: false,
      };
      const runs = state.runs.map((item) => item.run_id === run.run_id
        ? { ...item, progress_history: [...list(item.progress_history), progress].slice(-200) }
        : item);
      return {
        state: {
          ...state,
          revision,
          runs,
          history: [...state.history, {
            event: "DIRECTIVE_PROGRESS_RECORDED",
            revision,
            run_id: run.run_id,
            version_id: versionId,
            evidence_id: evidenceId,
            recorded_at: recordedAt,
            recorded_by_party_id: actor,
          }].slice(-500),
          ...safetyFlags(),
        },
        output: { run_id: run.run_id },
      };
    },
  });
  return {
    ...(await summarize(result.task, result.output.run_id)),
    status: "progress_recorded",
    replay_safe: result.replay_safe,
    progress_is_completion: false,
  };
}

export async function completeSecretaryDirectiveFollowThrough({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const directiveId = text(payload.directive_id || payload.directiveId, 120);
  const versionId = text(payload.current_version_id || payload.currentVersionId, 120);
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 500);
  const completedAt = iso(payload.completed_at || payload.completedAt, "completed_at", { required: true });
  if (!directiveId) throw new Error("SECRETARY_DIRECTIVE_FOLLOW_THROUGH_DIRECTIVE_REQUIRED");
  if (!versionId) throw new Error("SECRETARY_DIRECTIVE_FOLLOW_THROUGH_CURRENT_VERSION_REQUIRED");
  if (!evidenceId) throw new Error("SECRETARY_DIRECTIVE_FOLLOW_THROUGH_EVIDENCE_REQUIRED");

  const before = await loadDirectiveTask(organization, directiveId);
  const beforeState = followState(before);
  const beforeRun = currentRun(beforeState) || beforeState.runs.find((run) => run.version_id === versionId && run.state === "COMPLETED") || null;
  if (beforeRun?.state === "COMPLETED"
    && beforeRun.completion_evidence_id === evidenceId
    && beforeRun.completed_at === completedAt) {
    return {
      ...(await summarize(before, beforeRun.run_id)),
      status: "completed",
      replay_safe: true,
      directive_completion_evidence_accepted: true,
    };
  }
  if (!beforeRun || beforeRun.state !== "ACTIVE" || beforeRun.version_id !== versionId) {
    throw new Error("SECRETARY_DIRECTIVE_FOLLOW_THROUGH_ACTIVE_RUN_REQUIRED");
  }

  const completion = await completeSecretaryExecutiveDirective({
    context,
    payload: {
      directive_id: directiveId,
      current_version_id: versionId,
      evidence_id: evidenceId,
      completed_at: completedAt,
      source_reference: payload.source_reference || payload.sourceReference,
      result: payload.result,
    },
  });

  const auth = await administrativeRouting({
    organization,
    actor,
    instruction: "Close Secretary directive follow-through only after the Directive Register accepted explicit completion evidence.",
    at: completedAt,
  });
  const result = await mutateFollowState({
    organization,
    directiveId,
    actor,
    auth,
    producer: async ({ state }) => {
      const run = state.runs.find((item) => item.run_id === beforeRun.run_id);
      if (!run) throw new Error("SECRETARY_DIRECTIVE_FOLLOW_THROUGH_RUN_NOT_FOUND");
      if (run.state === "COMPLETED"
        && run.completion_evidence_id === evidenceId
        && run.completed_at === completedAt) {
        return { replay_safe: true, output: { run_id: run.run_id } };
      }
      const revision = Number(state.revision || 0) + 1;
      const runs = state.runs.map((item) => item.run_id === run.run_id
        ? {
          ...item,
          state: "COMPLETED",
          completion_evidence_id: evidenceId,
          completed_at: completedAt,
          completion_inferred: false,
        }
        : item);
      return {
        state: {
          ...state,
          revision,
          current_run_id: null,
          runs,
          history: [...state.history, {
            event: "DIRECTIVE_FOLLOW_THROUGH_COMPLETED",
            revision,
            run_id: run.run_id,
            version_id: versionId,
            evidence_id: evidenceId,
            completed_at: completedAt,
            recorded_by_party_id: actor,
          }].slice(-500),
          ...safetyFlags(),
        },
        output: { run_id: run.run_id },
      };
    },
  });
  await cancelPendingRunFollowUps({
    task: result.task,
    runId: beforeRun.run_id,
    reason: "Directive completed from explicit evidence; follow-through closed.",
  });
  return {
    ...(await summarize(result.task, beforeRun.run_id)),
    status: "completed",
    replay_safe: completion.replay_safe === true && result.replay_safe === true,
    directive_completion_evidence_accepted: true,
  };
}

export async function refreshSecretaryDirectiveFollowThrough({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const directiveId = text(payload.directive_id || payload.directiveId, 120);
  if (!directiveId) throw new Error("SECRETARY_DIRECTIVE_FOLLOW_THROUGH_DIRECTIVE_REQUIRED");
  const refreshedAt = iso(payload.refreshed_at || payload.refreshedAt, "refreshed_at") || new Date().toISOString();
  const auth = await administrativeRouting({
    organization,
    actor,
    instruction: "Refresh Secretary directive follow-through, repair missing follow-ups, fence stale directive versions, and never infer directive completion from linked execution.",
    at: refreshedAt,
  });
  let task = await loadDirectiveTask(organization, directiveId);
  let ledger = registerLedger(task);
  let state = followState(task);
  let run = currentRun(state);
  if (!run) throw new Error("SECRETARY_DIRECTIVE_FOLLOW_THROUGH_ACTIVE_RUN_REQUIRED");

  if (ledger.state !== "CURRENT" || ledger.current_version_id !== run.version_id) {
    const terminalState = ledger.state === "COMPLETED"
      ? "COMPLETED"
      : ledger.state === "CANCELLED"
        ? "DIRECTIVE_CANCELLED"
        : "SUPERSEDED";
    const result = await mutateFollowState({
      organization,
      directiveId,
      actor,
      auth,
      producer: async ({ state: latestState }) => {
        const latestRun = currentRun(latestState);
        if (!latestRun) return { replay_safe: true, output: { run_id: run.run_id } };
        const revision = Number(latestState.revision || 0) + 1;
        const runs = latestState.runs.map((item) => item.run_id === latestRun.run_id
          ? { ...item, state: terminalState, stale_fenced_at: refreshedAt }
          : item);
        return {
          state: {
            ...latestState,
            revision,
            current_run_id: null,
            runs,
            history: [...latestState.history, {
              event: "DIRECTIVE_FOLLOW_THROUGH_STALE_FENCED",
              revision,
              run_id: latestRun.run_id,
              version_id: latestRun.version_id,
              directive_state: ledger.state,
              refreshed_at: refreshedAt,
              recorded_by_party_id: actor,
            }].slice(-500),
            ...safetyFlags(),
          },
          output: { run_id: latestRun.run_id },
        };
      },
    });
    await cancelPendingRunFollowUps({
      task: result.task,
      runId: run.run_id,
      reason: `Directive follow-through fenced because directive state/version changed: ${ledger.state}`,
    });
    return {
      ...(await summarize(result.task, run.run_id)),
      status: "stale_fenced",
      stale_version_fenced: true,
    };
  }

  const version = currentVersion(ledger);
  const target = await requireParty(organization, run.target_party_id);
  await materializeRun(task, run, version, target);
  const execution = await executionSnapshot(organization, version);
  if (execution.terminal) {
    await ensureFollowUp({
      task,
      run,
      kind: "EXECUTION_COMPLETION_EVIDENCE_REVIEW",
      dueAt: refreshedAt,
      contactPartyId: null,
      actionPlan: { action_type: "REVIEW", execution_ready: false, high_authority_review_required: false },
      instruction: completionEvidenceReviewInstruction(version, execution),
    });
  }
  task = await loadDirectiveTask(organization, directiveId);
  return {
    ...(await summarize(task, run.run_id)),
    status: "refreshed",
    repaired_missing_follow_ups: true,
    linked_execution_terminal: execution.terminal,
    linked_execution_terminal_is_completion: false,
  };
}

export async function cancelSecretaryDirectiveFollowThrough({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const directiveId = text(payload.directive_id || payload.directiveId, 120);
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 500);
  const cancelledAt = iso(payload.cancelled_at || payload.cancelledAt, "cancelled_at", { required: true });
  const reason = exactText(payload.reason, "reason", { required: false, limit: 10000 });
  if (!directiveId) throw new Error("SECRETARY_DIRECTIVE_FOLLOW_THROUGH_DIRECTIVE_REQUIRED");
  if (!evidenceId) throw new Error("SECRETARY_DIRECTIVE_FOLLOW_THROUGH_EVIDENCE_REQUIRED");
  const before = await loadDirectiveTask(organization, directiveId);
  const beforeState = followState(before);
  const replayRun = beforeState.runs.find((run) => run.state === "FOLLOW_THROUGH_CANCELLED"
    && run.cancellation_evidence_id === evidenceId
    && run.cancelled_at === cancelledAt) || null;
  if (replayRun) {
    return {
      ...(await summarize(before, replayRun.run_id)),
      status: "cancelled",
      replay_safe: true,
      directive_cancelled: false,
    };
  }
  const auth = await administrativeRouting({
    organization,
    actor,
    instruction: "Cancel Secretary follow-through coordination only. Do not cancel, withdraw, or supersede the executive directive itself.",
    at: cancelledAt,
  });
  const result = await mutateFollowState({
    organization,
    directiveId,
    actor,
    auth,
    producer: async ({ state }) => {
      const run = currentRun(state);
      if (!run) throw new Error("SECRETARY_DIRECTIVE_FOLLOW_THROUGH_ACTIVE_RUN_REQUIRED");
      const duplicate = state.history.some((row) => row.event === "DIRECTIVE_FOLLOW_THROUGH_CANCELLED"
        && row.run_id === run.run_id
        && row.evidence_id === evidenceId
        && row.cancelled_at === cancelledAt);
      if (duplicate) return { replay_safe: true, output: { run_id: run.run_id } };
      const revision = Number(state.revision || 0) + 1;
      const runs = state.runs.map((item) => item.run_id === run.run_id
        ? { ...item, state: "FOLLOW_THROUGH_CANCELLED", cancelled_at: cancelledAt, cancellation_evidence_id: evidenceId, cancellation_reason: reason }
        : item);
      return {
        state: {
          ...state,
          revision,
          current_run_id: null,
          runs,
          history: [...state.history, {
            event: "DIRECTIVE_FOLLOW_THROUGH_CANCELLED",
            revision,
            run_id: run.run_id,
            version_id: run.version_id,
            evidence_id: evidenceId,
            cancelled_at: cancelledAt,
            reason,
            directive_cancelled: false,
            recorded_by_party_id: actor,
          }].slice(-500),
          ...safetyFlags(),
        },
        output: { run_id: run.run_id },
      };
    },
  });
  await cancelPendingRunFollowUps({
    task: result.task,
    runId: result.output.run_id,
    reason: "Secretary follow-through coordination cancelled; directive remains unchanged.",
  });
  return {
    ...(await summarize(result.task, result.output.run_id)),
    status: "cancelled",
    replay_safe: result.replay_safe,
    directive_cancelled: false,
  };
}

export default {
  startSecretaryDirectiveFollowThrough,
  readSecretaryDirectiveFollowThrough,
  listSecretaryDirectiveFollowThrough,
  recordSecretaryDirectiveAcknowledgement,
  recordSecretaryDirectiveProgress,
  completeSecretaryDirectiveFollowThrough,
  refreshSecretaryDirectiveFollowThrough,
  cancelSecretaryDirectiveFollowThrough,
};
