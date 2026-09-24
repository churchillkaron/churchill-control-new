"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ImagePlus,
  Megaphone,
  RefreshCw,
  ShieldCheck,
  Target,
  Upload,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";

const CHANNEL_DISPLAY = {
  facebook: { label: "Facebook", logo: "/brand-icons/facebook.svg" },
  instagram: { label: "Instagram", logo: "/brand-icons/instagram.svg" },
  messenger: { label: "Messenger", logo: "/brand-icons/messenger.svg" },
  threads: { label: "Threads", logo: "/brand-icons/threads.svg" },
  tiktok: { label: "TikTok", logo: "/brand-icons/tiktok.svg" },
  youtube: { label: "YouTube", logo: "/brand-icons/youtube.svg" },
  linkedin: { label: "LinkedIn", logo: "/brand-icons/linkedin.svg" },
  x: { label: "X", logo: "/brand-icons/x.svg" },
  pinterest: { label: "Pinterest", logo: "/brand-icons/pinterest.svg" },
  whatsapp: { label: "WhatsApp Business", logo: "/brand-icons/whatsapp.svg" },
  line: { label: "LINE", logo: "/brand-icons/line.svg" },
  telegram: { label: "Telegram", logo: "/brand-icons/telegram.svg" },
  email: { label: "Email", logo: "/brand-icons/gmail.svg" },
  google_business: { label: "Google Business", logo: "/brand-icons/google.svg" },
  tripadvisor: { label: "Tripadvisor", logo: "/brand-icons/tripadvisor.svg" },
  meta_ads: { label: "Meta Ads", logo: "/brand-icons/meta.svg" },
  meta: { label: "Meta Ads", logo: "/brand-icons/meta.svg" },
  google_ads: { label: "Google Ads", logo: "/brand-icons/googleads.svg" },
  tiktok_ads: { label: "TikTok Ads", logo: "/brand-icons/tiktok.svg" },
  linkedin_ads: { label: "LinkedIn Ads", logo: "/brand-icons/linkedin.svg" },
  x_ads: { label: "X Ads", logo: "/brand-icons/x.svg" },
  line_ads: { label: "LINE Ads", logo: "/brand-icons/line.svg" },
  microsoft_ads: { label: "Microsoft Ads", logo: "/brand-icons/microsoft.svg" },
  pinterest_ads: { label: "Pinterest Ads", logo: "/brand-icons/pinterest.svg" },
  snapchat_ads: { label: "Snapchat Ads", logo: "/brand-icons/snapchat.svg" },
  reddit_ads: { label: "Reddit Ads", logo: "/brand-icons/reddit.svg" },
  amazon_ads: { label: "Amazon Ads", logo: "/brand-icons/amazon.svg" },
  apple_search_ads: { label: "Apple Search Ads", logo: "/brand-icons/apple.svg" },
  organic_social: { label: "Organic Social", logo: null },
  local_discovery: { label: "Local Discovery", logo: "/brand-icons/google.svg" },
  commerce_marketplaces: { label: "Commerce & Marketplaces", logo: "/brand-icons/shopify.svg" },
  marketplaces: { label: "Commerce & Marketplaces", logo: "/brand-icons/shopify.svg" },
  programmatic: { label: "Programmatic / CTV / DOOH", logo: null },
  partnerships_offline: { label: "Partnerships & Offline", logo: null },
  sms: { label: "SMS", logo: null },
  push: { label: "Push Notifications", logo: null },
};

function channelDisplay(value) {
  const key = String(value || "").trim().toLowerCase().replaceAll(" ", "_");
  return CHANNEL_DISPLAY[key] || { label: labelize(value), logo: null };
}

const MEDIA_ROLES = [
  { value: "hero", label: "Hero / Primary Ad" },
  { value: "feed", label: "Feed Creative" },
  { value: "story", label: "Story / Reel" },
  { value: "proof", label: "Proof / Supporting" },
  { value: "general", label: "General" },
];

function money(value, currency = null) {
  if (value === null || value === undefined) return "—";
  const code = String(currency || "").toUpperCase();
  if (!code) return Number(value || 0).toLocaleString();
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
      maximumFractionDigits: 0,
    }).format(Number(value || 0));
  } catch {
    return `${code} ${Number(value || 0).toLocaleString()}`;
  }
}

function campaignCurrency(content = {}) {
  if (content.currency_code) return String(content.currency_code).toUpperCase();
  if (content.campaign_budget_thb != null || content.monthly_budget_thb != null || content.daily_budget_guide_thb != null) return "THB";
  return null;
}

