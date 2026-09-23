import PublicSiteHeader from "@/components/public/PublicSiteHeader";
import DeveloperPlatformHeroArt from "@/components/public/DeveloperPlatformHeroArt";

const capabilityFamilies = [
  { name: "Execution", code: "EXE", image: "/art/generated/products/products-people-v1.png", description: "Create and control operational work from intake through accountable execution.", capabilities: ["Work Requests", "Work Orders", "Work Items", "Runs", "Recurring Work", "Work History"] },
  { name: "Planning", code: "PLN", image: "/art/generated/products/products-stock-v1.png", description: "Plan workload, capacity, resources, work schedules and operational scenarios without taking ownership away from People or other source domains.", capabilities: ["Operational Plans", "Capacity Planning", "Work Schedules", "Appointment Windows", "Planning Scenarios", "Demand Signals"] },
  { name: "Orchestration", code: "ORC", image: "/art/generated/products/products-intelligence-v2.png", description: "Queue, route, dispatch, assign and coordinate operational work across eligible resources and execution nodes.", capabilities: ["Queues", "Dispatch", "Routing", "Assignments", "Handoffs", "Load Balancing"] },
  { name: "Resources", code: "RES", image: "/art/generated/products/products-stock-v1.png", description: "Work with Operations-owned resources while preserving People, Assets and Administration as the authority for their own master data.", capabilities: ["Resources", "Work Centres", "Equipment", "Devices", "Availability", "Reservations"] },
  { name: "Control", code: "CTL", image: "/art/generated/products/products-documents-v1.png", description: "Govern procedures, checklists, evidence, approvals, release rules and operational policy around execution.", capabilities: ["Procedures", "Checklists", "Completion Evidence", "Sign-offs", "Approvals", "Policy Exceptions"] },
  { name: "Resilience", code: "RSK", image: "/art/generated/products/products-intelligence-v2.png", description: "Handle incidents, exceptions, investigations, corrective actions, escalations and operational recovery through governed lifecycles.", capabilities: ["Incidents", "Investigations", "Root Cause", "Corrective Actions", "Escalations", "Continuity Plans"] },
  { name: "Quality", code: "QLT", image: "/art/generated/products/products-documents-v1.png", description: "Plan and execute inspections, checks, non-conformance handling, rework and operational audits with retained evidence.", capabilities: ["Quality Plans", "Inspections", "Checks", "Non-conformances", "Rework", "Operational Audits"] },
  { name: "Performance", code: "KPI", image: "/art/generated/products/products-intelligence-v2.png", description: "Read and control operational service levels, KPIs and performance evidence such as throughput, lead time, backlog and utilisation.", capabilities: ["Service Levels", "KPI", "Throughput", "Cycle Time", "Backlog", "Scorecards"] },
  { name: "Operational Intelligence", code: "INT", image: "/art/generated/products/products-intelligence-v2.png", description: "Observe the immutable operational event stream, live state, alerts, thresholds, forecasts and audit evidence.", capabilities: ["Operational Events", "Monitoring", "Alerts", "Forecasting", "Audit Trail", "Command Centre"] },
  { name: "Commerce Execution", code: "COM", image: "/art/generated/products/products-finance-v1.png", description: "Run neutral commerce execution while Commercial, Supply Chain and Finance remain authoritative for their own records and accounting.", capabilities: ["Point of Sale", "Order Capture", "Checkout", "Receipts", "Cash Control", "Fulfillment Dispatch"] },
]

const integrationModes = [
  ["API Explorer", "Inspect exact capability contracts, organization context and safe requests before writing integration code."],
  ["Environments", "Separate development, staging and production machine identities and release boundaries."],
  ["SDKs", "Generate client starters from current Avantiqo capability contracts for application code."],
  ["Webhooks", "Receive signed committed business events with delivery evidence, retry and replay controls."],
  ["Observability", "Trace request IDs, failures, latency, throttling and quota health from the developer control plane."],
  ["Production governance", "Move from read-safe validation to live authority only through explicit Production controls, least-privilege scopes and durable request evidence."],
];

