import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function runComplianceValidation({
  organizationId,
  entityId = null,
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  let query = supabaseAdmin
    .from("journal_entries")
    .select("id, reference, entity_id, status")
    .eq("organization_id", organizationId);

  if (entityId) {
    query = query.eq("entity_id", entityId);
  }

  const { data: journals, error } = await query;

  if (error) {
    throw error;
  }

  const findings = [];

  for (const journal of journals || []) {
    if (!journal.reference) {
      findings.push({
        severity: "medium",
        issue: "Journal missing reference",
        journalId: journal.id,
        entityId: journal.entity_id || null,
      });
    }
  }

  return {
    organization_id: organizationId,
    entity_id: entityId,
    compliance_type: "financial_controls",
    status:
      findings.length > 0
        ? "warning"
        : "passed",
    findings,
    checked_journals:
      (journals || []).length,
  };
}
