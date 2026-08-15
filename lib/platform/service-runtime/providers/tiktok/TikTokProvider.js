import { save as saveCredential } from "@/lib/platform/service-runtime/credentials/repositories/CredentialRepository";
import "./TikTokCredentialRegistration.js";

const API = "https://open.tiktokapis.com";
const CREATOR_INFO = "/v2/post/publish/creator_info/query/";
const VIDEO_INIT = "/v2/post/publish/video/init/";
const PHOTO_INIT = "/v2/post/publish/content/init/";
const STATUS = "/v2/post/publish/status/fetch/";

function text(value) { return String(value ?? "").trim(); }
function bool(value, fallback = false) { return typeof value === "boolean" ? value : fallback; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }

async function apiPost(path, accessToken, body) {
  const response = await fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify(body || {}),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  const code = text(payload?.error?.code);
  if (!response.ok || (code && code !== "ok")) {
    const error = new Error(payload?.error?.message || payload?.message || `TIKTOK_REQUEST_FAILED:${response.status}`);
    error.status = response.status;
    error.code = code || null;
    throw error;
  }
  return payload?.data || {};
}

async function refreshAccessToken(input) {
  const refreshToken = text(input.refresh_token);
  const credentialId = text(input.credential_id);
  if (!refreshToken || !credentialId) return null;
  const clientKey = text(process.env.TIKTOK_CLIENT_KEY);
  const clientSecret = text(process.env.TIKTOK_CLIENT_SECRET);
  if (!clientKey || !clientSecret) throw new Error("TIKTOK_OAUTH_CONFIG_REQUIRED_FOR_REFRESH");

  const body = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const response = await fetch(`${API}/v2/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !text(payload?.access_token)) {
    throw new Error(payload?.error_description || payload?.message || "TIKTOK_TOKEN_REFRESH_FAILED");
  }

  const secret = {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token || refreshToken,
    expires_in: payload.expires_in || null,
    refresh_expires_in: payload.refresh_expires_in || null,
    open_id: payload.open_id || input.open_id || null,
    scope: payload.scope || null,
    token_type: payload.token_type || "Bearer",
  };
  await saveCredential({
    id: credentialId,
    provider_id: "tiktok",
    credential_type: "oauth_token",
    secret_reference: JSON.stringify(secret),
    metadata: {
      organization_id: input.context?.organization_id || null,
      purpose: "ORGANIZATION_SOCIAL_CONNECTION",
      external_account_id: input.external_account_id || input.open_id || null,
      username: input.username || null,
      enabled: true,
      token_refreshed_at: new Date().toISOString(),
    },
    status: "ACTIVE",
  });
  return secret.access_token;
}

async function withRefresh(input, operation) {
  let token = text(input.access_token);
  if (!token) throw new Error("TIKTOK_ACCESS_TOKEN_REQUIRED");
  try {
    return await operation(token);
  } catch (error) {
    if (Number(error?.status) !== 401 || !text(input.refresh_token)) throw error;
    token = await refreshAccessToken(input);
    return operation(token);
  }
}

async function creatorInfo(accessToken) {
  return apiPost(CREATOR_INFO, accessToken, {});
}

function consentedPrivacy(input, creator) {
  if (input.creator_consent !== true) throw new Error("TIKTOK_EXPLICIT_CREATOR_CONSENT_REQUIRED");
  const privacy = text(input.privacy_level);
  if (!privacy) throw new Error("TIKTOK_PRIVACY_LEVEL_REQUIRED");
  const options = Array.isArray(creator?.privacy_level_options) ? creator.privacy_level_options.map(text) : [];
  if (!options.includes(privacy)) throw new Error("TIKTOK_PRIVACY_LEVEL_NOT_CURRENTLY_AVAILABLE");
  return privacy;
}

async function fetchVideo(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`TIKTOK_VIDEO_FETCH_FAILED:${response.status}`);
  const type = text(response.headers.get("content-type")).split(";")[0].toLowerCase();
  if (!["video/mp4", "video/quicktime", "video/webm"].includes(type)) {
    throw new Error("TIKTOK_UNSUPPORTED_VIDEO_CONTENT_TYPE");
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) throw new Error("TIKTOK_VIDEO_EMPTY");
  return { buffer, type };
}

function uploadPlan(size) {
  const MB = 1024 * 1024;
  if (size < 5 * MB) return { chunkSize: size, total: 1 };
  const chunkSize = Math.min(10 * MB, 64 * MB);
  return { chunkSize, total: Math.floor(size / chunkSize) || 1 };
}

async function uploadChunks(uploadUrl, buffer, type, chunkSize) {
  const total = buffer.length;
  let start = 0;
  while (start < total) {
    const endExclusive = Math.min(start + chunkSize, total);
    const chunk = buffer.subarray(start, endExclusive);
    const response = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": type,
        "Content-Length": String(chunk.length),
        "Content-Range": `bytes ${start}-${endExclusive - 1}/${total}`,
      },
      body: chunk,
      cache: "no-store",
    });
    if (![201, 206].includes(response.status)) {
      throw new Error(`TIKTOK_VIDEO_UPLOAD_FAILED:${response.status}`);
    }
    start = endExclusive;
  }
}

async function directVideo(input, accessToken, creator) {
  const privacy = consentedPrivacy(input, creator);
  const videoUrl = text(input.video_url || input.media_url);
  if (!videoUrl) throw new Error("TIKTOK_VIDEO_URL_REQUIRED");
  const { buffer, type } = await fetchVideo(videoUrl);
  const { chunkSize, total } = uploadPlan(buffer.length);

  const data = await apiPost(VIDEO_INIT, accessToken, {
    post_info: {
      title: text(input.title || input.caption || input.text),
      privacy_level: privacy,
      disable_duet: bool(input.disable_duet, false) || creator?.duet_disabled === true,
      disable_comment: bool(input.disable_comment, false) || creator?.comment_disabled === true,
      disable_stitch: bool(input.disable_stitch, false) || creator?.stitch_disabled === true,
      ...(typeof input.brand_organic_toggle === "boolean" ? { brand_organic_toggle: input.brand_organic_toggle } : {}),
      ...(typeof input.is_aigc === "boolean" ? { is_aigc: input.is_aigc } : {}),
    },
    source_info: {
      source: "FILE_UPLOAD",
      video_size: buffer.length,
      chunk_size: chunkSize,
      total_chunk_count: total,
    },
  });
  if (!text(data.publish_id) || !text(data.upload_url)) throw new Error("TIKTOK_UPLOAD_INITIALIZATION_INCOMPLETE");
  await uploadChunks(data.upload_url, buffer, type, chunkSize);
  return data.publish_id;
}

async function directPhoto(input, accessToken, creator) {
  const privacy = consentedPrivacy(input, creator);
  const photos = (Array.isArray(input.photo_images) ? input.photo_images : [input.image_url || input.media_url])
    .map(text).filter(Boolean).slice(0, 35);
  if (!photos.length) throw new Error("TIKTOK_PHOTO_URL_REQUIRED");
  if (input.verified_media_source !== true) throw new Error("TIKTOK_PHOTO_PULL_URL_MUST_BE_VERIFIED");

  const data = await apiPost(PHOTO_INIT, accessToken, {
    post_mode: "DIRECT_POST",
    media_type: "PHOTO",
    post_info: {
      title: text(input.title),
      description: text(input.description || input.caption || input.text),
      privacy_level: privacy,
      disable_comment: bool(input.disable_comment, false) || creator?.comment_disabled === true,
      auto_add_music: bool(input.auto_add_music, false),
      ...(typeof input.brand_organic_toggle === "boolean" ? { brand_organic_toggle: input.brand_organic_toggle } : {}),
      ...(typeof input.is_aigc === "boolean" ? { is_aigc: input.is_aigc } : {}),
    },
    source_info: {
      source: "PULL_FROM_URL",
      photo_cover_index: Number.isInteger(input.photo_cover_index) ? input.photo_cover_index : 0,
      photo_images: photos,
    },
  });
  if (!text(data.publish_id)) throw new Error("TIKTOK_PUBLISH_ID_MISSING");
  return data.publish_id;
}

async function publish(input, accessToken) {
  const creator = await creatorInfo(accessToken);
  const mediaType = text(input.media_type).toUpperCase() || (input.photo_images || input.image_url ? "PHOTO" : "VIDEO");
  const publishId = mediaType === "PHOTO"
    ? await directPhoto(input, accessToken, creator)
    : await directVideo(input, accessToken, creator);
  return {
    success: true,
    pending: true,
    provider: "tiktok",
    job_id: publishId,
    output: {
      publish_id: publishId,
      status: "PROCESSING",
      media_type: mediaType,
      privacy_level: text(input.privacy_level),
    },
  };
}

export const TikTokProvider = {
  id: "tiktok",

  async execute(input = {}) {
    if (input.capability === "marketing.tiktok.creator.read") {
      return withRefresh(input, async (token) => ({
        success: true,
        provider: "tiktok",
        output: await creatorInfo(token),
      }));
    }
    if (input.capability === "marketing.tiktok.status") {
      return this.getStatus(input);
    }
    if (input.capability !== "marketing.tiktok.publish") {
      throw new Error(`TikTok capability not supported: ${input.capability}`);
    }
    return withRefresh(input, (token) => publish(input, token));
  },

  async getStatus(input = {}) {
    const publishId = text(input.job_id || input.provider_job_id || input.publish_id);
    if (!publishId) throw new Error("TIKTOK_PUBLISH_ID_REQUIRED");
    return withRefresh(input, async (token) => {
      const data = await apiPost(STATUS, token, { publish_id: publishId });
      const status = text(data.status);
      return {
        success: status !== "FAILED",
        pending: !["PUBLISH_COMPLETE", "FAILED"].includes(status),
        provider: "tiktok",
        job_id: publishId,
        output: {
          ...object(data),
          publish_id: publishId,
          status,
        },
      };
    });
  },
};
