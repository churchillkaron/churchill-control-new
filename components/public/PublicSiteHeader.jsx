import Image from "next/image";

function Arrow({ className = "" }) {
  return <svg aria-hidden="true" viewBox="0 0 20 20" className={className} fill="none"><path d="M4 10h11M11 6l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

const EXPLORE_GROUPS = [
  ["Operate", [["Start here","/start"],["Business OS","/"],["Solutions","/solutions"],["Enterprise","/enterprise"],["Insights","/insights"]]],
  ["Create", [["Creative Studios","/creative-studios"],["Agents","/agents"],["Services","/services"]]],
  ["Build", [["Developers","/developers"],["Integrations","/integrations"],["Channels","/channels"]]],
  ["Monetize", [["Commerce","/commerce"],["Compute","/compute"],["Marketplace","/ecosystem"],["Partners","/partners"],["Pricing","/pricing"]]],
];

export default function PublicSiteHeader({ context, links = [], action = { label: "Login", href: "/login" } }) {
  return (
    <header className="sticky top-0 z-50 border-b border-black/[0.07] bg-[#F7F6F3]/[0.97] text-[#191919] shadow-[0_5px_24px_rgba(46,37,27,.055)] backdrop-blur-2xl">
      <div className="mx-auto flex h-[68px] max-w-[1540px] items-center justify-between gap-4 px-5 sm:px-7 lg:px-10 xl:px-14">
        <a href="/" className="flex min-w-0 items-center gap-4" aria-label="Avantiqo home">
          <Image src="/branding/avantiqo-wordmark.png" alt="Avantiqo" width={154} height={13} className="h-[12px] w-auto object-contain" priority />
          <span className="hidden h-3 w-px bg-black/[0.08] sm:block" />
          <span className="hidden truncate text-[7px] font-semibold uppercase tracking-[0.22em] text-[#9A744B] sm:block">{context}</span>
        </a>
        <nav className="flex items-center gap-1" aria-label="Primary navigation">
          <div className="hidden items-center gap-0.5 lg:flex">{links.slice(0,4).map((link) => <a key={`${link.href}-${link.label}`} href={link.href} className="rounded-lg px-3 py-2 text-[9px] font-medium text-[#6C6963] transition hover:bg-white hover:text-[#292723]">{link.label}</a>)}</div>
          <details className="group relative">
            <summary className="flex h-9 cursor-pointer list-none items-center gap-2 rounded-full border border-black/[0.08] bg-white/70 px-4 text-[9px] font-semibold text-[#57524C] transition hover:border-[#D6A66A]/45 hover:bg-white hover:text-[#8A633C]">Explore <span className="text-[11px] text-[#D6A66A] transition group-open:rotate-45">+</span></summary>
            <div className="fixed inset-x-3 top-[62px] max-h-[calc(100vh-76px)] overflow-y-auto rounded-[24px] border border-black/[0.08] bg-[#FBFAF8]/[0.99] p-3 text-[#191919] shadow-[0_28px_90px_rgba(28,20,12,.16)] backdrop-blur-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-11 sm:max-h-none sm:w-[min(780px,calc(100vw-2rem))] sm:overflow-hidden">
              <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-4">{EXPLORE_GROUPS.map(([group, items]) => <div key={group} className="rounded-[18px] p-3"><div className="px-2 pb-2 text-[8px] font-semibold uppercase tracking-[0.18em] text-[#D6A66A]">{group}</div>{items.map(([label,href]) => <a key={href} href={href} className="group/link flex items-center justify-between rounded-xl px-2 py-2.5 text-[10px] font-medium text-[#57524C] transition hover:bg-white hover:text-[#1D1B18]"><span>{label}</span><Arrow className="h-3 w-3 text-[#D6A66A] opacity-0 transition group-hover/link:translate-x-0.5 group-hover/link:opacity-100"/></a>)}</div>)}</div>
              <div className="mt-1 flex items-center justify-between gap-4 rounded-[16px] border border-black/[0.07] bg-[#F3EEE6] px-4 py-3"><div><div className="text-[8px] font-semibold uppercase tracking-[0.18em] text-[#D6A66A]">One Avantiqo economy</div><div className="mt-1 text-[9px] text-[#817B73]">Operate, create, build, sell and scale on the same business context.</div></div><div className="flex shrink-0 items-center gap-4"><a href="/pricing" className="text-[9px] font-semibold text-[#6C6963]">Pricing</a><a href="/start" className="text-[9px] font-semibold text-[#8A633C]">Start here →</a></div></div>
            </div>
          </details>
          <a href={action.href} className="ml-1 inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-black/[0.09] bg-[#171716] px-4 text-[9px] font-semibold text-white shadow-[0_3px_12px_rgba(20,18,15,.14)] transition hover:bg-[#2A2926]">{action.label}<Arrow className="h-3 w-3" /></a>
        </nav>
      </div>
    </header>
  );
}
