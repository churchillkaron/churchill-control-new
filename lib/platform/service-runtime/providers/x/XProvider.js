import { save as saveCredential } from "@/lib/platform/service-runtime/credentials/repositories/CredentialRepository";
import "./XCredentialRegistration.js";

const API_BASE = "https://api.x.com/2";
const MEDIA_CHUNK_BYTES = 4 * 1024 * 1024;
const MEDIA_LIMITS = {
  tweet_image: 5 * 1024 * 1024,
  tweet_gif: 15 * 1024 * 1024,
  tweet_video: 512 * 1024 * 1024,
};

function text(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

function unique(values) {
  return [...new Set(values.map(text).filter(Boolean))];
}

async function parseResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.errors?.length) {
    const error = new Error(
      payload?.detail ||
        payload?.title ||
        payload?.errors?.[0]?.detail ||
        payload?.errors?.[0]?.message ||
        payload?.data?.processing_info?.error?.message ||
        `X_REQUEST_FAILED:${response.status}`,
    );
    error.status = response.status;
    error.payload = payload;
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

async function withRefresh(input, operation) {
  let accessToken = text(input.access_token);
  if (!accessToken) throw new Error("X_ACCESS_TOKEN_REQUIRED");

  try {
    return await operation(accessToken);
  } catch (error) {
    if (Number(error?.status) !== 401 || !text(input.refresh_token)) throw error;
    accessToken = await refreshAccessToken(input);
    if (!accessToken) throw error;
    const result = await operation(accessToken);
    return {
      ...result,
      output: {
        ...(result?.output || {}),
        token_refreshed: true,
      },
    };
  }
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

function isPrivateHostname(hostname) {
  const host = text(hostname).toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    return true;
  }
  if (host === "::" || host === "::1" || host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) {
    return true;
  }

  const parts = host.split(".").map((value) => Number(value));
  if (parts.length === 4 && parts.every((value) => Number.isInteger(value) && value >= 0 && value <= 255)) {
    const [a, b] = parts;
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
  }
  return false;
}

function verifiedRemoteUrl(value) {
  let url;
  try {
    url = new URL(text(value));
  } catch {
    throw new Error("X_MEDIA_URL_INVALID");
  }
  if (url.protocol !== "https:") throw new Error("X_MEDIA_URL_HTTPS_REQUIRED");
  if (isPrivateHostname(url.hostname)) throw new Error("X_MEDIA_URL_PRIVATE_HOST_BLOCKED");
  return url;
}

function mediaProfile(contentType) {
  const type = text(contentType).split(";")[0].toLowerCase();
  if (["image/jpeg", "image/png", "image/webp", "image/bmp", "image/pjpeg", "image/tiff"].includes(type)) {
    return { type, category: "tweet_image", kind: "image" };
  }
  if (type === "image/gif") {
    return { type, category: "tweet_gif", kind: "gif" };
  }
  if (["video/mp4", "video/webm", "video/mp2t", "video/quicktime"].includes(type)) {
    return { type, category: "tweet_video", kind: "video" };
  }
  throw new Error("X_MEDIA_CONTENT_TYPE_UNSUPPORTED");
}

function validateMediaSize(profile, size) {
  if (!Number.isFinite(size) || size <= 0) throw new Error("X_MEDIA_SIZE_INVALID");
  const limit = MEDIA_LIMITS[profile.category];
  if (limit && size > limit) throw new Error(`X_MEDIA_TOO_LARGE:${profile.category}`);
}

async function fetchRemoteMedia(value) {
  const requestedUrl = verifiedRemoteUrl(value);
  const response = await fetch(requestedUrl, {
    cache: "no-store",
    redirect: "follow",
    headers: { "Accept-Encoding": "identity" },
  });
  if (!response.ok) throw new Error(`X_MEDIA_FETCH_FAILED:${response.status}`);

  const finalUrl = verifiedRemoteUrl(response.url || requestedUrl.href);
  const profile = mediaProfile(response.headers.get("content-type"));
  const declaredSize = Number(response.headers.get("content-length"));

  if (Number.isFinite(declaredSize) && declaredSize > 0) {
    validateMediaSize(profile, declaredSize);
    if (!response.body) throw new Error("X_MEDIA_BODY_MISSING");
    return {
      url: finalUrl.href,
      profile,
      totalBytes: declaredSize,
      stream: response.body,
      buffer: null,
    };
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  validateMediaSize(profile, buffer.length);
  return {
    url: finalUrl.href,
    profile,
    totalBytes: buffer.length,
    stream: null,
    buffer,
  };
}

async function initializeUpload(accessToken, media) {
  const response = await fetch(`${API_BASE}/media/upload/initialize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      media_category: media.profile.category,
      media_type: media.profile.type,
      total_bytes: media.totalBytes,
      shared: false,
    }),
    cache: "no-store",
  });
  const payload = await parseResponse(response);
  const id = text(payload?.data?.id);
  if (!id) throw new Error("X_MEDIA_UPLOAD_ID_MISSING");
  return payload.data;
}

async function appendUpload(accessToken, mediaId, segmentIndex, chunk, contentType) {
  if (segmentIndex > 999) throw new Error("X_MEDIA_TOO_MANY_SEGMENTS");
  const body = new FormData();
  body.append("media", new Blob([chunk], { type: contentType }), "media.bin");
  body.append("segment_index", String(segmentIndex));

  const response = await fetch(
    `${API_BASE}/media/upload/${encodeURIComponent(mediaId)}/append`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body,
      cache: "no-store",
    },
  );
  await parseResponse(response);
}

async function appendBuffer(accessToken, mediaId, buffer, contentType) {
  let offset = 0;
  let segmentIndex = 0;
  while (offset < buffer.length) {
    const end = Math.min(offset + MEDIA_CHUNK_BYTES, buffer.length);
    await appendUpload(
      accessToken,
      mediaId,
      segmentIndex,
      buffer.subarray(offset, end),
      contentType,
    );
    offset = end;
    segmentIndex += 1;
  }
}

async function appendStream(accessToken, mediaId, stream, contentType, totalBytes) {
  const reader = stream.getReader();
  let pending = Buffer.alloc(0);
  let uploaded = 0;
  let segmentIndex = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (value?.length) {
      pending = pending.length
        ? Buffer.concat([pending, Buffer.from(value)])
        : Buffer.from(value);
    }

    while (pending.length >= MEDIA_CHUNK_BYTES) {
      const chunk = pending.subarray(0, MEDIA_CHUNK_BYTES);
      await appendUpload(accessToken, mediaId, segmentIndex, chunk, contentType);
      uploaded += chunk.length;
      segmentIndex += 1;
      pending = pending.subarray(MEDIA_CHUNK_BYTES);
    }

    if (done) break;
  }

  if (pending.length) {
    await appendUpload(accessToken, mediaId, segmentIndex, pending, contentType);
    uploaded += pending.length;
  }

  if (uploaded !== totalBytes) {
    throw new Error(`X_MEDIA_SIZE_CHANGED:${uploaded}:${totalBytes}`);
  }
}

async function finalizeUpload(accessToken, mediaId) {
  const response = await fetch(
    `${API_BASE}/media/upload/${encodeURIComponent(mediaId)}/finalize`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    },
  );
  const payload = await parseResponse(response);
  return payload.data || {};
}

async function mediaUploadStatus(accessToken, mediaId) {
  const url = new URL(`${API_BASE}/media/upload`);
  url.searchParams.set("media_id", mediaId);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const payload = await parseResponse(response);
  return payload.data || {};
}

async function waitForMedia(accessToken, mediaId, initial) {
  let current = initial || {};
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const info = current?.processing_info || null;
    const state = upper(info?.state);
    if (!state || state === "SUCCEEDED") return current;
    if (state === "FAILED") {
      throw new Error(info?.error?.message || "X_MEDIA_PROCESSING_FAILED");
    }

    const seconds = Number(info?.check_after_secs);
    const delay = Math.min(Math.max(Number.isFinite(seconds) ? seconds * 1000 : 1000, 500), 5000);
    await new Promise((resolve) => setTimeout(resolve, delay));
    current = await mediaUploadStatus(accessToken, mediaId);
  }
  throw new Error("X_MEDIA_PROCESSING_TIMEOUT");
}

async function setAltText(accessToken, mediaId, altText) {
  const value = text(altText).slice(0, 1000);
  if (!value) return;
  const response = await fetch(`${API_BASE}/media/metadata`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id: mediaId,
      metadata: { alt_text: { text: value } },
    }),
    cache: "no-store",
  });
  await parseResponse(response);
}

async function uploadRemoteMedia(accessToken, url, altText = null) {
  const media = await fetchRemoteMedia(url);
  const initialized = await initializeUpload(accessToken, media);
  const mediaId = text(initialized.id);

  if (media.buffer) {
    await appendBuffer(accessToken, mediaId, media.buffer, media.profile.type);
  } else {
    await appendStream(
      accessToken,
      mediaId,
      media.stream,
      media.profile.type,
      media.totalBytes,
    );
  }

  const finalized = await finalizeUpload(accessToken, mediaId);
  await waitForMedia(accessToken, mediaId, finalized);
  if (media.profile.kind === "image" && text(altText)) {
    await setAltText(accessToken, mediaId, altText);
  }

  return {
    id: mediaId,
    kind: media.profile.kind,
    content_type: media.profile.type,
    source_url: media.url,
  };
}

function remoteMediaRequests(input) {
  const imageUrls = unique([
    ...(Array.isArray(input.image_urls) ? input.image_urls : []),
    input.image_url,
  ]);
  const videoUrl = text(input.video_url);
  const mediaUrl = text(input.media_url);

  if (imageUrls.length > 4) throw new Error("X_MAX_FOUR_IMAGES");
  if (videoUrl && imageUrls.length) throw new Error("X_MIXED_IMAGE_VIDEO_NOT_SUPPORTED");
  if (videoUrl && mediaUrl && mediaUrl !== videoUrl) {
    throw new Error("X_MULTIPLE_VIDEO_MEDIA_NOT_SUPPORTED");
  }
  if (imageUrls.length && mediaUrl && !imageUrls.includes(mediaUrl)) {
    if (imageUrls.length >= 4) throw new Error("X_MAX_FOUR_IMAGES");
    imageUrls.push(mediaUrl);
  }

  if (videoUrl) return [{ url: videoUrl, altText: null }];
  if (imageUrls.length) {
    const altTexts = Array.isArray(input.alt_texts) ? input.alt_texts : [];
    return imageUrls.map((url, index) => ({
      url,
      altText: text(altTexts[index] || (index === 0 ? input.alt_text : null)) || null,
    }));
  }
  return mediaUrl ? [{ url: mediaUrl, altText: text(input.alt_text) || null }] : [];
}

async function resolveMediaIds(input, accessToken) {
  const existing = unique([
    ...(Array.isArray(input.media_ids) ? input.media_ids : []),
    input.media_id,
  ]).slice(0, 4);
  const requests = remoteMediaRequests(input);

  if (existing.length && requests.length) {
    throw new Error("X_EXISTING_AND_REMOTE_MEDIA_MIX_NOT_SUPPORTED");
  }
  if (existing.length) return { mediaIds: existing, uploaded: [] };
  if (!requests.length) return { mediaIds: [], uploaded: [] };

  const uploaded = [];
  for (const request of requests) {
    uploaded.push(await uploadRemoteMedia(accessToken, request.url, request.altText));
  }

  const nonImages = uploaded.filter((item) => item.kind !== "image");
  if (nonImages.length > 1 || (nonImages.length && uploaded.length > 1)) {
    throw new Error("X_POST_SUPPORTS_FOUR_IMAGES_OR_ONE_GIF_OR_VIDEO");
  }

  return {
    mediaIds: uploaded.map((item) => item.id),
    uploaded,
  };
}

function buildPostPayload(input, mediaIds) {
  const message = text(input.text || input.message || input.caption);
  if (!message && !mediaIds.length) throw new Error("X_POST_CONTENT_REQUIRED");

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

async function publish(input, accessToken) {
  const { mediaIds, uploaded } = await resolveMediaIds(input, accessToken);
  const payload = buildPostPayload(input, mediaIds);
  const created = await createPost(accessToken, payload);

  return {
    success: true,
    provider: "x",
    output: {
      id: created?.data?.id || null,
      text: created?.data?.text || payload.text || null,
      media_ids: mediaIds,
      uploaded_media: uploaded.map((item) => ({
        id: item.id,
        kind: item.kind,
        content_type: item.content_type,
      })),
    },
  };
}

export const XProvider = {
  id: "x",

  async execute(input = {}) {
    if (input.capability !== "marketing.x.publish") {
      throw new Error(`X capability not supported: ${input.capability}`);
    }
    return withRefresh(input, (accessToken) => publish(input, accessToken));
  },
};
