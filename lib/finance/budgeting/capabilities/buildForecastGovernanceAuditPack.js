import { listForecastScenarioVersionsForOrganization } from "../repositories/ForecastScenarioVersionRepository";
import { listForecastOverrideReviewCases } from "../repositories/ForecastExceptionCaseRepository";
import { listForecastExceptionEscalationDeliveries } from "../repositories/ForecastExceptionEscalationDeliveryRepository";
import { listForecastGovernanceAuditEvents } from "../repositories/ForecastGovernanceAuditRepository";
import { forecastGovernanceControlStatus } from "../runtime/ForecastGovernanceControlPolicy";

function groupByEntityId(rows = []) {
  const grouped = new Map();
  for (const row of rows) {
    const key = String(row?.entity_id || "");
    if (!key) continue;
    const current = grouped.get(key) || [];
    current.push(row);
    grouped.set(key, current);
  }
  return grouped;
}

function reviewVersionId(review) {
  const parts = String(review?.occurrence_key || "").split(":");
  return parts.length >= 3 ? parts[parts.length - 1] : null;
}

function approvalEvidence(version) {
  const evidence = version?.governance?.approval_override || null;
  return {
    is_override: version?.approval_override === true,
    reason: version?.approval_override_reason || evidence?.reason || null,
    actor_id: evidence?.id || null,
    actor_name: evidence?.name || null,
    at: evidence?.at || version?.approved_at || null,
    blockers: Array.isArray(evidence?.blockers) ? evidence.blockers : [],
  };
}

function eventView(row) {
  return {
    id: row.id,
    action_type: row.action_type,
    actor_id: row.performed_by || null,
    actor_name: row.performed_by_name || null,
    created_at: row.created_at,
    old_data: row.old_data || null,
    new_data: row.new_data || null,
    metadata: row.metadata || null,
  };
}

export default async function buildForecastGovernanceAuditPack({
  organizationId,
  entityId = null,
  versionId = null,
} = {}) {
  if (!organizationId) throw new Error("organizationId required");

  const [allVersions, allReviews] = await Promise.all([
    listForecastScenarioVersionsForOrganization({ organizationId }),
    listForecastOverrideReviewCases({ organizationId }),
  ]);

  const reviewByVersionId = new Map(
    allReviews
      .map(review => [reviewVersionId(review), review])
      .filter(([id]) => Boolean(id))
  );

  let versions = allVersions.filter(row => row.approval_override === true);
  if (entityId) versions = versions.filter(row => String(row.entity_id) === String(entityId));
  if (versionId) versions = versions.filter(row => String(row.id) === String(versionId));

  const selectedVersionIds = versions.map(row => row.id).filter(Boolean);
  const selectedReviews = selectedVersionIds
    .map(id => reviewByVersionId.get(String(id)))
    .filter(Boolean);
  const reviewCaseIds = selectedReviews.map(row => row.id).filter(Boolean);

  const [{ version_events: versionEvents, review_events: reviewEvents }, deliveries] = await Promise.all([
    listForecastGovernanceAuditEvents({
      organizationId,
      versionIds: selectedVersionIds,
      reviewCaseIds,
    }),
    reviewCaseIds.length
      ? listForecastExceptionEscalationDeliveries({ organizationId, caseIds: reviewCaseIds })
      : Promise.resolve([]),
  ]);

  const versionEventsByVersion = groupByEntityId(versionEvents);
  const reviewEventsByCase = groupByEntityId(reviewEvents);
  const deliveriesByCase = new Map();
  for (const row of deliveries) {
    const key = String(row.case_id || "");
    if (!key) continue;
    const current = deliveriesByCase.get(key) || [];
    current.push(row);
    deliveriesByCase.set(key, current);
  }

  const records = versions.map(version => {
    const review = reviewByVersionId.get(String(version.id)) || null;
    const reviewEventsForCase = review ? reviewEventsByCase.get(String(review.id)) || [] : [];
    const closureEvent = reviewEventsForCase.find(row => row.action_type === "FORECAST_OVERRIDE_REVIEW_CLOSED") || null;
    const deliveryHistory = review ? deliveriesByCase.get(String(review.id)) || [] : [];
    const controlStatus = forecastGovernanceControlStatus({ review, closureEvent });

    return {
      forecast: {
        version_id: version.id,
        organization_id: version.organization_id,
        entity_id: version.entity_id,
        period_id: version.period_id,
        scenario_kind: version.scenario_kind,
        version_number: version.version_number,
        status: version.status,
        forecast_ready: version.forecast_ready === true,
        budget_available: version.budget_available,
        budget_complete: version.budget_complete,
        currency_code: version.currency_code,
        source_generated_at: version.source_generated_at,
        approved_at: version.approved_at,
        created_at: version.created_at,
      },
      exceptional_approval: approvalEvidence(version),
      review: review ? {
        case_id: review.id,
        occurrence_key: review.occurrence_key,
        status: review.status,
        assigned_to: review.assigned_to,
        assigned_to_name: review.assigned_to_name,
        due_date: review.due_date,
        acknowledged_by: review.acknowledged_by,
        acknowledged_by_name: review.acknowledged_by_name,
        acknowledged_at: review.acknowledged_at,
        resolved_by: review.resolved_by,
        resolved_by_name: review.resolved_by_name,
        resolved_at: review.resolved_at,
        resolution_note: review.resolution_note,
        escalation_level: review.escalation_level,
        escalation_reason: review.escalation_reason,
        escalation_changed_at: review.escalation_changed_at,
        escalation_revision: review.escalation_revision,
        revision: review.revision,
        created_at: review.created_at,
        updated_at: review.updated_at,
      } : null,
      evidence: {
        version_audit: (versionEventsByVersion.get(String(version.id)) || []).map(eventView),
        review_audit: reviewEventsForCase.map(eventView),
        escalation_deliveries: deliveryHistory,
        protected_closure_event: closureEvent ? eventView(closureEvent) : null,
      },
      governance_complete: controlStatus.governance_complete,
      missing_controls: controlStatus.missing_controls,
      missing_control_labels: controlStatus.missing_control_labels,
    };
  });

  const summary = {
    exceptional_approval_count: records.length,
    review_case_count: records.filter(row => Boolean(row.review)).length,
    review_open: records.filter(row => row.review?.status === "OPEN").length,
    review_acknowledged: records.filter(row => row.review?.status === "ACKNOWLEDGED").length,
    review_resolved: records.filter(row => row.review?.status === "RESOLVED").length,
    governance_complete: records.filter(row => row.governance_complete).length,
    governance_incomplete: records.filter(row => !row.governance_complete).length,
    closure_audit_missing: records.filter(row => row.missing_controls.includes("CLOSURE_AUDIT_MISSING")).length,
    escalation_delivery_count: deliveries.length,
  };

  const generatedAt = new Date().toISOString();
  return {
    success: true,
    organization_id: organizationId,
    filters: {
      entity_id: entityId || null,
      version_id: versionId || null,
    },
    summary,
    control_semantics: {
      governance_complete_requires: [
        "resolved review case",
        "assigned owner",
        "acknowledgement actor and timestamp",
        "resolution actor and timestamp",
        "non-empty resolution evidence",
        "protected FORECAST_OVERRIDE_REVIEW_CLOSED audit event",
      ],
      closure_evidence_protection: "FORECAST_OVERRIDE_REVIEW_CLOSED records are database-protected against normal UPDATE and DELETE operations.",
      audit_scope: "This pack includes forecast-version governance actions, override-review lifecycle actions, escalation-delivery evidence, and the protected closure record for the selected organization scope.",
    },
    records,
    generated_at: generatedAt,
  };
}
