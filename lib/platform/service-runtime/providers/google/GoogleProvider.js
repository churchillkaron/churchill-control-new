import { google } from "googleapis";

import { ProviderEventRuntime } from "@/lib/platform/service-runtime/events/runtime/ProviderEventRuntime";

const GOOGLE_BUSINESS_API = "https://mybusiness.googleapis.com/v4";

function text(value) {
  return String(value ?? "").trim();
}

function normalizedLocationId(value) {
  const locationId = text(value).replace(/^\/+/, "");
  if (!/^accounts\/[^/]+\/locations\/[^/]+$/.test(locationId)) {
    throw new Error("GOOGLE_LOCATION_ID_REQUIRED");
  }
  return locationId;
}

function normalizeUrl(value) {
  const candidate = text(value);
  if (!candidate) return null;
  const parsed = new URL(candidate);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("GOOGLE_MEDIA_URL_INVALID");
  }
  return parsed.toString();
}

async function googleBusinessRequest(path, { accessToken, body }) {
  const response = await fetch(`${GOOGLE_BUSINESS_API}/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok || result?.error) {
    const error = new Error(
      result?.error?.message || `Google Business request failed (${response.status})`
    );
    error.status = response.status;
    error.code = result?.error?.status || result?.error?.code || null;
    throw error;
  }

  return result;
}

export const GoogleProvider = {
  id: "google",

  async execute({
    capability,
    access_token,
    refresh_token,
    payload = {},
    organization_id,
  } = {}) {
    if (!access_token) {
      throw new Error("GOOGLE_ACCESS_TOKEN_REQUIRED");
    }

    switch (capability) {
      case "documents.google.drive":
        return googleDrive({
          access_token,
          refresh_token,
          payload,
        });

      case "marketing.google.business.publish":
        return publishBusinessPost({
          organization_id,
          location_id: payload.location_id,
          access_token,
          summary: payload.summary || payload.text,
          language_code: payload.language_code || "en",
          image_url: payload.image_url || payload.media_url || null,
          topic_type: payload.topic_type || "STANDARD",
          call_to_action: payload.call_to_action || null,
        });

      case "marketing.google.business.media.publish":
        return publishBusinessPhoto({
          organization_id,
          location_id: payload.location_id,
          access_token,
          image_url: payload.image_url || payload.media_url,
          category: payload.category || "ADDITIONAL",
        });

      case "marketing.google.ads.manage":
        return manageGoogleAds({
          access_token,
          payload,
        });

      default:
        throw new Error(`Google capability not supported: ${capability}`);
    }
  },
};

async function googleDrive({ access_token, refresh_token }) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({
    access_token,
    refresh_token,
  });

  const drive = google.drive({
    version: "v3",
    auth,
  });

  const result = await drive.files.list({
    pageSize: 10,
    fields: "files(id,name)",
  });

  return {
    success: true,
    provider: "google",
    output: result.data,
  };
}

async function publishBusinessPost({
  organization_id,
  location_id,
  access_token,
  summary,
  language_code,
  image_url,
  topic_type,
  call_to_action,
}) {
  const locationId = normalizedLocationId(location_id);
  const message = text(summary);
  const imageUrl = image_url ? normalizeUrl(image_url) : null;

  if (!message && !imageUrl) {
    throw new Error("GOOGLE_BUSINESS_POST_CONTENT_REQUIRED");
  }

  const body = {
    languageCode: text(language_code) || "en",
    topicType: text(topic_type).toUpperCase() || "STANDARD",
    ...(message ? { summary: message.slice(0, 1500) } : {}),
    ...(imageUrl
      ? {
          media: [
            {
              mediaFormat: "PHOTO",
              sourceUrl: imageUrl,
            },
          ],
        }
      : {}),
  };

  const actionType = text(call_to_action?.actionType || call_to_action?.action_type)
    .toUpperCase();
  const actionUrl = call_to_action?.url ? normalizeUrl(call_to_action.url) : null;
  if (actionType && actionUrl) {
    body.callToAction = {
      actionType,
      url: actionUrl,
    };
  }

  const result = await googleBusinessRequest(`${locationId}/localPosts`, {
    accessToken: access_token,
    body,
  });

  await ProviderEventRuntime.record({
    organization_id,
    provider_id: "google",
    event_type: "GOOGLE_BUSINESS_POST_PUBLISHED",
    external_event_id: result?.name || null,
    payload: result,
  }).catch(() => null);

  return {
    success: true,
    provider: "google",
    output: result,
  };
}

async function publishBusinessPhoto({
  organization_id,
  location_id,
  access_token,
  image_url,
  category,
}) {
  const locationId = normalizedLocationId(location_id);
  const imageUrl = normalizeUrl(image_url);
  if (!imageUrl) throw new Error("GOOGLE_BUSINESS_PHOTO_REQUIRED");

  const result = await googleBusinessRequest(`${locationId}/media`, {
    accessToken: access_token,
    body: {
      mediaFormat: "PHOTO",
      sourceUrl: imageUrl,
      locationAssociation: {
        category: text(category).toUpperCase() || "ADDITIONAL",
      },
    },
  });

  await ProviderEventRuntime.record({
    organization_id,
    provider_id: "google",
    event_type: "GOOGLE_BUSINESS_PHOTO_PUBLISHED",
    external_event_id: result?.name || null,
    payload: result,
  }).catch(() => null);

  return {
    success: true,
    provider: "google",
    output: result,
  };
}

async function manageGoogleAds({ access_token, payload = {} }) {
  const developerToken = text(process.env.GOOGLE_ADS_DEVELOPER_TOKEN);
  if (!developerToken) {
    throw new Error("GOOGLE_ADS_DEVELOPER_TOKEN_REQUIRED");
  }

  const apiVersion = text(process.env.GOOGLE_ADS_API_VERSION) || "v25";
  const action = text(payload.action).toLowerCase();
  const customerId = text(payload.customer_id).replace(/\D/g, "");
  const loginCustomerId = text(payload.login_customer_id).replace(/\D/g, "");

  const headers = {
    Authorization: `Bearer ${access_token}`,
    "developer-token": developerToken,
    Accept: "application/json",
    "Content-Type": "application/json",
    ...(loginCustomerId ? { "login-customer-id": loginCustomerId } : {}),
  };

  let url;
  let method = "POST";
  let body = null;

  if (action === "list_accessible_customers") {
    url = `https://googleads.googleapis.com/${apiVersion}/customers:listAccessibleCustomers`;
    method = "GET";
  } else if (action === "search") {
    if (!customerId) throw new Error("GOOGLE_ADS_CUSTOMER_ID_REQUIRED");
    if (!text(payload.query)) throw new Error("GOOGLE_ADS_QUERY_REQUIRED");
    url = `https://googleads.googleapis.com/${apiVersion}/customers/${customerId}/googleAds:search`;
    body = {
      query: text(payload.query),
      ...(payload.page_size ? { pageSize: Number(payload.page_size) } : {}),
    };
  } else if (action === "mutate") {
    if (!customerId) throw new Error("GOOGLE_ADS_CUSTOMER_ID_REQUIRED");
    const resource = text(payload.resource);
    const allowed = new Set([
      "campaignBudgets",
      "campaigns",
      "adGroups",
      "adGroupAds",
      "adGroupCriteria",
      "campaignCriteria",
    ]);
    if (!allowed.has(resource)) throw new Error("GOOGLE_ADS_RESOURCE_UNSUPPORTED");
    if (!Array.isArray(payload.operations) || !payload.operations.length) {
      throw new Error("GOOGLE_ADS_OPERATIONS_REQUIRED");
    }
    url = `https://googleads.googleapis.com/${apiVersion}/customers/${customerId}/${resource}:mutate`;
    body = {
      operations: payload.operations,
      partialFailure: payload.partial_failure === true,
      validateOnly: payload.validate_only === true,
    };
  } else {
    throw new Error("GOOGLE_ADS_ACTION_UNSUPPORTED");
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const result = await response.json().catch(() => ({}));

  if (!response.ok || result?.error) {
    const error = new Error(
      result?.error?.message || `Google Ads request failed (${response.status})`
    );
    error.status = response.status;
    error.code = result?.error?.status || result?.error?.code || null;
    throw error;
  }

  return {
    success: true,
    provider: "google_ads",
    output: result,
  };
}
