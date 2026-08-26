import { readSecretaryExecutiveBriefing as readSecretaryExecutiveBriefingV3 } from "./SecretaryExecutiveBriefingRuntime";
import { listSecretaryDeadlines } from "./SecretaryDeadlineCoordinationRuntime";
import { listSecretaryDocumentFiles } from "./SecretaryDocumentFilingRuntime";
import { listSecretaryRelationshipAttention } from "./SecretaryRelationshipMemoryRuntime";
import { listSecretaryAbsenceCoverage } from "./SecretaryAbsenceCoverageRuntime";
import { listSecretaryCallScreeningAttention } from "./SecretaryCallScreeningRuntime";

const CONTRACT = "AVANTIQO_EXECUTIVE_SECRETARY_DESK_BRIEFING_V4";
const DAY_MS = 24 * 60 * 60 * 1000;

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function actorPartyId(context = {}) {
  return text(context?.metadata?.partyId || context?.actor?.partyId || context?.actor?.party_id, 120) || null;
}

function cadencePayload(payload = {}) {
  const cadence = text(payload.cadence || payload.briefing_cadence, 40).toUpperCase() || "DAILY";
  if (!["DAILY", "WEEKLY", "CUSTOM"].includes(cadence)) throw new Error("SECRETARY_BRIEFING_CADENCE_INVALID");
  const next = { ...payload };
  if (!payload.to && !payload.date_to && !payload.horizon_hours && !payload.horizonHours) {
    if (cadence === "WEEKLY") next.horizon_hours = 168;
    if (cadence === "DAILY") next.horizon_hours = 24;
  }
  return { cadence, payload: next };
}

function withinWindow(value, from, to) {
  const at = Date.parse(text(value, 120));
  if (!Number.isFinite(at)) return false;
  return at >= Date.parse(from) && at <= Date.parse(to);
}

