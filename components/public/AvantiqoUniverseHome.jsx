import PublicSiteHeader from "@/components/public/PublicSiteHeader";

const WORLDS = [
  ["RUN", "Business OS", "/business", "Finance, operations, people, supply chain and commercial work in one governed operating system.", "/bg-hero-control.jpg"],
  ["THINK", "Intelligence", "/intelligence-platform", "Business Partner, agents, research, learning, insights and governed execution.", "/branding/avantiqo-intelligence-core-hero.webp"],
  ["CREATE", "Creative Studios", "/creative-studios", "Image, video and music production from objective to finished work.", "/art/creative-image.jpg"],
  ["SPEAK", "Voice", "/voice", "Speech recognition, realtime voice, TTS, production and telephony.", "/art/creative-music.jpg"],
  ["BUILD", "Code", "/code", "Understand, plan, build, test, integrate and verify software work.", "/art/developer-work.jpg"],
  ["PROCESS", "Documents", "/documents", "OCR, extraction, classification, validation and document intelligence.", "/art/commercial-integrations.jpg"],
  ["CONNECT", "API & Channels", "/api-platform", "Capabilities, jobs, integrations, commerce and customer-facing surfaces.", "/art/commercial-channels.jpg"],
  ["COMPUTE", "Infrastructure", "/compute", "Owned GPU capacity, inference, rendering, batch and governed overflow.", "/art/commercial-compute.jpg"],
];

function Arrow(){return <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none"><path d="M4 10h11M11 6l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}

export default function AvantiqoUniverseHome(){
  return <main className="min-h-screen bg-[#F7F6F3] text-[#171614]">
    <PublicSiteHeader context="Avantiqo" audience="platform" />
    <section className="relative overflow-hidden border-b border-black/[0.07] bg-[#F4F0E8]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_0%,rgba(214,166,106,.16),transparent_32%)]" />
      <div className="relative mx-auto grid max-w-[1540px] lg:min-h-[760px] lg:grid-cols-[46%_54%]">
        <div className="flex items-center px-5 py-16 sm:px-7 lg:px-10 lg:py-20 xl:px-14">
          <div className="max-w-[680px]">
            <p className="text-[9px] font-semibold uppercase tracking-[0.30em] text-[#9A744B]">AVANTIQO / INTELLIGENT OPERATING PLATFORM</p>
            <h1 className="mt-5 text-[56px] font-medium leading-[.92] tracking-[-0.065em] sm:text-[72px] lg:text-[84px]">Run. Think. Create. Build.</h1>
            <p className="mt-7 max-w-[620px] text-[16px] leading-8 text-[#625F59]">One platform for business operations, intelligence, creative production, voice, code, documents, APIs and compute — with shared identity, context, Wallet, execution and evidence underneath.</p>
            <div className="mt-9 flex flex-wrap gap-2.5"><a href="/start" className="inline-flex h-11 items-center gap-2 rounded-full bg-[#171614] px-5 text-[10px] font-semibold text-white">Start Now <Arrow/></a><a href="#worlds" className="inline-flex h-11 items-center rounded-full border border-black/[0.10] bg-white/70 px-5 text-[10px] font-semibold text-[#56514A]">Explore Avantiqo</a></div>
          </div>
        </div>
        <div className="relative min-h-[560px] overflow-hidden bg-[#151310] lg:min-h-0 lg:border-l lg:border-black/[0.08]">
          <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-px bg-[#D6A66A]/15">
            {["/bg-hero-control.jpg","/art/creative-image.jpg","/art/developer-work.jpg","/art/commercial-compute.jpg"].map((src,i)=><div key={src} className="relative overflow-hidden"><div className="absolute inset-0 bg-cover bg-center" style={{backgroundImage:`url(${src})`}}/><div className="absolute inset-0 bg-black/25"/><div className="absolute bottom-4 left-4 text-[7px] font-semibold uppercase tracking-[0.18em] text-[#E9CAA0]">{["BUSINESS","CREATE","BUILD","COMPUTE"][i]}</div></div>)}
          </div>
          <div className="absolute inset-x-7 bottom-7 rounded-[22px] border border-white/[0.13] bg-[#11100E]/78 p-5 text-white backdrop-blur-xl"><div className="text-[7px] font-semibold uppercase tracking-[0.20em] text-[#D6A66A]">ONE AVANTIQO CORE</div><div className="mt-3 flex flex-wrap gap-2 text-[8px] text-white/50">{["Identity","Organization","Context","Capabilities","Intelligence","Wallet","Execution","Evidence","Billing"].map(x=><span key={x} className="rounded-full border border-white/[0.10] px-2.5 py-1.5">{x}</span>)}</div></div>
        </div>
      </div>
    </section>
    <section id="worlds" className="bg-[#FBFAF8]"><div className="mx-auto max-w-[1320px] px-5 py-16 sm:px-7 lg:px-10 lg:py-24"><div className="mb-10 max-w-3xl"><p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-[#9A744B]">THE AVANTIQO WORLD</p><h2 className="mt-3 text-[38px] font-medium leading-[1.02] tracking-[-0.05em] sm:text-[52px]">Enter through the capability you need.</h2></div><div className="grid gap-3 md:grid-cols-2">{WORLDS.map(([verb,name,href,copy,image])=><a key={name} href={href} className="group grid min-h-[270px] overflow-hidden rounded-[26px] border border-black/[0.075] bg-white shadow-[0_16px_45px_rgba(30,24,18,.035)] sm:grid-cols-[42%_58%]"><div className="relative min-h-[180px] overflow-hidden bg-[#171614]"><div className="absolute inset-0 bg-cover bg-center transition duration-700 group-hover:scale-[1.03]" style={{backgroundImage:`url(${image})`}}/><div className="absolute inset-0 bg-black/24"/><div className="absolute left-5 top-5 text-[7px] font-semibold uppercase tracking-[0.18em] text-[#F1C98E]">{verb}</div></div><div className="flex flex-col justify-between p-6 sm:p-7"><div><div className="text-[8px] font-semibold uppercase tracking-[0.16em] text-[#A37849]">AVANTIQO / {name}</div><h3 className="mt-4 text-[28px] font-medium tracking-[-0.045em]">{name}</h3><p className="mt-3 text-[11px] leading-6 text-[#746F68]">{copy}</p></div><div className="mt-6 inline-flex items-center gap-2 text-[10px] font-semibold text-[#8A633C]">Explore <Arrow/></div></div></a>)}</div></div></section>
  </main>;
}
