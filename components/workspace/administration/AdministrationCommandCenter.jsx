"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Building2,
  Boxes,
  Flag,
  KeyRound,
  LoaderCircle,
  MapPin,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Users,
} from "lucide-react";

import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

function text(value) {
  return String(value ?? "").trim();
}

function adminHref(organizationId, route) {
  if (!organizationId || !route) return "#";
  return `/workspace/${organizationId}${route.startsWith("/") ? route : `/${route}`}`;
}

function titleCase(value) {
  return text(value).replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function Metric({ label, value, detail, icon: Icon, warning = false }) {
  return (
    <div className="rounded-2xl border border-black/[0.075] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
      <div className="flex items-start justify-between gap-4">
        <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-[#817D76]">{label}</div>
        <Icon size={15} className={warning ? "text-amber-700" : "text-[#A37849]"} />
      </div>
      <div className="mt-3 text-[24px] font-semibold tracking-[-0.035em] text-[#1B1A18]">{value}</div>
      <div className={`mt-1.5 text-[11px] ${warning ? "text-amber-800" : "text-[#8A867F]"}`}>{detail}</div>
    </div>
  );
}

const CONTROL_AREAS = [
  { label: "Users & access", description: "Membership, identity linkage and account lifecycle.", route: "/administration/users", icon: Users },
  { label: "Access policy", description: "Organization security and workforce access policy.", route: "/administration/access-policy", icon: ShieldCheck },
  { label: "Passkey readiness", description: "Hosted passkey coverage and verification readiness.", route: "/administration/passkey-readiness", icon: KeyRound },
  { label: "Legal entities", description: "Legal and accounting entity structure and governance.", route: "/administration/legal-entities", icon: Building2 },
  { label: "Business locations", description: "Location-specific operational context.", route: "/administration/business-locations", icon: MapPin },
  { label: "Modules & configuration", description: "Enabled capabilities and organization setup.", route: "/administration/modules", icon: Boxes },
  { label: "Integrations", description: "Connected systems and administration integrations.", route: "/administration/integrations", icon: Settings2 },
  { label: "Onboarding & setup", description: "Readiness and guided organization configuration.", route: "/administration/onboarding", icon: Flag },
];

export default function AdministrationCommandCenter({ organizationId }) {
  const businessContext = useBusinessContext() || {};
  const entityId = businessContext.entity_id || businessContext.entity?.id || null;
  const periodId = businessContext.period_id || businessContext.period?.id || null;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  async function load() {
    if (!organizationId) return;
    setLoading(true);
    setError("");
    try {
      const url = new URL("/api/workspace/administration/command-center", window.location.origin);
      url.searchParams.set("organizationId", organizationId);
      if (entityId) url.searchParams.set("entityId", entityId);
      if (periodId) url.searchParams.set("periodId", periodId);
      const response = await fetch(url.toString(), { credentials: "include", cache: "no-store" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || json?.success === false) {
        throw new Error(json?.error || `Administration failed (${response.status})`);
      }
      setData(json);
    } catch (loadError) {
      setData(null);
      setError(loadError?.message || "Administration could not be loaded");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [organizationId, entityId, periodId]);

  const metrics = data?.metrics || {};
  const queue = Array.isArray(data?.queue) ? data.queue : [];
  const sources = Array.isArray(data?.sources) ? data.sources : [];
  const sourceErrors = sources.filter((row) => row.status !== "connected");
  const structure = data?.structure || {};

  const filteredQueue = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return queue;
    return queue.filter((item) =>
      [item.title, item.detail, item.status, item.kind]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [queue, query]);

  return (
    <div className="mx-auto max-w-[1750px] space-y-5 pb-10 text-[#1B1A18]">
      <section className="rounded-[26px] border border-black/[0.075] bg-white p-6 shadow-[0_12px_38px_rgba(31,27,20,0.055)] md:p-7">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.24em] text-[#A37849]">Administration</div>
            <h1 className="mt-2 text-[31px] font-semibold tracking-[-0.04em]">Organization Control Center</h1>
            <p className="mt-2 max-w-3xl text-[13px] leading-6 text-[#6F6B64]">
              Manage organizational structure, identity and access, configuration readiness and product controls from one governed administration plane.
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-[#6F6B64]">
              <span className="rounded-full border border-black/[0.08] bg-[#FAF9F7] px-3 py-1.5">{data?.context?.organization_name || "Organization"}</span>
              <span className="rounded-full border border-black/[0.08] bg-[#FAF9F7] px-3 py-1.5">{metrics.structure?.legal_entities || 0} legal entit{metrics.structure?.legal_entities === 1 ? "y" : "ies"}</span>
              <span className="rounded-full border border-black/[0.08] bg-[#FAF9F7] px-3 py-1.5">{sourceErrors.length ? `${sourceErrors.length} source issue${sourceErrors.length === 1 ? "" : "s"}` : "Configuration sources connected"}</span>
            </div>
          </div>
          <button type="button" onClick={load} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#1F1E1B] px-3.5 text-[12px] font-medium text-white hover:bg-black disabled:opacity-50">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>
      </section>

      {error ? (
        <section className="rounded-2xl border border-red-700/15 bg-red-50 p-5 text-[12px] text-red-900">
          <div className="flex gap-3"><AlertTriangle size={18} className="mt-0.5" /><div><div className="font-semibold">Administration could not load</div><div className="mt-1">{error}</div></div></div>
        </section>
      ) : loading && !data ? (
        <div className="flex min-h-[340px] items-center justify-center rounded-2xl border border-black/[0.075] bg-white text-[13px] text-[#767169]">
          <LoaderCircle size={18} className="mr-2 animate-spin text-[#A37849]" /> Loading organization control state…
        </div>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Metric label="Members" value={metrics.identity?.active || 0} detail={`${metrics.identity?.auth_unlinked || 0} auth unlinked · ${metrics.identity?.inactive_staff_with_access || 0} access conflicts`} icon={Users} warning={(metrics.identity?.auth_unlinked || 0) > 0 || (metrics.identity?.orphan_memberships || 0) > 0 || (metrics.identity?.inactive_staff_with_access || 0) > 0} />
            <Metric label="Privileged access" value={metrics.identity?.privileged_members || 0} detail={`${metrics.access?.roles || 0} roles · ${metrics.access?.broad_permission_rows || 0} broad permission rows`} icon={KeyRound} warning={(metrics.access?.broad_permission_rows || 0) > 0} />
            <Metric label="Structure" value={metrics.structure?.legal_entities || 0} detail={`${metrics.structure?.locations || 0} locations · ${metrics.structure?.departments || 0} departments · ${metrics.structure?.teams || 0} teams`} icon={Building2} warning={(metrics.structure?.entity_reviews || 0) > 0 || (metrics.structure?.entity_config_gaps || 0) > 0} />
            <Metric label="Modules" value={metrics.product?.enabled_modules || 0} detail={`${metrics.product?.disabled_modules || 0} disabled · ${metrics.product?.feature_flags || 0} feature flags`} icon={Boxes} />
            <Metric label="Policies" value={metrics.access?.policies || 0} detail={`${metrics.audit?.recent_events || 0} recent admin audit events`} icon={ShieldCheck} warning={(metrics.access?.policies || 0) === 0} />
          </section>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
            <section className="rounded-[24px] border border-black/[0.075] bg-white p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div><div className="text-[10px] font-medium uppercase tracking-[0.17em] text-[#8A867F]">Needs review</div><h2 className="mt-1 text-[19px] font-semibold tracking-[-0.02em]">Administration work queue</h2></div>
                <label className="relative"><Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#99938B]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search administration work" className="h-9 w-full rounded-lg border border-black/[0.09] bg-[#FCFBF9] pl-8 pr-3 text-[11px] outline-none focus:border-[#D6A66A] sm:w-60" /></label>
              </div>
              <div className="mt-4 divide-y divide-black/[0.055]">
                {filteredQueue.map((item) => (
                  <Link key={item.id} href={adminHref(organizationId, item.href)} className="grid gap-2 py-3.5 first:pt-0 last:pb-0 md:grid-cols-[minmax(0,1fr)_130px]">
                    <div className="flex gap-3">
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.priority === "critical" ? "bg-red-600" : item.priority === "attention" ? "bg-amber-600" : "bg-[#A37849]"}`} />
                      <div className="min-w-0"><div className="text-[12px] font-medium text-[#37342F]">{item.title}</div><div className="mt-1 text-[10px] leading-4 text-[#817D76]">{item.detail}</div></div>
                    </div>
                    <div className="flex items-center justify-end gap-2"><span className="rounded-full border border-black/[0.07] bg-[#FAF9F7] px-2.5 py-1 text-[9px] font-medium uppercase tracking-[0.08em] text-[#6E685F]">{titleCase(item.status)}</span><ArrowRight size={12} className="text-[#AAA39A]" /></div>
                  </Link>
                ))}
                {!filteredQueue.length ? <div className="py-10 text-center"><BadgeCheck size={22} className="mx-auto text-emerald-600" /><div className="mt-3 text-[12px] font-medium text-[#4D4942]">No current administration exceptions</div><div className="mt-1 text-[10px] text-[#8A867F]">Identity, structure and configuration issues will appear here.</div></div> : null}
              </div>
            </section>

            <section className="rounded-[24px] border border-black/[0.075] bg-white p-5">
              <div className="text-[10px] font-medium uppercase tracking-[0.17em] text-[#8A867F]">Control areas</div>
              <h2 className="mt-1 text-[19px] font-semibold tracking-[-0.02em]">Organization setup & security</h2>
              <div className="mt-4 divide-y divide-black/[0.055]">
                {CONTROL_AREAS.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link key={item.route} href={adminHref(organizationId, item.route)} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#FAF9F7] text-[#A37849]"><Icon size={14} /></span>
                      <span className="min-w-0 flex-1"><span className="block text-[11px] font-medium text-[#4A4640]">{item.label}</span><span className="mt-0.5 block text-[9px] leading-4 text-[#918B83]">{item.description}</span></span>
                      <ArrowRight size={12} className="text-[#AAA39A]" />
                    </Link>
                  );
                })}
              </div>
            </section>
          </div>

          <section className="rounded-[24px] border border-black/[0.075] bg-white p-5">
            <div className="flex items-start justify-between gap-4"><div><div className="text-[10px] font-medium uppercase tracking-[0.17em] text-[#8A867F]">Organization model</div><h2 className="mt-1 text-[19px] font-semibold tracking-[-0.02em]">Current operating structure</h2></div><Building2 size={17} className="text-[#A37849]" /></div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              {[
                ["Legal entities", structure.entities || [], "display_name", "legal_name"],
                ["Locations", structure.locations || [], "name", "code"],
                ["Business units", structure.business_units || [], "name", "code"],
                ["Departments", structure.departments || [], "name", "code"],
                ["Teams", structure.teams || [], "name", "code"],
              ].map(([label, rows, primary, secondary]) => (
                <div key={label} className="rounded-xl border border-black/[0.065] bg-[#FCFBF9] p-3">
                  <div className="text-[9px] font-medium uppercase tracking-[0.13em] text-[#918B83]">{label} · {rows.length}</div>
                  <div className="mt-2 space-y-1.5">
                    {rows.slice(0, 4).map((row) => <div key={row.id} className="truncate text-[10px] text-[#5D5851]">{row[primary] || row[secondary] || row.id}</div>)}
                    {!rows.length ? <div className="text-[10px] text-[#AAA39A]">Not configured</div> : null}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
