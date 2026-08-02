import {
  publishFacebook,
  publishInstagram,
} from "@/lib/platform/contracts/marketing/MarketingPublishingContract";

const DEFAULT_GRAPH_VERSION = "v23.0";

function graphVersion() {
  return process.env.META_GRAPH_API_VERSION || DEFAULT_GRAPH_VERSION;
}

function normalizeAdAccountId(value) {
  const id = String(value || "").trim();
  if (!id) throw new Error("Meta ad account id is required");
  return id.startsWith("act_") ? id : `act_${id}`;
}

function appendFormValue(form, key, value) {
  if (value === undefined || value === null || value === "") return;
  form.set(key, typeof value === "object" ? JSON.stringify(value) : String(value));
}

async function graphRequest({ path, accessToken, method = "GET", params = {} }) {
  if (!accessToken) throw new Error("Meta access token is required");

  const url = new URL(
    `https://graph.facebook.com/${graphVersion()}/${String(path).replace(/^\//, "")}`
  );
  const options = {
    method,
    headers: { Authorization: `Bearer ${accessToken}` },
  };

  if (method === "GET") {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(
          key,
          typeof value === "object" ? JSON.stringify(value) : String(value)
        );
      }
    }
  } else {
    const form = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) appendFormValue(form, key, value);
    options.headers["Content-Type"] = "application/x-www-form-urlencoded";
    options.body = form;
  }

  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.error) {
    const message =
      payload?.error?.error_user_msg ||
      payload?.error?.message ||
      `Meta Graph API request failed (${response.status})`;
    const error = new Error(message);
    error.code = payload?.error?.code || response.status;
    error.subcode = payload?.error?.error_subcode || null;
    error.details = payload;
    throw error;
  }
  return payload;
}

async function uploadExactImage({ access_token, ad_account_id, image_url }) {
  const accountId = normalizeAdAccountId(ad_account_id);
  if (!image_url) throw new Error("Exact source image URL is required");

  const result = await graphRequest({
    path: `${accountId}/adimages`,
    method: "POST",
    accessToken: access_token,
    params: { url: image_url },
  });

  const image = Object.values(result?.images || {})[0];
  if (!image?.hash) {
    throw new Error("Meta did not return an image hash for the exact source asset");
  }

  return image;
}

async function createAdsBundle({
  access_token,
  ad_account_id,
  page_id,
  instagram_business_id = null,
  campaign = {},
  ad_set = {},
  creative = {},
  ad = {},
}) {
  const accountId = normalizeAdAccountId(ad_account_id);
  const safeStatus = "PAUSED";

  if (!page_id) throw new Error("Meta Facebook page id is required");
  if (!campaign.name) throw new Error("Campaign name is required");
  if (!creative.message) throw new Error("Ad message is required");
  if (!creative.image_url) throw new Error("Exact creative image is required");
  if (creative.exact_asset_locked !== true) {
    throw new Error("Meta creative must be locked to an exact organization asset");
  }

  const uploadedImage = await uploadExactImage({
    access_token,
    ad_account_id: accountId,
    image_url: creative.image_url,
  });

  const campaignResult = await graphRequest({
    path: `${accountId}/campaigns`,
    method: "POST",
    accessToken: access_token,
    params: {
      name: campaign.name,
      objective: campaign.objective || "OUTCOME_ENGAGEMENT",
      special_ad_categories: campaign.special_ad_categories || [],
      buying_type: campaign.buying_type || "AUCTION",
      status: safeStatus,
    },
  });

  try {
    const adSetResult = await graphRequest({
      path: `${accountId}/adsets`,
      method: "POST",
      accessToken: access_token,
      params: {
        name: ad_set.name || `${campaign.name} - Ad Set`,
        campaign_id: campaignResult.id,
        billing_event: ad_set.billing_event || "IMPRESSIONS",
        optimization_goal: ad_set.optimization_goal || "POST_ENGAGEMENT",
        bid_strategy: ad_set.bid_strategy || "LOWEST_COST_WITHOUT_CAP",
        daily_budget: ad_set.daily_budget,
        lifetime_budget: ad_set.lifetime_budget,
        start_time: ad_set.start_time,
        end_time: ad_set.end_time,
        targeting: ad_set.targeting,
        promoted_object: ad_set.promoted_object,
        destination_type: ad_set.destination_type,
        status: safeStatus,
      },
    });

    const objectStorySpec = {
      page_id,
      ...(instagram_business_id ? { instagram_actor_id: instagram_business_id } : {}),
      link_data: {
        message: creative.message,
        link: creative.link_url || "https://www.churchillkaron.com",
        image_hash: uploadedImage.hash,
        ...(creative.headline ? { name: creative.headline } : {}),
        ...(creative.description ? { description: creative.description } : {}),
        ...(creative.call_to_action
          ? {
              call_to_action: {
                type: creative.call_to_action,
                value: creative.call_to_action_value || { link: creative.link_url },
              },
            }
          : {}),
      },
    };

    const creativeResult = await graphRequest({
      path: `${accountId}/adcreatives`,
      method: "POST",
      accessToken: access_token,
      params: {
        name: creative.name || `${campaign.name} - Creative`,
        object_story_spec: objectStorySpec,
        degrees_of_freedom_spec: creative.degrees_of_freedom_spec,
      },
    });

    const adResult = await graphRequest({
      path: `${accountId}/ads`,
      method: "POST",
      accessToken: access_token,
      params: {
        name: ad.name || `${campaign.name} - Ad`,
        adset_id: adSetResult.id,
        creative: { creative_id: creativeResult.id },
        tracking_specs: ad.tracking_specs,
        status: safeStatus,
      },
    });

    return {
      success: true,
      provider: "meta",
      status: safeStatus,
      campaign_id: campaignResult.id,
      ad_set_id: adSetResult.id,
      creative_id: creativeResult.id,
      ad_id: adResult.id,
      image_hash: uploadedImage.hash,
      exact_asset_locked: true,
      source_asset_id: creative.source_asset_id || null,
    };
  } catch (error) {
    await graphRequest({
      path: campaignResult.id,
      method: "POST",
      accessToken: access_token,
      params: { status: "PAUSED" },
    }).catch(() => null);
    error.partial = { campaign_id: campaignResult.id, status: safeStatus };
    throw error;
  }
}

