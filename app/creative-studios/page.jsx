import PublicSiteHeader from "@/components/public/PublicSiteHeader";

export const metadata = {
  title: "Creative Studios | Avantiqo",
  description:
    "Avantiqo Creative Studios — image, film, music, audio, voice and code production in one professional creative system.",
};

const studios = [
  {
    no: "01",
    name: "Image Studio",
    href: "/creative-studios/image",
    image: "/art/generated/creative-image-v2.png",
    position: "center",
    text: "Commercial image production for real brand impact.",
    bullets: ["Campaigns & brand systems", "Product & menu photography", "Retouch, layout and delivery"],
  },
  {
    no: "02",
    name: "Video Studio",
    href: "/creative-studios/video",
    image: "/art/generated/creative-video-v2.png",
    position: "center",
    text: "A complete film-production and VFX environment.",
    bullets: ["Concept to final picture", "Simulation, compositing, VFX", "Commercial, film and content"],
  },
  {
    no: "03",
    name: "Music Studio",
    href: "/creative-studios/music",
    image: "/art/generated/creative-music-v2.png",
    position: "center",
    text: "World-class record production for any genre or media.",
    bullets: ["Record, produce, mix, master", "Vocal production and repair", "Music for songs, brands and film"],
  },
  {
    no: "04",
    name: "Audio Post",
    href: "/creative-studios/audio",
    image: "/art/generated/creative-audio-post-v2.png",
    position: "center",
    text: "A complete sound-to-picture production room.",
    bullets: ["Dialogue, Foley, SFX, ambience", "5.1 / 7.1 / Atmos delivery", "M&E, DX and final mixes"],
  },
  {
    no: "05",
    name: "Voice Studio",
    href: "/voice",
    image: "/art/generated/creative-voice-v2.png",
    position: "center",
    text: "Turn speech into action.",
    bullets: ["Transcription and understanding", "Multi-language and real context", "Actions inside your business"],
  },
  {
    no: "06",
    name: "Code Studio",
    href: "/code",
    image: "/art/generated/creative-code-v2.png",
    position: "center",
    text: "Build, extend and automate with confidence.",
    bullets: ["Full-stack development", "Integrations and APIs", "Agents and automations"],
  },
];

