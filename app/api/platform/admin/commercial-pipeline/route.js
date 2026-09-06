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

function stageCount(records, stage) {
  return records.filter((record) => record.stage === stage).length;
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

    const [
      acquisitionResult,
      eventResult,
      leadResult,
      subscriptionResult,
      quotationResult,
      organizationResult,
      userResult,
    ] = await Promise.all([
      readPaged(() => supabaseAdmin
        .from("platform_acquisition_records")
        .select("id,seller_organization_id,lead_id,subscription_id,customer_organization_id,stage,source,source_reference,first_value_at,stage_updated_at,created_at,updated_at")
        .eq("seller_organization_id", PLATFORM_ORGANIZATION_ID)
        .order("stage_updated_at", { ascending: false })
        .order("id", { ascending: true })),
      readPaged(() => supabaseAdmin
        .from("platform_acquisition_events")
        .select("id,acquisition_id,seller_organization_id,from_stage,to_stage,evidence_type,evidence_reference,note,occurred_at,created_at")
        .eq("seller_organization_id", PLATFORM_ORGANIZATION_ID)
        .order("occurred_at", { ascending: false })
        .order("id", { ascending: true })),
      readPaged(() => supabaseAdmin
        .from("organization_leads")
        .select("id,organization_id,status,created_at,final_monthly_total,final_yearly_total,currency")
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

    const acquisitions = acquisitionResult.rows;
    const acquisitionEvents = eventResult.rows;
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

    const canonicalCustomerIds = new Set(
      acquisitions.map((record) => record.customer_organization_id).filter(Boolean),
    );
    const humanLinkedAccounts = organizations.filter((row) => activeHumanOrganizationIds.has(row.id));
    const humanUsageEvidence = await Promise.all(
      humanLinkedAccounts.map(async (organization) => {
        const [ever, recent7d] = await Promise.all([
          hasSuccessfulUse(organization.id),
          hasSuccessfulUse(organization.id, sevenDaysAgo),
        ]);
        return {
          organizationId: organization.id,
          canonicallyAttributed: canonicalCustomerIds.has(organization.id),
          successfulUseEver: ever,
          successfulUse7d: recent7d,
        };
      }),
    );

    const humanAccountsWithSuccessfulUse = humanUsageEvidence.filter((row) => row.successfulUseEver);
    const humanAccountsWithSuccessfulUse7d = humanUsageEvidence.filter((row) => row.successfulUse7d);
    const canonicalFirstValueAccounts = acquisitions.filter(
      (record) => record.stage === "FIRST_VALUE" && record.customer_organization_id && record.first_value_at,
    );

    const leadStatuses = [...new Set(leads.map((row) => text(row.status).toUpperCase() || "UNKNOWN"))].sort();
    const subscriptionStatuses = [...new Set(subscriptions.map((row) => text(row.status).toUpperCase() || "UNKNOWN"))].sort();
    const platformOwnedQuotations = quotations.filter((row) => row.organization_id === PLATFORM_ORGANIZATION_ID);
    const customerDomainQuotations = quotations.filter((row) => row.organization_id !== PLATFORM_ORGANIZATION_ID);

    const canonicalReady = acquisitionResult.complete && eventResult.complete;
    const gates = [
      {
        key: "seller_scope",
        label: "Avantiqo seller ownership",
        state: canonicalReady ? "pass" : "blocked",
        detail: canonicalReady
          ? "Canonical acquisition records are hard-scoped to the Avantiqo Platform seller organization."
          : "Canonical seller-scoped acquisition evidence could not be read completely.",
      },
      {
        key: "stage_semantics",
        label: "Governed funnel stages",
        state: canonicalReady ? "pass" : "blocked",
        detail: "Canonical stages are PROSPECT → QUALIFIED → COMMITMENT_PENDING → COMMITTED → CUSTOMER_CREATED → HUMAN_ACTIVE → FIRST_VALUE, with LOST as an explicit terminal outcome.",
      },
      {
        key: "lead_commitment_link",
        label: "Lead → commercial commitment",
        state: acquisitions.some((record) => record.lead_id && record.subscription_id) ? "pass" : "review",
        detail: acquisitions.some((record) => record.lead_id && record.subscription_id)
          ? "At least one canonical record has persisted lead-to-subscription lineage."
          : "The contract exists, but no canonical lead-to-subscription lineage has been recorded yet. Legacy links remain unattributed evidence only.",
      },
      {
        key: "commitment_customer_link",
        label: "Commitment → current customer",
        state: acquisitions.some((record) => record.subscription_id && record.customer_organization_id) ? "pass" : "review",
        detail: acquisitions.some((record) => record.subscription_id && record.customer_organization_id)
          ? "At least one canonical commitment resolves to a current customer organization."
          : "The contract exists, but no canonical commitment-to-customer lineage has been recorded yet.",
      },
      {
        key: "first_value_attribution",
        label: "Customer → first value",
        state: canonicalFirstValueAccounts.length ? "pass" : "review",
        detail: canonicalFirstValueAccounts.length
          ? `${canonicalFirstValueAccounts.length} canonical acquisition record${canonicalFirstValueAccounts.length === 1 ? "" : "s"} reached FIRST_VALUE with persisted evidence.`
          : `${humanAccountsWithSuccessfulUse.length} human-linked account${humanAccountsWithSuccessfulUse.length === 1 ? "" : "s"} have successful product use, but none are retroactively attributed without canonical acquisition lineage.`,
      },
    ];

    const stageCounts = {
      prospect: stageCount(acquisitions, "PROSPECT"),
      qualified: stageCount(acquisitions, "QUALIFIED"),
      commitmentPending: stageCount(acquisitions, "COMMITMENT_PENDING"),
      committed: stageCount(acquisitions, "COMMITTED"),
      customerCreated: stageCount(acquisitions, "CUSTOMER_CREATED"),
      humanActive: stageCount(acquisitions, "HUMAN_ACTIVE"),
      firstValue: stageCount(acquisitions, "FIRST_VALUE"),
      lost: stageCount(acquisitions, "LOST"),
    };

    return Response.json({
      success: true,
      operatorOrganizationId: access.organizationId,
      observedAt: observedAt.toISOString(),
      source: "AVANTIQO_PLATFORM_CANONICAL_ACQUISITION_EVIDENCE",
      state: acquisitions.length ? "CANONICAL_PIPELINE_ACTIVE" : "CANONICAL_PIPELINE_READY_NO_ATTRIBUTED_RECORDS",
      evidence: {
        acquisitionRowsComplete: acquisitionResult.complete,
        acquisitionEventRowsComplete: eventResult.complete,
        leadRowsComplete: leadResult.complete,
        subscriptionRowsComplete: subscriptionResult.complete,
        quotationRowsComplete: quotationResult.complete,
        sellerOwnershipFieldProven: canonicalReady,
        governedStageContractProven: canonicalReady,
        conversionRateClaimed: acquisitions.length > 0,
        winRateClaimed: false,
        pipelineValueClaimed: false,
        recurringRevenueClaimed: false,
        firstValueAttributionClaimed: canonicalFirstValueAccounts.length > 0,
        customerDomainQuotationsExcludedFromPlatformPipeline: true,
        legacyBackfillPerformed: false,
      },
      summary: {
        canonicalAcquisitions: acquisitions.length,
        canonicalEvents: acquisitionEvents.length,
        canonicalFirstValueAccounts: canonicalFirstValueAccounts.length,
        persistedLeads: leads.length,
        persistedSubscriptions: subscriptions.length,
        technicalLegacyLeadSubscriptionLinks: linkedSubscriptions.length,
        legacyLinksResolvingToCurrentOrganization: subscriptionsResolvingToCurrentOrganization.length,
        directLegacyLeadOrganizationResolutions: leadsResolvingDirectlyToCurrentOrganization.length,
        platformOwnedQuotations: platformOwnedQuotations.length,
        customerDomainQuotationsExcluded: customerDomainQuotations.length,
        humanLinkedAccounts: humanLinkedAccounts.length,
        humanAccountsWithSuccessfulUse: humanAccountsWithSuccessfulUse.length,
        humanAccountsWithSuccessfulUse7d: humanAccountsWithSuccessfulUse7d.length,
        humanAccountsCanonicallyAttributed: humanUsageEvidence.filter((row) => row.canonicallyAttributed).length,
        attributableFirstValueAccounts: canonicalFirstValueAccounts.length,
      },
      stageCounts,
      persistedStatusEvidence: {
        leadStatuses,
        subscriptionStatuses,
      },
      gates,
      recentAcquisitions: acquisitions.slice(0, 10),
      recentAcquisitionEvents: acquisitionEvents.slice(0, 20),
      ownerAction: {
        title: acquisitions.length
          ? "Advance acquisition records only when the next evidence gate is proven"
          : "Start new Avantiqo prospects in the canonical acquisition lifecycle",
        detail: acquisitions.length
          ? "Use the governed acquisition transition endpoint for every stage change. Human activation and first value are independently re-verified from current platform evidence before those stages can be persisted."
          : "Do not backfill legacy leads or existing customers by assumption. New prospects should enter the canonical lifecycle at PROSPECT; historical records should be linked only when source evidence proves Avantiqo seller ownership and customer lineage.",
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
