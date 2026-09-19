import PublicSiteHeader from "@/components/public/PublicSiteHeader";
import PublicArtStage from "@/components/public/PublicArtStage";

function Arrow(){return <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none"><path d="M4 10h11M11 6l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}

function ProductArt({ config }) {
  const kind = config.slug === "finance" ? "finance" : config.slug === "workforce" ? "workforce" : config.slug === "inventory" ? "inventory" : "intelligence";
  return <div className="absolute inset-0 overflow-hidden bg-[#171614] text-white">
    <PublicArtStage kind={kind} />
    <div className="absolute bottom-[7%] left-[7%] right-[7%] rounded-[22px] border border-white/[.11] bg-[#15120F]/78 p-4 text-white shadow-[0_26px_70px_rgba(0,0,0,.28)] backdrop-blur-xl">
      <div className="flex items-center justify-between"><div className="text-[7px] font-semibold uppercase tracking-[.18em] text-[#D6A66A]">CONNECTED WORKFLOW</div><div className="text-[6px] uppercase tracking-[.16em] text-white/28">{config.context}</div></div>
      <div className="mt-4 grid grid-cols-4 gap-2">{config.flow.map(([no,title,detail],i)=><div key={title} className="relative rounded-[13px] border border-white/[.07] bg-black/16 px-3 py-3"><div className="text-[6px] text-[#D6A66A]">{no}</div><div className="mt-2 text-[7px] font-semibold tracking-[.11em] text-white/66">{title}</div><div className="mt-1 text-[6px] text-white/28">{detail}</div>{i<3?<span className="absolute -right-[7px] top-1/2 z-10 h-px w-3 bg-[#D6A66A]/60"/>:null}</div>)}</div>
    </div>
  </div>;
}
export default function ProductLandingPage({ config }) {
  return <main className="min-h-screen bg-[#F7F6F3] text-[#171614]">
    <PublicSiteHeader context={config.context} audience="business" />
    <section className="relative overflow-hidden border-b border-[#BDAF9E]/30 bg-[#F4F0E8]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_14%_0%,rgba(214,166,106,.16),transparent_30%)]" />
      <div className="relative mx-auto grid max-w-[1540px] lg:min-h-[720px] lg:grid-cols-[43%_57%]">
        <div className="flex items-center px-5 py-16 sm:px-7 lg:px-10 lg:py-20 xl:px-14"><div className="max-w-[620px]">
          <div className="inline-flex rounded-full border border-[#D6A66A]/28 bg-[#FBFAF8] px-3 py-1.5 text-[8px] font-semibold uppercase tracking-[.18em] text-[#8A633C]">Avantiqo · {config.context}</div>
          <p className="mt-9 text-[9px] font-semibold uppercase tracking-[.24em] text-[#A07142]">{config.eyebrow}</p>
          <h1 className="mt-4 text-[52px] font-medium leading-[.95] tracking-[-.065em] sm:text-[66px] lg:text-[72px]">{config.title}</h1>
          <p className="mt-7 max-w-[560px] text-[16px] leading-8 text-[#625D55]">{config.description}</p>
          <p className="mt-4 text-[10px] font-semibold uppercase tracking-[.15em] text-[#9A744B]">{config.audience}</p>
          <div className="mt-9 flex flex-wrap gap-2.5"><a href="/start" className="inline-flex h-11 items-center gap-2 rounded-full bg-[#F3EEE5] px-5 text-[10px] font-semibold text-[#2F2A25]">Start with {config.context} <Arrow/></a><a href="#product" className="inline-flex h-11 items-center rounded-full border border-[#BDAF9E]/40 bg-[#FBFAF8] px-5 text-[10px] font-semibold text-[#56514A]">See what is included</a></div>
        </div></div>
        <div className="relative min-h-[580px] overflow-hidden border-t border-[#BDAF9E]/30 lg:min-h-0 lg:border-l lg:border-t-0"><ProductArt config={config}/></div>
      </div>
    </section>
    <section id="product" className="border-b border-[#BDAF9E]/30 bg-[#FBFAF8]"><div className="mx-auto max-w-[1320px] px-5 py-18 sm:px-7 lg:px-10 lg:py-24">
      <div className="grid gap-8 lg:grid-cols-[.72fr_1.28fr] lg:items-end"><div><p className="text-[9px] font-semibold uppercase tracking-[.22em] text-[#9A744B]">THE PRODUCT</p><h2 className="mt-3 text-[38px] font-medium leading-[1.02] tracking-[-.05em] sm:text-[52px]">Everything you need for this job. Nothing you do not.</h2></div><p className="max-w-2xl text-[13px] leading-7 text-[#706A62] lg:justify-self-end">{config.promise}</p></div>
      <div className="mt-10 grid gap-3 md:grid-cols-2 lg:grid-cols-3">{config.features.map(([title,text],i)=><article key={title} className="rounded-[24px] border border-[#BDAF9E]/35 bg-white p-5 shadow-[0_12px_38px_rgba(45,32,20,.035)]"><div className="text-[8px] font-bold text-[#A37849]">0{i+1}</div><h3 className="mt-7 text-[16px] font-semibold text-[#2F2A25]">{title}</h3><p className="mt-2 text-[10px] leading-5 text-[#7A756E]">{text}</p></article>)}</div>
    </div></section>
    <section className="border-b border-[#BDAF9E]/30 bg-[#F3EFE7]"><div className="mx-auto max-w-[1320px] px-5 py-18 sm:px-7 lg:px-10 lg:py-24">
      <div className="mb-9"><p className="text-[9px] font-semibold uppercase tracking-[.22em] text-[#9A744B]">CHOOSE THE FIT</p><h2 className="mt-3 text-[38px] font-medium leading-[1.02] tracking-[-.05em] sm:text-[52px]">Start with the level that fits your operation.</h2></div>
      <div className="grid gap-3 lg:grid-cols-3">{config.tiers.map(([name,who,items],i)=><div key={name} className={`rounded-[26px] border p-6 ${i===1?"border-[#D6A66A]/50 bg-[#F3EEE5] text-[#2F2A25] shadow-[0_26px_70px_rgba(30,22,15,.14)]":"border-[#BDAF9E]/35 bg-[#FBFAF8]"}`}><div className="text-[8px] font-bold text-[#D6A66A]">0{i+1}</div><div className={`mt-8 text-[18px] font-semibold ${i===1?"text-[#2F2A25]":"text-[#2F2A25]"}`}>{name}</div><div className={`mt-2 text-[10px] ${i===1?"text-[#7A756E]":"text-[#847C72]"}`}>{who}</div><div className={`mt-8 border-t pt-4 text-[10px] leading-6 ${i===1?"border-[#BDAF9E]/35 text-[#6F675E]":"border-[#BDAF9E]/35 text-[#6F6961]"}`}>{items}</div></div>)}</div>
    </div></section>
    <section className="bg-[#171614] text-white"><div className="mx-auto max-w-[1120px] px-5 py-20 text-center sm:px-7 lg:px-10 lg:py-28"><p className="text-[9px] font-semibold uppercase tracking-[.22em] text-[#D6A66A]">GROW WITHOUT STARTING OVER</p><h2 className="mx-auto mt-4 max-w-4xl text-[42px] font-medium leading-[1.00] tracking-[-.055em] sm:text-[58px]">Start with {config.context}. Add more Avantiqo when your business needs it.</h2><p className="mx-auto mt-5 max-w-2xl text-[13px] leading-7 text-white/45">Your people, customers and business records stay connected as you add Finance, Inventory, Customer Operations, Creative, Intelligence or other Avantiqo products.</p><div className="mt-8 flex flex-wrap justify-center gap-2.5"><a href="/start" className="inline-flex h-11 items-center rounded-full bg-[#D6A66A] px-5 text-[10px] font-semibold text-[#3F3327]">Start now →</a><a href="/business" className="inline-flex h-11 items-center rounded-full border border-white/20 px-5 text-[10px] font-semibold text-white/80">Explore Business OS</a></div></div></section>
  </main>;
}
