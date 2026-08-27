import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const CONTRACT = "AVANTIQO_EXECUTIVE_SECRETARY_COMMITMENT_CONTROL_V1";
const ACTIVE_TASK_STATUSES = new Set(["OPEN", "IN_PROGRESS"]);
const TERMINAL_JOB_STATUSES = new Set(["COMPLETED", "FAILED", "CANCELLED"]);
const TERMINAL_FOLLOW_UP_STATUSES = new Set(["COMPLETED", "CANCELLED"]);

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
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

function nowIso(value) {
  const raw = text(value, 160);
  if (!raw) return new Date().toISOString();
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) throw new Error("SECRETARY_COMMITMENT_NOW_INVALID");
  return new Date(parsed).toISOString();
}

async function many(result) {
  const resolved = await result;
  if (resolved.error) throw resolved.error;
  return Array.isArray(resolved.data) ? resolved.data : [];
}

function temporalStatus(value, now) {
  const due = Date.parse(text(value, 160));
  if (!Number.isFinite(due)) return "NO_DUE_DATE";
  const current = Date.parse(now);
  if (due < current) return "OVERDUE_TEMPORALLY";
  if (due === current) return "DUE_NOW";
  return "UPCOMING";
}

function taskCategory(task = {}) {
  const metadata = object(task.metadata);
  const source = text(task.source, 120).toLowerCase();
  if (source === "secretary_commitment_capture" || metadata.explicit_commitment === true) return "EXPLICIT_COMMITMENT";
  if (source === "secretary_meeting") return "MEETING_ACTION";
  if (source === "secretary_deadline_coordination" || metadata.secretary_deadline_coordination === true) return "DEADLINE";
  if (metadata.expense_pack === true) return "EXPENSE_ADMINISTRATION";
  if (metadata.visitor_coordination === true || metadata.secretary_visitor_coordination === true) return "VISITOR_COORDINATION";
  if (metadata.document_filing === true || metadata.secretary_document_filing === true || source === "secretary_document_filing") return "DOCUMENT_COORDINATION";
  if (source === "secretary_absence_coverage") return "ABSENCE_COVERAGE";
  if (source === "secretary_message") return "CORRESPONDENCE";
  return "TASK";
}

function canonicalOwner(record = {}) {
  const metadata = object(record.metadata);
  return text(metadata.canonical_owner_party_id || record.owner_party_id || record.requested_by_party_id, 120) || null;
}

function operationalAssignee(record = {}) {
  const metadata = object(record.metadata);
  return text(
    metadata.operational_assignee_party_id
      || metadata.secretary_job_execution_actor_party_id
      || metadata.secretary_operational_assignee_party_id,
    120,
  ) || canonicalOwner(record);
}

function summarizeJob(job = {}) {
  const metadata = object(job.metadata);
  return {
    id: job.id,
    status: text(job.status, 80).toUpperCase(),
    objective: text(job.objective, 4000) || null,
    next_action_at: job.next_action_at || null,
    canonical_owner_party_id: canonicalOwner(job),
    operational_assignee_party_id: operationalAssignee(job),
    awaiting_external_responses: metadata.awaiting_external_responses === true,
    external_authority_used: false,
  };
}

function summarizeFollowUp(followUp = {}, now) {
  return {
    id: followUp.id,
    action_type: text(followUp.action_type, 80).toUpperCase() || null,
    reason: text(followUp.reason, 4000) || null,
    status: text(followUp.status, 80).toUpperCase(),
    due_at: followUp.due_at || null,
    temporal_status: temporalStatus(followUp.due_at, now),
    contact_party_id: followUp.contact_party_id || null,
    canonical_owner_party_id: canonicalOwner(followUp),
    operational_assignee_party_id: operationalAssignee(followUp),
    explicit_commitment: object(followUp.metadata).explicit_commitment === true,
    external_authority_used: false,
  };
}

function taskCommitment(task = {}, now) {
  return {
    commitment_id: `TASK:${task.id}`,
    source_type: "TASK",
    source_id: task.id,
    category: taskCategory(task),
    title: text(task.title, 800) || "Secretary task",
    details: text(task.details, 4000) || null,
    durable_status: text(task.status, 80).toUpperCase(),
    due_at: task.due_at || null,
    temporal_status: temporalStatus(task.due_at, now),
    canonical_owner_party_id: canonicalOwner(task),
    operational_assignee_party_id: operationalAssignee(task),
    contact_party_id: task.contact_party_id || null,
    source: task.source || null,
    linked_jobs: [],
    next_actions: [],
    source_metadata: object(task.metadata),
    explicit_commitment: object(task.metadata).explicit_commitment === true,
    commitment_inferred: false,
    external_authority_used: false,
  };
}

