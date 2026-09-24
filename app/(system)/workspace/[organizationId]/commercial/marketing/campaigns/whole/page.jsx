"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  Brain,
  Building2,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Database,
  Gauge,
  ImageIcon,
  Loader2,
  Megaphone,
  Radio,
  RefreshCw,
  Repeat2,
  Route,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Upload,
  WalletCards,
  X,
} from "lucide-react";

function money(value, currency = null) {
  if (value === null || value === undefined) return "Not aggregated";
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

function campaignCurrency(campaign = {}, groupCurrency = null) {
  const content = campaign.campaign_content || {};
  if (content.currency_code) return String(content.currency_code).toUpperCase();
  if (groupCurrency) return String(groupCurrency).toUpperCase();
  if (content.campaign_budget_thb != null || content.monthly_budget_thb != null) return "THB";
  return null;
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

  const loadGroups = useCallback(async ({ quiet = false } = {}) => {
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
          payload?.message || payload?.error || "Unable to load multi-organization campaigns",
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
      setError(loadError.message || "Unable to load multi-organization campaigns");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    if (organizationId) loadGroups();
  }, [loadGroups, organizationId]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#F7F6F3] p-8 text-[#2D2822]">
        <div className="mx-auto max-w-[1500px] text-[#675F57]">
          Loading multi-organization campaigns...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F7F6F3] p-6 text-[#2D2822] lg:p-10">
      <div className="mx-auto max-w-[1500px]">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-[#D6A66A]">
              Multi-Organization Marketing
            </div>
            <h1 className="mt-3 text-5xl font-light lg:text-6xl">Multi-Organization Campaign</h1>
            <p className="mt-4 max-w-3xl text-[#71685F]">
              Coordinate one initiative across multiple organizations while keeping each organization’s audience, creative, channels, currency, publishing identities and execution authority isolated.
            </p>
          </div>

          <button
            onClick={() => loadGroups()}
            className="inline-flex items-center gap-2 rounded-2xl border border-black/[0.08] bg-white px-5 py-3 text-sm text-[#49423B] transition hover:bg-[#FBF8F3]"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        </div>

        {error ? (
          <div className="mb-6 rounded-2xl border border-red-700/15 bg-red-50 px-5 py-4 text-red-800">
            {error}
          </div>
        ) : null}

        {!groups.length ? (
          <div className="rounded-[32px] border border-black/[0.08] bg-white p-12 text-center">
            <Megaphone className="mx-auto h-9 w-9 text-[#D6A66A]" />
            <h2 className="mt-5 text-2xl font-light">No multi-organization campaigns yet</h2>
            <p className="mt-2 text-[#7B7168]">
              Use this only when one initiative needs to coordinate two or more organizations. Single-organization customers stay in the standard Campaign workspace.
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
                        : "border-black/[0.08] bg-white hover:border-black/[0.14]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="rounded-full border border-[#DDBA8B] bg-[#FFF8EC] px-3 py-1 text-[11px] uppercase tracking-[0.15em] text-[#7A5A36]">
                        {group.campaign_status || "draft"}
                      </span>
                      <span className="text-xs text-[#91877D]">
                        {group.members?.length || 0} organizations
                      </span>
                    </div>
                    <h2 className="mt-4 text-lg font-medium leading-snug">
                      {group.campaign_group_name}
                    </h2>
                    <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-[#7B7168]">
                      {group.objective || "Coordinated campaign"}
                    </p>
                    <div className="mt-4 text-sm text-[#8A633C]">
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
  const mixedCurrencies = content.currency_mode === "PER_ORGANIZATION";
  const budgetsByOrganization = content.budgets_by_organization || {};
  const childBudget = mixedCurrencies ? null : members.reduce(
    (sum, member) => sum + Number(member.campaign?.budget || 0),
    0,
  );
  const masterBudget = mixedCurrencies ? null : Number(
    group.budget || content.master_campaign_budget || content.total_monthly_budget_thb || childBudget || 0,
  );
  const sharedBudget = mixedCurrencies ? null : Math.max(0, masterBudget - childBudget);
  const sharedCosts = content.shared_monthly_costs || content.shared_monthly_costs_thb || {};
  const perOrganizationBudgetLabel = Object.entries(budgetsByOrganization).map(([organizationId, budget]) => {
    const member = members.find((item) => item.organization_id === organizationId);
    return `${member?.organization?.name || "Organization"}: ${money(budget?.amount || 0, budget?.currency || null)}`;
  }).join(" · ");

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
      <div className="rounded-[32px] border border-black/[0.08] bg-white p-6 lg:p-8">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-4xl">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-[#DDBA8B] bg-[#FFF8EC] px-3 py-1 text-[11px] uppercase tracking-[0.15em] text-[#7A5A36]">
                {group.campaign_status || "draft"}
              </span>
              <span className="text-xs uppercase tracking-[0.15em] text-[#91877D]">
                {labelize(group.campaign_group_type)}
              </span>
            </div>
            <h2 className="mt-5 text-3xl font-light leading-tight lg:text-4xl">
              {group.campaign_group_name}
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-[#574F48]">{group.objective}</p>
          </div>

          <div className="rounded-2xl border border-black/[0.08] bg-white px-5 py-4 text-right">
            <div className="text-xs uppercase tracking-[0.15em] text-[#91877D]">Spend State</div>
            <div className="mt-2 text-sm text-amber-800">
              {labelize(content.spend_state || "planned_not_authorized")}
            </div>
          </div>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Metric
            icon={WalletCards}
            label="Master Campaign Budget"
            value={mixedCurrencies ? "Per organization" : money(masterBudget, group.currency_code)}
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
            label="Organization Campaign Budgets"
            value={mixedCurrencies ? (perOrganizationBudgetLabel || "Per organization") : money(childBudget, group.currency_code)}
          />
          <MiniMetric
            label="Shared Campaign Costs"
            value={mixedCurrencies ? "Not aggregated" : money(sharedBudget, group.currency_code)}
          />
          <MiniMetric label="Creative Assets" value={`${totalAssets}`} />
          <MiniMetric label="Approved / Ready" value={`${totalApprovedAssets}`} />
        </div>

        {Object.keys(sharedCosts).length ? (
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-[#71685F]">
            {Object.entries(sharedCosts).map(([key, value]) => (
              <span
                key={key}
                className="rounded-full border border-black/[0.08] bg-[#FBF8F3] px-3 py-2"
              >
                {labelize(key)}: {money(value, group.currency_code)}
              </span>
            ))}
          </div>
        ) : null}

        <div className="mt-5 rounded-2xl border border-[#DDBA8B] bg-[#FFF8EC] px-4 py-3 text-sm leading-relaxed text-[#7A5A36]">
          Spend Authorized: 0. Budget figures are planning only; choosing creative does not authorize or activate provider spend.
        </div>
      </div>

      <CampaignOperatingPlan group={group} />

      <div className="rounded-[32px] border border-black/[0.08] bg-white p-6 lg:p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-[#D6A66A]">Execution Map</div>
            <h3 className="mt-2 text-3xl font-light">Organization Campaigns</h3>
          </div>
          <div className="text-sm text-[#857B71]">
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

      <div className="rounded-[32px] border border-black/[0.08] bg-white p-6 lg:p-8">
        <div className="flex items-center gap-3">
          {blockers.length ? (
            <CircleAlert className="h-5 w-5 text-amber-700" />
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
                className="rounded-2xl border border-[#DDBA8B] bg-[#FFF8EC] px-4 py-3 text-sm text-[#7A5A36]"
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

function CampaignOperatingPlan({ group }) {
  const content = group.campaign_content || {};
  const members = group.members || [];
  const flow = list(content.primary_flow);
  const allChannels = [
    ...new Set(
      members.flatMap((member) => {
        const content = member.campaign?.campaign_content || {};
        return list(content.channel_surfaces).length
          ? list(content.channel_surfaces)
          : list(content.channels);
      }),
    ),
  ];
  const allMetrics = [
    ...new Set(
      members.flatMap((member) => list(member.campaign?.campaign_content?.measurement)),
    ),
  ];
  const totalCopy = members.reduce(
    (sum, member) => sum + list(member.campaign?.campaign_content?.copy_variants).length,
    0,
  );
  const totalPillars = members.reduce(
    (sum, member) =>
      sum + list(member.campaign?.campaign_content?.creative_direction?.content_pillars).length,
    0,
  );

  const phases = [
    {
      label: "Days 1–30",
      title: "Learn & Establish",
      text: "Build the creative baseline, validate messages and audiences, connect missing channels, and establish conversion tracking before scaling anything.",
    },
    {
      label: "Days 31–60",
      title: "Optimize & Expand",
      text: "Use actual response quality to strengthen winning messages, replace weak creative, improve follow-up, and expand only the combinations producing qualified business outcomes.",
    },
    {
      label: "Days 61–90",
      title: "Scale & Compound",
      text: "Concentrate effort on proven offers, creative and audiences; add retargeting, review capture and referral loops; document what Avantiqo learned for the next campaign.",
    },
  ];

  return (
    <div className="rounded-[32px] border border-[#D6A66A]/20 bg-[#D6A66A]/[0.035] p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-[#D6A66A]">
            <Brain className="h-4 w-4" /> 90-Day Campaign Operating Plan
          </div>
          <h3 className="mt-2 text-3xl font-light">Avantiqo Control Layer</h3>
          <p className="mt-3 max-w-4xl text-sm leading-relaxed text-[#71685F]">
            Review-only operating plan derived from the current campaign strategy. Nothing below publishes content, starts providers, authorizes spend or changes campaign status.
          </p>
        </div>
        <span className="rounded-full border border-[#DDBA8B] bg-[#FFF8EC] px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-[#7A5A36]">
          Review Only · Not Activated
        </span>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <OperatingStatus icon={Brain} label="Campaign Operator" value="Avantiqo AI" detail="Autonomous · Governed" />
        <OperatingStatus icon={Sparkles} label="Content & Copy" value="Avantiqo controlled" detail={`${totalCopy} current copy variants`} />
        <OperatingStatus icon={ImageIcon} label="Creative Production" value="Creative Studio" detail={`${totalPillars} creative pillars available`} />
        <OperatingStatus icon={ShieldCheck} label="Paid Spend" value="Human authorization" detail="0 authorized" warning />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        {phases.map((phase, index) => (
          <div key={phase.label} className="rounded-2xl border border-black/[0.08] bg-[#FBF8F3] p-5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs uppercase tracking-[0.16em] text-[#D6A66A]">Phase {index + 1}</span>
              <span className="text-xs text-[#91877D]">{phase.label}</span>
            </div>
            <div className="mt-3 text-lg text-[#39342F]">{phase.title}</div>
            <p className="mt-2 text-sm leading-relaxed text-[#71685F]">{phase.text}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <OperatingPanel icon={Target} title="Strategy & Content System">
          <PlanRow label="Master objective" value={group.objective || "—"} />
          <PlanRow label="Organization strategies" value={`${members.length} separate campaign strategies`} />
          <PlanRow label="Copy system" value={`${totalCopy} approved-for-review message variants currently stored`} />
          <PlanRow label="Creative system" value={`${totalPillars} campaign content pillars feeding Creative Studio`} />
        </OperatingPanel>

        <OperatingPanel icon={Radio} title="Channel Plan">
          <TagCloud items={allChannels} empty="No campaign channels configured" />
          <p className="mt-4 text-xs leading-relaxed text-[#857B71]">
            Organic and paid activity stays with each business. Connected channels can be prepared, but paid activation still requires explicit authorization.
          </p>
        </OperatingPanel>

        <OperatingPanel icon={Route} title="Conversion Flow">
          <FlowRail items={flow.length ? flow : ["Content", "Lead capture", "CRM", "Follow-up", "Conversion"]} />
          <p className="mt-4 text-xs leading-relaxed text-[#857B71]">
            Avantiqo should judge marketing by qualified business outcomes, not impressions alone. Each organization keeps its own CTA and conversion destination.
          </p>
        </OperatingPanel>

        <OperatingPanel icon={CalendarClock} title="Publishing & Content Calendar">
          <PlanRow label="Campaign window" value={`${group.start_date || "—"} → ${group.end_date || "—"}`} />
          <PlanRow label="Calendar state" value="Needs schedule generation" warning />
          <PlanRow label="Publishing state" value="Not activated" warning />
          <PlanRow label="Next control" value="Generate channel-by-channel content calendar for review" />
        </OperatingPanel>

        <OperatingPanel icon={Gauge} title="Optimization Rules">
          <PlanRow label="Primary rule" value="Optimize for qualified outcomes, not vanity engagement" />
          <PlanRow label="Creative rule" value="Replace weak concepts; preserve and iterate proven winners" />
          <PlanRow label="Budget rule" value="Never increase or move paid spend outside authorization policy" />
          <PlanRow label="Learning rule" value="Feed results back into organization-specific campaign memory" />
        </OperatingPanel>

        <OperatingPanel icon={Repeat2} title="Measurement & Learning">
          <TagCloud items={allMetrics} empty="No success metrics configured" />
          <p className="mt-4 text-xs leading-relaxed text-[#857B71]">
            The 90-day test should finish with a reusable learning record: which message, creative, audience, channel and follow-up path produced the strongest business result for each organization.
          </p>
        </OperatingPanel>
      </div>

      <div className="mt-6 rounded-2xl border border-black/[0.08] bg-white p-5">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-[#D6A66A]">
          <ShieldCheck className="h-4 w-4" /> Governance
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <PolicyCell label="Strategy" value="Avantiqo may plan" />
          <PolicyCell label="Copy & Creative Direction" value="Avantiqo may create" />
          <PolicyCell label="Publishing" value="Not activated" warning />
          <PolicyCell label="Paid Spend" value="Explicit authorization required" warning />
        </div>
      </div>
    </div>
  );
}

function OperatingStatus({ icon: Icon, label, value, detail, warning = false }) {
  return (
    <div className="rounded-2xl border border-black/[0.08] bg-[#FBF8F3] p-4">
      <Icon className={`h-4 w-4 ${warning ? "text-amber-700" : "text-[#D6A66A]"}`} />
      <div className="mt-3 text-[10px] uppercase tracking-[0.15em] text-[#91877D]">{label}</div>
      <div className="mt-1 text-sm text-[#413B35]">{value}</div>
      <div className="mt-1 text-xs text-[#857B71]">{detail}</div>
    </div>
  );
}

function OperatingPanel({ icon: Icon, title, children }) {
  return (
    <div className="rounded-2xl border border-black/[0.08] bg-[#FBF8F3] p-5">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-[#D6A66A]" />
        <div className="text-sm font-medium text-[#413B35]">{title}</div>
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function PlanRow({ label, value, warning = false }) {
  return (
    <div className="flex items-start justify-between gap-5 border-b border-black/[0.06] py-2.5 last:border-0">
      <span className="text-xs text-[#91877D]">{label}</span>
      <span className={`max-w-[65%] text-right text-xs leading-relaxed ${warning ? "text-amber-800" : "text-[#574F48]"}`}>
        {value}
      </span>
    </div>
  );
}

function PolicyCell({ label, value, warning = false }) {
  return (
    <div className="rounded-xl border border-black/[0.07] bg-white p-3">
      <div className="text-[10px] uppercase tracking-[0.13em] text-[#A59A8F]">{label}</div>
      <div className={`mt-1 text-xs leading-relaxed ${warning ? "text-amber-800" : "text-[#574F48]"}`}>{value}</div>
    </div>
  );
}

function TagCloud({ items, empty }) {
  if (!items?.length) return <div className="text-sm text-[#857B71]">{empty}</div>;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <span key={item} className="rounded-full border border-black/[0.08] bg-white px-3 py-2 text-xs text-[#675F57]">
          {item}
        </span>
      ))}
    </div>
  );
}

function FlowRail({ items }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {items.map((item, index) => (
        <div key={`${item}-${index}`} className="flex items-center gap-2">
          <span className="rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-xs text-[#5F574F]">{item}</span>
          {index < items.length - 1 ? <ArrowRight className="h-3.5 w-3.5 text-[#D6A66A]/60" /> : null}
        </div>
      ))}
    </div>
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
    <article className="rounded-[28px] border border-black/[0.08] bg-white p-5 lg:p-6">
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
          <span className="rounded-full border border-black/[0.08] bg-white px-3 py-1 text-[11px] uppercase tracking-[0.12em] text-[#675F57]">
            {campaign.campaign_status || "draft"}
          </span>
          <span className="rounded-full border border-[#DDBA8B] bg-[#FFF8EC] px-3 py-1 text-[11px] uppercase tracking-[0.12em] text-[#7A5A36]">
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
                  className="relative aspect-square overflow-hidden rounded-xl border border-black/[0.08] bg-white"
                >
                  {asset.is_video ? (
                    <video
                      src={asset.preview_url}
                      className="h-full w-full object-cover"
                      muted
                      preload="metadata"
                    />
                  ) : (
                    <Image
                      src={asset.preview_url}
                      alt={asset.name || "Campaign asset"}
                      fill
                      sizes="105px"
                      className="object-cover"
                    />
                  )}
                </div>
              ))}
            </div>
          ) : null}

          <div className="rounded-2xl border border-black/[0.08] bg-white p-4">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-[#857B71]">
              <ImageIcon className="h-4 w-4 text-[#D6A66A]" /> Creative Source
            </div>

            <div className="mt-3 grid gap-2">
              <Link
                href={studioHref}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#D6A66A]/25 bg-[#D6A66A]/10 px-3 py-3 text-sm font-medium text-[#8A633C] transition hover:bg-[#D6A66A]/15"
              >
                <Sparkles className="h-4 w-4" /> Let Studio Create It
              </Link>

              <button
                type="button"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-black/[0.08] bg-white px-3 py-3 text-sm font-medium text-[#49423B] transition hover:bg-[#FBF8F3] disabled:opacity-50"
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
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-black/[0.08] bg-white px-3 py-3 text-sm font-medium text-[#49423B] transition hover:bg-[#FBF8F3]"
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

            <p className="mt-3 text-xs leading-relaxed text-[#91877D]">
              All three choices remain scoped to {member.organization?.name || "this organization"}. Creative selection never authorizes paid spend.
            </p>

            {message ? (
              <p className="mt-3 text-xs leading-relaxed text-[#5F574F]">{message}</p>
            ) : null}
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SmallStat label="Budget" value={money(campaign.budget, campaignCurrency(campaign, group.currency_code))} />
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
            <ListBlock
              title="Channels"
              items={list(campaignContent.channel_surfaces).length ? list(campaignContent.channel_surfaces) : list(campaignContent.channels)}
            />
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

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/[0.08] pt-4">
            <span className="text-xs text-[#91877D]">
              Media is isolated to {member.organization?.name || "this organization"}.
            </span>
            <Link
              href={`/workspace/${member.organization_id}/commercial/marketing/campaigns`}
              className="inline-flex items-center gap-2 text-sm text-[#8A633C] transition hover:text-[#2D2822]"
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
              <div className="mt-1 text-sm text-[#71685F]">
                Only visual assets belonging to {member.organization?.name || "this organization"} are shown.
              </div>
            </div>
            <button
              type="button"
              onClick={() => setLibraryOpen(false)}
              className="rounded-xl border border-black/[0.08] bg-white p-2 text-[#675F57] hover:text-[#2D2822]"
              aria-label="Close asset database"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#91877D]" />
              <input
                value={libraryQuery}
                onChange={(event) => setLibraryQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") searchLibrary();
                }}
                placeholder="Search image, filename or asset type"
                className="w-full rounded-xl border border-black/[0.08] bg-white py-3 pl-10 pr-4 text-sm text-[#2D2822] outline-none placeholder:text-[#A59A8F] focus:border-[#D6A66A]/40"
              />
            </div>
            <button
              type="button"
              onClick={() => searchLibrary()}
              disabled={libraryLoading}
              className="inline-flex items-center gap-2 rounded-xl border border-black/[0.08] bg-white px-4 text-sm text-[#49423B] disabled:opacity-50"
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
            <div className="mt-6 flex items-center gap-2 text-sm text-[#7B7168]">
              <Loader2 className="h-4 w-4 animate-spin" /> Searching organization media...
            </div>
          ) : libraryAssets.length ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {libraryAssets.map((asset) => (
                <div
                  key={asset.id}
                  className="overflow-hidden rounded-2xl border border-black/[0.08] bg-[#F5F1EB]"
                >
                  <div className="relative aspect-[4/3] overflow-hidden bg-white">
                    {asset.is_video ? (
                      <video
                        src={asset.preview_url}
                        className="h-full w-full object-cover"
                        muted
                        preload="metadata"
                      />
                    ) : (
                      <Image
                        src={asset.preview_url}
                        alt={asset.name || "Asset"}
                        fill
                        sizes="(min-width: 1280px) 25vw, (min-width: 640px) 50vw, 100vw"
                        className="object-cover"
                      />
                    )}
                  </div>
                  <div className="p-3">
                    <div className="truncate text-xs font-medium text-[#49423B]">
                      {asset.name}
                    </div>
                    <div className="mt-1 text-[10px] uppercase tracking-[0.12em] text-[#91877D]">
                      {labelize(asset.asset_type)}
                    </div>
                    <button
                      type="button"
                      disabled={asset.attached || attachingId === asset.id}
                      onClick={() => attachAsset(asset.id)}
                      className={`mt-3 w-full rounded-lg border px-3 py-2 text-xs transition ${
                        asset.attached
                          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
                          : "border-[#D6A66A]/25 bg-[#D6A66A]/10 text-[#8A633C] hover:bg-[#D6A66A]/15"
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
            <div className="mt-5 rounded-2xl border border-black/[0.08] bg-[#FBF8F3] p-6 text-center text-sm text-[#857B71]">
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
      <div className="flex aspect-[4/3] flex-col items-center justify-center rounded-[22px] border border-dashed border-black/[0.10] bg-white p-8 text-center">
        <ImageIcon className="h-9 w-9 text-[#B0A69B]" />
        <div className="mt-4 text-sm text-[#5F574F]">No campaign image selected yet</div>
        <div className="mt-1 max-w-xs text-xs leading-relaxed text-[#91877D]">
          Choose Studio, upload your own, or search {organizationName || "the organization"} asset database.
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[22px] border border-black/[0.08] bg-[#F7F6F3]">
      <div className="relative aspect-[4/3] overflow-hidden">
        {asset.is_video ? (
          <video
            src={asset.preview_url}
            controls
            className="h-full w-full object-cover"
            preload="metadata"
          />
        ) : (
          <Image
            src={asset.preview_url}
            alt={asset.name || "Campaign creative"}
            fill
            sizes="(min-width: 1280px) 420px, 100vw"
            className="object-cover"
          />
        )}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-black/[0.08] bg-[#F7F6F3] px-4 py-3">
        <div className="min-w-0">
          <div className="truncate text-xs text-[#504941]">
            {asset.name || "Campaign creative"}
          </div>
          <div className="mt-1 text-[10px] uppercase tracking-[0.12em] text-[#91877D]">
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
          : "border-black/[0.08] bg-white"
      }`}
    >
      <div className="text-[10px] uppercase tracking-[0.16em] text-[#91877D]">{title}</div>
      <p
        className={`mt-2 leading-relaxed ${
          emphasized ? "text-base text-[#F0D5AE]" : "text-sm text-[#574F48]"
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
    <div className="rounded-2xl border border-black/[0.08] bg-white p-4">
      <div className="text-[10px] uppercase tracking-[0.16em] text-[#91877D]">{title}</div>
      <div className="mt-3 space-y-2">
        {items.map((item, index) => (
          <div
            key={`${item}-${index}`}
            className="flex gap-2 text-sm leading-relaxed text-[#5F574F]"
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
    <div className="rounded-2xl border border-black/[0.08] bg-[#FBF8F3] p-5">
      <Icon className="h-5 w-5 text-[#D6A66A]" />
      <div className="mt-4 text-xs uppercase tracking-[0.15em] text-[#91877D]">{label}</div>
      <div
        className={`mt-2 text-[#39342F] ${
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
    <div className="rounded-2xl border border-black/[0.08] bg-[#FBF8F3] p-4">
      <div className="text-xs uppercase tracking-[0.14em] text-[#91877D]">{label}</div>
      <div className="mt-2 text-lg text-[#413B35]">{value}</div>
    </div>
  );
}

function SmallStat({ label, value, good }) {
  return (
    <div className="rounded-xl border border-black/[0.08] bg-white p-3">
      <div className="text-[10px] uppercase tracking-[0.13em] text-[#91877D]">{label}</div>
      <div
        className={`mt-1 text-xs leading-relaxed ${
          good === true
            ? "text-emerald-300"
            : good === false
              ? "text-amber-800"
              : "text-[#504941]"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
