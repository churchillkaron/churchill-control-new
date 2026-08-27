import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { readSecretaryExecutiveBriefingV4 } from "@/lib/operator/secretary/SecretaryExecutiveBriefingV4Runtime";
import { readSecretaryCommitmentControl } from "@/lib/operator/secretary/SecretaryCommitmentControlRuntime";
import { readSecretaryWorkingPreferences } from "@/lib/operator/secretary/SecretaryWorkingPreferencesRuntime";
import { readSecretaryTravelOperations } from "@/lib/operator/secretary/SecretaryTravelOperationsRuntime";

const CONTRACT = "AVANTIQO_EXECUTIVE_SECRETARY_DESK_BRIEFING_V5";
const ACTIVE_JOB_STATUSES = ["QUEUED", "PLANNING", "ACTIVE", "WAITING", "REVIEW_REQUIRED"];

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

async function many(result) {
  const resolved = await result;
  if (resolved.error) throw resolved.error;
  return Array.isArray(resolved.data) ? resolved.data : [];
}

function readFailure(name, error) {
  return {
    source: name,
    error: text(error?.message || error, 500) || "SOURCE_READ_FAILED",
  };
}

async function settle(name, read) {
  try {
    return { name, data: await read(), error: null };
  } catch (error) {
    return { name, data: null, error: readFailure(name, error) };
  }
}

function commitmentSections(result) {
  const commitments = list(result?.commitments);
  const executive = commitments.filter((item) => item.control_state === "EXECUTIVE_DECISION_REQUIRED");
  const actionDue = commitments.filter((item) => item.control_state === "ACTION_DUE");
  const waitingExternal = commitments.filter((item) => item.control_state === "WAITING_EXTERNAL");
  const staffDelegations = commitments.filter((item) => item.category === "STAFF_DELEGATION");
  const meetingCloseout = commitments.filter((item) => {
    const metadata = object(item.source_metadata);
    return metadata.secretary_meeting_closeout === true;
  });
  return {
    active: commitments,
    summary: object(result?.summary),
    executive_decision_required: executive,
    action_due: actionDue,
    waiting_external: waitingExternal,
    staff_delegations: staffDelegations,
    meeting_closeout: meetingCloseout,
    canonical_register: true,
    counted_again_in_v5_exception_total: false,
    commitment_inferred: false,
    urgency_inferred: false,
    legal_breach_inferred: false,
  };
}

function preferenceSections(result) {
  const current = list(result?.current_preferences);
  const briefingRelevant = current.filter((item) => [
    "CALENDAR",
    "MEETING",
    "COMMUNICATION",
    "TRAVEL",
    "ROUTINE",
    "GENERAL",
  ].includes(text(item.domain, 80).toUpperCase()));
  return {
    current: briefingRelevant,
    canonical_defaults: object(result?.canonical_defaults),
    register_version: Number(result?.register_version || 0),
    explicit_instruction_overrides_preference: true,
    preferences_inferred: false,
    secrets_stored: false,
    authority_created: false,
  };
}

async function activeTravelJobIds(organization, limit) {
  const rows = await many(
    supabaseAdmin.from("secretary_jobs")
      .select("id,status,metadata,created_at")
      .eq("organization_id", organization)
      .in("status", ACTIVE_JOB_STATUSES)
      .order("created_at", { ascending: false })
      .limit(Math.min(100, Math.max(1, limit))),
  );
  return rows
    .filter((row) => text(object(row.metadata).job_kind, 80).toUpperCase() === "TRAVEL_COORDINATION")
    .map((row) => row.id);
}

async function travelSections({ context, limit }) {
  const organization = organizationId(context);
  const jobIds = await activeTravelJobIds(organization, limit);
  const reads = await Promise.all(
    jobIds.map((jobId) => settle(
      `travel_operations:${jobId}`,
      () => readSecretaryTravelOperations({ context, payload: { job_id: jobId } }),
    )),
  );
  const operations = reads.map((item) => item.data).filter(Boolean);
  const sourceErrors = reads.map((item) => item.error).filter(Boolean);
  return {
    active_jobs: operations,
    active_job_count: operations.length,
    confirmed_itinerary_item_count: operations.reduce((sum, item) => sum + Number(item?.evidence_summary?.confirmed_items || 0), 0),
    disruption_count: operations.reduce((sum, item) => sum + Number(item?.evidence_summary?.disruptions || 0), 0),
    approval_required_step_count: operations.reduce((sum, item) => sum + Number(item?.evidence_summary?.approval_required_steps || 0), 0),
    source_errors: sourceErrors,
    researched_option_is_confirmation: false,
    confirmation_inferred: false,
    disruption_impact_inferred: false,
    booking_authority_created: false,
    payment_authority_created: false,
    binding_authority_created: false,
  };
}

