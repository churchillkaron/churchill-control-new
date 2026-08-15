import "./ThreadsCredentialRegistration.js";

const BASE_URL = "https://graph.threads.net/v1.0";

function text(value) {
  return String(value ?? "").trim();
}

async function graphPost(path, accessToken, values) {
  const response = await fetch(`${BASE_URL}/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(values),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.error) {
    throw new Error(
      payload?.error?.message ||
        payload?.message ||
        `THREADS_REQUEST_FAILED:${response.status}`,
    );
  }
  return payload;
}

async function containerStatus(containerId, accessToken) {
  const url = new URL(`${BASE_URL}/${encodeURIComponent(containerId)}`);
  url.searchParams.set("fields", "status,error_message");
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.error) {
    throw new Error(payload?.error?.message || "THREADS_CONTAINER_STATUS_FAILED");
  }
  return payload;
}

async function waitForContainer(containerId, accessToken) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const status = await containerStatus(containerId, accessToken);
    const state = text(status?.status).toUpperCase();
    if (!state || state === "FINISHED") return;
    if (state === "ERROR" || state === "EXPIRED") {
      throw new Error(status?.error_message || `THREADS_CONTAINER_${state}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error("THREADS_CONTAINER_NOT_READY");
}

async function publish({ accessToken, message, imageUrl, videoUrl, altText }) {
  const mediaType = videoUrl ? "VIDEO" : imageUrl ? "IMAGE" : "TEXT";
  const values = {
    media_type: mediaType,
    ...(text(message) ? { text: text(message) } : {}),
    ...(imageUrl ? { image_url: imageUrl } : {}),
    ...(videoUrl ? { video_url: videoUrl } : {}),
    ...(text(altText) ? { alt_text: text(altText) } : {}),
  };

  const container = await graphPost("me/threads", accessToken, values);
  if (!text(container?.id)) throw new Error("THREADS_CONTAINER_ID_MISSING");

  if (mediaType !== "TEXT") {
    await waitForContainer(container.id, accessToken);
  }

  const published = await graphPost("me/threads_publish", accessToken, {
    creation_id: container.id,
  });
  if (!text(published?.id)) throw new Error("THREADS_PUBLISHED_ID_MISSING");

  return {
    success: true,
    provider: "threads",
    output: {
      id: published.id,
      creation_id: container.id,
      media_type: mediaType,
    },
  };
}

export const ThreadsProvider = {
  id: "threads",

  async execute(input = {}) {
    if (input.capability !== "marketing.threads.publish") {
      throw new Error(`Threads capability not supported: ${input.capability}`);
    }
    const accessToken = text(input.access_token);
    if (!accessToken) throw new Error("THREADS_ACCESS_TOKEN_REQUIRED");

    const imageUrl = text(input.image_url || input.media_url);
    const videoUrl = text(input.video_url);
    const message = text(input.text || input.message || input.caption);
    if (!message && !imageUrl && !videoUrl) {
      throw new Error("THREADS_CONTENT_REQUIRED");
    }
    if (imageUrl && videoUrl) {
      throw new Error("THREADS_SINGLE_MEDIA_TYPE_REQUIRED");
    }

    return publish({
      accessToken,
      message,
      imageUrl: imageUrl || null,
      videoUrl: videoUrl || null,
      altText: input.alt_text || null,
    });
  },
};