function jobCommitment(job = {}, now) {
  return {
    commitment_id: `JOB:${job.id}`,
    source_type: "JOB",
    source_id: job.id,
    category: text(object(job.metadata).job_kind, 120).toUpperCase() || "DELEGATED_JOB",
    title: text(job.objective, 800) || "Secretary delegated job",
    details: text(job.objective, 4000) || null,
    durable_status: text(job.status, 80).toUpperCase(),
    due_at: job.next_action_at || null,
    temporal_status: temporalStatus(job.next_action_at, now),
    canonical_owner_party_id: canonicalOwner(job),
    operational_assignee_party_id: operationalAssignee(job),
    contact_party_id: object(job.metadata).source_contact_party_id || null,
    source: job.source_kind || null,
    linked_jobs: [summarizeJob(job)],
    next_actions: [],
    source_metadata: object(job.metadata),
    explicit_commitment: false,
    commitment_inferred: false,
    external_authority_used: false,
  };
}

function followUpCommitment(followUp = {}, now) {
  const action = summarizeFollowUp(followUp, now);
  const explicitCommitment = object(followUp.metadata).explicit_commitment === true;
  return {
    commitment_id: `FOLLOW_UP:${followUp.id}`,
    source_type: "FOLLOW_UP",
    source_id: followUp.id,
    category: explicitCommitment ? "EXPLICIT_COMMITMENT" : "FOLLOW_UP",
    title: text(followUp.reason, 800) || "Secretary follow-up",
    details: text(followUp.reason, 4000) || null,
    durable_status: text(followUp.status, 80).toUpperCase(),
    due_at: followUp.due_at || null,
    temporal_status: action.temporal_status,
    canonical_owner_party_id: canonicalOwner(followUp),
    operational_assignee_party_id: operationalAssignee(followUp),
    contact_party_id: followUp.contact_party_id || null,
    source: "secretary_follow_ups",
    linked_jobs: [],
    next_actions: [action],
    source_metadata: object(followUp.metadata),
    explicit_commitment: explicitCommitment,
    commitment_inferred: false,
    external_authority_used: false,
  };
}

function controlState(commitment, now) {
  const jobs = list(commitment.linked_jobs);
  if (jobs.some((job) => job.status === "REVIEW_REQUIRED")) return "EXECUTIVE_DECISION_REQUIRED";
  if (jobs.some((job) => job.awaiting_external_responses === true)) return "WAITING_EXTERNAL";
  if (commitment.temporal_status === "OVERDUE_TEMPORALLY" || commitment.temporal_status === "DUE_NOW") return "ACTION_DUE";
  if (list(commitment.next_actions).some((action) => ["OVERDUE_TEMPORALLY", "DUE_NOW"].includes(action.temporal_status))) return "ACTION_DUE";
  if (jobs.some((job) => job.status === "WAITING")) return "WAITING";
  if (commitment.source_type === "FOLLOW_UP" && temporalStatus(commitment.due_at, now) === "UPCOMING") return "SCHEDULED_NEXT_ACTION";
  return "ACTIVE";
}

function controlRank(state) {
  return {
    EXECUTIVE_DECISION_REQUIRED: 0,
    ACTION_DUE: 1,
    WAITING_EXTERNAL: 2,
    WAITING: 3,
    ACTIVE: 4,
    SCHEDULED_NEXT_ACTION: 5,
  }[state] ?? 9;
}

