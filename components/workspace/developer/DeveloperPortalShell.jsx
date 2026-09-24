import Link from "next/link";

function permissionCovers(granted, requested) {
  const g=String(granted||"").trim().toLowerCase();
  const r=String(requested||"").trim().toLowerCase();
  if(!g||!r)return false;
  if(g==="*"||g===r)return true;
  return g.endsWith(".*")&&r.startsWith(g.slice(0,-1));
}

const SECURITY_ROLES=new Set(["OWNER","ORGANIZATION_OWNER","ORG_OWNER","PLATFORM_OWNER","SUPER_ADMIN","ADMIN","ADMINISTRATOR","ORGANIZATION_ADMIN","ORG_ADMIN"]);

const ITEMS = [
  ["Overview", ""],
  ["Access", "/access"],
  ["Capabilities", "/capabilities"],
  ["API Explorer", "/api-explorer"],
  ["Credentials", "/credentials"],
  ["Webhooks", "/webhooks"],
  ["Environments", "/environments"],
  ["Logs", "/logs"],
  ["Usage", "/usage"],
  ["SDKs", "/sdks"],
  ["Integrations", "/integrations", "Administration"],
  ["Compute", "/compute", "Administration"],
  ["Docs", "/docs"],
];

const GUIDE = {
  "": { title: "Start here", copy: "See whether this organization is ready for integration, what needs attention and the next evidence-backed setup step.", use: "Use Overview before changing credentials or Production settings." },
  "/access": { title: "Control who can build against this organization", copy: "Invite external developers, integrators or partners without creating employee or normal business-workspace membership. Access is organization-scoped and independently revocable.", use: "Start external developers with operations.view and expand authority only when the integration actually needs it." },
  "/capabilities": { title: "Choose the business contract", copy: "Find the exact governed capability, its read/write boundary, commands and event surface. These contracts come from the same canonical Operations registry used by runtime execution.", use: "Choose the narrowest capability that matches the product job before creating authority." },
  "/api-explorer": { title: "Prove the request before coding it", copy: "Run read-safe session requests or test the machine API with an environment credential. Production commands require explicit payload, idempotency and confirmation; Development and Staging mutations are blocked server-side.", use: "Use this to verify shape, scope and headers before putting the call into application code." },
  "/credentials": { title: "Machine identity and least privilege", copy: "Create environment-bound bearer credentials with the smallest Operations scopes required. Secrets are shown once; only hashes remain. Rotate or revoke without recovering the original secret.", use: "Development and Staging are read-only. Write scopes are available only in Production until an isolated sandbox data plane exists." },
  "/webhooks": { title: "Committed events into your system", copy: "Register HTTPS destinations, choose event subscriptions, verify HMAC signatures, inspect delivery evidence and control retries or manual replay.", use: "Development and Staging receive developer.test only. Production can subscribe to committed Operations events." },
  "/environments": { title: "Separate testing from live authority", copy: "Development, Staging and Production have separate identities, quotas and webhook boundaries. Production creation and activation are deliberately separate governed actions.", use: "Use non-production for safe reads and connectivity tests; enable Production only when the integration is ready for live authority." },
  "/logs": { title: "Diagnose with durable evidence", copy: "Trace request IDs, status, latency, environment, credential identity, security actions and webhook health without exposing bearer tokens or signing secrets.", use: "Check Logs before retrying failed mutations. Preserve the request ID for support and incident diagnosis." },
  "/usage": { title: "Capacity and economics", copy: "See Developer API request quotas separately from billable service usage. Environment rate limits, monthly capacity, credential slots and webhook slots remain visible.", use: "Use Usage to understand 429 responses, capacity warnings and service cost evidence." },
  "/sdks": { title: "Generated contracts, not hand-maintained wrappers", copy: "Download TypeScript, Python and OpenAPI artifacts generated from the live capability registry with API version, checksum and ETag evidence.", use: "Pin the generated artifact in CI when you need a stable machine-readable contract." },
  "/integrations": { title: "Connected external services", copy: "Manage the organization integrations Avantiqo can use for messaging, payments, commerce, marketing, identity and other provider-backed workflows.", use: "Use this when your application depends on a connected provider rather than a native Avantiqo capability alone." },
  "/compute": { title: "Execution infrastructure", copy: "Inspect and control the compute resources used by AI, media and other heavy workloads within the organization operating model.", use: "Use Compute when the integration invokes workloads that need dedicated CPU/GPU execution capacity." },
  "/docs": { title: "The production contract", copy: "Read the exact auth, versioning, pagination, idempotency, webhook verification, retry, quota and Production rules behind the Developer API.", use: "Treat these rules as part of the API contract, not optional implementation advice." },
};

