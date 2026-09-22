import DeveloperPortalShell from "@/components/workspace/developer/DeveloperPortalShell";
import {
  developerEnvironmentQuotaSummary,
  developerUsageSummary,
  requireDeveloperPortalAccess,
} from "@/lib/developer/DeveloperPortalRuntime";

export const dynamic = "force-dynamic";

function n(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

export default async function Page({ params }) {
  const resolved = await params;
  const organizationId = String(resolved?.organizationId || "").trim();
  const access = await requireDeveloperPortalAccess({ organizationId });
  if (!access.success) return null;

  const [usage, quotas] = await Promise.all([
    developerUsageSummary(access.organizationId, { externalDeveloper: access.externalDeveloper === true, userId: access.user?.id || access.userId || null }),
    developerEnvironmentQuotaSummary(access.organizationId, { externalDeveloper: access.externalDeveloper === true, userId: access.user?.id || access.userId || null }),
  ]);
  const rows = usage.recent || [];

  return <DeveloperPortalShell organizationId={access.organizationId} externalDeveloper={access.externalDeveloper === true} permissions={access.permissions || []} role={access.role || ""} current="/usage">
    <section className="rounded-[22px] border border-black/[.07] bg-white p-6">
      <div className="text-[9px] font-semibold uppercase tracking-[.18em] text-[#A37849]">Usage</div>
      <h1 className="mt-3 text-[38px] font-medium tracking-[-.045em]">Metered execution and developer quotas.</h1>
      <p className="mt-3 max-w-3xl text-[11px] leading-6 text-[#706960]">{access.externalDeveloper ? "This view is limited to Developer API activity created by your own developer identity. Organization-wide service costs and other developers’ credential/webhook counts remain hidden." : "Service cost and machine API request quotas stay separate. API quotas protect the control plane; billable service usage remains grounded in the service usage ledger."}</p>
      <div className="mt-5 grid gap-2 md:grid-cols-3">
        <div className="rounded-xl bg-[#F8F4EE] p-3"><div className="text-[8px] font-semibold">Rate limit</div><div className="mt-1 text-[7px] leading-4 text-[#776F67]">Requests per minute protects one environment from bursts. It is shared across that environment, not reset per token.</div></div>
        <div className="rounded-xl bg-[#F8F4EE] p-3"><div className="text-[8px] font-semibold">Monthly API quota</div><div className="mt-1 text-[7px] leading-4 text-[#776F67]">Controls how many Developer API requests the environment can make in the current monthly window.</div></div>
        <div className="rounded-xl bg-[#F8F4EE] p-3"><div className="text-[8px] font-semibold">{access.externalDeveloper ? "Your API activity" : "Service usage"}</div><div className="mt-1 text-[7px] leading-4 text-[#776F67]">{access.externalDeveloper ? "Shows only requests made with credentials created by your developer identity. Other developers and organization service costs are not exposed." : "Shows provider-backed or metered execution cost. A successful API request and a billable downstream service are not the same thing."}</div></div>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {[["Recent records",usage.total],["Successful",usage.success],["Failed",usage.failed]].map(([label,value])=><div key={label} className="rounded-xl bg-[#F7F2EA] p-4"><div className="text-[8px] uppercase tracking-[.13em] text-[#91877C]">{label}</div><div className="mt-2 text-[26px] font-medium">{value}</div></div>)}
      </div>
      {!usage.schemaReady?<div className="mt-4 rounded-xl border border-[#B7793B]/20 bg-[#FBF6EF] p-4 text-[10px] text-[#76502E]">{usage.error}</div>:null}
    </section>

    <section className="mt-4 grid gap-3 lg:grid-cols-3">
      {quotas.map((quota)=>{
        const monthlyPercent = quota.monthly_request_limit == null
          ? null
          : Number(quota.monthly_request_limit) <= 0
            ? 100
            : Math.min(100, Math.round((Number(quota.request_count || 0) / Number(quota.monthly_request_limit)) * 100));
        const credentialPercent = Number(quota.max_active_credentials || 0) > 0
          ? Math.min(100, Math.round((Number(quota.active_credentials || 0) / Number(quota.max_active_credentials)) * 100))
          : 0;
        const webhookPercent = Number(quota.max_active_webhooks || 0) > 0
          ? Math.min(100, Math.round((Number(quota.active_webhooks || 0) / Number(quota.max_active_webhooks)) * 100))
          : 100;
        const warnings = [
          quota.monthly_request_limit !== null && Number(quota.monthly_request_limit) <= 0 ? "Monthly Developer API requests are disabled by policy." : monthlyPercent !== null && monthlyPercent >= 100 ? "Monthly Developer API quota exhausted." : monthlyPercent !== null && monthlyPercent >= 80 ? "Monthly Developer API quota is above 80%." : null,
          credentialPercent >= 100 ? "Active credential capacity is full." : credentialPercent >= 80 ? "Active credential capacity is above 80%." : null,
          Number(quota.max_active_webhooks || 0) <= 0 ? "Webhook creation is disabled by environment policy." : webhookPercent >= 100 ? "Active webhook capacity is full." : webhookPercent >= 80 ? "Active webhook capacity is above 80%." : null,
        ].filter(Boolean);
        return <div key={quota.id} className={"rounded-[20px] border bg-white p-5 "+(warnings.length?"border-[#B7793B]/30":"border-black/[.07]")}>
          <div className="flex items-center justify-between gap-3">
            <div><div className="text-[8px] font-semibold uppercase tracking-[.14em] text-[#9A744B]">{quota.environment_key}</div><div className="mt-2 text-[15px] font-semibold">{quota.name}</div></div>
            <div className="text-[8px] font-semibold">{quota.status}</div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <Metric label="This month" value={quota.request_count} />
            <Metric label="Monthly remaining" value={quota.monthly_request_limit == null ? "Unlimited" : quota.monthly_remaining} />
            <Metric label="Requests / min" value={quota.requests_per_minute} />
            <Metric label="Monthly limit" value={quota.monthly_request_limit == null ? "Unlimited" : quota.monthly_request_limit} />
            <Metric label="Credentials" value={quota.active_credentials + " / " + quota.max_active_credentials} />
            <Metric label="Webhooks" value={quota.active_webhooks + " / " + quota.max_active_webhooks} />
          </div>
          <div className="mt-4 space-y-3">
            <CapacityBar label="Monthly requests" value={monthlyPercent} unlimited={monthlyPercent===null} />
            <CapacityBar label="Credential slots" value={credentialPercent} />
            <CapacityBar label="Webhook slots" value={webhookPercent} />
          </div>
          {warnings.length?<div className="mt-4 rounded-xl border border-[#B7793B]/20 bg-[#FBF6EF] p-3 text-[8px] leading-5 text-[#76502E]">{warnings.map((warning)=><div key={warning}>{warning}</div>)}</div>:null}
        </div>;
      })}
    </section>

    <section className="mt-4 overflow-hidden rounded-[22px] border border-black/[.07] bg-white">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-[9px]">
          <thead className="bg-[#F7F2EA] text-[#8A8178]"><tr><th className="p-3">Time</th><th className="p-3">Capability</th><th className="p-3">Status</th><th className="p-3">Provider</th><th className="p-3">Model</th><th className="p-3">{access.externalDeveloper ? "Scope" : "Cost"}</th></tr></thead>
          <tbody className="divide-y divide-black/[.055]">{rows.map((row,index)=><tr key={row.id||index}><td className="whitespace-nowrap p-3">{row.created_at?new Date(row.created_at).toLocaleString():"—"}</td><td className="p-3 font-mono">{row.capability||row.operation||"—"}</td><td className="p-3">{row.status||row.execution_status||"—"}</td><td className="p-3">{row.provider||"—"}</td><td className="p-3">{row.provider_model||row.model||"—"}</td><td className="p-3">{access.externalDeveloper ? "Own credential" : `${n(row.customer_cost??row.charged_amount??row.cost).toFixed(4)} ${row.currency||"THB"}`}</td></tr>)}</tbody>
        </table>
        {!rows.length?<div className="p-8 text-center text-[10px] text-[#91877C]">No metered service usage recorded for this organization yet.</div>:null}
      </div>
    </section>
  </DeveloperPortalShell>;
}

function CapacityBar({ label, value, unlimited = false }) {
  const percent = unlimited ? 0 : Math.max(0, Math.min(100, Number(value || 0)));
  return <div>
    <div className="flex items-center justify-between gap-3 text-[7px]">
      <span className="font-semibold uppercase tracking-[.1em] text-[#91877C]">{label}</span>
      <span className="font-semibold text-[#6F665D]">{unlimited ? "Unlimited" : percent + "%"}</span>
    </div>
    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#EEE8DF]">
      <div className={"h-full rounded-full "+(percent >= 100 ? "bg-red-500" : percent >= 80 ? "bg-[#B7793B]" : "bg-[#637B69]")} style={{ width: unlimited ? "0%" : percent + "%" }} />
    </div>
  </div>;
}

function Metric({ label, value }) {
  return <div className="rounded-xl bg-[#F8F4EE] p-3">
    <div className="text-[7px] uppercase tracking-[.12em] text-[#91877C]">{label}</div>
    <div className="mt-1 text-[12px] font-semibold">{value}</div>
  </div>;
}
