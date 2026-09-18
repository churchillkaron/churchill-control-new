import PublicSiteHeader from "@/components/public/PublicSiteHeader";
import PublicArtStage from "@/components/public/PublicArtStage";

export const metadata = {
  title: "Creative Studios | Avantiqo",
  description:
    "Avantiqo Creative Studios: professional image and music production plus an advanced film-production and VFX environment with reconstruction, pass rendering, simulation, compositing, cinematic sound and optical finishing.",
};

const studios = [
  {
    no: "01",
    name: "Image Studio",
    title: "A commercial image-production room.",
    text: "Research, art direction, composition, production, critique, targeted repair, typography, layout and final delivery.",
    href: "/creative-studios/image",
    artKind: "image-studio",
    image: "/art/creative-image.jpg",
    tags: "BRANDS  ·  CAMPAIGNS  ·  CONTENT",
  },
  {
    no: "02",
    name: "Video Studio",
    title: "An intelligent film-production house.",
    text: "Story and shot architecture, reconstruction execution, pass rendering, physical simulation, deep compositing, cinematic sound, optical finishing, edit, color and mastering.",
    href: "/creative-studios/video",
    artKind: "video-studio",
    image: "/art/creative-video.jpg",
    tags: "FILM  ·  VFX  ·  COMPOSITING  ·  SURROUND  ·  MASTER",
  },
  {
    no: "03",
    name: "Music Studio",
    title: "A world-class record-production room.",
    text: "Performance, recording, comping, vocal and instrument production, arrangement, editing, mix, premaster listening, mastering and translation QC.",
    href: "/creative-studios/music",
    artKind: "music-studio",
    image: "/art/creative-music.jpg",
    tags: "MUSIC  ·  SFX  ·  VOICE  ·  MASTER",
  },
];

