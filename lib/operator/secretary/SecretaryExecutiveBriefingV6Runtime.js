import { readSecretaryExecutiveBriefingV5 } from "@/lib/operator/secretary/SecretaryExecutiveBriefingV5Runtime";
import { listSecretaryExecutiveDecisions } from "@/lib/operator/secretary/SecretaryExecutiveDecisionRegisterRuntime";
import { readSecretaryTravelOperationsV2 } from "@/lib/operator/secretary/SecretaryTravelOperationsReadV2Runtime";

const CONTRACT = "AVANTIQO_EXECUTIVE_SECRETARY_DESK_BRIEFING_V6";

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

function decisionSections(result) {
  const decisions = list(result?.decisions);
  const current = list(result?.current_decisions);
  const retracted = list(result?.retracted_decisions);
  return {
    decisions,
    current,
    retracted,
    summary: {
      ...object(result?.summary),
      current_with_follow_through_count: current.filter((item) => text(item?.current_version?.follow_through_task_id, 120)).length,
      current_without_follow_through_count: current.filter((item) => !text(item?.current_version?.follow_through_task_id, 120)).length,
    },
    evidence_only: true,
    durable_records_only: true,
    counted_again_in_v6_exception_total: false,
    missing_follow_through_is_not_inferred_exception: true,
    decision_timestamp_inferred: false,
    decision_inferred: false,
    decision_made_by_secretary: false,
    decision_authority_created: false,
    approval_authority_delegated: false,
    binding_authority_delegated: false,
    platform_permissions_mutated: false,
    external_authority_used: false,
  };
}

async function upgradeTravelSections({ context, baseTravel }) {
  const existing = list(baseTravel?.active_jobs);
  const reads = await Promise.all(existing.map((operation) => {
    const jobId = text(operation?.job?.id, 120);
    if (!jobId) {
      return Promise.resolve({
        name: "travel_operations_v2:UNKNOWN_JOB",
        data: operation,
        error: readFailure("travel_operations_v2:UNKNOWN_JOB", "TRAVEL_JOB_ID_MISSING"),
      });
    }
    return settle(
      `travel_operations_v2:${jobId}`,
      () => readSecretaryTravelOperationsV2({ context, payload: { job_id: jobId } }),
    ).then((result) => ({ ...result, fallback: operation }));
  }));

  const operations = reads.map((item) => item.data || item.fallback).filter(Boolean);
  const sourceErrors = reads.map((item) => item.error).filter(Boolean);
  const cancellationHistory = operations.flatMap((item) => list(item?.cancellation_history));
  const cancelledConfirmations = operations.flatMap((item) => list(item?.cancelled_confirmations));

  return {
    ...object(baseTravel),
    active_jobs: operations,
    active_job_count: operations.length,
    confirmed_itinerary_item_count: operations.reduce((sum, item) => sum + Number(item?.evidence_summary?.confirmed_items || 0), 0),
    cancelled_item_count: operations.reduce((sum, item) => sum + Number(item?.evidence_summary?.cancelled_items || 0), 0),
    voided_item_count: operations.reduce((sum, item) => sum + Number(item?.evidence_summary?.voided_items || 0), 0),
    disruption_count: operations.reduce((sum, item) => sum + Number(item?.evidence_summary?.disruptions || 0), 0),
    approval_required_step_count: operations.reduce((sum, item) => sum + Number(item?.evidence_summary?.approval_required_steps || 0), 0),
    cancelled_confirmations: cancelledConfirmations,
    cancellation_history: cancellationHistory,
    source_errors: [...list(baseTravel?.source_errors), ...sourceErrors],
    travel_operations_v2_complete: sourceErrors.length === 0,
    cancellation_history_counted_again_in_v6_exception_total: false,
    cancellation_inferred: false,
    cancellation_intent_is_cancellation: false,
    cancellation_request_sent: false,
    cancellation_fee_commitment_created: false,
    refund_settlement_authority_created: false,
    rebooking_authority_created: false,
    researched_option_is_confirmation: false,
    confirmation_inferred: false,
    disruption_impact_inferred: false,
    booking_authority_created: false,
    payment_authority_created: false,
    binding_authority_created: false,
    external_authority_used: false,
  };
}

