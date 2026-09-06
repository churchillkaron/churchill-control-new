import { requirePlatformOperatorWorkspaceAccess } from "@/lib/platform/security/requirePlatformOperatorWorkspaceAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const PLATFORM_ORGANIZATION_ID = "9a148429-b6a0-4bc6-ac83-a35c64fb7045";
const PAGE_SIZE = 1000;
const MAX_PAGES = 20;

function text(value) {
  return String(value ?? "").trim();
}

function activeStatus(value) {
  return text(value).toLowerCase() === "active";
}

function executionStateFilter(state) {
  return `execution_status.eq.${state},and(execution_status.is.null,status.eq.${state})`;
}

async function readPaged(makeQuery) {
  const rows = [];

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await makeQuery().range(from, to);
    if (error) throw error;

    const pageRows = Array.isArray(data) ? data : [];
    rows.push(...pageRows);
    if (pageRows.length < PAGE_SIZE) return { rows, complete: true };
  }

  return { rows, complete: false };
}

async function hasSuccessfulUse(organizationId, since = null) {
  let query = supabaseAdmin
    .from("platform_service_usage")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .or(executionStateFilter("success"));

  if (since) query = query.gte("created_at", since.toISOString());

  const { count, error } = await query;
  if (error) throw error;
  return Number(count || 0) > 0;
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = text(
      url.searchParams.get("organization_id") || url.searchParams.get("organizationId"),
    );

    const access = await requirePlatformOperatorWorkspaceAccess({ organizationId });
    if (!access.success) {
      return Response.json(
        { success: false, error: access.error },
        { status: access.status },
      );
    }

    if (access.organizationId !== PLATFORM_ORGANIZATION_ID) {
      return Response.json(
        { success: false, error: "Avantiqo Platform owner workspace required" },
        { status: 404 },
      );
    }

    const observedAt = new Date();
    const sevenDaysAgo = new Date(observedAt.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [leadResult, subscriptionResult, quotationResult, organizationResult, userResult] = await Promise.all([
      readPaged(() => supabaseAdmin
        .from("organization_leads")
        .select("id,organization_id,status,created_at,final_monthly_total,final_yearly_total,currency,registration_source")
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })),
      readPaged(() => supabaseAdmin
        .from("subscriptions")
        .select("id,organization_id,lead_id,status,created_at,final_monthly_total,final_yearly_total,currency")
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })),
      readPaged(() => supabaseAdmin
        .from("commercial_quotations")
        .select("id,organization_id,status,currency_code,total_amount,created_at,accepted_at,rejected_at,converted_at,sales_order_id")
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })),
      supabaseAdmin
        .from("organizations")
        .select("id,name,organization_type,status,organization_status,created_at")
        .neq("id", PLATFORM_ORGANIZATION_ID)
        .order("created_at", { ascending: true }),
      supabaseAdmin
        .from("organization_users")
        .select("organization_id,status")
        .order("organization_id", { ascending: true }),
    ]);

    if (organizationResult.error) throw organizationResult.error;
    if (userResult.error) throw userResult.error;

    const leads = leadResult.rows;
    const subscriptions = subscriptionResult.rows;
    const quotations = quotationResult.rows;
    const organizations = Array.isArray(organizationResult.data) ? organizationResult.data : [];
    const users = Array.isArray(userResult.data) ? userResult.data : [];

    const organizationIds = new Set(organizations.map((row) => row.id));
    const leadIds = new Set(leads.map((row) => row.id));
    const activeHumanOrganizationIds = new Set(
      users
        .filter((row) => activeStatus(row.status))
        .map((row) => row.organization_id)
        .filter((id) => organizationIds.has(id)),
    );

    const linkedSubscriptions = subscriptions.filter((row) => row.lead_id && leadIds.has(row.lead_id));
    const subscriptionsResolvingToCurrentOrganization = linkedSubscriptions.filter((row) => organizationIds.has(row.organization_id));
    const leadsResolvingDirectlyToCurrentOrganization = leads.filter((row) => organizationIds.has(text(row.organization_id)));

    const technicallyLinkedCurrentOrganizationIds = new Set([
      ...leadsResolvingDirectlyToCurrentOrganization.map((row) => text(row.organization_id)),
      ...subscriptionsResolvingToCurrentOrganization.map((row) => row.organization_id),
    ]);

    const humanLinkedAccounts = organizations.filter((row) => activeHumanOrganizationIds.has(row.id));
    const humanUsageEvidence = await Promise.all(
      humanLinkedAccounts.map(async (organization) => {
        const [ever, recent7d] = await Promise.all([
          hasSuccessfulUse(organization.id),
          hasSuccessfulUse(organization.id, sevenDaysAgo),
        ]);
        return {
          organizationId: organization.id,
          technicallyLinkedToCommercialRecord: technicallyLinkedCurrentOrganizationIds.has(organization.id),
          successfulUseEver: ever,
          successfulUse7d: recent7d,
        };
      }),
    );

    const humanAccountsWithSuccessfulUse = humanUsageEvidence.filter((row) => row.successfulUseEver);
    const humanAccountsWithSuccessfulUse7d = humanUsageEvidence.filter((row) => row.successfulUse7d);
    const attributableFirstValue = humanUsageEvidence.filter(
      (row) => row.technicallyLinkedToCommercialRecord && row.successfulUseEver,
    );

    const leadStatuses = [...new Set(leads.map((row) => text(row.status).toUpperCase() || "UNKNOWN"))].sort();
    const subscriptionStatuses = [...new Set(subscriptions.map((row) => text(row.status).toUpperCase() || "UNKNOWN"))].sort();

    const platformOwnedQuotations = quotations.filter((row) => row.organization_id === PLATFORM_ORGANIZATION_ID);
    const customerDomainQuotations = quotations.filter((row) => row.organization_id !== PLATFORM_ORGANIZATION_ID);

    const gates = [
      {
        key: "seller_scope",
        label: "Avantiqo seller ownership",
        state: "blocked",
        detail: "Current lead and subscription records do not persist an authoritative Avantiqo seller/owner organization field, so Platform pipeline ownership cannot be proven.",
      },
      {
        key: "stage_semantics",
        label: "Governed funnel stages",
        state: "blocked",
        detail: leadStatuses.length
          ? `Persisted lead statuses are treated as opaque evidence (${leadStatuses.join(", ")}); no canonical qualified/won/lost stage contract is proven.`
          : "No lead-stage evidence is persisted.",
      },
      {
        key: "lead_commitment_link",
        label: "Lead → commercial commitment",
        state: linkedSubscriptions.length ? "review" : "blocked",
        detail: linkedSubscriptions.length
          ? `${linkedSubscriptions.length} technical lead-to-subscription link${linkedSubscriptions.length === 1 ? "" : "s"} exist, but seller ownership remains unproven.`
          : "No technical lead-to-subscription linkage exists.",
      },
      {
        key: "commitment_customer_link",
        label: "Commitment → current customer",
        state: subscriptionsResolvingToCurrentOrganization.length ? "review" : "blocked",
        detail: subscriptionsResolvingToCurrentOrganization.length
          ? `${subscriptionsResolvingToCurrentOrganization.length} linked subscription${subscriptionsResolvingToCurrentOrganization.length === 1 ? "" : "s"} resolve to a current organization, but this is not yet canonical acquisition attribution.`
          : linkedSubscriptions.length
            ? "The persisted lead-to-subscription lineage does not resolve to a current organization record."
            : "No subscription-to-current-customer lineage is available.",
      },
      {
        key: "first_value_attribution",
        label: "Customer → first value",
        state: attributableFirstValue.length ? "review" : "blocked",
        detail: attributableFirstValue.length
          ? `${attributableFirstValue.length} human-linked account${attributableFirstValue.length === 1 ? "" : "s"} have both technical commercial lineage and successful service evidence, but seller ownership still prevents a conversion claim.`
          : `${humanAccountsWithSuccessfulUse.length} human-linked account${humanAccountsWithSuccessfulUse.length === 1 ? "" : "s"} have successful service evidence, but none can be authoritatively attributed back to Avantiqo acquisition records.`,
      },
    ];

    return Response.json({
      success: true,
      operatorOrganizationId: access.organizationId,
      observedAt: observedAt.toISOString(),
      source: "AVANTIQO_PLATFORM_COMMERCIAL_PIPELINE_EVIDENCE",
      state: "PIPELINE_INSTRUMENTATION_INCOMPLETE",
      evidence: {
        leadRowsComplete: leadResult.complete,
        subscriptionRowsComplete: subscriptionResult.complete,
        quotationRowsComplete: quotationResult.complete,
        sellerOwnershipFieldProven: false,
        governedStageContractProven: false,
        conversionRateClaimed: false,
        winRateClaimed: false,
        pipelineValueClaimed: false,
        recurringRevenueClaimed: false,
        firstValueAttributionClaimed: false,
        customerDomainQuotationsExcludedFromPlatformPipeline: true,
      },
      summary: {
        persistedLeads: leads.length,
        persistedSubscriptions: subscriptions.length,
        technicalLeadSubscriptionLinks: linkedSubscriptions.length,
        linkedSubscriptionsResolvingToCurrentOrganization: subscriptionsResolvingToCurrentOrganization.length,
        directLeadOrganizationResolutions: leadsResolvingDirectlyToCurrentOrganization.length,
        platformOwnedQuotations: platformOwnedQuotations.length,
        customerDomainQuotationsExcluded: customerDomainQuotations.length,
        humanLinkedAccounts: humanLinkedAccounts.length,
        humanAccountsWithSuccessfulUse: humanAccountsWithSuccessfulUse.length,
        humanAccountsWithSuccessfulUse7d: humanAccountsWithSuccessfulUse7d.length,
        humanAccountsTechnicallyLinkedToCommercialRecord: humanUsageEvidence.filter((row) => row.technicallyLinkedToCommercialRecord).length,
        attributableFirstValueAccounts: attributableFirstValue.length,
      },
      persistedStatusEvidence: {
        leadStatuses,
        subscriptionStatuses,
      },
      gates,
      ownerAction: {
        title: "Establish canonical acquisition lineage before optimizing conversion",
        detail: "Persist an authoritative Avantiqo seller/owner scope and governed commercial stage transitions that connect prospect/lead → commitment → created customer organization → active human access → first successful customer outcome. Backfill only when source evidence proves the lineage.",
      },
    });
  } catch (error) {
    console.error("PLATFORM_COMMERCIAL_PIPELINE_GET_ERROR", error);
    return Response.json(
      {
        success: false,
        error: error?.message || "Unable to read commercial pipeline evidence",
      },
      { status: 500 },
    );
  }
}
