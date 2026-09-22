import PublicSiteHeader from "@/components/public/PublicSiteHeader";
import PublicArtStage from "@/components/public/PublicArtStage";
import Link from "next/link";

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
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const SURFACE_ART = {
  compute: {
    image: "/art/commercial-compute.jpg",
    label: "Compute fabric",
    line: "Run your workloads first, add capacity when demand grows, and keep infrastructure flexible.",
    chips: ["OWNED GPU", "WORKLOADS", "SPARE CAPACITY"],
    panel: [
      ["AVANTIQO", "Priority 01"],
      ["ADDITIONAL WORK", "Priority 02"],
      ["IDLE", "Available"],
    ],
  },
  marketplace: {
    image: "/art/commercial-marketplace.jpg",
    label: "Marketplace",
    line: "Find specialist products, services and capacity without leaving your Avantiqo environment.",
    chips: ["PUBLISH", "CLEAR", "SETTLE"],
    panel: [
      ["CAPABILITIES", "Supply"],
      ["AGENTS", "Specialists"],
      ["SOLUTIONS", "Industry packs"],
    ],
  },
  solutions: {
    image: "/art/commercial-solutions.jpg",
    label: "Industry solutions",
    line: "Real operating environments, shaped around the business being run.",
    chips: ["HOSPITALITY", "RETAIL", "SERVICES"],
    panel: [
      ["BUSINESS OS", "Core"],
      ["INDUSTRY", "Workflow"],
      ["CONTEXT", "Shared"],
    ],
  },
  integrations: {
    image: "/art/commercial-integrations.jpg",
    label: "Connected services",
    line: "Bring communications, payments, documents and specialist services into the workflows your team already uses.",
    chips: ["CONNECT", "AUTHORIZE", "EXECUTE"],
    panel: [
      ["MESSAGING", "Connected"],
      ["PAYMENTS", "Connected"],
      ["DATA", "Scoped"],
    ],
  },
  partners: {
    image: "/art/commercial-services.jpg",
    label: "Partner network",
    line: "Trusted operators can bring whole portfolios of businesses onto Avantiqo.",
    chips: ["ADVISE", "IMPLEMENT", "SCALE"],
    panel: [
      ["CLIENTS", "Portfolio"],
      ["ACCESS", "Scoped"],
      ["VALUE", "Shared"],
    ],
  },
  agents: {
    image: "/art/commercial-agents.jpg",
    label: "Business agents",
    line: "Keep agent work connected to the right people, business records, permissions and review steps.",
    chips: ["RESEARCH", "PREPARE", "EXECUTE"],
    panel: [
      ["CONTEXT", "Business"],
      ["PERMISSIONS", "Defined"],
      ["RESULT", "Recorded"],
    ],
  },
  enterprise: {
    image: "/art/commercial-enterprise.jpg",
    label: "Enterprise operating scope",
    line: "Multi-entity operations with one governance model and portfolio visibility.",
    chips: ["ENTITIES", "LOCATIONS", "PORTFOLIO"],
    panel: [
      ["GOVERNANCE", "Unified"],
      ["CONTROL", "Scoped"],
      ["SCALE", "Global"],
    ],
  },
  services: {
    image: "/art/commercial-services.jpg",
    label: "Implementation services",
    line: "Discovery, migration, configuration and launch grounded in the real operating environment.",
    chips: ["DISCOVER", "IMPLEMENT", "OPTIMIZE"],
    panel: [
      ["MIGRATE", "Records"],
      ["CONFIGURE", "Workflow"],
      ["LAUNCH", "Ready"],
    ],
  },
  insights: {
    image: "/art/commercial-insights.jpg",
    label: "Decision intelligence",
    line: "Turn current business data into exceptions, forecasts and clearer decisions.",
    chips: ["DATA", "FORECAST", "DECIDE"],
    panel: [
      ["FINANCE", "Signal"],
      ["OPS", "Signal"],
      ["BUSINESS", "Signal"],
    ],
  },
  pricing: {
    image: "/art/commercial-pricing.jpg",
    label: "How it works for you",
    line: "See what is included, what is usage-based, and which services are optional.",
    chips: ["SOFTWARE", "USAGE", "SERVICES"],
    panel: [
      ["BUSINESS OS", "Recurring"],
      ["USAGE", "Metered"],
      ["OPTIONAL", "Client value"],
    ],
  },
  commerce: {
    image: "/art/commercial-commerce.jpg",
    label: "Commerce flow",
    line: "Keep customer activity connected from order or booking through payment, settlement and finance.",
    chips: ["SELL", "SETTLE", "POST"],
    panel: [
      ["ORDER", "Open"],
      ["PAYMENT", "Matched"],
      ["FINANCE", "Posted"],
    ],
  },
  channels: {
    image: "/art/commercial-channels.jpg",
    label: "Every business surface",
    line: "Web, mobile, portal, kiosk and POS can all use the same customer, product and business records.",
    chips: ["WEB", "MOBILE", "POS"],
    panel: [
      ["CUSTOMER", "Surface"],
      ["STAFF", "Surface"],
      ["EMBEDDED", "Surface"],
    ],
  },
};

