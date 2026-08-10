export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { requirePlatformAdminAccess } from "@/lib/platform/security/requirePlatformAdminAccess";
import { ProviderBillingRuntime } from "@/lib/platform/service-runtime/billing/runtime/ProviderBillingRuntime";
import { ProviderSupplierAccountRuntime } from "@/lib/platform/service-runtime/billing/runtime/ProviderSupplierAccountRuntime";
import { ServiceExecutionRuntime } from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { OrganizationServiceRuntime } from "@/lib/platform/service-runtime/services/runtime/OrganizationServiceRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const GOOGLE_ADS_PROVIDER = "google_ads";
const GOOGLE_ADS_SERVICE = "google-ads";
const GOOGLE_ADS_CAPABILITY = "marketing.google.ads.manage";
const GOOGLE_ADS_ASSET_TYPE = "google_ads_customer";

function text(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

async function avantiqoGoogleAdsManager() {
  const { data: assets, error } = await supabaseAdmin
    .from("organization_channel_assets")
    .select("id,organization_id,connection_id,external_id,name,metadata")
    .eq("channel_provider", GOOGLE_ADS_PROVIDER)
    .eq("asset_type", GOOGLE_ADS_ASSET_TYPE)
    .contains("metadata", { platform_manager: true, manager: true })
    .order("created_at", { ascending: true });

  if (error) throw error;

  const manager = (assets || [])
    .sort(
      (left, right) =>
        Number(right?.metadata?.manager_priority || 0) -
        Number(left?.metadata?.manager_priority || 0),
    )[0] || null;

  if (!manager) return null;

  const { data: connection, error: connectionError } = await supabaseAdmin
    .from("organization_channel_connections")
    .select("id,organization_id,status,credentials_reference,metadata")
    .eq("id", manager.connection_id)
    .eq("organization_id", manager.organization_id)
    .eq("provider", GOOGLE_ADS_PROVIDER)
    .maybeSingle();

  if (connectionError) throw connectionError;
  if (!connection || upper(connection.status) !== "ACTIVE") return null;
  if (!connection.credentials_reference) return null;

  return {
    ...manager,
    connection,
    customer_id: text(manager.external_id).replace(/\D/g, ""),
  };
}

async function googleAdsService(manager) {
  if (!manager?.organization_id) return null;
  return OrganizationServiceRuntime.get({
    organization_id: manager.organization_id,
    service_id: GOOGLE_ADS_SERVICE,
  });
}

async function executeManagerGoogleAds(manager, input) {
  const currency = upper(manager?.metadata?.currency_code);
  if (!currency) {
    throw new Error("AVANTIQO_GOOGLE_ADS_MANAGER_CURRENCY_REQUIRED");
  }

  return ServiceExecutionRuntime.execute({
    organization_id: manager.organization_id,
    service_id: GOOGLE_ADS_SERVICE,
    provider_id: GOOGLE_ADS_PROVIDER,
    capability: GOOGLE_ADS_CAPABILITY,
    input: {
      ...input,
      currency,
      quantity: 1,
    },
    category: "ADMINISTRATION_PROVIDER_BILLING",
    metadata: {
      module: "ADMINISTRATION_INTEGRATIONS_PROVIDER_BILLING",
      provider: GOOGLE_ADS_PROVIDER,
      zero_price_admin_operation: true,
      media_spend_separate: true,
    },
  });
}

function paymentAccountsFrom(execution) {
  const output = execution?.output?.output || {};
  const rows = Array.isArray(output.paymentsAccounts)
    ? output.paymentsAccounts
    : Array.isArray(output.payments_accounts)
      ? output.payments_accounts
      : [];

  return rows.map((row) => ({
    resource_name: text(row.resourceName || row.resource_name),
    payments_account_id: text(row.paymentsAccountId || row.payments_account_id),
    payments_account_name: text(row.paymentsAccountName || row.payments_account_name),
    payments_profile_id: text(row.paymentsProfileId || row.payments_profile_id),
    paying_manager_customer: text(
      row.payingManagerCustomer || row.paying_manager_customer,
    ),
  }));
}

async function discoverGooglePaymentsAccounts(manager) {
  const execution = await executeManagerGoogleAds(manager, {
    action: "list_payments_accounts",
    customer_id: manager.customer_id,
    login_customer_id: manager.customer_id,
  });

  return paymentAccountsFrom(execution);
}

function selectedGoogleBilling(service) {
  const configuration = service?.configuration || {};
  return {
    payments_account_resource_name:
      text(configuration.google_ads_payments_account_resource_name) || null,
    payments_account_id:
      text(configuration.google_ads_payments_account_id) || null,
    payments_profile_id:
      text(configuration.google_ads_payments_profile_id) || null,
    payments_account_name:
      text(configuration.google_ads_payments_account_name) || null,
  };
}

async function googleAdsBillingSnapshot() {
  const manager = await avantiqoGoogleAdsManager();
  if (!manager?.customer_id) {
    return {
      ready: false,
      manager: null,
      service: null,
      billing: null,
      payments_accounts: [],
      blocker: "AVANTIQO_GOOGLE_ADS_MANAGER_NOT_READY",
    };
  }

  const service = await googleAdsService(manager);
  if (!service || upper(service.status) !== "ACTIVE") {
    return {
      ready: false,
      manager: {
        organization_id: manager.organization_id,
        customer_id: manager.customer_id,
        name: manager.name || "Avantiqo Manager",
      },
      service: service || null,
      billing: null,
      payments_accounts: [],
      blocker: "AVANTIQO_GOOGLE_ADS_SERVICE_NOT_ACTIVE",
    };
  }

  const accounts = await discoverGooglePaymentsAccounts(manager);
  const billing = selectedGoogleBilling(service);
  const selected = accounts.find(
    (account) => account.resource_name === billing.payments_account_resource_name,
  ) || null;

  return {
    ready: Boolean(selected),
    manager: {
      organization_id: manager.organization_id,
      customer_id: manager.customer_id,
      name: manager.name || "Avantiqo Manager",
    },
    service: {
      id: service.id,
      status: service.status,
    },
    billing: selected ? { ...billing, ...selected } : billing,
    payments_accounts: accounts,
    blocker: selected
      ? null
      : accounts.length
        ? "AVANTIQO_GOOGLE_ADS_PAYMENTS_ACCOUNT_NOT_SELECTED"
        : "AVANTIQO_GOOGLE_ADS_MONTHLY_INVOICING_NOT_AVAILABLE",
  };
}

function mergeGoogleAdsReadiness(providerBilling, googleAds) {
  const providers = (providerBilling.providers || []).map((provider) => {
    if (provider.id !== GOOGLE_ADS_PROVIDER) return provider;

    const baseReady = provider.service_cost_control_ready === true;
    const ready = baseReady && googleAds.ready === true;
    return {
      ...provider,
      google_payments_account_ready: googleAds.ready === true,
      service_cost_control_ready: ready,
      billing_status: ready
        ? "READY"
        : baseReady
          ? "GOOGLE_PAYMENTS_ACCOUNT_REQUIRED"
          : provider.billing_status,
      billing_blocker: ready
        ? null
        : baseReady
          ? googleAds.blocker || "AVANTIQO_GOOGLE_ADS_PAYMENTS_ACCOUNT_REQUIRED"
          : provider.billing_blocker,
    };
  });

  return {
    ...providerBilling,
    providers,
    summary: {
      ...(providerBilling.summary || {}),
      service_cost_control_ready: providers.filter(
        (provider) => provider.service_cost_control_ready,
      ).length,
    },
  };
}

async function completeSnapshot() {
  const [providerBilling, googleAds] = await Promise.all([
    ProviderBillingRuntime.snapshot(),
    googleAdsBillingSnapshot().catch((error) => ({
      ready: false,
      manager: null,
      service: null,
      billing: null,
      payments_accounts: [],
      blocker: error?.message || "AVANTIQO_GOOGLE_ADS_BILLING_DISCOVERY_FAILED",
    })),
  ]);

  return {
    ...mergeGoogleAdsReadiness(providerBilling, googleAds),
    supplier_accounts: {
      google_ads: googleAds,
    },
  };
}

export async function GET() {
  try {
    const access = await requirePlatformAdminAccess();
    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status || 403 },
      );
    }

    return NextResponse.json({
      success: true,
      ...(await completeSnapshot()),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to load provider billing",
      },
      { status: 500 },
    );
  }
}

