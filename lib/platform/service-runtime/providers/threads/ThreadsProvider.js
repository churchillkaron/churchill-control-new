import { save as saveCredential } from "@/lib/platform/service-runtime/credentials/repositories/CredentialRepository";
import "./ThreadsCredentialRegistration.js";

const BASE_URL = "https://graph.threads.net/v1.0";
const TOKEN_BASE_URL = "https://graph.threads.net";
const REFRESH_BEFORE_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_LONG_LIVED_SECONDS = 60 * 24 * 60 * 60;

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function bool(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function csv(values) {
  return [...new Set((Array.isArray(values) ? values : [values]).map(text).filter(Boolean))].join(",");
}

async function graphRequest(path, accessToken, { method = "GET", params = {} } = {}) {
  const url = new URL(`${BASE_URL}/${path}`);
  const normalized = Object.entries(params).filter(([, value]) => value !== undefined && value !== null && text(value) !== "");
  for (const [key, value] of normalized) {
    url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.error) {
    const error = new Error(
      payload?.error?.message || payload?.message || `THREADS_REQUEST_FAILED:${response.status}`,
    );
    error.status = response.status;
    error.code = payload?.error?.code || null;
    throw error;
  }
  return payload;
}

async function graphPost(path, accessToken, values) {
  const response = await fetch(`${BASE_URL}/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(
      Object.fromEntries(
        Object.entries(values || {}).filter(([, value]) => value !== undefined && value !== null && text(value) !== ""),
      ),
    ),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.error) {
    const error = new Error(
      payload?.error?.message || payload?.message || `THREADS_REQUEST_FAILED:${response.status}`,
    );
    error.status = response.status;
    error.code = payload?.error?.code || null;
    throw error;
  }
  return payload;
}

function tokenExpiry(input) {
  const explicit = Date.parse(text(input.token_expires_at));
  if (Number.isFinite(explicit)) return explicit;

  const obtained = Date.parse(text(input.token_obtained_at || input.credential_updated_at));
  const expiresIn = Number(input.expires_in);
  if (Number.isFinite(obtained) && Number.isFinite(expiresIn) && expiresIn > 0) {
    return obtained + expiresIn * 1000;
  }
  return null;
}

function shouldRefreshToken(input) {
  if (text(input.token_lifecycle).toUpperCase() !== "THREADS_LONG_LIVED") return false;
  const expiresAt = tokenExpiry(input);
  return Number.isFinite(expiresAt) && expiresAt - Date.now() <= REFRESH_BEFORE_MS;
}

async function persistRefreshedToken(input, payload) {
  const credentialId = text(input.credential_id);
  if (!credentialId) return;

  const obtainedAt = new Date();
  const expiresIn = Number(payload?.expires_in) || Number(input.expires_in) || DEFAULT_LONG_LIVED_SECONDS;
  const secret = {
    access_token: payload.access_token,
    token_type: payload.token_type || input.token_type || "bearer",
    expires_in: expiresIn,
    token_lifecycle: "THREADS_LONG_LIVED",
    token_obtained_at: obtainedAt.toISOString(),
    token_expires_at: new Date(obtainedAt.getTime() + expiresIn * 1000).toISOString(),
  };

  await saveCredential({
    id: credentialId,
    provider_id: "threads",
    credential_type: "oauth_token",
    secret_reference: JSON.stringify(secret),
    metadata: {
      organization_id: input.context?.organization_id || null,
      purpose: "ORGANIZATION_SOCIAL_CONNECTION",
      external_account_id: input.external_account_id || null,
      username: input.username || null,
      enabled: true,
      token_refreshed_at: obtainedAt.toISOString(),
    },
    status: "ACTIVE",
  });
}

async function refreshAccessToken(input, currentAccessToken) {
  const accessToken = text(currentAccessToken || input.access_token);
  if (!accessToken) throw new Error("THREADS_ACCESS_TOKEN_REQUIRED");

  const url = new URL(`${TOKEN_BASE_URL}/refresh_access_token`);
  url.searchParams.set("grant_type", "th_refresh_token");
  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url, { cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !text(payload?.access_token)) {
    const error = new Error(payload?.error?.message || payload?.message || "THREADS_TOKEN_REFRESH_FAILED");
    error.status = response.status;
    throw error;
  }
  await persistRefreshedToken(input, payload);
  return payload.access_token;
}

async function withToken(input, operation) {
  let accessToken = text(input.access_token);
  if (!accessToken) throw new Error("THREADS_ACCESS_TOKEN_REQUIRED");
  let refreshed = false;

  if (shouldRefreshToken(input)) {
    accessToken = await refreshAccessToken(input, accessToken);
    refreshed = true;
  }

  try {
    const result = await operation(accessToken);
    return refreshed
      ? { ...result, output: { ...(result?.output || {}), token_refreshed: true } }
      : result;
  } catch (error) {
    if (Number(error?.status) !== 401 || refreshed) throw error;
    accessToken = await refreshAccessToken(input, accessToken);
    const result = await operation(accessToken);
    return { ...result, output: { ...(result?.output || {}), token_refreshed: true } };
  }
}

async function containerStatus(containerId, accessToken) {
  return graphRequest(encodeURIComponent(containerId), accessToken, {
    params: { fields: "status,error_message" },
  });
}

async function waitForContainer(containerId, accessToken) {
  for (let attempt = 0; attempt < 14; attempt += 1) {
    const status = await containerStatus(containerId, accessToken);
    const state = text(status?.status).toUpperCase();
    if (!state || state === "FINISHED") return status;
    if (state === "ERROR" || state === "EXPIRED") {
      throw new Error(status?.error_message || `THREADS_CONTAINER_${state}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error("THREADS_CONTAINER_NOT_READY");
}

function commonPostValues(input) {
  return {
    ...(text(input.reply_control) ? { reply_control: text(input.reply_control) } : {}),
    ...(text(input.reply_to_id) ? { reply_to_id: text(input.reply_to_id) } : {}),
    ...(text(input.topic_tag) ? { topic_tag: text(input.topic_tag) } : {}),
    ...(text(input.location_id) ? { location_id: text(input.location_id) } : {}),
    ...(input.is_spoiler_media === true ? { is_spoiler_media: "true" } : {}),
    ...(Array.isArray(input.text_entities) && input.text_entities.length
      ? { text_entities: JSON.stringify(input.text_entities) }
      : {}),
  };
}

async function publishContainer(accessToken, containerId, mediaType, childIds = []) {
  const published = await graphPost("me/threads_publish", accessToken, {
    creation_id: containerId,
  });
  if (!text(published?.id)) throw new Error("THREADS_PUBLISHED_ID_MISSING");

  return {
    success: true,
    provider: "threads",
    output: {
      id: published.id,
      creation_id: containerId,
      media_type: mediaType,
      ...(childIds.length ? { child_creation_ids: childIds } : {}),
    },
  };
}

async function publishSingle(input, accessToken) {
  const imageUrl = text(input.image_url || input.media_url);
  const videoUrl = text(input.video_url);
  const message = text(input.text || input.message || input.caption);
  if (!message && !imageUrl && !videoUrl) throw new Error("THREADS_CONTENT_REQUIRED");
  if (imageUrl && videoUrl) throw new Error("THREADS_SINGLE_MEDIA_TYPE_REQUIRED");

  const mediaType = videoUrl ? "VIDEO" : imageUrl ? "IMAGE" : "TEXT";
  const container = await graphPost("me/threads", accessToken, {
    media_type: mediaType,
    ...(message ? { text: message } : {}),
    ...(imageUrl ? { image_url: imageUrl } : {}),
    ...(videoUrl ? { video_url: videoUrl } : {}),
    ...(text(input.alt_text) ? { alt_text: text(input.alt_text) } : {}),
    ...commonPostValues(input),
  });
  if (!text(container?.id)) throw new Error("THREADS_CONTAINER_ID_MISSING");

  if (mediaType !== "TEXT") await waitForContainer(container.id, accessToken);
  return publishContainer(accessToken, container.id, mediaType);
}

function carouselItems(input) {
  const raw = Array.isArray(input.carousel_items)
    ? input.carousel_items
    : [
        ...(Array.isArray(input.image_urls) ? input.image_urls.map((url) => ({ image_url: url })) : []),
        ...(Array.isArray(input.video_urls) ? input.video_urls.map((url) => ({ video_url: url })) : []),
      ];

  const items = raw.map((entry) => {
    if (typeof entry === "string") return { image_url: text(entry) };
    return object(entry);
  }).filter((entry) => text(entry.image_url || entry.video_url));

  if (items.length < 2 || items.length > 20) {
    throw new Error("THREADS_CAROUSEL_REQUIRES_2_TO_20_ITEMS");
  }
  return items;
}

async function createCarouselItem(accessToken, item) {
  const imageUrl = text(item.image_url);
  const videoUrl = text(item.video_url);
  if (Boolean(imageUrl) === Boolean(videoUrl)) {
    throw new Error("THREADS_CAROUSEL_ITEM_REQUIRES_ONE_MEDIA_TYPE");
  }
  const mediaType = videoUrl ? "VIDEO" : "IMAGE";
  const container = await graphPost("me/threads", accessToken, {
    media_type: mediaType,
    ...(imageUrl ? { image_url: imageUrl } : {}),
    ...(videoUrl ? { video_url: videoUrl } : {}),
    is_carousel_item: "true",
    ...(text(item.alt_text) ? { alt_text: text(item.alt_text) } : {}),
  });
  if (!text(container?.id)) throw new Error("THREADS_CAROUSEL_ITEM_ID_MISSING");
  await waitForContainer(container.id, accessToken);
  return container.id;
}

async function publishCarousel(input, accessToken) {
  const items = carouselItems(input);
  const children = [];
  for (const item of items) {
    children.push(await createCarouselItem(accessToken, item));
  }

  const container = await graphPost("me/threads", accessToken, {
    media_type: "CAROUSEL",
    children: children.join(","),
    ...(text(input.text || input.message || input.caption)
      ? { text: text(input.text || input.message || input.caption) }
      : {}),
    ...commonPostValues(input),
  });
  if (!text(container?.id)) throw new Error("THREADS_CAROUSEL_CONTAINER_ID_MISSING");
  await waitForContainer(container.id, accessToken);
  return publishContainer(accessToken, container.id, "CAROUSEL", children);
}

async function readReplies(input, accessToken) {
  const threadId = text(input.thread_id || input.post_id || input.media_id);
  if (!threadId) throw new Error("THREADS_THREAD_ID_REQUIRED");
  const fields = csv(
    input.fields || [
      "id",
      "text",
      "timestamp",
      "media_product_type",
      "media_type",
      "media_url",
      "gif_url",
      "permalink",
      "username",
      "has_replies",
      "is_reply",
      "root_post",
      "replied_to",
      "is_reply_owned_by_me",
      "hide_status",
    ],
  );
  const payload = await graphRequest(`${encodeURIComponent(threadId)}/replies`, accessToken, {
    params: {
      fields,
      reverse: bool(input.reverse, true) ? "true" : "false",
      ...(text(input.after) ? { after: text(input.after) } : {}),
      ...(text(input.before) ? { before: text(input.before) } : {}),
      ...(Number.isFinite(Number(input.limit)) ? { limit: Math.min(Math.max(Number(input.limit), 1), 100) } : {}),
    },
  });
  return { success: true, provider: "threads", output: payload };
}

async function manageReply(input, accessToken) {
  const replyId = text(input.reply_id || input.thread_id || input.media_id);
  if (!replyId) throw new Error("THREADS_REPLY_ID_REQUIRED");
  if (typeof input.hide !== "boolean") throw new Error("THREADS_REPLY_HIDE_BOOLEAN_REQUIRED");
  const payload = await graphRequest(`${encodeURIComponent(replyId)}/manage_reply`, accessToken, {
    method: "POST",
    params: { hide: input.hide ? "true" : "false" },
  });
  return {
    success: payload?.success !== false,
    provider: "threads",
    output: { reply_id: replyId, hidden: input.hide, ...object(payload) },
  };
}

async function postInsights(input, accessToken) {
  const threadId = text(input.thread_id || input.post_id || input.media_id);
  if (!threadId) throw new Error("THREADS_THREAD_ID_REQUIRED");
  const metrics = csv(input.metrics || ["views", "likes", "replies", "reposts", "quotes", "shares"]);
  const payload = await graphRequest(`${encodeURIComponent(threadId)}/insights`, accessToken, {
    params: {
      metric: metrics,
      ...(text(input.since) ? { since: text(input.since) } : {}),
      ...(text(input.until) ? { until: text(input.until) } : {}),
    },
  });
  return { success: true, provider: "threads", output: payload };
}

async function accountInsights(input, accessToken) {
  const metrics = csv(
    input.metrics || ["views", "likes", "replies", "reposts", "quotes", "clicks", "followers_count"],
  );
  const payload = await graphRequest("me/threads_insights", accessToken, {
    params: {
      metric: metrics,
      ...(text(input.breakdown) ? { breakdown: text(input.breakdown) } : {}),
      ...(text(input.since) ? { since: text(input.since) } : {}),
      ...(text(input.until) ? { until: text(input.until) } : {}),
    },
  });
  return { success: true, provider: "threads", output: payload };
}

export const ThreadsProvider = {
  id: "threads",

  async execute(input = {}) {
    const capability = text(input.capability);

    if (capability === "marketing.threads.publish") {
      return withToken(input, (token) =>
        Array.isArray(input.carousel_items) ||
        (Array.isArray(input.image_urls) && input.image_urls.length > 1) ||
        (Array.isArray(input.video_urls) && input.video_urls.length > 1)
          ? publishCarousel(input, token)
          : publishSingle(input, token),
      );
    }

    if (capability === "marketing.threads.replies.read") {
      return withToken(input, (token) => readReplies(input, token));
    }

    if (capability === "marketing.threads.reply.manage") {
      return withToken(input, (token) => manageReply(input, token));
    }

    if (capability === "marketing.threads.insights.read") {
      return withToken(input, (token) => postInsights(input, token));
    }

    if (capability === "marketing.threads.account.insights.read") {
      return withToken(input, (token) => accountInsights(input, token));
    }

    throw new Error(`Threads capability not supported: ${capability}`);
  },
};