function SurfaceArt({ kind }) {
  const art = SURFACE_ART[kind] || SURFACE_ART.agents;
  if (kind === "compute") {
    return <div className="relative min-h-[560px] overflow-hidden bg-[#EDE4D8] lg:min-h-[600px]">
      <div className="absolute inset-0 scale-[1.015] bg-cover transition duration-700" style={{backgroundImage:`url(${art.image})`,backgroundPosition:"58% center"}} />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,252,247,.01),rgba(40,28,18,.04)_52%,rgba(40,28,18,.18))]" />
      <div className="absolute left-6 top-6 rounded-full border border-white/72 bg-[#F7F0E7]/74 px-3.5 py-1.5 text-[7px] font-semibold uppercase tracking-[.20em] text-[#8E6338] shadow-[0_12px_30px_rgba(55,38,20,.08)] backdrop-blur-lg sm:left-8 sm:top-8">AVANTIQO / COMPUTE</div>
      <div className="absolute bottom-6 left-6 right-6 rounded-[24px] border border-white/75 bg-[#F8F1E8]/88 p-5 text-[#2A241E] shadow-[0_24px_70px_rgba(40,28,18,.13)] backdrop-blur-xl sm:bottom-8 sm:left-8 sm:right-8 sm:p-6">
        <div className="text-[7px] font-semibold uppercase tracking-[.18em] text-[#A36F39]">OWNED CAPACITY · ELASTIC OVERFLOW</div>
        <p className="mt-3 max-w-2xl text-[15px] leading-6">Inference, rendering, batch and creative workloads scheduled against the right available hardware.</p>
        <div className="mt-4 flex flex-wrap gap-2">{art.chips.map(x=><span key={x} className="rounded-full border border-[#B98A52]/24 bg-white/58 px-2.5 py-1 text-[6px] font-semibold tracking-[.16em] text-[#755D45]">{x}</span>)}</div>
      </div>
    </div>;
  }
  if (["marketplace", "agents", "insights", "integrations", "channels", "commerce"].includes(kind)) {
    const editorial = {
      marketplace: { label: "MARKETPLACE", line: "Specialist capabilities and connected services available without fragmenting the operating model." },
      agents: { label: "CONTROLLED INTELLIGENCE", line: "Specialist work stays connected to business context, permissions, evidence and review." },
      insights: { label: "DECISION INTELLIGENCE", line: "Current operating evidence becomes clearer signals, forecasts and decisions." },
      integrations: { label: "CONNECTED SERVICES", line: "Messaging, payments, documents and external providers become part of the same business workflow." },
      channels: { label: "EVERY BUSINESS SURFACE", line: "Web, mobile, portal, kiosk and POS stay connected to the same customers, records and work." },
      commerce: { label: "CONNECTED COMMERCE", line: "Selling, payment, settlement and finance remain connected from customer action to the books." },
    }[kind];
    return <div className="relative min-h-[560px] overflow-hidden bg-[#EDE4D8] lg:min-h-[600px]">
      <div className="absolute inset-0 scale-[1.015] bg-cover bg-center transition duration-700" style={{backgroundImage:`url(${art.image})`}} />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,252,247,.02),rgba(40,28,18,.04)_52%,rgba(40,28,18,.18))]" />
      <div className="absolute left-6 top-6 rounded-full border border-white/72 bg-[#F7F0E7]/72 px-3.5 py-1.5 text-[7px] font-semibold uppercase tracking-[.20em] text-[#8E6338] shadow-[0_12px_30px_rgba(55,38,20,.08)] backdrop-blur-lg sm:left-8 sm:top-8">AVANTIQO / {editorial.label}</div>
      <div className="absolute bottom-6 left-6 right-6 rounded-[24px] border border-white/75 bg-[#F8F1E8]/88 p-5 text-[#2A241E] shadow-[0_24px_70px_rgba(40,28,18,.13)] backdrop-blur-xl sm:bottom-8 sm:left-8 sm:right-8 sm:p-6">
        <p className="max-w-2xl text-[15px] leading-6">{editorial.line}</p>
        <div className="mt-4 flex flex-wrap gap-2">{art.chips.map(x=><span key={x} className="rounded-full border border-[#B98A52]/24 bg-white/58 px-2.5 py-1 text-[6px] font-semibold tracking-[.16em] text-[#755D45]">{x}</span>)}</div>
      </div>
    </div>;
  }
  if (["services", "partners", "enterprise"].includes(kind)) {
    const editorial = {
      services: { image: "/art/generated/solutions/services-go-live-v3.png", label: "IMPLEMENTATION SERVICES", line: "Discovery, migration, configuration, integrations, training and verified go-live.", chips: ["DISCOVER", "MIGRATE", "CONFIGURE", "TRAIN", "GO LIVE"] },
      partners: { image: "/art/generated/solutions/solutions-partners-v1.png", label: "PARTNER DELIVERY", line: "Accounting firms, agencies, consultants and specialists delivering repeatable client outcomes.", chips: ["CLIENTS", "DELIVERY", "GOVERNANCE", "SCALE"] },
      enterprise: { image: "/art/generated/solutions/solutions-enterprise-v1.png", label: "ENTERPRISE SCALE", line: "Multi-entity, multi-location governance, portfolio visibility and controlled operating scale.", chips: ["ENTITIES", "LOCATIONS", "GOVERNANCE", "PORTFOLIO"] },
    }[kind];
    return <div className="relative min-h-[560px] overflow-hidden bg-[#EDE4D8] lg:min-h-[600px]">
      <div className="absolute inset-0 bg-cover bg-center" style={{backgroundImage:`url(${editorial.image})`}} />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,.02),rgba(42,31,20,.05)_55%,rgba(42,31,20,.22))]" />
      <div className="absolute left-6 top-6 rounded-full border border-white/70 bg-[#F6EEE4]/76 px-3.5 py-1.5 text-[7px] font-semibold uppercase tracking-[.20em] text-[#8E6338] shadow-[0_12px_30px_rgba(55,38,20,.08)] backdrop-blur-lg sm:left-8 sm:top-8">AVANTIQO / {editorial.label}</div>
      <div className="absolute bottom-6 left-6 right-6 rounded-[24px] border border-white/72 bg-[#F8F1E8]/88 p-5 text-[#2A241E] shadow-[0_24px_70px_rgba(40,28,18,.14)] backdrop-blur-xl sm:bottom-8 sm:left-8 sm:right-8 sm:p-6">
        <p className="max-w-2xl text-[15px] leading-6">{editorial.line}</p>
        <div className="mt-4 flex flex-wrap gap-2">{editorial.chips.map(x=><span key={x} className="rounded-full border border-[#B98A52]/24 bg-white/55 px-2.5 py-1 text-[6px] font-semibold tracking-[.16em] text-[#755D45]">{x}</span>)}</div>
      </div>
    </div>;
  }
  const visual = {
    compute: {
      support: "/art/developer-work.jpg",
      accent: "OWNED CAPACITY",
      metric: "NODE 001",
      detail: "Owned GPU · workload demand · overflow",
      position: "58% center",
      supportPosition: "center",
    },
    marketplace: {
      support: "/art/commercial-partners.jpg",
      accent: "MARKET NETWORK",
      metric: "SUPPLY",
      detail: "Capabilities · agents · compute",
      position: "center",
      supportPosition: "center",
    },
    solutions: {
      support: "/art/commercial-enterprise.jpg",
      accent: "REAL INDUSTRIES",
      metric: "CONTEXT",
      detail: "Hospitality · retail · services",
      position: "center 34%",
      supportPosition: "center",
    },
    integrations: {
      support: "/art/commercial-channels.jpg",
      accent: "CONNECTED RAILS",
      metric: "LIVE",
      detail: "Messaging · payments · documents",
      position: "center",
      supportPosition: "center",
    },
    partners: {
      support: "/art/commercial-enterprise.jpg",
      accent: "DISTRIBUTION",
      metric: "PORTFOLIO",
      detail: "Clients · delivery · value",
      position: "center",
      supportPosition: "center",
    },
    agents: {
      support: "/art/developer-work.jpg",
      accent: "CONTROLLED ACTION",
      metric: "PROOF",
      detail: "Context · permissions · verification",
      position: "center",
      supportPosition: "center",
    },
    enterprise: {
      support: "/art/commercial-services.jpg",
      accent: "OPERATING SCALE",
      metric: "PORTFOLIO",
      detail: "Entities · locations · governance",
      position: "center",
      supportPosition: "center",
    },
    services: {
      support: "/art/commercial-start.jpg",
      accent: "IMPLEMENTATION",
      metric: "GO LIVE",
      detail: "Discover · migrate · launch",
      position: "center",
      supportPosition: "center",
    },
    insights: {
      support: "/art/commercial-agents.jpg",
      accent: "DECISION SIGNAL",
      metric: "LIVE",
      detail: "Data · forecast · action",
      position: "center",
      supportPosition: "center",
    },
    pricing: {
      support: "/art/commercial-commerce.jpg",
      accent: "BUSINESS MODEL",
      metric: "CLEAR",
      detail: "Subscription · usage · platform",
      position: "center",
      supportPosition: "center",
    },
    commerce: {
      support: "/art/commercial-channels.jpg",
      accent: "REVENUE FLOW",
      metric: "SETTLE",
      detail: "Order · payment · finance",
      position: "center",
      supportPosition: "center",
    },
    channels: {
      support: "/art/commercial-commerce.jpg",
      accent: "EVERY SURFACE",
      metric: "REACH",
      detail: "Web · mobile · portal · POS",
      position: "center",
      supportPosition: "center",
    },
  }[kind] || {
    support: "/art/developer-work.jpg",
    accent: "AVANTIQO",
    metric: "LIVE",
    detail: "Connected business data",
    position: "center",
    supportPosition: "center",
  };
  if (["compute", "marketplace", "pricing", "solutions", "partners", "enterprise", "services", "agents", "insights", "integrations", "channels", "commerce"].includes(kind)) {
    return <div className="relative min-h-[560px] overflow-hidden bg-[#171614] lg:min-h-[600px]">
      <div className="absolute inset-0 bg-cover bg-center" style={{backgroundImage:`url(${art.image})`,backgroundPosition:visual.position}} />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,7,6,.02),rgba(8,7,6,.07)_52%,rgba(8,7,6,.54))]" />
      <div className="absolute left-5 top-5 rounded-full border border-white/18 bg-[#11100E]/60 px-3 py-1.5 text-[7px] font-semibold uppercase tracking-[.20em] text-[#F0C98F] backdrop-blur-xl">AVANTIQO / {art.label}</div>
      <div className="absolute bottom-5 left-5 right-5 rounded-[22px] border border-white/15 bg-[#11100E]/84 p-5 text-white shadow-[0_18px_45px_rgba(0,0,0,.24)] backdrop-blur-xl">
        <div className="text-[7px] font-semibold uppercase tracking-[.18em] text-[#D6A66A]">{visual.accent}</div>
        <p className="mt-3 max-w-xl text-[13px] leading-6 text-white/72">{art.line}</p>
        <div className="mt-4 flex flex-wrap gap-2">{art.chips.map(x=><span key={x} className="rounded-full border border-white/12 px-2.5 py-1 text-[7px] tracking-[.14em] text-white/55">{x}</span>)}</div>
      </div>
    </div>;
  }

  return null;
}

