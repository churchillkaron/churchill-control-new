import {
  google,
} from "googleapis";

import {
  ProviderEventRuntime,
} from "@/lib/platform/service-runtime/events/runtime/ProviderEventRuntime";

function required(value, code) {
  if (!String(value || "").trim()) throw new Error(code);
}

function safeProviderMessage(result, fallback) {
  return String(result?.error?.message || fallback).slice(0, 500);
}

export const GoogleProvider = {
  id: "google",

  validateInput({
    capability,
    access_token,
    location_id,
    summary,
    text,
    image_url,
    video_url,
    audio_url,
  } = {}) {
    required(access_token, "GOOGLE_ACCESS_TOKEN_REQUIRED");

    if (capability === "marketing.google.business.publish") {
      required(location_id, "GOOGLE_LOCATION_ID_REQUIRED");
      required(summary || text, "GOOGLE_BUSINESS_SUMMARY_REQUIRED");
      required(image_url, "GOOGLE_BUSINESS_IMAGE_URL_REQUIRED");
      if (video_url) throw new Error("GOOGLE_BUSINESS_VIDEO_PUBLISH_NOT_IMPLEMENTED");
      if (audio_url) throw new Error("GOOGLE_BUSINESS_AUDIO_PUBLISH_NOT_IMPLEMENTED");
    }
    return true;
  },

  async execute({
    capability,
    access_token,
    refresh_token,
    payload = {},
    organization_id,
    location_id,
    summary,
    text,
    image_url,
  } = {}) {
    if (!access_token) throw new Error("GOOGLE_ACCESS_TOKEN_REQUIRED");

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
          location_id: location_id || payload.location_id,
          access_token,
          summary: summary || text || payload.summary || payload.text,
          image_url: image_url || payload.image_url,
        });

      case "marketing.google.ads.manage":
        throw new Error("GOOGLE_ADS_PROVIDER_NOT_IMPLEMENTED");

      default:
        throw new Error(`Google capability not supported: ${capability}`);
    }
  },
};

async function googleDrive({
  access_token,
  refresh_token,
}) {
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
  image_url,
}) {
  required(location_id, "GOOGLE_LOCATION_ID_REQUIRED");
  required(summary, "GOOGLE_BUSINESS_SUMMARY_REQUIRED");
  required(image_url, "GOOGLE_BUSINESS_IMAGE_URL_REQUIRED");

  const response = await fetch(
    `https://mybusiness.googleapis.com/v4/${location_id}/localPosts`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        languageCode: "en",
        summary,
        topicType: "STANDARD",
        media: [
          {
            mediaFormat: "PHOTO",
            sourceUrl: image_url,
          },
        ],
      }),
    },
  );

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      safeProviderMessage(result, "GOOGLE_BUSINESS_PUBLISH_FAILED"),
    );
  }

  const externalId = String(result?.name || "").trim();
  if (!externalId) {
    throw new Error("GOOGLE_EXTERNAL_PUBLICATION_ID_REQUIRED");
  }

  await ProviderEventRuntime.record({
    organization_id,
    provider_id: "google",
    event_type: "GOOGLE_BUSINESS_POST_PUBLISHED",
    external_event_id: externalId,
    payload: {
      name: externalId,
      state: result?.state || null,
      create_time: result?.createTime || null,
      update_time: result?.updateTime || null,
    },
  }).catch(() => null);

  return {
    success: true,
    provider: "google",
    output: {
      id: externalId,
      name: externalId,
      status: "published",
    },
  };
}