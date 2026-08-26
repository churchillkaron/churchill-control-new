import { readAgenda, listCalls, listFollowUps, listTasks } from "@/lib/operator/secretary/SecretaryRuntime";
import { scanSecretaryDueWork } from "@/lib/operator/secretary/SecretaryDueWorkRuntime";
import { listSecretaryJobs, readSecretaryJob } from "@/lib/operator/secretary/SecretaryJobIntakeRuntime";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function number(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function timeWindow(payload = {}) {
  const now = new Date();
  const fromValue = text(payload.from || payload.date_from, 120);
  const toValue = text(payload.to || payload.date_to, 120);
  const from = fromValue && Number.isFinite(Date.parse(fromValue)) ? new Date(fromValue) : now;
  const horizonHours = number(payload.horizon_hours || payload.horizonHours, 24, 1, 168);
  const to = toValue && Number.isFinite(Date.parse(toValue))
    ? new Date(toValue)
    : new Date(from.getTime() + horizonHours * 60 * 60 * 1000);
  if (to.getTime() <= from.getTime()) throw new Error("SECRETARY_BRIEFING_WINDOW_INVALID");
  return { from: from.toISOString(), to: to.toISOString(), horizonHours };
}

function actorPartyId(context = {}) {
  return text(
    context?.metadata?.partyId || context?.actor?.partyId || context?.actor?.party_id,
    120,
  ) || null;
}

function jobAttention(jobs = []) {
  return jobs.filter((job) => ["REVIEW_REQUIRED", "FAILED"].includes(job.status));
}

function activeJobs(jobs = []) {
  return jobs.filter((job) => ["QUEUED", "PLANNING", "ACTIVE", "WAITING"].includes(job.status));
}

function isTravelJob(job = {}) {
  return text(object(job.metadata).job_kind, 80).toUpperCase() === "TRAVEL_COORDINATION";
}

function approvalReason(value) {
  const reason = text(value, 500).toUpperCase();
  return reason.includes("APPROVAL_REQUIRED")
    || reason.includes("HIGH_AUTHORITY")
    || reason.includes("REQUIRES_APPROVAL")
    || reason.includes("EXPLICIT_STEP_APPROVAL");
}

async function decisionCards(context, jobs = []) {
  const cards = await Promise.all(jobs.slice(0, 12).map(async (job) => {
    try {
      const detail = await readSecretaryJob({ context, payload: { job_id: job.id } });
      const steps = Array.isArray(detail.steps) ? detail.steps : [];
      const step = steps.find((candidate) => candidate.status === "APPROVAL_REQUIRED")
        || steps.find((candidate) => candidate.status === "FAILED")
        || steps.find((candidate) => !["COMPLETED", "SKIPPED"].includes(candidate.status))
        || null;
      const reason = text(step?.last_error || step?.result || job.last_error, 2000) || null;
      const exactApproval = Boolean(step && (step.requires_approval === true || approvalReason(reason)));
      return {
        job_id: job.id,
        objective: job.objective,
        job_status: job.status,
        step_id: step?.id || null,
        action_type: step?.action_type || null,
        instruction: step?.instruction || null,
        reason,
        decision_kind: job.status === "FAILED"
          ? "FAILED_WORK_REVIEW"
          : exactApproval
            ? "EXACT_STEP_APPROVAL"
            : "OPERATIONAL_INPUT_REQUIRED",
        explicit_approval_required: exactApproval,
        approval_scope: exactApproval ? "THIS_STEP_ONLY" : null,
        approval_extends_authority: false,
        secretary_resumes_after_decision: true,
        travel_coordination: isTravelJob(job),
      };
    } catch {
      return {
        job_id: job.id,
        objective: job.objective,
        job_status: job.status,
        step_id: null,
        action_type: null,
        instruction: null,
        reason: text(job.last_error, 2000) || null,
        decision_kind: job.status === "FAILED" ? "FAILED_WORK_REVIEW" : "JOB_REVIEW_REQUIRED",
        explicit_approval_required: false,
        approval_scope: null,
        approval_extends_authority: false,
        secretary_resumes_after_decision: true,
        travel_coordination: isTravelJob(job),
      };
    }
  }));
  return cards;
}

function secretaryOwnedFollowUp(followUp = {}) {
  const metadata = object(followUp.metadata);
  return text(metadata.execution_owner, 40).toUpperCase() === "SECRETARY"
    && metadata.execution_ready === true;
}

function dueWorkCards(dueWork = {}) {
  const items = Array.isArray(dueWork.items) ? dueWork.items : [];
  return items.map((item) => ({
    kind: item.kind,
    id: item.id,
    title: item.title,
    due_at: item.due_at || null,
    overdue: item.overdue === true,
    priority: item.priority || "NORMAL",
    action_type: item.action_type || null,
    owner_party_id: item.owner_party_id || null,
    contact_party_id: item.contact_party_id || null,
  }));
}

export async function readSecretaryExecutiveBriefing({ context, payload = {} } = {}) {
  const { from, to, horizonHours } = timeWindow(payload);
  const limit = number(payload.limit, 50, 1, 100);
  const executivePartyId = actorPartyId(context);

  const [agenda, dueWork, tasks, followUps, calls, jobResult] = await Promise.all([
    readAgenda({ context, payload: { from, to, limit } }),
    scanSecretaryDueWork({ context, payload: { now: from, horizon_hours: horizonHours, limit } }),
    listTasks({ context, payload: { include_completed: false, limit } }),
    listFollowUps({ context, payload: { include_completed: false, limit } }),
    listCalls({ context, payload: { limit: Math.min(limit, 25) } }),
    listSecretaryJobs({ context, payload: { limit } }),
  ]);

  const jobs = Array.isArray(jobResult.jobs) ? jobResult.jobs : [];
  const attention = jobAttention(jobs);
  const active = activeJobs(jobs);
  const events = Array.isArray(agenda.events) ? agenda.events : [];
  const openTasks = Array.isArray(tasks.tasks) ? tasks.tasks : [];
  const pendingFollowUps = Array.isArray(followUps.follow_ups) ? followUps.follow_ups : [];
  const recentCalls = Array.isArray(calls.calls) ? calls.calls : [];
  const decisionsRequired = await decisionCards(context, attention);
  const dueCards = dueWorkCards(dueWork);
  const overdue = dueCards.filter((item) => item.overdue);
  const secretaryFollowUps = pendingFollowUps.filter(secretaryOwnedFollowUp);
  const executiveTasks = openTasks.filter((task) => {
    const metadata = object(task.metadata);
    if (text(metadata.execution_owner, 40).toUpperCase() === "SECRETARY") return false;
    if (executivePartyId && task.owner_party_id) return task.owner_party_id === executivePartyId;
    return true;
  });
  const travelActive = active.filter(isTravelJob);
  const travelAttention = attention.filter(isTravelJob);
  const travelCompleted = jobs.filter((job) => job.status === "COMPLETED" && isTravelJob(job)).slice(0, 5);
  const pendingExternalResponses = active.filter((job) => object(job.metadata).awaiting_external_responses === true);
  const recentCompleted = jobs.filter((job) => job.status === "COMPLETED").slice(0, 10);

  const secretaryHandling = {
    delegated_jobs: active,
    executable_follow_ups: secretaryFollowUps,
    awaiting_external_responses: pendingExternalResponses,
    count: active.length + secretaryFollowUps.length,
  };

  const headline = decisionsRequired.length > 0
    ? `${decisionsRequired.length} decision${decisionsRequired.length === 1 ? "" : "s"} need your attention; Secretary is handling ${secretaryHandling.count} active item${secretaryHandling.count === 1 ? "" : "s"}.`
    : `No executive decision is required; Secretary is handling ${secretaryHandling.count} active item${secretaryHandling.count === 1 ? "" : "s"}.`;

  return {
    status: "completed",
    contract: "AVANTIQO_EXECUTIVE_SECRETARY_DESK_BRIEFING_V2",
    generated_at: new Date().toISOString(),
    window: { from, to },
    headline,
    executive_desk: {
      decisions_required: decisionsRequired,
      executive_tasks: executiveTasks,
      at_risk: overdue,
      today: {
        agenda: events,
        upcoming_count: events.length,
      },
      travel: {
        active: travelActive,
        attention_required: travelAttention,
        recently_completed: travelCompleted,
      },
      secretary_handling: secretaryHandling,
      recently_completed: recentCompleted,
      executive_interrupt_count: decisionsRequired.length + executiveTasks.filter((task) => task.priority === "URGENT").length,
      secretary_owned_count: secretaryHandling.count,
      no_action_required: decisionsRequired.length === 0,
    },
    agenda,
    due_work: dueWork,
    delegated_work: {
      active,
      attention_required: attention,
      recent_completed: recentCompleted,
    },
    open_tasks: openTasks,
    pending_follow_ups: pendingFollowUps,
    recent_calls: recentCalls,
    secretary_owns_follow_through: true,
    executive_attention_is_exception_based: true,
    approval_extends_authority: false,
    external_authority_used: false,
  };
}

export default readSecretaryExecutiveBriefing;
