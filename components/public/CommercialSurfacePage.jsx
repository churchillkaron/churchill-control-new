import PublicSiteHeader from "@/components/public/PublicSiteHeader";

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
    line: "Own workloads first. Paid demand next. Idle capacity can earn.",
    chips: ["OWNED GPU", "PAID JOBS", "IDLE RENTAL"],
    panel: [
      ["AVANTIQO", "Priority 01"],
      ["PAID WORK", "Priority 02"],
      ["IDLE", "Revenue ready"],
    ],
  },
  marketplace: {
    image: "/art/commercial-marketplace.jpg",
    label: "Marketplace economy",
    line: "People, products and capacity connected through one commercial layer.",
    chips: ["PUBLISH", "METER", "SETTLE"],
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
    line: "Bring communications, payments, documents and specialist providers into governed work.",
    chips: ["CONNECT", "AUTHORIZE", "EXECUTE"],
    panel: [
      ["MESSAGING", "Connected"],
      ["PAYMENTS", "Governed"],
      ["DATA", "Scoped"],
    ],
  },
  partners: {
    image: "/art/commercial-partners.jpg",
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
    label: "Governed agents",
    line: "Automation stays attached to people, evidence, permissions and exact business capabilities.",
    chips: ["RESEARCH", "PREPARE", "EXECUTE"],
    panel: [
      ["CONTEXT", "Business"],
      ["AUTHORITY", "Exact"],
      ["PROOF", "Durable"],
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
      ["MIGRATE", "Evidence"],
      ["CONFIGURE", "Workflow"],
      ["LAUNCH", "Ready"],
    ],
  },
  insights: {
    image: "/art/commercial-insights.jpg",
    label: "Decision intelligence",
    line: "Turn governed evidence into exceptions, forecasts and higher-value decisions.",
    chips: ["EVIDENCE", "FORECAST", "DECIDE"],
    panel: [
      ["FINANCE", "Signal"],
      ["OPS", "Signal"],
      ["COMMERCIAL", "Signal"],
    ],
  },
  pricing: {
    image: "/art/commercial-pricing.jpg",
    label: "Commercial model",
    line: "Simple platform economics around subscription, usage, transactions and supply.",
    chips: ["SUBSCRIBE", "CONSUME", "EARN"],
    panel: [
      ["BUSINESS OS", "Recurring"],
      ["WALLET", "Usage"],
      ["PLATFORM", "Economics"],
    ],
  },
  commerce: {
    image: "/art/commercial-commerce.jpg",
    label: "Commerce flow",
    line: "A real customer interaction can become payment, settlement and finance evidence in one flow.",
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
    line: "Web, mobile, portal, kiosk and POS stay connected to the same business context.",
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
  const visual = {
    compute: {
      support: "/art/developer-work.jpg",
      accent: "OWNED CAPACITY",
      metric: "NODE 001",
      detail: "Owned GPU · paid demand · overflow",
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
      support: "/art/commercial-services.jpg",
      accent: "DISTRIBUTION",
      metric: "PORTFOLIO",
      detail: "Clients · delivery · value",
      position: "center",
      supportPosition: "center",
    },
    agents: {
      support: "/art/developer-work.jpg",
      accent: "GOVERNED ACTION",
      metric: "PROOF",
      detail: "Context · authority · verification",
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
      detail: "Evidence · forecast · action",
      position: "center",
      supportPosition: "center",
    },
    pricing: {
      support: "/art/commercial-commerce.jpg",
      accent: "COMMERCIAL MODEL",
      metric: "METER",
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
    detail: "Governed operating context",
    position: "center",
    supportPosition: "center",
  };
  const editorial =
    kind === "solutions" ||
    kind === "services" ||
    kind === "partners" ||
    kind === "enterprise";
  const technical =
    kind === "compute" ||
    kind === "agents" ||
    kind === "integrations" ||
    kind === "commerce";

  return (
    <div className="relative min-h-[560px] overflow-hidden bg-[#171512] lg:min-h-[690px]">
      <div
        className="absolute inset-0 scale-[1.01] bg-cover"
        style={{
          backgroundImage: `url(${art.image})`,
          backgroundPosition: visual.position,
        }}
      />
      <div
        className={`absolute inset-0 ${editorial ? "bg-[linear-gradient(90deg,rgba(18,15,12,.02),rgba(18,15,12,.02)_42%,rgba(12,10,8,.22)),linear-gradient(180deg,rgba(255,255,255,.02),rgba(10,8,6,.08)_54%,rgba(10,8,6,.70))]" : technical ? "bg-[linear-gradient(90deg,rgba(4,4,4,.20),rgba(4,4,4,.02)_44%,rgba(4,4,4,.26)),linear-gradient(180deg,rgba(0,0,0,.02),rgba(0,0,0,.08)_48%,rgba(5,5,5,.78))]" : "bg-[linear-gradient(90deg,rgba(18,15,12,.08),rgba(18,15,12,.01)_48%,rgba(18,15,12,.18)),linear-gradient(180deg,rgba(255,255,255,.03),rgba(8,7,6,.08)_52%,rgba(8,7,6,.72))]"}`}
      />
      <div className="absolute inset-y-0 left-0 w-px bg-gradient-to-b from-transparent via-[#D6A66A]/55 to-transparent" />

      <div className="absolute left-6 top-6 flex items-center gap-2 text-[7px] font-semibold uppercase tracking-[0.24em] text-[#F2CEA0] sm:left-8 sm:top-8">
        <span className="h-1.5 w-1.5 rounded-full bg-[#D6A66A] shadow-[0_0_16px_rgba(214,166,106,.70)]" />{" "}
        AVANTIQO / {art.label}
      </div>
      <div className="absolute right-6 top-6 hidden text-right sm:block sm:right-8 sm:top-8">
        <div className="text-[7px] font-semibold uppercase tracking-[0.24em] text-[#F2C990]">
          {visual.accent}
        </div>
        <div className="mt-1 text-[7px] uppercase tracking-[0.18em] text-white/45">
          People · business · intelligence
        </div>
      </div>

      <div className="absolute bottom-7 left-7 hidden w-[205px] overflow-hidden rounded-[22px] border border-white/14 bg-black/18 shadow-[0_24px_65px_rgba(0,0,0,.20)] backdrop-blur-xl xl:block">
        <div
          className="h-[138px] bg-cover bg-center"
          style={{
            backgroundImage: `url(${visual.support})`,
            backgroundPosition: visual.supportPosition,
          }}
        />
        <div className="border-t border-white/10 bg-[#15120f]/78 px-4 py-3 text-white">
          <div className="text-[6px] font-semibold uppercase tracking-[0.19em] text-[#E3B77D]">
            CONNECTED LAYER
          </div>
          <div className="mt-1 text-[8px] text-white/55">
            Same Avantiqo context
          </div>
        </div>
      </div>

      <div className="absolute bottom-7 right-7 w-[calc(100%-3.5rem)] max-w-[460px] sm:bottom-8 sm:right-8 sm:w-[440px]">
        <div className="rounded-[24px] border border-white/15 bg-[linear-gradient(135deg,rgba(15,13,11,.82),rgba(26,22,18,.50))] p-5 text-white shadow-[0_32px_90px_rgba(0,0,0,.24)] backdrop-blur-xl sm:p-6">
          <div className="flex items-center justify-between gap-5">
            <div className="text-[7px] font-semibold uppercase tracking-[0.22em] text-[#E7BE86]">
              {visual.metric}
            </div>
            <div className="text-[6px] uppercase tracking-[0.18em] text-white/30">
              {visual.accent}
            </div>
          </div>
          <p className="mt-4 text-[14px] leading-6 text-white/78">{art.line}</p>
          <div className="mt-5 flex flex-wrap gap-1.5">
            {art.chips.map((x) => (
              <span
                key={x}
                className="rounded-full border border-white/14 bg-white/[0.035] px-2.5 py-1 text-[6px] font-semibold tracking-[0.17em] text-white/58"
              >
                {x}
              </span>
            ))}
          </div>
          <div className="mt-5 grid grid-cols-3 gap-2 border-t border-white/[0.08] pt-4">
            {art.panel.map(([a, b], i) => (
              <div key={a}>
                <div className="flex items-center gap-1.5">
                  <span className="h-1 w-1 rounded-full bg-[#D6A66A]" />
                  <span className="text-[6px] font-semibold uppercase tracking-[0.14em] text-white/58">
                    {a}
                  </span>
                </div>
                <div className="mt-1.5 text-[7px] text-[#D8B27F]">{b}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const PAGE_STORY = {
  solutions: {
    eyebrow: "Made for the business being run",
    title: "One platform. Different operating worlds.",
    lead: "The artwork and product story should change with the industry while the Avantiqo operating layer stays consistent underneath.",
    steps: [
      ["01", "Restaurant", "Service · kitchen · stock · finance"],
      ["02", "Hotel", "Rooms · guests · teams · revenue"],
      ["03", "Retail", "Sell · stock · purchase · settle"],
      ["04", "Services", "Projects · clients · documents · people"],
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
    lead: "The visual language centers on exceptions, evidence and the decisions management needs to make next.",
    steps: [
      ["01", "Observe", "Finance · operations · people"],
      ["02", "Detect", "Exceptions · trends · risk"],
      ["03", "Interpret", "Forecast · compare · explain"],
      ["04", "Decide", "Priority · action · follow-through"],
    ],
  },
  agents: {
    eyebrow: "Governed digital labor",
    title: "Useful automation with exact authority.",
    lead: "Agents are shown as controlled operating flows tied to evidence, permissions and verification—not cartoon assistants.",
    steps: [
      ["01", "Context", "Organization · entity · role"],
      ["02", "Prepare", "Research · evidence · plan"],
      ["03", "Authorize", "Capability · approval · scope"],
      ["04", "Verify", "Result · proof · audit"],
    ],
  },
  enterprise: {
    eyebrow: "Portfolio operating model",
    title: "Scale without losing control.",
    lead: "The enterprise visual system expands Avantiqo from one company into governed portfolios of entities, locations and teams.",
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
    lead: "Customers buy useful outcomes. The scheduler decides where each approved workload runs.",
    steps: [
      ["01", "Avantiqo", "Internal priority workloads"],
      ["02", "Paid jobs", "Studio · API · batch"],
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
      ["04", "Evidence", "Result returns to Avantiqo"],
    ],
  },
  partners: {
    eyebrow: "Distribution network",
    title: "One relationship can unlock many businesses.",
    lead: "Partners are framed as implementation and operating networks, not a generic handshake program.",
    steps: [
      ["01", "Partner", "Advisor · agency · accountant"],
      ["02", "Portfolio", "Multiple client organizations"],
      ["03", "Delivery", "Implement · support · improve"],
      ["04", "Economics", "Subscription · services · share"],
    ],
  },
  pricing: {
    eyebrow: "Commercial architecture",
    title: "One account. Several ways to buy value.",
    lead: "Pricing separates predictable software from expensive variable work so Avantiqo can scale revenue without charging for every click.",
    steps: [
      ["01", "Business OS", "Recurring subscription"],
      ["02", "Wallet", "Premium usage"],
      ["03", "Platform", "API · marketplace · compute"],
      ["04", "Enterprise", "Contract · SLA · services"],
    ],
  },
  commerce: {
    eyebrow: "Revenue flow",
    title: "A sale should stay connected all the way to the books.",
    lead: "Commerce art follows money from the customer interaction through payment, settlement and finance evidence.",
    steps: [
      ["01", "Sell", "POS · booking · invoice"],
      ["02", "Pay", "Cash · card · QR · transfer"],
      ["03", "Settle", "Match provider and transaction"],
      ["04", "Post", "Governed finance evidence"],
    ],
  },
  channels: {
    eyebrow: "Every operating surface",
    title: "The same business context, wherever work happens.",
    lead: "Channels are shown as real staff and customer touchpoints rather than a cloud of device icons.",
    steps: [
      ["01", "Public", "Website · campaign · booking"],
      ["02", "Customer", "Portal · account · payment"],
      ["03", "Staff", "Mobile · kiosk · POS"],
      ["04", "Embedded", "Widgets · partner products"],
    ],
  },
  marketplace: {
    eyebrow: "Avantiqo economy",
    title: "Package outcomes, not downloads.",
    lead: "Capabilities, agents, solutions and compute can become metered supply inside one governed commercial layer.",
    steps: [
      ["01", "Publish", "Capability · agent · solution"],
      ["02", "Discover", "Business demand"],
      ["03", "Consume", "Wallet · permissions · scope"],
      ["04", "Settle", "Creator value · platform share"],
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
            <div
              className="absolute inset-0 scale-[1.02] bg-cover bg-center"
              style={{ backgroundImage: `url(${art.image})` }}
            />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,.03),rgba(0,0,0,.08)_42%,rgba(7,6,5,.78))]" />
            <div className="absolute left-5 top-5 rounded-full border border-white/[0.18] bg-black/28 px-3 py-1.5 text-[7px] font-semibold uppercase tracking-[0.18em] text-[#E8C18D] backdrop-blur-xl">
              AVANTIQO / {art.label}
            </div>
            <div className="absolute bottom-5 left-5 right-5 rounded-[18px] border border-white/[0.14] bg-black/30 p-4 backdrop-blur-xl">
              <div className="text-[7px] font-semibold uppercase tracking-[0.18em] text-[#D6A66A]">
                REAL OPERATING CONTEXT
              </div>
              <div className="mt-2 text-[11px] leading-5 text-white/62">
                The page artwork follows the work being done rather than using
                decorative technology imagery.
              </div>
            </div>
          </div>
          <div className="grid sm:grid-cols-2">
            {story.steps.map(([no, title, text], i) => (
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

const RELATED = {
  compute: [
    ["Developers", "/developers", "Turn capacity into metered workloads."],
    ["Marketplace", "/ecosystem", "Distribute approved compute supply."],
    ["Pricing", "/pricing", "Connect usage to the commercial model."],
  ],
  marketplace: [
    ["Developers", "/developers", "Build capabilities businesses can consume."],
    ["Partners", "/partners", "Scale distribution through trusted operators."],
    ["Compute", "/compute", "Add infrastructure supply to the economy."],
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
    ["Enterprise", "/enterprise", "Package larger operating scope and governance."],
    ["Services", "/services", "Add implementation, migration and optimization."],
  ],
  integrations: [
    ["Channels", "/channels", "Bring connected services into every surface."],
    ["Commerce", "/commerce", "Connect providers to revenue flows."],
    ["Solutions", "/solutions", "Connect provider capability to the business workflow."],
  ],
  partners: [
    ["Services", "/services", "Package repeatable implementation work."],
    ["Solutions", "/solutions", "Take vertical products to more businesses."],
    ["Enterprise", "/enterprise", "Manage larger customer portfolios."],
  ],
  agents: [
    ["Insights", "/insights", "Turn evidence into higher-value decisions."],
    ["Services", "/services", "Design and implement governed automation well."],
    [
      "Integrations",
      "/integrations",
      "Connect agents to approved business services.",
    ],
  ],
  commerce: [
    ["Channels", "/channels", "Sell through web, portal, mobile and POS."],
    [
      "Integrations",
      "/integrations",
      "Connect payments and communication rails.",
    ],
    [
      "Pricing",
      "/pricing",
      "Capture subscription, usage and transaction value.",
    ],
  ],
  channels: [
    ["Commerce", "/commerce", "Connect every surface to the revenue flow."],
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
    ["Agents", "/agents", "Move from insight to governed action."],
    ["Enterprise", "/enterprise", "Package portfolio-level decision products."],
    [
      "Pricing",
      "/pricing",
      "Monetize premium analysis without taxing everyday use.",
    ],
  ],
};

export default function CommercialSurfacePage({ config }) {
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
  const showCommercialModel = ["pricing", "compute", "marketplace", "partners"].includes(config.art);
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
        <div className="relative mx-auto max-w-[1540px] lg:grid lg:min-h-[690px] lg:grid-cols-[44%_56%]">
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
                <a
                  href={config.primaryHref || "/login"}
                  className="inline-flex h-11 items-center gap-2 rounded-full bg-[#171614] px-5 text-[10px] font-semibold text-white shadow-[0_9px_28px_rgba(20,18,15,.18)] transition hover:-translate-y-0.5"
                >
                  {config.primary || "Enter Avantiqo"}
                  <Arrow className="h-3.5 w-3.5" />
                </a>
                <a
                  href="/pricing"
                  className="inline-flex h-11 items-center rounded-full border border-black/[0.10] bg-white/70 px-5 text-[10px] font-semibold text-[#56514A] transition hover:border-[#D6A66A]/45"
                >
                  Commercial model
                </a>
              </div>
              <div className="mt-10 flex items-center gap-5 border-t border-black/[0.08] pt-5 text-[7px] font-semibold uppercase tracking-[0.17em] text-[#9A8F82]">
                <span>GOVERNED</span>
                <span className="h-1 w-1 rounded-full bg-[#C69A65]" />
                <span>CONNECTED</span>
                <span className="h-1 w-1 rounded-full bg-[#C69A65]" />
                <span>COMMERCIAL</span>
              </div>
            </div>
          </div>
          <div className="relative min-h-[560px] border-t border-black/[0.06] lg:min-h-0 lg:border-l lg:border-t-0">
            <SurfaceArt kind={config.art} />
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
      {showCommercialModel ? (
      <section className="border-b border-white/[0.06] bg-[#171716] text-white">
        <div className="mx-auto grid max-w-[1320px] gap-12 px-5 py-20 sm:px-7 lg:grid-cols-[.72fr_1.28fr] lg:px-10 lg:py-24">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#D6A66A]">
              Commercial model
            </p>
            <h2 className="mt-3 text-[36px] font-medium leading-[1.04] tracking-[-0.045em] text-[#F7F4EF] sm:text-[48px]">
              {config.moneyTitle}
            </h2>
            <p className="mt-5 max-w-lg text-[13px] leading-7 text-white/42">
              {config.moneyDescription}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {config.money.map(([t, d], i) => (
              <div
                key={t}
                className="rounded-[20px] border border-white/[0.08] bg-white/[0.025] p-5"
              >
                <div className="text-[8px] font-bold text-[#D6A66A]">
                  0{i + 1}
                </div>
                <div className="mt-6 text-[14px] font-semibold text-white/78">
                  {t}
                </div>
                <div className="mt-2 text-[9px] leading-5 text-white/34">
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
                One surface creates demand for the next.
              </h2>
            </div>
            <a
              href="/pricing"
              className="text-[10px] font-semibold text-[#8A633C]"
            >
              See the commercial model →
            </a>
          </div>
          <div className="mt-8 grid gap-3 md:grid-cols-3">
            {(RELATED[config.art] || RELATED.pricing).map(
              ([label, href, text], i) => (
                <a
                  key={href}
                  href={href}
                  className="group rounded-[22px] border border-black/[0.075] bg-white p-5 transition hover:-translate-y-0.5 hover:border-[#D6A66A]/35"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[8px] font-bold text-[#A37849]">
                      0{i + 1}
                    </span>
                    <Arrow className="h-3.5 w-3.5 text-[#B9AA95] transition group-hover:translate-x-0.5 group-hover:text-[#9A744B]" />
                  </div>
                  <div className="mt-7 text-[14px] font-semibold text-[#302D29]">
                    {label}
                  </div>
                  <p className="mt-2 text-[10px] leading-5 text-[#7A756E]">
                    {text}
                  </p>
                </a>
              ),
            )}
          </div>
        </div>
      </section>
      <section className="bg-[#F7F6F3]">
        <div className="mx-auto max-w-[1120px] px-5 py-20 text-center sm:px-7 lg:px-10 lg:py-24">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9A744B]">
            Part of the Avantiqo economy
          </p>
          <h2 className="mx-auto mt-4 max-w-4xl text-[38px] font-medium leading-[1.02] tracking-[-0.05em] sm:text-[52px]">
            {config.cta}
          </h2>
          <div className="mt-8 flex flex-wrap justify-center gap-2.5">
            <a
              href={config.primaryHref || "/login"}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#171716] px-5 text-[11px] font-semibold text-white"
            >
              {config.primary || "Enter Avantiqo"}
              <Arrow className="h-3.5 w-3.5" />
            </a>
            <a
              href={secondaryCta[1]}
              className="inline-flex h-11 items-center rounded-xl border border-black/[0.09] bg-white px-5 text-[11px] font-semibold text-[#56514A]"
            >
              {secondaryCta[0]}
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