function Arrow({ className = "" }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={className}
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 10h11M11 6l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Play() {
  return (
    <span className="flex h-7 w-7 items-center justify-center rounded-full border border-[#9d784c]/45 bg-white text-[#1d1b18] shadow-sm">
      <svg viewBox="0 0 20 20" className="h-3 w-3" fill="none">
        <path d="M7.5 5.8 14 10l-6.5 4.2V5.8Z" fill="currentColor" />
      </svg>
    </span>
  );
}

function MiniIcon({ type }) {
  if (type === "brain")
    return <span className="text-[22px] leading-none">⌘</span>;
  if (type === "shield")
    return <span className="text-[20px] leading-none">◇</span>;
  if (type === "team")
    return <span className="text-[21px] leading-none">◎</span>;
  return <span className="text-[20px] leading-none">▤</span>;
}

export default function Page() {
  return (
    <main className="min-h-screen bg-[#f7f4ef] text-[#11110f]">
      <PublicSiteHeader
        context="Creative Studios"
        audience="creative"
        links={[
          { label: "Platform", href: "/", visibility: "hidden md:inline-flex" },
          {
            label: "Solutions",
            href: "/solutions",
            visibility: "hidden md:inline-flex",
          },
          {
            label: "Creative Studios",
            href: "/creative-studios",
            visibility: "hidden lg:inline-flex",
          },
        ]}
      />

      <section className="relative overflow-hidden border-b border-black/[0.07] bg-[#f6f2eb]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_18%,rgba(255,255,255,.95),transparent_36%),linear-gradient(90deg,#fbfaf7_0%,#f7f3ec_48%,#eee8de_100%)]" />
        <div className="relative mx-auto grid max-w-[1520px] lg:min-h-[540px] lg:grid-cols-[44%_56%]">
          <div className="z-20 flex flex-col justify-center px-6 pb-12 pt-16 sm:px-8 lg:px-12 lg:py-16 xl:px-14">
            <p className="text-[10px] font-semibold uppercase tracking-[0.34em] text-[#8d6237]">
              Creative Studios
            </p>
            <h1 className="mt-4 max-w-[720px] text-[52px] font-normal leading-[.95] tracking-[-0.055em] text-[#11110f] sm:text-[70px] lg:text-[76px] xl:text-[84px]">
              Real creativity.
              <br />
              Real business impact.
            </h1>
            <p className="mt-6 max-w-[680px] text-[16px] leading-7 text-[#5f5a53] sm:text-[17px]">
              Professional image, film and music production with research,
              direction, executable production, review, repair and delivery — all in
              one system, powered by Avantiqo Intelligence. Video Studio is being
              built as a full film-production and VFX environment, not a prompt-to-video generator.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="#studios"
                className="inline-flex h-12 items-center gap-3 rounded-full bg-[#151513] px-7 text-[12px] font-medium text-[#f4c98f] shadow-[0_12px_32px_rgba(30,22,14,.20)]"
              >
                Explore Creative Studios <Arrow className="h-4 w-4" />
              </a>
              <a
                href="#how-it-works"
                className="inline-flex h-12 items-center gap-3 rounded-full border border-[#9b754d]/55 bg-white/75 px-6 text-[12px] font-medium text-[#27231e] backdrop-blur-sm"
              >
                <Play /> See how it works
              </a>
            </div>
            <div className="mt-8 text-[9px] font-semibold uppercase tracking-[0.26em] text-[#9d7448]">
              Concept &nbsp; · &nbsp; Create &nbsp; · &nbsp; Review &nbsp; ·
              &nbsp; Refine &nbsp; · &nbsp; Deliver &nbsp; · &nbsp; Scale
            </div>
          </div>

          <div className="relative min-h-[430px] overflow-hidden bg-[#0f0d0b] lg:min-h-[540px]">
            <div className="absolute inset-0 bg-cover bg-center" style={{backgroundImage:"url(/art/creative-video.jpg)"}} />
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(10,8,6,.52),rgba(10,8,6,.06)_42%,rgba(10,8,6,.18)),linear-gradient(180deg,rgba(10,8,6,.03),rgba(10,8,6,.10)_52%,rgba(10,8,6,.72))]" />
            <div className="absolute inset-y-0 left-0 w-[12%] bg-gradient-to-r from-[#f6f2eb] via-[#f6f2eb]/24 to-transparent" />
            <div className="absolute right-6 top-6 rounded-full border border-white/[.18] bg-[#11100E]/58 px-4 py-2 text-[7px] font-semibold uppercase tracking-[.2em] text-[#E2BA84] backdrop-blur-md">FILM · VFX · SOUND · FINISH</div>
            <div className="absolute bottom-7 left-[17%] max-w-[520px] rounded-[22px] border border-white/[.12] bg-[#11100E]/72 p-5 text-white shadow-[0_28px_80px_rgba(0,0,0,.28)] backdrop-blur-xl">
              <div className="text-[7px] font-semibold uppercase tracking-[0.2em] text-[#D6A66A]">VIDEO STUDIO</div>
              <div className="mt-3 text-[24px] font-medium leading-[1.05] tracking-[-.035em] text-white/92">From shot design to final master.</div>
              <div className="mt-3 text-[9px] leading-5 text-white/46">Reconstruction · simulation · compositing · optical finishing · cinematic sound · color.</div>
            </div>
          </div>
        </div>
      </section>

      <section id="studios" className="bg-[#f8f5f0] px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-[1450px] gap-4 lg:grid-cols-3">
          {studios.map((studio) => (
            <a
              key={studio.name}
              href={studio.href}
              className="group overflow-hidden rounded-[26px] border border-black/[0.07] bg-white shadow-[0_18px_48px_rgba(42,30,18,.07)] transition hover:-translate-y-0.5 hover:shadow-[0_28px_70px_rgba(42,30,18,.10)]"
            >
              <div className="relative h-[270px] overflow-hidden bg-[#171614]">
                <div className="absolute inset-0 bg-cover bg-center transition duration-700 group-hover:scale-[1.025]" style={{backgroundImage:`url(${studio.image})`}} />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(10,8,6,.03),rgba(10,8,6,.10)_58%,rgba(10,8,6,.54))]" />
                <div className="absolute left-5 right-5 top-5 flex items-center justify-between text-[8px] font-semibold uppercase tracking-[0.18em] text-[#F1C98E]">
                  <span>{studio.name}</span><span>{studio.no}</span>
                </div>
                <div className="absolute bottom-5 left-5 right-5 text-[7px] font-semibold uppercase tracking-[.16em] text-white/52">{studio.tags}</div>
              </div>
              <div className="p-6">
                <h2 className="text-[28px] font-medium leading-[1.05] tracking-[-0.045em] text-[#211E1A]">{studio.title}</h2>
                <p className="mt-3 min-h-[58px] text-[11px] leading-6 text-[#756E66]">{studio.text}</p>
                <div className="mt-6 flex items-center justify-between border-t border-black/[0.07] pt-4">
                  <div className="text-[10px] font-semibold text-[#7E5B38]">Explore {studio.name}</div>
                  <span className="flex h-9 w-9 items-center justify-center rounded-full border border-[#D6A66A]/35 text-[#9A744B]"><Arrow className="h-3.5 w-3.5"/></span>
                </div>
              </div>
            </a>
          ))}
        </div>
      </section>

      <section className="border-y border-black/[0.06] bg-[#EFEAE2] px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1450px]">
          <div className="grid gap-7 lg:grid-cols-[.55fr_1.45fr] lg:items-end">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-[0.20em] text-[#9A744B]">SPECIALIST ROOMS</p>
              <h2 className="mt-3 text-[34px] font-medium leading-[1.02] tracking-[-0.045em] text-[#1E1B18]">The same production standard extends beyond image, film and music.</h2>
            </div>
            <p className="max-w-2xl text-[11px] leading-6 text-[#736C64] lg:justify-self-end">Voice and Code use the same Avantiqo principle: real source state, specialist execution, deterministic review and durable proof — not decorative AI effects.</p>
          </div>
          <div className="mt-7 grid gap-4 lg:grid-cols-2">
            {[
              ["Voice Studio","/voice","voice","Source audio → transcript → business context → authorized action","PCM · STT · TTS · REALTIME · TELEPHONY"],
              ["Code Studio","/code","code-studio","Repository truth → exact change → tests → review → verified result","REPO · BUILD · TEST · VERIFY · DEPLOY"],
            ].map(([name,href,kind,copy,tags])=><a key={name} href={href} className="group grid min-h-[330px] overflow-hidden rounded-[26px] border border-black/[0.08] bg-[#11100E] shadow-[0_20px_55px_rgba(48,34,20,.09)] sm:grid-cols-[1.08fr_.92fr]">
              <div className="relative min-h-[260px] overflow-hidden"><div className="absolute inset-0 scale-[1.06] transition duration-700 group-hover:scale-[1.09]"><PublicArtStage kind={kind}/></div></div>
              <div className="flex flex-col justify-between border-t border-white/[.07] p-6 text-white sm:border-l sm:border-t-0">
                <div><div className="text-[8px] font-semibold uppercase tracking-[.18em] text-[#D6A66A]">{name}</div><div className="mt-5 text-[25px] leading-[1.06] tracking-[-.04em] text-white/88">{copy}</div></div>
                <div><div className="mb-4 text-[6px] uppercase tracking-[.14em] text-white/28">{tags}</div><div className="text-[9px] font-semibold text-[#DDB47C]">Explore {name} →</div></div>
              </div>
            </a>)}
          </div>
        </div>
      </section>

      <section
        id="how-it-works"
        className="bg-[#f8f5f0] px-4 pb-7 sm:px-6 lg:px-8"
      >
        <div className="mx-auto grid max-w-[1450px] gap-px overflow-hidden rounded-[22px] border border-black/[0.06] bg-black/[0.06] lg:grid-cols-4">
          {[
            [
              "brain",
              "Powered by Avantiqo Intelligence",
              "Research. Direction. Production. Review. Delivery.",
            ],
            [
              "shield",
              "Commercial ready",
              "Brand safe. Rights aware. Made for business.",
            ],
            ["team", "Built for teams", "Collaborate. Approve. Scale."],
            [
              "stack",
              "All in one system",
              "Image. Video. Music. One workflow.",
            ],
          ].map(([icon, title, text]) => (
            <div
              key={title}
              className="flex min-h-[112px] items-center gap-4 bg-[#f2eee7] px-7 py-5"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#aa8257]/20 bg-[#f8f3ea] text-[#9b6f3f]">
                <MiniIcon type={icon} />
              </div>
              <div>
                <div className="text-[9px] font-semibold uppercase tracking-[0.15em] text-[#24201b]">
                  {title}
                </div>
                <div className="mt-1 text-[9px] leading-4 text-[#787067]">
                  {text}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-black/[0.06] bg-[#f7f4ef] px-6 py-14 lg:px-10">
        <div className="mx-auto grid max-w-[1450px] gap-5 lg:grid-cols-3">
          <div className="rounded-[24px] border border-black/[0.07] bg-white/70 p-7"><div className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[#9b7043]">Image Studio</div><div className="mt-3 text-[24px] tracking-[-0.035em]">Campaign-ready visual production.</div><p className="mt-3 text-[11px] leading-6 text-[#716b64]">Brief, research, art direction, creation, critique, repair and delivery.</p></div>
          <div className="rounded-[24px] border border-black/[0.07] bg-white/70 p-7"><div className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[#9b7043]">Video Studio</div><div className="mt-3 text-[24px] tracking-[-0.035em]">AI film-production house.</div><p className="mt-3 text-[11px] leading-6 text-[#716b64]">Shot architecture, reconstruction, pass rendering, physical simulation, deep compositing, cinematic sound, optical finishing, edit, color and master.</p></div>
          <div className="rounded-[24px] border border-black/[0.07] bg-white/70 p-7"><div className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[#9b7043]">Music Studio</div><div className="mt-3 text-[24px] tracking-[-0.035em]">Complete audio production.</div><p className="mt-3 text-[11px] leading-6 text-[#716b64]">Create, edit, remix, stems, vocal work, SFX, mix and master.</p></div>
        </div>
      </section>
    </main>
  );
}
