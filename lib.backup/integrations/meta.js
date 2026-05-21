const META_GRAPH_BASE = "https://graph.facebook.com";
const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v23.0";

function buildUrl(path) {
  const cleanPath = String(path || "").replace(/^\/+/, "");
  return `${META_GRAPH_BASE}/${META_GRAPH_VERSION}/${cleanPath}`;
}

async function parseMetaResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const data = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const error =
      typeof data === "object" && data && data.error
        ? data.error
        : { message: typeof data === "string" ? data : "Meta request failed" };

    const message = error.message || "Meta request failed";
    const code = error.code || response.status;

    const err = new Error(message);
    err.status = response.status;
    err.code = code;
    err.details = data;
    throw err;
  }

  return data;
}

export async function metaGet(path, params = {}) {
  const url = new URL(buildUrl(path));

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  const response = await fetch(url.toString(), {
    method: "GET",
    cache: "no-store",
  });

  return parseMetaResponse(response);
}

export async function metaPost(path, body = {}) {
  const form = new URLSearchParams();

  Object.entries(body).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      form.set(key, String(value));
    }
  });

  const response = await fetch(buildUrl(path), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
    cache: "no-store",
  });

  return parseMetaResponse(response);
}

export async function getFacebookPages(userAccessToken) {
  return metaGet("me/accounts", {
    fields:
      "id,name,access_token,instagram_business_account{id,username,profile_picture_url}",
    access_token: userAccessToken,
  });
}

export async function getInstagramBusinessAccount(pageId, pageAccessToken) {
  return metaGet(pageId, {
    fields: "instagram_business_account{id,username,profile_picture_url}",
    access_token: pageAccessToken,
  });
}

export async function publishFacebookFeedPost({ pageId, pageToken, message, link }) {
  return metaPost(`${pageId}/feed`, {
    access_token: pageToken,
    message,
    link,
  });
}

export async function createInstagramMediaContainer({
  igUserId,
  pageToken,
  caption,
  imageUrl,
}) {
  return metaPost(`${igUserId}/media`, {
    access_token: pageToken,
    image_url: imageUrl,
    caption,
  });
}

export async function publishInstagramMedia({
  igUserId,
  pageToken,
  creationId,
}) {
  return metaPost(`${igUserId}/media_publish`, {
    access_token: pageToken,
    creation_id: creationId,
  });
}

export function getMetaUserId({ bodyUserId, cookieUserId, headerUserId }) {
  return bodyUserId || cookieUserId || headerUserId || "local-admin";
}