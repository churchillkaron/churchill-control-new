import Image from "next/image";

export const metadata = {
  title: "Creative Studios | Avantiqo",
  description: "Avantiqo Creative Studios combines research, direction, creation, review, repair and delivery across image, video and music production.",
};

const studios = [
  {
    name: "Image Studio",
    kicker: "Brands. Products. Worlds.",
    description: "From brief to campaign-ready visual systems. Research, concept, art direction, generation, critique, repair, typography and final delivery in one production flow.",
    capabilities: ["Campaign systems", "Brand assets", "Product visuals", "Art direction", "Quality review"],
    accent: "from-[#46d7ff]/30 via-[#705bff]/20 to-transparent",
    glow: "bg-[#40c8ff]/25",
    code: "IMAGE",
  },
  {
    name: "Video Studio",
    kicker: "Stories that move business.",
    description: "From idea to finished film. Story, treatment, shot design, continuity, generation, dailies, repair, edit, VFX, sound and final master.",
    capabilities: ["Brand films", "Product films", "Campaign video", "Shot planning", "Post-production"],
    accent: "from-[#7f62ff]/32 via-[#e65cae]/18 to-transparent",
    glow: "bg-[#8d6bff]/25",
    code: "VIDEO",
  },  {
    name: "Music Studio",
    kicker: "Sound with intent.",
    description: "A full audio production environment for original music, editing, remixing, extension, stems, vocal work, SFX, mixing, mastering and release-ready output.",
    capabilities: ["Original music", "SFX + Foley", "Mix + master", "Remix + extend", "Stem workflows"],
    accent: "from-[#ff5d9c]/28 via-[#ff9d62]/18 to-transparent",
    glow: "bg-[#ff5f9b]/25",
    code: "MUSIC",
  },
];

const process = [
  ["01", "Brief", "Objective, audience, constraints"],
  ["02", "Research", "Context, references, market"],
  ["03", "Direction", "Concept, story, visual language"],
  ["04", "Creation", "Production across selected engines"],
  ["05", "Review", "Critique, continuity, quality"],
  ["06", "Repair", "Targeted correction and refinement"],
  ["07", "Deliver", "Final assets, masters and variants"],
];

function Arrow({ className = "" }) {
  return <svg aria-hidden="true" viewBox="0 0 20 20" className={className} fill="none"><path d="M4 10h11M11 6l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function Play() {
  return <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none"><path d="m7.2 5.5 7 4.5-7 4.5v-9Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>;
}function Waveform() {
  const bars = [14,24,37,18,46,29,55,34,68,44,31,57,75,49,39,61,28,52,41,66,35,48,24,43,18,32,15];
  return (
    <div className="flex h-20 items-end gap-[3px] opacity-80" aria-hidden="true">
      {bars.map((height, index) => (
        <span key={index} className="w-[3px] rounded-full bg-gradient-to-t from-[#63D7FF] via-[#A57BFF] to-[#FF6BA7]" style={{ height: `${height}%` }} />
      ))}
    </div>
  );
}

