import PublicSiteHeader from "@/components/public/PublicSiteHeader";
import PublicArtStage from "@/components/public/PublicArtStage";

function Arrow(){return <span aria-hidden="true">→</span>}

export default function MoneyLandingPage({config}){
  return <main className="min-h-screen bg-[#F7F6F3] text-[#171614]">
    <PublicSiteHeader context={config.context} audience={config.audience || "business"}/>
    <section className="relative overflow-hidden border-b border-black/[0.06] bg-[#F4F0E8]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(214,166,106,.16),transparent_31%)]"/>
      <div className="relative mx-auto grid max-w-[1540px] lg:min-h-[650px] lg:grid-cols-[47%_53%]">
        <div className="flex items-center px-5 py-16 sm:px-7 lg:px-10 lg:py-20 xl:px-14">
          <div className="max-w-[650px]">
            <p className="text-[9px] font-semibold uppercase tracking-[0.25em] text-[#9A744B]">{config.eyebrow}</p>
            <h1 className="mt-4 text-[50px] font-medium leading-[.96] tracking-[-0.06em] sm:text-[66px] lg:text-[72px]">{config.title}</h1>
            <p className="mt-7 max-w-[590px] text-[15px] leading-8 text-[#676159]">{config.lead}</p>
            <div className="mt-9 flex flex-wrap gap-2.5"><a href={config.primaryHref} className="inline-flex h-11 items-center gap-2 rounded-full bg-[#171614] px-5 text-[10px] font-semibold text-white">{config.primary}<Arrow/></a><a href="/pricing" className="inline-flex h-11 items-center rounded-full border border-[#D6A66A]/35 bg-white/72 px-5 text-[10px] font-semibold text-[#6A5540]">See pricing</a></div>
          </div>
        </div>
        <div className="relative min-h-[480px] overflow-hidden border-t border-black/[0.06] lg:min-h-0 lg:border-l lg:border-t-0">
          {config.artKind ? <PublicArtStage kind={config.artKind}/> : <>
            <div className="absolute inset-0 scale-[1.02] bg-cover bg-center" style={{backgroundImage:`url(${config.image})`}}/>
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(17,14,11,.04),rgba(17,14,11,.10)_45%,rgba(17,14,11,.62))]"/>
          </>}
          <div className="absolute bottom-7 left-7 right-7 rounded-[24px] border border-white/16 bg-[#15120f]/78 p-5 text-white shadow-[0_30px_80px_rgba(0,0,0,.28)] backdrop-blur-xl sm:left-auto sm:w-[460px]">
            <div className="text-[7px] font-semibold uppercase tracking-[0.20em] text-[#D6A66A]">{config.panelLabel}</div>
            <div className="mt-3 text-[16px] leading-6 text-white/88">{config.panel}</div>
            <div className="mt-5 flex flex-wrap gap-2">{config.tags.map(x=><span key={x} className="rounded-full border border-white/12 px-2.5 py-1 text-[6px] font-semibold tracking-[0.15em] text-white/48">{x}</span>)}</div>
          </div>
        </div>
      </div>
    </section>
    <section className="bg-[#FBFAF8]"><div className="mx-auto max-w-[1320px] px-5 py-20 sm:px-7 lg:px-10 lg:py-24"><p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-[#9A744B]">WHAT YOU CAN DO</p><h2 className="mt-3 max-w-3xl text-[38px] font-medium leading-[1.03] tracking-[-0.05em] sm:text-[52px]">{config.valueTitle}</h2><div className="mt-10 grid gap-3 md:grid-cols-3">{config.value.map(([t,d],i)=><article key={t} className="rounded-[24px] border border-black/[0.075] bg-white p-6"><div className="text-[8px] font-bold text-[#A37849]">0{i+1}</div><h3 className="mt-7 text-[17px] font-semibold text-[#302D29]">{t}</h3><p className="mt-3 text-[10px] leading-5 text-[#777169]">{d}</p></article>)}</div></div></section>
    <section className="border-y border-black/[0.06] bg-[#F3EFE7]"><div className="mx-auto max-w-[1320px] px-5 py-18 sm:px-7 lg:px-10 lg:py-22"><div className="grid gap-10 lg:grid-cols-[.72fr_1.28fr]"><div><p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-[#9A744B]">HOW IT WORKS</p><h2 className="mt-3 text-[36px] font-medium leading-[1.03] tracking-[-0.05em] sm:text-[48px]">From need to finished business outcome.</h2></div><div className="grid gap-3 sm:grid-cols-2">{config.steps.map(([t,d],i)=><div key={t} className="rounded-[20px] border border-[#D6A66A]/22 bg-white/68 p-5"><div className="text-[8px] font-bold text-[#A37849]">0{i+1}</div><div className="mt-5 text-[14px] font-semibold text-[#302D29]">{t}</div><div className="mt-2 text-[9px] leading-5 text-[#777169]">{d}</div></div>)}</div></div></div></section>
    <section className="bg-[#F7F6F3]"><div className="mx-auto max-w-[1120px] px-5 py-20 text-center sm:px-7 lg:px-10"><p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-[#9A744B]">AVANTIQO</p><h2 className="mx-auto mt-4 max-w-3xl text-[40px] font-medium leading-[1.02] tracking-[-0.05em] sm:text-[54px]">{config.cta}</h2><a href={config.primaryHref} className="mt-8 inline-flex h-11 items-center gap-2 rounded-full bg-[#171614] px-5 text-[10px] font-semibold text-white">{config.primary}<Arrow/></a></div></section>
  </main>;
}