async function saveProviderSupplierAccount({ body, access }) {
  const provider = text(body.provider).toLowerCase();
  if (!provider) throw new Error("provider is required");

  const adapter = ProviderBillingRuntime.assertProvider(provider);
  const billingMode =
    provider === "google_ads" || provider === "meta"
      ? "MANAGED_MEDIA_INVOICE_OR_CHARGE"
      : "SUPPLIER_INVOICE_OR_CHARGE";

  await ProviderSupplierAccountRuntime.save({
    provider_id: provider,
    payer_organization_id:
      body.payer_organization_id || body.payerOrganizationId,
    payer_entity_id: body.payer_entity_id || body.payerEntityId,
    supplier_party_id: body.supplier_party_id || body.supplierPartyId,
    billing_mode: billingMode,
    currency: body.currency || null,
    configuration: body.configuration || {},
    metadata: {
      configured_by: access.staff?.id || null,
      configured_at: new Date().toISOString(),
      adapter_id: adapter.adapter_id,
      supplier_cost_source: adapter.supplier_cost_source,
    },
  });

  return NextResponse.json({
    success: true,
    message: "Provider payer mapping saved as unverified. Commercial evidence is required before activation.",
    ...(await completeSnapshot()),
  });
}

async function verifyProviderSupplierAccount({ body, access }) {
  const provider = text(body.provider).toLowerCase();
  if (!provider) throw new Error("provider is required");

  ProviderBillingRuntime.assertProvider(provider);

  await ProviderSupplierAccountRuntime.verify({
    provider_id: provider,
    verification_method:
      body.verification_method || body.verificationMethod,
    verification_reference:
      body.verification_reference || body.verificationReference,
    verified_by: access.staff?.id || null,
  });

  return NextResponse.json({
    success: true,
    message: "Provider legal payer verified and supplier account activated.",
    ...(await completeSnapshot()),
  });
}

