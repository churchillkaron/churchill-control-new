import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function requireOrganizationId(value) {
  const organizationId = String(value || "").trim();
  if (!organizationId) {
    const error = new Error("Proof of service requires organization_id.");
    error.status = 400;
    throw error;
  }
  return organizationId;
}

function requireOccurrenceId(value) {
  const occurrenceId = String(value || "").trim();
  if (!occurrenceId) {
    const error = new Error("Proof of service requires occurrence_id.");
    error.status = 400;
    throw error;
  }
  return occurrenceId;
}

export async function getCompletedServiceOccurrence({ organizationId, occurrenceId }) {
  const organization_id = requireOrganizationId(organizationId);
  const occurrence_id = requireOccurrenceId(occurrenceId);

  const result = await supabaseAdmin
    .from("service_plan_occurrences")
    .select("*")
    .eq("organization_id", organization_id)
    .eq("id", occurrence_id)
    .eq("status", "completed")
    .maybeSingle();

  if (result.error) {
    const error = new Error(result.error.message || "Unable to load completed service occurrence.");
    error.code = result.error.code;
    error.details = result.error.details;
    throw error;
  }

  return result.data || null;
}

export default Object.freeze({
  getCompletedServiceOccurrence,
});
