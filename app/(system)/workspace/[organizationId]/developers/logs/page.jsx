import DeveloperLogsExplorer from "@/components/workspace/developer/DeveloperLogsExplorer";
import DeveloperPortalShell from "@/components/workspace/developer/DeveloperPortalShell";
import {
  developerApiRequestSummary,
  developerIdempotencyHealth,
  developerOperationalHealthSummary,
  developerUsageSummary,
  requireDeveloperPortalAccess,
} from "@/lib/developer/DeveloperPortalRuntime";

export const dynamic = "force-dynamic";

export default async function Page({ params }) {
  const resolved = await params;
  const organizationId = String(resolved?.organizationId || "").trim();
  const access = await requireDeveloperPortalAccess({ organizationId });
  if (!access.success) return null;

  const [usage, requests, idempotency, developerHealth] = await Promise.all([
    developerUsageSummary(access.organizationId).catch((error) => ({ total:0, success:0, failed:0, recent:[], schemaReady:false, error:error?.message })),
    developerApiRequestSummary(access.organizationId, { externalDeveloper: access.externalDeveloper === true, userId: access.user?.id || access.userId || null }).catch((error) => ({ total:0, success:0, failed:0, recent:[], error:error?.message })),
    access.externalDeveloper ? Promise.resolve({ in_progress:0, stale:0, oldest_started_at:null, scope:"HIDDEN_FOR_EXTERNAL_DEVELOPER" }) : developerIdempotencyHealth(access.organizationId).catch((error) => ({ in_progress:0, stale:0, oldest_started_at:null, error:error?.message })),
    access.externalDeveloper ? Promise.resolve({ request_count:0, success_rate:100, p95_latency_ms:0, auth_failures:0, permission_failures:0, conflict_failures:0, throttled:0, server_failures:0, webhook_failed:0, webhook_retrying:0, webhook_exhausted:0, projection_failed:0, projection_dead_letter:0, status:"OWN_REQUESTS_ONLY", scope:"HIDDEN_ORGANIZATION_HEALTH" }) : developerOperationalHealthSummary(access.organizationId).catch((error) => ({ request_count:0, success_rate:0, p95_latency_ms:0, auth_failures:0, permission_failures:0, conflict_failures:0, throttled:0, server_failures:0, webhook_failed:0, webhook_retrying:0, webhook_exhausted:0, projection_failed:0, projection_dead_letter:0, status:"UNAVAILABLE", error:error?.message })),
  ]);

  return <DeveloperPortalShell organizationId={access.organizationId} externalDeveloper={access.externalDeveloper === true} permissions={access.permissions || []} role={access.role || ""} current="/logs">
    <section className="rounded-[22px] border border-black/[.07] bg-white p-6">
      <div className="text-[9px] font-semibold uppercase tracking-[.18em] text-[#A37849]">Logs & health</div>
      <h1 className="mt-3 text-[38px] font-medium tracking-[-.045em]">Trace every machine request.</h1>
      <p className="mt-3 max-w-3xl text-[11px] leading-6 text-[#706960]">{access.externalDeveloper ? "Trace API requests made by credentials created under your own developer identity. Organization-wide security, webhook and idempotency health remains visible only to owner/security-authorized developers." : "Search API traffic and security activity by capability, command, error, environment or action. Request IDs remain durable evidence while bearer tokens and webhook secrets are never stored in these logs."}</p>
      <div className="mt-5 grid gap-2 md:grid-cols-3">
        <div className="rounded-xl bg-[#F8F4EE] p-3"><div className="text-[8px] font-semibold">Start with the request ID</div><div className="mt-1 text-[7px] leading-4 text-[#776F67]">It is the correlation key for one machine request across support, incident diagnosis and execution evidence.</div></div>
        <div className="rounded-xl bg-[#F8F4EE] p-3"><div className="text-[8px] font-semibold">Do not retry blindly</div><div className="mt-1 text-[7px] leading-4 text-[#776F67]">401, 403, 409, 429 and 5xx mean different things. Read the failure class before changing credentials or replaying work.</div></div>
        <div className="rounded-xl bg-[#F8F4EE] p-3"><div className="text-[8px] font-semibold">Mutations need extra care</div><div className="mt-1 text-[7px] leading-4 text-[#776F67]">An in-progress or stale idempotency claim may already have produced a business effect. Reconcile evidence before another attempt.</div></div>
      </div>
      <div className="mt-6 grid gap-3 md:grid-cols-4">
        {[["Recent API requests",requests.total],["API success",requests.success],["API failed",requests.failed],["Service usage",usage.total]].map(([label,value])=><div key={label} className="rounded-xl bg-[#F7F2EA] p-4"><div className="text-[8px] uppercase tracking-[.13em] text-[#91877C]">{label}</div><div className="mt-2 text-[24px] font-medium">{value}</div></div>)}
      </div>
      {!access.externalDeveloper ? <div className="mt-4 grid gap-3 md:grid-cols-4">
        {[["Developer health",developerHealth.status],["p95 latency",developerHealth.p95_latency_ms+" ms"],["Mutations in progress",idempotency.in_progress],["Stale mutation claims",idempotency.stale]].map(([label,value])=><div key={label} className="rounded-xl bg-[#F7F2EA] p-4"><div className="text-[8px] uppercase tracking-[.13em] text-[#91877C]">{label}</div><div className={"mt-2 text-[16px] font-semibold " + (label==="Stale mutation claims" && Number(value)>0 ? "text-red-700" : "")}>{value}</div></div>)}
      </div> : null}
      {idempotency.stale > 0 ? <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-4 text-[9px] leading-5 text-red-700">At least one mutation has remained IN_PROGRESS for more than five minutes. Avantiqo will not auto-retry or recycle it because the external business effect may already have happened. Reconcile the request before taking further action.</div> : null}

      {!access.externalDeveloper ? <div className="mt-5 rounded-[18px] border border-black/[.06] bg-[#FBF9F6] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[8px] font-semibold uppercase tracking-[.14em] text-[#91877C]">Developer operations health</div>
            <div className="mt-1 text-[9px] text-[#746D65]">Last {developerHealth.request_count} machine API requests plus recent webhook delivery/projection state.</div>
          </div>
          <div className={"rounded-full px-3 py-1.5 text-[8px] font-semibold "+(developerHealth.status==="HEALTHY"?"bg-[#DDE9E0] text-[#3D5D48]":developerHealth.status==="DEGRADED"?"bg-[#F3E7D3] text-[#76502E]":"bg-red-50 text-red-700")}>{developerHealth.status}</div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
          {[
            ["Success rate",developerHealth.success_rate+"%"],
            ["p95 latency",developerHealth.p95_latency_ms+" ms"],
            ["401 auth",developerHealth.auth_failures],
            ["403 permission",developerHealth.permission_failures],
            ["409 conflict",developerHealth.conflict_failures],
            ["429 throttled",developerHealth.throttled],
            ["5xx",developerHealth.server_failures],
            ["Webhook failed",developerHealth.webhook_failed],
            ["Webhook retrying",developerHealth.webhook_retrying],
            ["Webhook exhausted",developerHealth.webhook_exhausted],
            ["Projection failed",developerHealth.projection_failed],
            ["Projection dead",developerHealth.projection_dead_letter],
          ].map(([label,value])=><div key={label} className="rounded-xl bg-white p-3"><div className="text-[7px] uppercase tracking-[.11em] text-[#91877C]">{label}</div><div className={"mt-1 text-[12px] font-semibold "+((String(label).includes("dead")||String(label)==="5xx")&&Number(value)>0?"text-red-700":"")}>{value}</div></div>)}
        </div>
        {developerHealth.status!=="HEALTHY"?<div className="mt-3 rounded-xl border border-[#B7793B]/20 bg-[#FBF3E8] p-3 text-[8px] leading-5 text-[#76502E]">Use the buckets above to isolate the failure class before changing credentials or retrying mutations. 401 points to token identity, 403 to authority, 409 to idempotency conflict, 429 to environment policy/quota, and 5xx to Avantiqo runtime/control-plane failure.</div>:null}
      </div> : null}
    </section>
    <DeveloperLogsExplorer organizationId={access.organizationId} />
  </DeveloperPortalShell>;
}
