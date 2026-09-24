import Link from "next/link";
import DeveloperPortalShell from "@/components/workspace/developer/DeveloperPortalShell";
import {
  requireDeveloperPortalAccess,
  canManageDeveloperWebhooks,
  developerAttentionSummary,
  developerCapabilityCatalog,
  developerReadinessSummary,
  developerUsageSummary,
} from "@/lib/developer/DeveloperPortalRuntime";

export const dynamic = "force-dynamic";

function Metric({ label, value, detail }) {
  return <div className="rounded-[18px] border border-black/[.07] bg-white p-4">
    <div className="text-[8px] font-semibold uppercase tracking-[.15em] text-[#9A744B]">{label}</div>
    <div className="mt-3 text-[28px] font-medium tracking-[-.04em] text-[#28231F]">{value}</div>
    <div className="mt-1 text-[9px] leading-4 text-[#8A8178]">{detail}</div>
  </div>;
}

const surfaces = [
  ["Capability Catalog","Browse exact governed operations contracts, lifecycle commands, events and boundaries.","/capabilities"],
  ["API Explorer","Run safe session reads or inspect the versioned machine API with credential-bound reads and explicitly confirmed governed commands.","/api-explorer"],
  ["Credentials","Create, rotate and revoke machine credentials with explicit environment and scope.","/credentials"],
  ["Webhooks","Register event destinations, signing secrets, delivery status and retry controls.","/webhooks"],
  ["Environments","Separate development, staging and production identities and release boundaries.","/environments"],
  ["Logs","Trace executions, failures, provider paths and health without exposing hidden prompts or secrets.","/logs"],
  ["Usage","Understand requests, success/failure, provider execution and metered service history.","/usage"],
  ["SDKs","Generate typed client starters from current Avantiqo capability contracts.","/sdks"],
  ["Docs","Contract-first quickstarts, auth, idempotency, pagination, events and production guidance.","/docs"],
];

