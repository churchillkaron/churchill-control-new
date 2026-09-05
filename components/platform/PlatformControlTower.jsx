"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  BrainCircuit,
  Building2,
  ChevronRight,
  CircleDollarSign,
  Database,
  Layers3,
  Search,
  Server,
  ShieldCheck,
  TriangleAlert,
  WalletCards,
  Zap,
} from "lucide-react";

const TABS = ["Health", "Customers", "Revenue", "Intelligence", "Operations"];

function text(value) {
  return String(value ?? "").trim();
}

function firstValue(source, keys, fallback = "") {
  for (const key of keys) {
    const value = source?.[key];
    if (value !== undefined && value !== null && text(value)) return value;
  }
  return fallback;
}

function listValue(source, keys) {
  for (const key of keys) {
    const value = source?.[key];
    if (Array.isArray(value)) return value.map(text).filter(Boolean);
    if (typeof value === "string" && value.trim()) {
      return value
        .split(/[;,]/)
        .map(item => item.trim())
        .filter(Boolean);
    }
  }
  return [];
}

function eventCorpus(event) {
  const scalar = [
    event?.event_type,
    event?.type,
    event?.name,
    event?.action,
    event?.status,
    event?.severity,
    event?.message,
    event?.description,
  ]
    .map(text)
    .filter(Boolean)
    .join(" ");

  let payload = "";
  try {
    payload = JSON.stringify(event?.payload || event?.metadata || event?.data || {});
  } catch {
    payload = "";
  }

  return `${scalar} ${payload}`.toLowerCase();
}

function eventTitle(event) {
  return text(
    firstValue(event, ["title", "message", "event_type", "type", "name", "action"], "Platform activity"),
  )
    .replaceAll("_", " ")
    .replace(/\s+/g, " ");
}

