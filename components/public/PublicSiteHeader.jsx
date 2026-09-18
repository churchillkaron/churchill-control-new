import Image from "next/image";

function Arrow({ className = "" }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className={className} fill="none">
      <path d="M4 10h11M11 6l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const EXPLORE_GROUPS = [
  {
    label: "PRODUCTS",
    description: "Run the work that matters.",
    items: [["All Products", "/products"], ["Workforce", "/products/workforce"], ["Finance", "/products/finance"], ["Inventory & Food Cost", "/products/inventory"], ["Invoice Intelligence", "/invoice-processing"], ["Documents", "/documents"]],
  },
  {
    label: "RUN",
    description: "Operate across every channel.",
    items: [["Channels", "/channels"], ["Solutions", "/solutions"], ["Enterprise", "/enterprise"], ["Services", "/services"]],
  },
  {
    label: "THINK",
    description: "Understand what needs attention.",
    items: [["Intelligence", "/intelligence-platform"], ["Agents", "/agents"], ["Insights", "/insights"]],
  },
  {
    label: "CREATE",
    description: "Turn ideas into finished work.",
    items: [["Creative Studios", "/creative-studios"], ["Image Studio", "/creative-studios/image"], ["Video Studio", "/creative-studios/video"], ["Music Studio", "/creative-studios/music"], ["Voice", "/voice"]],
  },
  {
    label: "BUILD",
    description: "Build products and integrations.",
    items: [["Code", "/code"], ["Developers", "/developers"], ["API Platform", "/api-platform"], ["Integrations", "/integrations"]],
  },
  {
    label: "SCALE",
    description: "Add capacity when you need it.",
    items: [["Compute", "/compute"], ["Enterprise", "/enterprise"], ["Services", "/services"], ["Partners", "/partners"], ["Marketplace", "/ecosystem"]],
  },
];

const GLOBAL_LINKS = [
  ["Products", "/products"],
  ["Solutions", "/solutions"],
  ["Creative", "/creative-studios"],
  ["Developers", "/developers"],
  ["Compute", "/compute"],
  ["Pricing", "/pricing"],
];

const AREA_MENUS = {
  business: [
    ["Platform", "/business"], ["Solutions", "/solutions"], ["Agents", "/agents"], ["Insights", "/insights"],
    ["Enterprise", "/enterprise"], ["Services", "/services"], ["Integrations", "/integrations"],
    ["Commerce", "/commerce"], ["Channels", "/channels"], ["Pricing", "/pricing"],
  ],
  creative: [
    ["Creative Studios", "/creative-studios"], ["Image Studio", "/creative-studios/image"],
    ["Video Studio", "/creative-studios/video"], ["Music Studio", "/creative-studios/music"],
  ],
  developers: [
    ["Developers", "/developers"], ["Capabilities", "/developers/capabilities"], ["API Platform", "/api-platform"],
    ["Integrations", "/integrations"], ["Compute", "/compute"],
  ],
  api: [
    ["API Platform", "/api-platform"], ["Developers", "/developers"], ["Integrations", "/integrations"],
    ["Compute", "/compute"],
  ],
  compute: [
    ["Compute", "/compute"], ["API Platform", "/api-platform"], ["Developers", "/developers"],
  ],
  platform: [
    ["Start", "/start"], ["Business OS", "/business"], ["Creative Studios", "/creative-studios"],
    ["Developers", "/developers"], ["API Platform", "/api-platform"], ["Compute", "/compute"],
  ],
};

