function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function publicHttpsUrl(value) {
  const raw = text(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase();
    if (!host || host === "localhost" || host.endsWith(".local") || host === "127.0.0.1" || host === "::1") return null;
    const parts = host.split(".").map(Number);
    if (parts.length === 4 && parts.every(Number.isFinite)) {
      const [a,b] = parts;
      if (a===10 || a===127 || a===0 || (a===169&&b===254) || (a===192&&b===168) || (a===172&&b>=16&&b<=31)) return null;
    }
    return url.toString();
  } catch { return null; }
}

function executionError({ code, message, correction = null, details = null }) {
  const error = new Error(message);
  error.name = "CampaignExecutionError";
  error.stage = "ORGANIC_SOCIAL_TRANSLATION";
  error.code = code;
  error.provider = "organic_social";
  error.correction = correction;
  error.details = details;
  error.status = 400;
  return error;
}

const NETWORKS = Object.freeze({
  facebook: {
    service_id: "facebook",
    provider_id: "meta",
    credential_provider: "facebook_messenger",
    capability: "marketing.facebook.publish",
    asset_provider: "meta",
    asset_type: "facebook_page",
  },
  instagram: {
    service_id: "instagram",
    provider_id: "meta",
    credential_provider: "instagram_messaging",
    capability: "marketing.instagram.publish",
    asset_provider: "meta",
    asset_type: "instagram_business",
  },
  pinterest: {
    service_id: "pinterest",
    provider_id: "pinterest",
    capability: "marketing.pinterest.publish",
    asset_provider: "pinterest",
    asset_type: "pinterest_account",
  },
  youtube: {
    service_id: "youtube",
    provider_id: "youtube",
    capability: "marketing.youtube.publish",
    asset_provider: "youtube",
    asset_type: "youtube_channel",
  },
  linkedin: {
    service_id: "linkedin",
    provider_id: "linkedin",
    capability: "marketing.linkedin.publish",
    asset_provider: "linkedin",
    asset_type: "linkedin_identity",
  },
  threads: {
    service_id: "threads",
    provider_id: "threads",
    capability: "marketing.threads.publish",
    asset_provider: "threads",
    asset_type: "threads_profile",
  },
  tiktok: {
    service_id: "tiktok",
    provider_id: "tiktok",
    capability: "marketing.tiktok.publish",
    asset_provider: "tiktok",
    asset_type: "tiktok_account",
  },
  google_business: {
    service_id: "google-business",
    provider_id: "google",
    capability: "marketing.google.business.publish",
    asset_provider: "google",
    asset_type: "google_business_location",
  },
  x: {
    service_id: "x",
    provider_id: "x",
    capability: "marketing.x.publish",
    asset_provider: "x",
    asset_type: "x_account",
  },
});

export const ORGANIC_SOCIAL_EXECUTABLE_NETWORKS = Object.freeze(Object.keys(NETWORKS));

