import { save as saveCredential } from "@/lib/platform/service-runtime/credentials/repositories/CredentialRepository";
import "./XCredentialRegistration.js";

const API_BASE = "https://api.x.com/2";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

async function parseResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.errors?.length) {
    const error = new Error(
      payload?.detail ||
        payload?.title ||
        payload?.errors?.[0]?.detail ||
        payload?.errors?.[0]?.message ||
        `X_REQUEST_FAILED:${response.status}`,
    );
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function refreshAccessToken(input) {
  const refreshToken = text(input.refresh_token);
  const credentialId = text(input.credential_id);
  if (!refreshToken || !credentialId) return null;

  const clientId = text(process.env.X_CLIENT_ID);
  const clientSecret = text(process.env.X_CLIENT_SECRET);
  if (!clientId) throw new Error("X_CLIENT_ID_REQUIRED_FOR_TOKEN_REFRESH");

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
  });
  const headers = { "Content-Type": "application/x-www-form-urlencoded" };
  if (clientSecret) {
    headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
  }

  const response = await fetch("https://api.x.com/2/oauth2/token", {
    method: "POST",
    headers,
    body,
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !text(payload?.access_token)) {
    throw new Error(
      payload?.error_description || payload?.error || "X_TOKEN_REFRESH_FAILED",
    );
  }

  const secret = {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token || refreshToken,
    token_type: payload.token_type || "bearer",
    expires_in: payload.expires_in || null,
    scope: payload.scope || null,
  };

  await saveCredential({
    id: credentialId,
    provider_id: "x",
    credential_type: "oauth_token",
    secret_reference: JSON.stringify(secret),
    metadata: {
      organization_id: input.context?.organization_id || null,
      purpose: "ORGANIZATION_SOCIAL_CONNECTION",
      external_account_id: input.external_account_id || null,
      username: input.username || null,
      enabled: true,
      token_refreshed_at: new Date().toISOString(),
    },
    status: "ACTIVE",
  });

  return secret.access_token;
}

async function createPost(accessToken, payload) {
  const response = await fetch(`${API_BASE}/tweets`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  return parseResponse(response);
}

function postPayload(input) {
  const message = text(input.text || input.message || input.caption);
  const mediaIds = (Array.isArray(input.media_ids) ? input.media_ids : [input.media_id])
    .map(text)
    .filter(Boolean)
    .slice(0, 4);

  if (!message && !mediaIds.length) {
    throw new Error("X_POST_CONTENT_REQUIRED");
  }
  if (input.image_url || input.video_url || input.media_url) {
    throw new Error("X_MEDIA_URL_UPLOAD_REQUIRES_VERIFIED_MEDIA_UPLOAD_FLOW");
  }

  return {
    ...(message ? { text: message } : {}),
    ...(mediaIds.length ? { media: { media_ids: mediaIds } } : {}),
    ...(text(input.reply_to_id)
      ? { reply: { in_reply_to_tweet_id: text(input.reply_to_id) } }
      : {}),
    ...(text(input.quote_tweet_id)
      ? { quote_tweet_id: text(input.quote_tweet_id) }
      : {}),
  };
}

export const XProvider = {
  id: "x",

  async execute(input = {}) {
    if (input.capability !== "marketing.x.publish") {
      throw new Error(`X capability not supported: ${input.capability}`);
    }

    const payload = postPayload(input);
    let accessToken = text(input.access_token);
    if (!accessToken) throw new Error("X_ACCESS_TOKEN_REQUIRED");

    try {
      const created = await createPost(accessToken, payload);
      return {
        success: true,
        provider: "x",
        output: {
          id: created?.data?.id || null,
          text: created?.data?.text || payload.text || null,
        },
      };
    } catch (error) {
      if (Number(error?.status) !== 401 || !text(input.refresh_token)) throw error;
      accessToken = await refreshAccessToken(input);
      const created = await createPost(accessToken, payload);
      return {
        success: true,
        provider: "x",
        output: {
          id: created?.data?.id || null,
          text: created?.data?.text || payload.text || null,
          token_refreshed: true,
        },
      };
    }
  },
};
