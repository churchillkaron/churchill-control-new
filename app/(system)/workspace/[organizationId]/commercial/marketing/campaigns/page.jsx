"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ImagePlus,
  Megaphone,
  RefreshCw,
  Target,
  Upload,
  WalletCards,
} from "lucide-react";
import Link from "next/link";

const MEDIA_ROLES = [
  { value: "hero", label: "Hero / Primary Ad" },
  { value: "feed", label: "Feed Creative" },
  { value: "story", label: "Story / Reel" },
  { value: "proof", label: "Proof / Supporting" },
  { value: "general", label: "General" },
];

function money(value) {
  return new Intl.NumberFormat("en-TH", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function labelize(value = "") {
  return String(value)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusClass(status = "") {
  const normalized = String(status).toLowerCase();

  if (["active", "live", "published"].includes(normalized)) {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  }

  if (["ready", "queued"].includes(normalized)) {
    return "border-cyan-500/30 bg-cyan-500/10 text-cyan-300";
  }

  return "border-amber-500/30 bg-amber-500/10 text-amber-200";
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
      <div className="flex h-48 items-center justify-center bg-white/[0.03] text-white/30">
        No preview
      </div>
    );
  }

  if (isVideo) {
    return (
      <video
        src={url}
        controls
        className="h-48 w-full bg-black object-cover"
      />
    );
  }

  return (
    <img
      src={url}
      alt={asset.name || "Campaign asset"}
      className="h-48 w-full object-cover"
    />
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

  const selected = useMemo(
    () => campaigns.find((campaign) => campaign.id === selectedId) || campaigns[0] || null,
    [campaigns, selectedId],
  );

  useEffect(() => {
    if (organizationId) loadCampaigns();
  }, [organizationId]);

  async function loadCampaigns() {
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
      setSelectedId((current) => {
        if (current && rows.some((campaign) => campaign.id === current)) return current;
        return rows[0]?.id || null;
      });
    } catch (loadError) {
      setError(loadError.message || "Unable to load campaigns");
    } finally {
      setLoading(false);
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
      <main className="min-h-screen bg-black p-8 text-white">
        <div className="mx-auto max-w-7xl text-white/50">Loading campaigns...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black p-6 text-white lg:p-10">
      <div className="mx-auto max-w-[1500px]">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
          <div>
            <Link
              href={`/workspace/${organizationId}/commercial/marketing`}
              className="mb-5 inline-flex items-center gap-2 text-sm text-white/45 transition hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Marketing
            </Link>
            <div className="text-xs uppercase tracking-[0.3em] text-[#D6A66A]">
              Campaign Management
            </div>
            <h1 className="mt-3 text-5xl font-light lg:text-6xl">Campaigns</h1>
            <p className="mt-4 max-w-3xl text-white/45">
              Live organization campaigns, creative assets, targeting, copy and paid-media readiness in one workspace.
            </p>
          </div>

          <button
            onClick={loadCampaigns}
            className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm text-white/70 transition hover:bg-white/[0.08]"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        {error ? (
          <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-red-200">
            {error}
          </div>
        ) : null}

        {message ? (
          <div className="mb-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-4 text-emerald-200">
            {message}
          </div>
        ) : null}

        {!campaigns.length ? (
          <div className="rounded-[32px] border border-white/10 bg-white/[0.03] p-10 text-center">
            <Megaphone className="mx-auto h-9 w-9 text-[#D6A66A]" />
            <h2 className="mt-5 text-2xl font-light">No campaigns for this organization</h2>
            <p className="mt-2 text-white/40">Campaigns will appear here as soon as they are created for this organization.</p>
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
                        ? "border-[#D6A66A]/40 bg-[#D6A66A]/10"
                        : "border-white/10 bg-white/[0.03] hover:border-white/20"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.15em] ${statusClass(campaign.campaign_status)}`}>
                        {campaign.campaign_status || "draft"}
                      </span>
                      <span className="text-xs text-white/30">{campaign.assets?.length || 0} assets</span>
                    </div>
                    <h2 className="mt-4 text-lg font-medium leading-snug">{campaign.campaign_name}</h2>
                    <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-white/40">
                      {content.goal || content.core_message || "Campaign plan"}
                    </p>
                    <div className="mt-4 text-sm text-[#E6C18C]">{money(campaign.budget)} / month</div>
                  </button>
                );
              })}
            </aside>

            {selected ? (
              <section className="space-y-6">
                <CampaignDetail campaign={selected} />

                <div className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 lg:p-8">
                  <div className="flex flex-wrap items-end justify-between gap-5">
                    <div>
                      <div className="text-xs uppercase tracking-[0.2em] text-[#D6A66A]">Creative Assets</div>
                      <h2 className="mt-2 text-3xl font-light">Pictures & Video</h2>
                      <p className="mt-2 max-w-3xl text-white/40">
                        Upload media here to attach it directly to this campaign. Assets remain organization-scoped and carry this campaign ID into the marketing asset library.
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <select
                        value={mediaRole}
                        onChange={(event) => setMediaRole(event.target.value)}
                        className="rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm text-white/75 outline-none"
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
                        className="inline-flex items-center gap-2 rounded-2xl bg-[#D6A66A] px-5 py-3 text-sm font-semibold text-black disabled:opacity-50"
                      >
                        {uploading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                        {uploading ? "Uploading..." : "Add Picture / Video"}
                      </button>
                    </div>
                  </div>

                  <div
                    className="mt-6 rounded-[26px] border border-dashed border-white/15 bg-black/30 p-7 text-center"
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      uploadFile(event.dataTransfer.files?.[0]);
                    }}
                  >
                    <ImagePlus className="mx-auto h-7 w-7 text-[#D6A66A]" />
                    <div className="mt-3 text-sm text-white/70">Drop an image or video here</div>
                    <div className="mt-1 text-xs text-white/30">It will be attached to {selected.campaign_name}</div>
                  </div>

                  {selected.assets?.length ? (
                    <div className="mt-7 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                      {selected.assets.map((asset) => (
                        <div key={asset.id} className="overflow-hidden rounded-[24px] border border-white/10 bg-black/30">
                          <AssetPreview asset={asset} />
                          <div className="p-4">
                            <div className="truncate text-sm text-white/80">{asset.name || asset.file_name || "Campaign asset"}</div>
                            <div className="mt-2 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.12em] text-white/35">
                              <span>{labelize(asset.asset_type || "asset")}</span>
                              {asset.approval_state ? <span>· {labelize(asset.approval_state)}</span> : null}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-7 rounded-2xl border border-white/10 bg-black/20 px-5 py-8 text-center text-sm text-white/35">
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

function CampaignDetail({ campaign }) {
  const content = campaign.campaign_content || {};
  const audience = content.audience || {};
  const creative = content.creative_direction || {};
  const period = content.period || {};
  const channels = Array.isArray(content.channels) ? content.channels : [];
  const copy = Array.isArray(content.copy_variants) ? content.copy_variants : [];
  const measurement = Array.isArray(content.measurement) ? content.measurement : [];
  const segments = Array.isArray(audience.segments) ? audience.segments : [];
  const pillars = Array.isArray(creative.content_pillars) ? creative.content_pillars : [];

  return (
    <div className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="max-w-4xl">
          <div className="flex flex-wrap items-center gap-3">
            <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.15em] ${statusClass(campaign.campaign_status)}`}>
              {campaign.campaign_status || "draft"}
            </span>
            <span className="text-xs uppercase tracking-[0.15em] text-white/30">{labelize(campaign.campaign_type || "campaign")}</span>
          </div>
          <h2 className="mt-5 text-3xl font-light leading-tight lg:text-4xl">{campaign.campaign_name}</h2>
          <p className="mt-4 text-lg leading-relaxed text-white/60">{content.core_message || content.goal || "Campaign plan"}</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/30 px-5 py-4 text-right">
          <div className="text-xs uppercase tracking-[0.15em] text-white/30">Spend State</div>
          <div className="mt-2 text-sm text-amber-200">{labelize(content.spend_state || "not authorized")}</div>
        </div>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric icon={WalletCards} label="Monthly Budget" value={money(content.monthly_budget_thb || campaign.budget)} />
        <Metric icon={CalendarDays} label="Daily Guide" value={content.daily_budget_guide_thb ? money(content.daily_budget_guide_thb) : "—"} />
        <Metric icon={Target} label="Primary CTA" value={content.primary_cta || "—"} />
        <Metric icon={CheckCircle2} label="Meta" value={metaConnectionLabel(content.meta_connection)} compact />
      </div>

      <div className="mt-8 grid gap-5 xl:grid-cols-2">
        <InfoBlock title="Goal & Offer">
          <p className="text-white/70">{content.goal || "—"}</p>
          <p className="mt-3 text-sm text-white/40">Offer: {content.offer || "—"}</p>
          <p className="mt-2 text-sm text-white/40">Period: {period.days ? `${period.days} days` : "—"}{period.start ? ` · starts ${period.start}` : ""}</p>
        </InfoBlock>

        <InfoBlock title="Audience">
          <p className="text-white/70">{audience.market || "—"}</p>
          <p className="mt-2 text-sm leading-relaxed text-white/40">{audience.approach || ""}</p>
          <TagList values={segments} />
        </InfoBlock>

        <InfoBlock title="Channels">
          <TagList values={channels} />
        </InfoBlock>

        <InfoBlock title="Creative Direction">
          <p className="text-sm leading-relaxed text-white/60">{creative.style || "—"}</p>
          <TagList values={pillars} />
        </InfoBlock>

        <InfoBlock title="Ad Copy">
          <div className="space-y-3">
            {copy.length ? copy.map((line, index) => (
              <div key={`${line}-${index}`} className="rounded-2xl border border-white/10 bg-black/25 p-4 text-sm leading-relaxed text-white/65">
                {line}
              </div>
            )) : <span className="text-white/35">No copy variants yet.</span>}
          </div>
        </InfoBlock>

        <InfoBlock title="Success Metrics">
          <TagList values={measurement} />
        </InfoBlock>
      </div>
    </div>
  );
}

function Metric({ icon: Icon, label, value, compact = false }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-5">
      <Icon className="h-5 w-5 text-[#D6A66A]" />
      <div className="mt-4 text-xs uppercase tracking-[0.15em] text-white/30">{label}</div>
      <div className={`mt-2 text-white/80 ${compact ? "text-sm leading-relaxed" : "text-lg"}`}>{value}</div>
    </div>
  );
}

function InfoBlock({ title, children }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-black/25 p-5">
      <div className="mb-4 text-xs uppercase tracking-[0.18em] text-[#D6A66A]">{title}</div>
      {children}
    </div>
  );
}

function TagList({ values = [] }) {
  if (!values.length) return <span className="text-sm text-white/35">—</span>;

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {values.map((value, index) => (
        <span key={`${value}-${index}`} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/55">
          {value}
        </span>
      ))}
    </div>
  );
}
