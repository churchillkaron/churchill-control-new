export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { requirePlatformAdminAccess } from "@/lib/platform/security/requirePlatformAdminAccess";
import { ServiceExecutionRuntime } from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { OrganizationServiceRuntime } from "@/lib/platform/service-runtime/services/runtime/OrganizationServiceRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const PROVIDER = "google_ads";
const SERVICE_ID = "google-ads";
const CAPABILITY = "marketing.google.ads.manage";
const ASSET_TYPE = "google_ads_customer";

function text(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return text(value).toUpperCase();
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
    customer_id: text(manager.external_id).replace(/\D/g, ""),
  };
}

async function platformService(manager) {
  if (!manager?.organization_id) return null;
  return OrganizationServiceRuntime.get({
    organization_id: manager.organization_id,
    service_id: SERVICE_ID,
  });
}

async function executeManagerGoogleAds(manager, input) {
  const currency = upper(manager?.metadata?.currency_code);
  if (!currency) {
    throw new Error("AVANTIQO_GOOGLE_ADS_MANAGER_CURRENCY_REQUIRED");
  }

  return ServiceExecutionRuntime.execute({
    organization_id: manager.organization_id,
    service_id: SERVICE_ID,
    provider_id: PROVIDER,
    capability: CAPABILITY,
    input: {
      ...input,
      currency,
      quantity: 1,
    },
    category: "PLATFORM_GOOGLE_ADS_BILLING",
    metadata: {
      module: "PLATFORM_INTEGRATIONS",
      provider: PROVIDER,
      zero_price_admin_operation: true,
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
      row.payingManagerCustomer || row.paying_manager_customer
    ),
  }));
}

async function discover(manager) {
  const execution = await executeManagerGoogleAds(manager, {
    action: "list_payments_accounts",
    customer_id: manager.customer_id,
    login_customer_id: manager.customer_id,
  });
  return paymentAccountsFrom(execution);
}

function selectedBilling(service) {
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

async function snapshot() {
  const manager = await platformManager();
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

  const service = await platformService(manager);
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

  const accounts = await discover(manager);
  const billing = selectedBilling(service);
  const selected = accounts.find(
    (account) => account.resource_name === billing.payments_account_resource_name
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

export async function GET() {
  try {
    const access = await requirePlatformAdminAccess();
    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status || 403 }
      );
    }

    return NextResponse.json({
      success: true,
      ...(await snapshot()),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to load Avantiqo Google Ads billing",
      },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const access = await requirePlatformAdminAccess();
    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status || 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const action = text(body.action).toLowerCase();
    if (action !== "select-payments-account") {
      return NextResponse.json(
        { success: false, error: "Unsupported platform billing action" },
        { status: 400 }
      );
    }

    const resourceName = text(
      body.paymentsAccountResourceName || body.payments_account_resource_name
    );
    if (!resourceName) {
      return NextResponse.json(
        { success: false, error: "paymentsAccountResourceName is required" },
        { status: 400 }
      );
    }

    const manager = await platformManager();
    if (!manager?.customer_id) {
      throw new Error("Avantiqo Google Ads manager is not ready");
    }

    const service = await platformService(manager);
    if (!service || upper(service.status) !== "ACTIVE") {
      throw new Error("Avantiqo Google Ads service is not active");
    }

    const accounts = await discover(manager);
    const selected = accounts.find(
      (account) => account.resource_name === resourceName
    );
    if (!selected) {
      return NextResponse.json(
        {
          success: false,
          error: "Selected Google Payments account is not available to the Avantiqo manager",
        },
        { status: 400 }
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
      ...(await snapshot()),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to configure Avantiqo Google Ads billing",
      },
      { status: 500 }
    );
  }
}
