import { readAgenda, listCalls, listFollowUps, listTasks } from "@/lib/operator/secretary/SecretaryRuntime";
import { scanSecretaryDueWork } from "@/lib/operator/secretary/SecretaryDueWorkRuntime";
import { listSecretaryJobs } from "@/lib/operator/secretary/SecretaryJobIntakeRuntime";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
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

function jobAttention(jobs = []) {
  return jobs.filter((job) => ["REVIEW_REQUIRED", "FAILED"].includes(job.status));
}

function activeJobs(jobs = []) {
  return jobs.filter((job) => ["QUEUED", "PLANNING", "ACTIVE", "WAITING"].includes(job.status));
}

export async function readSecretaryExecutiveBriefing({ context, payload = {} } = {}) {
  const { from, to, horizonHours } = timeWindow(payload);
  const limit = number(payload.limit, 50, 1, 100);

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

  const headline = [
    `${events.length} calendar event${events.length === 1 ? "" : "s"}`,
    `${openTasks.length} open task${openTasks.length === 1 ? "" : "s"}`,
    `${pendingFollowUps.length} pending follow-up${pendingFollowUps.length === 1 ? "" : "s"}`,
    `${active.length} active delegated job${active.length === 1 ? "" : "s"}`,
    `${attention.length} job${attention.length === 1 ? "" : "s"} needing attention`,
  ].join(", ");

  return {
    status: "completed",
    contract: "AVANTIQO_EXECUTIVE_SECRETARY_DESK_BRIEFING_V1",
    generated_at: new Date().toISOString(),
    window: { from, to },
    headline,
    agenda,
    due_work: dueWork,
    delegated_work: {
      active,
      attention_required: attention,
      recent_completed: jobs.filter((job) => job.status === "COMPLETED").slice(0, 10),
    },
    open_tasks: openTasks,
    pending_follow_ups: pendingFollowUps,
    recent_calls: recentCalls,
    secretary_owns_follow_through: true,
    external_authority_used: false,
  };
}

export default readSecretaryExecutiveBriefing;