export function translateOrganicSocialCampaignPlan({ plan, channel }) {
  const requested = [...new Set(list(channel?.networks).map((value) => text(value).toLowerCase()).filter(Boolean))];
  if (!requested.length) {
    throw executionError({
      code: "ORGANIC_SOCIAL_NETWORK_REQUIRED",
      message: "Organic social execution requires at least one supported network",
      correction: "Select Facebook, Instagram, Pinterest, YouTube, LinkedIn, Threads, TikTok, X or Google Business for the current governed organic adapter.",
    });
  }

  const unsupported = requested.filter((network) => !NETWORKS[network]);
  if (unsupported.length) {
    throw executionError({
      code: "ORGANIC_SOCIAL_NETWORK_UNSUPPORTED",
      message: `Organic social execution is not yet enabled for: ${unsupported.join(", ")}`,
      correction: "Use Facebook, Instagram, Pinterest, YouTube, LinkedIn, Threads, TikTok, X or Google Business. Other connected networks remain planning-only until their campaign adapter is certified.",
      details: { unsupported_networks: unsupported },
    });
  }

  const networkSettings = channel?.provider_settings?.network_settings || {};
  const defaultMessage = text(plan?.creative?.primary_text);
  const destinations = requested.map((network) => {
    const config = NETWORKS[network];
    const settings = networkSettings?.[network] || {};
    const accountAssetId = text(settings.account_asset_id);
    const message = text(settings.message || defaultMessage);

    if (!accountAssetId) {
      throw executionError({
        code: "ORGANIC_SOCIAL_ACCOUNT_REQUIRED",
        message: `${network} requires a selected organization publishing account`,
        correction: `Select the connected ${network} account in Channel settings.`,
        details: { network },
      });
    }
    if (!message && !["youtube", "pinterest"].includes(network)) {
      throw executionError({
        code: "ORGANIC_SOCIAL_MESSAGE_REQUIRED",
        message: `${network} requires publication text`,
        correction: "Add a channel-specific message or a campaign core message.",
        details: { network },
      });
    }
    if (network === "youtube" && !text(settings.title)) {
      throw executionError({
        code: "YOUTUBE_TITLE_REQUIRED",
        message: "YouTube requires a video title",
        correction: "Add a YouTube video title before approval.",
        details: { network },
      });
    }
    if (network === "youtube") {
      if (text(settings.title).length > 100) throw executionError({ code: "YOUTUBE_TITLE_TOO_LONG", message: "YouTube title cannot exceed 100 characters", correction: "Shorten the YouTube title before approval.", details: { network } });
      if (text(settings.description).length > 5000) throw executionError({ code: "YOUTUBE_DESCRIPTION_TOO_LONG", message: "YouTube description cannot exceed 5000 characters", correction: "Shorten the YouTube description before approval.", details: { network } });
    }
    if (network === "pinterest") {
      if (!text(settings.board_id)) {
        throw executionError({
          code: "PINTEREST_BOARD_REQUIRED",
          message: "Pinterest requires a selected board",
          correction: "Load the connected Pinterest boards and choose one before approval.",
          details: { network },
        });
      }
      if (text(settings.title).length > 100) throw executionError({ code: "PINTEREST_TITLE_TOO_LONG", message: "Pinterest title cannot exceed 100 characters", correction: "Shorten the Pin title before approval.", details: { network } });
      if (text(settings.description).length > 800) throw executionError({ code: "PINTEREST_DESCRIPTION_TOO_LONG", message: "Pinterest description cannot exceed 800 characters", correction: "Shorten the Pin description before approval.", details: { network } });
      if (text(settings.destination_url) && !publicHttpsUrl(settings.destination_url)) throw executionError({ code: "PINTEREST_PUBLIC_HTTPS_LINK_REQUIRED", message: "Pinterest destination link must be a public HTTPS URL", correction: "Use a public HTTPS destination link or leave the link empty.", details: { network } });
    }

    return {
      network,
      ...config,
      account_asset_id: accountAssetId,
      creative_asset_id: text(settings.creative_asset_id) || null,
      alt_text: text(settings.alt_text) || null,
      reply_control: text(settings.reply_control) || null,
      topic_tag: text(settings.topic_tag) || null,
      is_spoiler_media: settings.is_spoiler_media === true,
      language_code: text(settings.language_code) || null,
      call_to_action_type: text(settings.call_to_action_type) || null,
      privacy_level: text(settings.privacy_level) || null,
      creator_consent: settings.creator_consent === true,
      disable_duet: settings.disable_duet === true,
      disable_comment: settings.disable_comment === true,
      disable_stitch: settings.disable_stitch === true,
      brand_organic_toggle: settings.brand_organic_toggle === true,
      is_aigc: settings.is_aigc === true,
      board_id: text(settings.board_id) || null,
      title: text(settings.title) || null,
      description: text(settings.description) || null,
      privacy_status: text(settings.privacy_status) || null,
      tags: list(settings.tags).map(text).filter(Boolean),
      category_id: text(settings.category_id) || null,
      made_for_kids: settings.made_for_kids === true,
      message,
      destination_url: text(settings.destination_url || plan?.creative?.destination_url) || null,
    };
  });

  return {
    channel_id: "organic_social",
    execution_mode: "DIRECT_PUBLISH_AFTER_OWNER_APPROVAL",
    destinations,
  };
}

export default translateOrganicSocialCampaignPlan;