export async function readSecretaryCommitmentControl({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const now = nowIso(payload.now || payload.at);
  const limit = Math.min(500, Math.max(1, Number(payload.limit || 200)));
  const fetchLimit = Math.min(1000, Math.max(limit * 4, 200));

  const [tasks, jobs, followUps] = await Promise.all([
    many(
      supabaseAdmin.from("secretary_tasks")
        .select("*")
        .eq("organization_id", organization)
        .limit(fetchLimit),
    ),
    many(
      supabaseAdmin.from("secretary_jobs")
        .select("*")
        .eq("organization_id", organization)
        .limit(fetchLimit),
    ),
    many(
      supabaseAdmin.from("secretary_follow_ups")
        .select("*")
        .eq("organization_id", organization)
        .limit(fetchLimit),
    ),
  ]);

  const activeTasks = tasks.filter((task) => ACTIVE_TASK_STATUSES.has(text(task.status, 80).toUpperCase()));
  const activeJobs = jobs.filter((job) => !TERMINAL_JOB_STATUSES.has(text(job.status, 80).toUpperCase()));
  const activeFollowUps = followUps.filter((followUp) => !TERMINAL_FOLLOW_UP_STATUSES.has(text(followUp.status, 80).toUpperCase()));

  const commitments = activeTasks.map((task) => taskCommitment(task, now));
  const taskCommitmentById = new Map(commitments.map((item) => [item.source_id, item]));
  const commitmentByJobId = new Map();

  for (const job of activeJobs) {
    const sourceTaskId = text(object(job.metadata).source_task_id, 120);
    const parent = sourceTaskId ? taskCommitmentById.get(sourceTaskId) : null;
    if (parent) {
      parent.linked_jobs.push(summarizeJob(job));
      commitmentByJobId.set(job.id, parent);
      continue;
    }
    const commitment = jobCommitment(job, now);
    commitments.push(commitment);
    commitmentByJobId.set(job.id, commitment);
  }

  for (const followUp of activeFollowUps) {
    const taskId = text(followUp.task_id, 120);
    let parent = taskId ? taskCommitmentById.get(taskId) : null;
    if (!parent) {
      const jobId = text(object(followUp.metadata).secretary_job_id, 120);
      parent = jobId ? commitmentByJobId.get(jobId) : null;
    }
    if (parent) {
      parent.next_actions.push(summarizeFollowUp(followUp, now));
      continue;
    }
    commitments.push(followUpCommitment(followUp, now));
  }

  const normalized = commitments.map((commitment) => ({
    ...commitment,
    control_state: controlState(commitment, now),
    linked_job_count: commitment.linked_jobs.length,
    next_action_count: commitment.next_actions.length,
    executive_attention_required: commitment.linked_jobs.some((job) => job.status === "REVIEW_REQUIRED"),
    legal_breach_inferred: false,
    urgency_inferred: false,
    commitment_inferred: false,
    external_authority_used: false,
  }));

  normalized.sort((a, b) => {
    const rank = controlRank(a.control_state) - controlRank(b.control_state);
    if (rank !== 0) return rank;
    const aDue = Date.parse(text(a.due_at, 160));
    const bDue = Date.parse(text(b.due_at, 160));
    if (Number.isFinite(aDue) && Number.isFinite(bDue) && aDue !== bDue) return aDue - bDue;
    if (Number.isFinite(aDue)) return -1;
    if (Number.isFinite(bDue)) return 1;
    return a.commitment_id.localeCompare(b.commitment_id);
  });

  const selected = normalized.slice(0, limit);
  return {
    status: "completed",
    contract: CONTRACT,
    generated_at: new Date().toISOString(),
    evaluated_at: now,
    commitments: selected,
    summary: {
      active_commitment_count: normalized.length,
      returned_commitment_count: selected.length,
      explicit_commitment_count: normalized.filter((item) => item.explicit_commitment === true).length,
      executive_decision_required_count: normalized.filter((item) => item.control_state === "EXECUTIVE_DECISION_REQUIRED").length,
      action_due_count: normalized.filter((item) => item.control_state === "ACTION_DUE").length,
      waiting_external_count: normalized.filter((item) => item.control_state === "WAITING_EXTERNAL").length,
      scheduled_next_action_count: normalized.filter((item) => item.control_state === "SCHEDULED_NEXT_ACTION").length,
      linked_jobs_absorbed: activeJobs.length - normalized.filter((item) => item.source_type === "JOB").length,
      linked_follow_ups_absorbed: activeFollowUps.length - normalized.filter((item) => item.source_type === "FOLLOW_UP").length,
    },
    evidence_only: true,
    durable_records_only: true,
    explicit_commitments_preserved: true,
    commitment_inferred: false,
    urgency_inferred: false,
    legal_breach_inferred: false,
    legal_compliance_inferred: false,
    approval_extends_authority: false,
    platform_permissions_mutated: false,
    binding_authority_delegated: false,
    approval_authority_delegated: false,
    external_authority_used: false,
  };
}

export default readSecretaryCommitmentControl;