const PAGE_STORY = {
  solutions: {
    eyebrow: "Made for the business being run",
    title: "One platform. Different operating worlds.",
    lead: "Each industry view uses the workflows and language that matter to that business while shared organization data and controls stay connected.",
    steps: [
      ["01", "Restaurant", "Service · kitchen · stock · finance", "/restaurant-management-system"],
      ["02", "Hotel", "Rooms · guests · teams · revenue", "/hotel-operations-software"],
      ["03", "Retail", "Sell · stock · purchase · settle", "/products"],
      ["04", "Services", "Projects · clients · documents · people", "/products"],
    ],
  },
  services: {
    eyebrow: "Implementation journey",
    title: "From operating reality to live system.",
    lead: "Professional services should feel like disciplined transformation, not generic consulting.",
    steps: [
      ["01", "Discover", "Entities · workflows · priorities"],
      ["02", "Migrate", "Data · documents · opening truth"],
      ["03", "Configure", "Roles · approvals · integrations"],
      ["04", "Launch", "Train · verify · optimize"],
    ],
  },
  insights: {
    eyebrow: "Decision intelligence",
    title: "Signals before dashboards.",
    lead: "See the exceptions, trends and decisions that need management attention next.",
    steps: [
      ["01", "Observe", "Finance · operations · people"],
      ["02", "Detect", "Exceptions · trends · risk"],
      ["03", "Interpret", "Forecast · compare · explain"],
      ["04", "Decide", "Priority · action · follow-through"],
    ],
  },
  agents: {
    eyebrow: "Controlled business automation",
    title: "Useful automation with clear permissions.",
    lead: "Use agents as practical business workflows with permissions, source records and result checks built in.",
    steps: [
      ["01", "Context", "Organization · entity · role"],
      ["02", "Prepare", "Research · data · plan"],
      ["03", "Authorize", "Capability · approval · scope"],
      ["04", "Verify", "Result · proof · audit"],
    ],
  },
  enterprise: {
    eyebrow: "Portfolio operating model",
    title: "Scale without losing control.",
    lead: "Extend the same Avantiqo operating model across multiple entities, locations and teams.",
    steps: [
      ["01", "Group", "Portfolio visibility"],
      ["02", "Entity", "Legal and operating scope"],
      ["03", "Location", "Properties · stores · venues"],
      ["04", "Team", "Roles · approval · execution"],
    ],
  },
  compute: {
    eyebrow: "Avantiqo Compute",
    title: "Workload first. Infrastructure second.",
    lead: "Submit the workload you need. Avantiqo selects available capacity based on priority and hardware requirements.",
    steps: [
      ["01", "Avantiqo", "Your priority workloads"],
      ["02", "Additional jobs", "Studio · API · batch"],
      ["03", "Owned GPU", "Local capacity first"],
      ["04", "Overflow", "Specialist cloud when required"],
    ],
  },
  integrations: {
    eyebrow: "Connected execution",
    title: "External services become part of the workflow.",
    lead: "The visual story follows real business events through messaging, payments, documents and specialist providers.",
    steps: [
      ["01", "Trigger", "Message · file · transaction"],
      ["02", "Context", "Customer · entity · workflow"],
      ["03", "Provider", "Payment · social · document"],
      ["04", "Result", "Returns to the workflow"],
    ],
  },
  partners: {
    eyebrow: "Distribution network",
    title: "One relationship can unlock many businesses.",
    lead: "Partners can support multiple client organizations with separate access, data and operating context for each one.",
    steps: [
      ["01", "Partner", "Advisor · agency · accountant"],
      ["02", "Portfolio", "Multiple client organizations"],
      ["03", "Delivery", "Implement · support · improve"],
      ["04", "Client value", "Support · delivery · reusable solutions"],
    ],
  },
  pricing: {
    eyebrow: "Simple pricing structure",
    title: "One account. Several ways to buy value.",
    lead: "Everyday software stays predictable, while optional specialist work, API usage and compute can be used only when you need them.",
    steps: [
      ["01", "Business OS", "Everyday software access"],
      ["02", "Wallet", "Optional specialist usage"],
      ["03", "Platform", "API · marketplace · compute"],
      ["04", "Enterprise", "Rollout · support · service levels"],
    ],
  },
  commerce: {
    eyebrow: "Customer-to-cash flow",
    title: "A sale should stay connected all the way to the books.",
    lead: "Follow a sale from the customer interaction through payment, settlement and finance without losing the source transaction.",
    steps: [
      ["01", "Sell", "POS · booking · invoice"],
      ["02", "Pay", "Cash · card · QR · transfer"],
      ["03", "Settle", "Match provider and transaction"],
      ["04", "Post", "Connected finance record"],
    ],
  },
  channels: {
    eyebrow: "Every operating surface",
    title: "The same business data, wherever work happens.",
    lead: "Give customers and staff the right experience on web, portal, mobile, kiosk or POS while keeping customer, product and transaction data connected.",
    steps: [
      ["01", "Public", "Website · campaign · booking"],
      ["02", "Customer", "Portal · account · payment"],
      ["03", "Staff", "Mobile · kiosk · POS"],
      ["04", "Embedded", "Widgets · partner products"],
    ],
  },
  marketplace: {
    eyebrow: "Avantiqo Marketplace",
    title: "Package outcomes, not downloads.",
    lead: "Discover and use capabilities, agents, solutions and compute with organization scope, permissions and usage controls already connected.",
    steps: [
      ["01", "Publish", "Capability · agent · solution"],
      ["02", "Discover", "Customer need"],
      ["03", "Consume", "Wallet · permissions · scope"],
      ["04", "Settle", "Usage · delivery · settlement"],
    ],
  },
};