function dueByWindow(value, to) {
  const at = Date.parse(text(value, 120));
  return Number.isFinite(at) && at <= Date.parse(to);
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

function deadlineSections(result, from, to) {
  const deadlines = list(result?.deadlines);
  const relevant = deadlines.filter((item) => dueByWindow(item.due_at, to));
  const overdue = relevant.filter((item) => item.temporal_status === "OVERDUE_TEMPORALLY");
  const missingInputs = relevant.filter((item) => Number(item.missing_input_count || 0) > 0);
  const upcoming = relevant.filter((item) => item.temporal_status !== "OVERDUE_TEMPORALLY" && withinWindow(item.due_at, from, to));
  return {
    relevant,
    overdue,
    missing_inputs: missingInputs,
    upcoming,
    legal_compliance_inferred: false,
    legal_non_compliance_inferred: false,
  };
}

function documentSections(result) {
  const documents = list(result?.documents);
  const missing = documents.filter((item) => {
    const status = text(item.document_status, 80).toUpperCase();
    return status !== "CANCELLED" && Number(item.current_version || 0) === 0;
  });
  const current = documents.filter((item) => Number(item.current_version || 0) > 0 && text(item.document_status, 80).toUpperCase() !== "CANCELLED");
  return {
    missing,
    current,
    review_inferred: false,
    signature_inferred: false,
    acceptance_inferred: false,
    submission_inferred: false,
  };
}

function relationshipSections(result) {
  const relationships = list(result?.relationships);
  return {
    due: relationships,
    overdue: relationships.filter((item) => item.overdue === true),
    priority_inferred: false,
  };
}

function expenseSections(base) {
  const tasks = list(base?.open_tasks);
  const packs = tasks.filter((task) => object(task.metadata).expense_pack === true);
  return {
    active: packs.map((task) => {
      const metadata = object(task.metadata);
      const items = list(metadata.items);
      const missing = items.filter((item) => item.receipt_required === true && item.status !== "RECEIVED");
      return {
        pack_id: task.id,
        pack_reference: metadata.pack_reference || null,
        state: metadata.expense_pack_state || null,
        due_at: task.due_at || metadata.collection_deadline || null,
        missing_receipt_count: missing.length,
        review_status: metadata.review_status || null,
        pending_revision: metadata.pending_revision === true,
      };
    }),
    reimbursement_eligibility_inferred: false,
    accounting_treatment_inferred: false,
    payment_authority_created: false,
  };
}

function visitorSections(base) {
  const tasks = list(base?.open_tasks);
  const visitors = tasks.filter((task) => {
    const metadata = object(task.metadata);
    return metadata.visitor_coordination === true || metadata.secretary_visitor_coordination === true;
  });
  return {
    active: visitors.map((task) => ({
      coordination_id: task.id,
      title: task.title,
      status: task.status,
      due_at: task.due_at || null,
      priority: task.priority || "NORMAL",
      metadata: object(task.metadata),
    })),
    arrival_inferred: false,
    physical_access_authority_created: false,
  };
}

function coverageSections(result, from, to) {
  const coverages = list(result?.coverages);
  return {
    relevant: coverages.filter((item) => {
      const starts = Date.parse(text(item.starts_at, 120));
      const ends = Date.parse(text(item.ends_at, 120));
      if (!Number.isFinite(starts) || !Number.isFinite(ends)) return false;
      return starts <= Date.parse(to) && ends >= Date.parse(from);
    }),
    binding_authority_created: false,
    platform_permissions_mutated: false,
  };
}

function callScreeningSections(result) {
  const attention = list(result?.attention);
  return {
    attention,
    urgent: attention.filter((item) => item.priority === "URGENT"),
    high: attention.filter((item) => item.priority === "HIGH"),
    vip_inferred: false,
    urgency_inferred: false,
  };
}

function secretaryOwnedFollowThrough(base) {
  const pending = list(base?.pending_follow_ups).filter((followUp) => {
    const metadata = object(followUp.metadata);
    return text(metadata.execution_owner, 40).toUpperCase() === "SECRETARY" && metadata.execution_ready === true;
  });
  return {
    pending,
    count: pending.length,
    secretary_owns_follow_through: true,
  };
}

function recentlyCompleted(base, from, to) {
  return list(base?.delegated_work?.recent_completed).filter((item) => {
    const completedAt = item.completed_at || item.updated_at || item.created_at;
    return withinWindow(completedAt, from, to);
  });
}

export async function readSecretaryExecutiveBriefingV4({ context, payload = {} } = {}) {
  const normalized = cadencePayload(payload);
  const base = await readSecretaryExecutiveBriefingV3({ context, payload: normalized.payload });
  const from = base.window.from;
  const to = base.window.to;
  const executivePartyId = actorPartyId(context);
  const limit = Math.min(300, Math.max(1, Number(payload.limit || 100)));

  const reads = await Promise.all([
    settle("deadlines", () => listSecretaryDeadlines({ context, payload: { limit } })),
    settle("documents", () => listSecretaryDocumentFiles({ context, payload: { limit } })),
    settle("relationships", () => listSecretaryRelationshipAttention({ context, payload: { now: from, through: to, limit } })),
    settle("absence_coverage", () => listSecretaryAbsenceCoverage({ context, payload: { owner_party_id: executivePartyId, limit } })),
    settle("call_screening", () => listSecretaryCallScreeningAttention({ context, payload: { limit } })),
  ]);
  const data = Object.fromEntries(reads.map((item) => [item.name, item.data]));
  const sourceErrors = reads.map((item) => item.error).filter(Boolean);

  const deadlines = deadlineSections(data.deadlines, from, to);
  const documents = documentSections(data.documents);
  const relationships = relationshipSections(data.relationships);
  const expenses = expenseSections(base);
  const visitors = visitorSections(base);
  const coverage = coverageSections(data.absence_coverage, from, to);
  const callScreening = callScreeningSections(data.call_screening);
  const followThrough = secretaryOwnedFollowThrough(base);
  const completed = recentlyCompleted(base, from, to);

  const decisions = [
    ...list(base?.executive_desk?.decisions_required),
    ...list(base?.executive_desk?.correspondence_attention),
  ];
  const exceptionCount = decisions.length
    + deadlines.overdue.length
    + deadlines.missing_inputs.length
    + documents.missing.length
    + relationships.overdue.length
    + expenses.active.filter((item) => item.missing_receipt_count > 0 || item.pending_revision).length
    + callScreening.attention.length;

  const secretaryActiveCount = Number(base?.executive_desk?.secretary_owned_count || 0)
    + followThrough.count;

  const headline = exceptionCount > 0
    ? `${exceptionCount} evidence-backed exception or decision item${exceptionCount === 1 ? "" : "s"} need attention in this ${normalized.cadence.toLowerCase()} briefing; Secretary continues ${secretaryActiveCount} active follow-through item${secretaryActiveCount === 1 ? "" : "s"}.`
    : `No evidence-backed exception requires executive attention in this ${normalized.cadence.toLowerCase()} briefing; Secretary continues ${secretaryActiveCount} active follow-through item${secretaryActiveCount === 1 ? "" : "s"}.`;

  return {
    status: "completed",
    contract: CONTRACT,
    generated_at: new Date().toISOString(),
    cadence: normalized.cadence,
    window: { from, to },
    headline,
    executive_desk: {
      decisions_required: decisions,
      correspondence_attention: list(base?.executive_desk?.correspondence_attention),
      call_screening: callScreening,
      deadlines,
      documents,
      relationships,
      expenses,
      travel: object(base?.executive_desk?.travel),
      visitors,
      absence_coverage: coverage,
      agenda: list(base?.executive_desk?.today?.agenda),
      executive_tasks: list(base?.executive_desk?.executive_tasks),
      at_risk: list(base?.executive_desk?.at_risk),
      secretary_follow_through: followThrough,
      secretary_handling: object(base?.executive_desk?.secretary_handling),
      recently_completed: completed,
      exception_count: exceptionCount,
      secretary_owned_count: secretaryActiveCount,
      no_action_required: exceptionCount === 0,
    },
    source_status: {
      complete: sourceErrors.length === 0,
      source_errors: sourceErrors,
      partial_briefing_allowed: true,
    },
    underlying_v3: base,
    evidence_only: true,
    conclusions_not_inferred: true,
    relationship_priority_inferred: false,
    call_vip_inferred: false,
    call_urgency_inferred: false,
    legal_compliance_inferred: false,
    legal_non_compliance_inferred: false,
    reimbursement_eligibility_inferred: false,
    accounting_treatment_inferred: false,
    physical_access_authority_created: false,
    approval_extends_authority: false,
    external_authority_used: false,
  };
}

export default readSecretaryExecutiveBriefingV4;
