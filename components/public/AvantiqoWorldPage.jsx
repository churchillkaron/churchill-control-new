import PublicSiteHeader from "@/components/public/PublicSiteHeader";
import PublicArtStage from "@/components/public/PublicArtStage";

function Arrow({ className = "" }) {
  return <svg aria-hidden="true" viewBox="0 0 20 20" className={className} fill="none"><path d="M4 10h11M11 6l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export default function AvantiqoWorldPage({ config }) {
  const { context, eyebrow, title, intro, audience = "platform", tone = "light", image, artKind, sequence = [], capabilities = [], cta = "Start Now", ctaHref = "/start", secondary, secondaryHref } = config;
  const dark = tone === "dark";
  return (
    <main className={dark ? "min-h-screen bg-[#11110f] text-white" : "min-h-screen bg-[#f7f6f3] text-[#171614]"}>
      <PublicSiteHeader context={context} audience={audience} />
      <section className={dark ? "border-b border-white/[0.08] bg-[#11110f]" : "border-b border-black/[0.07] bg-[#f4f0e8]"}>
        <div className="mx-auto grid max-w-[1540px] lg:min-h-[720px] lg:grid-cols-[43%_57%]">
          <div className="flex items-center px-5 py-16 sm:px-7 lg:px-10 lg:py-20 xl:px-14">
            <div className="max-w-[650px]">
              <p className="text-[9px] font-semibold uppercase tracking-[0.28em] text-[#D6A66A]">{eyebrow}</p>
              <h1 className={dark ? "mt-5 text-[52px] font-medium leading-[.95] tracking-[-0.06em] text-white sm:text-[68px] lg:text-[78px]" : "mt-5 text-[52px] font-medium leading-[.95] tracking-[-0.06em] text-[#171614] sm:text-[68px] lg:text-[78px]"}>{title}</h1>
              <p className={dark ? "mt-7 max-w-xl text-[15px] leading-8 text-white/58" : "mt-7 max-w-xl text-[15px] leading-8 text-[#68635c]"}>{intro}</p>
              <div className="mt-9 flex flex-wrap gap-2.5">
                <a href={ctaHref} className={dark ? "inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-[10px] font-semibold text-[#171614]" : "inline-flex h-11 items-center gap-2 rounded-full bg-[#171614] px-5 text-[10px] font-semibold text-white"}>{cta}<Arrow className="h-3.5 w-3.5" /></a>
                {secondary ? <a href={secondaryHref} className={dark ? "inline-flex h-11 items-center rounded-full border border-white/[0.14] px-5 text-[10px] font-semibold text-white/70" : "inline-flex h-11 items-center rounded-full border border-black/[0.10] bg-white/70 px-5 text-[10px] font-semibold text-[#56514A]"}>{secondary}</a> : null}
              </div>
            </div>
          </div>
          <div className="relative min-h-[520px] overflow-hidden bg-[#171614] lg:min-h-0 lg:border-l lg:border-black/[0.08]">
            {artKind ? <PublicArtStage kind={artKind} /> : <>
              <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${image})` }} />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,.08),rgba(0,0,0,.18)_45%,rgba(8,7,6,.78))]" />
            </>}
            <div className="absolute left-7 top-7 text-[7px] font-semibold uppercase tracking-[0.24em] text-[#F1C98E]">AVANTIQO / {context}</div>
            <div className="absolute bottom-7 left-7 right-7 rounded-[22px] border border-white/[0.13] bg-[#11100E]/72 p-5 backdrop-blur-xl sm:p-6">
              <div className="text-[7px] font-semibold uppercase tracking-[0.20em] text-[#D6A66A]">OPERATING FLOW</div>
              <div className="mt-3 flex flex-wrap gap-x-3 gap-y-2 text-[10px] text-white/64">{sequence.map((item, i) => <span key={item} className="inline-flex items-center gap-3"><span>{item}</span>{i < sequence.length - 1 ? <span className="text-[#D6A66A]/60">→</span> : null}</span>)}</div>
            </div>
          </div>
        </div>
      </section>
      <section className={dark ? "bg-[#151411]" : "bg-[#fbfaf8]"}>
        <div className="mx-auto max-w-[1320px] px-5 py-16 sm:px-7 lg:px-10 lg:py-20">
          <div className="grid gap-px overflow-hidden rounded-[28px] border border-black/[0.07] bg-black/[0.07] sm:grid-cols-2 lg:grid-cols-3">
            {capabilities.map(([name, copy], i) => <div key={name} className={dark ? "bg-[#191713] p-6 sm:p-7" : "bg-white p-6 sm:p-7"}><div className="text-[7px] font-semibold uppercase tracking-[0.17em] text-[#A37849]">0{String(i + 1).padStart(2,"0")}</div><h2 className={dark ? "mt-4 text-[23px] font-medium tracking-[-0.04em] text-white" : "mt-4 text-[23px] font-medium tracking-[-0.04em] text-[#1D1B18]"}>{name}</h2><p className={dark ? "mt-3 text-[11px] leading-6 text-white/45" : "mt-3 text-[11px] leading-6 text-[#746F68]"}>{copy}</p></div>)}
          </div>
        </div>
      </section>
    </main>
  );
}
