import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { ProviderPayerRuntime } from "../../billing/runtime/ProviderPayerRuntime.js";
import { ProviderSupplierAccountRuntime } from "../../billing/runtime/ProviderSupplierAccountRuntime.js";
import { GoogleProvider } from "./GoogleProvider";

const ADMIN_CAPABILITY = "marketing.google.ads.manage";
const PAID_MEDIA_CAPABILITY = "marketing.google.ads.spend";

function text(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

function digits(value) {
  return text(value).replace(/\D/g, "");
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

async function googleAdsJson(url, {
  accessToken,
  developerToken,
  loginCustomerId = null,
  method = "GET",
  body = null,
} = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "developer-token": developerToken,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(loginCustomerId ? { "login-customer-id": loginCustomerId } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok || result?.error) {
    const error = new Error(
      result?.error?.message || `Google Ads billing request failed (${response.status})`
    );
    error.status = response.status;
    error.code = result?.error?.status || result?.error?.code || null;
    error.details = result?.error?.details || null;
    throw error;
  }

  return result;
}

async function executeManagedBilling({
  access_token,
  payload = {},
}) {
  const developerToken = text(process.env.GOOGLE_ADS_DEVELOPER_TOKEN);
  if (!developerToken) {
    throw new Error("GOOGLE_ADS_DEVELOPER_TOKEN_REQUIRED");
  }
  if (!access_token) {
    throw new Error("GOOGLE_ACCESS_TOKEN_REQUIRED");
  }

  const apiVersion = text(process.env.GOOGLE_ADS_API_VERSION) || "v25";
  const action = text(payload.action).toLowerCase();
  const customerId = digits(payload.customer_id);
  const loginCustomerId = digits(payload.login_customer_id);

  if (!customerId) {
    throw new Error("GOOGLE_ADS_CUSTOMER_ID_REQUIRED");
  }

  if (action === "list_payments_accounts") {
    const output = await googleAdsJson(
      `https://googleads.googleapis.com/${apiVersion}/customers/${customerId}/paymentsAccounts`,
      {
        accessToken: access_token,
        developerToken,
        loginCustomerId: loginCustomerId || customerId,
        method: "GET",
      }
    );

    return {
      success: true,
      provider: "google_ads",
      output,
    };
  }

  if (action === "mutate_billing_setup") {
    const operation = payload.operation;
    if (!operation || typeof operation !== "object" || Array.isArray(operation)) {
      throw new Error("GOOGLE_ADS_BILLING_SETUP_OPERATION_REQUIRED");
    }

    const output = await googleAdsJson(
      `https://googleads.googleapis.com/${apiVersion}/customers/${customerId}/billingSetups:mutate`,
      {
        accessToken: access_token,
        developerToken,
        loginCustomerId,
        method: "POST",
        body: { operation },
      }
    );

    return {
      success: true,
      provider: "google_ads",
      output,
    };
  }

  return null;
}

async function paidMediaUsage({ organizationId, usageId }) {
  const { data, error } = await supabaseAdmin
    .from("platform_service_usage")
    .select("id,organization_id,organization_service_id,provider,capability,status,metadata")
    .eq("id", usageId)
    .eq("organization_id", organizationId)
    .eq("provider", "google_ads")
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function organizationService({ organizationId, serviceId }) {
  if (!serviceId) return null;

  const { data, error } = await supabaseAdmin
    .from("organization_services")
    .select("id,organization_id,status,usage_enabled,billing_enabled,metadata")
    .eq("id", serviceId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function managedAdvertiserAsset({ organizationId, customerId }) {
  const { data, error } = await supabaseAdmin
    .from("organization_channel_assets")
    .select("id,organization_id,external_id,metadata")
    .eq("organization_id", organizationId)
    .eq("channel_provider", "google_ads")
    .eq("asset_type", "google_ads_customer")
    .eq("external_id", customerId)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const metadata = object(data.metadata);
  if (metadata.manager === true || metadata.managed_by_avantiqo !== true) {
    return null;
  }

  return data;
}

async function prepaidMediaReservation({ organizationId, usageId }) {
  const { data, error } = await supabaseAdmin
    .from("wallet_transactions")
    .select("id,wallet_id,type,amount,currency,metadata,created_at")
    .eq("organization_id", organizationId)
    .eq("type", "RESERVE")
    .contains("metadata", { usage_id: usageId })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function assertPaidMediaReady(input = {}) {
  const organizationId = text(input?.context?.organization_id);
  const usageId = text(input?.context?.usage_id);
  const customerId = digits(input?.payload?.customer_id);

  if (!organizationId || !usageId) {
    throw new Error("GOOGLE_ADS_PAID_MEDIA_GOVERNED_USAGE_REQUIRED");
  }
  if (!customerId) {
    throw new Error("GOOGLE_ADS_CUSTOMER_ID_REQUIRED");
  }

  const usage = await paidMediaUsage({ organizationId, usageId });
  if (!usage || text(usage.capability) !== PAID_MEDIA_CAPABILITY) {
    throw new Error("GOOGLE_ADS_PAID_MEDIA_CAPABILITY_REQUIRED");
  }

  const service = await organizationService({
    organizationId,
    serviceId: usage.organization_service_id,
  });
  if (!service || upper(service.status) !== "ACTIVE") {
    throw new Error("GOOGLE_ADS_ORGANIZATION_SERVICE_ACTIVE_REQUIRED");
  }
  if (service.usage_enabled === false || service.billing_enabled === false) {
    throw new Error("GOOGLE_ADS_PAID_MEDIA_SERVICE_BILLING_REQUIRED");
  }

  const serviceMetadata = object(service.metadata);
  if (serviceMetadata.media_spend_authorized !== true) {
    throw new Error("GOOGLE_ADS_MEDIA_SPEND_AUTHORIZATION_REQUIRED");
  }

  const advertiser = await managedAdvertiserAsset({
    organizationId,
    customerId,
  });
  if (!advertiser) {
    throw new Error("GOOGLE_ADS_MANAGED_ADVERTISER_ASSIGNMENT_REQUIRED");
  }

  const payerOrganizationId =
    await ProviderPayerRuntime.resolveProviderPayerOrganizationId();
  const supplierAccount = await ProviderSupplierAccountRuntime.providerStatus(
    "google_ads",
    { payerOrganizationId },
  );
  if (!supplierAccount.ready) {
    throw new Error(
      `${supplierAccount.blocker || "AVANTIQO_PROVIDER_SUPPLIER_ACCOUNT_REQUIRED"}:google_ads`,
    );
  }

  const reservation = await prepaidMediaReservation({ organizationId, usageId });
  if (!reservation || Number(reservation.amount || 0) <= 0) {
    throw new Error("GOOGLE_ADS_PREPAID_MEDIA_RESERVATION_REQUIRED");
  }

  return {
    organization_id: organizationId,
    usage_id: usageId,
    advertiser_asset_id: advertiser.id,
    supplier_account_id: supplierAccount.account?.id || null,
    reservation_id: reservation.id,
    reserved_amount: Number(reservation.amount || 0),
  };
}

function isDeliveryMutation(input = {}) {
  return (
    text(input?.payload?.action).toLowerCase() === "mutate" &&
    input?.payload?.validate_only !== true
  );
}

export const GoogleAdsManagedProvider = {
  id: "google_ads",

  async execute(input = {}) {
    const action = text(input?.payload?.action).toLowerCase();
    const capability = text(input.capability);

    if (
      capability === ADMIN_CAPABILITY &&
      (action === "list_payments_accounts" || action === "mutate_billing_setup")
    ) {
      return executeManagedBilling(input);
    }

    if (capability === ADMIN_CAPABILITY && isDeliveryMutation(input)) {
      throw new Error("GOOGLE_ADS_PAID_MEDIA_CAPABILITY_REQUIRED");
    }

    if (capability === PAID_MEDIA_CAPABILITY) {
      if (!isDeliveryMutation(input)) {
        throw new Error("GOOGLE_ADS_PAID_MEDIA_MUTATION_REQUIRED");
      }

      await assertPaidMediaReady(input);
      return GoogleProvider.execute({
        ...input,
        capability: ADMIN_CAPABILITY,
      });
    }

    return GoogleProvider.execute(input);
  },
};