function headlineV5(base, commitments, travel) {
  const exceptionCount = Number(base?.executive_desk?.exception_count || 0);
  const activeCommitments = Number(commitments?.summary?.active_commitment_count || commitments?.active?.length || 0);
  const dueCommitments = list(commitments?.action_due).length;
  const waiting = list(commitments?.waiting_external).length;
  const travelApprovals = Number(travel?.approval_required_step_count || 0);
  return [
    base?.headline || null,
    `${activeCommitments} active commitment${activeCommitments === 1 ? "" : "s"} are in the unified register`,
    dueCommitments ? `${dueCommitments} currently action-due` : null,
    waiting ? `${waiting} waiting on external response` : null,
    travelApprovals ? `${travelApprovals} travel step${travelApprovals === 1 ? "" : "s"} remain behind exact approval` : null,
    `V5 preserves the V4 exception count at ${exceptionCount} and does not double-count commitments already represented by underlying tasks, jobs, or follow-ups.`,
  ].filter(Boolean).join("; ");
}

export async function readSecretaryExecutiveBriefingV5({ context, payload = {} } = {}) {
  organizationId(context);
  const limit = Math.min(300, Math.max(1, Number(payload.limit || 100)));
  const base = await readSecretaryExecutiveBriefingV4({ context, payload });
  const evaluatedAt = text(payload.now || payload.at || base.generated_at, 160) || new Date().toISOString();

  const [commitmentsRead, preferencesRead, travelRead] = await Promise.all([
    settle("commitment_control", () => readSecretaryCommitmentControl({ context, payload: { now: evaluatedAt, limit } })),
    settle("working_preferences", () => readSecretaryWorkingPreferences({ context, payload: { include_history: false } })),
    settle("travel_operations", () => travelSections({ context, limit })),
  ]);

  const commitments = commitmentSections(commitmentsRead.data);
  const preferences = preferenceSections(preferencesRead.data);
  const travel = travelRead.data || {
    active_jobs: [],
    active_job_count: 0,
    confirmed_itinerary_item_count: 0,
    disruption_count: 0,
    approval_required_step_count: 0,
    source_errors: [],
    researched_option_is_confirmation: false,
    confirmation_inferred: false,
    disruption_impact_inferred: false,
    booking_authority_created: false,
    payment_authority_created: false,
    binding_authority_created: false,
  };

  const sourceErrors = [
    ...list(base?.source_status?.source_errors),
    commitmentsRead.error,
    preferencesRead.error,
    travelRead.error,
    ...list(travel.source_errors),
  ].filter(Boolean);

  const v4ExceptionCount = Number(base?.executive_desk?.exception_count || 0);
  const v4SecretaryOwnedCount = Number(base?.executive_desk?.secretary_owned_count || 0);

  return {
    status: "completed",
    contract: CONTRACT,
    generated_at: new Date().toISOString(),
    cadence: base.cadence,
    window: base.window,
    headline: headlineV5(base, commitments, travel),
    executive_desk: {
      ...object(base.executive_desk),
      commitments,
      working_preferences: preferences,
      travel_operations: travel,
      exception_count: v4ExceptionCount,
      secretary_owned_count: v4SecretaryOwnedCount,
      unified_active_commitment_count: Number(commitments?.summary?.active_commitment_count || commitments?.active?.length || 0),
      commitment_action_due_count: list(commitments.action_due).length,
      commitment_waiting_external_count: list(commitments.waiting_external).length,
      travel_approval_required_step_count: Number(travel.approval_required_step_count || 0),
      counting_policy: {
        v4_exception_count_preserved: true,
        commitment_register_not_added_again: true,
        secretary_owned_count_not_recomputed_from_commitments: true,
      },
    },
    source_status: {
      complete: sourceErrors.length === 0,
      source_errors: sourceErrors,
      partial_briefing_allowed: true,
    },
    underlying_v4: base,
    evidence_only: true,
    conclusions_not_inferred: true,
    commitment_inferred: false,
    urgency_inferred: false,
    legal_breach_inferred: false,
    preferences_inferred: false,
    secrets_stored: false,
    travel_confirmation_inferred: false,
    travel_disruption_impact_inferred: false,
    booking_authority_created: false,
    payment_authority_created: false,
    binding_authority_created: false,
    approval_extends_authority: false,
    platform_permissions_mutated: false,
    external_authority_used: false,
  };
}

export default readSecretaryExecutiveBriefingV5;
