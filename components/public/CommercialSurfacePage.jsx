import PublicSiteHeader from "@/components/public/PublicSiteHeader";

function Arrow({ className = "" }) {
  return <svg aria-hidden="true" viewBox="0 0 20 20" className={className} fill="none"><path d="M4 10h11M11 6l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

const SURFACE_ART = {
  compute:{image:"/art/commercial-compute.jpg",label:"Compute fabric",line:"Own workloads first. Paid demand next. Idle capacity can earn.",chips:["OWNED GPU","PAID JOBS","IDLE RENTAL"],panel:[["AVANTIQO","Priority 01"],["PAID WORK","Priority 02"],["IDLE","Revenue ready"]]},
  marketplace:{image:"/art/commercial-marketplace.jpg",label:"Marketplace economy",line:"People, products and capacity connected through one commercial layer.",chips:["PUBLISH","METER","SETTLE"],panel:[["CAPABILITIES","Supply"],["AGENTS","Specialists"],["SOLUTIONS","Industry packs"]]},
  solutions:{image:"/art/commercial-solutions.jpg",label:"Industry solutions",line:"Real operating environments, shaped around the business being run.",chips:["HOSPITALITY","RETAIL","SERVICES"],panel:[["BUSINESS OS","Core"],["INDUSTRY","Workflow"],["CONTEXT","Shared"]]},
  integrations:{image:"/art/commercial-integrations.jpg",label:"Connected services",line:"Bring communications, payments, documents and specialist providers into governed work.",chips:["CONNECT","AUTHORIZE","EXECUTE"],panel:[["MESSAGING","Connected"],["PAYMENTS","Governed"],["DATA","Scoped"]]},
  partners:{image:"/art/commercial-partners.jpg",label:"Partner network",line:"Trusted operators can bring whole portfolios of businesses onto Avantiqo.",chips:["ADVISE","IMPLEMENT","SCALE"],panel:[["CLIENTS","Portfolio"],["ACCESS","Scoped"],["VALUE","Shared"]]},
  agents:{image:"/art/commercial-agents.jpg",label:"Governed agents",line:"Automation stays attached to people, evidence, permissions and exact business capabilities.",chips:["RESEARCH","PREPARE","EXECUTE"],panel:[["CONTEXT","Business"],["AUTHORITY","Exact"],["PROOF","Durable"]]},
  enterprise:{image:"/art/commercial-enterprise.jpg",label:"Enterprise operating scope",line:"Multi-entity operations with one governance model and portfolio visibility.",chips:["ENTITIES","LOCATIONS","PORTFOLIO"],panel:[["GOVERNANCE","Unified"],["CONTROL","Scoped"],["SCALE","Global"]]},
  services:{image:"/art/commercial-services.jpg",label:"Implementation services",line:"Discovery, migration, configuration and launch grounded in the real operating environment.",chips:["DISCOVER","IMPLEMENT","OPTIMIZE"],panel:[["MIGRATE","Evidence"],["CONFIGURE","Workflow"],["LAUNCH","Ready"]]},
  insights:{image:"/art/commercial-insights.jpg",label:"Decision intelligence",line:"Turn governed evidence into exceptions, forecasts and higher-value decisions.",chips:["EVIDENCE","FORECAST","DECIDE"],panel:[["FINANCE","Signal"],["OPS","Signal"],["COMMERCIAL","Signal"]]},
  pricing:{image:"/art/commercial-pricing.jpg",label:"Commercial model",line:"Simple platform economics around subscription, usage, transactions and supply.",chips:["SUBSCRIBE","CONSUME","EARN"],panel:[["BUSINESS OS","Recurring"],["WALLET","Usage"],["PLATFORM","Economics"]]},
  commerce:{image:"/art/commercial-commerce.jpg",label:"Commerce flow",line:"A real customer interaction can become payment, settlement and finance evidence in one flow.",chips:["SELL","SETTLE","POST"],panel:[["ORDER","Open"],["PAYMENT","Matched"],["FINANCE","Posted"]]},
  channels:{image:"/art/commercial-channels.jpg",label:"Every business surface",line:"Web, mobile, portal, kiosk and POS stay connected to the same business context.",chips:["WEB","MOBILE","POS"],panel:[["CUSTOMER","Surface"],["STAFF","Surface"],["EMBEDDED","Surface"]]},
};

function SurfaceArt({ kind }) {
  const art = SURFACE_ART[kind] || SURFACE_ART.agents;
  const supporting = {
    compute:["/art/commercial-compute.jpg","/art/developer-work.jpg"],
    marketplace:["/art/commercial-marketplace.jpg","/art/developer-work.jpg"],
    solutions:["/art/commercial-solutions.jpg","/art/commercial-enterprise.jpg"],
    integrations:["/art/commercial-integrations.jpg","/art/commercial-channels.jpg"],
    partners:["/art/commercial-partners.jpg","/art/commercial-services.jpg"],
    agents:["/art/commercial-agents.jpg","/art/developer-work.jpg"],
    enterprise:["/art/commercial-enterprise.jpg","/art/commercial-services.jpg"],
    services:["/art/commercial-services.jpg","/art/commercial-enterprise.jpg"],
    insights:["/art/commercial-insights.jpg","/art/commercial-agents.jpg"],
    pricing:["/art/commercial-pricing.jpg","/art/commercial-commerce.jpg"],
    commerce:["/art/commercial-commerce.jpg","/art/commercial-channels.jpg"],
    channels:["/art/commercial-channels.jpg","/art/commercial-commerce.jpg"],
  }[kind] || [art.image,"/art/developer-work.jpg"];

  return <div className="relative min-h-[560px] overflow-hidden lg:min-h-[690px]">
    <div className="absolute inset-0 bg-cover bg-center" style={{backgroundImage:`url(${art.image})`}}/>
    <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(12,10,8,.08),rgba(12,10,8,.01)_42%,rgba(12,10,8,.22)),linear-gradient(180deg,rgba(0,0,0,.02),rgba(0,0,0,.04)_48%,rgba(8,7,6,.72))]"/>
    <div className="absolute left-5 top-5 flex items-center gap-2 rounded-full border border-white/30 bg-black/20 px-3 py-1.5 text-[7px] font-semibold uppercase tracking-[0.22em] text-[#F1C98E] backdrop-blur-xl sm:left-7 sm:top-7">AVANTIQO <span className="h-1 w-1 rounded-full bg-[#D6A66A]"/> {art.label}</div>
    <div className="absolute right-5 top-5 hidden w-[132px] border-l border-white/28 pl-4 sm:block sm:right-7 sm:top-7">
      <div className="text-[7px] font-semibold uppercase tracking-[0.22em] text-[#F0C98F]">REAL OPERATING CONTEXT</div>
      <div className="mt-2 text-[8px] leading-4 text-white/58">One governed system.<br/>Designed for real work.</div>
    </div>
    <div className="absolute bottom-6 left-5 right-5 sm:bottom-7 sm:left-7 sm:right-7">
      <div className="grid gap-3 sm:grid-cols-[1fr_210px] sm:items-end">
        <div className="max-w-[560px] rounded-[22px] border border-white/16 bg-black/36 p-5 text-white shadow-[0_24px_70px_rgba(0,0,0,.20)] backdrop-blur-xl sm:p-6">
          <div className="text-[8px] font-semibold uppercase tracking-[0.22em] text-[#E8C18D]">{art.label}</div>
          <div className="mt-2 text-[13px] leading-6 text-white/76">{art.line}</div>
          <div className="mt-5 flex flex-wrap gap-1.5">{art.chips.map(x=><span key={x} className="rounded-full border border-white/18 bg-white/[0.04] px-2.5 py-1 text-[7px] font-semibold tracking-[0.15em] text-white/66">{x}</span>)}</div>
        </div>
        <div className="hidden grid-cols-2 gap-2 sm:grid">
          {supporting.map((src,i)=><div key={src} className="relative h-[92px] overflow-hidden rounded-[16px] border border-white/18 bg-black/20 shadow-[0_16px_35px_rgba(0,0,0,.16)]"><div className="absolute inset-0 bg-cover bg-center" style={{backgroundImage:`url(${src})`}}/><div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent"/><div className="absolute bottom-2 left-2.5 text-[6px] font-semibold uppercase tracking-[0.16em] text-white/78">{i===0?"LIVE CONTEXT":"CONNECTED LAYER"}</div></div>)}
        </div>
      </div>
    </div>
  </div>;
}

const RELATED = {
  compute:[["Developers","/developers","Turn capacity into metered workloads."],["Marketplace","/ecosystem","Distribute approved compute supply."],["Pricing","/pricing","Connect usage to the commercial model."]],
  marketplace:[["Developers","/developers","Build capabilities businesses can consume."],["Partners","/partners","Scale distribution through trusted operators."],["Compute","/compute","Add infrastructure supply to the economy."]],
  solutions:[["Services","/services","Implement each industry package well."],["Partners","/partners","Scale vertical delivery through specialists."],["Enterprise","/enterprise","Expand from one site to operating portfolios."]],
  pricing:[["Commerce","/commerce","Create transaction-driven revenue."],["Compute","/compute","Turn infrastructure into usage economics."],["Marketplace","/ecosystem","Add platform commission and settlement."]],
  integrations:[["Channels","/channels","Bring connected services into every surface."],["Commerce","/commerce","Connect providers to revenue flows."],["Developers","/developers","Expose integrations through governed APIs."]],
  partners:[["Services","/services","Package repeatable implementation work."],["Solutions","/solutions","Take vertical products to more businesses."],["Enterprise","/enterprise","Manage larger customer portfolios."]],
  agents:[["Insights","/insights","Turn evidence into higher-value decisions."],["Developers","/developers","Expose governed agent capabilities."],["Marketplace","/ecosystem","Package specialist agents for distribution."]],
  commerce:[["Channels","/channels","Sell through web, portal, mobile and POS."],["Integrations","/integrations","Connect payments and communication rails."],["Pricing","/pricing","Capture subscription, usage and transaction value."]],
  channels:[["Commerce","/commerce","Connect every surface to the revenue flow."],["Creative Studios","/creative-studios","Produce the content those surfaces need."],["Developers","/developers","Embed Avantiqo into external experiences."]],
  enterprise:[["Insights","/insights","Add portfolio intelligence and exceptions."],["Services","/services","Deliver complex rollout and integration programs."],["Partners","/partners","Extend implementation capacity globally."]],
  services:[["Solutions","/solutions","Standardize implementation around industry outcomes."],["Partners","/partners","Scale delivery without custom-work bottlenecks."],["Enterprise","/enterprise","Support higher-complexity operating environments."]],
  insights:[["Agents","/agents","Move from insight to governed action."],["Enterprise","/enterprise","Package portfolio-level decision products."],["Pricing","/pricing","Monetize premium analysis without taxing everyday use."]],
};

export default function CommercialSurfacePage({config}) {
  return <main className="min-h-screen bg-[#F7F6F3] text-[#191919]">
    <PublicSiteHeader context={config.context} links={[{label:"Solutions",href:"/solutions",visibility:"hidden lg:inline-flex"},{label:"Commerce",href:"/commerce",visibility:"hidden lg:inline-flex"},{label:"Channels",href:"/channels",visibility:"hidden xl:inline-flex"},{label:"Developers",href:"/developers",visibility:"hidden xl:inline-flex"}]} />
    <section className="relative overflow-hidden border-b border-black/[0.06] bg-[#F4F0E8]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(214,166,106,.13),transparent_31%)]"/>
      <div className="relative mx-auto max-w-[1540px] lg:grid lg:min-h-[690px] lg:grid-cols-[44%_56%]">
        <div className="relative z-10 flex items-center px-5 py-16 sm:px-7 lg:px-10 lg:py-20 xl:px-14">
          <div className="max-w-[620px]">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#D6A66A]/28 bg-white/60 px-3 py-1.5 text-[8px] font-semibold uppercase tracking-[0.18em] text-[#8A633C] shadow-[0_4px_20px_rgba(100,75,45,.05)]"><span className="h-1.5 w-1.5 rounded-full bg-[#A37849]"/>{config.status}</div>
            <p className="mt-9 text-[9px] font-semibold uppercase tracking-[0.24em] text-[#A07142]">{config.eyebrow}</p>
            <h1 className="mt-4 max-w-[600px] text-[49px] font-medium leading-[.95] tracking-[-0.065em] text-[#171614] sm:text-[62px] lg:text-[68px] xl:text-[76px]">{config.title}</h1>
            <p className="mt-7 max-w-[560px] text-[15px] leading-8 text-[#625D55] sm:text-[16px]">{config.description}</p>
            <div className="mt-9 flex flex-wrap gap-2.5"><a href={config.primaryHref || "/login"} className="inline-flex h-11 items-center gap-2 rounded-full bg-[#171614] px-5 text-[10px] font-semibold text-white shadow-[0_9px_28px_rgba(20,18,15,.18)] transition hover:-translate-y-0.5">{config.primary || "Enter Avantiqo"}<Arrow className="h-3.5 w-3.5"/></a><a href="/pricing" className="inline-flex h-11 items-center rounded-full border border-black/[0.10] bg-white/70 px-5 text-[10px] font-semibold text-[#56514A] transition hover:border-[#D6A66A]/45">Commercial model</a></div>
            <div className="mt-10 flex items-center gap-5 border-t border-black/[0.08] pt-5 text-[7px] font-semibold uppercase tracking-[0.17em] text-[#9A8F82]"><span>GOVERNED</span><span className="h-1 w-1 rounded-full bg-[#C69A65]"/><span>CONNECTED</span><span className="h-1 w-1 rounded-full bg-[#C69A65]"/><span>COMMERCIAL</span></div>
          </div>
        </div>
        <div className="relative min-h-[560px] border-t border-black/[0.06] lg:min-h-0 lg:border-l lg:border-t-0"><SurfaceArt kind={config.art}/></div>
      </div>
    </section>
    <section className="border-b border-black/[0.06] bg-[#FBFAF8]"><div className="mx-auto max-w-[1320px] px-5 py-20 sm:px-7 lg:px-10 lg:py-24"><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9A744B]">{config.valueEyebrow}</p><h2 className="mt-3 max-w-4xl text-[36px] font-medium leading-[1.04] tracking-[-0.045em] sm:text-[48px]">{config.valueTitle}</h2><div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{config.value.map(([t,d],i)=><article key={t} className="rounded-[22px] border border-black/[0.075] bg-white p-5 shadow-[0_10px_35px_rgba(40,30,20,.035)]"><div className="text-[8px] font-bold text-[#A37849]">0{i+1}</div><h3 className="mt-7 text-[15px] font-semibold text-[#302D29]">{t}</h3><p className="mt-2 text-[10px] leading-5 text-[#7A756E]">{d}</p></article>)}</div></div></section>
    <section className="border-b border-white/[0.06] bg-[#171716] text-white"><div className="mx-auto grid max-w-[1320px] gap-12 px-5 py-20 sm:px-7 lg:grid-cols-[.72fr_1.28fr] lg:px-10 lg:py-24"><div><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#D6A66A]">Revenue architecture</p><h2 className="mt-3 text-[36px] font-medium leading-[1.04] tracking-[-0.045em] text-[#F7F4EF] sm:text-[48px]">{config.moneyTitle}</h2><p className="mt-5 max-w-lg text-[13px] leading-7 text-white/42">{config.moneyDescription}</p></div><div className="grid gap-3 sm:grid-cols-2">{config.money.map(([t,d],i)=><div key={t} className="rounded-[20px] border border-white/[0.08] bg-white/[0.025] p-5"><div className="text-[8px] font-bold text-[#D6A66A]">0{i+1}</div><div className="mt-6 text-[14px] font-semibold text-white/78">{t}</div><div className="mt-2 text-[9px] leading-5 text-white/34">{d}</div></div>)}</div></div></section>
    <section className="border-b border-black/[0.06] bg-[#FBFAF8]"><div className="mx-auto max-w-[1320px] px-5 py-16 sm:px-7 lg:px-10 lg:py-20"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[#9A744B]">Continue through Avantiqo</p><h2 className="mt-2 text-[30px] font-medium tracking-[-0.045em] text-[#1D1B18] sm:text-[38px]">One surface creates demand for the next.</h2></div><a href="/pricing" className="text-[10px] font-semibold text-[#8A633C]">See the commercial model →</a></div><div className="mt-8 grid gap-3 md:grid-cols-3">{(RELATED[config.art] || RELATED.pricing).map(([label,href,text],i)=><a key={href} href={href} className="group rounded-[22px] border border-black/[0.075] bg-white p-5 transition hover:-translate-y-0.5 hover:border-[#D6A66A]/35"><div className="flex items-center justify-between"><span className="text-[8px] font-bold text-[#A37849]">0{i+1}</span><Arrow className="h-3.5 w-3.5 text-[#B9AA95] transition group-hover:translate-x-0.5 group-hover:text-[#9A744B]"/></div><div className="mt-7 text-[14px] font-semibold text-[#302D29]">{label}</div><p className="mt-2 text-[10px] leading-5 text-[#7A756E]">{text}</p></a>)}</div></div></section>
    <section className="bg-[#F7F6F3]"><div className="mx-auto max-w-[1120px] px-5 py-20 text-center sm:px-7 lg:px-10 lg:py-24"><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9A744B]">Part of the Avantiqo economy</p><h2 className="mx-auto mt-4 max-w-4xl text-[38px] font-medium leading-[1.02] tracking-[-0.05em] sm:text-[52px]">{config.cta}</h2><div className="mt-8 flex flex-wrap justify-center gap-2.5"><a href={config.primaryHref || "/login"} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#171716] px-5 text-[11px] font-semibold text-white">{config.primary || "Enter Avantiqo"}<Arrow className="h-3.5 w-3.5"/></a><a href="/developers" className="inline-flex h-11 items-center rounded-xl border border-black/[0.09] bg-white px-5 text-[11px] font-semibold text-[#56514A]">Developer platform</a></div></div></section>
  </main>;
}