function eventWhen(event) {
  const value = firstValue(event, ["created_at", "timestamp", "occurred_at", "updated_at"], null);
  if (!value) return "Time unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time unavailable";
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function money(value, currency = "THB") {
  const number = Number(value || 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number.isFinite(number) ? number : 0);
}

function number(value) {
  const parsed = Number(value || 0);
  return new Intl.NumberFormat("en-US").format(Number.isFinite(parsed) ? parsed : 0);
}

function statusLabel(org) {
  return text(firstValue(org, ["status", "lifecycle_status", "state"], "Configured"));
}

function isNegativeEvent(event) {
  return /(critical|failed|failure|error|blocked|warning|action.required|needs.action|degraded)/i.test(
    eventCorpus(event),
  );
}

function isCriticalEvent(event) {
  return /(critical|fatal|sev.?1|p0|outage)/i.test(eventCorpus(event));
}

function isAiRecord(record) {
  const source = `${text(record?.id)} ${text(record?.name)} ${text(record?.title)} ${text(record?.description)} ${eventCorpus(record)}`;
  return /(\bai\b|intelligence|model|learning|inference|voice|video|image|music|code)/i.test(source);
}

function isLearningEvent(event) {
  return /(learning|evidence candidate|knowledge|observation)/i.test(eventCorpus(event));
}

function isCertificationEvent(event) {
  return /(certif|benchmark|production.certified|quality gate)/i.test(eventCorpus(event));
}

function orgName(org) {
  return text(firstValue(org, ["name", "legal_name", "display_name"], "Unnamed organization"));
}

function orgType(org) {
  return text(firstValue(org, ["organization_type", "type", "industry", "industry_id"], "Organization"));
}

function orgModules(org) {
  return listValue(org, ["enabled_modules", "modules", "module_ids", "capabilities"]);
}

function metricTone(tone) {
  if (tone === "danger") return "border-red-500/20 bg-red-500/[0.06] text-red-300";
  if (tone === "warning") return "border-amber-400/20 bg-amber-400/[0.06] text-amber-200";
  if (tone === "good") return "border-emerald-400/20 bg-emerald-400/[0.05] text-emerald-200";
  return "border-white/[0.08] bg-white/[0.035] text-white";
}

function Metric({ icon: Icon, label, value, meta, tone = "neutral" }) {
  return (
    <div className={`rounded-[20px] border p-4 ${metricTone(tone)}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/42">{label}</span>
        <Icon size={15} className="text-[#D6A66A]" />
      </div>
      <div className="mt-4 text-[26px] font-medium tracking-[-0.035em] text-white">{value}</div>
      <div className="mt-1 text-[11px] leading-5 text-white/42">{meta}</div>
    </div>
  );
}

function SectionHeader({ eyebrow, title, description, action }) {
  return (
    <div className="flex flex-col gap-3 border-b border-white/[0.07] pb-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-[#D6A66A]">{eyebrow}</div>
        <h2 className="mt-2 text-[22px] font-medium tracking-[-0.025em] text-white">{title}</h2>
        {description ? <p className="mt-1 max-w-2xl text-[12px] leading-5 text-white/42">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

function EventRow({ event, organizationsById }) {
  const organizationId = text(event?.organization_id);
  const organization = organizationsById.get(organizationId);
  const negative = isNegativeEvent(event);

  return (
    <div className="flex items-start gap-3 border-b border-white/[0.06] py-3 last:border-b-0">
      <div className={`mt-1 h-2 w-2 shrink-0 rounded-full ${negative ? "bg-amber-300" : "bg-emerald-300"}`} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12px] font-medium text-white/82">{eventTitle(event)}</div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-white/35">
          <span>{organization ? orgName(organization) : organizationId || "Platform"}</span>
          <span>{eventWhen(event)}</span>
        </div>
      </div>
    </div>
  );
}

function CustomerRow({ org, lastEvent, economics }) {
  const modules = orgModules(org);
  const status = statusLabel(org);
  const revenue = economics?.revenue;
  const margin = economics?.margin;

  return (
    <Link
      href={`/workspace/${org.id}`}
      className="group grid gap-4 border-b border-white/[0.065] px-4 py-4 transition last:border-b-0 hover:bg-white/[0.035] md:grid-cols-[minmax(220px,1.45fr)_0.8fr_1fr_0.75fr_34px] md:items-center"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13px] font-medium text-white/88">{orgName(org)}</span>
          <span className="rounded-full border border-white/[0.08] bg-white/[0.035] px-2 py-0.5 text-[9px] uppercase tracking-[0.12em] text-white/38">
            {status}
          </span>
        </div>
        <div className="mt-1 text-[10px] text-white/34">{orgType(org)}</div>
      </div>

      <div>
        <div className="text-[9px] uppercase tracking-[0.14em] text-white/28">Modules</div>
        <div className="mt-1 truncate text-[11px] text-white/58">
          {modules.length ? modules.slice(0, 4).join(" · ") : "Profile governed by runtime"}
        </div>
      </div>

      <div>
        <div className="text-[9px] uppercase tracking-[0.14em] text-white/28">Last activity</div>
        <div className="mt-1 truncate text-[11px] text-white/58">
          {lastEvent ? eventTitle(lastEvent) : "No recent platform event"}
        </div>
      </div>

      <div>
        <div className="text-[9px] uppercase tracking-[0.14em] text-white/28">Economics</div>
        <div className="mt-1 text-[11px] text-white/58">
          {economics ? `${money(revenue)} · ${Number(margin || 0).toFixed(0)}%` : "Loading…"}
        </div>
      </div>

      <ChevronRight size={16} className="hidden text-white/22 transition group-hover:translate-x-0.5 group-hover:text-[#D6A66A] md:block" />
    </Link>
  );
}

function HealthView({ health, organizations, recentEvents, modules, economics, economicsLoading }) {
  const serviceRows = Object.entries(health?.services || {});
  const degradedServices = serviceRows.filter(([, service]) => service?.status !== "healthy");
  const negativeEvents = recentEvents.filter(isNegativeEvent);
  const criticalEvents = recentEvents.filter(isCriticalEvent);
  const activeModules = modules.filter(module => !/(disabled|inactive|retired)/i.test(text(module?.status)));
  const aiModules = modules.filter(isAiRecord);
  const organizationsById = useMemo(
    () => new Map(organizations.map(org => [text(org.id), org])),
    [organizations],
  );
  const economicsSummary = economics?.summary;

  return (
    <div className="space-y-6">
      <section className="rounded-[24px] border border-white/[0.075] bg-[#0D0D0D] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
        <SectionHeader
          eyebrow="Platform status"
          title="Runtime command"
          description="Live platform signals only. No synthetic uptime percentage is shown without a persisted SLO window."
          action={
            <div className={`rounded-full border px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.13em] ${health?.status === "healthy" ? "border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-200" : "border-amber-400/20 bg-amber-400/[0.06] text-amber-200"}`}>
              {text(health?.status || "unknown")}
            </div>
          }
        />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Metric
            icon={Activity}
            label="Runtime"
            value={health?.status === "healthy" ? "Healthy" : "Degraded"}
            meta={`${number(health?.duration_ms)} ms live probe`}
            tone={health?.status === "healthy" ? "good" : "warning"}
          />
          <Metric
            icon={TriangleAlert}
            label="Critical"
            value={number(degradedServices.length + criticalEvents.length)}
            meta="Health failures + critical recent events"
            tone={degradedServices.length + criticalEvents.length ? "danger" : "good"}
          />
          <Metric
            icon={Building2}
            label="Organizations"
            value={number(organizations.length)}
            meta={`${number(negativeEvents.length)} recent attention signals`}
          />
          <Metric
            icon={Layers3}
            label="Modules"
            value={number(activeModules.length)}
            meta={`${number(modules.length)} registered platform modules`}
          />
          <Metric
            icon={BrainCircuit}
            label="AI capability"
            value={number(aiModules.length)}
            meta="Registered intelligence-related modules"
          />
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <section className="rounded-[24px] border border-white/[0.075] bg-[#0D0D0D] p-5">
          <SectionHeader eyebrow="Customer pulse" title="Needs operator attention" description="Recent customer and platform events ranked by operational risk." />
          <div className="mt-2">
            {(negativeEvents.length ? negativeEvents : recentEvents).slice(0, 8).map((event, index) => (
              <EventRow key={event?.id || `${eventTitle(event)}-${index}`} event={event} organizationsById={organizationsById} />
            ))}
            {!recentEvents.length ? <div className="py-8 text-center text-[12px] text-white/35">No recent organization events.</div> : null}
          </div>
        </section>

        <section className="rounded-[24px] border border-white/[0.075] bg-[#0D0D0D] p-5">
          <SectionHeader eyebrow="Economics" title="Platform value" description="Existing governed billing/profit engine; loaded separately from the control surface." />
          <div className="mt-5 space-y-3">
            <div className="flex items-end justify-between rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
              <div>
                <div className="text-[10px] uppercase tracking-[0.15em] text-white/30">Revenue</div>
                <div className="mt-2 text-[24px] font-medium tracking-[-0.03em] text-white">{economicsLoading ? "…" : money(economicsSummary?.totalRevenue)}</div>
              </div>
              <CircleDollarSign size={18} className="text-[#D6A66A]" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
                <div className="text-[9px] uppercase tracking-[0.15em] text-white/28">Supplier cost</div>
                <div className="mt-2 text-[17px] font-medium text-white/78">{economicsLoading ? "…" : money(economicsSummary?.totalCost)}</div>
              </div>
              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
                <div className="text-[9px] uppercase tracking-[0.15em] text-white/28">Margin</div>
                <div className="mt-2 text-[17px] font-medium text-white/78">{economicsLoading ? "…" : `${Number(economicsSummary?.margin || 0).toFixed(1)}%`}</div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function CustomersView({ organizations, recentEvents, economics }) {
  const [query, setQuery] = useState("");
  const eventsByOrg = useMemo(() => {
    const map = new Map();
    for (const event of recentEvents) {
      const id = text(event?.organization_id);
      if (id && !map.has(id)) map.set(id, event);
    }
    return map;
  }, [recentEvents]);
  const economicsByOrg = useMemo(
    () => new Map((economics?.organizations || []).map(row => [text(row.organizationId), row])),
    [economics],
  );
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return organizations;
    return organizations.filter(org => {
      const corpus = `${orgName(org)} ${orgType(org)} ${statusLabel(org)} ${orgModules(org).join(" ")}`.toLowerCase();
      return corpus.includes(needle);
    });
  }, [organizations, query]);

  return (
    <section className="rounded-[24px] border border-white/[0.075] bg-[#0D0D0D] p-5">
      <SectionHeader
        eyebrow="Customer universe"
        title={`${number(filtered.length)} organizations`}
        description="Search and open the real governed organization workspace."
        action={
          <label className="flex h-9 w-full items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 sm:w-[280px]">
            <Search size={14} className="text-white/30" />
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search customer…"
              className="min-w-0 flex-1 bg-transparent text-[11px] text-white/80 outline-none placeholder:text-white/25"
            />
          </label>
        }
      />
      <div className="mt-4 overflow-hidden rounded-[18px] border border-white/[0.065] bg-black/20">
        {filtered.map(org => (
          <CustomerRow
            key={org.id}
            org={org}
            lastEvent={eventsByOrg.get(text(org.id))}
            economics={economicsByOrg.get(text(org.id))}
          />
        ))}
        {!filtered.length ? <div className="px-4 py-10 text-center text-[12px] text-white/35">No organizations match this search.</div> : null}
      </div>
    </section>
  );
}

function RevenueView({ economics, economicsLoading, economicsError }) {
  const summary = economics?.summary || {};
  const rows = [...(economics?.organizations || [])].sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0));

  return (
    <div className="space-y-6">
      <section className="rounded-[24px] border border-white/[0.075] bg-[#0D0D0D] p-5">
        <SectionHeader eyebrow="Revenue" title="Platform economics" description="Revenue, supplier cost, profit and margin from the existing platform profit engine." />
        {economicsError ? <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/[0.05] px-4 py-3 text-[11px] text-red-200">{economicsError}</div> : null}
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric icon={CircleDollarSign} label="Revenue" value={economicsLoading ? "…" : money(summary.totalRevenue)} meta="Recognized by current billing engine" />
          <Metric icon={WalletCards} label="Supplier cost" value={economicsLoading ? "…" : money(summary.totalCost)} meta="AI/service supplier cost" />
          <Metric icon={Zap} label="Profit" value={economicsLoading ? "…" : money(summary.totalProfit)} meta="Revenue less supplier cost" tone={Number(summary.totalProfit || 0) >= 0 ? "good" : "danger"} />
          <Metric icon={Activity} label="Margin" value={economicsLoading ? "…" : `${Number(summary.margin || 0).toFixed(1)}%`} meta="Current platform gross margin" />
        </div>
      </section>

      <section className="rounded-[24px] border border-white/[0.075] bg-[#0D0D0D] p-5">
        <SectionHeader eyebrow="Customer economics" title="Revenue by organization" description="Highest platform revenue first." />
        <div className="mt-4 overflow-hidden rounded-[18px] border border-white/[0.065]">
          {rows.map(row => (
            <Link key={row.organizationId} href={`/workspace/${row.organizationId}`} className="grid gap-3 border-b border-white/[0.06] px-4 py-3 text-[11px] last:border-b-0 hover:bg-white/[0.03] sm:grid-cols-[1.5fr_0.8fr_0.8fr_0.6fr_24px] sm:items-center">
              <span className="truncate font-medium text-white/80">{row.organizationName || row.organizationId}</span>
              <span className="text-white/52">{money(row.revenue)}</span>
              <span className="text-white/52">{money(row.profit)}</span>
              <span className="text-white/52">{Number(row.margin || 0).toFixed(1)}%</span>
              <ChevronRight size={14} className="hidden text-white/22 sm:block" />
            </Link>
          ))}
          {!rows.length && !economicsLoading ? <div className="px-4 py-10 text-center text-[12px] text-white/35">No economics rows are available.</div> : null}
        </div>
      </section>
    </div>
  );
}

function IntelligenceView({ modules, recentEvents, health, economics, economicsLoading }) {
  const aiModules = modules.filter(isAiRecord);
  const learning = recentEvents.filter(isLearningEvent);
  const certifications = recentEvents.filter(isCertificationEvent);
  const queueStatus = text(health?.services?.queue?.status || "unknown");

  const cards = [
    { label: "Models & capabilities", value: number(aiModules.length), meta: "Registered intelligence-related modules", icon: BrainCircuit },
    { label: "Workers", value: queueStatus === "healthy" ? "Ready" : "Inspect", meta: "Worker execution depends on governed service runtime", icon: Server },
    { label: "Queues", value: queueStatus, meta: "Live queue health probe", icon: Layers3 },
    { label: "Costs", value: economicsLoading ? "…" : money(economics?.summary?.totalCost), meta: "Supplier cost from platform economics", icon: CircleDollarSign },
    { label: "Learning", value: number(learning.length), meta: "Recent learning-related platform events", icon: Zap },
    { label: "Certifications", value: number(certifications.length), meta: "Recent certification/benchmark events", icon: ShieldCheck },
  ];

  return (
    <section className="rounded-[24px] border border-white/[0.075] bg-[#0D0D0D] p-5">
      <SectionHeader eyebrow="AI platform" title="Intelligence runtime" description="Models, queues, costs, learning and certification signals in one operator view." />
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map(card => (
          <div key={card.label} className="rounded-[20px] border border-white/[0.07] bg-white/[0.025] p-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-[0.15em] text-white/30">{card.label}</span>
              <card.icon size={15} className="text-[#D6A66A]" />
            </div>
            <div className="mt-4 text-[24px] font-medium tracking-[-0.03em] text-white">{card.value}</div>
            <div className="mt-1 text-[10px] leading-5 text-white/35">{card.meta}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-2">
        <div className="rounded-[20px] border border-white/[0.07] bg-black/20 p-4">
          <div className="text-[10px] uppercase tracking-[0.16em] text-white/30">Registered AI surface</div>
          <div className="mt-3 space-y-2">
            {aiModules.slice(0, 10).map((module, index) => (
              <div key={module?.id || `${module?.name}-${index}`} className="flex items-center justify-between gap-4 border-b border-white/[0.055] py-2 last:border-b-0">
                <span className="truncate text-[11px] text-white/68">{firstValue(module, ["name", "title", "id"], "AI module")}</span>
                <span className="text-[9px] uppercase tracking-[0.12em] text-white/28">{firstValue(module, ["status"], "registered")}</span>
              </div>
            ))}
            {!aiModules.length ? <div className="py-5 text-[11px] text-white/32">No intelligence-labelled platform modules in this read model.</div> : null}
          </div>
        </div>
        <div className="rounded-[20px] border border-white/[0.07] bg-black/20 p-4">
          <div className="text-[10px] uppercase tracking-[0.16em] text-white/30">Learning & certification activity</div>
          <div className="mt-3 space-y-2">
            {[...learning, ...certifications].slice(0, 10).map((event, index) => (
              <div key={event?.id || `${eventTitle(event)}-${index}`} className="border-b border-white/[0.055] py-2 last:border-b-0">
                <div className="truncate text-[11px] text-white/68">{eventTitle(event)}</div>
                <div className="mt-1 text-[9px] text-white/28">{eventWhen(event)}</div>
              </div>
            ))}
            {!learning.length && !certifications.length ? <div className="py-5 text-[11px] text-white/32">No learning or certification events in the latest event window.</div> : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function OperationsView({ recentEvents, modules, organizations }) {
  const organizationsById = useMemo(
    () => new Map(organizations.map(org => [text(org.id), org])),
    [organizations],
  );

  return (
    <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
      <section className="rounded-[24px] border border-white/[0.075] bg-[#0D0D0D] p-5">
        <SectionHeader eyebrow="Recent decisions" title="Platform activity" description="Latest governed organization events and operator-relevant decisions." />
        <div className="mt-2">
          {recentEvents.slice(0, 20).map((event, index) => (
            <EventRow key={event?.id || `${eventTitle(event)}-${index}`} event={event} organizationsById={organizationsById} />
          ))}
          {!recentEvents.length ? <div className="py-8 text-center text-[12px] text-white/35">No recent platform events.</div> : null}
        </div>
      </section>

      <section className="rounded-[24px] border border-white/[0.075] bg-[#0D0D0D] p-5">
        <SectionHeader eyebrow="Control surface" title="Platform modules" description="Registered modules available to the platform runtime." />
        <div className="mt-3 space-y-1">
          {modules.map((module, index) => (
            <div key={module?.id || `${module?.name}-${index}`} className="flex items-center justify-between gap-4 rounded-xl px-3 py-2.5 hover:bg-white/[0.025]">
              <div className="min-w-0">
                <div className="truncate text-[11px] font-medium text-white/66">{firstValue(module, ["name", "title", "id"], "Platform module")}</div>
                <div className="mt-0.5 truncate text-[9px] text-white/28">{firstValue(module, ["description", "module_key", "key"], "Governed platform capability")}</div>
              </div>
              <span className="shrink-0 text-[9px] uppercase tracking-[0.12em] text-white/28">{firstValue(module, ["status"], "registered")}</span>
            </div>
          ))}
          {!modules.length ? <div className="py-8 text-center text-[11px] text-white/32">No platform modules returned by the admin read model.</div> : null}
        </div>
      </section>
    </div>
  );
}

export default function PlatformControlTower({ organizations = [], recentEvents = [], modules = [], health = {} }) {
  const [activeTab, setActiveTab] = useState("Health");
  const [economics, setEconomics] = useState(null);
  const [economicsLoading, setEconomicsLoading] = useState(true);
  const [economicsError, setEconomicsError] = useState("");

  useEffect(() => {
    let alive = true;

    async function loadEconomics() {
      try {
        setEconomicsLoading(true);
        const response = await fetch("/api/platform/admin/profit", { cache: "no-store" });
        const json = await response.json();
        if (!response.ok || json?.success === false) throw new Error(json?.error || "Unable to load platform economics");
        if (alive) setEconomics(json);
      } catch (error) {
        if (alive) setEconomicsError(error?.message || "Unable to load platform economics");
      } finally {
        if (alive) setEconomicsLoading(false);
      }
    }

    loadEconomics();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="-mx-5 -my-5 min-h-[calc(100vh-61px)] bg-[#070707] px-5 py-6 text-white lg:-mx-7 lg:-my-6 lg:px-7 lg:py-7">
      <div className="mx-auto max-w-[1640px]">
        <header className="flex flex-col gap-5 border-b border-white/[0.075] pb-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.22em] text-[#D6A66A]">
              <Database size={13} />
              Avantiqo Platform
            </div>
            <h1 className="mt-2 text-[30px] font-medium tracking-[-0.045em] text-white sm:text-[36px]">Operator control tower</h1>
            <p className="mt-2 max-w-3xl text-[12px] leading-5 text-white/40">
              Customers, runtime health, platform economics, intelligence and governed activity in one operational surface.
            </p>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-white/30">
            <span className={`h-2 w-2 rounded-full ${health?.status === "healthy" ? "bg-emerald-300" : "bg-amber-300"}`} />
            Live read model · {eventWhen({ created_at: health?.timestamp })}
          </div>
        </header>

        <nav className="mt-4 flex gap-1 overflow-x-auto rounded-[16px] border border-white/[0.07] bg-white/[0.025] p-1">
          {TABS.map(tab => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`min-w-max rounded-xl px-4 py-2 text-[11px] font-medium transition ${activeTab === tab ? "bg-[#D6A66A] text-[#17110B] shadow-[0_6px_20px_rgba(214,166,106,0.15)]" : "text-white/42 hover:bg-white/[0.04] hover:text-white/72"}`}
            >
              {tab}
            </button>
          ))}
          <div className="ml-auto hidden items-center px-3 text-[9px] uppercase tracking-[0.16em] text-white/22 lg:flex">
            Platform owner surface
          </div>
        </nav>

        <div className="mt-5">
          {activeTab === "Health" ? (
            <HealthView
              health={health}
              organizations={organizations}
              recentEvents={recentEvents}
              modules={modules}
              economics={economics}
              economicsLoading={economicsLoading}
            />
          ) : null}
          {activeTab === "Customers" ? (
            <CustomersView organizations={organizations} recentEvents={recentEvents} economics={economics} />
          ) : null}
          {activeTab === "Revenue" ? (
            <RevenueView economics={economics} economicsLoading={economicsLoading} economicsError={economicsError} />
          ) : null}
          {activeTab === "Intelligence" ? (
            <IntelligenceView modules={modules} recentEvents={recentEvents} health={health} economics={economics} economicsLoading={economicsLoading} />
          ) : null}
          {activeTab === "Operations" ? (
            <OperationsView recentEvents={recentEvents} modules={modules} organizations={organizations} />
          ) : null}
        </div>

        <footer className="mt-6 flex flex-col gap-2 border-t border-white/[0.06] pt-4 text-[9px] uppercase tracking-[0.14em] text-white/22 sm:flex-row sm:items-center sm:justify-between">
          <span>Governed platform-admin read model</span>
          <Link href="/workspace" className="inline-flex items-center gap-1 text-white/35 transition hover:text-[#D6A66A]">
            Open enterprise workspace <ArrowUpRight size={11} />
          </Link>
        </footer>
      </div>
    </div>
  );
}