function headlineV6(base, decisions, travel) {
  const currentDecisions = Number(decisions?.summary?.current_lineages || decisions?.current?.length || 0);
  const retractedDecisions = Number(decisions?.summary?.retracted_lineages || decisions?.retracted?.length || 0);
  const cancelled = Number(travel?.cancelled_item_count || 0);
  const voided = Number(travel?.voided_item_count || 0);
  return [
    base?.headline || null,
    `${currentDecisions} current executive decision record${currentDecisions === 1 ? "" : "s"} in the durable register`,
    retractedDecisions ? `${retractedDecisions} retracted decision lineage${retractedDecisions === 1 ? "" : "s"} preserved in history` : null,
    cancelled || voided ? `${cancelled} evidenced travel cancellation${cancelled === 1 ? "" : "s"} and ${voided} void${voided === 1 ? "" : "s"} recorded` : null,
    "V6 preserves V5 exception and Secretary-owned counts; decision-register entries and cancellation history are not added again as exceptions.",
  ].filter(Boolean).join("; ");
}

export async function readSecretaryExecutiveBriefingV6({ context, payload = {} } = {}) {
  organizationId(context);
  const limit = Math.min(300, Math.max(1, Number(payload.limit || 100)));
  const base = await readSecretaryExecutiveBriefingV5({ context, payload });
  const baseDesk = object(base.executive_desk);

  const [decisionsRead, travelRead] = await Promise.all([
    settle("decision_register", () => listSecretaryExecutiveDecisions({ context, payload: { limit } })),
    settle("travel_operations_v2", () => upgradeTravelSections({
      context,
      baseTravel: object(baseDesk.travel_operations),
    })),
  ]);

  const decisions = decisionSections(decisionsRead.data);
  const travel = travelRead.data || {
    ...object(baseDesk.travel_operations),
    cancelled_confirmations: [],
    cancellation_history: [],
    cancelled_item_count: 0,
    voided_item_count: 0,
    source_errors: [],
    travel_operations_v2_complete: false,
    cancellation_history_counted_again_in_v6_exception_total: false,
    cancellation_inferred: false,
    cancellation_intent_is_cancellation: false,
    cancellation_request_sent: false,
    cancellation_fee_commitment_created: false,
    refund_settlement_authority_created: false,
    rebooking_authority_created: false,
    booking_authority_created: false,
    payment_authority_created: false,
    binding_authority_created: false,
    external_authority_used: false,
  };

  const sourceErrors = [
    ...list(base?.source_status?.source_errors),
    decisionsRead.error,
    travelRead.error,
    ...list(travel.source_errors),
  ].filter(Boolean);

  const v5ExceptionCount = Number(baseDesk.exception_count || 0);
  const v5SecretaryOwnedCount = Number(baseDesk.secretary_owned_count || 0);

  return {
    status: "completed",
    contract: CONTRACT,
    generated_at: new Date().toISOString(),
    cadence: base.cadence,
    window: base.window,
    headline: headlineV6(base, decisions, travel),
    executive_desk: {
      ...baseDesk,
      decision_register: decisions,
      travel_operations: travel,
      exception_count: v5ExceptionCount,
      secretary_owned_count: v5SecretaryOwnedCount,
      current_decision_count: Number(decisions?.summary?.current_lineages || decisions.current.length || 0),
      retracted_decision_count: Number(decisions?.summary?.retracted_lineages || decisions.retracted.length || 0),
      travel_cancelled_item_count: Number(travel.cancelled_item_count || 0),
      travel_voided_item_count: Number(travel.voided_item_count || 0),
      counting_policy: {
        ...object(baseDesk.counting_policy),
        v5_exception_count_preserved: true,
        v5_secretary_owned_count_preserved: true,
        decision_register_not_added_again: true,
        travel_cancellation_history_not_added_again: true,
      },
    },
    source_status: {
      complete: sourceErrors.length === 0,
      source_errors: sourceErrors,
      partial_briefing_allowed: true,
    },
    underlying_v5: base,
    evidence_only: true,
    conclusions_not_inferred: true,
    decision_inferred: false,
    decision_timestamp_inferred: false,
    decision_made_by_secretary: false,
    decision_authority_created: false,
    commitment_inferred: false,
    urgency_inferred: false,
    legal_breach_inferred: false,
    preferences_inferred: false,
    secrets_stored: false,
    travel_confirmation_inferred: false,
    travel_cancellation_inferred: false,
    travel_cancellation_intent_is_cancellation: false,
    travel_disruption_impact_inferred: false,
    cancellation_fee_commitment_created: false,
    refund_settlement_authority_created: false,
    rebooking_authority_created: false,
    booking_authority_created: false,
    payment_authority_created: false,
    binding_authority_created: false,
    approval_extends_authority: false,
    approval_authority_delegated: false,
    platform_permissions_mutated: false,
    external_authority_used: false,
  };
}

export default readSecretaryExecutiveBriefingV6;
