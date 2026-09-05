"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  BellRing,
  BrainCircuit,
  Building2,
  ChevronRight,
  CircleDollarSign,
  Database,
  Layers3,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  TriangleAlert,
  UsersRound,
  WalletCards,
  Wrench,
} from "lucide-react";

const NAV = [
  { id: "inbox", label: "Operator inbox", icon: BellRing },
  { id: "customers", label: "Customers", icon: Building2 },
  { id: "services", label: "Services & runtime", icon: Server },
  { id: "intelligence", label: "Intelligence", icon: BrainCircuit },
  { id: "revenue", label: "Revenue & cost", icon: CircleDollarSign },
  { id: "governance", label: "Governance", icon: ShieldCheck },
  { id: "activity", label: "Activity log", icon: Activity },
];

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

function eventCorpus(event) {
  let payload = "";
  try {
    payload = JSON.stringify(event?.payload || event?.metadata || event?.data || {});
  } catch {}
  return [
    event?.event_type,
    event?.type,
    event?.name,
    event?.action,
    event?.status,
    event?.severity,
    event?.message,
    event?.description,
    payload,
  ]
    .map(text)
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function eventTitle(event) {
  return text(firstValue(event, ["title", "message", "event_type", "type", "name", "action"], "Platform activity"))
    .replaceAll("_", " ")
    .replace(/\s+/g, " ");
}

function eventWhen(event) {
  const value = firstValue(event, ["created_at", "timestamp", "occurred_at", "updated_at"], null);
  if (!value) return "Time unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time unavailable";
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function orgName(org) {
  return text(firstValue(org, ["name", "legal_name", "display_name"], "Unnamed organization"));
}

function orgStatus(org) {
  return text(firstValue(org, ["status", "lifecycle_status", "state"], "configured"));
}

function orgType(org) {
  return text(firstValue(org, ["organization_type", "type", "industry", "industry_id"], "Organization"));
}

function money(value, currency = "THB") {
  const n = Number(value || 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number.isFinite(n) ? n : 0);
}

function isNegativeEvent(event) {
  return /(critical|failed|failure|error|blocked|warning|action.required|needs.action|degraded|overdue)/i.test(eventCorpus(event));
}

function isCriticalEvent(event) {
  return /(critical|fatal|sev.?1|p0|outage)/i.test(eventCorpus(event));
}

function isAiRecord(record) {
  const corpus = `${text(record?.id)} ${text(record?.name)} ${text(record?.title)} ${text(record?.description)} ${eventCorpus(record)}`;
  return /(\bai\b|intelligence|model|learning|inference|voice|video|image|music|code)/i.test(corpus);
}

function toneForStatus(value) {
  const status = text(value).toLowerCase();
  if (/(critical|failed|degraded|blocked|error|inactive)/.test(status)) return "border-red-700/15 bg-red-50 text-red-800";
  if (/(warning|partial|review|pending|unverified)/.test(status)) return "border-amber-700/15 bg-amber-50 text-amber-800";
  if (/(healthy|active|clear|success|enabled)/.test(status)) return "border-emerald-700/15 bg-emerald-50 text-emerald-800";
  return "border-black/[0.08] bg-[#F6F4F0] text-[#746E66]";
}

function StatusPill({ children }) {
  return (
    <span className={`inline-flex rounded-md border px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.08em] ${toneForStatus(children)}`}>
      {children}
    </span>
  );
}

function Empty({ children }) {
  return <div className="px-4 py-10 text-center text-[11px] text-[#918B83]">{children}</div>;
}

function SectionTitle({ eyebrow, title, description, action }) {
  return (
    <div className="flex flex-col gap-3 border-b border-black/[0.06] px-4 py-3.5 md:flex-row md:items-center md:justify-between md:px-5">
      <div className="min-w-0">
        <div className="text-[8px] font-semibold uppercase tracking-[0.14em] text-[#8A633C]">{eyebrow}</div>
        <h2 className="mt-1 text-[15px] font-semibold tracking-[-0.02em] text-[#2A2723]">{title}</h2>
        {description ? <p className="mt-0.5 max-w-3xl text-[8px] leading-4 text-[#918B83]">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

function EventRow({ event, organizationsById }) {
  const organization = organizationsById.get(text(event?.organization_id));
  const negative = isNegativeEvent(event);
  return (
    <div className="grid gap-2 border-b border-black/[0.05] px-4 py-3 last:border-b-0 md:grid-cols-[14px_minmax(220px,1fr)_minmax(130px,0.55fr)_110px] md:items-center md:px-5">
      <span className={`h-2 w-2 rounded-full ${negative ? "bg-[#B56A4A]" : "bg-[#6F8A70]"}`} />
      <div className="min-w-0">
        <div className="truncate text-[11px] font-medium text-[#3A3631]">{eventTitle(event)}</div>
        <div className="mt-0.5 truncate text-[8px] text-[#9A948C]">{text(firstValue(event, ["description", "message"], "Governed platform event"))}</div>
      </div>
      <div className="truncate text-[9px] text-[#746E66]">{organization ? orgName(organization) : "Platform"}</div>
      <div className="text-[8px] text-[#9A948C]">{eventWhen(event)}</div>
    </div>
  );
}

function PlatformTable({ children, headings }) {
  return (
    <div className="overflow-hidden rounded-[18px] border border-[#A37849]/14 bg-[#FFFDF9]">
      {headings ? (
        <div className={`hidden ${headings.className || "md:grid"} gap-3 border-b border-black/[0.05] bg-white/45 px-4 py-2 text-[7px] font-semibold uppercase tracking-[0.1em] text-[#979087] md:px-5`}>
          {headings.items.map(item => <span key={item}>{item}</span>)}
        </div>
      ) : null}
      {children}
    </div>
  );
}

export default function PlatformControlTower({ organizations = [], recentEvents = [], modules = [], health = {} }) {
  const [active, setActive] = useState("inbox");
  const [query, setQuery] = useState("");
  const [economics, setEconomics] = useState(null);
  const [economicsLoading, setEconomicsLoading] = useState(true);
  const [refreshedAt, setRefreshedAt] = useState(() => new Date());

  useEffect(() => {
    let alive = true;
    async function loadEconomics() {
      try {
        setEconomicsLoading(true);
        const response = await fetch("/api/platform/admin/profit", { cache: "no-store", credentials: "include" });
        const body = await response.json().catch(() => null);
        if (alive && response.ok) setEconomics(body);
      } finally {
        if (alive) setEconomicsLoading(false);
      }
    }
    loadEconomics();
    return () => { alive = false; };
  }, []);

  const organizationsById = useMemo(
    () => new Map(organizations.map(org => [text(org.id), org])),
    [organizations],
  );

  const eventsByOrg = useMemo(() => {
    const map = new Map();
    for (const event of recentEvents) {
      const id = text(event?.organization_id);
      if (id && !map.has(id)) map.set(id, event);
    }
    return map;
  }, [recentEvents]);

  const economicsByOrg = useMemo(() => {
    const rows = economics?.organizations || economics?.rows || economics?.data || [];
    const map = new Map();
    for (const row of Array.isArray(rows) ? rows : []) {
      map.set(text(row.organization_id || row.id), row);
    }
    return map;
  }, [economics]);

  const attentionEvents = useMemo(() => recentEvents.filter(isNegativeEvent), [recentEvents]);
  const criticalEvents = useMemo(() => recentEvents.filter(isCriticalEvent), [recentEvents]);
  const aiModules = useMemo(() => modules.filter(isAiRecord), [modules]);
  const serviceRows = Object.entries(health?.services || {});

  const filteredOrganizations = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return organizations;
    return organizations.filter(org => `${orgName(org)} ${orgType(org)} ${orgStatus(org)} ${text(org.id)}`.toLowerCase().includes(needle));
  }, [organizations, query]);

  const summary = economics?.summary || {};

  function renderInbox() {
    const queue = attentionEvents.length ? attentionEvents : recentEvents;
    return (
      <div className="space-y-4">
        <section className="overflow-hidden rounded-[18px] border border-[#A37849]/14 bg-[#FFFDF9]">
          <SectionTitle
            eyebrow="Operator inbox"
            title="Work that needs a human decision"
            description="Exceptions first. Passive healthy state stays out of the way until it needs attention."
          />
          <div className="grid border-b border-black/[0.05] bg-[#FBF8F3] md:grid-cols-4">
            <button onClick={() => setActive("activity")} className="border-b border-black/[0.05] px-4 py-3 text-left md:border-b-0 md:border-r">
              <div className="text-[7px] font-semibold uppercase tracking-[0.1em] text-[#979087]">Needs attention</div>
              <div className="mt-1 text-[16px] font-semibold text-[#9A533D]">{attentionEvents.length}</div>
            </button>
            <button onClick={() => setActive("activity")} className="border-b border-black/[0.05] px-4 py-3 text-left md:border-b-0 md:border-r">
              <div className="text-[7px] font-semibold uppercase tracking-[0.1em] text-[#979087]">Critical</div>
              <div className="mt-1 text-[16px] font-semibold text-[#9A533D]">{criticalEvents.length}</div>
            </button>
            <button onClick={() => setActive("customers")} className="border-b border-black/[0.05] px-4 py-3 text-left md:border-b-0 md:border-r">
              <div className="text-[7px] font-semibold uppercase tracking-[0.1em] text-[#979087]">Organizations</div>
              <div className="mt-1 text-[16px] font-semibold text-[#4B4640]">{organizations.length}</div>
            </button>
            <button onClick={() => setActive("services")} className="px-4 py-3 text-left">
              <div className="text-[7px] font-semibold uppercase tracking-[0.1em] text-[#979087]">Runtime verification</div>
              <div className="mt-1 text-[11px] font-semibold text-[#76583A]">{text(health?.status || "unknown")}</div>
            </button>
          </div>
          {queue.slice(0, 12).map((event, index) => (
            <EventRow key={event?.id || index} event={event} organizationsById={organizationsById} />
          ))}
          {!queue.length ? <Empty>No unresolved platform events.</Empty> : null}
        </section>

        <div className="grid gap-4 xl:grid-cols-2">
          <section className="overflow-hidden rounded-[18px] border border-[#A37849]/14 bg-[#FFFDF9]">
            <SectionTitle eyebrow="Runtime" title="Service verification" description="Only verified probes are treated as healthy." />
            {serviceRows.map(([name, service]) => (
              <div key={name} className="flex items-center justify-between gap-4 border-b border-black/[0.05] px-4 py-3 last:border-b-0 md:px-5">
                <div>
                  <div className="text-[10px] font-medium capitalize text-[#3A3631]">{name.replaceAll("_", " ")}</div>
                  <div className="mt-0.5 text-[8px] text-[#9A948C]">{service?.source || service?.message || "Platform health probe"}</div>
                </div>
                <StatusPill>{service?.status || "unknown"}</StatusPill>
              </div>
            ))}
            {!serviceRows.length ? <Empty>No service probes available.</Empty> : null}
          </section>

          <section className="overflow-hidden rounded-[18px] border border-[#A37849]/14 bg-[#FFFDF9]">
            <SectionTitle eyebrow="Commercial pulse" title="Economics requiring attention" description="Compact operating context, not a presentation dashboard." />
            <div className="divide-y divide-black/[0.05]">
              <div className="flex items-center justify-between px-4 py-3 md:px-5"><span className="text-[9px] text-[#746E66]">Revenue</span><strong className="text-[11px] text-[#3A3631]">{economicsLoading ? "Loading…" : money(summary.totalRevenue)}</strong></div>
              <div className="flex items-center justify-between px-4 py-3 md:px-5"><span className="text-[9px] text-[#746E66]">Supplier cost</span><strong className="text-[11px] text-[#3A3631]">{economicsLoading ? "Loading…" : money(summary.totalCost)}</strong></div>
              <div className="flex items-center justify-between px-4 py-3 md:px-5"><span className="text-[9px] text-[#746E66]">Platform profit</span><strong className="text-[11px] text-[#3A3631]">{economicsLoading ? "Loading…" : money(summary.totalProfit)}</strong></div>
              <button onClick={() => setActive("revenue")} className="flex w-full items-center justify-between px-4 py-3 text-left text-[9px] font-semibold text-[#76583A] md:px-5">Open commercial control <ChevronRight size={12} /></button>
            </div>
          </section>
        </div>
      </div>
    );
  }

  function renderCustomers() {
    return (
      <PlatformTable headings={{ className: "md:grid md:grid-cols-[minmax(220px,1.3fr)_0.65fr_0.7fr_1fr_0.65fr_28px]", items: ["Customer", "Status", "Type", "Last platform activity", "Economics", ""] }}>
        {filteredOrganizations.map(org => {
          const event = eventsByOrg.get(text(org.id));
          const econ = economicsByOrg.get(text(org.id));
          return (
            <Link key={org.id} href={`/workspace/${org.id}`} className="group grid gap-2 border-b border-black/[0.05] px-4 py-3 last:border-b-0 hover:bg-[#FBF8F3] md:grid-cols-[minmax(220px,1.3fr)_0.65fr_0.7fr_1fr_0.65fr_28px] md:items-center md:px-5">
              <div className="min-w-0"><div className="truncate text-[11px] font-semibold text-[#35312D]">{orgName(org)}</div><div className="mt-0.5 truncate text-[8px] text-[#9A948C]">{text(org.id)}</div></div>
              <div><StatusPill>{orgStatus(org)}</StatusPill></div>
              <div className="text-[9px] text-[#746E66]">{orgType(org)}</div>
              <div className="min-w-0"><div className="truncate text-[9px] text-[#625D56]">{event ? eventTitle(event) : "No recent platform event"}</div><div className="mt-0.5 text-[8px] text-[#9A948C]">{event ? eventWhen(event) : "—"}</div></div>
              <div className="text-[9px] text-[#625D56]">{econ ? `${money(econ.revenue)} · ${Number(econ.margin || 0).toFixed(0)}%` : economicsLoading ? "Loading…" : "—"}</div>
              <ChevronRight size={13} className="text-[#B1AAA1] group-hover:text-[#8A633C]" />
            </Link>
          );
        })}
        {!filteredOrganizations.length ? <Empty>No customers match this search.</Empty> : null}
      </PlatformTable>
    );
  }

  function renderServices() {
    return (
      <div className="grid gap-4 xl:grid-cols-[1fr_0.7fr]">
        <section className="overflow-hidden rounded-[18px] border border-[#A37849]/14 bg-[#FFFDF9]">
          <SectionTitle eyebrow="Services & runtime" title="Verified platform services" description="Health, source and operator trust state in one operational list." />
          {serviceRows.map(([name, service]) => (
            <div key={name} className="grid gap-2 border-b border-black/[0.05] px-4 py-3 last:border-b-0 md:grid-cols-[1fr_150px_120px] md:items-center md:px-5">
              <div><div className="text-[10px] font-semibold capitalize text-[#35312D]">{name.replaceAll("_", " ")}</div><div className="mt-0.5 text-[8px] text-[#9A948C]">{service?.source || service?.message || "Platform probe"}</div></div>
              <div className="text-[8px] text-[#746E66]">{service?.latency_ms ? `${service.latency_ms} ms` : service?.workers_active === true ? "Workers active" : service?.workers_active === false ? "Workers inactive" : "No runtime evidence"}</div>
              <div><StatusPill>{service?.status || "unknown"}</StatusPill></div>
            </div>
          ))}
          {!serviceRows.length ? <Empty>No service verification data available.</Empty> : null}
        </section>
        <section className="overflow-hidden rounded-[18px] border border-[#A37849]/14 bg-[#FFFDF9]">
          <SectionTitle eyebrow="Modules" title="Registered capabilities" description={`${modules.length} modules currently registered.`} />
          {modules.slice(0, 30).map((module, index) => (
            <div key={module?.id || index} className="flex items-center justify-between gap-3 border-b border-black/[0.05] px-4 py-3 last:border-b-0 md:px-5">
              <div className="min-w-0"><div className="truncate text-[10px] font-medium text-[#3A3631]">{text(module?.name || module?.title || module?.id || "Module")}</div><div className="mt-0.5 truncate text-[8px] text-[#9A948C]">{text(module?.description || module?.id || "Registered capability")}</div></div>
              <StatusPill>{text(module?.status || "registered")}</StatusPill>
            </div>
          ))}
        </section>
      </div>
    );
  }

  function renderIntelligence() {
    const learningEvents = recentEvents.filter(event => /(learning|knowledge|observation|evidence candidate)/i.test(eventCorpus(event)));
    const certificationEvents = recentEvents.filter(event => /(certif|benchmark|quality gate|production.certified)/i.test(eventCorpus(event)));
    return (
      <div className="space-y-4">
        <section className="overflow-hidden rounded-[18px] border border-[#A37849]/14 bg-[#FFFDF9]">
          <SectionTitle eyebrow="Intelligence" title="Models, learning and certification control" description="AI capability is managed as governed infrastructure, not decorative metrics." />
          <div className="grid border-b border-black/[0.05] bg-[#FBF8F3] sm:grid-cols-3">
            <div className="px-4 py-3"><div className="text-[7px] uppercase tracking-[0.1em] text-[#979087]">Registered AI capabilities</div><div className="mt-1 text-[15px] font-semibold text-[#4B4640]">{aiModules.length}</div></div>
            <div className="border-black/[0.05] px-4 py-3 sm:border-l"><div className="text-[7px] uppercase tracking-[0.1em] text-[#979087]">Learning activity</div><div className="mt-1 text-[15px] font-semibold text-[#4B4640]">{learningEvents.length}</div></div>
            <div className="border-black/[0.05] px-4 py-3 sm:border-l"><div className="text-[7px] uppercase tracking-[0.1em] text-[#979087]">Certification activity</div><div className="mt-1 text-[15px] font-semibold text-[#4B4640]">{certificationEvents.length}</div></div>
          </div>
          {aiModules.map((module, index) => (
            <div key={module?.id || index} className="grid gap-2 border-b border-black/[0.05] px-4 py-3 last:border-b-0 md:grid-cols-[1fr_160px] md:items-center md:px-5">
              <div><div className="text-[10px] font-semibold text-[#35312D]">{text(module?.name || module?.title || module?.id || "AI capability")}</div><div className="mt-0.5 text-[8px] text-[#9A948C]">{text(module?.description || "Registered intelligence capability")}</div></div>
              <div><StatusPill>{text(module?.status || "registered")}</StatusPill></div>
            </div>
          ))}
          {!aiModules.length ? <Empty>No intelligence modules are identifiable in the current registry.</Empty> : null}
        </section>
        <section className="overflow-hidden rounded-[18px] border border-[#A37849]/14 bg-[#FFFDF9]">
          <SectionTitle eyebrow="Governed evidence" title="Recent learning and certification decisions" />
          {[...learningEvents, ...certificationEvents].slice(0, 15).map((event, index) => <EventRow key={event?.id || index} event={event} organizationsById={organizationsById} />)}
          {!learningEvents.length && !certificationEvents.length ? <Empty>No recent learning or certification events.</Empty> : null}
        </section>
      </div>
    );
  }

  function renderRevenue() {
    const rows = economics?.organizations || economics?.rows || economics?.data || [];
    return (
      <PlatformTable headings={{ className: "md:grid md:grid-cols-[minmax(220px,1fr)_130px_130px_130px_90px]", items: ["Organization", "Revenue", "Supplier cost", "Profit", "Margin"] }}>
        {(Array.isArray(rows) ? rows : []).map((row, index) => {
          const org = organizationsById.get(text(row.organization_id || row.id));
          return (
            <div key={row.organization_id || index} className="grid gap-2 border-b border-black/[0.05] px-4 py-3 last:border-b-0 md:grid-cols-[minmax(220px,1fr)_130px_130px_130px_90px] md:items-center md:px-5">
              <div className="text-[10px] font-semibold text-[#35312D]">{org ? orgName(org) : text(row.organization_name || row.organization_id || "Organization")}</div>
              <div className="text-[9px] text-[#625D56]">{money(row.revenue)}</div>
              <div className="text-[9px] text-[#625D56]">{money(row.cost || row.supplier_cost)}</div>
              <div className="text-[9px] font-semibold text-[#3A3631]">{money(row.profit)}</div>
              <div className="text-[9px] text-[#625D56]">{Number(row.margin || 0).toFixed(1)}%</div>
            </div>
          );
        })}
        {economicsLoading ? <Empty>Loading governed commercial data…</Empty> : null}
        {!economicsLoading && !(Array.isArray(rows) && rows.length) ? <Empty>No platform economics returned.</Empty> : null}
      </PlatformTable>
    );
  }

  function renderGovernance() {
    return (
      <div className="grid gap-4 xl:grid-cols-2">
        <section className="overflow-hidden rounded-[18px] border border-[#A37849]/14 bg-[#FFFDF9]">
          <SectionTitle eyebrow="Governance" title="Platform trust boundaries" description="Visible controls should state what is verified and what remains unverified." />
          <div className="divide-y divide-black/[0.05]">
            <div className="flex items-center justify-between gap-4 px-4 py-3 md:px-5"><div><div className="text-[10px] font-medium text-[#35312D]">Administrator access</div><div className="mt-0.5 text-[8px] text-[#9A948C]">PLATFORM_OWNER / SUPER_ADMIN only</div></div><StatusPill>active</StatusPill></div>
            <div className="flex items-center justify-between gap-4 px-4 py-3 md:px-5"><div><div className="text-[10px] font-medium text-[#35312D]">Database health</div><div className="mt-0.5 text-[8px] text-[#9A948C]">Live platform database probe</div></div><StatusPill>{health?.services?.database?.status || "unknown"}</StatusPill></div>
            <div className="flex items-center justify-between gap-4 px-4 py-3 md:px-5"><div><div className="text-[10px] font-medium text-[#35312D]">Queue / worker truth</div><div className="mt-0.5 text-[8px] text-[#9A948C]">Must remain unverified until backed by runtime evidence</div></div><StatusPill>{health?.services?.queue?.status || "unverified"}</StatusPill></div>
          </div>
        </section>
        <section className="overflow-hidden rounded-[18px] border border-[#A37849]/14 bg-[#FFFDF9]">
          <SectionTitle eyebrow="Decision trail" title="Recent governed changes" description="Platform decisions remain traceable to customer and operator activity." />
          {recentEvents.slice(0, 12).map((event, index) => <EventRow key={event?.id || index} event={event} organizationsById={organizationsById} />)}
        </section>
      </div>
    );
  }

  const titles = {
    inbox: ["Operator inbox", "What requires platform attention now"],
    customers: ["Customers", "Organizations, lifecycle and current platform state"],
    services: ["Services & runtime", "Operational infrastructure and capability registry"],
    intelligence: ["Intelligence", "Models, learning, certification and AI platform state"],
    revenue: ["Revenue & cost", "Customer economics and supplier exposure"],
    governance: ["Governance", "Trust, access and decision evidence"],
    activity: ["Activity log", "Platform and organization event history"],
  };

  const [pageTitle, pageDescription] = titles[active] || titles.inbox;

  return (
    <div className="-mx-5 -my-5 min-h-[calc(100vh-61px)] bg-[#F7F6F3] text-[#2A2723] lg:-mx-7 lg:-my-6">
      <div className="border-b border-black/[0.07] bg-[#FBFAF7] px-4 py-3 md:px-6">
        <div className="mx-auto flex max-w-[1760px] flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#A37849]/16 bg-[#FFFDF9] text-[#8A633C]"><Layers3 size={15} /></div>
            <div className="min-w-0"><div className="text-[8px] font-semibold uppercase tracking-[0.15em] text-[#8A633C]">Avantiqo Platform</div><h1 className="truncate text-[17px] font-semibold tracking-[-0.025em] text-[#27231F]">Platform administration</h1></div>
          </div>
          <div className="flex flex-1 items-center gap-2 lg:max-w-[720px]">
            <div className="relative min-w-0 flex-1">
              <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9A948C]" />
              <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search customers, organizations or platform state" className="h-9 w-full rounded-lg border border-black/[0.08] bg-white pl-8 pr-3 text-[10px] text-[#35312D] outline-none placeholder:text-[#AAA49C] focus:border-[#A37849]/35" />
            </div>
            <button type="button" onClick={() => setRefreshedAt(new Date())} className="inline-flex h-9 items-center gap-2 rounded-lg border border-black/[0.08] bg-white px-3 text-[9px] font-semibold text-[#76583A]"><RefreshCw size={11} /> Refresh</button>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-[1760px] lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="border-b border-black/[0.07] bg-[#F3F1ED] px-3 py-4 lg:min-h-[calc(100vh-118px)] lg:border-b-0 lg:border-r">
          <nav className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-1">
            {NAV.map(item => {
              const Icon = item.icon;
              const selected = active === item.id;
              return (
                <button key={item.id} onClick={() => setActive(item.id)} className={`flex h-9 items-center gap-2 rounded-lg px-3 text-left text-[9px] font-medium transition ${selected ? "bg-[#FFFDF9] text-[#5E4630] shadow-[0_1px_0_rgba(0,0,0,0.04)]" : "text-[#746E66] hover:bg-white/60 hover:text-[#403B35]"}`}>
                  <Icon size={12} className={selected ? "text-[#8A633C]" : "text-[#9B958D]"} />
                  <span>{item.label}</span>
                  {item.id === "inbox" && attentionEvents.length ? <span className="ml-auto rounded-full bg-[#9A533D] px-1.5 py-0.5 text-[7px] font-semibold text-white">{attentionEvents.length}</span> : null}
                </button>
              );
            })}
          </nav>
          <div className="mt-5 border-t border-black/[0.06] px-3 pt-4">
            <div className="text-[7px] font-semibold uppercase tracking-[0.1em] text-[#9B958D]">Platform state</div>
            <div className="mt-2 flex items-center justify-between gap-2"><span className="text-[8px] text-[#746E66]">Runtime</span><StatusPill>{health?.status || "unknown"}</StatusPill></div>
            <div className="mt-2 text-[7px] leading-4 text-[#A19A91]">Updated {refreshedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
          </div>
        </aside>

        <main className="min-w-0 px-4 py-4 md:px-6 md:py-5">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div><div className="text-[8px] font-semibold uppercase tracking-[0.14em] text-[#8A633C]">Platform control</div><h2 className="mt-1 text-[20px] font-semibold tracking-[-0.03em] text-[#27231F]">{pageTitle}</h2><p className="mt-1 text-[9px] text-[#918B83]">{pageDescription}</p></div>
            <div className="flex flex-wrap items-center gap-3 text-[8px] text-[#8B847B]"><span><strong className="font-semibold text-[#4B4640]">{organizations.length}</strong> organizations</span><span>·</span><span><strong className="font-semibold text-[#4B4640]">{modules.length}</strong> modules</span><span>·</span><span><strong className="font-semibold text-[#9A533D]">{attentionEvents.length}</strong> attention</span></div>
          </div>

          {active === "inbox" ? renderInbox() : null}
          {active === "customers" ? renderCustomers() : null}
          {active === "services" ? renderServices() : null}
          {active === "intelligence" ? renderIntelligence() : null}
          {active === "revenue" ? renderRevenue() : null}
          {active === "governance" ? renderGovernance() : null}
          {active === "activity" ? (
            <section className="overflow-hidden rounded-[18px] border border-[#A37849]/14 bg-[#FFFDF9]">
              <SectionTitle eyebrow="Activity log" title="Platform event history" description="A compact event stream for investigation and audit." />
              {recentEvents.map((event, index) => <EventRow key={event?.id || index} event={event} organizationsById={organizationsById} />)}
              {!recentEvents.length ? <Empty>No recent activity.</Empty> : null}
            </section>
          ) : null}
        </main>
      </div>
    </div>
  );
}
