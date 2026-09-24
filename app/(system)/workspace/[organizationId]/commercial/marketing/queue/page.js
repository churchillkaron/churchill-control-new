"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, Megaphone, RefreshCw, ShieldCheck } from "lucide-react";

function statusLabel(value) {
  const status = String(value || "draft").trim().toLowerCase();
  if (status === "published") return "Published";
  if (status === "scheduled") return "Scheduled";
  if (status === "ready") return "Ready";
  if (status === "approved") return "Approved";
  if (status === "queued") return "Queued";
  return status ? status[0].toUpperCase() + status.slice(1) : "Draft";
}

function statusClass(value) {
  const status = String(value || "").toLowerCase();
  if (["published", "ready", "approved"].includes(status)) return "border-emerald-700/15 bg-emerald-50 text-emerald-700";
  if (["scheduled", "queued"].includes(status)) return "border-[#DDBA8B] bg-[#FFF8EC] text-[#7A5A36]";
  return "border-black/[0.07] bg-[#F7F6F3] text-[#817B73]";
}

export default function MarketingQueuePage() {
  const params = useParams();
  const organizationId = String(params?.organizationId || "");
  const [state, setState] = useState({ loading: true, error: "", campaigns: [] });
  const [filter, setFilter] = useState("open");

  const load = useCallback(async () => {
    if (!organizationId) return;
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const response = await fetch("/api/marketing/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId }),
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.success === false) throw new Error(payload?.error?.message || payload?.error || "Unable to load campaign queue");
      const data = payload?.data || payload;
      setState({ loading: false, error: "", campaigns: data?.campaigns || [] });
    } catch (error) {
      setState({ loading: false, error: error?.message || "Unable to load campaign queue", campaigns: [] });
    }
  }, [organizationId]);

  useEffect(() => { load(); }, [load]);

  const campaigns = state.campaigns;
  const visible = useMemo(() => {
    if (filter === "all") return campaigns;
    if (filter === "published") return campaigns.filter((row) => String(row.campaign_status || row.status).toLowerCase() === "published");
    return campaigns.filter((row) => !["published", "deleted", "cancelled"].includes(String(row.campaign_status || row.status || "").toLowerCase()));
  }, [campaigns, filter]);

  const scheduledCount = campaigns.filter((row) => ["scheduled", "queued"].includes(String(row.campaign_status || row.status || "").toLowerCase())).length;
  const readyCount = campaigns.filter((row) => ["ready", "approved"].includes(String(row.campaign_status || row.status || "").toLowerCase())).length;
  const publishedCount = campaigns.filter((row) => String(row.campaign_status || row.status || "").toLowerCase() === "published").length;

  return (
    <main className="min-h-screen bg-[#F7F6F3] p-5 text-[#191919] md:p-8">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#A37849]">Marketing Operations</div>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em]">Campaign Queue</h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[#746E66]">Organization-scoped campaign states. Publishing and paid execution remain governed by Campaigns and Creative Publish; this screen never bypasses approval.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={load} disabled={state.loading} className="inline-flex items-center gap-2 rounded-xl border border-black/[0.08] bg-white px-4 py-2.5 text-sm text-[#625B53] disabled:opacity-40"><RefreshCw className={`h-4 w-4 ${state.loading ? "animate-spin" : ""}`} /> Refresh</button>
            <Link href={`/workspace/${organizationId}/commercial/marketing/campaigns`} className="inline-flex items-center gap-2 rounded-xl bg-[#D6A66A] px-4 py-2.5 text-sm font-semibold text-[#2B2118]"><Megaphone className="h-4 w-4" /> Open Campaigns</Link>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-3">
          {[["Ready / Approved", readyCount, CheckCircle2], ["Scheduled / Queued", scheduledCount, Clock3], ["Published", publishedCount, ShieldCheck]].map(([label, value, Icon]) => (
            <div key={label} className="rounded-2xl border border-black/[0.07] bg-white p-4"><Icon className="h-4 w-4 text-[#A37849]" /><div className="mt-3 text-2xl font-semibold">{value}</div><div className="mt-1 text-[10px] uppercase tracking-[0.12em] text-[#8A8178]">{label}</div></div>
          ))}
        </section>

        <div className="flex flex-wrap gap-2">
          {[["open", "Open"], ["published", "Published"], ["all", "All"]].map(([value, label]) => (
            <button key={value} type="button" onClick={() => setFilter(value)} className={`rounded-full border px-3 py-1.5 text-[10px] font-semibold ${filter === value ? "border-[#C99A62] bg-[#FBF3E8] text-[#6B4C2E]" : "border-black/[0.07] bg-white text-[#777169]"}`}>{label}</button>
          ))}
        </div>

        {state.error ? <div className="rounded-2xl border border-red-700/15 bg-red-50 px-4 py-3 text-sm text-red-800">{state.error}</div> : null}

        <section className="overflow-hidden rounded-[28px] border border-black/[0.07] bg-white">
          <div className="border-b border-black/[0.06] px-5 py-4"><div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#A37849]">{visible.length} campaign{visible.length === 1 ? "" : "s"}</div></div>
          {state.loading ? (
            <div className="px-5 py-12 text-center text-sm text-[#817B73]">Loading campaign queue…</div>
          ) : visible.length ? (
            <div className="divide-y divide-black/[0.06]">
              {visible.map((campaign) => {
                const content = campaign.campaign_content || {};
                const status = campaign.campaign_status || campaign.status || "draft";
                const channels = Array.isArray(content.channels) ? content.channels : [];
                return (
                  <div key={campaign.id} className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_180px_150px] lg:items-center">
                    <div className="min-w-0"><div className="truncate text-sm font-semibold text-[#3E3730]">{campaign.campaign_name || "Untitled campaign"}</div><div className="mt-1 text-xs text-[#817B73]">{content.goal || content.objective || campaign.campaign_type || "Campaign"}</div><div className="mt-2 flex flex-wrap gap-1.5">{channels.slice(0, 6).map((channel) => <span key={channel} className="rounded-full border border-black/[0.06] bg-[#FAF8F5] px-2 py-1 text-[9px] text-[#777169]">{String(channel).replaceAll("_", " ")}</span>)}{channels.length > 6 ? <span className="px-1 py-1 text-[9px] text-[#9B9289]">+{channels.length - 6}</span> : null}</div></div>
                    <div className="text-xs text-[#817B73]"><div>{campaign.scheduled_at ? new Date(campaign.scheduled_at).toLocaleString() : "No schedule"}</div><div className="mt-1 text-[10px] text-[#A29A91]">{campaign.assets?.length || 0} linked asset{campaign.assets?.length === 1 ? "" : "s"}</div></div>
                    <div className="flex items-center justify-between gap-3 lg:justify-end"><span className={`rounded-full border px-2.5 py-1 text-[9px] font-semibold ${statusClass(status)}`}>{statusLabel(status)}</span><Link href={`/workspace/${organizationId}/commercial/marketing/campaigns`} className="text-[10px] font-semibold text-[#8A633C] hover:underline">Review →</Link></div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="px-5 py-12 text-center"><CheckCircle2 className="mx-auto h-6 w-6 text-emerald-600" /><div className="mt-3 text-sm font-medium text-[#514A43]">No campaigns in this view</div><div className="mt-1 text-xs text-[#918B83]">Campaigns will appear here when they are created for this organization.</div></div>
          )}
        </section>

        <div className="rounded-2xl border border-[#DDBA8B] bg-[#FFF8EC] px-4 py-3 text-xs leading-relaxed text-[#7A5A36]">Queue status is operational visibility only. Provider publishing, paid-media creation, spend authorization, retry and deletion remain behind their governed execution controls.</div>
      </div>
    </main>
  );
}