function StoryRail({ kind }) {
  const story = PAGE_STORY[kind];
  const art = SURFACE_ART[kind] || SURFACE_ART.agents;
  if (!story) return null;
  return (
    <section className="border-b border-black/[0.06] bg-[#F3EFE7]">
      <div className="mx-auto max-w-[1320px] px-5 py-16 sm:px-7 lg:px-10 lg:py-20">
        <div className="grid gap-10 lg:grid-cols-[.72fr_1.28fr] lg:items-end">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-[#9A744B]">
              {story.eyebrow}
            </p>
            <h2 className="mt-3 max-w-xl text-[34px] font-medium leading-[1.02] tracking-[-0.05em] text-[#1B1916] sm:text-[44px]">
              {story.title}
            </h2>
          </div>
          <p className="max-w-2xl text-[13px] leading-7 text-[#706A62] lg:justify-self-end">
            {story.lead}
          </p>
        </div>
        <div className="mt-10 grid overflow-hidden rounded-[28px] border border-black/[0.07] bg-[#171716] text-white shadow-[0_26px_80px_rgba(46,34,23,.08)] lg:grid-cols-[.9fr_1.1fr]">
          <div className="relative min-h-[360px] overflow-hidden border-b border-white/[0.08] lg:min-h-[430px] lg:border-b-0 lg:border-r">
            {kind === "compute" ? (
              <>
                <div className="absolute inset-0 bg-cover bg-center" style={{backgroundImage:"url(/art/commercial-compute.jpg)"}} />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,7,7,.02),rgba(7,7,7,.10)_52%,rgba(7,7,7,.66))]" />
                <div className="absolute bottom-5 left-5 right-5 rounded-[18px] border border-white/12 bg-[#11100E]/72 p-4 backdrop-blur-xl">
                  <div className="text-[7px] font-semibold uppercase tracking-[.18em] text-[#D6A66A]">WORKLOAD ROUTING</div>
                  <div className="mt-2 text-[11px] leading-5 text-white/68">Owned capacity first. Specialist hardware or overflow only when the workload requires it.</div>
                </div>
              </>
            ) : <PublicArtStage kind={kind} />}
          </div>
          <div className="grid sm:grid-cols-2">
            {story.steps.map(([no, title, text, href], i) => (
              <div
                key={title}
                className={`relative min-h-[210px] p-5 sm:p-6 ${i % 2 === 0 ? "sm:border-r sm:border-white/[0.08]" : ""} ${i < 2 ? "border-b border-white/[0.08]" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[8px] font-bold text-[#D6A66A]">
                    {no}
                  </span>
                  <span className="h-1.5 w-1.5 rounded-full bg-[#D6A66A]/80" />
                </div>
                <div className="mt-12 text-[16px] font-semibold text-white/82">
                  {title}
                </div>
                <div className="mt-2 text-[9px] leading-5 text-white/38">
                  {text}
                </div>
                {href ? <Link prefetch href={href} className="mt-5 inline-flex text-[8px] font-semibold text-[#D6A66A]">Open this solution →</Link> : null}
                <div className="absolute inset-x-5 bottom-5 h-px bg-white/[0.07]">
                  <div
                    className="h-px bg-[#D6A66A]/60"
                    style={{ width: `${34 + i * 15}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

const RELATED_ART = {
  Developers: "/art/developer-work.jpg",
  Marketplace: "/art/commercial-marketplace.jpg",
  Pricing: "/art/commercial-pricing.jpg",
  Services: "/art/commercial-services.jpg",
  Partners: "/art/commercial-partners.jpg",
  Enterprise: "/art/commercial-enterprise.jpg",
  Commerce: "/art/commercial-commerce.jpg",
  Integrations: "/art/commercial-integrations.jpg",
  Channels: "/art/commercial-channels.jpg",
  Solutions: "/art/commercial-solutions.jpg",
  Agents: "/art/commercial-agents.jpg",
  Insights: "/art/commercial-insights.jpg",
  "Creative Studios": "/art/creative-video.jpg",
  Compute: "/art/commercial-compute.jpg",
};

const RELATED_KIND = {
  "Developers": "developer",
  "Marketplace": "marketplace",
  "Pricing": "pricing",
  "Services": "services",
  "Partners": "partners",
  "Enterprise": "enterprise",
  "Commerce": "commerce",
  "Integrations": "integrations",
  "Channels": "channels",
  "Solutions": "solutions",
  "Agents": "agents",
  "Insights": "insights",
  "Creative Studios": "creative",
  "Compute": "compute",
};

const RELATED = {
  compute: [
    ["Developers", "/developers", "Run developer and production workloads on available capacity."],
    ["Marketplace", "/ecosystem", "Use approved compute options through the marketplace."],
    ["Pricing", "/pricing", "Understand how compute usage is charged."],
  ],
  marketplace: [
    ["Developers", "/developers", "Build capabilities customers can use inside Avantiqo."],
    ["Partners", "/partners", "Support more customer organizations through partner workflows."],
    ["Compute", "/compute", "Add compute capacity where workloads need it."],
  ],
  solutions: [
    ["Services", "/services", "Implement each industry package well."],
    ["Partners", "/partners", "Scale vertical delivery through specialists."],
    [
      "Enterprise",
      "/enterprise",
      "Expand from one site to operating portfolios.",
    ],
  ],
  pricing: [
    ["Commerce", "/commerce", "Connect selling and settlement to the Business OS."],
    ["Enterprise", "/enterprise", "Support larger organizations, entities and locations."],
    ["Services", "/services", "Add implementation, migration and optimization."],
  ],
  integrations: [
    ["Channels", "/channels", "Bring connected services into every surface."],
    ["Commerce", "/commerce", "Connect providers to customer, payment and finance workflows."],
    ["Solutions", "/solutions", "Connect provider capability to the business workflow."],
  ],
  partners: [
    ["Services", "/services", "Reuse proven implementation patterns across customers."],
    ["Solutions", "/solutions", "Deliver industry solutions to more customer organizations."],
    ["Enterprise", "/enterprise", "Manage larger customer portfolios."],
  ],
  agents: [
    ["Insights", "/insights", "Turn current operating data into clearer decisions."],
    ["Services", "/services", "Design and implement controlled automation for real workflows."],
    [
      "Integrations",
      "/integrations",
      "Connect agents to approved business services.",
    ],
  ],
  commerce: [
    ["Channels", "/channels", "Serve customers through web, portal, mobile and POS."],
    [
      "Integrations",
      "/integrations",
      "Connect payments and communication rails.",
    ],
    [
      "Pricing",
      "/pricing",
      "See how software, usage and transaction charges are structured.",
    ],
  ],
  channels: [
    ["Commerce", "/commerce", "Connect every customer surface to orders, payments and finance."],
    [
      "Creative Studios",
      "/creative-studios",
      "Produce the content those surfaces need.",
    ],
    ["Solutions", "/solutions", "Use channels inside focused industry products."],
  ],
  enterprise: [
    ["Insights", "/insights", "Add portfolio intelligence and exceptions."],
    [
      "Services",
      "/services",
      "Deliver complex rollout and integration programs.",
    ],
    ["Partners", "/partners", "Extend implementation capacity globally."],
  ],
  services: [
    [
      "Solutions",
      "/solutions",
      "Standardize implementation around industry outcomes.",
    ],
    [
      "Partners",
      "/partners",
      "Scale delivery without custom-work bottlenecks.",
    ],
    [
      "Enterprise",
      "/enterprise",
      "Support higher-complexity operating environments.",
    ],
  ],
  insights: [
    ["Agents", "/agents", "Move from insight to an approved next action."],
    ["Enterprise", "/enterprise", "Use portfolio-level analysis across entities and locations."],
    [
      "Pricing",
      "/pricing",
      "Use deeper specialist analysis only when you need it.",
    ],
  ],
};


function ComputeExperience({ config }) {
  const workloads = [
    ["AI & inference", "Model-backed applications, inference services and business intelligence."],
    ["Training", "Fine-tuning, experimentation and larger accelerated model workloads."],
    ["Image & video", "Generation, enhancement, transcode and production pipelines."],
    ["3D & rendering", "Accelerated 3D, compositing and production work without peak hardware ownership."],
    ["Batch processing", "Queued data and application jobs that benefit from accelerated compute."],
    ["Developer workloads", "API and custom application compute that scales with the work."],
  ];
  return (
    <main className="min-h-screen bg-[#F7F6F3] text-[#191919]">
      <PublicSiteHeader context={config.context} audience="compute" links={[{ label: "Compute", href: "/compute" },{ label: "API Platform", href: "/api-platform" },{ label: "Developers", href: "/developers" },{ label: "Pricing", href: "/pricing" }]} />

      <section className="relative overflow-hidden border-b border-black/[0.06] bg-[#F4F0E8]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(214,166,106,.14),transparent_31%)]" />
        <div className="relative mx-auto grid max-w-[1540px] lg:min-h-[650px] lg:grid-cols-[43%_57%]">
          <div className="flex items-center px-5 py-16 sm:px-7 lg:px-10 lg:py-20 xl:px-14">
            <div className="max-w-[610px]">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#D6A66A]/28 bg-white/68 px-3 py-1.5 text-[8px] font-semibold uppercase tracking-[.18em] text-[#8A633C]"><span className="h-1.5 w-1.5 rounded-full bg-[#A37849]" /> GPU CAPACITY ON DEMAND</div>
              <p className="mt-9 text-[9px] font-semibold uppercase tracking-[.23em] text-[#9A7045]">AVANTIQO COMPUTE</p>
              <h1 className="mt-4 text-[52px] font-medium leading-[.94] tracking-[-.065em] sm:text-[66px] lg:text-[74px]">GPU compute when you need it.</h1>
              <p className="mt-7 max-w-[560px] text-[15px] leading-8 text-[#625D55]">Rent high-performance GPU capacity for AI, inference, training, rendering, video generation and production workloads. Start with what you need, scale when demand rises, and pay for the compute you use.</p>
              <div className="mt-9 flex flex-wrap gap-2.5"><Link prefetch href="/start" className="inline-flex h-11 items-center gap-2 rounded-full bg-[#171614] px-5 text-[10px] font-semibold text-white shadow-[0_10px_28px_rgba(20,18,15,.16)]">Explore GPU capacity <Arrow className="h-3.5 w-3.5" /></Link><Link prefetch href="/pricing" className="inline-flex h-11 items-center rounded-full border border-black/[0.10] bg-white/75 px-5 text-[10px] font-semibold text-[#56514A]">View pricing</Link></div>
              <div className="mt-10 flex flex-wrap gap-x-4 gap-y-2 border-t border-black/[0.08] pt-5 text-[7px] font-semibold uppercase tracking-[.16em] text-[#9A8F82]"><span>GPU ON DEMAND</span><span>·</span><span>METERED USAGE</span><span>·</span><span>API READY</span><span>·</span><span>ELASTIC CAPACITY</span></div>
            </div>
          </div>
          <div className="flex items-center border-t border-black/[0.06] p-5 sm:p-7 lg:border-l lg:border-t-0 lg:p-8">
            <div className="relative min-h-[555px] w-full overflow-hidden rounded-[30px] border border-black/[0.08] bg-[#11110F] shadow-[0_30px_90px_rgba(68,47,25,.16)]">
              <div className="absolute inset-0 scale-[1.02] bg-cover" style={{backgroundImage:"url(/art/generated/compute/gpu-hero-v1.webp)",backgroundPosition:"center center"}} />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,7,7,.03),rgba(7,7,7,.06)_50%,rgba(7,7,7,.58))]" />
              <div className="absolute left-7 top-7 rounded-full border border-white/16 bg-black/34 px-3.5 py-1.5 text-[7px] font-semibold uppercase tracking-[.20em] text-[#F0C98F] backdrop-blur-lg">AVANTIQO / COMPUTE</div>
              <div className="absolute bottom-7 left-7 right-7 flex flex-wrap items-end justify-between gap-4 rounded-[22px] border border-white/14 bg-[#11100E]/82 p-5 text-white backdrop-blur-xl sm:p-6"><div><div className="text-[7px] font-semibold uppercase tracking-[.18em] text-[#D6A66A]">USAGE-BASED COMPUTE</div><p className="mt-2 max-w-lg text-[13px] leading-6 text-white/70">Use accelerated capacity for the job. Release it when the work is finished.</p></div><div className="text-right"><div className="text-[6px] uppercase tracking-[.18em] text-white/30">WORKLOADS</div><div className="mt-2 text-[9px] tracking-[.11em] text-white/55">AI · VIDEO · RENDER · BATCH</div></div></div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-black/[0.06] bg-[#FBFAF8]">
        <div className="mx-auto max-w-[1320px] px-5 py-20 sm:px-7 lg:px-10 lg:py-28">
          <div className="grid gap-12 lg:grid-cols-[.86fr_1.14fr] lg:items-start">
            <div className="max-w-xl"><p className="text-[9px] font-semibold uppercase tracking-[.20em] text-[#9A744B]">HOW IT WORKS</p><h2 className="mt-3 text-[40px] font-medium leading-[1.01] tracking-[-.055em] sm:text-[54px]">Powerful GPU capacity without buying the hardware.</h2><p className="mt-6 text-[13px] leading-7 text-[#706A62]">Avantiqo Compute gives you access to accelerated capacity when the work requires it. You do not have to buy for peak demand or keep expensive hardware idle between jobs.</p></div>
            <div className="border-t border-black/[0.08]">
              {[["01","Choose capacity","Match the workload to the compute profile it needs."],["02","Run the workload","Submit AI, training, rendering, video, batch or custom developer work."],["03","Scale when required","Increase capacity for larger jobs without changing the rest of your workflow."],["04","Track usage and cost","See what compute was consumed and keep variable infrastructure spend visible."]].map(([n,t,d])=><div key={n} className="grid grid-cols-[48px_1fr] gap-4 border-b border-black/[0.08] py-6 sm:grid-cols-[60px_220px_1fr]"><div className="text-[8px] font-bold text-[#A37849]">{n}</div><div className="text-[15px] font-semibold tracking-[-.02em] text-[#2E2A26]">{t}</div><div className="text-[10px] leading-5 text-[#7A756E] sm:col-auto col-start-2">{d}</div></div>)}
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-black/[0.06] bg-[#F1EADF]">
        <div className="mx-auto max-w-[1320px] px-5 py-20 sm:px-7 lg:px-10 lg:py-28">
          <div className="grid gap-10 lg:grid-cols-[.78fr_1.22fr] lg:items-end"><div><p className="text-[9px] font-semibold uppercase tracking-[.20em] text-[#9A744B]">BUILT FOR DEMANDING WORKLOADS</p><h2 className="mt-3 max-w-xl text-[40px] font-medium leading-[1.01] tracking-[-.055em] sm:text-[54px]">Use GPU capacity where acceleration actually matters.</h2></div><p className="max-w-xl text-[13px] leading-7 text-[#706A62] lg:justify-self-end">One compute product, used across different kinds of accelerated work. The workload changes; the commercial model stays clear.</p></div>
          <div className="mt-12 grid overflow-hidden rounded-[26px] border border-black/[0.07] bg-white/62 md:grid-cols-2 lg:grid-cols-3">
            {workloads.map(([t,d],i)=><div key={t} className={`min-h-[170px] p-6 ${i<3?'border-b border-black/[0.06]':''} ${i%3!==2?'lg:border-r lg:border-black/[0.06]':''}`}><div className="text-[8px] font-bold text-[#A37849]">0{i+1}</div><h3 className="mt-7 text-[16px] font-semibold tracking-[-.03em] text-[#302D29]">{t}</h3><p className="mt-3 max-w-sm text-[10px] leading-5 text-[#777169]">{d}</p></div>)}
          </div>
        </div>
      </section>

      <section className="border-b border-white/[0.06] bg-[#171716] text-white">
        <div className="mx-auto grid max-w-[1320px] gap-14 px-5 py-20 sm:px-7 lg:grid-cols-[.72fr_1.28fr] lg:px-10 lg:py-28">
          <div><p className="text-[9px] font-semibold uppercase tracking-[.20em] text-[#D6A66A]">CLEAR CONTROL</p><h2 className="mt-3 text-[40px] font-medium leading-[1.01] tracking-[-.055em] text-[#F7F4EF] sm:text-[54px]">Serious compute. Simple economics.</h2><p className="mt-6 max-w-lg text-[13px] leading-7 text-white/42">Choose what you need, use it, see the consumption and release it. Compute remains a visible usage product rather than another permanent infrastructure commitment.</p></div>
          <div className="grid gap-x-10 gap-y-0 sm:grid-cols-2">
            {[["Choose the hardware","Use a profile that matches the workload."],["See availability","Use capacity that is ready instead of provisioning machines."],["Track GPU hours","Keep usage visible by workload and execution."],["Control spend","Variable cost appears when compute is actually used."],["API access","Submit compute from developer workflows and connected applications."],["Scale up or down","Increase capacity for demanding jobs and release it when finished."]].map(([t,d],i)=><div key={t} className="border-t border-white/[0.10] py-6"><div className="flex items-start gap-4"><span className="mt-1 text-[7px] font-bold text-[#D6A66A]">0{i+1}</span><div><div className="text-[14px] font-semibold text-white/82">{t}</div><div className="mt-2 text-[9px] leading-5 text-white/35">{d}</div></div></div></div>)}
          </div>
        </div>
      </section>

      <section className="border-b border-black/[0.06] bg-[#FBFAF8]">
        <div className="mx-auto grid max-w-[1320px] gap-10 px-5 py-20 sm:px-7 lg:grid-cols-[.9fr_1.1fr] lg:items-end lg:px-10 lg:py-24">
          <div><p className="text-[9px] font-semibold uppercase tracking-[.20em] text-[#9A744B]">CONNECTED ACROSS AVANTIQO</p><h2 className="mt-3 max-w-2xl text-[38px] font-medium leading-[1.02] tracking-[-.05em] sm:text-[48px]">Use Compute directly, or behind the tools already doing the work.</h2></div>
          <div className="grid gap-0 border-t border-black/[0.08]">
            {[["Developers","/developers","Build applications and submit compute workloads."],["Creative Studios","/creative-studios","Use GPU capacity behind image, video and accelerated production."],["Pricing","/pricing","See how compute usage stays separate from recurring software."]].map(([t,h,d])=><Link prefetch key={t} href={h} className="group grid grid-cols-[1fr_auto] items-center gap-5 border-b border-black/[0.08] py-5"><div><div className="text-[15px] font-semibold tracking-[-.02em] text-[#302D29]">{t}</div><div className="mt-1 text-[10px] leading-5 text-[#777169]">{d}</div></div><Arrow className="h-4 w-4 text-[#B9AA95] transition group-hover:translate-x-1 group-hover:text-[#9A744B]" /></Link>)}
          </div>
        </div>
      </section>

      <section className="bg-[#F7F6F3]"><div className="mx-auto max-w-[1120px] px-5 py-20 text-center sm:px-7 lg:px-10 lg:py-24"><p className="text-[9px] font-semibold uppercase tracking-[.20em] text-[#9A744B]">AVANTIQO COMPUTE</p><h2 className="mx-auto mt-4 max-w-4xl text-[40px] font-medium leading-[1.02] tracking-[-.05em] sm:text-[54px]">Compute when you need it. Without owning what sits idle when you don’t.</h2><p className="mx-auto mt-5 max-w-2xl text-[13px] leading-7 text-[#706A62]">Use the GPU capacity the workload requires, scale for demanding jobs, and keep usage-based infrastructure separate from recurring business software.</p><div className="mt-8 flex flex-wrap justify-center gap-2.5"><Link prefetch href="/start" className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#171716] px-5 text-[11px] font-semibold text-white">Explore GPU capacity <Arrow className="h-3.5 w-3.5" /></Link><Link prefetch href="/pricing" className="inline-flex h-11 items-center rounded-xl border border-black/[0.09] bg-white px-5 text-[11px] font-semibold text-[#56514A]">View pricing</Link></div></div></section>
    </main>
  );
}

function PricingExperience({ config }) {
  const models = [
    ["01", "Business software", "Subscription", "Recurring access to the operating products your business uses every day."],
    ["02", "Creative Studios", "Project", "Production is priced around the mission, scope and delivery requirements."],
    ["03", "Platform & Compute", "Usage", "APIs, specialist capabilities and GPU compute scale with work actually executed."],
    ["04", "Enterprise & Services", "Scoped", "Migration, rollout, integrations and larger operating scope are agreed before work begins."],
  ];
  return (
    <main className="min-h-screen bg-[#F7F4EE] text-[#191816]">
      <PublicSiteHeader context={config.context} audience="business" tone="light" links={[{label:"Products",href:"/products"},{label:"Solutions",href:"/solutions"},{label:"Developers",href:"/developers"},{label:"Compute",href:"/compute"}]} />

      <section className="relative overflow-hidden border-b border-black/[0.07] bg-[#F3EEE6]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_0%,rgba(214,166,106,.13),transparent_32%)]" />
        <div className="relative mx-auto grid max-w-[1540px] lg:min-h-[650px] lg:grid-cols-[43%_57%]">
          <div className="flex items-center px-5 py-16 sm:px-7 lg:px-10 lg:py-20 xl:px-14">
            <div className="max-w-[610px]">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#D6A66A]/28 bg-white/65 px-3 py-1.5 text-[8px] font-semibold uppercase tracking-[.18em] text-[#8A633C]"><span className="h-1.5 w-1.5 rounded-full bg-[#A37849]" /> CLEAR SOFTWARE · OPTIONAL USAGE</div>
              <p className="mt-9 text-[9px] font-semibold uppercase tracking-[.23em] text-[#9A7045]">AVANTIQO PRICING</p>
              <h1 className="mt-4 text-[50px] font-medium leading-[.96] tracking-[-.065em] sm:text-[64px] lg:text-[72px]">Clear pricing for the way the work is actually bought.</h1>
              <p className="mt-7 max-w-[560px] text-[15px] leading-8 text-[#625D55]">Business software stays recurring. Creative production is scoped by project. APIs and compute are usage based. Enterprise rollout is agreed before it starts.</p>
              <div className="mt-9 flex flex-wrap gap-2.5"><Link prefetch href="/start" className="inline-flex h-11 items-center gap-2 rounded-full bg-[#171614] px-5 text-[10px] font-semibold text-white shadow-[0_10px_28px_rgba(20,18,15,.16)]">Start with Avantiqo <Arrow className="h-3.5 w-3.5" /></Link><Link prefetch href="/products" className="inline-flex h-11 items-center rounded-full border border-black/[0.10] bg-white/70 px-5 text-[10px] font-semibold text-[#56514A]">Explore products</Link></div>
              <div className="mt-10 flex flex-wrap gap-x-4 gap-y-2 border-t border-black/[0.08] pt-5 text-[7px] font-semibold uppercase tracking-[.16em] text-[#9A8F82]"><span>SUBSCRIPTION</span><span>·</span><span>USAGE</span><span>·</span><span>PROJECT</span><span>·</span><span>SCOPED SERVICES</span></div>
            </div>
          </div>
          <div className="flex items-center border-t border-black/[0.06] p-5 sm:p-7 lg:border-l lg:border-t-0 lg:p-8">
            <div className="relative min-h-[555px] w-full overflow-hidden rounded-[30px] border border-black/[0.08] bg-[#171614] shadow-[0_30px_90px_rgba(68,47,25,.16)]">
              <div className="absolute inset-0 bg-cover bg-center" style={{backgroundImage:"url(/art/generated/pricing/pricing-hero-v1.webp)"}} />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(12,9,7,.02),rgba(12,9,7,.08)_48%,rgba(12,9,7,.52))]" />
              <div className="absolute left-7 top-7 rounded-full border border-white/18 bg-black/28 px-3.5 py-1.5 text-[7px] font-semibold uppercase tracking-[.20em] text-[#F0C98F] backdrop-blur-lg">AVANTIQO / PRICING</div>
              <div className="absolute bottom-7 left-7 right-7 rounded-[22px] border border-white/14 bg-[#11100E]/80 p-5 text-white backdrop-blur-xl sm:p-6"><div className="text-[7px] font-semibold uppercase tracking-[.18em] text-[#D6A66A]">ONE PLATFORM · CLEAR ECONOMICS</div><p className="mt-2 max-w-xl text-[13px] leading-6 text-white/70">Each commercial model appears only where it makes sense for the work.</p></div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-black/[0.06] bg-[#FBFAF8]">
        <div className="mx-auto max-w-[1320px] px-5 py-20 sm:px-7 lg:px-10 lg:py-28">
          <div className="grid gap-12 lg:grid-cols-[.76fr_1.24fr] lg:items-start">
            <div><p className="text-[9px] font-semibold uppercase tracking-[.20em] text-[#9A744B]">FOUR WAYS TO BUY</p><h2 className="mt-3 max-w-xl text-[40px] font-medium leading-[1.01] tracking-[-.055em] sm:text-[54px]">One platform. Different economics where the work is different.</h2><p className="mt-6 max-w-lg text-[13px] leading-7 text-[#706A62]">Avantiqo does not force software, production, infrastructure and implementation into one artificial plan. Each keeps the commercial model that fits it.</p></div>
            <div className="border-t border-black/[0.08]">
              {models.map(([n,title,type,desc])=><div key={n} className="grid grid-cols-[44px_1fr_auto] gap-4 border-b border-black/[0.08] py-6 sm:grid-cols-[52px_210px_110px_1fr]"><div className="text-[8px] font-bold text-[#A37849]">{n}</div><div className="text-[15px] font-semibold tracking-[-.02em] text-[#2E2A26]">{title}</div><div className="text-right text-[8px] font-semibold uppercase tracking-[.15em] text-[#A37849] sm:text-left">{type}</div><div className="col-start-2 text-[10px] leading-5 text-[#777169] sm:col-auto">{desc}</div></div>)}
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-black/[0.06] bg-[#EEE8DE]">
        <div className="mx-auto grid max-w-[1320px] gap-12 px-5 py-20 sm:px-7 lg:grid-cols-[.82fr_1.18fr] lg:px-10 lg:py-28">
          <div><p className="text-[9px] font-semibold uppercase tracking-[.20em] text-[#9A744B]">HOW PRICING BEHAVES</p><h2 className="mt-3 text-[40px] font-medium leading-[1.01] tracking-[-.055em] sm:text-[54px]">Simple where it should be. Metered only where cost actually moves.</h2></div>
          <div className="border-t border-black/[0.08]">
            {[["Recurring stays predictable","Core business software remains a clear recurring product, not an infrastructure bill."],["Variable cost stays visible","Compute, APIs and specialist production become usage cost only when they are actually used."],["Large work is scoped first","Implementation, migration and enterprise work is agreed before delivery instead of appearing as surprise consumption."]].map(([t,d],i)=><div key={t} className="grid grid-cols-[44px_1fr] gap-4 border-b border-black/[0.08] py-6"><span className="text-[8px] font-bold text-[#A37849]">0{i+1}</span><div><h3 className="text-[16px] font-semibold tracking-[-.025em] text-[#302D29]">{t}</h3><p className="mt-2 max-w-xl text-[10px] leading-5 text-[#777169]">{d}</p></div></div>)}
          </div>
        </div>
      </section>

      <section className="border-b border-white/[0.06] bg-[#171716] text-white">
        <div className="mx-auto grid max-w-[1320px] gap-14 px-5 py-20 sm:px-7 lg:grid-cols-[.72fr_1.28fr] lg:px-10 lg:py-28">
          <div><p className="text-[9px] font-semibold uppercase tracking-[.20em] text-[#D6A66A]">CHOOSE YOUR STARTING POINT</p><h2 className="mt-3 text-[40px] font-medium leading-[1.01] tracking-[-.055em] text-[#F7F4EF] sm:text-[54px]">Start with the job you need solved now.</h2><p className="mt-6 max-w-lg text-[13px] leading-7 text-white/42">You do not have to buy every Avantiqo layer. Begin with the part of the platform that solves the current problem.</p></div>
          <div className="border-t border-white/[0.10]">
            {[["Business Products","/products","Finance, people, operations, inventory and customer work."],["Creative Studios","/creative-studios","Image, video, music, voice and professional production."],["Developers & Compute","/developers","APIs, capabilities and infrastructure for software workloads."],["Solutions & Services","/solutions","Industry rollout, migration, integration and implementation."]].map(([t,h,d],i)=><Link prefetch key={t} href={h} className="group grid grid-cols-[44px_1fr_auto] items-center gap-4 border-b border-white/[0.10] py-6"><span className="text-[8px] font-bold text-[#D6A66A]">0{i+1}</span><div><div className="text-[15px] font-semibold text-white/84">{t}</div><div className="mt-2 text-[9px] leading-5 text-white/34">{d}</div></div><Arrow className="h-4 w-4 text-white/30 transition group-hover:translate-x-1 group-hover:text-[#D6A66A]" /></Link>)}
          </div>
        </div>
      </section>

      <section className="bg-[#F7F6F3]"><div className="mx-auto max-w-[1120px] px-5 py-20 text-center sm:px-7 lg:px-10 lg:py-24"><p className="text-[9px] font-semibold uppercase tracking-[.20em] text-[#9A744B]">START WITHOUT OVERBUYING</p><h2 className="mx-auto mt-4 max-w-4xl text-[40px] font-medium leading-[1.02] tracking-[-.05em] sm:text-[54px]">Choose the Avantiqo layer that matches the job.</h2><p className="mx-auto mt-5 max-w-2xl text-[13px] leading-7 text-[#706A62]">Start with recurring software, a production mission, usage-based compute, or a scoped rollout. Expand only when the business needs more.</p><div className="mt-8 flex flex-wrap justify-center gap-2.5"><Link prefetch href="/start" className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#171716] px-5 text-[11px] font-semibold text-white">Start with Avantiqo <Arrow className="h-3.5 w-3.5"/></Link><Link prefetch href="/products" className="inline-flex h-11 items-center rounded-xl border border-black/[0.09] bg-white px-5 text-[11px] font-semibold text-[#56514A]">Explore products</Link></div></div></section>
    </main>
  );
}

export default function CommercialSurfacePage({ config }) {
  if (config.art === "compute") return <ComputeExperience config={config} />;
  if (config.art === "pricing") return <PricingExperience config={config} />;
  const audience = config.audience || (config.art === "compute" ? "compute" : config.art === "marketplace" ? "platform" : "business");
  const headerLinks = audience === "compute"
    ? [
        { label: "Compute", href: "/compute" },
        { label: "API Platform", href: "/api-platform" },
        { label: "Developers", href: "/developers" },
        { label: "Pricing", href: "/pricing" },
      ]
    : [
        { label: "Solutions", href: "/solutions" },
        { label: "Enterprise", href: "/enterprise" },
        { label: "Services", href: "/services" },
        { label: "Pricing", href: "/pricing" },
      ];
  const showValueSection = ["pricing", "compute", "marketplace", "partners", "enterprise", "services", "agents", "insights", "integrations", "channels", "commerce"].includes(config.art);
  const lightValueSection = ["pricing", "partners", "enterprise", "services", "agents", "insights", "integrations", "channels", "commerce"].includes(config.art);
  const secondaryCta = audience === "compute"
    ? ["API Platform", "/api-platform"]
    : config.art === "partners"
      ? ["Explore Solutions", "/solutions"]
      : config.art === "marketplace"
        ? ["Partner network", "/partners"]
        : ["Explore Business OS", "/"];
  return (
    <main className="min-h-screen bg-[#F7F6F3] text-[#191919]">
      <PublicSiteHeader
        context={config.context}
        audience={audience}
        links={headerLinks}
      />
      <section className="relative overflow-hidden border-b border-black/[0.06] bg-[#F4F0E8]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(214,166,106,.13),transparent_31%)]" />
        <div className="relative mx-auto max-w-[1540px] lg:grid lg:min-h-[600px] lg:grid-cols-[44%_56%]">
          <div className="relative z-10 flex items-center px-5 py-16 sm:px-7 lg:px-10 lg:py-20 xl:px-14">
            <div className="max-w-[620px]">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#D6A66A]/28 bg-white/60 px-3 py-1.5 text-[8px] font-semibold uppercase tracking-[0.18em] text-[#8A633C] shadow-[0_4px_20px_rgba(100,75,45,.05)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#A37849]" />
                {config.status}
              </div>
              <p className="mt-9 text-[9px] font-semibold uppercase tracking-[0.24em] text-[#A07142]">
                {config.eyebrow}
              </p>
              <h1 className="mt-4 max-w-[600px] text-[49px] font-medium leading-[.95] tracking-[-0.065em] text-[#171614] sm:text-[62px] lg:text-[68px] xl:text-[76px]">
                {config.title}
              </h1>
              <p className="mt-7 max-w-[560px] text-[15px] leading-8 text-[#625D55] sm:text-[16px]">
                {config.description}
              </p>
              <div className="mt-9 flex flex-wrap gap-2.5">
                <Link
                  prefetch
                  href={config.primaryHref || "/login"}
                  className="inline-flex h-11 items-center gap-2 rounded-full bg-[#171614] px-5 text-[10px] font-semibold text-white shadow-[0_9px_28px_rgba(20,18,15,.18)] transition hover:-translate-y-0.5"
                >
                  {config.primary || "Enter Avantiqo"}
                  <Arrow className="h-3.5 w-3.5" />
                </Link>
                <Link
                  prefetch
                  href="/pricing"
                  className="inline-flex h-11 items-center rounded-full border border-black/[0.10] bg-white/70 px-5 text-[10px] font-semibold text-[#56514A] transition hover:border-[#D6A66A]/45"
                >
                  How it works for you
                </Link>
              </div>
              <div className="mt-10 flex items-center gap-5 border-t border-black/[0.08] pt-5 text-[7px] font-semibold uppercase tracking-[0.17em] text-[#9A8F82]">
                <span>CONTROLLED</span>
                <span className="h-1 w-1 rounded-full bg-[#C69A65]" />
                <span>CONNECTED</span>
                <span className="h-1 w-1 rounded-full bg-[#C69A65]" />
                <span>BUSINESS</span>
              </div>
            </div>
          </div>
          <div className="relative flex min-h-[590px] items-center border-t border-black/[0.06] p-5 sm:p-7 lg:min-h-0 lg:border-l lg:border-t-0 lg:p-8">
            <div className="relative w-full overflow-hidden rounded-[30px] border border-black/[0.08] bg-[#171614] shadow-[0_30px_90px_rgba(68,47,25,.13)]">
              <SurfaceArt kind={config.art} />
            </div>
          </div>
        </div>
      </section>
      <StoryRail kind={config.art} />
      <section className="border-b border-black/[0.06] bg-[#FBFAF8]">
        <div className="mx-auto max-w-[1320px] px-5 py-20 sm:px-7 lg:px-10 lg:py-24">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9A744B]">
            {config.valueEyebrow}
          </p>
          <h2 className="mt-3 max-w-4xl text-[36px] font-medium leading-[1.04] tracking-[-0.045em] sm:text-[48px]">
            {config.valueTitle}
          </h2>
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {config.value.map(([t, d], i) => (
              <article
                key={t}
                className="rounded-[22px] border border-black/[0.075] bg-white p-5 shadow-[0_10px_35px_rgba(40,30,20,.035)]"
              >
                <div className="text-[8px] font-bold text-[#A37849]">
                  0{i + 1}
                </div>
                <h3 className="mt-7 text-[15px] font-semibold text-[#302D29]">
                  {t}
                </h3>
                <p className="mt-2 text-[10px] leading-5 text-[#7A756E]">{d}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
      {showValueSection ? (
      <section className={lightValueSection ? "border-b border-black/[0.06] bg-[#F3EFE7] text-[#1D1B18]" : "border-b border-white/[0.06] bg-[#171716] text-white"}>
        <div className="mx-auto grid max-w-[1320px] gap-12 px-5 py-20 sm:px-7 lg:grid-cols-[.72fr_1.28fr] lg:px-10 lg:py-24">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#D6A66A]">
              How it works for you
            </p>
            <h2 className={lightValueSection ? "mt-3 text-[36px] font-medium leading-[1.04] tracking-[-0.045em] text-[#1D1B18] sm:text-[48px]" : "mt-3 text-[36px] font-medium leading-[1.04] tracking-[-0.045em] text-[#F7F4EF] sm:text-[48px]"}>
              {config.moneyTitle}
            </h2>
            <p className={lightValueSection ? "mt-5 max-w-lg text-[13px] leading-7 text-[#706A62]" : "mt-5 max-w-lg text-[13px] leading-7 text-white/42"}>
              {config.moneyDescription}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {config.money.map(([t, d], i) => (
              <div
                key={t}
                className={lightValueSection ? "rounded-[20px] border border-[#D6A66A]/24 bg-white/72 p-5 shadow-[0_12px_38px_rgba(50,36,22,.05)]" : "rounded-[20px] border border-white/[0.08] bg-white/[0.025] p-5"}
              >
                <div className="text-[8px] font-bold text-[#D6A66A]">
                  0{i + 1}
                </div>
                <div className={lightValueSection ? "mt-6 text-[14px] font-semibold text-[#302D29]" : "mt-6 text-[14px] font-semibold text-white/78"}>
                  {t}
                </div>
                <div className={lightValueSection ? "mt-2 text-[9px] leading-5 text-[#7A756E]" : "mt-2 text-[9px] leading-5 text-white/34"}>
                  {d}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
      ) : null}
      <section className="border-b border-black/[0.06] bg-[#FBFAF8]">
        <div className="mx-auto max-w-[1320px] px-5 py-16 sm:px-7 lg:px-10 lg:py-20">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[#9A744B]">
                Continue through Avantiqo
              </p>
              <h2 className="mt-2 text-[30px] font-medium tracking-[-0.045em] text-[#1D1B18] sm:text-[38px]">
                Move naturally from one Avantiqo need to the next.
              </h2>
            </div>
            <Link
              prefetch
              href="/pricing"
              className="text-[10px] font-semibold text-[#8A633C]"
            >
              See pricing →
            </Link>
          </div>
          <div className="mt-8 grid gap-3 md:grid-cols-3">
            {(RELATED[config.art] || RELATED.pricing).map(
              ([label, href, text], i) => (
                <Link
                  prefetch
                  key={href}
                  href={href}
                  className="group overflow-hidden rounded-[22px] border border-black/[0.075] bg-white transition hover:-translate-y-0.5 hover:border-[#D6A66A]/35 hover:shadow-[0_18px_45px_rgba(45,32,20,.08)]"
                >
                  <div className="relative h-[155px] overflow-hidden bg-[#171614]">
                    <div className="absolute inset-0 bg-cover bg-center transition duration-700 group-hover:scale-[1.03]" style={{backgroundImage:`url(${RELATED_ART[label] || "/art/developer-work.jpg"})`}} />
                    <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(10,8,6,.02),rgba(10,8,6,.12)_56%,rgba(10,8,6,.62))]" />
                    <div className="absolute left-4 top-4 rounded-full border border-white/12 bg-black/28 px-2.5 py-1 text-[7px] font-bold text-[#F1C98E] backdrop-blur-md">0{i + 1}</div>
                  </div>
                  <div className="p-5">
                    <div className="flex items-center justify-between">
                      <div className="text-[14px] font-semibold text-[#302D29]">{label}</div>
                      <Arrow className="h-3.5 w-3.5 text-[#B9AA95] transition group-hover:translate-x-0.5 group-hover:text-[#9A744B]" />
                    </div>
                    <p className="mt-2 text-[10px] leading-5 text-[#7A756E]">{text}</p>
                  </div>
                </Link>
              ),
            )}
          </div>
        </div>
      </section>
      <section className="bg-[#F7F6F3]">
        <div className="mx-auto max-w-[1120px] px-5 py-20 text-center sm:px-7 lg:px-10 lg:py-24">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9A744B]">
            Part of the Avantiqo Marketplace
          </p>
          <h2 className="mx-auto mt-4 max-w-4xl text-[38px] font-medium leading-[1.02] tracking-[-0.05em] sm:text-[52px]">
            {config.cta}
          </h2>
          <div className="mt-8 flex flex-wrap justify-center gap-2.5">
            <Link
              prefetch
              href={config.primaryHref || "/login"}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#171716] px-5 text-[11px] font-semibold text-white"
            >
              {config.primary || "Enter Avantiqo"}
              <Arrow className="h-3.5 w-3.5" />
            </Link>
            <Link
              prefetch
              href={secondaryCta[1]}
              className="inline-flex h-11 items-center rounded-xl border border-black/[0.09] bg-white px-5 text-[11px] font-semibold text-[#56514A]"
            >
              {secondaryCta[0]}
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
