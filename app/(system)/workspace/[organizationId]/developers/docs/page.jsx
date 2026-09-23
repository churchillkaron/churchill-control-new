import DeveloperPortalShell from "@/components/workspace/developer/DeveloperPortalShell";
import DeveloperQuickstartClient from "@/components/workspace/developer/DeveloperQuickstartClient";
import {
  developerCapabilityCatalog,
  requireDeveloperPortalAccess,
} from "@/lib/developer/DeveloperPortalRuntime";

export const dynamic = "force-dynamic";

const sections = [
  ["Authentication","Use an environment-bound machine credential. Human browser sessions remain separate from machine identity."],
  ["Organization scope","Every business call is bound to one organization. Entity and period context are supplied only where the capability requires them."],
  ["Idempotency","Every external mutation requires an 8–200 character Idempotency-Key. The gateway owns a 24-hour replay ledger per organization and environment: the same key + same request replays the stored result, a different request returns 409, and an in-progress request cannot execute twice."],
  ["Permissions","A token scope is candidate authority, not final authority. Capability authorization and organization policy still apply on every request."],
  ["Errors","Treat 4xx as contract, authority, quota or idempotency failures and 5xx as control-plane/runtime failures. Mutations must use application/json, contain a JSON object and stay within 256 KiB. Retry a mutation only with the exact same idempotency key and payload."],
  ["Webhooks","Webhook subscriptions and event evidence are environment-bound. Development and Staging accept explicit developer.test events only. Production may subscribe to specific canonical Operations events or an explicit wildcard. Live business events originate from the immutable committed Operations event stream, so external delivery never precedes the business commit. Endpoint name/URL can be updated without rotating its signing secret or replacing subscriptions; every destination change is revalidated against the public-HTTPS/SSRF policy and security-audited. Keep the event id as your deduplication identity because delivery is at-least-once. Transient network, 408, 425, 429 and 5xx failures automatically retry with bounded exponential backoff up to 20 attempts; permanent 4xx failures do not. Replayable event evidence is retained for 30 days. A manual replay creates a separate delivery record, preserves the original delivery evidence, sends the same retained event id/payload, and is idempotent by replay key."],
  ["Webhook verification","Read x-avantiqo-signature in the form t=<unix>,v1=<sha256>, verify HMAC-SHA256 over t + '.' + the exact raw request body using the endpoint signing secret, reject signatures outside your timestamp tolerance, then deduplicate using x-avantiqo-event-id. The generated TypeScript and Python SDKs include verification helpers with a 5-minute default tolerance."],
  ["Environment data safety","Development and Staging machine identities are read-only against the live organization data plane. Their webhook endpoints are for explicit test events. Business mutations and live business-event delivery require Production until Avantiqo provides an isolated sandbox data plane."],
  ["Production","Production is the live machine environment. Creating it requires the explicit phrase CREATE PRODUCTION and creates the environment disabled. Activating it is a separate governed action requiring ENABLE PRODUCTION. If a disabled Production environment still has active non-expired credentials or active webhook endpoints, reactivation also requires explicit acknowledgement of those integrations because they will become live again. Repeating create cannot enable an existing environment. Production credentials require stronger developer-security authority, have shorter maximum lifetimes and are the only Developer API credentials permitted to mutate business state."],
  ["API version","The v1 gateway returns X-Avantiqo-Api-Version and X-Avantiqo-Environment headers. Breaking contract changes require a new versioned surface rather than silent mutation of v1."],
  ["Deprecation","Compatible additions may land inside v1. A future deprecation must be announced before removal, identify its replacement and preserve the old version during the published migration window."],
  ["Rate limits & quotas","Requests/minute is enforced across the whole environment, not per token. The gateway returns limit/remaining/reset metadata for the minute window, monthly usage/limit/remaining/reset metadata, and Retry-After on quota-driven 429 responses so clients never need to guess when to retry."],
];

export default async function Page({ params }) {
  const resolved = await params;
  const access = await requireDeveloperPortalAccess({ organizationId: resolved?.organizationId });
  if (!access.success) return null;
  const catalog = developerCapabilityCatalog();
  const quickstartCapability = catalog.find((capability) => capability.id === "work-requests") || catalog[0] || null;

  return <DeveloperPortalShell organizationId={access.organizationId} externalDeveloper={access.externalDeveloper === true} permissions={access.permissions || []} role={access.role || ""} current="/docs">
    <section className="rounded-[22px] border border-black/[.07] bg-white p-6">
      <div className="text-[9px] font-semibold uppercase tracking-[.18em] text-[#A37849]">Developer docs</div>
      <h1 className="mt-3 text-[38px] font-medium tracking-[-.045em]">Build against governed contracts.</h1>
      <p className="mt-3 max-w-3xl text-[11px] leading-6 text-[#706960]">Versioned API behavior, explicit authority and replay-safe delivery are part of the contract—not optional implementation details.</p>
      <div className="mt-5 grid gap-2 md:grid-cols-4">
        {[
          ["1. Authenticate","Create an environment and least-privilege credential."],
          ["2. Prove a read","Use the quickstart or API Explorer before coding the integration."],
          ["3. Add mutations","Move write authority to Production and make every mutation idempotent."],
          ["4. Operate","Verify webhooks, preserve request IDs and watch Logs + Usage."],
        ].map(([title,copy])=><div key={title} className="rounded-xl bg-[#F8F4EE] p-3"><div className="text-[8px] font-semibold">{title}</div><div className="mt-1 text-[7px] leading-4 text-[#776F67]">{copy}</div></div>)}
      </div>
      {quickstartCapability ? <div className="mt-6"><DeveloperQuickstartClient organizationId={access.organizationId} capabilityId={quickstartCapability.id} /></div> : null}
      <div className="mt-6 grid gap-3 md:grid-cols-2">
        {sections.map(([title, copy]) => <div key={title} className="rounded-xl border border-black/[.06] bg-[#FBF9F6] p-4">
          <div className="text-[11px] font-semibold">{title}</div>
          <div className="mt-2 text-[9px] leading-5 text-[#776F67]">{copy}</div>
        </div>)}
      </div>
    </section>
  </DeveloperPortalShell>;
}