export default function DeveloperPortalShell({ organizationId, current = "", externalDeveloper = false, permissions = [], role = "", children }) {
  const base = `/workspace/${organizationId}/developers`;
  const guide = GUIDE[current] || GUIDE[""];
  const roleCanManageSecurity=SECURITY_ROLES.has(String(role||"").trim().toUpperCase());
  const canManageSecurity=roleCanManageSecurity || permissions.some(permission=>permissionCovers(permission,"developer.security.manage"));
  const canManageWebhooks=canManageSecurity || permissions.some(permission=>permissionCovers(permission,"developer.webhooks.manage"));
  const visibleItems=ITEMS.filter(([,suffix])=>{
    if(!externalDeveloper)return true;
    if(["/integrations","/compute"].includes(suffix))return false;
    if(suffix==="/access")return canManageSecurity;
    if(suffix==="/webhooks")return canManageWebhooks;
    return true;
  });
  return (
    <div className="mx-auto max-w-[1480px] px-1 py-2 text-[#1A1917]">
      <section className="overflow-hidden rounded-[26px] border border-black/[.07] bg-[#F6F1E8] shadow-[0_18px_55px_rgba(63,45,24,.07)]">
        <div className="flex flex-col gap-5 border-b border-black/[.07] px-5 py-5 md:flex-row md:items-center md:justify-between md:px-7">
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-[.22em] text-[#9A6531]">Avantiqo Developers</div>
            <div className="mt-1 text-[12px] text-[#6D655C]">Organization-scoped developer control plane</div>
          </div>
          <div className="flex flex-wrap gap-2 text-[9px]">
            {!externalDeveloper ? <Link href={`/workspace/${organizationId}`} className="rounded-full border border-black/[.08] bg-white/60 px-3 py-2 text-[#5F574F]">Business workspace</Link> : null}
            {externalDeveloper ? <Link href="/developer-access" className="rounded-full border border-black/[.08] bg-white/60 px-3 py-2 text-[#5F574F]">Developer organizations</Link> : null}
            <Link href="/code" className="rounded-full border border-[#B7793B]/25 bg-[#EFE0CC] px-3 py-2 text-[#76502E]">Avantiqo Code</Link>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto border-b border-black/[.07] bg-white/45 px-3 py-2">
          {visibleItems.map(([label, suffix, destination]) => {
            const active = current === suffix;
            const administrationHandoff = destination === "Administration";
            return <Link
              key={label}
              href={suffix === "/integrations" ? `/workspace/${organizationId}/administration/integrations` : suffix === "/compute" ? `/workspace/${organizationId}/administration/compute` : `${base}${suffix}`}
              title={administrationHandoff ? `${label} opens the canonical Administration workspace` : undefined}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-[9px] font-medium transition ${active ? "border border-[#B98A52]/25 bg-[#EFE3D3] text-[#76502E]" : "text-[#72685F] hover:bg-[#EFE7DC] hover:text-[#2B2621]"}`}
            >
              <span>{label}</span>
              {administrationHandoff ? <span className="ml-1.5 rounded-full border border-[#B7793B]/20 bg-[#EFE0CC] px-1.5 py-0.5 text-[6px] font-semibold uppercase tracking-[.08em] text-[#76502E]">Admin</span> : null}
            </Link>;
          })}
        </nav>
      </section>
      <section className="mt-3 grid gap-3 rounded-[20px] border border-[#B7793B]/16 bg-[#FBF6EF] p-4 md:grid-cols-[.7fr_1.3fr] md:items-start">
        <div>
          <div className="text-[8px] font-semibold uppercase tracking-[.16em] text-[#9A6531]">What this area is for</div>
          <div className="mt-2 text-[13px] font-semibold tracking-[-.02em] text-[#3C342D]">{guide.title}</div>
        </div>
        <div>
          <p className="text-[9px] leading-5 text-[#6F665D]">{guide.copy}</p>
          <p className="mt-2 text-[8px] leading-4 text-[#8A6441]"><span className="font-semibold">Use it like this:</span> {guide.use}</p>
        </div>
      </section>
      <div className="mt-5">{children}</div>
    </div>
  );
}
