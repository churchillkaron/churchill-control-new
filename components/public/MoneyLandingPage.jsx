import PublicSiteHeader from "@/components/public/PublicSiteHeader";

function Arrow(){return <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none"><path d="M4 10h11M11 6l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}

function StepRail({ steps, dark = false }) {
  return <div className={dark ? "border-t border-white/[.10]" : "border-t border-black/[.08]"}>
    {steps.map(([title,detail],index)=><div key={title} className={`grid gap-3 py-5 sm:grid-cols-[48px_170px_1fr] sm:items-start ${dark ? "border-b border-white/[.10]" : "border-b border-black/[.08]"}`}>
      <div className={dark ? "text-[8px] font-bold text-[#D6A66A]" : "text-[8px] font-bold text-[#A37849]"}>0{index+1}</div>
      <div className={dark ? "text-[13px] font-semibold text-white/82" : "text-[13px] font-semibold text-[#302D29]"}>{title}</div>
      <div className={dark ? "text-[9px] leading-5 text-white/38" : "text-[9px] leading-5 text-[#777169]"}>{detail}</div>
    </div>)}
  </div>;
}

export default function MoneyLandingPage({config}){
  const creative = config.audience === "creative";
  const compute = config.audience === "compute";
  const dark = creative || compute;
  const industry = ["restaurant","hotel"].includes(config.artKind);
  const docs = config.artKind === "documents";
  const agents = config.artKind === "agents";
  const headerTone = dark ? "dark" : "light";
  const modeLabel = creative ? "PRODUCTION WORKFLOW" : compute ? "WORKLOAD EXECUTION" : industry ? "INDUSTRY OPERATING FLOW" : docs ? "DOCUMENT-TO-WORKFLOW" : agents ? "CONTROLLED INTELLIGENCE" : "CONNECTED BUSINESS WORK";

  return <main className={dark ? "min-h-screen bg-[#11100F] text-white" : "min-h-screen bg-[#F7F3EC] text-[#171614]"}>
    <PublicSiteHeader context={config.context} audience={config.audience || "business"} tone={headerTone}/>

    <section className={dark ? "relative overflow-hidden border-b border-white/[.08] bg-[#11100F]" : "relative overflow-hidden border-b border-[#CFC5B8]/45 bg-[linear-gradient(180deg,#F8F2E9_0%,#EEE2D3_100%)]"}>
      {dark ? <><div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_72%_28%,rgba(214,166,106,.12),transparent_27%),linear-gradient(180deg,#131210_0%,#0C0B0A_100%)]"/><div className="pointer-events-none absolute bottom-0 left-0 right-0 h-[22%] bg-[radial-gradient(ellipse_at_65%_100%,rgba(214,166,106,.09),transparent_58%)]"/></> : <><div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_10%,rgba(255,255,255,.92),transparent_31%),radial-gradient(circle_at_78%_38%,rgba(214,166,106,.10),transparent_28%)]"/><div className="pointer-events-none absolute -right-[15vw] -top-[34vw] hidden h-[68vw] w-[68vw] rounded-full border border-[#C99A62]/16 bg-[radial-gradient(circle_at_30%_70%,rgba(255,252,247,.96),rgba(224,208,188,.70)_29%,rgba(163,133,98,.18)_58%,transparent_72%)] lg:block"/></>}
      <div className="relative mx-auto grid max-w-[1540px] gap-8 px-5 py-14 sm:px-7 lg:min-h-[650px] lg:grid-cols-[.88fr_1.12fr] lg:items-center lg:px-10 lg:py-20 xl:px-14">
        <div className="relative z-10 max-w-[670px]">
          <div className={dark ? "inline-flex items-center gap-2 rounded-full border border-[#D6A66A]/24 bg-white/[.035] px-3 py-1.5 text-[7px] font-semibold uppercase tracking-[.18em] text-[#E7C18C]" : "inline-flex items-center gap-2 rounded-full border border-[#B98A52]/26 bg-white/54 px-3 py-1.5 text-[7px] font-semibold uppercase tracking-[.18em] text-[#8A633C]"}><span className="h-1.5 w-1.5 rounded-full bg-[#B98548]"/>{modeLabel}</div>
          <p className={dark ? "mt-8 text-[9px] font-semibold uppercase tracking-[.25em] text-[#D6A66A]" : "mt-8 text-[9px] font-semibold uppercase tracking-[.25em] text-[#9A744B]"}>{config.eyebrow}</p>
          <h1 className={dark ? "mt-4 text-[50px] font-medium leading-[.95] tracking-[-0.06em] text-[#F6F1E9] sm:text-[66px] lg:text-[72px]" : "mt-4 text-[50px] font-medium leading-[.95] tracking-[-0.06em] text-[#171614] sm:text-[66px] lg:text-[72px]"}>{config.title}</h1>
          <p className={dark ? "mt-7 max-w-[610px] text-[15px] leading-8 text-white/48" : "mt-7 max-w-[610px] text-[15px] leading-8 text-[#676159]"}>{config.lead}</p>
          <div className="mt-9 flex flex-wrap gap-2.5"><a href={config.primaryHref} className={dark ? "inline-flex h-11 items-center gap-2 rounded-full bg-[#E6C08A] px-5 text-[10px] font-semibold text-[#1B1713] transition hover:-translate-y-0.5" : "inline-flex h-11 items-center gap-2 rounded-full bg-[#211C17] px-5 text-[10px] font-semibold text-white transition hover:-translate-y-0.5"}>{config.primary}<Arrow/></a><a href="/pricing" className={dark ? "inline-flex h-11 items-center rounded-full border border-white/[.14] bg-white/[.025] px-5 text-[10px] font-semibold text-white/68" : "inline-flex h-11 items-center rounded-full border border-[#B98A52]/30 bg-white/58 px-5 text-[10px] font-semibold text-[#6A5540]"}>See pricing</a></div>
          <div className={dark ? "mt-9 flex flex-wrap gap-2 border-t border-white/[.08] pt-5" : "mt-9 flex flex-wrap gap-2 border-t border-black/[.07] pt-5"}>{config.tags.map(x=><span key={x} className={dark ? "rounded-full border border-white/[.10] bg-white/[.02] px-2.5 py-1 text-[6px] font-semibold tracking-[.15em] text-white/42" : "rounded-full border border-[#B98A52]/22 bg-white/48 px-2.5 py-1 text-[6px] font-semibold tracking-[.15em] text-[#755D45]"}>{x}</span>)}</div>
        </div>

        <div className={dark ? "relative min-h-[500px] overflow-hidden rounded-[30px] border border-white/[.10] bg-[#0D0C0B] shadow-[0_34px_95px_rgba(0,0,0,.34)]" : "relative min-h-[500px] overflow-hidden rounded-[30px] border border-black/[0.07] bg-[#E9DFD1] shadow-[0_34px_95px_rgba(68,47,25,.12)]"}>
          <div className={`absolute inset-0 bg-cover transition duration-700 ${industry ? "scale-[1.03] bg-center" : "scale-[1.015] bg-center"}`} style={{backgroundImage:`url(${config.image})`}}/>
          <div className={dark ? "absolute inset-0 bg-[linear-gradient(180deg,rgba(7,7,7,.02),rgba(7,7,7,.08)_48%,rgba(7,7,7,.68))]" : "absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,.01),rgba(20,15,10,.02)_52%,rgba(20,15,10,.26))]"}/>
          <div className={dark ? "absolute left-5 top-5 rounded-full border border-white/[.14] bg-black/36 px-3 py-1.5 text-[7px] font-semibold uppercase tracking-[.20em] text-[#F0C98F] backdrop-blur-xl" : "absolute left-5 top-5 rounded-full border border-white/68 bg-[#F8F0E6]/74 px-3 py-1.5 text-[7px] font-semibold uppercase tracking-[.20em] text-[#8D6339] backdrop-blur-xl"}>AVANTIQO / {config.context}</div>
          <div className={dark ? "absolute bottom-5 left-5 right-5 rounded-[22px] border border-white/[.12] bg-[#11100E]/84 p-5 text-white backdrop-blur-xl sm:p-6" : "absolute bottom-5 left-5 right-5 rounded-[22px] border border-white/72 bg-[#F8F1E8]/90 p-5 text-[#2B251F] backdrop-blur-xl sm:p-6"}>
            <div className={dark ? "text-[7px] font-semibold uppercase tracking-[.20em] text-[#D6A66A]" : "text-[7px] font-semibold uppercase tracking-[.20em] text-[#A36F39]"}>{config.panelLabel}</div>
            <div className={dark ? "mt-3 max-w-2xl text-[15px] leading-6 text-white/72" : "mt-3 max-w-2xl text-[15px] leading-6 text-[#4B433A]"}>{config.panel}</div>
          </div>
        </div>
      </div>
    </section>

    <section className={dark ? "border-b border-white/[.07] bg-[#151412]" : "border-b border-[#CFC5B8]/40 bg-[#FBFAF8]"}>
      <div className="mx-auto max-w-[1320px] px-5 py-18 sm:px-7 lg:px-10 lg:py-24">
        <div className="grid gap-10 lg:grid-cols-[.68fr_1.32fr] lg:items-end"><div><p className={dark ? "text-[9px] font-semibold uppercase tracking-[.22em] text-[#D6A66A]" : "text-[9px] font-semibold uppercase tracking-[.22em] text-[#9A744B]"}>WHAT THIS SOLVES</p><h2 className={dark ? "mt-3 max-w-xl text-[38px] font-medium leading-[1.02] tracking-[-.05em] text-[#F5EFE7] sm:text-[50px]" : "mt-3 max-w-xl text-[38px] font-medium leading-[1.02] tracking-[-.05em] sm:text-[50px]"}>{config.valueTitle}</h2></div><p className={dark ? "max-w-xl text-[11px] leading-6 text-white/38 lg:justify-self-end" : "max-w-xl text-[11px] leading-6 text-[#706A62] lg:justify-self-end"}>{config.panel}</p></div>
        <div className="mt-10 grid gap-3 md:grid-cols-3">{config.value.map(([t,d],i)=><article key={t} className={dark ? "rounded-[24px] border border-white/[.08] bg-white/[.025] p-6" : "rounded-[24px] border border-black/[.07] bg-white p-6 shadow-[0_12px_36px_rgba(48,35,22,.035)]"}><div className={dark ? "text-[8px] font-bold text-[#D6A66A]" : "text-[8px] font-bold text-[#A37849]"}>0{i+1}</div><h3 className={dark ? "mt-7 text-[17px] font-semibold text-white/82" : "mt-7 text-[17px] font-semibold text-[#302D29]"}>{t}</h3><p className={dark ? "mt-3 text-[10px] leading-5 text-white/35" : "mt-3 text-[10px] leading-5 text-[#777169]"}>{d}</p></article>)}</div>
      </div>
    </section>

    <section className={dark ? "border-b border-white/[.07] bg-[#0E0D0C]" : "border-b border-[#CFC5B8]/45 bg-[#F1E8DC]"}>
      <div className="mx-auto grid max-w-[1320px] gap-12 px-5 py-18 sm:px-7 lg:grid-cols-[.72fr_1.28fr] lg:px-10 lg:py-24">
        <div><p className={dark ? "text-[9px] font-semibold uppercase tracking-[.22em] text-[#D6A66A]" : "text-[9px] font-semibold uppercase tracking-[.22em] text-[#9A744B]"}>HOW IT WORKS</p><h2 className={dark ? "mt-3 text-[36px] font-medium leading-[1.03] tracking-[-.05em] text-[#F5EFE7] sm:text-[48px]" : "mt-3 text-[36px] font-medium leading-[1.03] tracking-[-.05em] sm:text-[48px]"}>From the first input to a finished, accountable outcome.</h2><p className={dark ? "mt-5 max-w-md text-[11px] leading-6 text-white/36" : "mt-5 max-w-md text-[11px] leading-6 text-[#706A62]"}>The page keeps the actual workflow visible so the product is understood as a process, not a magic button.</p></div>
        <StepRail steps={config.steps} dark={dark}/>
      </div>
    </section>

    <section className={dark ? "bg-[#151412]" : "bg-[#F7F3EC]"}><div className="mx-auto max-w-[1120px] px-5 py-20 text-center sm:px-7 lg:px-10 lg:py-24"><p className={dark ? "text-[9px] font-semibold uppercase tracking-[.22em] text-[#D6A66A]" : "text-[9px] font-semibold uppercase tracking-[.22em] text-[#9A744B]"}>AVANTIQO</p><h2 className={dark ? "mx-auto mt-4 max-w-3xl text-[40px] font-medium leading-[1.02] tracking-[-.05em] text-[#F5EFE7] sm:text-[54px]" : "mx-auto mt-4 max-w-3xl text-[40px] font-medium leading-[1.02] tracking-[-.05em] sm:text-[54px]"}>{config.cta}</h2><a href={config.primaryHref} className={dark ? "mt-8 inline-flex h-11 items-center gap-2 rounded-full bg-[#E6C08A] px-5 text-[10px] font-semibold text-[#1B1713]" : "mt-8 inline-flex h-11 items-center gap-2 rounded-full bg-[#211C17] px-5 text-[10px] font-semibold text-white"}>{config.primary}<Arrow/></a></div></section>
  </main>;
}
