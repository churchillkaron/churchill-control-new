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
  PlugZap,
  Search,
  Server,
  ShieldCheck,
  UsersRound,
  WalletCards,
} from "lucide-react";

const NAV = [
  ["inbox", "Operator inbox", BellRing],
  ["customers", "Customers", Building2],
  ["usage", "Usage & billing", WalletCards],
  ["integrations", "Integrations", PlugZap],
  ["services", "Services & runtime", Server],
  ["intelligence", "Intelligence", BrainCircuit],
  ["team", "Team & security", UsersRound],
  ["audit", "Audit trail", ShieldCheck],
];

const COLORS = {
  page: "#F7F6F3",
  surface: "#FFFDF9",
  ink: "#2A2723",
  gold: "#8A633C",
};

function t(value) {
  return String(value ?? "").trim();
}

function first(row, keys, fallback = "") {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && t(value)) return value;
  }
  return fallback;
}

function label(value) {
  return t(value || "unknown").replaceAll("_", " ");
}

function eventText(event) {
  let payload = "";
  try {
    payload = JSON.stringify(event?.payload || event?.metadata || event?.data || {});
  } catch {}
  return [event?.event_type, event?.type, event?.name, event?.action, event?.status, event?.severity, event?.message, event?.description, payload]
    .map(t)
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function eventTitle(event) {
  return label(first(event, ["title", "message", "event_type", "type", "name", "action"], "Platform activity"));
}

function when(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function money(value, currency = "THB") {
  const number = Number(value || 0);
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number.isFinite(number) ? number : 0);
}

function orgName(org) {
  return t(first(org, ["name", "legal_name", "display_name"], "Unnamed organization"));
}

function orgState(org) {
  return t(first(org, ["status", "lifecycle_status", "state"], "configured"));
}

function negativeEvent(event) {
  return /(critical|failed|failure|error|blocked|warning|action.required|needs.action|degraded|overdue)/i.test(eventText(event));
}

function aiRecord(row) {
  return /(\bai\b|intelligence|model|learning|inference|voice|video|image|music|code)/i.test(
    `${t(row?.id)} ${t(row?.name)} ${t(row?.title)} ${t(row?.description)} ${eventText(row)}`,
  );
}

function statusTone(value) {
  const state = t(value).toLowerCase();
  if (/(failed|critical|blocked|degraded|inactive|error)/.test(state)) return "border-red-700/15 bg-red-50 text-red-800";
  if (/(partial|pending|warning|review|unverified)/.test(state)) return "border-amber-700/15 bg-amber-50 text-amber-800";
  if (/(active|healthy|ready|success|enabled|clear|connected)/.test(state)) return "border-emerald-700/15 bg-emerald-50 text-emerald-800";
  return "border-black/[0.08] bg-[#F6F4F0] text-[#746E66]";
}

function Pill({ children }) {
  return <span className={`inline-flex rounded-md border px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.08em] ${statusTone(children)}`}>{label(children)}</span>;
}

function Panel({ eyebrow, title, description, children, action }) {
  return (
    <section className="overflow-hidden rounded-[18px] border border-[#A37849]/14 bg-[#FFFDF9]">
      <div className="flex flex-col gap-3 border-b border-black/[0.06] px-4 py-3.5 md:flex-row md:items-center md:justify-between md:px-5">
        <div>
          <div className="text-[8px] font-semibold uppercase tracking-[0.14em] text-[#8A633C]">{eyebrow}</div>
          <h3 className="mt-1 text-[15px] font-semibold tracking-[-0.02em] text-[#2A2723]">{title}</h3>
          {description ? <p className="mt-0.5 max-w-3xl text-[8px] leading-4 text-[#918B83]">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }) {
  return <div className="px-5 py-10 text-center text-[10px] text-[#918B83]">{children}</div>;
}

function EventRows({ rows, organizationsById }) {
  if (!rows.length) return <Empty>No events in this view.</Empty>;
  return rows.map((event, index) => {
    const org = organizationsById.get(t(event?.organization_id));
    return (
      <div key={event?.id || index} className="grid gap-2 border-b border-black/[0.05] px-4 py-3 last:border-b-0 md:grid-cols-[14px_minmax(220px,1fr)_160px_110px] md:items-center md:px-5">
        <span className={`h-2 w-2 rounded-full ${negativeEvent(event) ? "bg-[#B56A4A]" : "bg-[#6F8A70]"}`} />
        <div className="min-w-0">
          <div className="truncate text-[10px] font-medium text-[#3A3631]">{eventTitle(event)}</div>
          <div className="mt-0.5 truncate text-[8px] text-[#9A948C]">{t(first(event, ["description", "message"], "Governed platform event"))}</div>
        </div>
        <div className="truncate text-[8px] text-[#746E66]">{org ? orgName(org) : "Platform"}</div>
        <div className="text-[8px] text-[#9A948C]">{when(first(event, ["created_at", "timestamp", "occurred_at", "updated_at"], null))}</div>
      </div>
    );
  });
}

export default function PlatformAdminConsole({ organizations = [], recentEvents = [], modules = [], health = {}, staff = [], recentUsage = [] }) {
  const [active, setActive] = useState("inbox");
  const [query, setQuery] = useState("");
  const [selectedOrgId, setSelectedOrgId] = useState("");
  const [economics, setEconomics] = useState(null);
  const [integrationState, setIntegrationState] = useState({ loading: false, rows: [], error: "" });

  useEffect(() => {
    let alive = true;
    fetch("/api/platform/admin/profit", { cache: "no-store", credentials: "include" })
      .then(response => response.json().then(body => ({ response, body })))
      .then(({ response, body }) => { if (alive && response.ok) setEconomics(body); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!selectedOrgId || active !== "integrations") return;
    let alive = true;
    setIntegrationState({ loading: true, rows: [], error: "" });
    const url = new URL("/api/platform/integrations/readiness", window.location.origin);
    url.searchParams.set("organizationId", selectedOrgId);
    fetch(url.toString(), { cache: "no-store", credentials: "include" })
      .then(response => response.json().then(body => ({ response, body })))
      .then(({ response, body }) => {
        if (!alive) return;
        if (!response.ok || body?.success === false) throw new Error(body?.error || "Integration readiness failed");
        setIntegrationState({ loading: false, rows: body?.rows || [], error: "" });
      })
      .catch(error => alive && setIntegrationState({ loading: false, rows: [], error: error?.message || "Integration readiness failed" }));
    return () => { alive = false; };
  }, [selectedOrgId, active]);

  const organizationsById = useMemo(() => new Map(organizations.map(org => [t(org.id), org])), [organizations]);
  const attention = useMemo(() => recentEvents.filter(negativeEvent), [recentEvents]);
  const aiModules = useMemo(() => modules.filter(aiRecord), [modules]);
  const filteredOrganizations = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return organizations;
    return organizations.filter(org => `${orgName(org)} ${orgState(org)} ${t(org.id)} ${t(org.industry)}`.toLowerCase().includes(needle));
  }, [organizations, query]);
  const selectedOrg = organizationsById.get(selectedOrgId) || null;
  const selectedUsage = useMemo(() => recentUsage.filter(row => t(row.organization_id) === selectedOrgId), [recentUsage, selectedOrgId]);
  const selectedEvents = useMemo(() => recentEvents.filter(row => t(row.organization_id) === selectedOrgId), [recentEvents, selectedOrgId]);

  const economicsRows = economics?.organizations || economics?.rows || economics?.data || [];
  const economicsByOrg = useMemo(() => {
    const map = new Map();
    for (const row of Array.isArray(economicsRows) ? economicsRows : []) map.set(t(row.organization_id || row.id), row);
    return map;
  }, [economicsRows]);

  const serviceRows = Object.entries(health?.services || {});
  const activeStaff = staff.filter(row => row?.active !== false);

  const titles = {
    inbox: ["Operator inbox", "Exceptions and decisions first"],
    customers: ["Customers", "Lifecycle, state and operator drill-down"],
    usage: ["Usage & billing", "Service consumption, billing state and economics"],
    integrations: ["Integrations", "Connection readiness per organization"],
    services: ["Services & runtime", "Verified infrastructure and registered capabilities"],
    intelligence: ["Intelligence", "AI capability, learning and certification evidence"],
    team: ["Team & security", "Platform administrators and access state"],
    audit: ["Audit trail", "Organization and platform event history"],
  };

  function customerSelector() {
    return (
      <select value={selectedOrgId} onChange={event => setSelectedOrgId(event.target.value)} className="h-8 min-w-[220px] rounded-lg border border-black/[0.08] bg-white px-2 text-[9px] text-[#4B4640] outline-none">
        <option value="">Choose organization</option>
        {organizations.map(org => <option key={org.id} value={org.id}>{orgName(org)}</option>)}
      </select>
    );
  }

  function renderInbox() {
    const rows = attention.length ? attention : recentEvents;
    return (
      <div className="space-y-4">
        <Panel eyebrow="Operator inbox" title="Work that needs a human decision" description="Healthy passive state is compressed; exceptions and unresolved conditions stay visible.">
          <div className="grid border-b border-black/[0.05] bg-[#FBF8F3] sm:grid-cols-4">
            {[
              ["Attention", attention.length, "#9A533D"],
              ["Organizations", organizations.length, "#4B4640"],
              ["Active staff", activeStaff.length, "#4B4640"],
              ["Runtime", label(health?.status), "#76583A"],
            ].map(([name, value, color], index) => (
              <div key={name} className={`px-4 py-3 ${index ? "sm:border-l sm:border-black/[0.05]" : ""}`}>
                <div className="text-[7px] font-semibold uppercase tracking-[0.1em] text-[#979087]">{name}</div>
                <div className="mt-1 text-[14px] font-semibold" style={{ color }}>{value}</div>
              </div>
            ))}
          </div>
          <EventRows rows={rows.slice(0, 12)} organizationsById={organizationsById} />
        </Panel>
      </div>
    );
  }

  function renderCustomers() {
    return (
      <div className={`grid gap-4 ${selectedOrg ? "xl:grid-cols-[minmax(0,1fr)_360px]" : ""}`}>
        <Panel eyebrow="Customer universe" title="Organizations" description="Compact lifecycle list with direct workspace access and operator drill-down.">
          <div className="hidden grid-cols-[minmax(220px,1.2fr)_120px_120px_1fr_28px] gap-3 border-b border-black/[0.05] bg-white/45 px-5 py-2 text-[7px] font-semibold uppercase tracking-[0.1em] text-[#979087] md:grid">
            <span>Customer</span><span>Status</span><span>Economics</span><span>Last activity</span><span />
          </div>
          {filteredOrganizations.map(org => {
            const econ = economicsByOrg.get(t(org.id));
            const lastEvent = recentEvents.find(event => t(event.organization_id) === t(org.id));
            return (
              <button key={org.id} type="button" onClick={() => setSelectedOrgId(t(org.id))} className="grid w-full gap-2 border-b border-black/[0.05] px-4 py-3 text-left last:border-b-0 hover:bg-[#FBF8F3] md:grid-cols-[minmax(220px,1.2fr)_120px_120px_1fr_28px] md:items-center md:px-5">
                <div><div className="text-[10px] font-semibold text-[#35312D]">{orgName(org)}</div><div className="mt-0.5 text-[8px] text-[#9A948C]">{t(org.id)}</div></div>
                <div><Pill>{orgState(org)}</Pill></div>
                <div className="text-[8px] text-[#625D56]">{econ ? money(econ.revenue) : "—"}</div>
                <div className="truncate text-[8px] text-[#746E66]">{lastEvent ? eventTitle(lastEvent) : "No recent event"}</div>
                <ChevronRight size={13} className="text-[#B1AAA1]" />
              </button>
            );
          })}
          {!filteredOrganizations.length ? <Empty>No organizations match this search.</Empty> : null}
        </Panel>

        {selectedOrg ? (
          <aside className="h-fit overflow-hidden rounded-[18px] border border-[#A37849]/14 bg-[#FFFDF9] xl:sticky xl:top-20">
            <div className="border-b border-black/[0.06] px-4 py-4">
              <div className="text-[8px] font-semibold uppercase tracking-[0.14em] text-[#8A633C]">Customer control</div>
              <div className="mt-1 text-[15px] font-semibold text-[#2A2723]">{orgName(selectedOrg)}</div>
              <div className="mt-2"><Pill>{orgState(selectedOrg)}</Pill></div>
            </div>
            <div className="divide-y divide-black/[0.05]">
              <Link href={`/workspace/${selectedOrg.id}`} className="flex items-center justify-between px-4 py-3 text-[9px] font-semibold text-[#76583A]">Open customer workspace <ChevronRight size={12} /></Link>
              <button type="button" onClick={() => setActive("usage")} className="flex w-full items-center justify-between px-4 py-3 text-left text-[9px] text-[#625D56]">Usage records <span>{selectedUsage.length}</span></button>
              <button type="button" onClick={() => setActive("integrations")} className="flex w-full items-center justify-between px-4 py-3 text-left text-[9px] text-[#625D56]">Integration readiness <ChevronRight size={12} /></button>
              <button type="button" onClick={() => setActive("audit")} className="flex w-full items-center justify-between px-4 py-3 text-left text-[9px] text-[#625D56]">Recent events <span>{selectedEvents.length}</span></button>
            </div>
          </aside>
        ) : null}
      </div>
    );
  }

  function renderUsage() {
    const rows = selectedOrgId ? selectedUsage : recentUsage;
    return (
      <Panel eyebrow="Usage & billing" title="Service consumption" description="Recent governed service usage. Choose a customer to isolate its billing surface." action={customerSelector()}>
        <div className="hidden grid-cols-[160px_1fr_120px_110px_110px] gap-3 border-b border-black/[0.05] bg-white/45 px-5 py-2 text-[7px] font-semibold uppercase tracking-[0.1em] text-[#979087] md:grid">
          <span>Organization</span><span>Service / capability</span><span>Status</span><span>Cost</span><span>Created</span>
        </div>
        {rows.map((row, index) => {
          const org = organizationsById.get(t(row.organization_id));
          return (
            <div key={row.id || index} className="grid gap-2 border-b border-black/[0.05] px-4 py-3 last:border-b-0 md:grid-cols-[160px_1fr_120px_110px_110px] md:items-center md:px-5">
              <div className="truncate text-[8px] text-[#625D56]">{org ? orgName(org) : t(row.organization_id) || "Platform"}</div>
              <div><div className="text-[9px] font-medium text-[#35312D]">{label(first(row, ["service_id", "service", "capability", "provider"], "service usage"))}</div><div className="mt-0.5 text-[8px] text-[#9A948C]">{t(first(row, ["provider", "model", "usage_type"], "Governed runtime"))}</div></div>
              <div><Pill>{first(row, ["billing_status", "status", "state"], "recorded")}</Pill></div>
              <div className="text-[8px] text-[#625D56]">{money(first(row, ["customer_price", "price", "amount", "supplier_cost"], 0))}</div>
              <div className="text-[8px] text-[#9A948C]">{when(row.created_at)}</div>
            </div>
          );
        })}
        {!rows.length ? <Empty>No recent platform service usage.</Empty> : null}
      </Panel>
    );
  }

  function renderIntegrations() {
    return (
      <Panel eyebrow="Integrations" title="Connection readiness" description="Readiness comes from Avantiqo's actual BusinessConnectionRegistry; no fake connected state." action={customerSelector()}>
        {!selectedOrgId ? <Empty>Choose an organization to inspect integration readiness.</Empty> : null}
        {integrationState.loading ? <Empty>Checking integration readiness…</Empty> : null}
        {integrationState.error ? <Empty>{integrationState.error}</Empty> : null}
        {!integrationState.loading && !integrationState.error && integrationState.rows.map(row => (
          <div key={row.id} className="grid gap-2 border-b border-black/[0.05] px-4 py-3 last:border-b-0 md:grid-cols-[1fr_150px_110px] md:items-center md:px-5">
            <div><div className="text-[10px] font-medium text-[#35312D]">{row.name || row.id}</div><div className="mt-0.5 text-[8px] text-[#9A948C]">{row.missingConfiguration?.length ? `Missing: ${row.missingConfiguration.join(", ")}` : "Configuration complete"}</div></div>
            <div className="text-[8px] text-[#746E66]">{label(row.authModel || "unknown auth")}</div>
            <div><Pill>{row.ready ? "ready" : "not ready"}</Pill></div>
          </div>
        ))}
      </Panel>
    );
  }

  function renderServices() {
    return (
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel eyebrow="Runtime" title="Verified service health" description="Unverified signals remain visibly unverified rather than being promoted to healthy.">
          {serviceRows.map(([name, service]) => (
            <div key={name} className="flex items-center justify-between gap-4 border-b border-black/[0.05] px-4 py-3 last:border-b-0 md:px-5">
              <div><div className="text-[10px] font-medium capitalize text-[#35312D]">{label(name)}</div><div className="mt-0.5 text-[8px] text-[#9A948C]">{service?.source || service?.message || "Platform health probe"}</div></div>
              <Pill>{service?.status || "unknown"}</Pill>
            </div>
          ))}
          {!serviceRows.length ? <Empty>No runtime probes available.</Empty> : null}
        </Panel>
        <Panel eyebrow="Capability registry" title="Platform modules" description={`${modules.length} registered modules.`}>
          {modules.slice(0, 40).map((module, index) => (
            <div key={module.id || index} className="flex items-center justify-between gap-4 border-b border-black/[0.05] px-4 py-3 last:border-b-0 md:px-5">
              <div className="min-w-0"><div className="truncate text-[10px] font-medium text-[#35312D]">{t(module.name || module.title || module.id || "Module")}</div><div className="mt-0.5 truncate text-[8px] text-[#9A948C]">{t(module.description || module.id || "Registered capability")}</div></div>
              <Pill>{module.status || "registered"}</Pill>
            </div>
          ))}
        </Panel>
      </div>
    );
  }

  function renderIntelligence() {
    const evidenceEvents = recentEvents.filter(event => /(learning|knowledge|observation|evidence candidate|certif|benchmark|quality gate)/i.test(eventText(event)));
    return (
      <div className="space-y-4">
        <Panel eyebrow="Intelligence" title="AI platform capabilities" description="Models and generated-media capabilities are handled as governed platform infrastructure.">
          {aiModules.map((module, index) => (
            <div key={module.id || index} className="flex items-center justify-between gap-4 border-b border-black/[0.05] px-4 py-3 last:border-b-0 md:px-5">
              <div><div className="text-[10px] font-medium text-[#35312D]">{t(module.name || module.title || module.id)}</div><div className="mt-0.5 text-[8px] text-[#9A948C]">{t(module.description || "Registered intelligence capability")}</div></div>
              <Pill>{module.status || "registered"}</Pill>
            </div>
          ))}
          {!aiModules.length ? <Empty>No intelligence modules identified.</Empty> : null}
        </Panel>
        <Panel eyebrow="Evidence" title="Learning & certification activity"><EventRows rows={evidenceEvents.slice(0, 20)} organizationsById={organizationsById} /></Panel>
      </div>
    );
  }

  function renderTeam() {
    return (
      <Panel eyebrow="Team & security" title="Platform staff access" description="Active platform access is visible as an operational resource, not hidden in settings.">
        <div className="hidden grid-cols-[1fr_160px_120px_130px] gap-3 border-b border-black/[0.05] bg-white/45 px-5 py-2 text-[7px] font-semibold uppercase tracking-[0.1em] text-[#979087] md:grid">
          <span>Staff</span><span>Role</span><span>Status</span><span>Auth binding</span>
        </div>
        {staff.map((row, index) => (
          <div key={row.id || index} className="grid gap-2 border-b border-black/[0.05] px-4 py-3 last:border-b-0 md:grid-cols-[1fr_160px_120px_130px] md:items-center md:px-5">
            <div><div className="text-[10px] font-medium text-[#35312D]">{row.email || row.id || "Staff account"}</div><div className="mt-0.5 text-[8px] text-[#9A948C]">{t(row.id)}</div></div>
            <div className="text-[8px] text-[#625D56]">{label(row.role)}</div>
            <div><Pill>{row.active === false ? "inactive" : "active"}</Pill></div>
            <div className="text-[8px] text-[#746E66]">{row.auth_user_id ? "Bound" : "Not bound"}</div>
          </div>
        ))}
        {!staff.length ? <Empty>No platform staff accounts returned.</Empty> : null}
      </Panel>
    );
  }

  function renderAudit() {
    const rows = selectedOrgId ? selectedEvents : recentEvents;
    return <Panel eyebrow="Audit trail" title={selectedOrg ? `Activity · ${orgName(selectedOrg)}` : "Platform & organization activity"} description="Operator-visible event history for investigation and accountability." action={customerSelector()}><EventRows rows={rows} organizationsById={organizationsById} /></Panel>;
  }

  const renderer = {
    inbox: renderInbox,
    customers: renderCustomers,
    usage: renderUsage,
    integrations: renderIntegrations,
    services: renderServices,
    intelligence: renderIntelligence,
    team: renderTeam,
    audit: renderAudit,
  }[active];

  return (
    <div className="-mx-5 -my-5 min-h-[calc(100vh-61px)] bg-[#F7F6F3] text-[#2A2723] lg:-mx-7 lg:-my-6">
      <div className="border-b border-black/[0.07] bg-[#FBFAF7] px-4 py-3 md:px-6">
        <div className="mx-auto flex max-w-[1760px] flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#A37849]/16 bg-[#FFFDF9] text-[#8A633C]"><Database size={15} /></div>
            <div><div className="text-[8px] font-semibold uppercase tracking-[0.15em] text-[#8A633C]">Avantiqo Platform</div><h1 className="text-[17px] font-semibold tracking-[-0.025em] text-[#27231F]">Platform administration</h1></div>
          </div>
          <div className="relative w-full lg:max-w-[620px]">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9A948C]" />
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search customers or organization state" className="h-9 w-full rounded-lg border border-black/[0.08] bg-white pl-8 pr-3 text-[10px] text-[#35312D] outline-none placeholder:text-[#AAA49C] focus:border-[#A37849]/35" />
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-[1760px] lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="border-b border-black/[0.07] bg-[#F3F1ED] px-3 py-4 lg:min-h-[calc(100vh-118px)] lg:border-b-0 lg:border-r">
          <nav className="grid grid-cols-2 gap-1 sm:grid-cols-4 lg:grid-cols-1">
            {NAV.map(([id, name, Icon]) => {
              const selected = active === id;
              return (
                <button key={id} onClick={() => setActive(id)} className={`flex h-9 items-center gap-2 rounded-lg px-3 text-left text-[9px] font-medium transition ${selected ? "bg-[#FFFDF9] text-[#5E4630] shadow-[0_1px_0_rgba(0,0,0,0.04)]" : "text-[#746E66] hover:bg-white/60 hover:text-[#403B35]"}`}>
                  <Icon size={12} className={selected ? "text-[#8A633C]" : "text-[#9B958D]"} />
                  <span>{name}</span>
                  {id === "inbox" && attention.length ? <span className="ml-auto rounded-full bg-[#9A533D] px-1.5 py-0.5 text-[7px] font-semibold text-white">{attention.length}</span> : null}
                </button>
              );
            })}
          </nav>
          <div className="mt-5 border-t border-black/[0.06] px-3 pt-4">
            <div className="text-[7px] font-semibold uppercase tracking-[0.1em] text-[#9B958D]">Verified state</div>
            <div className="mt-2 flex items-center justify-between gap-2"><span className="text-[8px] text-[#746E66]">Platform</span><Pill>{health?.status || "unknown"}</Pill></div>
          </div>
        </aside>

        <main className="min-w-0 px-4 py-4 md:px-6 md:py-5">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div><div className="text-[8px] font-semibold uppercase tracking-[0.14em] text-[#8A633C]">Platform control</div><h2 className="mt-1 text-[20px] font-semibold tracking-[-0.03em] text-[#27231F]">{titles[active][0]}</h2><p className="mt-1 text-[9px] text-[#918B83]">{titles[active][1]}</p></div>
            <div className="flex flex-wrap items-center gap-3 text-[8px] text-[#8B847B]"><span><strong className="font-semibold text-[#4B4640]">{organizations.length}</strong> organizations</span><span>·</span><span><strong className="font-semibold text-[#4B4640]">{activeStaff.length}</strong> active staff</span><span>·</span><span><strong className="font-semibold text-[#9A533D]">{attention.length}</strong> attention</span></div>
          </div>
          {renderer ? renderer() : null}
        </main>
      </div>
    </div>
  );
}
