import {
  publishFacebook,
  publishInstagram,
} from "@/lib/platform/contracts/marketing/MarketingPublishingContract";

function required(value, code) {
  if (!String(value || "").trim()) throw new Error(code);
}

function normalizePublishResult(result = {}, platform) {
  if (result?.success === false) {
    return {
      success: false,
      provider: "meta",
      platform,
      error: String(result.error || "META_PUBLISH_FAILED").slice(0, 500),
    };
  }

  const externalId =
    result.post_id ||
    result.postId ||
    result.id ||
    result.response?.id ||
    null;
  if (!externalId) throw new Error("META_EXTERNAL_PUBLICATION_ID_REQUIRED");

  return {
    success: true,
    provider: "meta",
    platform,
    output: {
      id: String(externalId),
      post_id: String(externalId),
      status: "published",
    },
  };
}

export const MetaProvider = {
  id: "meta",

  validateInput({
    capability,
    page_id,
    instagram_business_id,
    access_token,
    image_url,
    video_url,
    audio_url,
  } = {}) {
    required(access_token, "META_ACCESS_TOKEN_REQUIRED");
    if (video_url) throw new Error("META_VIDEO_PUBLISH_NOT_IMPLEMENTED");
    if (audio_url) throw new Error("META_AUDIO_PUBLISH_NOT_IMPLEMENTED");

    switch (capability) {
      case "marketing.facebook.publish":
      case "marketing.social.publish":
        required(page_id, "META_PAGE_ID_REQUIRED");
        required(image_url, "META_IMAGE_URL_REQUIRED");
        return true;
      case "marketing.instagram.publish":
        required(instagram_business_id, "META_INSTAGRAM_BUSINESS_ID_REQUIRED");
        required(image_url, "META_IMAGE_URL_REQUIRED");
        return true;
      default:
        return true;
    }
  },

  async execute({
    capability,
    page_id,
    instagram_business_id,
    access_token,
    message,
    image_url,
    organization_id,
  } = {}) {
    switch (capability) {
      case "marketing.facebook.publish":
      case "marketing.social.publish": {
        const result = await publishFacebook({
          organization_id,
          pageId: page_id,
          pageToken: access_token,
          caption: message || "",
          imageUrl: image_url,
        });
        return normalizePublishResult(result, "facebook");
      }

      case "marketing.instagram.publish": {
        const result = await publishInstagram({
          organization_id,
          instagramBusinessId: instagram_business_id,
          accessToken: access_token,
          imageUrl: image_url,
          caption: message || "",
        });
        return normalizePublishResult(result, "instagram");
      }

      case "marketing.ads.manage":
        throw new Error("META_ADS_PROVIDER_NOT_IMPLEMENTED");

      default:
        throw new Error(`Meta capability not supported: ${capability}`);
    }
  },
};