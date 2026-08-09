import { getOAuthClient } from "@/lib/integrations/googleAuth";
import { ChannelConnectionRuntime } from "@/lib/platform/channels/runtime/ChannelConnectionRuntime";
import { CredentialRuntime } from "@/lib/platform/service-runtime/credentials/runtime/CredentialRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const GOOGLE_BUSINESS_SCOPE =
  "https://www.googleapis.com/auth/business.manage";

const ACCOUNT_API =
  "https://mybusinessaccountmanagement.googleapis.com/v1";
const BUSINESS_INFO_API =
  "https://mybusinessbusinessinformation.googleapis.com/v1";
const REVIEWS_API = "https://mybusiness.googleapis.com/v4";

function parseCredential(secretReference) {
  try {
    const parsed = JSON.parse(secretReference || "{}");
    if (!parsed || typeof parsed !== "object") throw new Error();
    return parsed;
  } catch {
    throw new Error("Google Business Profile credential is invalid");
  }
}

async function googleJson(url, { accessToken, method = "GET", body = null } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload?.error) {
    throw new Error(
      payload?.error?.message ||
        `Google Business Profile request failed (${response.status})`
    );
  }

  return payload;
}

async function persistCredentialTokens(credential, tokens) {
  const serialized = JSON.stringify(tokens);
  if (serialized === credential.secret_reference) return;

  const { error } = await supabaseAdmin
    .from("provider_credentials")
    .update({
      secret_reference: serialized,
      updated_at: new Date().toISOString(),
      metadata: {
        ...(credential.metadata || {}),
        scopes: tokens.scope || credential.metadata?.scopes || null,
      },
    })
    .eq("id", credential.id);

  if (error) throw error;
}

export async function getGoogleBusinessAccess({ organizationId, origin = null }) {
  const connection = await ChannelConnectionRuntime.get({
    organization_id: organizationId,
    provider: "google",
  });

  if (!connection || String(connection.status || "").toUpperCase() !== "ACTIVE") {
    throw new Error("Google Business Profile is not connected");
  }
  if (!connection.credentials_reference) {
    throw new Error("Google Business Profile credential is missing");
  }

  const credential = await CredentialRuntime.resolve(
    connection.credentials_reference
  );
  const storedTokens = parseCredential(credential.secret_reference);
  const oauth2Client = getOAuthClient({ origin });
  let refreshedTokens = {};

  oauth2Client.on("tokens", (tokens) => {
    refreshedTokens = { ...refreshedTokens, ...tokens };
  });
  oauth2Client.setCredentials(storedTokens);

  const result = await oauth2Client.getAccessToken();
  const accessToken =
    typeof result === "string" ? result : result?.token || null;

  if (!accessToken) {
    throw new Error("Google Business Profile access token is unavailable");
  }

  const currentTokens = {
    ...storedTokens,
    ...oauth2Client.credentials,
    ...refreshedTokens,
    access_token: accessToken,
  };
  await persistCredentialTokens(credential, currentTokens);

  return { connection, credential, accessToken };
}

export async function discoverGoogleBusinessLocations(accessToken) {
  const accounts = [];
  let accountPageToken = null;

  do {
    const url = new URL(`${ACCOUNT_API}/accounts`);
    url.searchParams.set("pageSize", "20");
    if (accountPageToken) url.searchParams.set("pageToken", accountPageToken);

    const payload = await googleJson(url, { accessToken });
    accounts.push(...(Array.isArray(payload.accounts) ? payload.accounts : []));
    accountPageToken = payload.nextPageToken || null;
  } while (accountPageToken);

  const locations = [];

  for (const account of accounts) {
    let pageToken = null;

    do {
      const url = new URL(`${BUSINESS_INFO_API}/${account.name}/locations`);
      url.searchParams.set(
        "readMask",
        "name,title,storeCode,websiteUri,phoneNumbers,metadata"
      );
      url.searchParams.set("pageSize", "100");
      if (pageToken) url.searchParams.set("pageToken", pageToken);

      const payload = await googleJson(url, { accessToken });
      const pageLocations = Array.isArray(payload.locations)
        ? payload.locations
        : [];

      locations.push(
        ...pageLocations.map((location) => ({
          ...location,
          account_name: account.name,
          account_title: account.accountName || account.name,
          review_parent: `${account.name}/${location.name}`,
        }))
      );
      pageToken = payload.nextPageToken || null;
    } while (pageToken);
  }

  return { accounts, locations };
}

export async function listGoogleLocationReviews({
  accessToken,
  reviewParent,
  maxReviews = null,
}) {
  const reviews = [];
  const limit = Number.isFinite(Number(maxReviews)) && Number(maxReviews) > 0
    ? Number(maxReviews)
    : null;
  let pageToken = null;

  do {
    const url = new URL(`${REVIEWS_API}/${reviewParent}/reviews`);
    url.searchParams.set("pageSize", "50");
    url.searchParams.set("orderBy", "updateTime desc");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const payload = await googleJson(url, { accessToken });
    reviews.push(...(Array.isArray(payload.reviews) ? payload.reviews : []));
    pageToken = payload.nextPageToken || null;
  } while (pageToken && (!limit || reviews.length < limit));

  return limit ? reviews.slice(0, limit) : reviews;
}

export async function publishGoogleReviewReply({
  organizationId,
  reviewName,
  comment,
  origin = null,
}) {
  const { accessToken } = await getGoogleBusinessAccess({
    organizationId,
    origin,
  });

  return googleJson(`${REVIEWS_API}/${reviewName}/reply`, {
    accessToken,
    method: "PUT",
    body: { comment },
  });
}
