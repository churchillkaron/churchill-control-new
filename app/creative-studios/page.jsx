import PublicSiteHeader from "@/components/public/PublicSiteHeader";

export const metadata = {
  title: "Creative Studios | Avantiqo",
  description:
    "Avantiqo Creative Studios: image, video and music production powered by Avantiqo Intelligence.",
};

const studios = [
  {
    no: "01",
    name: "Image Studio",
    title: "From concept to campaign.",
    text: "Research, art direction, image production, critique, repair, typography and final delivery.",
    href: "/creative-studios/image",
    image: "/art/creative-image.jpg",
    tags: "BRANDS  ·  CAMPAIGNS  ·  CONTENT",
  },
  {
    no: "02",
    name: "Video Studio",
    title: "From story to screen.",
    text: "Story development, shot design, production, dailies, repair, edit, VFX, sound, color and mastering.",
    href: "/creative-studios/video",
    image: "/art/creative-video.jpg",
    tags: "FILMS  ·  ADS  ·  SOCIAL  ·  MORE",
  },
  {
    no: "03",
    name: "Music Studio",
    title: "From idea to full production.",
    text: "Composition, arrangement, edit, remix, stems, vocal work, SFX, mix and master.",
    href: "/creative-studios/music",
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
              Professional image, video and music production with research,
              direction, creation, review and delivery — all in one system,
              powered by Avantiqo Intelligence.
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
            <div className="absolute inset-0 grid grid-cols-[1.28fr_.72fr] gap-px bg-[#D6A66A]/30">
              <div className="relative overflow-hidden">
                <div className="absolute inset-0 scale-[1.025] bg-cover bg-center" style={{ backgroundImage: "url(/art/creative-video.jpg)" }} />
                <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(12,9,7,.35),rgba(12,9,7,.03)_42%,rgba(12,9,7,.34)),linear-gradient(180deg,rgba(12,9,7,.02),rgba(12,9,7,.10)_45%,rgba(12,9,7,.76))]" />
                <div className="absolute left-7 top-7 text-[7px] font-semibold uppercase tracking-[.22em] text-[#f0c98f]">FILM · STORY · MOTION</div>
                <div className="absolute bottom-7 left-7 max-w-[420px] text-white">
                  <div className="text-[8px] font-semibold uppercase tracking-[.2em] text-[#D6A66A]">VIDEO STUDIO</div>
                  <div className="mt-2 text-[22px] leading-[1.05] tracking-[-.035em] text-white/90">Direction before generation. Review before delivery.</div>
                </div>
              </div>
              <div className="grid grid-rows-2 gap-px bg-[#D6A66A]/30">
                {[["IMAGE STUDIO","/art/creative-image.jpg","Campaign · brand · art direction"],["MUSIC STUDIO","/art/creative-music.jpg","Composition · voice · mix · master"]].map(([label,img,note])=><div key={label} className="relative overflow-hidden">
                  <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${img})` }} />
                  <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(12,9,7,.06),rgba(12,9,7,.70))]" />
                  <div className="absolute bottom-5 left-5 right-4 text-white"><div className="text-[7px] font-semibold tracking-[.18em] text-[#F0C98F]">{label}</div><div className="mt-2 text-[8px] text-white/52">{note}</div></div>
                </div>)}
              </div>
            </div>
            <div className="absolute inset-y-0 left-0 w-[12%] bg-gradient-to-r from-[#f6f2eb] via-[#f6f2eb]/26 to-transparent" />
            <div className="absolute right-[6%] top-[7%] rounded-full border border-[#D6A66A]/40 bg-[#15120f]/72 px-4 py-2 text-[7px] font-semibold uppercase tracking-[.2em] text-[#efd0a4] backdrop-blur-md">CREATIVE INTELLIGENCE</div>
            <div className="absolute bottom-6 left-[17%] right-[6%] hidden rounded-[22px] border border-white/15 bg-[#15120f]/82 px-5 py-4 text-white shadow-[0_28px_80px_rgba(0,0,0,.30)] backdrop-blur-xl md:block">
              <div className="grid grid-cols-[1fr_auto] items-center gap-6">
                <div><div className="text-[7px] font-semibold uppercase tracking-[0.2em] text-[#D6A66A]">ONE PROFESSIONAL PRODUCTION FLOW</div><div className="mt-2 text-[13px] text-white/80">Research → direction → production → critique → repair → finish.</div></div>
                <div className="grid grid-cols-3 gap-2 text-[6px] uppercase tracking-[.14em] text-white/38"><span>IMAGE</span><span>VIDEO</span><span>MUSIC</span></div>
              </div>
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
              className="group relative min-h-[420px] overflow-hidden rounded-[24px] border border-[#D6A66A]/18 bg-[#171614] shadow-[0_18px_48px_rgba(42,30,18,.11)]"
            >
              <div
                className="absolute inset-0 bg-cover bg-center transition duration-700 group-hover:scale-[1.035]"
                style={{ backgroundImage: `url(${studio.image})` }}
              />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(10,8,6,.18)_0%,rgba(10,8,6,.04)_42%,rgba(10,8,6,.60)_70%,rgba(10,8,6,.94)_100%)]" />
              <div className="absolute left-6 right-6 top-5 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.18em] text-white drop-shadow-sm">
                <span>{studio.name}</span>
                <span>{studio.no}</span>
              </div>
              <div className="absolute inset-x-6 bottom-5">
                <h2 className="text-[28px] font-normal tracking-[-0.045em] text-white">
                  {studio.title}
                </h2>
                <p className="mt-2 min-h-[48px] max-w-[95%] text-[11px] leading-[1.75] text-white/52">
                  {studio.text}
                </p>
                <div className="mt-4 flex items-end justify-between gap-3">
                  <div className="flex items-center gap-3 text-[11px] font-medium text-white/82">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full border border-[#D6A66A]/45 text-[#D6A66A]">
                      <Arrow className="h-4 w-4" />
                    </span>
                    Explore {studio.name}
                  </div>
                  <div className="pb-2 text-right text-[8px] font-semibold uppercase tracking-[0.18em] text-[#9d7448]">
                    {studio.tags}
                  </div>
                </div>
              </div>
            </a>
          ))}
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
          <div className="rounded-[24px] border border-black/[0.07] bg-white/70 p-7"><div className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[#9b7043]">Video Studio</div><div className="mt-3 text-[24px] tracking-[-0.035em]">Professional film production.</div><p className="mt-3 text-[11px] leading-6 text-[#716b64]">Story, treatment, shots, continuity, dailies, repair, edit, sound and master.</p></div>
          <div className="rounded-[24px] border border-black/[0.07] bg-white/70 p-7"><div className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[#9b7043]">Music Studio</div><div className="mt-3 text-[24px] tracking-[-0.035em]">Complete audio production.</div><p className="mt-3 text-[11px] leading-6 text-[#716b64]">Create, edit, remix, stems, vocal work, SFX, mix and master.</p></div>
        </div>
      </section>
    </main>
  );
}
