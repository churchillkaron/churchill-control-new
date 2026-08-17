import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const VERSION_ACTIONS = [
  "FORECAST_SCENARIO_VERSION_DRAFT_CREATED",
  "FORECAST_SCENARIO_VERSION_APPROVED",
  "FORECAST_SCENARIO_VERSION_SUPERSEDED",
  "FORECAST_SCENARIO_VERSION_APPROVAL_OVERRIDE",
];

const REVIEW_ACTIONS = [
  "FORECAST_EXCEPTION_ASSIGNED",
  "FORECAST_EXCEPTION_ACKNOWLEDGED",
  "FORECAST_EXCEPTION_DUE_DATE_CHANGED",
  "FORECAST_EXCEPTION_ESCALATION_CHANGED",
  "FORECAST_EXCEPTION_RESOLVED",
  "FORECAST_OVERRIDE_REVIEW_CLOSED",
];

function chunks(values, size = 200) {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

async function listEventsForIds({ organizationId, entityType, ids, actions }) {
  if (!ids.length) return [];

  const pages = await Promise.all(
    chunks(ids).map(async pageIds => {
      const { data, error } = await supabaseAdmin
        .from("audit_logs")
        .select("id, entity_type, entity_id, action_type, performed_by, performed_by_name, old_data, new_data, metadata, created_at")
        .eq("organization_id", organizationId)
        .eq("entity_type", entityType)
        .in("entity_id", pageIds)
        .in("action_type", actions)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data || [];
    })
  );

  return pages.flat();
}

export async function listForecastGovernanceAuditEvents({
  organizationId,
  versionIds = [],
  reviewCaseIds = [],
} = {}) {
  if (!organizationId) throw new Error("organizationId required");

  const [versionEvents, reviewEvents] = await Promise.all([
    listEventsForIds({
      organizationId,
      entityType: "forecast_scenario_version",
      ids: [...new Set(versionIds.filter(Boolean))],
      actions: VERSION_ACTIONS,
    }),
    listEventsForIds({
      organizationId,
      entityType: "forecast_exception_case",
      ids: [...new Set(reviewCaseIds.filter(Boolean))],
      actions: REVIEW_ACTIONS,
    }),
  ]);

  return {
    version_events: versionEvents,
    review_events: reviewEvents,
  };
}