async function listAdAccounts({ access_token }) {
  return graphRequest({
    path: "me/adaccounts",
    accessToken: access_token,
    params: {
      fields: "id,name,account_id,account_status,currency,timezone_name,business",
      limit: 100,
    },
  });
}

async function updateAdObjectStatus({ access_token, object_id, status }) {
  const safeStatus = String(status || "").toUpperCase();
  if (!["ACTIVE", "PAUSED", "ARCHIVED"].includes(safeStatus)) {
    throw new Error("Unsupported Meta ad status");
  }
  return graphRequest({
    path: object_id,
    method: "POST",
    accessToken: access_token,
    params: { status: safeStatus },
  });
}

export const MetaProvider = {
  id: "meta",

  async execute({
    capability,
    page_id,
    instagram_business_id,
    access_token,
    message,
    image_url,
    organization_id,
    action,
    ad_account_id,
    campaign,
    ad_set,
    creative,
    ad,
    object_id,
    status,
  } = {}) {
    switch (capability) {
      case "marketing.facebook.publish":
      case "marketing.social.publish":
        return publishFacebook({
          organization_id,
          pageId: page_id,
          pageToken: access_token,
          message,
          imageUrl: image_url,
        });

      case "marketing.instagram.publish":
        return publishInstagram({
          organization_id,
          instagramBusinessId: instagram_business_id,
          accessToken: access_token,
          imageUrl: image_url,
          caption: message,
        });

      case "marketing.social.analytics":
        return getAnalytics({ post_id: page_id, access_token });

      case "marketing.social.delete":
        return deletePost({ access_token, post_id: page_id });

      case "marketing.ads.manage":
        switch (action) {
          case "list_ad_accounts":
            return listAdAccounts({ access_token });
          case "create_campaign_bundle":
            return createAdsBundle({
              access_token,
              ad_account_id,
              page_id,
              instagram_business_id,
              campaign,
              ad_set,
              creative,
              ad,
            });
          case "update_status":
            return updateAdObjectStatus({ access_token, object_id, status });
          default:
            throw new Error(`Meta Ads action not supported: ${action || "missing"}`);
        }

      default:
        throw new Error(`Meta capability not supported: ${capability}`);
    }
  },
};

async function deletePost({ access_token, post_id }) {
  return graphRequest({ path: post_id, method: "DELETE", accessToken: access_token });
}

async function getAnalytics({ post_id, access_token }) {
  return graphRequest({
    path: `${post_id}/insights`,
    accessToken: access_token,
    params: { metric: "likes,comments,shares,reach,impressions,saved" },
  });
}
