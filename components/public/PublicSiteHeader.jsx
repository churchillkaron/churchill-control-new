import Image from "next/image";

function Arrow({ className = "" }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className={className} fill="none">
      <path d="M4 10h11M11 6l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const EXPLORE_AREAS = [
  ["Business OS", "/", "Run the company"],
  ["Creative Studios", "/creative-studios", "Image · Video · Music"],
  ["Developers", "/developers", "Build with Avantiqo"],
  ["API Platform", "/api-platform", "Capabilities · jobs · usage"],
  ["Compute", "/compute", "GPU · inference · infrastructure"],
];

const AREA_MENUS = {
  business: [
    ["Platform", "/"], ["Solutions", "/solutions"], ["Agents", "/agents"], ["Insights", "/insights"],
    ["Enterprise", "/enterprise"], ["Services", "/services"], ["Integrations", "/integrations"],
    ["Commerce", "/commerce"], ["Channels", "/channels"], ["Pricing", "/pricing"],
  ],
  creative: [
    ["Creative Studios", "/creative-studios"], ["Image Studio", "/creative-studios/image"],
    ["Video Studio", "/creative-studios/video"], ["Music Studio", "/creative-studios/music"],
  ],
  developers: [
    ["Developers", "/developers"], ["API Platform", "/api-platform"], ["Integrations", "/integrations"],
    ["Compute", "/compute"],
  ],
  api: [
    ["API Platform", "/api-platform"], ["Developers", "/developers"], ["Integrations", "/integrations"],
    ["Compute", "/compute"],
  ],
  compute: [
    ["Compute", "/compute"], ["API Platform", "/api-platform"], ["Developers", "/developers"],
  ],
  platform: [
    ["Start", "/start"], ["Business OS", "/"], ["Creative Studios", "/creative-studios"],
    ["Developers", "/developers"], ["API Platform", "/api-platform"], ["Compute", "/compute"],
  ],
};

export default function PublicSiteHeader({ context, links = [], action = { label: "Login", href: "/login" }, audience = "business" }) {
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
          <div className="hidden items-center gap-0.5 lg:flex">
            {links.slice(0, 5).map((link) => (
              <a key={`${link.href}-${link.label}`} href={link.href} className="rounded-lg px-3 py-2 text-[9px] font-medium text-white/62 transition hover:bg-white/[0.05] hover:text-white">{link.label}</a>
            ))}
          </div>
          <details className="group relative">
            <summary className="flex h-9 cursor-pointer list-none items-center gap-2 rounded-full border border-[#D6A66A]/35 bg-white/[0.03] px-4 text-[9px] font-semibold text-[#E6D2B4] transition hover:border-[#D6A66A]/70 hover:bg-white/[0.06] hover:text-white">
              Explore <span className="text-[11px] text-[#D6A66A] transition group-open:rotate-45">+</span>
            </summary>
            <div className="absolute right-0 top-11 w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-[22px] border border-white/[0.09] bg-[#1A1815]/[0.99] p-3 shadow-[0_28px_90px_rgba(0,0,0,.30)] backdrop-blur-2xl">
              <div className="px-3 pb-2 pt-1 text-[8px] font-semibold uppercase tracking-[0.18em] text-[#D6A66A]">Explore Avantiqo</div>
              <div className="grid gap-1">
                {EXPLORE_AREAS.map(([label, href, hint]) => (
                  <a key={href} href={href} className="group/link flex items-center justify-between rounded-xl px-3 py-3 transition hover:bg-white/[0.05]">
                    <span>
                      <span className="block text-[10px] font-medium text-white/72 transition group-hover/link:text-white">{label}</span>
                      <span className="mt-0.5 block text-[7px] uppercase tracking-[0.12em] text-white/28">{hint}</span>
                    </span>
                    <Arrow className="h-3 w-3 text-[#D6A66A] opacity-45 transition group-hover/link:translate-x-0.5 group-hover/link:opacity-100" />
                  </a>
                ))}
              </div>
              <div className="my-2 h-px bg-white/[0.07]" />
              <div className="px-3 pb-1 pt-1 text-[7px] font-semibold uppercase tracking-[0.17em] text-white/28">Inside {context}</div>
              <div className="grid gap-1 sm:grid-cols-2">
                {menu.slice(0, 6).map(([label, href]) => (
                  <a key={href} href={href} className="group/link flex items-center justify-between rounded-xl px-3 py-2.5 text-[9px] font-medium text-white/48 transition hover:bg-white/[0.05] hover:text-white">
                    <span>{label}</span><Arrow className="h-3 w-3 text-[#D6A66A] opacity-0 transition group-hover/link:translate-x-0.5 group-hover/link:opacity-100" />
                  </a>
                ))}
              </div>
              <div className="mt-2 flex items-center justify-between rounded-[15px] border border-white/[0.08] bg-white/[0.035] px-4 py-3">
                <div className="text-[8px] text-white/44">Switch areas without mixing the customer journey.</div>
                <a href="/start" className="shrink-0 pl-4 text-[9px] font-semibold text-[#D6A66A]">All areas →</a>
              </div>
            </div>
          </details>
          <a href="/start" className="ml-1 hidden h-9 shrink-0 items-center gap-2 rounded-full border border-[#D6A66A]/55 px-4 text-[9px] font-semibold text-[#F2D2A5] transition hover:border-[#D6A66A]/90 hover:bg-[#D6A66A]/[0.08] sm:inline-flex">Start Now <Arrow className="h-3 w-3" /></a>
          <a href={action.href} className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-white/[0.12] bg-[#0F0F0E] px-4 text-[9px] font-semibold text-white/82 transition hover:border-[#D6A66A]/45 hover:bg-[#211D18]">{action.label}<Arrow className="h-3 w-3" /></a>
        </nav>
      </div>
    </header>
  );
}
