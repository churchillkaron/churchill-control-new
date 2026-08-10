import { GoogleProvider } from "./GoogleProvider";

function text(value) {
  return String(value ?? "").trim();
}

function digits(value) {
  return text(value).replace(/\D/g, "");
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

export const GoogleAdsManagedProvider = {
  id: "google_ads",

  async execute(input = {}) {
    const action = text(input?.payload?.action).toLowerCase();
    if (
      input.capability === "marketing.google.ads.manage" &&
      (action === "list_payments_accounts" || action === "mutate_billing_setup")
    ) {
      return executeManagedBilling(input);
    }

    return GoogleProvider.execute(input);
  },
};
