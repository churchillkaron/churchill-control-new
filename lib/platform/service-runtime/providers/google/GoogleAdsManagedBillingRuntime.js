// Managed Google Ads supplier-billing bridge. Avantiqo Wallet/Billing remains the customer ledger.
import { ServiceExecutionRuntime } from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { OrganizationServiceRuntime } from "@/lib/platform/service-runtime/services/runtime/OrganizationServiceRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const PROVIDER = "google_ads";
const SERVICE_ID = "google-ads";
const CAPABILITY = "marketing.google.ads.manage";
const ASSET_TYPE = "google_ads_customer";
const CONFIGURED_BILLING_STATUSES = new Set([
  "PENDING",
  "APPROVED_HELD",
  "APPROVED",
]);

function text(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

function digits(value) {
  return text(value).replace(/\D/g, "");
}

async function platformManager() {
  const { data: assets, error } = await supabaseAdmin
    .from("organization_channel_assets")
    .select("id,organization_id,connection_id,external_id,name,metadata")
    .eq("channel_provider", PROVIDER)
    .eq("asset_type", ASSET_TYPE)
    .contains("metadata", { platform_manager: true, manager: true })
    .order("created_at", { ascending: true });

  if (error) throw error;

  const manager = (assets || [])
    .sort(
      (a, b) =>
        Number(b?.metadata?.manager_priority || 0) -
        Number(a?.metadata?.manager_priority || 0)
    )[0] || null;

  if (!manager) return null;

  const { data: connection, error: connectionError } = await supabaseAdmin
    .from("organization_channel_connections")
    .select("id,organization_id,status,credentials_reference,metadata")
    .eq("id", manager.connection_id)
    .eq("organization_id", manager.organization_id)
    .eq("provider", PROVIDER)
    .maybeSingle();

  if (connectionError) throw connectionError;
  if (!connection || upper(connection.status) !== "ACTIVE") return null;
  if (!connection.credentials_reference) return null;

  return {
    ...manager,
    connection,
    customer_id: digits(manager.external_id),
  };
}

async function managedAdvertiser(organizationId, assetId = null) {
  let query = supabaseAdmin
    .from("organization_channel_assets")
    .select("id,organization_id,connection_id,external_id,name,entity_id,metadata")
    .eq("organization_id", organizationId)
    .eq("channel_provider", PROVIDER)
    .eq("asset_type", ASSET_TYPE)
    .contains("metadata", { managed_by_avantiqo: true, manager: false });

  if (assetId) query = query.eq("id", assetId);

  const { data, error } = await query
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function organizationService(organizationId) {
  return OrganizationServiceRuntime.get({
    organization_id: organizationId,
    service_id: SERVICE_ID,
  });
}

async function selectedPlatformPaymentsAccount(manager) {
  const service = await organizationService(manager.organization_id);
  if (!service || upper(service.status) !== "ACTIVE") {
    throw new Error("AVANTIQO_GOOGLE_ADS_SERVICE_NOT_ACTIVE");
  }

  const configuration = service.configuration || {};
  const paymentsAccountId = text(configuration.google_ads_payments_account_id);
  if (!paymentsAccountId) {
    throw new Error("AVANTIQO_GOOGLE_ADS_PAYMENTS_ACCOUNT_NOT_SELECTED");
  }

  return {
    payments_account_id: paymentsAccountId,
    payments_profile_id:
      text(configuration.google_ads_payments_profile_id) || null,
    payments_account_name:
      text(configuration.google_ads_payments_account_name) || null,
  };
}

export async function getPlatformManagedGoogleAdsBillingStatus() {
  const manager = await platformManager();
  if (!manager?.customer_id) {
    return {
      ready: false,
      manager: null,
      payments_account: null,
      blocker: "AVANTIQO_GOOGLE_ADS_MANAGER_NOT_READY",
    };
  }

  try {
    return {
      ready: true,
      manager: {
        id: manager.id,
        organization_id: manager.organization_id,
        customer_id: manager.customer_id,
        name: manager.name || "Avantiqo Manager",
      },
      payments_account: await selectedPlatformPaymentsAccount(manager),
      blocker: null,
    };
  } catch (error) {
    return {
      ready: false,
      manager: {
        id: manager.id,
        organization_id: manager.organization_id,
        customer_id: manager.customer_id,
        name: manager.name || "Avantiqo Manager",
      },
      payments_account: null,
      blocker: error?.message || "AVANTIQO_GOOGLE_ADS_BILLING_NOT_READY",
    };
  }
}

async function advertiserCurrency(advertiser) {
  if (advertiser?.metadata?.currency_code) {
    return upper(advertiser.metadata.currency_code);
  }

  if (advertiser?.entity_id) {
    const { data, error } = await supabaseAdmin
      .from("legal_entities")
      .select("currency")
      .eq("id", advertiser.entity_id)
      .eq("organization_id", advertiser.organization_id)
      .maybeSingle();
    if (error) throw error;
    if (data?.currency) return upper(data.currency);
  }

  throw new Error("GOOGLE_ADS_ADVERTISER_CURRENCY_REQUIRED");
}

async function executeForAdvertiser({ organizationId, advertiser, input }) {
  const currency = await advertiserCurrency(advertiser);

  return ServiceExecutionRuntime.execute({
    organization_id: organizationId,
    entity_id: advertiser.entity_id || null,
    service_id: SERVICE_ID,
    provider_id: PROVIDER,
    capability: CAPABILITY,
    input: {
      ...input,
      currency,
      quantity: 1,
    },
    category: "ADMINISTRATION_GOOGLE_ADS_BILLING",
    metadata: {
      module: "ADMINISTRATION_INTEGRATIONS",
      provider: PROVIDER,
      zero_price_admin_operation: true,
      media_spend_separate: true,
    },
  });
}

function billingRows(execution) {
  const output = execution?.output?.output || {};
  return Array.isArray(output.results) ? output.results : [];
}

async function currentBillingSetup({ organizationId, advertiser, manager }) {
  const customerId = digits(advertiser.external_id);
  const execution = await executeForAdvertiser({
    organizationId,
    advertiser,
    input: {
      action: "search",
      customer_id: customerId,
      login_customer_id: manager.customer_id,
      query:
        "SELECT billing_setup.resource_name, billing_setup.status, billing_setup.payments_account, billing_setup.payments_account_info.payments_account_id, billing_setup.payments_account_info.payments_account_name, billing_setup.payments_account_info.payments_profile_id, billing_setup.start_date_time, billing_setup.end_date_time FROM billing_setup WHERE billing_setup.status IN ('PENDING','APPROVED_HELD','APPROVED') ORDER BY billing_setup.start_date_time DESC LIMIT 1",
    },
  });

  return billingRows(execution)[0]?.billingSetup ||
    billingRows(execution)[0]?.billing_setup ||
    null;
}

function billingSetupResourceName(output = {}) {
  return text(
    output?.result?.resourceName ||
      output?.result?.resource_name ||
      output?.resourceName ||
      output?.resource_name
  );
}

function attachedPaymentsAccountId(billing) {
  return text(
    billing?.paymentsAccountInfo?.paymentsAccountId ||
      billing?.payments_account_info?.payments_account_id
  );
}

function billingBlocker({ billing, account }) {
  if (!billing) return "GOOGLE_ADS_BILLING_SETUP_REQUIRED";
  if (attachedPaymentsAccountId(billing) !== account.payments_account_id) {
    return "GOOGLE_ADS_DIFFERENT_PAYMENTS_ACCOUNT_ATTACHED";
  }

  const status = upper(billing.status);
  if (status === "APPROVED") return null;
  if (status === "APPROVED_HELD") {
    return "GOOGLE_ADS_BILLING_SETUP_APPROVED_HELD";
  }
  if (status === "PENDING") {
    return "GOOGLE_ADS_BILLING_SETUP_PENDING_APPROVAL";
  }
  return "GOOGLE_ADS_BILLING_SETUP_NOT_APPROVED";
}

async function persistBillingMetadata({ advertiser, billing, account }) {
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("organization_channel_assets")
    .update({
      metadata: {
        ...(advertiser.metadata || {}),
        google_billing_setup_resource_name:
          text(billing.resourceName || billing.resource_name) || null,
        google_billing_setup_status:
          upper(billing.status) || "PENDING",
        google_payments_account_id: account.payments_account_id,
        google_payments_profile_id: account.payments_profile_id || null,
        google_payments_account_name: account.payments_account_name || null,
        google_billing_managed_by_avantiqo: true,
        google_billing_checked_at: now,
      },
      updated_at: now,
    })
    .eq("id", advertiser.id)
    .eq("organization_id", advertiser.organization_id);

  if (error) throw error;
}

export async function getManagedGoogleAdsBillingStatus({
  organizationId,
  assetId = null,
}) {
  if (!organizationId) throw new Error("organizationId required");

  const advertiser = await managedAdvertiser(organizationId, assetId);
  if (!advertiser) {
    return {
      ready: false,
      configured: false,
      advertiser: null,
      billing: null,
      payments_account: null,
      blocker: "MANAGED_GOOGLE_ADS_ADVERTISER_NOT_FOUND",
    };
  }

  const manager = await platformManager();
  if (!manager?.customer_id) {
    return {
      ready: false,
      configured: false,
      advertiser,
      billing: null,
      payments_account: null,
      blocker: "AVANTIQO_GOOGLE_ADS_MANAGER_NOT_READY",
    };
  }

  let account;
  try {
    account = await selectedPlatformPaymentsAccount(manager);
  } catch (error) {
    return {
      ready: false,
      configured: false,
      advertiser,
      billing: null,
      payments_account: null,
      blocker: error?.message || "AVANTIQO_GOOGLE_ADS_BILLING_NOT_READY",
    };
  }

  const billing = await currentBillingSetup({ organizationId, advertiser, manager });
  const status = upper(billing?.status);
  const correctAccount =
    Boolean(billing) &&
    attachedPaymentsAccountId(billing) === account.payments_account_id;
  const configured = correctAccount && CONFIGURED_BILLING_STATUSES.has(status);
  const ready = correctAccount && status === "APPROVED";

  if (billing) {
    await persistBillingMetadata({ advertiser, billing, account });
  }

  return {
    ready,
    configured,
    advertiser,
    billing,
    payments_account: account,
    blocker: ready ? null : billingBlocker({ billing, account }),
  };
}

export async function attachManagedGoogleAdsBilling({
  organizationId,
  assetId = null,
}) {
  const status = await getManagedGoogleAdsBillingStatus({ organizationId, assetId });
  if (status.ready || status.configured) return status;
  if (!status.advertiser) {
    throw new Error(status.blocker || "MANAGED_GOOGLE_ADS_ADVERTISER_NOT_FOUND");
  }
  if (!status.payments_account) {
    throw new Error(status.blocker || "AVANTIQO_GOOGLE_ADS_BILLING_NOT_READY");
  }
  if (
    status.billing &&
    status.blocker === "GOOGLE_ADS_DIFFERENT_PAYMENTS_ACCOUNT_ATTACHED"
  ) {
    throw new Error(status.blocker);
  }

  const manager = await platformManager();
  if (!manager?.customer_id) {
    throw new Error("AVANTIQO_GOOGLE_ADS_MANAGER_NOT_READY");
  }

  const advertiser = status.advertiser;
  const customerId = digits(advertiser.external_id);
  if (!customerId) throw new Error("GOOGLE_ADS_CUSTOMER_ID_REQUIRED");

  const paymentsAccountResource =
    `customers/${customerId}/paymentsAccounts/${status.payments_account.payments_account_id}`;

  const execution = await executeForAdvertiser({
    organizationId,
    advertiser,
    input: {
      action: "mutate_billing_setup",
      customer_id: customerId,
      login_customer_id: manager.customer_id,
      operation: {
        create: {
          paymentsAccount: paymentsAccountResource,
          startTimeType: "NOW",
        },
      },
    },
  });

  const output = execution?.output?.output || {};
  const resourceName = billingSetupResourceName(output);
  const billing = {
    resourceName: resourceName || null,
    status: "PENDING",
    paymentsAccount: paymentsAccountResource,
    paymentsAccountInfo: {
      paymentsAccountId: status.payments_account.payments_account_id,
      paymentsAccountName: status.payments_account.payments_account_name,
      paymentsProfileId: status.payments_account.payments_profile_id,
    },
  };

  await persistBillingMetadata({
    advertiser,
    billing,
    account: status.payments_account,
  });

  return {
    ready: false,
    configured: true,
    advertiser,
    billing,
    payments_account: status.payments_account,
    blocker: "GOOGLE_ADS_BILLING_SETUP_PENDING_APPROVAL",
    created: true,
  };
}

export const GoogleAdsManagedBillingRuntime = {
  getPlatformStatus: getPlatformManagedGoogleAdsBillingStatus,
  getStatus: getManagedGoogleAdsBillingStatus,
  attach: attachManagedGoogleAdsBilling,
};