async function selectGooglePaymentsAccount({ body, access }) {
  const resourceName = text(
    body.paymentsAccountResourceName || body.payments_account_resource_name,
  );
  if (!resourceName) {
    return NextResponse.json(
      { success: false, error: "paymentsAccountResourceName is required" },
      { status: 400 },
    );
  }

  const manager = await avantiqoGoogleAdsManager();
  if (!manager?.customer_id) {
    throw new Error("Avantiqo Google Ads manager is not ready");
  }

  const service = await googleAdsService(manager);
  if (!service || upper(service.status) !== "ACTIVE") {
    throw new Error("Avantiqo Google Ads service is not active");
  }

  const accounts = await discoverGooglePaymentsAccounts(manager);
  const selected = accounts.find(
    (account) => account.resource_name === resourceName,
  );
  if (!selected) {
    return NextResponse.json(
      {
        success: false,
        error: "Selected Google Payments account is not available to the Avantiqo manager",
      },
      { status: 400 },
    );
  }

  await OrganizationServiceRuntime.save({
    ...service,
    configuration: {
      ...(service.configuration || {}),
      google_ads_payments_account_resource_name: selected.resource_name,
      google_ads_payments_account_id: selected.payments_account_id || null,
      google_ads_payments_profile_id: selected.payments_profile_id || null,
      google_ads_payments_account_name: selected.payments_account_name || null,
    },
    metadata: {
      ...(service.metadata || {}),
      provider_billed_to: "AVANTIQO",
      google_ads_billing_model: "MONTHLY_INVOICING",
      google_ads_payments_account_selected_at: new Date().toISOString(),
      google_ads_payments_account_selected_by: access.staff?.id || null,
    },
  });

  return NextResponse.json({
    success: true,
    message: "Avantiqo Google Payments account selected.",
    ...(await completeSnapshot()),
  });
}

export async function POST(request) {
  try {
    const access = await requirePlatformAdminAccess();
    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status || 403 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const provider = text(body.provider).toLowerCase();
    const action = text(body.action).toLowerCase();

    if (action === "save-supplier-account") {
      return saveProviderSupplierAccount({ body, access });
    }

    if (action === "verify-supplier-account") {
      return verifyProviderSupplierAccount({ body, access });
    }

    if (provider === GOOGLE_ADS_PROVIDER && action === "select-payments-account") {
      return selectGooglePaymentsAccount({ body, access });
    }

    return NextResponse.json(
      { success: false, error: "Unsupported provider billing action" },
      { status: 400 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to configure provider billing",
      },
      { status: 500 },
    );
  }
}
