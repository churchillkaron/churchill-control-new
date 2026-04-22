const STORAGE_KEY = "scheduledCampaigns";

function safeParse(value, fallback) {
  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function canUseStorage() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function normalizePlatformStatus(platformStatus = {}) {
  return {
    instagram: platformStatus.instagram || "pending",
    facebook: platformStatus.facebook || "pending",
    google: platformStatus.google || "pending",
  };
}

function normalizeCampaign(campaign) {
  return {
    id: campaign.id || Date.now(),
    title: campaign.title || "Untitled Campaign",
    text: campaign.text || campaign.message || "",
    message: campaign.message || campaign.text || "",
    caption: campaign.caption || campaign.message || campaign.text || "",
    hashtags: campaign.hashtags || "",
    image: campaign.image || campaign.imageUrl || null,
    imageUrl: campaign.imageUrl || campaign.image || null,
    pageId: campaign.pageId || "",
    scheduledAt: campaign.scheduledAt || null,
    status: campaign.status || "scheduled",
    platformStatus: normalizePlatformStatus(campaign.platformStatus),
    createdAt: campaign.createdAt || new Date().toISOString(),
    publishedAt: campaign.publishedAt || null,
    error: campaign.error || null,
  };
}

export function getScheduledCampaigns() {
  if (!canUseStorage()) return [];
  const raw = localStorage.getItem(STORAGE_KEY);
  const parsed = safeParse(raw, []);
  return Array.isArray(parsed) ? parsed.map(normalizeCampaign) : [];
}

export function saveScheduledCampaigns(data) {
  if (!canUseStorage()) return;
  const normalized = Array.isArray(data) ? data.map(normalizeCampaign) : [];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
}

export function addScheduledCampaign(campaign) {
  const existing = getScheduledCampaigns();

  const newCampaign = normalizeCampaign({
    id: Date.now(),
    ...campaign,
    status: "scheduled",
    platformStatus: {
      instagram: "pending",
      facebook: "pending",
      google: "pending",
    },
    createdAt: new Date().toISOString(),
  });

  const updated = [newCampaign, ...existing];
  saveScheduledCampaigns(updated);

  return newCampaign;
}

export function updateScheduledCampaign(id, updates) {
  const existing = getScheduledCampaigns();

  const updated = existing.map((item) =>
    item.id === id ? normalizeCampaign({ ...item, ...updates }) : item
  );

  saveScheduledCampaigns(updated);
  return updated;
}

export function markCampaignPublished(id, platform = null) {
  const existing = getScheduledCampaigns();

  const updated = existing.map((item) => {
    if (item.id !== id) return item;

    if (!platform) {
      return normalizeCampaign({
        ...item,
        status: "published",
        publishedAt: new Date().toISOString(),
      });
    }

    const nextPlatformStatus = {
      ...item.platformStatus,
      [platform]: "published",
    };

    const allRelevantPublished =
      nextPlatformStatus.facebook === "published" ||
      nextPlatformStatus.instagram === "published" ||
      nextPlatformStatus.google === "published";

    return normalizeCampaign({
      ...item,
      platformStatus: nextPlatformStatus,
      status: allRelevantPublished ? "published" : item.status,
      publishedAt: allRelevantPublished
        ? new Date().toISOString()
        : item.publishedAt,
    });
  });

  saveScheduledCampaigns(updated);
  return updated;
}

export function markCampaignFailed(id, platform = null, error = "Failed") {
  const existing = getScheduledCampaigns();

  const updated = existing.map((item) => {
    if (item.id !== id) return item;

    const nextPlatformStatus = platform
      ? { ...item.platformStatus, [platform]: "failed" }
      : item.platformStatus;

    return normalizeCampaign({
      ...item,
      status: "failed",
      platformStatus: nextPlatformStatus,
      error,
    });
  });

  saveScheduledCampaigns(updated);
  return updated;
}

function isPublicHttpUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

async function publishToMeta(campaign, platform) {
  const payload = {
    platform,
    pageId: campaign.pageId,
    message: campaign.message || campaign.text || "",
    caption: campaign.caption || campaign.message || campaign.text || "",
  };

  if (platform === "instagram" && isPublicHttpUrl(campaign.imageUrl)) {
    payload.imageUrl = campaign.imageUrl;
  }

  const response = await fetch("/api/meta/post", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(result.error || `Failed to publish to ${platform}`);
  }

  return result;
}

export async function runPostingEngine() {
  let campaigns = getScheduledCampaigns();
  const now = new Date();

  campaigns = campaigns.map((item) => {
    if (!item.scheduledAt) return item;

    const scheduledDate = new Date(item.scheduledAt);
    if (Number.isNaN(scheduledDate.getTime())) {
      return normalizeCampaign({
        ...item,
        status: "failed",
        error: "Invalid scheduled date",
      });
    }

    if (item.status === "scheduled" && scheduledDate <= now) {
      return normalizeCampaign({
        ...item,
        status: "ready",
      });
    }

    return item;
  });

  saveScheduledCampaigns(campaigns);

  for (const campaign of campaigns) {
    if (campaign.status !== "ready") continue;

    if (!campaign.pageId) {
      markCampaignFailed(campaign.id, "facebook", "Missing pageId");
      continue;
    }

    try {
      updateScheduledCampaign(campaign.id, {
        status: "publishing",
        error: null,
      });

      await publishToMeta(campaign, "facebook");
      markCampaignPublished(campaign.id, "facebook");

      const latest = getScheduledCampaigns().find((item) => item.id === campaign.id);

      if (latest && isPublicHttpUrl(latest.imageUrl)) {
        try {
          await publishToMeta(latest, "instagram");
          markCampaignPublished(latest.id, "instagram");
        } catch (instagramError) {
          markCampaignFailed(
            latest.id,
            "instagram",
            instagramError.message || "Instagram publish failed"
          );
        }
      }
    } catch (error) {
      markCampaignFailed(
        campaign.id,
        "facebook",
        error.message || "Facebook publish failed"
      );
    }
  }

  return getScheduledCampaigns();
}