function Arrow({ className = "" }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className={className}
      fill="none"
    >
      <path
        d="M4 10h11M11 6l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Check({ className = "" }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className={className}
      fill="none"
    >
      <circle
        cx="10"
        cy="10"
        r="7.25"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path
        d="m6.8 10.1 2 2 4.5-4.6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export const metadata = {
  title: "Developers | Avantiqo",
  description:
    "Build software on Avantiqo with governed capability contracts, scoped machine credentials, environments, versioned APIs, signed webhooks, observability and metered usage.",
};

export default function DevelopersPage() {
  return (
    <main className="min-h-screen bg-[#F7F6F3] text-[#191919]">
      <header className="sticky top-0 z-50 border-b border-black/[0.07] bg-[#F7F6F3]/95 backdrop-blur-xl">
        <div className="mx-auto flex h-[62px] max-w-[1460px] items-center justify-between gap-5 px-5 sm:px-7 lg:px-10">
          <a href="/" className="flex items-center gap-3" aria-label="Avantiqo home">
            <span className="rounded-xl bg-[#171716] px-3 py-2 shadow-[0_4px_16px_rgba(0,0,0,.08)]">
              <Image src="/branding/avantiqo-wordmark.png" alt="Avantiqo" width={126} height={10} className="h-[10px] w-auto object-contain" priority />
            </span>
            <div className="hidden text-[7px] font-semibold uppercase tracking-[0.18em] text-[#9A744B] sm:block">Developers</div>
          </a>
          <nav className="flex items-center gap-1 sm:gap-1.5">
            <a href="#capabilities" className="hidden rounded-lg px-3 py-2 text-[10px] font-medium text-[#6C6963] transition hover:bg-white hover:text-[#292723] md:inline-flex">Capabilities</a>
            <a href="#integration" className="hidden rounded-lg px-3 py-2 text-[10px] font-medium text-[#6C6963] transition hover:bg-white hover:text-[#292723] md:inline-flex">Integration</a>
            <a href="/creative-studios" className="hidden rounded-lg px-3 py-2 text-[10px] font-medium text-[#6C6963] transition hover:bg-white hover:text-[#292723] lg:inline-flex">Creative Studios</a>
            <a href="/" className="hidden rounded-lg px-3 py-2 text-[10px] font-medium text-[#6C6963] transition hover:bg-white hover:text-[#292723] xl:inline-flex">Platform</a>
            <a href="#access" className="ml-1 inline-flex h-9 items-center gap-2 rounded-xl bg-[#171716] px-4 text-[10px] font-semibold text-white shadow-[0_3px_10px_rgba(20,18,15,0.15)] transition hover:bg-[#2A2926]">Developer access <Arrow className="h-3 w-3" /></a>
          </nav>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-black/[0.07] bg-[#F4F0E8] text-[#171614]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(214,166,106,.16),transparent_31%)]" />
        <div className="relative mx-auto max-w-[1460px] gap-12 px-5 py-16 sm:px-7 lg:grid lg:min-h-[700px] lg:grid-cols-[.9fr_1.1fr] lg:items-center lg:px-10 lg:py-24">
          <div className="relative z-10 flex items-center">
            <div className="max-w-[620px]">
              <p className="text-[9px] font-semibold uppercase tracking-[0.30em] text-[#D6A66A]">
                AVANTIQO DEVELOPERS
              </p>
              <h1 className="mt-5 text-[52px] font-medium leading-[.94] tracking-[-0.065em] text-[#171614] sm:text-[64px] lg:text-[72px] xl:text-[80px]">
                Build software on the business system Avantiqo already governs.
              </h1>
              <p className="mt-7 max-w-[590px] text-[16px] leading-8 text-[#625D55]">
                Discover exact capabilities, issue scoped machine credentials, separate environments, call versioned APIs, receive signed events, inspect request evidence and meter usage — all against the same organization context that runs the business.
              </p>
              <div className="mt-9 flex flex-wrap gap-2.5">
                <a
                  href="#capabilities"
                  className="inline-flex h-11 items-center gap-2 rounded-full border border-[#D6A66A]/50 bg-[#D6A66A] px-5 text-[10px] font-semibold text-[#171411] shadow-[0_12px_30px_rgba(0,0,0,.20)]"
                >
                  Explore capabilities <Arrow className="h-3.5 w-3.5" />
                </a>
                <a
                  href="#integration"
                  className="inline-flex h-11 items-center rounded-full border border-black/[0.10] bg-white/70 px-5 text-[10px] font-semibold text-[#56514A]"
                >
                  Integration model
                </a>
                <a
                  href="/code"
                  className="inline-flex h-11 items-center rounded-full border border-black/[0.10] bg-[#171614] px-5 text-[10px] font-semibold text-white"
                >
                  Need Avantiqo to build it? Code Studio
                </a>
              </div>
              <div className="mt-10 flex flex-wrap gap-x-5 gap-y-2 border-t border-black/[0.08] pt-5 text-[7px] font-semibold uppercase tracking-[0.16em] text-[#857D74]">
                {[
                  "Capability contracts",
                  "Scoped machine identity",
                  "Signed events",
                  "Observable + metered",
                ].map((item) => (
                  <span key={item} className="inline-flex items-center gap-1.5">
                    <Check className="h-3 w-3 text-[#D6A66A]" />
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <DeveloperPlatformHeroArt />
        </div>
      </section>
      <section className="border-b border-black/[0.06] bg-[#EEE8DE]">
        <div className="mx-auto max-w-[1320px] px-5 py-16 sm:px-7 lg:px-10 lg:py-20">
          <div className="grid gap-8 lg:grid-cols-[.82fr_1.18fr] lg:items-end">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-[0.20em] text-[#9A744B]">THE DEVELOPER CONTROL PLANE</p>
              <h2 className="mt-3 text-[38px] font-medium leading-[1.02] tracking-[-0.05em] text-[#1B1A18] sm:text-[50px]">From first credential to verified production traffic.</h2>
            </div>
            <p className="max-w-2xl text-[13px] leading-7 text-[#6C6963] lg:justify-self-end">Avantiqo Developers is the operating surface around the API: discover exact contracts, bind organization context, issue scoped credentials, separate environments, receive signed events, inspect failures and understand usage before a customer integration reaches production.</p>
          </div>
          <div className="mt-10 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {[
              ["01","Capability contracts","Exact capability IDs, actions, command boundaries and organization scope instead of undocumented internal endpoints."],
              ["02","Machine identity","Issue, rotate and revoke scoped credentials. Production identities remain separate from development and staging."],
              ["03","Business context","Requests carry the exact organization and, when needed, entity, period, record and domain context."],
              ["04","Signed events","Subscribe to committed business events through environment-bound webhooks with delivery evidence and replay controls."],
              ["05","Observability","Request IDs, status, latency, permission failures, throttling and webhook health stay visible to the developer."],
              ["06","Usage & economics","Rate and monthly capacity, provider-backed usage and metered workloads remain visible instead of arriving as a surprise bill."],
            ].map(([n,title,copy])=><article key={title} className="rounded-[22px] border border-black/[.07] bg-[#F8F5EF] p-5 shadow-[0_12px_30px_rgba(55,39,22,.035)]">
              <div className="text-[8px] font-semibold text-[#B7793B]">{n}</div>
              <h3 className="mt-5 text-[16px] font-semibold tracking-[-.02em] text-[#302B26]">{title}</h3>
              <p className="mt-2 text-[10px] leading-5 text-[#736D65]">{copy}</p>
            </article>)}
          </div>
          <div className="mt-4 rounded-[22px] border border-[#B7793B]/20 bg-[#F7EFE4] p-5">
            <div className="text-[8px] font-semibold uppercase tracking-[.15em] text-[#9A6531]">THE IMPORTANT DIFFERENCE</div>
            <div className="mt-2 max-w-4xl text-[12px] leading-6 text-[#655D55]">You are not integrating with a blank data API. You are integrating with governed business records already connected inside Avantiqo — customers, invoices, employees, legal entities, documents, permissions, operations and evidence — through the authority granted to your integration.</div>
          </div>
        </div>
      </section>

      <section className="border-b border-black/[0.06] bg-[#F3EEE6]">
        <div className="mx-auto max-w-[1320px] px-5 py-16 sm:px-7 lg:px-10 lg:py-20">
          <div className="grid gap-8 lg:grid-cols-[.86fr_1.14fr] lg:items-start">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-[0.20em] text-[#9A744B]">GOVERNED BUSINESS CONTEXT</p>
              <h2 className="mt-3 text-[38px] font-medium leading-[1.02] tracking-[-0.05em] text-[#1B1A18] sm:text-[50px]">Your integration inherits the business context Avantiqo already protects.</h2>
              <p className="mt-5 max-w-xl text-[13px] leading-7 text-[#6C6963]">Developers work with records that already belong to an organization, legal entity, person, customer, period or workflow. The developer identity is separate from employee identity; permissions and evidence stay attached to the exact organization and capability instead of being rebuilt in every app.</p>
            </div>
            <div className="rounded-[28px] border border-black/[.08] bg-[#1D1A17] p-5 text-white md:p-6">
              <div className="text-[8px] font-semibold uppercase tracking-[.15em] text-[#D6A66A]">Example · workforce identity context</div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {[
                  ["Verified identity","When a capability touches workforce data, the employee's verified contact and staff identity remain connected to that governed record."],
                  ["Private evidence","Passport, national ID and optional work permit remain restricted, versioned records."],
                  ["Legal entity","Employment and work-permit context stay tied to the correct organization and employer."],
                  ["Expiry state","Validity and expiry remain part of the business record instead of a spreadsheet reminder."],
                  ["Authority","Human and machine actions stay permission- and capability-bound."],
                  ["Audit","Access, requests, decisions and execution evidence remain traceable."],
                ].map(([title,copy])=><div key={title} className="rounded-xl border border-white/[.07] bg-white/[.035] p-3">
                  <div className="text-[8px] font-semibold text-[#E6C18F]">{title}</div>
                  <div className="mt-1 text-[7px] leading-4 text-white/42">{copy}</div>
                </div>)}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-black/[0.06] bg-[#1D1A17] text-white">
        <div className="mx-auto max-w-[1320px] px-5 py-16 sm:px-7 lg:px-10 lg:py-20">
          <div className="grid gap-8 lg:grid-cols-[.72fr_1.28fr] lg:items-end">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-[0.20em] text-[#D6A66A]">HOW DEVELOPMENT ACTUALLY WORKS</p>
              <h2 className="mt-3 text-[38px] font-medium leading-[1.02] tracking-[-0.05em] sm:text-[50px]">From a business job to a verified production integration.</h2>
            </div>
            <p className="max-w-2xl text-[12px] leading-6 text-white/52 lg:justify-self-end">Avantiqo does not give an integration broad database access and ask the developer to recreate business rules. You select an exact governed capability, grant the minimum machine authority, prove the request in a safe environment, then move live execution into Production with durable evidence around every request and event.</p>
          </div>
          <div className="mt-10 grid gap-2 lg:grid-cols-7">
            {[
              ["01","Choose capability","Find the exact contract, commands, events and boundary in the live catalog."],
              ["02","Choose environment","Use Development or Staging for read-safe validation. Keep live authority separate."],
              ["03","Issue credential","Create an environment-bound machine identity with the smallest Operations scopes needed."],
              ["04","Prove a read","Use API Explorer to confirm organization context, headers, response shape and request evidence."],
              ["05","Add live command","Only Production credentials can mutate business state. External mutations require idempotency."],
              ["06","Subscribe to events","Production webhooks receive committed Operations events; non-production receives test events only."],
              ["07","Operate with evidence","Use request IDs, logs, webhook delivery state, quotas and metered usage to diagnose and control the integration."],
            ].map(([n,title,copy])=><article key={n} className="rounded-[18px] border border-white/[.08] bg-white/[.035] p-4">
              <div className="text-[8px] font-semibold text-[#D6A66A]">{n}</div>
              <div className="mt-5 text-[11px] font-semibold">{title}</div>
              <div className="mt-2 text-[8px] leading-4 text-white/42">{copy}</div>
            </article>)}
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {[
              ["Development","Read-only against the live organization data plane. Use for safe contract and connectivity validation."],
              ["Staging","Also read-only today. Use for pre-production application testing without live mutation authority."],
              ["Production","The live machine environment. Write scopes, live business mutations and committed business-event subscriptions belong here."],
            ].map(([title,copy])=><div key={title} className="rounded-[18px] border border-[#D6A66A]/15 bg-[#D6A66A]/[.05] p-4"><div className="text-[9px] font-semibold text-[#E6C18F]">{title}</div><div className="mt-2 text-[8px] leading-4 text-white/46">{copy}</div></div>)}
          </div>
        </div>
      </section>

      <section
        id="capabilities"
        className="border-b border-black/[0.06] bg-[#F7F6F3]"
      >
        <div className="mx-auto max-w-[1320px] px-5 py-20 sm:px-7 lg:px-10 lg:py-24">
          <div className="max-w-3xl">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9A744B]">
              Capability catalog
            </p>
            <h2 className="mt-3 text-[36px] font-medium leading-[1.04] tracking-[-0.045em] text-[#1B1A18] sm:text-[44px] lg:text-[52px]">
              Business capabilities, not another software suite.
            </h2>
            <p className="mt-5 text-[14px] leading-7 text-[#6C6963] sm:text-[15px]">
              The authenticated Developer Portal currently exposes the canonical Operations and Commerce execution registry. Each capability has an exact lifecycle, commands, events, read/write boundary and ownership rules so an external application does not have to guess which domain is authoritative.
            </p>
          </div>
          <div className="mt-12 grid overflow-hidden rounded-[24px] border border-black/[0.075] bg-white md:grid-cols-2 lg:grid-cols-3">
            {capabilityFamilies.map((family, index) => (
              <article
                key={family.name}
                className={`group overflow-hidden bg-white transition hover:bg-[#FCFBF9] ${index % 3 !== 2 ? "lg:border-r lg:border-black/[0.06]" : ""} ${index < 3 ? "border-b border-black/[0.06]" : ""} ${index % 2 === 0 ? "md:border-r md:border-black/[0.06] lg:border-r" : ""}`}
              >
                <div className="relative h-[150px] overflow-hidden bg-[#E9DFD1]">
                  <div className="absolute inset-0 bg-cover bg-center transition duration-700 group-hover:scale-[1.025]" style={{backgroundImage:`url(${family.image})`}} />
                  <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,7,6,.02),rgba(8,7,6,.10)_58%,rgba(8,7,6,.58))]" />
                  <div className="absolute bottom-4 left-4 flex h-9 w-9 items-center justify-center rounded-xl border border-white/70 bg-[#F8F0E6]/72 text-[8px] font-bold tracking-[0.08em] text-[#8D6339] backdrop-blur-xl">{family.code}</div>
                  <Arrow className="absolute bottom-5 right-5 h-3.5 w-3.5 text-white/55 transition group-hover:translate-x-0.5 group-hover:text-[#F1C98E]" />
                </div>
                <div className="p-6">
                  <h3 className="text-[18px] font-semibold tracking-[-0.025em] text-[#2D2925]">{family.name}</h3>
                  <p className="mt-2 min-h-[54px] text-[11px] leading-5 text-[#7A756E]">{family.description}</p>
                  <div className="mt-5 flex flex-wrap gap-1.5">
                    {family.capabilities.map((item) => (
                      <span key={item} className="rounded-full border border-black/[0.06] bg-[#F8F4EE] px-2.5 py-1.5 text-[8px] font-medium text-[#68635C]">{item}</span>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>
          <div className="mt-5 rounded-[20px] border border-[#D6A66A]/24 bg-[#FBF7F0] p-5 text-[11px] leading-6 text-[#6F6961]">
            <span className="font-semibold text-[#8D643C]">
              This is the current Developer API surface.
            </span>{" "}
            Broader Avantiqo products such as Finance, People, Documents, Creative and Intelligence remain separate product/domain surfaces unless and until their exact contracts are registered for Developer API exposure. The portal shows the live registry rather than implying access that does not exist.
          </div>
        </div>
      </section>

      <section
        id="integration"
        className="border-b border-black/[0.06] bg-white/55"
      >
        <div className="mx-auto grid max-w-[1320px] gap-12 px-5 py-20 sm:px-7 lg:grid-cols-[.8fr_1.2fr] lg:px-10 lg:py-24">
          <div className="max-w-xl">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9A744B]">
              Integration model
            </p>
            <h2 className="mt-3 text-[36px] font-medium leading-[1.04] tracking-[-0.045em] text-[#1B1A18] sm:text-[44px] lg:text-[52px]">
              Choose the level of control you need.
            </h2>
            <p className="mt-5 text-[14px] leading-7 text-[#6C6963]">
              Developer tooling is the control plane for building and operating an integration: contracts, environments, credentials, API exploration, signed events, SDKs, logs and usage. The separate API Platform explains the direct metered capability surface; both use the same governed Avantiqo business capabilities underneath.
            </p>
          </div>
          <div>
            <div className="relative mb-5 min-h-[260px] overflow-hidden rounded-[24px] border border-black/[0.08] bg-[#E9DFD1] shadow-[0_18px_48px_rgba(56,39,22,.08)]">
              <div className="absolute inset-0 bg-cover bg-center" style={{backgroundImage:"url(/art/generated/developers/developer-integration-v1.png)"}} />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,7,6,.01),rgba(8,7,6,.36))]" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
            {integrationModes.map(([title, description], index) => (
              <article
                key={title}
                className="rounded-[20px] border border-black/[0.075] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.025)]"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F7F2EA] text-[9px] font-bold text-[#9A744B]">
                  0{index + 1}
                </div>
                <h3 className="mt-5 text-[15px] font-semibold tracking-[-0.02em] text-[#2A2723]">
                  {title}
                </h3>
                <p className="mt-2 text-[11px] leading-5 text-[#77736C]">
                  {description}
                </p>
              </article>
            ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-black/[0.06] bg-[#EEE6DB] text-[#1D1B18]">
        <div className="mx-auto max-w-[1320px] px-5 py-20 sm:px-7 lg:px-10 lg:py-24">
          <div className="max-w-3xl">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#D6A66A]">
              One engine, multiple surfaces
            </p>
            <h2 className="mt-3 text-[36px] font-medium leading-[1.04] tracking-[-0.045em] text-[#1D1B18] sm:text-[44px] lg:text-[52px]">
              The same capability can power Avantiqo or your product.
            </h2>
            <p className="mt-5 text-[14px] leading-7 text-[#6D645B]">
              Compose Avantiqo capabilities into your own application while organization scope, permissions and execution records stay consistent.
            </p>
          </div>
          <div className="mt-10 overflow-hidden rounded-[28px] border border-black/[0.07] bg-[linear-gradient(145deg,#F8F3EB,#E7DCCE)] p-5 md:p-7">
            <div className="rounded-[22px] border border-black/[.07] bg-[#FBF8F2] p-4 shadow-[0_16px_40px_rgba(55,39,22,.06)]">
              <div className="flex flex-wrap items-center gap-2 border-b border-black/[.07] pb-4">
                <div className="text-[8px] font-semibold uppercase tracking-[.15em] text-[#9A6531]">ONE GOVERNED CAPABILITY</div>
                <div className="ml-auto rounded-full border border-[#B7793B]/20 bg-[#F1E2CF] px-3 py-1 text-[6px] font-semibold text-[#76502E]">ORGANIZATION · AUTHORITY · EVIDENCE</div>
              </div>
              <div className="mt-4 grid gap-3 lg:grid-cols-[.8fr_1.2fr]">
                <div className="rounded-[18px] border border-black/[.06] bg-[#1D1A17] p-5 text-white">
                  <div className="text-[7px] font-semibold uppercase tracking-[.13em] text-[#D6A66A]">Capability runtime</div>
                  <div className="mt-4 font-mono text-[9px] text-white/72">operations.work-requests</div>
                  <div className="mt-4 space-y-2 text-[7px] text-white/45">
                    <div>organization_id → bound</div>
                    <div>entity_id → optional context</div>
                    <div>credential scope → enforced</div>
                    <div>request_id → evidence</div>
                  </div>
                  <div className="mt-4 rounded-lg border border-white/[.08] bg-white/[.04] p-3 text-[7px] text-[#A6C6A9]">✓ same business rules regardless of surface</div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {[
                    ["Avantiqo Business","Native workspace uses the same capability contract."],
                    ["External application","Your product calls the versioned Developer API."],
                    ["Staff / customer portal","Role-specific experiences stay on the same business record."],
                    ["Connected application","Your external application can call the same governed Operations contract through the Developer API."],
                  ].map(([title,copy])=><div key={title} className="rounded-[16px] border border-black/[.06] bg-white p-4">
                    <div className="text-[9px] font-semibold text-[#4B433C]">{title}</div>
                    <div className="mt-2 text-[8px] leading-4 text-[#7A7168]">{copy}</div>
                  </div>)}
                </div>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {[
                  ["Authority","Same organization + permission boundary"],
                  ["Events","Same committed business event stream"],
                  ["Evidence","Same request, audit and verification trail"],
                ].map(([title,copy])=><div key={title} className="rounded-xl border border-black/[.06] bg-[#F4EEE6] p-3">
                  <div className="text-[7px] font-semibold text-[#9A6531]">{title}</div>
                  <div className="mt-1 text-[7px] text-[#756C63]">{copy}</div>
                </div>)}
              </div>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[
              "SDK",
              "Webhook",
              "Environments",
              "API Explorer",
              "Production governance",
            ].map((item, index) => (
              <div
                key={item}
                className="rounded-[18px] border border-black/[0.07] bg-white/52 p-4"
              >
                <div className="text-[8px] font-bold text-[#D6A66A]">
                  0{index + 1}
                </div>
                <div className="mt-4 text-[11px] font-semibold text-[#51483F]">
                  {item}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-black/[0.06] bg-[#F3EEE6]">
        <div className="mx-auto max-w-[1320px] px-5 py-16 sm:px-7 lg:px-10 lg:py-20">
          <div className="max-w-3xl">
            <p className="text-[9px] font-semibold uppercase tracking-[0.20em] text-[#9A744B]">WHICH AVANTIQO DEVELOPER SURFACE?</p>
            <h2 className="mt-3 text-[38px] font-medium leading-[1.02] tracking-[-0.05em] text-[#1B1A18] sm:text-[50px]">Developers, API Platform and Code Studio solve different jobs.</h2>
            <p className="mt-5 text-[13px] leading-7 text-[#6C6963]">They share the same Avantiqo business system underneath, but they are intentionally separate so integration authority, commercial API use and software engineering do not get mixed together.</p>
          </div>
          <div className="mt-8 grid gap-3 lg:grid-cols-3">
            {[
              ["Developers","Build and operate an external integration","Use the authenticated Developer Portal for capability contracts, environments, machine credentials, API Explorer, webhooks, SDKs, logs, quotas and usage.","/login?portal=developer","Open Developer Portal"],
              ["API Platform","Consume Avantiqo as a metered capability API","Use this when a product needs direct, commercial capability calls and the main question is what API service is available, how it is priced and how it is consumed.","/api-platform","Explore API Platform"],
              ["Code Studio","Design, change and build software with Avantiqo","Use Code Studio when the job is software engineering itself: discuss architecture, inspect code, build features, preview UI, review diffs and execute governed code changes.","/code","Explore Code Studio"],
            ].map(([title,job,copy,href,cta])=><article key={title} className="rounded-[22px] border border-black/[.07] bg-white p-5">
              <div className="text-[8px] font-semibold uppercase tracking-[.14em] text-[#9A6531]">{title}</div>
              <h3 className="mt-4 text-[16px] font-semibold tracking-[-.02em] text-[#342E28]">{job}</h3>
              <p className="mt-3 text-[9px] leading-5 text-[#776F67]">{copy}</p>
              <a href={href} className="mt-5 inline-flex text-[9px] font-semibold text-[#76502E]">{cta} →</a>
            </article>)}
          </div>
        </div>
      </section>

      <section id="access" className="bg-[#F7F6F3]">
        <div className="mx-auto max-w-[1120px] px-5 py-20 text-center sm:px-7 lg:px-10 lg:py-24">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl border border-[#D6A66A]/25 bg-[#D6A66A]/[0.08] text-[9px] font-bold text-[#9A744B]">
            DEV
          </div>
          <h2 className="mx-auto mt-6 max-w-3xl text-[36px] font-medium leading-[1.04] tracking-[-0.045em] text-[#1B1A18] sm:text-[44px] lg:text-[52px]">
            Build with Avantiqo at the level your product needs.
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-[14px] leading-7 text-[#716C65]">
            Use this developer area to understand available capabilities, integration patterns and the tools for building on Avantiqo. Organization owners/admins can use the control plane directly, while external developers join through organization-scoped Developer Portal invitations without becoming staff.
            The authenticated Developer Portal contains the live control plane: capability contracts, environments, scoped credentials, API Explorer, signed webhooks, generated SDKs, request logs, quotas and usage. Development and Staging remain read-only against live business data; Production is the governed boundary for live mutations and committed business events.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-2.5">
            <a
              href="/api-platform"
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#171716] px-5 text-[11px] font-semibold text-white shadow-[0_6px_18px_rgba(20,18,15,0.14)]"
            >
              API Platform <Arrow className="h-3.5 w-3.5" />
            </a>
            <a
              href="/login?portal=developer"
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-black/[0.09] bg-white px-5 text-[11px] font-semibold text-[#56514A]"
            >
              Login
            </a>
          </div>
        </div>
      </section>

      <footer className="border-t border-black/[0.07] bg-[#FBFAF8]">
        <div className="mx-auto flex max-w-[1320px] flex-col gap-5 px-5 py-8 text-[10px] text-[#817B73] sm:flex-row sm:items-end sm:justify-between sm:px-7 lg:px-10">
          <div><div><span className="font-semibold text-[#3E3933]">Avantiqo Developers</span><span className="ml-2">Business capabilities for software builders</span></div><div className="mt-2 text-[9px] leading-5 text-[#9B958D]">Avantiqo is operated by BEA Co., Ltd., Thailand. Company Registration No. 0835553004601.</div></div>
          <div className="flex flex-wrap gap-5"><a href="/" className="transition hover:text-[#8A633C]">Platform</a><a href="/creative-studios" className="transition hover:text-[#8A633C]">Creative Studios</a><a href="/policy" className="transition hover:text-[#8A633C]">Privacy Policy</a><a href="/terms" className="transition hover:text-[#8A633C]">Terms</a><a href="/login" className="transition hover:text-[#8A633C]">Login</a></div>
        </div>
      </footer>
    </main>
  );
}