export default function PublicSiteHeader({ context, links = [], action = { label: "Business Login", href: "/login?portal=business" }, audience = "business" }) {
  const menu = AREA_MENUS[audience] || AREA_MENUS.business;
  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.08] bg-[#171614]/[0.97] text-white shadow-[0_8px_28px_rgba(0,0,0,.18)] backdrop-blur-2xl">
      <div className="mx-auto flex h-[68px] max-w-[1540px] items-center justify-between gap-4 px-5 sm:px-7 lg:px-10 xl:px-14">
        <a href={audience === "business" ? "/" : audience === "creative" ? "/creative-studios" : audience === "developers" ? "/developers" : audience === "api" ? "/api-platform" : audience === "compute" ? "/compute" : "/start"} className="flex min-w-0 items-center gap-4" aria-label={`Avantiqo ${context}`}>
          <Image src="/branding/avantiqo-wordmark.png" alt="Avantiqo" width={154} height={13} className="h-[12px] w-auto object-contain" priority />
          <span className="hidden h-3 w-px bg-white/[0.12] sm:block" />
          <span className="hidden truncate text-[7px] font-semibold uppercase tracking-[0.22em] text-[#D6A66A] sm:block">{context}</span>
        </a>
        <nav className="flex items-center gap-1" aria-label={`${context} navigation`}>
          <div className="hidden items-center gap-0.5 xl:flex">
            {GLOBAL_LINKS.map(([label, href]) => (
              <a key={href} href={href} className="rounded-lg px-2.5 py-2 text-[8px] font-medium text-white/62 transition hover:bg-white/[0.05] hover:text-white">{label}</a>
            ))}
          </div>
          <div className="hidden items-center gap-0.5 lg:flex xl:hidden">
            {links.slice(0, 4).map((link) => (
              <a key={`${link.href}-${link.label}`} href={link.href} className="rounded-lg px-2.5 py-2 text-[8px] font-medium text-white/62 transition hover:bg-white/[0.05] hover:text-white">{link.label}</a>
            ))}
          </div>
          <details className="group relative">
            <summary className="flex h-9 cursor-pointer list-none items-center gap-2 rounded-full border border-[#D6A66A]/35 bg-white/[0.03] px-4 text-[9px] font-semibold text-[#E6D2B4] transition hover:border-[#D6A66A]/70 hover:bg-white/[0.06] hover:text-white">
              Explore <span className="text-[11px] text-[#D6A66A] transition group-open:rotate-45">+</span>
            </summary>
            <div className="fixed left-1/2 top-[76px] max-h-[calc(100vh-92px)] w-[min(1180px,calc(100vw-2rem))] -translate-x-1/2 overflow-y-auto rounded-[24px] border border-white/[0.09] bg-[#191714]/[0.995] shadow-[0_32px_100px_rgba(0,0,0,.36)] backdrop-blur-2xl">
              <div className="grid gap-6 border-b border-white/[0.07] px-6 py-5 lg:grid-cols-[1.35fr_.65fr] lg:items-end">
                <div>
                  <div className="text-[8px] font-semibold uppercase tracking-[0.2em] text-[#D6A66A]">Explore Avantiqo</div>
                  <h2 className="mt-2 max-w-2xl text-[22px] font-medium tracking-[-0.035em] text-white/94 sm:text-[26px]">Choose what you want to run, create, build or scale.</h2>
                  <p className="mt-2 max-w-2xl text-[9px] leading-5 text-white/42">Business products, intelligence, creative tools, developer capabilities and compute in one connected Avantiqo account.</p>
                </div>
                <div className="hidden justify-self-end border-l border-white/[0.08] pl-6 lg:block">
                  <div className="text-[10px] font-medium text-white/78">From daily work to infrastructure.</div>
                  <div className="mt-1.5 max-w-[210px] text-[8px] leading-4 text-white/36">Start where the work is. Add more Avantiqo only when it helps.</div>
                </div>
              </div>

              <div className="grid gap-2.5 px-4 py-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                {EXPLORE_GROUPS.map(({ label: group, description, items }) => (
                  <section key={group} className="min-w-0 rounded-[16px] border border-white/[0.065] bg-white/[0.022] p-3.5">
                    <div className="text-[7px] font-semibold uppercase tracking-[0.17em] text-[#D6A66A]">{group}</div>
                    <p className="mt-1.5 min-h-[32px] text-[8px] leading-4 text-white/34">{description}</p>
                    <div className="mt-2.5 space-y-0.5">
                      {items.map(([label, href]) => (
                        <a key={`${group}-${href}`} href={href} className="group/link flex min-h-[30px] items-center justify-between rounded-lg px-1.5 py-1.5 text-[8.5px] font-medium text-white/58 transition hover:bg-white/[0.055] hover:text-white">
                          <span className="truncate pr-2">{label}</span>
                          <Arrow className="h-3 w-3 shrink-0 text-[#D6A66A] opacity-40 transition group-hover/link:translate-x-0.5 group-hover/link:opacity-100" />
                        </a>
                      ))}
                    </div>
                  </section>
                ))}
              </div>

              <div className="flex flex-col gap-3 border-t border-white/[0.07] bg-black/[0.08] px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-4">
                  <div className="shrink-0 text-[7px] font-semibold uppercase tracking-[0.18em] text-white/30">Inside {context}</div>
                  <div className="hidden min-w-0 flex-wrap gap-x-1 gap-y-1 md:flex">
                    {menu.slice(0, 4).map(([label, href]) => (
                      <a key={`${context}-${href}`} href={href} className="rounded-lg px-2.5 py-1.5 text-[8px] font-medium text-white/48 transition hover:bg-white/[0.05] hover:text-white">{label}</a>
                    ))}
                  </div>
                </div>
                <a href="/start" className="inline-flex shrink-0 items-center gap-2 rounded-full border border-[#D6A66A]/40 px-3.5 py-2 text-[8px] font-semibold text-[#E8CAA1] transition hover:border-[#D6A66A]/70 hover:bg-[#D6A66A]/[0.07]">All Avantiqo areas <Arrow className="h-3 w-3" /></a>
              </div>
            </div>
          </details>
          <a href="/start" className="ml-1 hidden h-9 shrink-0 items-center gap-2 rounded-full border border-[#D6A66A]/55 px-4 text-[9px] font-semibold text-[#F2D2A5] transition hover:border-[#D6A66A]/90 hover:bg-[#D6A66A]/[0.08] xl:inline-flex">Start Now <Arrow className="h-3 w-3" /></a>
          <a href={action.href} className="hidden h-9 shrink-0 items-center gap-2 rounded-full border border-white/[0.12] bg-[#0F0F0E] px-4 text-[9px] font-semibold text-white/82 transition hover:border-[#D6A66A]/45 hover:bg-[#211D18] sm:inline-flex">{action.label}<Arrow className="h-3 w-3" /></a>
          <a href="/login?portal=developer" className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-[#D6A66A]/45 bg-[#D6A66A]/[0.08] px-4 text-[9px] font-semibold text-[#F1D5AF] transition hover:border-[#D6A66A]/80 hover:bg-[#D6A66A]/[0.14]">Developer Login<Arrow className="h-3 w-3" /></a>
        </nav>
      </div>
    </header>
  );
}