function labelize(value = "") {
  return String(value)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusClass(status = "") {
  const normalized = String(status).toLowerCase();

  if (["active", "live", "published"].includes(normalized)) {
    return "border-emerald-700/15 bg-emerald-50 text-emerald-700";
  }

  if (["ready", "queued"].includes(normalized)) {
    return "border-emerald-700/15 bg-emerald-50 text-emerald-700";
  }

  return "border-[#DDBA8B] bg-[#FFF8EC] text-[#7A5A36]";
}

function metaConnectionLabel(value) {
  if (value === "facebook_and_instagram_connected") {
    return "Facebook + Instagram connected";
  }

  if (value === "facebook_connected_instagram_not_connected") {
    return "Facebook connected · Instagram not connected";
  }

  if (value === "required_before_paid_launch") {
    return "Meta connection required before paid launch";
  }

  return labelize(value || "Not configured");
}

function AssetPreview({ asset }) {
  const url = asset.file_url || asset.image_url || asset.thumbnail_url;
  const mime = asset.mime_type || asset.metadata?.technical?.mime_type || "";
  const isVideo = mime.startsWith("video/");

  if (!url) {
    return (
      <div className="flex h-48 items-center justify-center bg-white/[0.03] text-[#9B9289]">
        No preview
      </div>
    );
  }

  if (isVideo) {
    return (
      <video
        src={url}
        controls
        className="h-48 w-full bg-[#F3EFE9] object-cover"
      />
    );
  }

  return (
    <div className="relative h-48 w-full overflow-hidden">
      <Image
        src={url}
        alt={asset.name || "Campaign asset"}
        fill
        sizes="(min-width: 1536px) 33vw, (min-width: 768px) 50vw, 100vw"
        className="object-cover"
      />
    </div>
  );
}

export default function CampaignWorkspacePage() {
  const params = useParams();
  const organizationId = String(params?.organizationId || "");
  const fileInputRef = useRef(null);

  const [campaigns, setCampaigns] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [mediaRole, setMediaRole] = useState("hero");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [preflighting, setPreflighting] = useState(false);
  const [preflightResults, setPreflightResults] = useState([]);
  const [executingProvider, setExecutingProvider] = useState("");
  const [executionResults, setExecutionResults] = useState({});
  const [canManageAssets, setCanManageAssets] = useState(false);
  const [canManagePaidMedia, setCanManagePaidMedia] = useState(false);

  const selected = useMemo(
    () => campaigns.find((campaign) => campaign.id === selectedId) || campaigns[0] || null,
    [campaigns, selectedId],
  );

  const loadCampaigns = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/marketing/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId }),
      });

      const payload = await response.json();
      const rows = payload?.data?.campaigns || [];

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.message || "Unable to load campaigns");
      }

      setCampaigns(rows);
      setCanManageAssets(payload?.data?.capabilities?.can_manage_assets === true);
      setCanManagePaidMedia(payload?.data?.capabilities?.can_manage_paid_media === true);
      setSelectedId((current) => {
        if (current && rows.some((campaign) => campaign.id === current)) return current;
        return rows[0]?.id || null;
      });
    } catch (loadError) {
      setCanManageAssets(false);
      setCanManagePaidMedia(false);
      setError(loadError.message || "Unable to load campaigns");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    if (organizationId) loadCampaigns();
  }, [loadCampaigns, organizationId]);

  useEffect(() => {
    setPreflightResults([]);
    setExecutionResults({});
    setExecutingProvider("");
  }, [selectedId]);

  async function runPreflight() {
    if (!selected || !canManagePaidMedia) return;
    const snapshots = selected.campaign_content?.execution_plan_snapshots || {};
    const fingerprints = selected.campaign_content?.execution_plan_fingerprints || {};
    const entries = Object.entries(snapshots).filter(([, plan]) => plan && typeof plan === "object");
    if (!entries.length) {
      setPreflightResults([{ provider: "campaign", success: false, error: { message: "No executable channel plan is stored for this campaign." } }]);
      return;
    }

    setPreflighting(true);
    setError("");
    setMessage("");
    const results = [];
    try {
      for (const [provider, plan] of entries) {
        try {
          const response = await fetch("/api/marketing/campaign-execution", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "preflight",
              organizationId: selected.organization_id || organizationId,
              plan,
              expectedPlanFingerprint: fingerprints?.[provider] || null,
            }),
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok || payload?.success === false) {
            results.push({ provider, fingerprint: fingerprints?.[provider] || null, success: false, error: payload?.error || { message: "Final connection check failed" } });
          } else {
            results.push({ provider, fingerprint: fingerprints?.[provider] || null, success: true, data: payload?.data || null });
          }
        } catch (providerError) {
          results.push({ provider, fingerprint: fingerprints?.[provider] || null, success: false, error: { message: providerError.message || "Final connection check failed" } });
        }
      }
      setPreflightResults(results);
      const passed = results.filter((result) => result.success).length;
      setMessage(`Readiness check complete: ${passed}/${results.length} channel plan${results.length === 1 ? "" : "s"} ready.`);
    } finally {
      setPreflighting(false);
    }
  }

  async function approveAndExecuteProvider(provider) {
    if (!selected || !provider || !canManagePaidMedia) return;
    const plan = selected.campaign_content?.execution_plan_snapshots?.[provider];
    const fingerprint = selected.campaign_content?.execution_plan_fingerprints?.[provider] || null;
    const existingEvidence = selected.campaign_content?.execution_evidence?.[provider];
    if (!plan) return;
    if (existingEvidence && ["PAUSED", "ACTIVE"].includes(String(existingEvidence.status || "").toUpperCase())) {
      setError(`${channelDisplay(provider).label} already has a ${existingEvidence.status} channel campaign for this Marketing Campaign.`);
      return;
    }
    if (!fingerprint) {
      setError("This channel plan has changed since review. Recreate or refresh the campaign plan before approval.");
      return;
    }

    const amount = Number(plan.budget?.amount || 0);
    const currency = String(plan.budget?.currency || "").toUpperCase();
    const label = channelDisplay(provider).label;
    const confirmed = window.confirm(
      `Approve ${label} for this reviewed campaign plan?\n\nThis will reserve up to ${currency ? `${currency} ` : ""}${amount.toLocaleString()} from the organization wallet and create the campaign in PAUSED state. It will NOT activate ads.`,
    );
    if (!confirmed) return;

    setExecutingProvider(provider);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/marketing/campaign-execution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "approve_and_execute",
          organizationId: selected.organization_id || organizationId,
          marketingCampaignId: selected.id,
          plan,
          expectedPlanFingerprint: fingerprint,
          confirmOwnerApproval: true,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.success === false) {
        const providerError = payload?.error || { message: "Campaign creation failed" };
        setExecutionResults((current) => ({ ...current, [provider]: { success: false, error: providerError } }));
        throw new Error(providerError.message || "Campaign creation failed");
      }
      setExecutionResults((current) => ({ ...current, [provider]: { success: true, data: payload?.data || null } }));
      const evidenceWarning = payload?.data?.marketing_campaign_evidence?.warning;
      setMessage(evidenceWarning || `${label} campaign created in PAUSED state. Ads are not active.`);
      await loadCampaigns();
    } catch (executeError) {
      setError(executeError.message || "Campaign creation failed");
    } finally {
      setExecutingProvider("");
    }
  }

  async function uploadFile(file) {
    if (!selected || !file) return;

    setUploading(true);
    setError("");
    setMessage("");

    try {
      const formData = new FormData();
      formData.append("organizationId", organizationId);
      formData.append("campaignId", selected.id);
      formData.append("file", file);
      formData.append("assetType", `campaign_${mediaRole}`);
      formData.append("source", "campaign_workspace_upload");
      formData.append(
        "restrictions",
        JSON.stringify({ campaign_media_role: mediaRole }),
      );

      const response = await fetch("/api/marketing/upload-asset", {
        method: "POST",
        body: formData,
      });

      const payload = await response.json();

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || payload?.message || "Upload failed");
      }

      setMessage(`${file.name} added to ${selected.campaign_name}.`);
      await loadCampaigns();
    } catch (uploadError) {
      setError(uploadError.message || "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#F7F6F3] p-8 text-[#2D2822]">
        <div className="mx-auto max-w-7xl text-[#7F776E]">Loading campaigns...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F7F6F3] p-6 text-[#2D2822] lg:p-10">
      <div className="mx-auto max-w-[1500px]">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
          <div>
            <Link
              href={`/workspace/${organizationId}/commercial/marketing`}
              className="mb-5 inline-flex items-center gap-2 text-sm text-[#777169] transition hover:text-[#2D2822]"
            >
              <ArrowLeft className="h-4 w-4" />
              Marketing
            </Link>
            <div className="text-xs uppercase tracking-[0.3em] text-[#D6A66A]">
              Campaign Management
            </div>
            <h1 className="mt-3 text-5xl font-light lg:text-6xl">Campaigns</h1>
            <p className="mt-4 max-w-3xl text-[#777169]">
              Live organization campaigns, creative assets, targeting, copy and paid-media readiness in one workspace.
            </p>
          </div>

          <button
            onClick={loadCampaigns}
            className="inline-flex items-center gap-2 rounded-2xl border border-black/[0.08] bg-white px-5 py-3 text-sm text-[#625B53] transition hover:border-[#C9AD89]"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        {error ? (
          <div className="mb-6 rounded-2xl border border-red-700/15 bg-red-50 px-5 py-4 text-red-800">
            {error}
          </div>
        ) : null}

        {message ? (
          <div className="mb-6 rounded-2xl border border-emerald-700/15 bg-emerald-50 px-5 py-4 text-emerald-800">
            {message}
          </div>
        ) : null}

        {!campaigns.length ? (
          <div className="rounded-[30px] border border-black/[0.07] bg-white p-10 text-center">
            <Megaphone className="mx-auto h-9 w-9 text-[#D6A66A]" />
            <h2 className="mt-5 text-2xl font-light">No campaigns for this organization</h2>
            <p className="mt-2 text-[#817B73]">Campaigns will appear here as soon as they are created for this organization.</p>
          </div>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
            <aside className="space-y-3">
              {campaigns.map((campaign) => {
                const active = selected?.id === campaign.id;
                const content = campaign.campaign_content || {};

                return (
                  <button
                    key={campaign.id}
                    onClick={() => setSelectedId(campaign.id)}
                    className={`w-full rounded-[26px] border p-5 text-left transition ${
                      active
                        ? "border-[#C99A62] bg-[#FBF3E8]"
                        : "border-black/[0.07] bg-white hover:border-[#C9AD89]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.15em] ${statusClass(campaign.campaign_status)}`}>
                        {campaign.campaign_status || "draft"}
                      </span>
                      <span className="text-xs text-[#9B9289]">{campaign.assets?.length || 0} assets</span>
                    </div>
                    <h2 className="mt-4 text-lg font-medium leading-snug">{campaign.campaign_name}</h2>
                    <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-[#817B73]">
                      {content.goal || content.core_message || "Campaign plan"}
                    </p>
                    <div className="mt-4 text-sm text-[#805A35]">{money(campaign.budget, campaignCurrency(content))}{content.budget_semantics === "campaign_total_authorization" ? " total" : " / month"}</div>
                  </button>
                );
              })}
            </aside>

            {selected ? (
              <section className="space-y-6">
                <CampaignDetail campaign={selected} onPreflight={runPreflight} preflighting={preflighting} preflightResults={preflightResults} onApproveProvider={approveAndExecuteProvider} executingProvider={executingProvider} executionResults={executionResults} canManagePaidMedia={canManagePaidMedia} />

                <div className="rounded-[30px] border border-black/[0.07] bg-white p-6 lg:p-8">
                  <div className="flex flex-wrap items-end justify-between gap-5">
                    <div>
                      <div className="text-xs uppercase tracking-[0.2em] text-[#D6A66A]">Creative Assets</div>
                      <h2 className="mt-2 text-3xl font-light">Pictures & Video</h2>
                      <p className="mt-2 max-w-3xl text-[#817B73]">
                        Upload media here to attach it directly to this campaign. Assets stay with this business and carry this campaign ID into the marketing asset library.
                      </p>
                    </div>

                    {canManageAssets ? (
                      <div className="flex flex-wrap gap-3">
                        <select
                          value={mediaRole}
                          onChange={(event) => setMediaRole(event.target.value)}
                          className="rounded-2xl border border-black/[0.08] bg-white px-4 py-3 text-sm text-[#4E4740] outline-none"
                        >
                          {MEDIA_ROLES.map((role) => (
                            <option key={role.value} value={role.value}>{role.label}</option>
                          ))}
                        </select>

                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*,video/*"
                          className="hidden"
                          onChange={(event) => uploadFile(event.target.files?.[0])}
                        />

                        <button
                          onClick={() => fileInputRef.current?.click()}
                          disabled={uploading}
                          className="inline-flex items-center gap-2 rounded-2xl bg-[#D6A66A] px-5 py-3 text-sm font-semibold text-[#2B2118] disabled:opacity-50"
                        >
                          {uploading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                          {uploading ? "Uploading..." : "Add Picture / Video"}
                        </button>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-black/[0.07] bg-[#FCFBF8] px-4 py-3 text-xs text-[#817B73]">View only · campaign or creative upload permission is required to add media.</div>
                    )}
                  </div>

                  {canManageAssets ? (
                    <div
                      className="mt-6 rounded-[26px] border border-dashed border-[#D7C2A8] bg-[#FCFAF7] p-7 text-center"
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault();
                        uploadFile(event.dataTransfer.files?.[0]);
                      }}
                    >
                      <ImagePlus className="mx-auto h-7 w-7 text-[#D6A66A]" />
                      <div className="mt-3 text-sm text-[#625B53]">Drop an image or video here</div>
                      <div className="mt-1 text-xs text-[#9B9289]">It will be attached to {selected.campaign_name}</div>
                    </div>
                  ) : null}

                  {selected.assets?.length ? (
                    <div className="mt-7 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                      {selected.assets.map((asset) => (
                        <div key={asset.id} className="overflow-hidden rounded-[24px] border border-black/[0.07] bg-[#FCFBF8]">
                          <AssetPreview asset={asset} />
                          <div className="p-4">
                            <div className="truncate text-sm text-[#433C35]">{asset.name || asset.file_name || "Campaign asset"}</div>
                            <div className="mt-2 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.12em] text-[#928A82]">
                              <span>{labelize(asset.asset_type || "asset")}</span>
                              {asset.approval_state ? <span>· {labelize(asset.approval_state)}</span> : null}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-7 rounded-2xl border border-black/[0.07] bg-[#FCFBF8] px-5 py-8 text-center text-sm text-[#928A82]">
                      No media attached to this campaign yet.
                    </div>
                  )}
                </div>
              </section>
            ) : null}
          </div>
        )}
      </div>
    </main>
  );
}

function CampaignDetail({ campaign, onPreflight, preflighting = false, preflightResults = [], onApproveProvider, executingProvider = "", executionResults = {}, canManagePaidMedia = false }) {
  const content = campaign.campaign_content || {};
  const audience = content.audience || {};
  const creative = content.creative_direction || {};
  const period = content.period || {};
  const channels = Array.isArray(content.channel_surfaces)
    ? content.channel_surfaces
    : Array.isArray(content.channels)
      ? content.channels
      : [];
  const copy = Array.isArray(content.copy_variants) ? content.copy_variants : [];
  const measurement = Array.isArray(content.measurement) ? content.measurement : [];
  const segments = Array.isArray(audience.segments) ? audience.segments : [];
  const pillars = Array.isArray(creative.content_pillars) ? creative.content_pillars : [];
  const channelSettings = content.channel_settings && typeof content.channel_settings === "object"
    ? content.channel_settings
    : {};
  const channelSettingAssets = content.channel_setting_assets && typeof content.channel_setting_assets === "object"
    ? content.channel_setting_assets
    : {};
  const creativeAssetSnapshots = content.creative_asset_snapshots && typeof content.creative_asset_snapshots === "object"
    ? content.creative_asset_snapshots
    : {};
  const settingAssets = { ...channelSettingAssets, ...creativeAssetSnapshots };
  const channelReadiness = Array.isArray(content.channel_readiness_snapshot)
    ? content.channel_readiness_snapshot
    : [];
  const executionPlans = content.execution_plan_snapshots && typeof content.execution_plan_snapshots === "object"
    ? content.execution_plan_snapshots
    : {};
  const executionEvidence = content.execution_evidence && typeof content.execution_evidence === "object"
    ? content.execution_evidence
    : {};
  const executablePlanCount = Object.values(executionPlans).filter((plan) => plan && typeof plan === "object").length;
  const readyProviderCount = preflightResults.filter((result) => result.success).length;
  const blockedProviderCount = preflightResults.filter((result) => !result.success).length;
  const createdProviderCount = Object.values(executionEvidence).filter((evidence) => ["PAUSED", "ACTIVE"].includes(String(evidence?.status || "").toUpperCase())).length;
  const anyProviderActive = Object.values(executionEvidence).some((evidence) => String(evidence?.status || "").toUpperCase() === "ACTIVE");

  return (
    <div className="rounded-[30px] border border-black/[0.07] bg-white p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="max-w-4xl">
          <div className="flex flex-wrap items-center gap-3">
            <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.15em] ${statusClass(campaign.campaign_status)}`}>
              {campaign.campaign_status || "draft"}
            </span>
            <span className="text-xs uppercase tracking-[0.15em] text-[#9B9289]">{labelize(campaign.campaign_type || "campaign")}</span>
          </div>
          <h2 className="mt-5 text-3xl font-light leading-tight lg:text-4xl">{campaign.campaign_name}</h2>
          <p className="mt-4 text-lg leading-relaxed text-[#625B53]">{content.core_message || content.goal || "Campaign plan"}</p>
        </div>

        <div className="flex min-w-[220px] flex-col items-stretch gap-3">
          <div className="rounded-2xl border border-black/[0.07] bg-[#FCFBF8] px-5 py-4 text-right">
            <div className="text-xs uppercase tracking-[0.15em] text-[#9B9289]">Spend State</div>
            <div className="mt-2 text-sm text-[#8A633C]">{labelize(content.spend_state || "not authorized")}</div>
          </div>
          {executablePlanCount && canManagePaidMedia ? (
            <button type="button" onClick={onPreflight} disabled={preflighting} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#D2B187] bg-[#FBF4EA] px-4 py-3 text-sm font-semibold text-[#684A2E] transition hover:bg-[#F4E7D5] disabled:opacity-50">
              {preflighting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              {preflighting ? "Checking readiness…" : `Check readiness (${executablePlanCount})`}
            </button>
          ) : executablePlanCount ? (
            <div className="rounded-2xl border border-black/[0.07] bg-[#FCFBF8] px-4 py-3 text-center text-xs leading-relaxed text-[#817B73]">View only · paid-media management permission is required for readiness and provider creation.</div>
          ) : null}
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <LaunchStage label="Plan" state="complete" detail="Campaign draft saved" />
        <LaunchStage
          label="Readiness"
          state={preflightResults.length ? (blockedProviderCount ? "blocked" : "complete") : executablePlanCount ? "pending" : "not_applicable"}
          detail={preflightResults.length ? `${readyProviderCount}/${preflightResults.length} provider plan${preflightResults.length === 1 ? "" : "s"} ready` : executablePlanCount ? (canManagePaidMedia ? "Run readiness check" : "View only · paid-media manager required") : "No executable paid plan"}
        />
        <LaunchStage
          label="Provider creation"
          state={createdProviderCount ? "complete" : executablePlanCount ? "pending" : "not_applicable"}
          detail={createdProviderCount ? `${createdProviderCount} provider campaign${createdProviderCount === 1 ? "" : "s"} created` : executablePlanCount ? (canManagePaidMedia ? "Requires explicit approval" : "View only · approval permission required") : "Nothing to create"}
        />
        <LaunchStage
          label="Ads live"
          state={anyProviderActive ? "complete" : createdProviderCount ? "pending" : "not_applicable"}
          detail={anyProviderActive ? "At least one provider is active" : createdProviderCount ? "Still paused · activation separate" : "No active ads"}
        />
      </div>

      {preflightResults.length ? (
        <div className="mt-6 rounded-[24px] border border-black/[0.07] bg-[#FCFBF8] p-5">
          <div className="text-xs uppercase tracking-[0.16em] text-[#D6A66A]">Launch Readiness</div>
          <div className="mt-3 space-y-2">
            {preflightResults.map((result) => (
              <div key={result.provider} className={`rounded-2xl border p-4 ${result.success ? "border-emerald-700/15 bg-emerald-50" : "border-[#DDBA8B] bg-[#FFF8EC]"}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-[#4A4138]">{channelDisplay(result.provider).label}</div>
                  <span className={`rounded-full border px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.1em] ${result.success ? "border-emerald-700/15 bg-white text-emerald-700" : "border-[#DDBA8B] bg-white text-[#7A5A36]"}`}>{result.success ? "Ready" : "Blocked"}</span>
                </div>
                {result.success ? (
                  <div className="mt-3 space-y-3">
                    <div className="text-xs leading-relaxed text-emerald-800">No wallet change and no campaign was created. {result.data?.result_count ?? 0} adapter check{result.data?.result_count === 1 ? "" : "s"} passed.</div>
                    {executionEvidence?.[result.provider] && ["PAUSED", "ACTIVE"].includes(String(executionEvidence[result.provider]?.status || "").toUpperCase()) ? (
                      <div className="rounded-xl border border-emerald-700/15 bg-white px-3 py-2 text-xs font-medium text-emerald-800">Existing provider campaign: {executionEvidence[result.provider].status}. No duplicate will be created.</div>
                    ) : executionResults?.[result.provider]?.success ? (
                      <div className="rounded-xl border border-emerald-700/15 bg-white px-3 py-2 text-xs font-medium text-emerald-800">Approved and created PAUSED. Ads are not active.</div>
                    ) : !canManagePaidMedia ? (
                      <div className="rounded-xl border border-black/[0.07] bg-white px-3 py-2 text-xs text-[#817B73]">View only · paid-media management permission is required for provider creation.</div>
                    ) : result.fingerprint ? (
                      <button type="button" onClick={() => onApproveProvider?.(result.provider)} disabled={Boolean(executingProvider)} className="inline-flex items-center gap-2 rounded-xl border border-[#D2B187] bg-[#FBF4EA] px-4 py-2 text-xs font-semibold text-[#684A2E] disabled:opacity-40">
                        {executingProvider === result.provider ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                        {executingProvider === result.provider ? "Creating paused campaign…" : "Approve & Create Paused"}
                      </button>
                    ) : (
                      <div className="rounded-xl border border-[#DDBA8B] bg-white px-3 py-2 text-xs text-[#7A5A36]">Ready, but this legacy plan has no integrity seal. Recreate or refresh the reviewed plan before approval.</div>
                    )}
                    {executionResults?.[result.provider]?.success === false ? <div className="text-xs text-red-700">{executionResults[result.provider]?.error?.message || "Execution failed"}</div> : null}
                  </div>
                ) : (
                  <div className="mt-2 space-y-1 text-xs leading-relaxed text-[#7A5A36]">
                    <div>{result.error?.message || "Final connection check failed."}</div>
                    {result.error?.correction ? <div className="text-[#8A633C]">Fix: {result.error.correction}</div> : null}
                    {result.error?.details?.blockers?.length ? <div>Blockers: {result.error.details.blockers.join(" · ")}</div> : null}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {Object.keys(executionEvidence).length ? (
        <div className="mt-6 rounded-[24px] border border-emerald-700/15 bg-emerald-50/70 p-5">
          <div className="text-xs uppercase tracking-[0.16em] text-emerald-800">Approved Campaign Creation</div>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {Object.entries(executionEvidence).map(([provider, evidence]) => (
              <div key={provider} className="rounded-2xl border border-emerald-700/15 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-3"><div className="text-sm font-semibold text-[#4A4138]">{channelDisplay(provider).label}</div><span className="rounded-full border border-emerald-700/15 bg-emerald-50 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-emerald-700">{evidence.status || "PAUSED"}</span></div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-[#6F675F]">
                  <div>Reserved: {money(evidence.reserved_amount || 0, evidence.currency || campaignCurrency(content))}</div>
                  <div className="font-medium text-emerald-800">Activation required · ads are not active.</div>
                </div>
                <details className="group mt-3 rounded-xl border border-black/[0.06] bg-[#FCFBF8]">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-[10px] font-semibold text-[#746B62] [&::-webkit-details-marker]:hidden">
                    <span>Technical evidence</span>
                    <span className="group-open:hidden">Show</span>
                    <span className="hidden group-open:inline">Hide</span>
                  </summary>
                  <div className="grid gap-2 border-t border-black/[0.06] px-3 py-3 text-[10px] text-[#6F675F] sm:grid-cols-2">
                    <div>Managed media: {evidence.managed_media_campaign_id || "—"}</div>
                    <div>Provider campaign: {evidence.provider_campaign_id || "—"}</div>
                    <div>Executed: {evidence.executed_at ? new Date(evidence.executed_at).toLocaleString() : "—"}</div>
                    <div>Integrity: {evidence.plan_fingerprint ? "Verified" : "Legacy / unavailable"}</div>
                  </div>
                </details>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric icon={WalletCards} label={content.budget_semantics === "campaign_total_authorization" ? "Campaign Budget" : "Monthly Budget"} value={money(content.campaign_budget ?? content.monthly_budget ?? content.campaign_budget_thb ?? content.monthly_budget_thb ?? campaign.budget, campaignCurrency(content))} />
        <Metric icon={CalendarDays} label="Daily Guide" value={(content.daily_budget_guide ?? content.daily_budget_guide_thb) ? money(content.daily_budget_guide ?? content.daily_budget_guide_thb, campaignCurrency(content)) : "—"} />
        <Metric icon={Target} label="Primary CTA" value={content.primary_cta || "—"} />
        <Metric icon={CheckCircle2} label="Meta" value={metaConnectionLabel(content.meta_connection)} compact />
      </div>

      <div className="mt-8 grid gap-5 xl:grid-cols-2">
        <InfoBlock title="Goal & Offer">
          <p className="text-[#625B53]">{content.goal || "—"}</p>
          <p className="mt-3 text-sm text-[#817B73]">Offer: {content.offer || "—"}</p>
          <p className="mt-2 text-sm text-[#817B73]">Period: {period.days ? `${period.days} days` : "—"}{period.start ? ` · starts ${period.start}` : ""}</p>
        </InfoBlock>

        <InfoBlock title="Audience">
          <p className="text-[#625B53]">{audience.market || "—"}</p>
          <p className="mt-2 text-sm leading-relaxed text-[#817B73]">{audience.approach || ""}</p>
          <TagList values={segments} />
        </InfoBlock>

        <InfoBlock title="Channels">
          <ChannelTagList values={channels} />
        </InfoBlock>

        <InfoBlock title="Channel Configuration">
          <ChannelConfiguration settings={channelSettings} assets={settingAssets} />
        </InfoBlock>

        <InfoBlock title="Channel Readiness">
          <ChannelReadinessList values={channelReadiness} />
        </InfoBlock>

        <InfoBlock title="Creative Direction">
          <p className="text-sm leading-relaxed text-[#625B53]">{creative.style || "—"}</p>
          <TagList values={pillars} />
        </InfoBlock>

        <InfoBlock title="Ad Copy">
          <div className="space-y-3">
            {copy.length ? copy.map((line, index) => (
              <div key={`${line}-${index}`} className="rounded-2xl border border-black/[0.07] bg-[#FCFBF8] p-4 text-sm leading-relaxed text-[#5E564E]">
                {line}
              </div>
            )) : <span className="text-[#928A82]">No copy variants yet.</span>}
          </div>
        </InfoBlock>

        <InfoBlock title="Success Metrics">
          <TagList values={measurement} />
        </InfoBlock>
      </div>
    </div>
  );
}

function LaunchStage({ label, state = "pending", detail = "" }) {
  const tone = state === "complete"
    ? "border-emerald-700/15 bg-emerald-50 text-emerald-800"
    : state === "blocked"
      ? "border-[#DDBA8B] bg-[#FFF8EC] text-[#7A5A36]"
      : state === "pending"
        ? "border-[#D8C2A8] bg-[#FCFBF8] text-[#6F675F]"
        : "border-black/[0.06] bg-white text-[#8A8178]";
  const status = state === "complete" ? "Ready" : state === "blocked" ? "Blocked" : state === "pending" ? "Next" : "—";
  return (
    <div className={`rounded-2xl border p-4 ${tone}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.12em]">{label}</div>
        <span className="rounded-full border border-current/15 bg-white/70 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em]">{status}</span>
      </div>
      <div className="mt-2 text-xs leading-relaxed">{detail}</div>
    </div>
  );
}

function Metric({ icon: Icon, label, value, compact = false }) {
  return (
    <div className="rounded-2xl border border-black/[0.07] bg-[#FCFBF8] p-5">
      <Icon className="h-5 w-5 text-[#D6A66A]" />
      <div className="mt-4 text-xs uppercase tracking-[0.15em] text-[#9B9289]">{label}</div>
      <div className={`mt-2 text-[#433C35] ${compact ? "text-sm leading-relaxed" : "text-lg"}`}>{value}</div>
    </div>
  );
}

function InfoBlock({ title, children }) {
  return (
    <div className="rounded-[24px] border border-black/[0.07] bg-[#FCFBF8] p-5">
      <div className="mb-4 text-xs uppercase tracking-[0.18em] text-[#D6A66A]">{title}</div>
      {children}
    </div>
  );
}

function ChannelReadinessList({ values = [] }) {
  if (!values.length) return <span className="text-sm text-[#928A82]">No channel readiness record yet.</span>;
  return (
    <div className="space-y-2">
      {values.map((item) => {
        const channel = channelDisplay(item.surface || item.channel);
        const ready = item.state === "READY";
        const planned = item.state === "PLANNING_ONLY";
        return (
          <div key={`${item.surface}-${item.channel}-${item.network || "none"}`} className="flex items-start justify-between gap-4 rounded-2xl border border-black/[0.06] bg-white p-3">
            <div className="flex min-w-0 items-start gap-3">
              {channel.logo ? <Image src={channel.logo} alt="" width={18} height={18} className="mt-0.5 h-[18px] w-[18px] shrink-0 object-contain" /> : <Megaphone className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[#A37849]" />}
              <div className="min-w-0">
                <div className="text-xs font-medium text-[#4A4138]">{channel.label}</div>
                {item.reasons?.length ? <div className="mt-1 text-[10px] leading-relaxed text-[#8A8178]">{item.reasons[0]}</div> : null}
              </div>
            </div>
            <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.1em] ${ready ? "border-emerald-700/15 bg-emerald-50 text-emerald-700" : planned ? "border-black/[0.08] bg-[#F7F6F3] text-[#7B7168]" : "border-[#DDBA8B] bg-[#FFF8EC] text-[#7A5A36]"}`}>
              {labelize(item.state)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function channelSettingDisplayValue(raw, assets = {}) {
  if (raw === null || raw === undefined || raw === "") return "—";
  if (typeof raw === "string") return assets?.[raw]?.name || raw;
  if (typeof raw === "number" || typeof raw === "boolean") return String(raw);
  if (Array.isArray(raw)) {
    if (!raw.length) return "—";
    return raw.map((item) => {
      if (item && typeof item === "object") {
        return item.name || item.label || item.code || item.country_code || item.id || JSON.stringify(item);
      }
      return String(item);
    }).join(", ");
  }
  if (typeof raw === "object") {
    return raw.name || raw.label || raw.code || raw.id || Object.entries(raw)
      .map(([key, value]) => `${channelSettingLabel(key)}: ${String(value)}`)
      .join(" · ");
  }
  return String(raw);
}

function channelSettingLabel(key = "") {
  return String(key)
    .replace(/AssetId$/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function ChannelConfiguration({ settings = {}, assets = {} }) {
  const entries = Object.entries(settings || {}).filter(([, value]) => value && typeof value === "object");
  if (!entries.length) return <span className="text-sm text-[#928A82]">No channel-specific overrides.</span>;

  return (
    <div className="space-y-3">
      {entries.map(([channelId, values]) => {
        const fields = Object.entries(values || {}).filter(([, value]) => String(value ?? "").trim());
        if (!fields.length) return null;
        const channel = channelDisplay(channelId);
        return (
          <div key={channelId} className="rounded-2xl border border-black/[0.07] bg-white p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-[#4A4138]">
              {channel.logo ? <Image src={channel.logo} alt="" width={16} height={16} className="h-4 w-4 object-contain" /> : null}
              {channel.label}
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {fields.map(([key, raw]) => {
                const asset = key.endsWith("AssetId") ? assets?.[raw] : null;
                const display = asset?.name || channelSettingDisplayValue(raw, assets);
                return (
                  <div key={key} className="rounded-xl border border-black/[0.06] bg-[#FCFBF8] px-3 py-2.5">
                    <div className="text-[9px] uppercase tracking-[0.12em] text-[#9B9289]">{channelSettingLabel(key)}</div>
                    <div className="mt-1 break-words text-xs text-[#5F574F]">{display}</div>
                    {asset ? <div className="mt-1 text-[9px] uppercase tracking-[0.1em] text-[#B09B81]">{labelize(asset.asset_type || asset.provider || "connected asset")}</div> : null}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ChannelTagList({ values = [] }) {
  if (!values.length) return <span className="text-sm text-[#928A82]">—</span>;

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {values.map((value, index) => {
        const channel = channelDisplay(value);
        return (
          <span key={`${value}-${index}`} className="inline-flex items-center gap-2 rounded-full border border-black/[0.07] bg-white px-3 py-2 text-xs font-medium text-[#5F574F]">
            {channel.logo ? <Image src={channel.logo} alt="" width={16} height={16} className="h-4 w-4 object-contain" /> : null}
            {channel.label}
          </span>
        );
      })}
    </div>
  );
}

function TagList({ values = [] }) {
  if (!values.length) return <span className="text-sm text-[#928A82]">—</span>;

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {values.map((value, index) => (
        <span key={`${value}-${index}`} className="rounded-full border border-black/[0.08] bg-white px-3 py-1.5 text-xs text-[#70675F]">
          {value}
        </span>
      ))}
    </div>
  );
}