function Arrow({ className = "" }) {
  return <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden="true"><path d="M4 10h11M11 6l4 4-4 4" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

function Check() {
  return <span className="flex h-[14px] w-[14px] shrink-0 items-center justify-center rounded-full border border-[#C98A3C] text-[#B66F1D]"><svg viewBox="0 0 16 16" className="h-2.5 w-2.5" fill="none"><path d="m4.2 8 2.2 2.2 5-5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg></span>;
}

export default function Page() {
  return (
    <main className="min-h-screen bg-[#F4F0E8] text-[#151412]">
      <PublicSiteHeader context="Creative Studios" audience="creative" />

      <section className="relative overflow-hidden border-b border-black/[0.07] bg-[#F5F1E9]">
        <div className="mx-auto grid max-w-[1540px] gap-10 px-5 py-14 sm:px-7 lg:min-h-[650px] lg:grid-cols-[.88fr_1.12fr] lg:items-center lg:px-10 lg:py-20">
          <div className="relative z-20 flex flex-col justify-center">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_10%,rgba(255,255,255,.95),transparent_34%)]" />
            <div className="relative">
              <div className="text-[10px] font-semibold uppercase tracking-[0.34em] text-[#9A6531]">Creative Studios</div>
              <h1 className="mt-4 text-[54px] font-normal leading-[.91] tracking-[-0.06em] sm:text-[72px] lg:text-[78px] xl:text-[84px]">Real Creativity.<br/>Real Business Impact.</h1>
              <p className="mt-6 max-w-[620px] text-[15px] leading-7 text-[#5F5A54] sm:text-[16px]">Film, image, music, voice and code production for the real world.<br/>One platform. One standard. Built for what&apos;s next.</p>
              <div className="mt-7 flex flex-wrap gap-3">
                <a href="#studios" className="inline-flex h-12 items-center gap-3 rounded-full bg-[linear-gradient(90deg,#D7A666,#E6C58F)] px-6 text-[12px] font-medium text-[#16130F] shadow-[0_14px_30px_rgba(93,62,30,.10)]">Explore Creative Studios <Arrow className="h-4 w-4"/></a>
                <a href="#advantage" className="inline-flex h-12 items-center gap-3 rounded-full border border-[#B78A5B]/50 bg-white/55 px-6 text-[12px] font-medium text-[#2B2722]"><span className="flex h-6 w-6 items-center justify-center rounded-full border border-black/[0.14] text-[8px]">▶</span> Watch the film</a>
              </div>
              <div className="mt-9 grid gap-0 border-t border-black/[0.08] sm:grid-cols-3">
                {[["ONE PLATFORM","Infinite possibilities"],["ALL MEDIA","Image · Video · Music · Voice · Code"],["REAL WORKFLOWS","From concept to global delivery"]].map(([title,copy],index)=><div key={title} className={`py-4 ${index ? "sm:border-l sm:border-black/[0.09] sm:pl-5" : "sm:pr-5"}`}><div className="text-[8px] font-semibold uppercase tracking-[.18em]">{title}</div><div className="mt-1 text-[8px] text-[#716B63]">{copy}</div></div>)}
              </div>
            </div>
          </div>

          <div className="relative min-h-[500px] overflow-hidden rounded-[34px] border border-black/[0.08] bg-[#E9DFD1] shadow-[0_34px_95px_rgba(68,47,25,.13)] sm:min-h-[560px] lg:min-h-[575px]">
            <div className="absolute inset-0 bg-cover bg-center" style={{backgroundImage:"url(/art/generated/creative-hero-v3.png)"}} />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,.02),rgba(0,0,0,.05)_58%,rgba(0,0,0,.34))]" />
            <div className="absolute left-5 top-5 rounded-full border border-white/70 bg-[#F8F0E6]/74 px-4 py-2 text-[7px] font-semibold uppercase tracking-[.22em] text-[#8D6339] backdrop-blur-xl">Avantiqo Creative Studios</div>
            <div className="absolute bottom-5 left-5 right-5 flex flex-wrap items-end justify-between gap-4 rounded-[22px] border border-white/72 bg-[#F8F1E8]/88 p-5 text-[#2B251F] shadow-[0_18px_45px_rgba(0,0,0,.12)] backdrop-blur-xl">
              <div>
                <div className="text-[7px] font-semibold uppercase tracking-[.20em] text-[#A36F39]">IDEAS · PEOPLE · TECHNOLOGY · REAL IMPACT</div>
                <div className="mt-2 text-[10px] text-[#6D6257]">Built for a more creative world.</div>
              </div>
              <div className="text-right text-[6px] uppercase leading-4 tracking-[.24em] text-[#8B7C6C]">7.8804° N · 98.3923° E<br/><span className="text-[#6C6054]">Phuket, Thailand</span></div>
            </div>
          </div>
        </div>
      </section>

      <section id="studios" className="border-b border-black/[0.07] bg-[#F7F3EC] px-5 py-8 sm:px-7 lg:px-10">
        <div className="mx-auto grid max-w-[1540px] gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {studios.map((studio)=><a key={studio.name} href={studio.href} className="group overflow-hidden rounded-[24px] border border-black/[0.08] bg-[#F6F1E9] shadow-[0_12px_32px_rgba(68,47,28,.05)] transition hover:-translate-y-1 hover:shadow-[0_20px_50px_rgba(68,47,28,.11)]">
            <div className="relative h-[205px] overflow-hidden rounded-t-[23px] bg-[#1A1713]">
              <div className="absolute inset-0 bg-cover transition duration-700 group-hover:scale-[1.035]" style={{backgroundImage:`url(${studio.image})`,backgroundPosition:studio.position}} />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,7,6,.02),rgba(8,7,6,.06)_52%,rgba(8,7,6,.40))]" />
            </div>
            <div className="p-5">
              <div className="text-[8px] font-medium text-[#BA7528]">{studio.no}</div>
              <h2 className="mt-2 text-[15px] font-medium uppercase tracking-[.13em]">{studio.name}</h2>
              <p className="mt-2 min-h-[42px] text-[9px] leading-4 text-[#6E6861]">{studio.text}</p>
              <div className="mt-4 space-y-2">{studio.bullets.map(item=><div key={item} className="flex items-center gap-2 text-[8px] text-[#6A645D]"><Check/>{item}</div>)}</div>
              <div className="mt-5 flex items-center gap-2 text-[9px] font-medium text-[#A86725]">Enter Studio <Arrow className="h-3.5 w-3.5"/></div>
            </div>
          </a>)}
        </div>
      </section>

      <section className="border-b border-black/[0.07] bg-[#FBF8F2] px-6 py-16 sm:px-8 lg:px-10 lg:py-20">
        <div className="mx-auto max-w-[1450px]">
          <div className="grid gap-8 lg:grid-cols-[.7fr_1.3fr] lg:items-end">
            <div>
              <div className="text-[9px] font-semibold uppercase tracking-[.28em] text-[#A86B2D]">What makes these studios different</div>
              <h2 className="mt-4 max-w-[560px] text-[38px] font-normal leading-[.98] tracking-[-.055em] sm:text-[48px]">The generator is one tool. The studio is the production system around it.</h2>
            </div>
            <p className="max-w-2xl text-[12px] leading-6 text-[#6A645D] lg:justify-self-end">Avantiqo Creative Studios follow the way professional work is actually made: brief, research, direction, source state, specialist production, review, targeted repair and final delivery. Approved work stays connected instead of being discarded every time one detail needs to change.</p>
          </div>
          <div className="mt-10 grid gap-3 lg:grid-cols-2">
            <a href="/creative-studios/video" className="rounded-[28px] border border-[#C8B7A0]/45 bg-[linear-gradient(135deg,#FFF8EE,#EADBC8)] p-7 text-[#211E1A] shadow-[0_20px_55px_rgba(50,35,20,.07)]">
              <div className="text-[9px] font-semibold uppercase tracking-[.18em] text-[#9A6531]">Video Studio / Not prompt-to-video</div>
              <h3 className="mt-3 text-[31px] leading-[1.02] tracking-[-.045em]">A real film-production pipeline with intelligence inside it.</h3>
              <p className="mt-4 text-[10px] leading-5 text-[#6E675F]">Story and shot architecture, reconstruction, executable passes, physical simulation, deep compositing, cinematic sound events, optical finishing, dailies, targeted repair, edit, color and final mastering. Generation is one department — not the product.</p>
              <div className="mt-6 flex flex-wrap gap-2">{["SHOT BUILD","PASSES","SIMULATION","COMPOSITING","SOUND","COLOR","MASTER"].map(x=><span key={x} className="rounded-full border border-black/[0.09] bg-white/42 px-2.5 py-1 text-[6px] tracking-[.13em] text-[#6F665B]">{x}</span>)}</div>
            </a>
            <a href="/creative-studios/audio" className="rounded-[28px] border border-black/[0.08] bg-[#F0E9DF] p-7 shadow-[0_20px_55px_rgba(50,35,20,.07)]">
              <div className="text-[9px] font-semibold uppercase tracking-[.18em] text-[#9A6531]">Audio Post / Not a background track</div>
              <h3 className="mt-3 text-[31px] leading-[1.02] tracking-[-.045em] text-[#211E1A]">Sound is its own production department.</h3>
              <p className="mt-4 text-[10px] leading-5 text-[#6E675F]">Dialogue, Foley, ambience, source recording, designed effects, music editing, picture sync, object movement, spatial placement, routing, automation, premix, multichannel mastering, stems and final delivery remain connected to picture and timecode.</p>
              <div className="mt-6 flex flex-wrap gap-2">{["DX","FOLEY","FX","AMBIENCE","SPATIAL","STEMS","MULTICHANNEL"].map(x=><span key={x} className="rounded-full border border-black/[0.09] bg-white/40 px-2.5 py-1 text-[6px] tracking-[.13em] text-[#6F665B]">{x}</span>)}</div>
            </a>
          </div>
          <div className="mt-3 grid gap-px overflow-hidden rounded-[22px] border border-black/[0.07] bg-black/[0.07] sm:grid-cols-4">
            {[["IMAGE STUDIO","Research → art direction → composition → retouch → typography → campaign delivery"],["MUSIC STUDIO","Performance → recording → comping → production → mix → premaster → master"],["VOICE STUDIO","Listen → transcribe → understand → respond → business action → proof"],["CODE STUDIO","Repository truth → plan → build → test → review → integrate → verify"]].map(([title,copy])=><div key={title} className="bg-[#F6F1E9] p-5"><div className="text-[8px] font-semibold tracking-[.13em] text-[#9A6531]">{title}</div><p className="mt-3 text-[9px] leading-5 text-[#716A62]">{copy}</p></div>)}
          </div>
        </div>
      </section>

      <section id="advantage" className="relative overflow-hidden border-b border-black/[0.07] bg-[#EFE7DC]">
        <div className="absolute inset-0 bg-cover bg-center opacity-[.34]" style={{backgroundImage:"url(/art/generated/creative-video-v2.png)"}} />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(248,244,237,.98)_0%,rgba(248,244,237,.92)_34%,rgba(248,244,237,.48)_66%,rgba(14,13,12,.86)_100%)]"/>
        <div className="relative mx-auto grid min-h-[310px] max-w-[1600px] lg:grid-cols-[1.05fr_1fr_190px]">
          <div className="flex flex-col justify-center px-7 py-12 sm:px-10 lg:px-9">
            <div className="text-[9px] font-semibold uppercase tracking-[.28em] text-[#A86B2D]">The Avantiqo Advantage</div>
            <h2 className="mt-4 max-w-[520px] text-[38px] font-normal leading-[.98] tracking-[-.055em] sm:text-[46px]">A more creative world<br/>is a more human world.</h2>
            <p className="mt-4 max-w-[520px] text-[10px] leading-5 text-[#615B54]">At Avantiqo, creative technology and human talent work together to create real opportunities — for businesses, for people and for places.</p>
            <a href="/resources" className="mt-6 inline-flex h-10 w-fit items-center gap-3 rounded-full border border-[#B98751]/55 bg-white/35 px-5 text-[9px]">Our Story <Arrow className="h-3.5 w-3.5"/></a>
          </div>
          <div className="grid content-end gap-3 px-7 pb-10 sm:grid-cols-2 lg:px-4">{[["◎","One project","All media. All teams."],["⌘","Shared intelligence","Real business context."],["◇","Deterministic quality","Review, repair, proof."],["▥","Global delivery","Any format. Anywhere."]].map(([icon,title,copy])=><div key={title} className="border-t border-black/[0.11] pt-4"><div className="text-[18px]">{icon}</div><div className="mt-2 text-[9px] font-medium">{title}</div><div className="mt-1 text-[8px] text-[#6E6861]">{copy}</div></div>)}</div>
          <div className="relative border-l border-black/[0.07] bg-[#E3D0B5]/92 p-8 text-[#2B251F]"><div className="text-[19px] font-serif leading-7 text-[#3F352C]">“Technology gives us new tools. Creativity gives them meaning.”</div><div className="mt-5 h-px w-7 bg-[#D6A66A]"/><div className="mt-5 text-[7px] uppercase tracking-[.30em] text-[#C8965E]">Avantiqo</div><div className="absolute bottom-7 left-8 text-[6px] uppercase tracking-[.28em] text-[#806F5E]">Same standard.<br/>More possibilities.</div></div>
        </div>
      </section>
    </main>
  );
}
