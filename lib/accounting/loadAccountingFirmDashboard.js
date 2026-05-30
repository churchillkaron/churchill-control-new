import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function loadAccountingFirmDashboard({
  organizationId,
}) {

  const {
    data: clients,
    error,
  } = await supabaseAdmin

    .from(
      "organization_relationships"
    )

    .select("*")

    .eq(
      "source_organization_id",
      organizationId
    )

    .eq(
      "relationship_type",
      "accounting_provider"
    )

    .eq(
      "status",
      "ACTIVE"
    );

  if (error) {
    throw error;
  }

  const totalClients =
    (clients || []).length;

  return {

    totalClients,

    activeClients:
      totalClients,

    newMessages: 0,

    clientRequests: 0,

    pendingDocuments: 0,

    taxDeadlines: 0,

    payrollDue: 0,

    complianceAlerts: 0,

  };

}
