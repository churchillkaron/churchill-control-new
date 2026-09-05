"use client";

import { useMemo, useState } from "react";
import { Boxes, GitCommitHorizontal, ListChecks, Search, ServerCog } from "lucide-react";

function t(value) {
  return String(value ?? "").trim();
}

function label(value) {
  return t(value || "unknown").replaceAll("_", " ");
}

function when(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function money(value, currency = "THB") {
  const number = Number(value || 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: t(currency || "THB").toUpperCase(),
    maximumFractionDigits: 2,
  }).format(Number.isFinite(number) ? number : 0);
}

function tone(value) {
  const state = t(value).toLowerCase();
  if (/(failed|dead|error|blocked|cancelled|canceled|degraded)/.test(state)) return "border-red-700/15 bg-red-50 text-red-800";
  if (/(draft|pending|queued|scheduled|running|processing|unverified|demanded)/.test(state)) return "border-amber-700/15 bg-amber-50 text-amber-800";
  if (/(active|completed|ready|healthy|success|idle|verified|observed)/.test(state)) return "border-emerald-700/15 bg-emerald-50 text-emerald-800";
  return "border-black/[0.08] bg-[#F6F4F0] text-[#746E66]";
}

function Pill({ children }) {
  return (
    <span className={`inline-flex rounded-md border px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.08em] ${tone(children)}`}>
      {label(children)}
    </span>
  );
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

function modulesList(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return Object.entries(value).filter(([, enabled]) => Boolean(enabled)).map(([key]) => key);
  return [];
}

function livenessSummary(queueHealth = {}) {
  if (queueHealth.status === "idle") {
    return Number(queueHealth.demand_count || 0) === 0
      ? "Idle · no workload demand"
      : "Idle";
  }
  if (queueHealth.status === "demanded") {
    const demand = Number(queueHealth.demand_count || 0);
    const leases = Number(queueHealth.active_runpod_leases || 0);
    const fresh = Number(queueHealth.fresh_workers || 0);
    return `Demanded · ${demand} active demand signal${demand === 1 ? "" : "s"} · ${leases} live lease${leases === 1 ? "" : "s"} · ${fresh} fresh heartbeat${fresh === 1 ? "" : "s"}`;
  }
  if (queueHealth.status === "healthy") {
    return `${Number(queueHealth.fresh_workers || 0)} fresh worker${Number(queueHealth.fresh_workers || 0) === 1 ? "" : "s"}`;
  }
  if (queueHealth.status === "degraded") {
    return `Degraded · assigned work lacks current liveness evidence`;
  }
  return "Runtime truth unverified";
}

function releaseStateLabel(row = {}) {
  return row.state || "unknown";
}

export default function PlatformCommercialRuntimeControl({
  subscriptions = [],
  queueJobs = [],
  deadLetterJobs = [],
  organizations = [],
  releaseState = {},
  releaseHistory = {},
  queueHealth = {},
}) {
  const [query, setQuery] = useState("");
  const organizationsById = useMemo(() => new Map(organizations.map(org => [t(org.id), org])), [organizations]);
  const needle = query.trim().toLowerCase();

  const filteredSubscriptions = useMemo(() => subscriptions.filter(row => {
    if (!needle) return true;
    const org = organizationsById.get(t(row.organization_id));
    const modules = modulesList(row.selected_modules).join(" ");
    return `${t(row.company)} ${t(row.email)} ${t(org?.name)} ${t(row.status)} ${modules}`.toLowerCase().includes(needle);
  }), [subscriptions, organizationsById, needle]);

  const filteredJobs = useMemo(() => queueJobs.filter(row => {
    if (!needle) return true;
    const org = organizationsById.get(t(row.organization_id));
    return `${t(row.type)} ${t(row.status)} ${t(row.priority)} ${t(row.worker_name)} ${t(row.error_message)} ${t(org?.name)}`.toLowerCase().includes(needle);
  }), [queueJobs, organizationsById, needle]);

  const failedJobs = queueJobs.filter(row => t(row.status).toLowerCase() === "failed");
  const activeJobs = queueJobs.filter(row => /(queued|pending|running|processing)/i.test(t(row.status)));
  const latestJobAt = queueJobs.reduce((latest, row) => {
    const value = new Date(row.created_at || 0).getTime();
    return Number.isFinite(value) && value > latest ? value : latest;
  }, 0);
  const deployments = Array.isArray(releaseHistory?.deployments) ? releaseHistory.deployments : [];
  const currentDeployment = deployments[0] || null;
  const lanes = queueHealth?.runpod_leases_by_lane || {};

  return (
    <div className="bg-[#F7F6F3] px-4 pb-6 md:px-6">
      <div className="mx-auto max-w-[1760px] space-y-4">
        <div className="flex flex-col gap-3 border-t border-black/[0.06] pt-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[8px] font-semibold uppercase tracking-[0.14em] text-[#8A633C]">Platform expansion</div>
            <h2 className="mt-1 text-[20px] font-semibold tracking-[-0.03em] text-[#27231F]">Commercial provisioning & runtime control</h2>
            <p className="mt-1 text-[9px] text-[#918B83]">Persisted commercial configuration, live demand evidence and governed release truth. Idle is not failure; unverified is never presented as healthy.</p>
          </div>
          <div className="relative w-full lg:max-w-[420px]">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9A948C]" />
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search subscription, module, job or worker" className="h-9 w-full rounded-lg border border-black/[0.08] bg-white pl-8 pr-3 text-[10px] text-[#35312D] outline-none placeholder:text-[#AAA49C] focus:border-[#A37849]/35" />
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.05fr_1fr]">
          <Panel eyebrow="Commercial provisioning" title="Subscriptions & selected modules" description="Customer commercial configuration from the persisted subscriptions table; no inferred plans.">
            <div className="hidden grid-cols-[minmax(190px,1fr)_110px_110px_130px_minmax(190px,1fr)_110px] gap-3 border-b border-black/[0.05] bg-white/45 px-5 py-2 text-[7px] font-semibold uppercase tracking-[0.1em] text-[#979087] md:grid">
              <span>Customer</span><span>Status</span><span>Cycle</span><span>Monthly</span><span>Selected modules</span><span>Updated</span>
            </div>
            {filteredSubscriptions.map(row => {
              const org = organizationsById.get(t(row.organization_id));
              const modules = modulesList(row.selected_modules);
              return (
                <div key={row.id} className="grid gap-2 border-b border-black/[0.05] px-4 py-3 last:border-b-0 md:grid-cols-[minmax(190px,1fr)_110px_110px_130px_minmax(190px,1fr)_110px] md:items-center md:px-5">
                  <div><div className="text-[10px] font-semibold text-[#35312D]">{t(org?.name || row.company || "Subscription")}</div><div className="mt-0.5 text-[8px] text-[#9A948C]">{t(row.organization_id) || "Organization not bound"}</div></div>
                  <div><Pill>{row.status || "unknown"}</Pill></div>
                  <div className="text-[8px] text-[#625D56]">{label(row.billing_cycle || "—")}</div>
                  <div className="text-[8px] font-medium text-[#3A3631]">{money(row.final_monthly_total, row.currency)}</div>
                  <div className="text-[8px] leading-4 text-[#746E66]">{modules.length ? modules.join(" · ") : "No selected modules persisted"}</div>
                  <div className="text-[8px] text-[#9A948C]">{when(row.updated_at || row.created_at)}</div>
                </div>
              );
            })}
            {!filteredSubscriptions.length ? <div className="px-5 py-10 text-center text-[10px] text-[#918B83]">No subscriptions in this view.</div> : null}
          </Panel>

          <Panel eyebrow="Runtime truth" title="Demand, leases & liveness" description="Current demand is derived from queue jobs, Safe Lease allocations and leased Creative production work. Heartbeats prove worker liveness when a worker contract exists.">
            <div className="grid border-b border-black/[0.05] bg-[#FBF8F3] sm:grid-cols-3 xl:grid-cols-6">
              {[
                ["State", label(queueHealth.status || "unverified")],
                ["Demand", Number(queueHealth.demand_count || 0)],
                ["Queue", Number(queueHealth.active_jobs || 0)],
                ["RunPod leases", Number(queueHealth.active_runpod_leases || 0)],
                ["Creative leases", Number(queueHealth.active_creative_tasks || 0)],
                ["Fresh workers", Number(queueHealth.fresh_workers || 0)],
              ].map(([name, value], index) => (
                <div key={name} className={`px-4 py-3 ${index ? "sm:border-l sm:border-black/[0.05]" : ""}`}>
                  <div className="text-[7px] font-semibold uppercase tracking-[0.1em] text-[#979087]">{name}</div>
                  <div className={`mt-1 text-[14px] font-semibold ${name === "State" && queueHealth.status === "degraded" ? "text-[#9A533D]" : "text-[#4B4640]"}`}>{value}</div>
                </div>
              ))}
            </div>
            <div className="grid gap-2 border-b border-black/[0.05] px-4 py-3 sm:grid-cols-3 md:px-5">
              {[
                ["Intelligence", Number(lanes.intelligence || 0)],
                ["Video", Number(lanes.video || 0)],
                ["Voice", Number(lanes.voice || 0)],
              ].map(([name, count]) => (
                <div key={name} className="rounded-lg border border-black/[0.06] bg-white px-3 py-2">
                  <div className="text-[7px] font-semibold uppercase tracking-[0.1em] text-[#979087]">{name} Safe Lease</div>
                  <div className="mt-1 text-[10px] font-semibold text-[#3A3631]">{count} current</div>
                </div>
              ))}
            </div>
            <div className="border-b border-black/[0.05] bg-[#FBF8F3] px-5 py-3 text-[8px] leading-4 text-[#8B847B]">
              <strong className="font-semibold text-[#4B4640]">{livenessSummary(queueHealth)}</strong>
              {queueHealth.latest_heartbeat_at ? <> · runtime heartbeat {when(queueHealth.latest_heartbeat_at)}</> : null}
              {queueHealth.latest_creative_heartbeat_at ? <> · Creative heartbeat {when(queueHealth.latest_creative_heartbeat_at)}</> : null}
              <div className="mt-1 text-[7px] uppercase tracking-[0.08em] text-[#A19A91]">Evidence: {label(queueHealth.source || "unverified")}</div>
            </div>

            <div className="hidden grid-cols-[120px_110px_90px_120px_1fr_110px] gap-3 border-b border-black/[0.05] bg-white/45 px-5 py-2 text-[7px] font-semibold uppercase tracking-[0.1em] text-[#979087] md:grid">
              <span>Type</span><span>Status</span><span>Priority</span><span>Worker</span><span>Error / retry</span><span>Created</span>
            </div>
            {filteredJobs.slice(0, 80).map(row => (
              <div key={row.id} className="grid gap-2 border-b border-black/[0.05] px-4 py-3 last:border-b-0 md:grid-cols-[120px_110px_90px_120px_1fr_110px] md:items-center md:px-5">
                <div className="truncate text-[8px] font-medium text-[#35312D]">{label(row.type)}</div>
                <div><Pill>{row.status || "unknown"}</Pill></div>
                <div className="text-[8px] text-[#625D56]">{label(row.priority || "normal")}</div>
                <div className="truncate text-[8px] text-[#625D56]">{t(row.worker_name) || "Unassigned"}</div>
                <div className={`truncate text-[8px] ${row.error_message ? "text-[#9A533D]" : "text-[#746E66]"}`}>{row.error_message || `Retry ${Number(row.retry_count || 0)} / ${Number(row.max_retries || 0)}`}</div>
                <div className="text-[8px] text-[#9A948C]">{when(row.created_at)}</div>
              </div>
            ))}
            {!filteredJobs.length ? <div className="px-5 py-7 text-center text-[9px] text-[#918B83]">No generic queue jobs in this view. Historical rows remain separate from current runtime demand.</div> : null}
            <div className="border-t border-black/[0.05] bg-[#FBF8F3] px-5 py-2.5 text-[8px] text-[#8B847B]">
              Historical queue: {queueJobs.length} rows · {activeJobs.length} active · {failedJobs.length} failed · {deadLetterJobs.length} dead letter · latest {latestJobAt ? when(latestJobAt) : "no evidence"}.
            </div>
          </Panel>
        </div>

        <Panel
          eyebrow="Release & change control"
          title="Deployment truth"
          description="Current build identity and production deployment history are separate evidence. Git commits are never treated as proof that a release was deployed."
          action={<Pill>{releaseHistory.status || "unverified"}</Pill>}
        >
          <div className="grid gap-3 border-b border-black/[0.05] px-4 py-4 md:grid-cols-5 md:px-5">
            {[
              ["Environment", releaseState.environment || "unknown", Boxes],
              ["Git branch", releaseState.ref || "unknown", GitCommitHorizontal],
              ["Running commit", releaseState.commitSha ? releaseState.commitSha.slice(0, 12) : "unknown", GitCommitHorizontal],
              ["Deployment", releaseState.deploymentId || "unverified", ServerCog],
              ["History source", releaseHistory.status === "verified" ? "Vercel API" : "unverified", ListChecks],
            ].map(([name, value, Icon]) => (
              <div key={name} className="rounded-xl border border-black/[0.06] bg-[#FBF8F3] px-3 py-3">
                <div className="flex items-center gap-2 text-[7px] font-semibold uppercase tracking-[0.1em] text-[#979087]"><Icon size={10} />{name}</div>
                <div className="mt-1 truncate text-[10px] font-semibold text-[#3A3631]">{value}</div>
              </div>
            ))}
          </div>

          {releaseHistory.status !== "verified" ? (
            <div className="px-5 py-5">
              <div className="rounded-xl border border-amber-700/15 bg-amber-50 px-4 py-3">
                <div className="text-[9px] font-semibold text-amber-900">Deployment history is unverified</div>
                <div className="mt-1 text-[8px] leading-4 text-amber-800/80">
                  {releaseHistory.source === "VERCEL_DEPLOYMENT_API_TOKEN_NOT_CONFIGURED"
                    ? "The Platform has no server-side Vercel deployment API credential configured. Current build identity remains visible, but release history is intentionally withheld rather than inferred from Git commits."
                    : t(releaseHistory.error) || `Source: ${label(releaseHistory.source || "unknown")}`}
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="hidden grid-cols-[110px_100px_150px_minmax(240px,1fr)_120px_120px] gap-3 border-b border-black/[0.05] bg-white/45 px-5 py-2 text-[7px] font-semibold uppercase tracking-[0.1em] text-[#979087] md:grid">
                <span>State</span><span>Target</span><span>Commit</span><span>Change</span><span>Created</span><span>Deployment</span>
              </div>
              {deployments.map(row => (
                <div key={row.id || `${row.commitSha}-${row.createdAt}`} className="grid gap-2 border-b border-black/[0.05] px-4 py-3 last:border-b-0 md:grid-cols-[110px_100px_150px_minmax(240px,1fr)_120px_120px] md:items-center md:px-5">
                  <div><Pill>{releaseStateLabel(row)}</Pill></div>
                  <div className="text-[8px] text-[#625D56]">{label(row.target || "unknown")}</div>
                  <div className="truncate text-[8px] font-mono text-[#4B4640]">{row.commitSha ? row.commitSha.slice(0, 12) : "—"}</div>
                  <div className="min-w-0"><div className="truncate text-[9px] font-medium text-[#35312D]">{t(row.commitMessage) || t(row.name) || "Deployment"}</div><div className="mt-0.5 truncate text-[7px] text-[#9A948C]">{t(row.commitRef) || "—"}{row.creator ? ` · ${row.creator}` : ""}</div></div>
                  <div className="text-[8px] text-[#9A948C]">{when(row.createdAt)}</div>
                  <div className="truncate text-[7px] text-[#746E66]">{t(row.id) || "—"}</div>
                </div>
              ))}
              {!deployments.length ? <div className="px-5 py-8 text-center text-[9px] text-[#918B83]">Vercel history verified; no production deployments returned.</div> : null}
            </>
          )}

          <div className="border-t border-black/[0.05] bg-[#FBF8F3] px-5 py-2.5 text-[8px] text-[#8B847B]">
            {currentDeployment ? <>Newest observed production deployment: <strong className="font-semibold text-[#4B4640]">{releaseStateLabel(currentDeployment)}</strong> · {when(currentDeployment.createdAt)}.</> : <>History probe: <strong className="font-semibold text-[#4B4640]">{label(releaseHistory.source || "unverified")}</strong>{releaseHistory.checkedAt ? ` · checked ${when(releaseHistory.checkedAt)}` : ""}.</>}
          </div>
        </Panel>
      </div>
    </div>
  );
}