export default async function DeveloperWorkspacePage({ params }) {
  const resolved = await params;
  const organizationId = String(resolved?.organizationId || "").trim();
  const access = await requireDeveloperPortalAccess({ organizationId });
  if (!access.success) {
    return <div className="mx-auto max-w-3xl rounded-[26px] border border-black/[.08] bg-white p-7 text-[#1B1A18]">
      <div className="text-[10px] font-semibold uppercase tracking-[.18em] text-[#A37849]">Developer access required</div>
      <h1 className="mt-3 text-2xl font-semibold">This developer workspace is not enabled for your account.</h1>
      <p className="mt-3 text-[12px] leading-6 text-[#6F6B64]">Use your Business workspace, or ask an organization owner to enable developer access.</p>
    </div>;
  }

  const catalog = developerCapabilityCatalog();
  const usage = await developerUsageSummary(access.organizationId, { externalDeveloper: access.externalDeveloper === true, userId: access.user?.id || access.userId || null });
  const [readiness, attention] = access.externalDeveloper
    ? [null, null]
    : await Promise.all([
        developerReadinessSummary(access.organizationId),
        developerAttentionSummary(access.organizationId),
      ]);
  const writable = catalog.filter((c) => !c.readOnly).length;
  const groups = new Set(catalog.map((c) => c.group)).size;
  const base = `/workspace/${access.organizationId}/developers`;
  const canManageWebhooks = canManageDeveloperWebhooks(access);
  const visibleSurfaces = surfaces.filter(([, , suffix]) => !access.externalDeveloper || suffix !== "/webhooks" || canManageWebhooks);

  return <DeveloperPortalShell organizationId={access.organizationId} externalDeveloper={access.externalDeveloper === true} permissions={access.permissions || []} role={access.role || ""} current="">
    <section className="overflow-hidden rounded-[28px] border border-black/[.07] bg-[linear-gradient(135deg,#FBF7F0,#ECE2D5)] p-7 shadow-[0_24px_70px_rgba(62,43,23,.08)] md:p-10">
      <div className="grid gap-10 xl:grid-cols-[1.1fr_.9fr] xl:items-end">
        <div>
          <div className="text-[9px] font-semibold uppercase tracking-[.22em] text-[#9A6531]">Developer control plane</div>
          <h1 className="mt-4 max-w-4xl text-[48px] font-medium leading-[.95] tracking-[-.055em] md:text-[66px]">Build on the same governed capabilities that run Avantiqo.</h1>
          <p className="mt-5 max-w-3xl text-[12px] leading-6 text-[#665E56]">Discover exact capability contracts, authenticate machines, bind organization context, call and verify APIs, receive signed events, inspect execution evidence, meter usage and move safely from development to production.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Metric label="Capabilities" value={catalog.length} detail="Canonical operations contracts" />
          <Metric label="Writable" value={writable} detail="Governed command surfaces" />
          <Metric label="Groups" value={groups} detail="Capability families" />
          <Metric label={access.externalDeveloper ? "Your API requests" : "Recent usage"} value={usage.total} detail={usage.schemaReady ? `${usage.success} success · ${usage.failed} failed` : "Ledger unavailable"} />
        </div>
      </div>
    </section>

    {access.externalDeveloper ? <>
      <section className="mt-5 grid gap-3 xl:grid-cols-[1.08fr_.92fr]">
        <div className="rounded-[24px] border border-black/[.07] bg-white p-6 text-[#24201B]">
          <div className="text-[9px] font-semibold uppercase tracking-[.18em] text-[#D6A66A]">External developer authority</div>
          <div className="mt-3 text-[24px] font-semibold tracking-[-.03em]">Organization-scoped. Never employee access.</div>
          <p className="mt-3 max-w-2xl text-[9px] leading-5 text-[#777169]">This identity can use only the Developer Portal permissions explicitly granted by the organization. Business workspace, HR, finance administration, integrations, compute administration and organization-wide security evidence remain outside this authority.</p>
          <div className="mt-5 flex flex-wrap gap-2"><span className="rounded-full border border-black/[.08] bg-[#F8F4EE] px-3 py-1.5 text-[8px] font-semibold">{access.role}</span>{(access.permissions||[]).map((permission)=><span key={permission} className="rounded-full border border-[#D6A66A]/20 bg-[#D6A66A]/[.07] px-3 py-1.5 font-mono text-[8px] text-[#8A633C]">{permission}</span>)}</div>
        </div>
        <div className="rounded-[24px] border border-black/[.07] bg-white p-6">
          <div className="text-[9px] font-semibold uppercase tracking-[.17em] text-[#9A744B]">Your developer activity</div>
          <div className="mt-4 grid grid-cols-3 gap-2">{[["Requests",usage.total],["Success",usage.success],["Failed",usage.failed]].map(([label,value])=><div key={label} className="rounded-xl bg-[#F8F4EE] p-3"><div className="text-[7px] uppercase tracking-[.11em] text-[#91877C]">{label}</div><div className="mt-2 text-[20px] font-semibold">{value}</div></div>)}</div>
          <p className="mt-4 text-[8px] leading-5 text-[#7B736B]">Only API traffic tied to credentials created by your developer identity is counted here. Other developers and organization-wide service cost are intentionally hidden.</p>
        </div>
      </section>
      <section className="mt-3 rounded-[22px] border border-black/[.07] bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-[9px] font-semibold uppercase tracking-[.17em] text-[#9A744B]">Your recent API activity</div><div className="mt-1 text-[9px] text-[#7B736B]">Requests made through credentials owned by this developer identity.</div></div><Link href={`${base}/logs`} className="text-[8px] font-semibold text-[#76502E]">Open your Logs →</Link></div>
        <div className="mt-4 grid gap-2 lg:grid-cols-3">{usage.recent.length ? usage.recent.slice(0,6).map((item)=><Link key={item.id} href={`${base}/logs?request_id=${encodeURIComponent(item.id)}`} className="rounded-xl border border-black/[.06] bg-[#FBF9F6] p-3"><div className="flex items-center justify-between gap-3"><div className="truncate font-mono text-[8px] font-semibold">{item.capability||"—"}</div><div className={"text-[8px] font-semibold "+(item.status==="FAILED"?"text-red-700":"text-[#506D59]")}>{item.status}</div></div><div className="mt-2 text-[7px] text-[#9A9085]">{item.created_at?new Date(item.created_at).toLocaleString():"—"}</div></Link>) : <div className="rounded-xl border border-black/[.06] bg-[#FBF9F6] p-4 text-[8px] text-[#8B8177]">No API activity from your credentials yet.</div>}</div>
      </section>
    </> : <>
    <section className="mt-5 grid gap-3 xl:grid-cols-[1.08fr_.92fr]">
      <div className="rounded-[24px] border border-black/[.07] bg-white p-6 text-[#24201B] shadow-[0_16px_45px_rgba(35,28,22,.08)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-[.18em] text-[#D6A66A]">Today</div>
            <div className="mt-2 text-[24px] font-semibold tracking-[-.03em]">Developer runtime {attention.status === "READY" ? "ready" : attention.status === "ATTENTION" ? "needs attention" : attention.status === "DEGRADED" ? "degraded" : "in setup"}.</div>
            <div className="mt-2 max-w-2xl text-[9px] leading-5 text-[#777169]">Your environments, machine identities, webhooks, request health and next integration step in one live view.</div>
          </div>
          <div className={"rounded-full px-3 py-1.5 text-[8px] font-semibold "+(attention.status==="READY"?"bg-[#DDE9E0] text-[#3D5D48]":attention.status==="ATTENTION"?"bg-red-100 text-red-800":attention.status==="DEGRADED"?"bg-[#F3E7D3] text-[#76502E]":"bg-[#F0E7DA] text-[#8A633C]")}>{attention.status}</div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-2 md:grid-cols-4">
          {[
            ["Environments",attention.active_environments],
            ["Credentials",attention.usable_credentials],
            ["Webhooks",attention.active_webhooks],
            ["Recent requests",attention.recent_requests],
          ].map(([label,value])=><div key={label} className="rounded-xl border border-black/[.06] bg-[#FBF9F6] p-3"><div className="text-[7px] uppercase tracking-[.11em] text-[#91877C]">{label}</div><div className="mt-2 text-[20px] font-semibold">{value}</div></div>)}
        </div>

        {attention.next_action ? <Link href={`${base}${attention.next_action.href}`} className="mt-5 flex items-center justify-between gap-4 rounded-xl border border-[#D6A66A]/20 bg-[#D6A66A]/[.07] p-4 transition hover:bg-[#D6A66A]/[.1]">
          <div>
            <div className="text-[7px] font-semibold uppercase tracking-[.12em] text-[#D6A66A]">Next safe action</div>
            <div className="mt-1 text-[11px] font-semibold">{attention.next_action.label}</div>
            <div className="mt-1 text-[8px] leading-4 text-[#7B736B]">{attention.next_action.detail}</div>
          </div>
          <div className="text-[9px] font-semibold text-[#8A633C]">Open →</div>
        </Link> : null}
      </div>

      <div className="rounded-[24px] border border-black/[.07] bg-white p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-[.17em] text-[#9A744B]">Needs attention</div>
            <div className="mt-2 text-[15px] font-semibold">{attention.attention.length ? attention.attention.length+" live item"+(attention.attention.length===1?"":"s") : "No urgent developer issues"}</div>
          </div>
          <Link href={`${base}/logs`} className="rounded-lg border border-black/[.08] px-3 py-2 text-[8px] font-semibold">Open Logs →</Link>
        </div>
        <div className="mt-4 space-y-2">
          {attention.attention.length ? attention.attention.slice(0,5).map((item,index)=><Link key={index} href={`${base}${item.href}`} className={"block rounded-xl border p-3 transition hover:border-[#B7793B]/30 "+(item.severity==="high"?"border-red-200 bg-red-50/70":item.severity==="medium"?"border-[#B7793B]/20 bg-[#FBF6EF]":"border-black/[.06] bg-[#FBF9F6]")}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><div className={"text-[9px] font-semibold "+(item.severity==="high"?"text-red-800":"text-[#4D463F]")}>{item.title}</div><div className="mt-1 text-[7px] leading-4 text-[#7B736B]">{item.detail}</div></div>
              <div className="shrink-0 text-[7px] font-semibold text-[#76502E]">{item.action} →</div>
            </div>
          </Link>) : <div className="rounded-xl border border-[#DDE7DF] bg-[#F5F8F5] p-4 text-[8px] leading-5 text-[#506D59]">No current credential, quota, webhook or Developer API issue requires action.</div>}
        </div>
      </div>
    </section>

    <section className="mt-3 rounded-[22px] border border-black/[.07] bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[9px] font-semibold uppercase tracking-[.17em] text-[#9A744B]">Live developer activity</div>
          <div className="mt-1 text-[9px] text-[#7B736B]">Latest machine API traffic, surfaced like Staff Portal’s live work feed.</div>
        </div>
        <Link href={`${base}/logs`} className="text-[8px] font-semibold text-[#76502E]">Inspect all requests →</Link>
      </div>
      <div className="mt-4 grid gap-2 lg:grid-cols-3">
        {attention.recent_activity.length ? attention.recent_activity.map((item)=><Link key={item.id} href={`${base}/logs?request_id=${encodeURIComponent(item.id)}`} className="rounded-xl border border-black/[.06] bg-[#FBF9F6] p-3 transition hover:border-[#B7793B]/30">
          <div className="flex items-center justify-between gap-3"><div className="truncate font-mono text-[8px] font-semibold">{item.capability_id}</div><div className={"text-[8px] font-semibold "+(Number(item.status_code)>=400?"text-red-700":"text-[#506D59]")}>{item.status_code}</div></div>
          <div className="mt-1 text-[7px] text-[#81786F]">{item.operation || "GET"} · {item.latency_ms} ms</div>
          {item.error_code?<div className="mt-1 font-mono text-[7px] text-red-700">{item.error_code}</div>:null}
          <div className="mt-2 text-[7px] text-[#9A9085]">{new Date(item.created_at).toLocaleString()}</div>
        </Link>) : <div className="rounded-xl border border-black/[.06] bg-[#FBF9F6] p-4 text-[8px] text-[#8B8177]">No machine API activity yet.</div>}
      </div>
    </section>

    <section className="mt-5 grid gap-3 xl:grid-cols-[.72fr_1.28fr]">
      <div className="rounded-[22px] border border-black/[.07] bg-white p-6 text-[#24201B]">
        <div className="text-[9px] font-semibold uppercase tracking-[.17em] text-[#D6A66A]">Integration readiness</div>
        <div className="mt-5 flex items-end justify-between gap-4">
          <div>
            <div className="text-[46px] font-medium tracking-[-.05em]">{readiness.score}%</div>
            <div className="mt-1 text-[9px] text-[#776F66]">{readiness.completed} of {readiness.total} evidence-backed steps complete</div>
          </div>
          <div className={"rounded-full px-3 py-1.5 text-[8px] font-semibold "+(readiness.production_ready?"bg-[#DDE9E0] text-[#3D5D48]":"bg-[#EFE8DE] text-[#5F574E]")}>
            {readiness.production_ready?"Production ready":"Production not ready"}
          </div>
        </div>
        <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-[#EFE8DE]"><div className="h-full rounded-full bg-[#D6A66A]" style={{width:`${readiness.score}%`}} /></div>
        <p className="mt-5 text-[9px] leading-5 text-[#777169]">Completion comes from live environment, credential, API request and webhook evidence. Nothing here can be checked off manually.</p>
      </div>
      <div className="rounded-[22px] border border-black/[.07] bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-[.17em] text-[#9A744B]">Getting started</div>
            <div className="mt-2 text-[15px] font-semibold">From first read to governed Production.</div>
          </div>
          <Link href={`${base}/docs`} className="rounded-lg border border-black/[.08] px-3 py-2 text-[8px] font-semibold">Read contract guide →</Link>
        </div>
        <div className="mt-5 grid gap-2 md:grid-cols-2">
          {readiness.steps.map((step,index)=><Link key={step.id} href={`${base}${step.href}`} className={"group rounded-xl border p-4 transition "+(step.complete?"border-[#DDE7DF] bg-[#F5F8F5]":"border-black/[.06] bg-[#FBF9F6] hover:border-[#B7793B]/30")}>
            <div className="flex items-start gap-3">
              <div className={"flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[8px] font-semibold "+(step.complete?"bg-[#DDE9E0] text-[#3D5D48]":"bg-[#F0E8DC] text-[#76502E]")}>{step.complete?"✓":index+1}</div>
              <div className="min-w-0">
                <div className="text-[10px] font-semibold">{step.label}</div>
                <div className="mt-1 text-[8px] leading-4 text-[#7B736B]">{step.detail}</div>
                <div className="mt-2 text-[8px] font-semibold text-[#76502E]">{step.complete?"Verified":"Open step →"}</div>
              </div>
            </div>
          </Link>)}
        </div>
      </div>
    </section>

    </>}

    <section className="mt-5 rounded-[22px] border border-black/[.07] bg-white p-6">
      <div className="grid gap-6 lg:grid-cols-[.62fr_1.38fr]">
        <div>
          <div className="text-[9px] font-semibold uppercase tracking-[.17em] text-[#9A744B]">Developer language</div>
          <div className="mt-2 text-[18px] font-semibold tracking-[-.025em]">The terms you will see throughout the portal.</div>
          <p className="mt-3 text-[9px] leading-5 text-[#7B736B]">Avantiqo uses these words consistently across the API, portal, SDKs and logs. Understanding them once makes the rest of the control plane much easier to navigate.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Capability","One governed business contract such as Work Requests, Checkout or Operational Alerts."],
            ["Environment","A separate machine boundary—Development, Staging or Production—with its own authority and quotas."],
            ["Credential","A machine identity used by one application or service to authenticate to the Developer API."],
            ["Scope","The candidate authority attached to a credential. Avantiqo still enforces capability and organization policy on every request."],
            ["Command","A governed action that can change capability state, such as create, assign, approve, complete or refund."],
            ["Event","Evidence emitted after a governed business action commits. Production webhooks can subscribe to these events."],
            ["Idempotency key","A stable key that prevents the same external mutation from executing twice when a request is retried."],
            ["Request ID","The durable correlation identity for one Developer API request. Keep it for debugging, logs and support."],
          ].map(([term,copy])=><div key={term} className="rounded-xl border border-black/[.06] bg-[#FBF9F6] p-3"><div className="text-[9px] font-semibold text-[#4A423B]">{term}</div><div className="mt-1 text-[7px] leading-4 text-[#7D756D]">{copy}</div></div>)}
        </div>
      </div>
    </section>

    <section className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {visibleSurfaces.map(([title, copy, suffix], i) => <Link key={title} href={`${base}${suffix}`} className="group rounded-[22px] border border-black/[.07] bg-white p-6 shadow-[0_8px_30px_rgba(41,31,20,.035)] transition hover:-translate-y-0.5 hover:border-[#B7793B]/35">
        <div className="text-[8px] font-semibold text-[#A37849]">0{i+1}</div>
        <h2 className="mt-6 text-[17px] font-semibold tracking-[-.02em]">{title}</h2>
        <p className="mt-2 text-[10px] leading-5 text-[#746D65]">{copy}</p>
        <div className="mt-5 text-[9px] font-semibold text-[#76502E]">Open {title} →</div>
      </Link>)}
    </section>

    <section className="mt-5 grid gap-3 lg:grid-cols-[1.1fr_.9fr]">
      <div className="rounded-[22px] border border-black/[.07] bg-white p-6">
        <div className="text-[9px] font-semibold uppercase tracking-[.17em] text-[#9A744B]">Developer contract</div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {[
            ["Scope","Every request binds to the exact organization and capability context."],
            ["Authority","Read, create, update, execute, control and admin remain permission-bound."],
            ["Evidence","Idempotency, execution records and verification remain part of the runtime."],
          ].map(([t,c]) => <div key={t} className="rounded-xl bg-[#F8F4EE] p-4"><div className="text-[10px] font-semibold">{t}</div><div className="mt-2 text-[9px] leading-5 text-[#7D756D]">{c}</div></div>)}
        </div>
      </div>
      <div className="rounded-[22px] border border-black/[.07] bg-white p-6 text-[#24201B]">
        <div className="text-[9px] font-semibold uppercase tracking-[.17em] text-[#D6A66A]">Live foundation</div>
        <div className="mt-4 text-[15px] font-semibold">The portal is attached to real Avantiqo runtime surfaces.</div>
        <div className="mt-3 text-[10px] leading-5 text-[#776F66]">{access.externalDeveloper ? "Canonical Operations catalog · scoped Developer authority · own machine credentials · own request evidence · generated SDK contracts." : "Canonical Operations catalog · organization access · permission policy · service usage ledger · integrations registry · compute telemetry · Code runtime."}</div>
      </div>
    </section>
  </DeveloperPortalShell>;
}