function StudioVisual({ studio, index }) {
  return (
    <div className="relative min-h-[245px] overflow-hidden rounded-[28px] border border-white/[0.09] bg-[#0b0d12]">
      <div className={`absolute inset-0 bg-gradient-to-br ${studio.accent}`} />
      <div className={`absolute -right-10 -top-10 h-40 w-40 rounded-full blur-3xl ${studio.glow}`} />
      <div className="absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-black/75 to-transparent" />
      {index === 0 && <div className="absolute right-10 top-7 h-40 w-40 rounded-[38%_62%_52%_48%] border border-[#79ddff]/30 bg-[radial-gradient(circle_at_42%_35%,rgba(106,218,255,.9),rgba(94,85,210,.45)_38%,rgba(5,9,16,.25)_72%)] shadow-[0_0_80px_rgba(90,193,255,.22)]" />}
      {index === 1 && <div className="absolute right-6 top-8 h-36 w-52 rotate-[-4deg] rounded-2xl border border-white/15 bg-[linear-gradient(135deg,rgba(28,34,53,.95),rgba(5,7,11,.85))] shadow-[0_20px_80px_rgba(119,87,255,.25)]"><div className="absolute inset-3 rounded-xl border border-white/10 bg-[radial-gradient(circle_at_70%_35%,rgba(110,86,255,.7),transparent_28%),linear-gradient(145deg,#09131f,#171223)]" /><div className="absolute -bottom-5 left-1/2 h-5 w-px bg-white/20" /></div>}
      {index === 2 && <div className="absolute right-8 top-8 w-52"><Waveform /></div>}
      <div className="absolute left-5 top-5 rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-[8px] font-semibold tracking-[0.18em] text-white/50">{studio.code}</div>
      <div className="absolute bottom-5 left-5 right-5"><div className="h-px bg-gradient-to-r from-white/35 via-white/8 to-transparent" /><div className="mt-3 flex items-center justify-between text-[8px] uppercase tracking-[0.16em] text-white/35"><span>Creative production system</span><span>Avantiqo</span></div></div>
    </div>
  );
}export default function CreativeStudiosPage() {
  return (
    <main className="min-h-screen bg-[#07090d] text-white">
      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#07090d]/90 backdrop-blur-2xl">
        <div className="mx-auto flex h-[68px] max-w-[1500px] items-center justify-between px-5 sm:px-7 lg:px-10">
          <a href="/" className="flex items-center gap-3" aria-label="Avantiqo home">
            <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl border border-white/[0.08] bg-black/40 p-1.5">
              <Image src="/branding/avantiqo-logo.png" alt="Avantiqo" width={36} height={36} className="h-full w-full object-contain" priority />
            </span>
            <div><div className="text-[12px] font-semibold tracking-[0.02em]">Avantiqo</div><div className="mt-0.5 text-[7px] font-semibold uppercase tracking-[0.2em] text-[#A88DFF]">Creative Studios</div></div>
          </a>
          <nav className="flex items-center gap-1">
            <a href="#studios" className="hidden rounded-lg px-3 py-2 text-[10px] text-white/50 transition hover:text-white md:inline-flex">Studios</a>
            <a href="#process" className="hidden rounded-lg px-3 py-2 text-[10px] text-white/50 transition hover:text-white md:inline-flex">Process</a>
            <a href="/developers" className="hidden rounded-lg px-3 py-2 text-[10px] text-white/50 transition hover:text-white lg:inline-flex">Developers</a>
            <a href="/login" className="ml-1 inline-flex h-9 items-center gap-2 rounded-xl border border-[#9879ff]/30 bg-[#8c6cff]/12 px-4 text-[10px] font-semibold text-[#d8ceff] transition hover:border-[#a98fff]/60 hover:bg-[#8c6cff]/18">Enter Avantiqo <Arrow className="h-3 w-3" /></a>
          </nav>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-white/[0.06]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_72%_26%,rgba(99,84,255,.26),transparent_28%),radial-gradient(circle_at_88%_52%,rgba(244,73,156,.18),transparent_28%),radial-gradient(circle_at_18%_28%,rgba(48,205,255,.12),transparent_28%)]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[620px] bg-[linear-gradient(115deg,rgba(8,12,18,.25),rgba(8,10,15,.96)_44%,rgba(8,10,15,.15))]" />
        <div className="relative mx-auto grid max-w-[1500px] gap-14 px-5 pb-20 pt-20 sm:px-7 lg:grid-cols-[.88fr_1.12fr] lg:items-center lg:px-10 lg:pb-28 lg:pt-28 xl:gap-20">
          <div className="max-w-[690px]">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#9d83ff]/25 bg-[#8e70ff]/[0.08] px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.19em] text-[#b9a7ff]"><span className="h-1.5 w-1.5 rounded-full bg-[#9b80ff] shadow-[0_0_16px_rgba(155,128,255,.9)]" />Avantiqo Creative Studios</div>
            <h1 className="mt-7 text-[54px] font-medium leading-[0.94] tracking-[-0.065em] text-[#f8f7ff] sm:text-[70px] lg:text-[82px] xl:text-[92px]">From imagination to <span className="bg-gradient-to-r from-[#62d8ff] via-[#a781ff] to-[#ff6fa9] bg-clip-text text-transparent">real-world impact.</span></h1>
            <p className="mt-8 max-w-2xl text-[17px] leading-8 text-white/66 sm:text-[19px]">Professional creative production systems built for business. Not simple generators. Avantiqo takes work from brief to final delivery with research, direction, creation, review, repair and commercial quality built in.</p>
            <div className="mt-9 flex flex-wrap gap-3"><a href="#studios" className="inline-flex h-12 items-center gap-2 rounded-xl bg-gradient-to-r from-[#7f8dff] to-[#b274ff] px-5 text-[11px] font-semibold text-white shadow-[0_12px_40px_rgba(126,96,255,.28)] transition hover:-translate-y-0.5">Explore the studios <Arrow className="h-3.5 w-3.5" /></a><a href="#process" className="inline-flex h-12 items-center gap-2 rounded-xl border border-white/[0.12] bg-white/[0.035] px-5 text-[11px] font-semibold text-white/74"><Play />See how it works</a></div>
          </div>          <div className="relative min-h-[470px] lg:min-h-[560px]">
            <div className="absolute inset-0 rounded-[34px] border border-white/[0.08] bg-[linear-gradient(145deg,rgba(255,255,255,.045),rgba(255,255,255,.012))] shadow-[0_50px_140px_rgba(0,0,0,.45)]" />
            <div className="absolute left-[8%] top-[8%] h-[68%] w-[62%] rounded-[42%_58%_54%_46%] bg-[radial-gradient(circle_at_42%_36%,rgba(110,220,255,.88),rgba(91,73,219,.46)_38%,rgba(8,10,16,.08)_72%)] blur-[1px] shadow-[0_0_100px_rgba(70,177,255,.2)]" />
            <div className="absolute right-[8%] top-[12%] h-[42%] w-[38%] rotate-[4deg] rounded-[24px] border border-white/[0.13] bg-[linear-gradient(145deg,rgba(21,23,35,.98),rgba(8,9,13,.9))] shadow-[0_30px_80px_rgba(131,91,255,.28)]">
              <div className="absolute inset-3 rounded-[18px] border border-white/[0.08] bg-[radial-gradient(circle_at_70%_28%,rgba(143,95,255,.68),transparent_25%),radial-gradient(circle_at_30%_70%,rgba(255,89,157,.5),transparent_32%),linear-gradient(145deg,#07121e,#15111f)]" />
              <div className="absolute left-5 top-5 rounded-full border border-white/10 bg-black/30 px-2.5 py-1 text-[7px] tracking-[0.16em] text-white/45">VIDEO</div>
            </div>
            <div className="absolute bottom-[13%] right-[3%] w-[48%] rounded-[24px] border border-white/[0.09] bg-black/45 p-5 backdrop-blur-xl">
              <div className="flex items-center justify-between"><span className="text-[8px] font-semibold uppercase tracking-[0.18em] text-[#ff7cb2]">Music Studio</span><span className="h-2 w-2 rounded-full bg-[#ff6da9] shadow-[0_0_16px_rgba(255,109,169,.8)]" /></div>
              <Waveform />
            </div>
            <div className="absolute bottom-[9%] left-[3%] w-[42%] rounded-[24px] border border-white/[0.09] bg-[#0b0d12]/75 p-5 backdrop-blur-xl">
              <div className="text-[8px] font-semibold uppercase tracking-[0.18em] text-[#63d8ff]">Image Studio</div>
              <div className="mt-3 h-24 rounded-2xl bg-[radial-gradient(circle_at_34%_35%,rgba(91,218,255,.92),rgba(84,76,209,.5)_38%,rgba(11,13,18,.2)_70%)]" />
            </div>
            <div className="absolute left-[12%] top-[17%] text-[9px] uppercase tracking-[0.22em] text-white/24">Ideas<br/>Direction<br/>Production<br/>Reality</div>
          </div>
        </div>
      </section>

      <section id="studios" className="relative border-b border-white/[0.06] bg-[#090b10]">
        <div className="mx-auto max-w-[1500px] px-5 py-20 sm:px-7 lg:px-10 lg:py-28">
          <div className="max-w-3xl"><p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#a991ff]">Three production systems</p><h2 className="mt-4 text-[38px] font-medium leading-[1.02] tracking-[-0.05em] text-white sm:text-[48px] lg:text-[58px]">Different mediums. One creative intelligence.</h2><p className="mt-5 text-[14px] leading-7 text-white/48 sm:text-[15px]">Each studio is a complete workflow with research, creative direction, production, critique, repair and final delivery. Use one studio or combine all three in one mission.</p></div>
          <div className="mt-12 grid gap-5 lg:grid-cols-3">
            {studios.map((studio, index) => (
              <article key={studio.name} className="group rounded-[32px] border border-white/[0.08] bg-white/[0.025] p-4 transition duration-300 hover:-translate-y-1 hover:border-white/[0.14]">
                <StudioVisual studio={studio} index={index} />
                <div className="px-2 pb-2 pt-6"><div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white/38">{studio.kicker}</div><div className="mt-2 flex items-start justify-between gap-5"><h3 className="text-[26px] font-semibold tracking-[-0.04em] text-white">{studio.name}</h3><span className="mt-1 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-white/50 transition group-hover:border-[#9d83ff]/50 group-hover:text-white"><Arrow className="h-4 w-4" /></span></div><p className="mt-4 min-h-[96px] text-[12px] leading-6 text-white/50">{studio.description}</p><div className="mt-5 flex flex-wrap gap-1.5">{studio.capabilities.map((item) => <span key={item} className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-[8px] font-medium text-white/46">{item}</span>)}</div></div>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section id="process" className="border-b border-white/[0.06] bg-[#07090d]">
        <div className="mx-auto max-w-[1500px] px-5 py-20 sm:px-7 lg:px-10 lg:py-28">
          <div className="grid gap-10 lg:grid-cols-[.7fr_1.3fr] lg:items-end">
            <div><p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#d19cff]">A complete creative process</p><h2 className="mt-4 text-[38px] font-medium leading-[1.02] tracking-[-0.05em] sm:text-[48px] lg:text-[58px]">More than generation.<br/>A production system.</h2></div>
            <p className="max-w-2xl text-[14px] leading-7 text-white/48 lg:justify-self-end">Avantiqo does not stop when a model returns an output. The Studio keeps the objective, creative direction, continuity, quality gates and commercial delivery connected through the whole mission.</p>
          </div>
          <div className="mt-14 grid gap-3 md:grid-cols-2 xl:grid-cols-7">
            {process.map(([number, title, description], index) => (
              <div key={title} className="relative min-h-[180px] rounded-[22px] border border-white/[0.07] bg-white/[0.025] p-5">
                <div className="flex items-center justify-between"><span className="text-[9px] font-bold tracking-[0.14em] text-[#a991ff]">{number}</span>{index < process.length - 1 && <Arrow className="h-3.5 w-3.5 text-white/18" />}</div>
                <h3 className="mt-10 text-[14px] font-semibold text-white/82">{title}</h3><p className="mt-2 text-[10px] leading-5 text-white/36">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-white/[0.06] bg-[#0a0d13]">
        <div className="mx-auto max-w-[1500px] px-5 py-20 sm:px-7 lg:px-10 lg:py-28">
          <div className="grid gap-12 lg:grid-cols-[.62fr_1.38fr]">
            <div><p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#67d8ff]">Built for real business use</p><h2 className="mt-4 text-[38px] font-medium leading-[1.02] tracking-[-0.05em] sm:text-[48px]">Creative work that has a job to do.</h2><p className="mt-5 max-w-lg text-[14px] leading-7 text-white/45">Campaigns, launches, product worlds, investor films, training, brand music and content systems—produced against a business objective, not just a prompt.</p></div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ["Marketing & growth", "Campaign systems, paid creative, launches and social."],
                ["Products & commerce", "Product imagery, product film, launch assets and variants."],
                ["Brand & corporate", "Brand films, investor media, presentations and internal communication."],
                ["Learning & training", "Structured educational video, graphics and audio."],
                ["Entertainment & events", "Visuals, music, promos, intros, trailers and event content."],
                ["Creative operations", "Repeatable production workflows for teams and agencies."],
              ].map(([title, description], index) => (
                <article key={title} className="group min-h-[210px] overflow-hidden rounded-[24px] border border-white/[0.07] bg-white/[0.025] p-5">
                  <div className={`h-20 rounded-[18px] ${index % 3 === 0 ? "bg-[radial-gradient(circle_at_30%_40%,rgba(84,217,255,.75),rgba(80,64,180,.24)_45%,transparent_75%)]" : index % 3 === 1 ? "bg-[radial-gradient(circle_at_65%_38%,rgba(151,100,255,.72),rgba(231,79,164,.18)_48%,transparent_78%)]" : "bg-[radial-gradient(circle_at_45%_40%,rgba(255,96,160,.58),rgba(255,155,96,.16)_48%,transparent_78%)]"}`} />
                  <h3 className="mt-5 text-[14px] font-semibold text-white/80">{title}</h3><p className="mt-2 text-[10px] leading-5 text-white/38">{description}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>
      <section className="relative overflow-hidden bg-[#07090d]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(132,92,255,.18),transparent_38%),radial-gradient(circle_at_85%_65%,rgba(255,77,155,.12),transparent_28%)]" />
        <div className="relative mx-auto max-w-[1200px] px-5 py-24 text-center sm:px-7 lg:px-10 lg:py-32">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#b197ff]">Creative without the generator mindset</p>
          <h2 className="mx-auto mt-5 max-w-4xl text-[42px] font-medium leading-[0.98] tracking-[-0.055em] text-white sm:text-[54px] lg:text-[66px]">Give the Studio the objective. Let the production system do the work.</h2>
          <p className="mx-auto mt-6 max-w-2xl text-[14px] leading-7 text-white/45">Image, video and music can run independently or as one connected creative mission—with the same brief, direction, governance, review and delivery logic.</p>
          <div className="mt-9 flex flex-wrap justify-center gap-3"><a href="/login" className="inline-flex h-12 items-center gap-2 rounded-xl bg-gradient-to-r from-[#788cff] to-[#b56fff] px-5 text-[11px] font-semibold text-white shadow-[0_12px_40px_rgba(132,95,255,.25)]">Enter Avantiqo <Arrow className="h-3.5 w-3.5" /></a><a href="/developers" className="inline-flex h-12 items-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.025] px-5 text-[11px] font-semibold text-white/62">Creative APIs & integration</a></div>
        </div>
      </section>

      <footer className="border-t border-white/[0.06] bg-[#06080b]">
        <div className="mx-auto flex max-w-[1500px] flex-col gap-5 px-5 py-8 text-[9px] text-white/30 sm:flex-row sm:items-end sm:justify-between sm:px-7 lg:px-10">
          <div><div className="text-[11px] font-semibold tracking-[0.02em] text-white/70">Avantiqo Creative Studios</div><div className="mt-2">Image · Video · Music · One connected creative production system</div></div>
          <div className="flex flex-wrap gap-5"><a href="/" className="transition hover:text-white/70">Platform</a><a href="/developers" className="transition hover:text-white/70">Developers</a><a href="/policy" className="transition hover:text-white/70">Privacy</a><a href="/terms" className="transition hover:text-white/70">Terms</a></div>
        </div>
      </footer>
    </main>
  );
}
