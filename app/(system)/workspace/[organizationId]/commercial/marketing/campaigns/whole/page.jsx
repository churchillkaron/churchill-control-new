"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Database,
  ImageIcon,
  Loader2,
  Megaphone,
  RefreshCw,
  Search,
  Sparkles,
  Upload,
  WalletCards,
  X,
} from "lucide-react";

function money(value, currency = "THB") {
  return new Intl.NumberFormat("en-TH", {
    style: "currency",
    currency: currency || "THB",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function labelize(value = "") {
  return String(value)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function metaState(value) {
  if (value === "facebook_and_instagram_connected") {
    return { label: "Facebook + Instagram", ready: true };
  }
  if (value === "facebook_connected_instagram_not_connected") {
    return { label: "Facebook only", ready: true };
  }
  if (value === "required_before_paid_launch") {
    return { label: "Connection required", ready: false };
  }
  return { label: "Not configured", ready: false };
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

export default function WholeCampaignPage() {
  const params = useParams();
  const organizationId = String(params?.organizationId || "");
  const [groups, setGroups] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const selected = useMemo(
    () => groups.find((group) => group.id === selectedId) || groups[0] || null,
    [groups, selectedId],
  );

  useEffect(() => {
    if (organizationId) loadGroups();
  }, [organizationId]);

  async function loadGroups({ quiet = false } = {}) {
    if (!quiet) setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/marketing/campaign-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId }),
      });
      const payload = await response.json();

      if (!response.ok || !payload?.success) {
        throw new Error(
          payload?.message || payload?.error || "Unable to load whole campaigns",
        );
      }

      const rows = payload?.data?.groups || [];
      setGroups(rows);
      setSelectedId((current) =>
        current && rows.some((group) => group.id === current)
          ? current
          : rows[0]?.id || null,
      );
    } catch (loadError) {
      setError(loadError.message || "Unable to load whole campaigns");
    } finally {
      if (!quiet) setLoading(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-black p-8 text-white">
        <div className="mx-auto max-w-[1500px] text-white/50">
          Loading whole campaign...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black p-6 text-white lg:p-10">
      <div className="mx-auto max-w-[1500px]">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-[#D6A66A]">
              Multi-Organization Marketing
            </div>
            <h1 className="mt-3 text-5xl font-light lg:text-6xl">Whole Campaign</h1>
            <p className="mt-4 max-w-3xl text-white/45">
              One master initiative with separate organization copy, creative, channels and execution controls. Every image stays attached to the correct organization and campaign.
            </p>
          </div>

          <button
            onClick={() => loadGroups()}
            className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm text-white/70 transition hover:bg-white/[0.08]"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        </div>

        {error ? (
          <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-red-200">
            {error}
          </div>
        ) : null}

        {!groups.length ? (
          <div className="rounded-[32px] border border-white/10 bg-white/[0.03] p-12 text-center">
            <Megaphone className="mx-auto h-9 w-9 text-[#D6A66A]" />
            <h2 className="mt-5 text-2xl font-light">No whole campaigns yet</h2>
            <p className="mt-2 text-white/40">
              Create a master campaign when one initiative needs to coordinate several organizations.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
            <aside className="space-y-3">
              {groups.map((group) => {
                const active = selected?.id === group.id;

                return (
                  <button
                    key={group.id}
                    onClick={() => setSelectedId(group.id)}
                    className={`w-full rounded-[26px] border p-5 text-left transition ${
                      active
                        ? "border-[#D6A66A]/40 bg-[#D6A66A]/10"
                        : "border-white/10 bg-white/[0.03] hover:border-white/20"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] uppercase tracking-[0.15em] text-amber-200">
                        {group.campaign_status || "draft"}
                      </span>
                      <span className="text-xs text-white/30">
                        {group.members?.length || 0} organizations
                      </span>
                    </div>
                    <h2 className="mt-4 text-lg font-medium leading-snug">
                      {group.campaign_group_name}
                    </h2>
                    <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-white/40">
                      {group.objective || "Coordinated campaign"}
                    </p>
                    <div className="mt-4 text-sm text-[#E6C18C]">
                      {money(group.budget, group.currency_code)} master budget / month
                    </div>
                  </button>
                );
              })}
            </aside>

            {selected ? (
              <WholeCampaignDetail
                group={selected}
                onRefresh={() => loadGroups({ quiet: true })}
              />
            ) : null}
          </div>
        )}
      </div>
    </main>
  );
}

function WholeCampaignDetail({ group, onRefresh }) {
  const content = group.campaign_content || {};
  const members = group.members || [];
  const connected = members.filter((member) =>
    metaState(member.campaign?.campaign_content?.meta_connection).ready,
  ).length;
  const totalAssets = members.reduce(
    (sum, member) => sum + Number(member.campaign?.asset_count || 0),
    0,
  );
  const totalApprovedAssets = members.reduce(
    (sum, member) => sum + Number(member.campaign?.approved_asset_count || 0),
    0,
  );
  const childBudget = members.reduce(
    (sum, member) => sum + Number(member.campaign?.budget || 0),
    0,
  );
  const masterBudget = Number(
    group.budget || content.total_monthly_budget_thb || childBudget || 0,
  );
  const sharedBudget = Math.max(0, masterBudget - childBudget);
  const sharedCosts = content.shared_monthly_costs_thb || {};

  const blockers = members.flatMap((member) => {
    const issues = [];
    if (!metaState(member.campaign?.campaign_content?.meta_connection).ready) {
      issues.push(`${member.organization?.name}: connect paid channel before paid launch`);
    }
    if (!member.campaign?.asset_count) {
      issues.push(`${member.organization?.name}: choose or create campaign creative`);
    }
    return issues;
  });

  return (
    <section className="space-y-6">
      <div className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 lg:p-8">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-4xl">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] uppercase tracking-[0.15em] text-amber-200">
                {group.campaign_status || "draft"}
              </span>
              <span className="text-xs uppercase tracking-[0.15em] text-white/30">
                {labelize(group.campaign_group_type)}
              </span>
            </div>
            <h2 className="mt-5 text-3xl font-light leading-tight lg:text-4xl">
              {group.campaign_group_name}
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-white/60">{group.objective}</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/30 px-5 py-4 text-right">
            <div className="text-xs uppercase tracking-[0.15em] text-white/30">Spend State</div>
            <div className="mt-2 text-sm text-amber-200">
              {labelize(content.spend_state || "planned_not_authorized")}
            </div>
          </div>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Metric
            icon={WalletCards}
            label="Master Monthly Budget"
            value={money(masterBudget, group.currency_code)}
          />
          <Metric icon={Building2} label="Organizations" value={`${members.length}`} />
          <Metric
            icon={CheckCircle2}
            label="Paid Channel Ready"
            value={`${connected} / ${members.length}`}
          />
          <Metric
            icon={CalendarDays}
            label="Campaign Period"
            value={`${group.start_date || "—"} → ${group.end_date || "—"}`}
            compact
          />
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MiniMetric
            label="Organization Media Budget"
            value={money(childBudget, group.currency_code)}
          />
          <MiniMetric
            label="Shared Campaign Costs"
            value={money(sharedBudget, group.currency_code)}
          />
          <MiniMetric label="Creative Assets" value={`${totalAssets}`} />
          <MiniMetric label="Approved / Ready" value={`${totalApprovedAssets}`} />
        </div>

        {Object.keys(sharedCosts).length ? (
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/45">
            {Object.entries(sharedCosts).map(([key, value]) => (
              <span
                key={key}
                className="rounded-full border border-white/10 bg-black/25 px-3 py-2"
              >
                {labelize(key)}: {money(value, group.currency_code)}
              </span>
            ))}
          </div>
        ) : null}

        <div className="mt-5 rounded-2xl border border-amber-500/20 bg-amber-500/[0.05] px-4 py-3 text-sm text-amber-100/70">
          Spend Authorized: THB 0. Budget figures are planning only; choosing creative does not authorize or activate provider spend.
        </div>
      </div>

      <div className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 lg:p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-[#D6A66A]">Execution Map</div>
            <h3 className="mt-2 text-3xl font-light">Organization Campaigns</h3>
          </div>
          <div className="text-sm text-white/35">
            Full campaign copy and the creative attached to each organization.
          </div>
        </div>

        <div className="mt-6 space-y-5">
          {members.map((member) => (
            <OrganizationCampaignCard
              key={member.id}
              member={member}
              onRefresh={onRefresh}
            />
          ))}
        </div>
      </div>

      <div className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 lg:p-8">
        <div className="flex items-center gap-3">
          {blockers.length ? (
            <CircleAlert className="h-5 w-5 text-amber-300" />
          ) : (
            <CheckCircle2 className="h-5 w-5 text-emerald-300" />
          )}
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-[#D6A66A]">
              Launch Readiness
            </div>
            <h3 className="mt-1 text-2xl font-light">
              {blockers.length
                ? `${blockers.length} items need attention`
                : "Ready for approval workflow"}
            </h3>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {blockers.length ? (
            blockers.map((blocker) => (
              <div
                key={blocker}
                className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3 text-sm text-amber-100/80"
              >
                {blocker}
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-3 text-sm text-emerald-100/80">
              All participating organizations have the minimum channel and creative prerequisites.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function OrganizationCampaignCard({ member, onRefresh }) {
  const campaign = member.campaign || {};
  const campaignContent = campaign.campaign_content || {};
  const meta = metaState(campaignContent.meta_connection);
  const assets = campaign.assets || [];
  const primaryAsset = assets[0] || null;
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryQuery, setLibraryQuery] = useState("");
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryAssets, setLibraryAssets] = useState([]);
  const [attachingId, setAttachingId] = useState(null);

  const organizationId = member.organization_id;
  const studioHref = `/workspace/${organizationId}/commercial/design?campaignId=${encodeURIComponent(
    campaign.id,
  )}&source=whole-campaign`;

  async function uploadFile(file) {
    if (!file) return;
    setUploading(true);
    setMessage("");

    try {
      const form = new FormData();
      form.append("organizationId", organizationId);
      form.append("campaignId", campaign.id);
      form.append("file", file);
      form.append("source", "whole_campaign_upload");
      form.append(
        "assetType",
        file.type?.startsWith("video/") ? "video" : "campaign_media",
      );
      form.append("name", file.name || "Campaign creative");

      const response = await fetch("/api/marketing/upload-asset", {
        method: "POST",
        body: form,
      });
      const payload = await response.json();

      if (!response.ok || payload?.success === false) {
        throw new Error(payload?.error || payload?.message || "Upload failed");
      }

      setMessage("Uploaded and attached to this organization campaign.");
      await onRefresh();
    } catch (error) {
      setMessage(error.message || "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function searchLibrary(query = libraryQuery) {
    setLibraryLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/marketing/campaign-assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "search",
          organizationId,
          campaignId: campaign.id,
          query,
        }),
      });
      const payload = await response.json();

      if (!response.ok || payload?.success === false) {
        throw new Error(
          payload?.error || payload?.message || "Unable to search asset database",
        );
      }

      setLibraryAssets(payload?.data?.assets || []);
    } catch (error) {
      setMessage(error.message || "Unable to search asset database");
      setLibraryAssets([]);
    } finally {
      setLibraryLoading(false);
    }
  }

  async function openLibrary() {
    setLibraryOpen(true);
    await searchLibrary("");
  }

  async function attachAsset(assetId) {
    setAttachingId(assetId);
    setMessage("");

    try {
      const response = await fetch("/api/marketing/campaign-assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "attach",
          organizationId,
          campaignId: campaign.id,
          assetId,
        }),
      });
      const payload = await response.json();

      if (!response.ok || payload?.success === false) {
        throw new Error(payload?.error || payload?.message || "Unable to attach asset");
      }

      setMessage("Database asset attached to this organization campaign.");
      setLibraryAssets((current) =>
        current.map((asset) =>
          asset.id === assetId ? { ...asset, attached: true } : asset,
        ),
      );
      await onRefresh();
    } catch (error) {
      setMessage(error.message || "Unable to attach asset");
    } finally {
      setAttachingId(null);
    }
  }

  return (
    <article className="rounded-[28px] border border-white/10 bg-black/30 p-5 lg:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.14em] text-[#D6A66A]">
            {member.organization?.name || "Organization"}
          </div>
          <h4 className="mt-2 text-2xl font-medium leading-snug">
            {campaign.campaign_name}
          </h4>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] uppercase tracking-[0.12em] text-white/50">
            {campaign.campaign_status || "draft"}
          </span>
          <span className="rounded-full border border-amber-500/20 bg-amber-500/[0.06] px-3 py-1 text-[11px] uppercase tracking-[0.12em] text-amber-200">
            {labelize(campaignContent.spend_state || "planned_not_authorized")}
          </span>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <div className="space-y-4">
          <CampaignCreativePreview
            asset={primaryAsset}
            organizationName={member.organization?.name}
          />

          {assets.length > 1 ? (
            <div className="grid grid-cols-4 gap-2">
              {assets.slice(1, 5).map((asset) => (
                <div
                  key={asset.id}
                  className="aspect-square overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]"
                >
                  {asset.is_video ? (
                    <video
                      src={asset.preview_url}
                      className="h-full w-full object-cover"
                      muted
                      preload="metadata"
                    />
                  ) : (
                    <img
                      src={asset.preview_url}
                      alt={asset.name || "Campaign asset"}
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>
              ))}
            </div>
          ) : null}

          <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-white/35">
              <ImageIcon className="h-4 w-4 text-[#D6A66A]" /> Creative Source
            </div>

            <div className="mt-3 grid gap-2">
              <Link
                href={studioHref}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#D6A66A]/25 bg-[#D6A66A]/10 px-3 py-3 text-sm font-medium text-[#E6C18C] transition hover:bg-[#D6A66A]/15"
              >
                <Sparkles className="h-4 w-4" /> Let Studio Create It
              </Link>

              <button
                type="button"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 text-sm font-medium text-white/70 transition hover:bg-white/[0.08] disabled:opacity-50"
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                Upload Your Own
              </button>

              <button
                type="button"
                onClick={openLibrary}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 text-sm font-medium text-white/70 transition hover:bg-white/[0.08]"
              >
                <Database className="h-4 w-4" /> Search Asset Database
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={(event) => uploadFile(event.target.files?.[0])}
            />

            <p className="mt-3 text-xs leading-relaxed text-white/30">
              All three choices remain scoped to {member.organization?.name || "this organization"}. Creative selection never authorizes paid spend.
            </p>

            {message ? (
              <p className="mt-3 text-xs leading-relaxed text-white/55">{message}</p>
            ) : null}
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SmallStat label="Budget" value={money(campaign.budget)} />
            <SmallStat label="Assets" value={`${campaign.asset_count || 0}`} />
            <SmallStat label="Primary CTA" value={campaignContent.primary_cta || "—"} />
            <SmallStat label="Meta" value={meta.label} good={meta.ready} />
          </div>

          <CopyBlock title="Goal" value={campaignContent.goal} />
          <CopyBlock title="Offer" value={campaignContent.offer} />
          <CopyBlock
            title="Core Message"
            value={campaignContent.core_message}
            emphasized
          />
          <ListBlock
            title="Campaign Copy"
            items={list(campaignContent.copy_variants)}
            quoted
          />

          <div className="grid gap-4 lg:grid-cols-2">
            <ListBlock
              title="Audience Segments"
              items={list(campaignContent.audience?.segments)}
            />
            <ListBlock title="Channels" items={list(campaignContent.channels)} />
            <ListBlock
              title="Content Pillars"
              items={list(campaignContent.creative_direction?.content_pillars)}
            />
            <ListBlock
              title="Success Metrics"
              items={list(campaignContent.measurement)}
            />
          </div>

          {campaignContent.audience?.market || campaignContent.audience?.approach ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <SmallStat
                label="Market"
                value={campaignContent.audience?.market || "—"}
              />
              <SmallStat
                label="Audience Approach"
                value={campaignContent.audience?.approach || "—"}
              />
            </div>
          ) : null}

          {campaignContent.creative_direction?.style ? (
            <CopyBlock
              title="Creative Direction"
              value={campaignContent.creative_direction.style}
            />
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
            <span className="text-xs text-white/30">
              Media is isolated to {member.organization?.name || "this organization"}.
            </span>
            <Link
              href={`/workspace/${member.organization_id}/commercial/marketing/campaigns`}
              className="inline-flex items-center gap-2 text-sm text-[#E6C18C] transition hover:text-white"
            >
              Open organization <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>

      {libraryOpen ? (
        <div className="mt-6 rounded-[24px] border border-[#D6A66A]/20 bg-[#D6A66A]/[0.04] p-4 lg:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-[#D6A66A]">
                Organization Asset Database
              </div>
              <div className="mt-1 text-sm text-white/45">
                Only visual assets belonging to {member.organization?.name || "this organization"} are shown.
              </div>
            </div>
            <button
              type="button"
              onClick={() => setLibraryOpen(false)}
              className="rounded-xl border border-white/10 bg-white/[0.04] p-2 text-white/50 hover:text-white"
              aria-label="Close asset database"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
              <input
                value={libraryQuery}
                onChange={(event) => setLibraryQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") searchLibrary();
                }}
                placeholder="Search image, filename or asset type"
                className="w-full rounded-xl border border-white/10 bg-black/40 py-3 pl-10 pr-4 text-sm text-white outline-none placeholder:text-white/25 focus:border-[#D6A66A]/40"
              />
            </div>
            <button
              type="button"
              onClick={() => searchLibrary()}
              disabled={libraryLoading}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-4 text-sm text-white/70 disabled:opacity-50"
            >
              {libraryLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              Search
            </button>
          </div>

          {libraryLoading ? (
            <div className="mt-6 flex items-center gap-2 text-sm text-white/40">
              <Loader2 className="h-4 w-4 animate-spin" /> Searching organization media...
            </div>
          ) : libraryAssets.length ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {libraryAssets.map((asset) => (
                <div
                  key={asset.id}
                  className="overflow-hidden rounded-2xl border border-white/10 bg-black/40"
                >
                  <div className="aspect-[4/3] overflow-hidden bg-white/[0.03]">
                    {asset.is_video ? (
                      <video
                        src={asset.preview_url}
                        className="h-full w-full object-cover"
                        muted
                        preload="metadata"
                      />
                    ) : (
                      <img
                        src={asset.preview_url}
                        alt={asset.name || "Asset"}
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
                  <div className="p-3">
                    <div className="truncate text-xs font-medium text-white/70">
                      {asset.name}
                    </div>
                    <div className="mt-1 text-[10px] uppercase tracking-[0.12em] text-white/30">
                      {labelize(asset.asset_type)}
                    </div>
                    <button
                      type="button"
                      disabled={asset.attached || attachingId === asset.id}
                      onClick={() => attachAsset(asset.id)}
                      className={`mt-3 w-full rounded-lg border px-3 py-2 text-xs transition ${
                        asset.attached
                          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
                          : "border-[#D6A66A]/25 bg-[#D6A66A]/10 text-[#E6C18C] hover:bg-[#D6A66A]/15"
                      } disabled:opacity-70`}
                    >
                      {attachingId === asset.id
                        ? "Attaching..."
                        : asset.attached
                          ? "Attached"
                          : "Use for this campaign"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-2xl border border-white/10 bg-black/25 p-6 text-center text-sm text-white/35">
              No usable visual assets found in this organization library.
            </div>
          )}
        </div>
      ) : null}
    </article>
  );
}

function CampaignCreativePreview({ asset, organizationName }) {
  if (!asset) {
    return (
      <div className="flex aspect-[4/3] flex-col items-center justify-center rounded-[22px] border border-dashed border-white/15 bg-white/[0.025] p-8 text-center">
        <ImageIcon className="h-9 w-9 text-white/20" />
        <div className="mt-4 text-sm text-white/55">No campaign image selected yet</div>
        <div className="mt-1 max-w-xs text-xs leading-relaxed text-white/30">
          Choose Studio, upload your own, or search {organizationName || "the organization"} asset database.
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[22px] border border-white/10 bg-black">
      <div className="aspect-[4/3] overflow-hidden">
        {asset.is_video ? (
          <video
            src={asset.preview_url}
            controls
            className="h-full w-full object-cover"
            preload="metadata"
          />
        ) : (
          <img
            src={asset.preview_url}
            alt={asset.name || "Campaign creative"}
            className="h-full w-full object-cover"
          />
        )}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-white/10 px-4 py-3">
        <div className="min-w-0">
          <div className="truncate text-xs text-white/65">
            {asset.name || "Campaign creative"}
          </div>
          <div className="mt-1 text-[10px] uppercase tracking-[0.12em] text-white/30">
            {labelize(asset.asset_type)}
          </div>
        </div>
        <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.1em] text-emerald-200">
          Attached
        </span>
      </div>
    </div>
  );
}

function CopyBlock({ title, value, emphasized = false }) {
  if (!value) return null;

  return (
    <div
      className={`rounded-2xl border p-4 ${
        emphasized
          ? "border-[#D6A66A]/25 bg-[#D6A66A]/[0.06]"
          : "border-white/10 bg-white/[0.025]"
      }`}
    >
      <div className="text-[10px] uppercase tracking-[0.16em] text-white/30">{title}</div>
      <p
        className={`mt-2 leading-relaxed ${
          emphasized ? "text-base text-[#F0D5AE]" : "text-sm text-white/60"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function ListBlock({ title, items, quoted = false }) {
  if (!items?.length) return null;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
      <div className="text-[10px] uppercase tracking-[0.16em] text-white/30">{title}</div>
      <div className="mt-3 space-y-2">
        {items.map((item, index) => (
          <div
            key={`${item}-${index}`}
            className="flex gap-2 text-sm leading-relaxed text-white/55"
          >
            <span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-[#D6A66A]" />
            <span>{quoted ? `“${item}”` : item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Metric({ icon: Icon, label, value, compact = false }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-5">
      <Icon className="h-5 w-5 text-[#D6A66A]" />
      <div className="mt-4 text-xs uppercase tracking-[0.15em] text-white/30">{label}</div>
      <div
        className={`mt-2 text-white/80 ${
          compact ? "text-sm leading-relaxed" : "text-lg"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function MiniMetric({ label, value }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="text-xs uppercase tracking-[0.14em] text-white/30">{label}</div>
      <div className="mt-2 text-lg text-white/75">{value}</div>
    </div>
  );
}

function SmallStat({ label, value, good }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="text-[10px] uppercase tracking-[0.13em] text-white/30">{label}</div>
      <div
        className={`mt-1 text-xs leading-relaxed ${
          good === true
            ? "text-emerald-300"
            : good === false
              ? "text-amber-200"
              : "text-white/65"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
