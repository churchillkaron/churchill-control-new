"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Megaphone,
  RefreshCw,
  WalletCards,
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

  async function loadGroups() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/marketing/campaign-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.message || "Unable to load whole campaigns");
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
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-black p-8 text-white">
        <div className="mx-auto max-w-[1500px] text-white/50">Loading whole campaign...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black p-6 text-white lg:p-10">
      <div className="mx-auto max-w-[1500px]">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-[#D6A66A]">Multi-Organization Marketing</div>
            <h1 className="mt-3 text-5xl font-light lg:text-6xl">Whole Campaign</h1>
            <p className="mt-4 max-w-3xl text-white/45">
              Coordinate one marketing initiative across multiple companies, venues and brands while every child campaign keeps its own organization, budget, channels and execution controls.
            </p>
          </div>
          <button
            onClick={loadGroups}
            className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm text-white/70 transition hover:bg-white/[0.08]"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        </div>

        {error ? (
          <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-red-200">{error}</div>
        ) : null}

        {!groups.length ? (
          <div className="rounded-[32px] border border-white/10 bg-white/[0.03] p-12 text-center">
            <Megaphone className="mx-auto h-9 w-9 text-[#D6A66A]" />
            <h2 className="mt-5 text-2xl font-light">No whole campaigns yet</h2>
            <p className="mt-2 text-white/40">Create a master campaign when one initiative needs to coordinate several organizations.</p>
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
                      <span className="text-xs text-white/30">{group.members?.length || 0} organizations</span>
                    </div>
                    <h2 className="mt-4 text-lg font-medium leading-snug">{group.campaign_group_name}</h2>
                    <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-white/40">{group.objective || "Coordinated campaign"}</p>
                    <div className="mt-4 text-sm text-[#E6C18C]">{money(group.budget, group.currency_code)} total / month</div>
                  </button>
                );
              })}
            </aside>

            {selected ? <WholeCampaignDetail group={selected} /> : null}
          </div>
        )}
      </div>
    </main>
  );
}

function WholeCampaignDetail({ group }) {
  const content = group.campaign_content || {};
  const members = group.members || [];
  const connected = members.filter((member) => metaState(member.campaign?.campaign_content?.meta_connection).ready).length;
  const totalAssets = members.reduce((sum, member) => sum + Number(member.campaign?.asset_count || 0), 0);
  const totalApprovedAssets = members.reduce((sum, member) => sum + Number(member.campaign?.approved_asset_count || 0), 0);
  const childBudget = members.reduce((sum, member) => sum + Number(member.campaign?.budget || 0), 0);
  const blockers = members.flatMap((member) => {
    const issues = [];
    if (!metaState(member.campaign?.campaign_content?.meta_connection).ready) issues.push(`${member.organization?.name}: connect paid channel`);
    if (!member.campaign?.asset_count) issues.push(`${member.organization?.name}: add or generate creative`);
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
              <span className="text-xs uppercase tracking-[0.15em] text-white/30">{labelize(group.campaign_group_type)}</span>
            </div>
            <h2 className="mt-5 text-3xl font-light leading-tight lg:text-4xl">{group.campaign_group_name}</h2>
            <p className="mt-4 text-lg leading-relaxed text-white/60">{group.objective}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/30 px-5 py-4 text-right">
            <div className="text-xs uppercase tracking-[0.15em] text-white/30">Spend State</div>
            <div className="mt-2 text-sm text-amber-200">{labelize(content.spend_state || "planned_not_authorized")}</div>
          </div>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Metric icon={WalletCards} label="Total Monthly Budget" value={money(childBudget || group.budget, group.currency_code)} />
          <Metric icon={Building2} label="Organizations" value={`${members.length}`} />
          <Metric icon={CheckCircle2} label="Paid Channel Ready" value={`${connected} / ${members.length}`} />
          <Metric icon={CalendarDays} label="Campaign Period" value={`${group.start_date || "—"} → ${group.end_date || "—"}`} compact />
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <MiniMetric label="Creative Assets" value={`${totalAssets}`} />
          <MiniMetric label="Approved / Ready Assets" value={`${totalApprovedAssets}`} />
          <MiniMetric label="Spend Authorized" value="THB 0" />
        </div>
      </div>

      <div className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 lg:p-8">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-[#D6A66A]">Execution Map</div>
            <h3 className="mt-2 text-3xl font-light">Organization Campaigns</h3>
          </div>
          <div className="text-sm text-white/35">Each child remains financially and operationally isolated.</div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {members.map((member) => {
            const campaign = member.campaign || {};
            const campaignContent = campaign.campaign_content || {};
            const meta = metaState(campaignContent.meta_connection);
            return (
              <div key={member.id} className="rounded-[24px] border border-white/10 bg-black/30 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-xs uppercase tracking-[0.14em] text-[#D6A66A]">{member.organization?.name || "Organization"}</div>
                    <h4 className="mt-2 text-lg font-medium leading-snug">{campaign.campaign_name}</h4>
                  </div>
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] uppercase tracking-[0.12em] text-white/50">
                    {campaign.campaign_status || "draft"}
                  </span>
                </div>

                <p className="mt-4 text-sm leading-relaxed text-white/50">{campaignContent.goal || campaignContent.core_message || "Campaign plan"}</p>

                <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                  <SmallStat label="Budget" value={money(campaign.budget)} />
                  <SmallStat label="Assets" value={`${campaign.asset_count || 0}`} />
                  <SmallStat label="CTA" value={campaignContent.primary_cta || "—"} />
                  <SmallStat label="Meta" value={meta.label} good={meta.ready} />
                </div>

                <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4">
                  <span className="text-xs text-white/30">{labelize(campaignContent.spend_state || "planned_not_authorized")}</span>
                  <Link
                    href={`/workspace/${member.organization_id}/commercial/marketing/campaigns`}
                    className="inline-flex items-center gap-2 text-sm text-[#E6C18C] transition hover:text-white"
                  >
                    Open organization <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 lg:p-8">
        <div className="flex items-center gap-3">
          {blockers.length ? <CircleAlert className="h-5 w-5 text-amber-300" /> : <CheckCircle2 className="h-5 w-5 text-emerald-300" />}
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-[#D6A66A]">Launch Readiness</div>
            <h3 className="mt-1 text-2xl font-light">{blockers.length ? `${blockers.length} items need attention` : "Ready for approval workflow"}</h3>
          </div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {blockers.length ? blockers.map((blocker) => (
            <div key={blocker} className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3 text-sm text-amber-100/80">{blocker}</div>
          )) : (
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-3 text-sm text-emerald-100/80">All participating organizations have the minimum channel and creative prerequisites.</div>
          )}
        </div>
      </div>
    </section>
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
      <div className={`mt-1 text-xs leading-relaxed ${good === true ? "text-emerald-300" : good === false ? "text-amber-200" : "text-white/65"}`}>{value}</div>
    </div>
  );
}
