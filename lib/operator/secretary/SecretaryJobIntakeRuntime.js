import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const JOB_STATUSES = new Set([
  "QUEUED",
  "PLANNING",
  "ACTIVE",
  "WAITING",
  "REVIEW_REQUIRED",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
]);

const AUTONOMY_LEVELS = new Set([
  "PLAN_ONLY",
  "EXECUTE_WITH_GATES",
  "EXECUTE_WITHIN_POLICY",
]);

function text(value, limit = 12000) {
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

function actorPartyId(context = {}) {
  const id = text(
    context.actor?.partyId || context.actor?.party_id || context.metadata?.partyId,
    120,
  );
  if (!id) throw new Error("SECRETARY_REQUESTED_BY_PARTY_REQUIRED");
  return id;
}

function autonomyLevel(value) {
  const level = text(value, 60).toUpperCase() || "EXECUTE_WITH_GATES";
  if (!AUTONOMY_LEVELS.has(level)) throw new Error("SECRETARY_JOB_AUTONOMY_LEVEL_INVALID");
  return level;
}

function jobStatus(value) {
  const status = text(value, 60).toUpperCase();
  if (!status) return null;
  if (!JOB_STATUSES.has(status)) throw new Error("SECRETARY_JOB_STATUS_INVALID");
  return status;
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

export async function delegateSecretaryJob({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const requestedByPartyId = actorPartyId(context);
  const objective = text(payload.objective, 8000);
  if (!objective) throw new Error("SECRETARY_JOB_OBJECTIVE_REQUIRED");

  const criteria = list(payload.success_criteria || payload.successCriteria)
    .map((value) => text(value, 1200))
    .filter(Boolean)
    .slice(0, 30);
  const autonomy = autonomyLevel(payload.autonomy_level || payload.autonomyLevel);
  const now = new Date().toISOString();
  const timezone = text(payload.timezone || context.timezone, 120) || null;

  const job = await one(
    supabaseAdmin
      .from("secretary_jobs")
      .insert({
        organization_id: organization,
        entity_id: text(payload.entity_id || payload.entityId, 120) || context.entityId || null,
        requested_by_party_id: requestedByPartyId,
        source_kind: "MANUAL",
        source_id: null,
        source_meeting_id: null,
        objective,
        success_criteria: criteria,
        status: "QUEUED",
        autonomy_level: autonomy,
        approval_policy: object(payload.approval_policy || payload.approvalPolicy),
        execution_plan: [],
        next_action_at: now,
        max_attempts: Math.max(1, Math.min(Number(payload.max_attempts || payload.maxAttempts) || 20, 200)),
        metadata: {
          ...object(payload.metadata),
          delegated_directly: true,
          requested_via: "OPERATOR",
          secretary_role: "EXECUTIVE_SECRETARY",
          timezone,
          external_authority_used: false,
        },
      })
      .select("*")
      .single(),
  );

  return {
    status: "queued",
    job,
    secretary_owns_follow_through: true,
    external_authority_used: false,
  };
}

export async function listSecretaryJobs({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const status = jobStatus(payload.status);
  const limit = Math.max(1, Math.min(Number(payload.limit) || 50, 100));

  let query = supabaseAdmin
    .from("secretary_jobs")
    .select("id,entity_id,requested_by_party_id,source_kind,objective,success_criteria,status,autonomy_level,result_summary,next_action_at,attempt_count,max_attempts,last_error,metadata,created_at,updated_at,completed_at")
    .eq("organization_id", organization)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status) query = query.eq("status", status);
  const entityId = text(payload.entity_id || payload.entityId, 120);
  if (entityId) query = query.eq("entity_id", entityId);

  const jobs = await many(query);
  return { status: "completed", jobs, count: jobs.length };
}

export async function readSecretaryJob({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const jobId = text(payload.job_id || payload.jobId, 120);
  if (!jobId) throw new Error("SECRETARY_JOB_ID_REQUIRED");

  const job = await one(
    supabaseAdmin
      .from("secretary_jobs")
      .select("*")
      .eq("organization_id", organization)
      .eq("id", jobId)
      .maybeSingle(),
  );
  if (!job) throw new Error("SECRETARY_JOB_NOT_FOUND");

  const steps = await many(
    supabaseAdmin
      .from("secretary_job_steps")
      .select("*")
      .eq("organization_id", organization)
      .eq("job_id", jobId)
      .order("sequence_number", { ascending: true }),
  );

  return {
    status: "completed",
    job,
    steps,
    secretary_owns_follow_through: !["COMPLETED", "FAILED", "CANCELLED"].includes(job.status),
  };
}

export default Object.freeze({
  delegate: delegateSecretaryJob,
  list: listSecretaryJobs,
  read: readSecretaryJob,
});