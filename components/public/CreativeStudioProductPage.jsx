import PublicSiteHeader from "@/components/public/PublicSiteHeader";

const process = [
  ["01", "Brief", "Objective, audience and constraints"],
  ["02", "Research", "Context, references and opportunity"],
  ["03", "Direction", "Creative system and production plan"],
  ["04", "Creation", "Specialist production engines"],
  ["05", "Review", "Critique, quality and continuity"],
  ["06", "Repair", "Targeted correction and refinement"],
  ["07", "Delivery", "Delivery-ready masters and variants"],
];

function Arrow({ className = "" }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className={className}
      fill="none"
    >
      <path
        d="M4 10h11M11 6l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StudioArtwork({ studio }) {
  const video = studio.startsWith("Video");
  const music = studio.startsWith("Music");
  const art = video
    ? "/art/creative-video.jpg"
    : music
      ? "/art/creative-music.jpg"
      : "/art/creative-image.jpg";
  const mode = video
    ? "DIRECT / SHOOT / FINISH"
    : music
      ? "COMPOSE / RECORD / MASTER"
      : "CONCEPT / CREATE / DELIVER";
  const caption = video
    ? "Storytelling in motion"
    : music
      ? "Sound with emotion"
      : "Visual ideas made real";
  return (
    <div className="relative min-h-[590px] overflow-hidden rounded-[32px] border border-black/[0.08] bg-[#EAE3D8] shadow-[0_38px_110px_rgba(68,47,25,.18)]">
      <div
        className="absolute inset-0 bg-cover bg-center transition duration-700"
        style={{ backgroundImage: `url(${art})` }}
      />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,.03),transparent_40%,rgba(8,7,6,.72))]" />
      <div className="absolute left-5 top-5 rounded-full border border-white/35 bg-white/76 px-3 py-1.5 text-[8px] font-semibold uppercase tracking-[0.2em] text-[#6E4D2D] shadow-sm backdrop-blur-xl">
        AVANTIQO {studio}
      </div>
      <div className="absolute right-5 top-5 hidden rounded-[16px] border border-white/24 bg-black/25 px-3 py-2 text-right backdrop-blur-xl sm:block">
        <div className="text-[7px] uppercase tracking-[0.2em] text-[#E8C18D]">
          {mode}
        </div>
        <div className="mt-1 text-[8px] text-white/58">
          Professional production
        </div>
      </div>
      <div className="absolute bottom-5 left-5 right-5 rounded-[20px] border border-white/18 bg-black/30 p-4 text-white backdrop-blur-xl sm:p-5">
        <div className="flex items-end justify-between gap-5">
          <div>
            <div className="text-[8px] font-semibold uppercase tracking-[0.2em] text-[#E8C18D]">
              {caption}
            </div>
            <div className="mt-2 max-w-md text-[11px] leading-5 text-white/66">
              Real people, real production context and one connected creative
              system from direction through delivery.
            </div>
          </div>
          <div className="hidden gap-1.5 sm:flex">
            {(video
              ? ["STORY", "SHOT", "MASTER"]
              : music
                ? ["COMPOSE", "MIX", "MASTER"]
                : ["BRIEF", "ART", "DELIVER"]
            ).map((x) => (
              <span
                key={x}
                className="rounded-full border border-white/18 bg-white/[0.04] px-2 py-1 text-[7px] tracking-[0.13em] text-white/58"
              >
                {x}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function DisciplineGlyph({ studio, index }) {
  const video = studio.startsWith("Video");
  const music = studio.startsWith("Music");

  if (music)
    return (
      <div className="relative h-14 overflow-hidden rounded-[14px] border border-black/[0.06] bg-[#F8F4EE]">
        <div className="absolute left-3 top-2 text-[6px] font-semibold uppercase tracking-[0.15em] text-[#9A744B]">
          MIX {String(index + 1).padStart(2, "0")}
        </div>
        <div className="absolute inset-x-3 top-[22px] flex h-5 items-center justify-center gap-[2px]">
          {[30, 58, 82, 46, 92, 64, 38, 74, 52, 86, 43, 68].map((h, i) => (
            <span
              key={i}
              className="w-[2px] rounded-full bg-[#A37849]/65"
              style={{ height: `${Math.max(18, h - (index % 3) * 5)}%` }}
            />
          ))}
        </div>
        <div className="absolute inset-x-3 bottom-2 flex gap-1">
          {[0, 1, 2, 3].map((n) => (
            <span
              key={n}
              className={`h-[3px] flex-1 rounded-full ${n === index % 4 ? "bg-[#A37849]/70" : "bg-black/[0.07]"}`}
            />
          ))}
        </div>
      </div>
    );

  if (video)
    return (
      <div className="relative h-14 overflow-hidden rounded-[14px] border border-black/[0.06] bg-[#F8F4EE]">
        <div className="absolute left-3 top-2 text-[6px] font-semibold uppercase tracking-[0.15em] text-[#9A744B]">
          SHOT {String(index + 1).padStart(2, "0")}
        </div>
        <div className="absolute inset-x-3 top-[18px] h-6 overflow-hidden rounded-[7px] border border-black/[0.07] bg-[#EEE6DA]">
          <div className="absolute inset-x-0 top-1/2 h-px bg-[#A37849]/28" />
          <div className="absolute left-[62%] top-[30%] h-2.5 w-2.5 rounded-full bg-[#A37849]/38" />
          <div className="absolute bottom-0 left-[22%] h-[55%] w-px bg-black/[0.09]" />
          <div className="absolute bottom-0 right-[22%] h-[55%] w-px bg-black/[0.09]" />
        </div>
        <div className="absolute inset-x-3 bottom-2 flex gap-1">
          {[0, 1, 2, 3, 4].map((n) => (
            <span
              key={n}
              className={`h-[2px] flex-1 ${n === index % 5 ? "bg-[#A37849]/75" : "bg-black/[0.07]"}`}
            />
          ))}
        </div>
      </div>
    );

  return (
    <div className="relative h-14 overflow-hidden rounded-[14px] border border-black/[0.06] bg-[#F8F4EE]">
      <div className="absolute left-3 top-2 text-[6px] font-semibold uppercase tracking-[0.15em] text-[#9A744B]">
        LAYOUT {String(index + 1).padStart(2, "0")}
      </div>
      <div className="absolute bottom-2 left-3 top-[20px] w-[38%] rounded-[7px] border border-[#A37849]/22 bg-white/70">
        <div className="absolute inset-x-2 bottom-2 h-[2px] bg-[#A37849]/50" />
        <div className="absolute left-2 top-2 h-3 w-3 rounded-full bg-[#D6A66A]/30" />
      </div>
      <div
        className={`absolute right-3 top-[19px] h-[27px] w-[43%] rounded-[7px] border border-black/[0.07] bg-[#EFE7DB] ${index % 2 ? "rotate-[-3deg]" : ""}`}
      >
        <div className="absolute left-2 right-2 top-2 h-[3px] bg-black/[0.10]" />
        <div className="absolute left-2 right-4 top-4 h-[2px] bg-[#A37849]/40" />
        <div className="absolute left-2 right-2 bottom-2 h-[2px] bg-black/[0.07]" />
      </div>
      <div className="absolute left-2 top-2 h-2 w-2 border-l border-t border-[#A37849]/45" />
      <div className="absolute bottom-2 right-2 h-2 w-2 border-b border-r border-[#A37849]/45" />
    </div>
  );
}

function ProductPath() {
  return (
    <div className="relative mt-10 overflow-hidden rounded-[28px] border border-black/[0.07] bg-white p-5 shadow-[0_20px_60px_rgba(53,42,28,.045)] sm:p-7">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_8%_50%,rgba(214,166,106,.08),transparent_22%),radial-gradient(circle_at_90%_50%,rgba(154,116,75,.06),transparent_22%)]" />
      <div className="relative grid grid-cols-2 gap-3 xl:grid-cols-7 xl:gap-0">
        {process.map(([n, t, d], i) => (
          <div key={t} className="relative xl:px-2">
            <div
              className={`min-h-[132px] rounded-[18px] border p-4 ${i === 3 ? "border-[#D6A66A]/35 bg-[#FBF5EC]" : "border-black/[0.06] bg-[#FCFBF9]"}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[8px] font-bold text-[#A37849]">{n}</span>
                <span className="h-1.5 w-1.5 rounded-full bg-[#D6A66A]/60" />
              </div>
              <h3 className="mt-7 text-[13px] font-semibold text-[#2D2924]">
                {t}
              </h3>
              <p className="mt-2 text-[8px] leading-4 text-[#837C73]">{d}</p>
            </div>
            {i < process.length - 1 ? (
              <div className="absolute -right-1 top-1/2 z-10 hidden h-px w-2 bg-[#A37849]/35 xl:block" />
            ) : null}
          </div>
        ))}
      </div>
      <div className="relative mt-5 h-px bg-black/[0.06]">
        <div className="h-px w-[78%] bg-gradient-to-r from-[#D6A66A]/20 via-[#A37849]/55 to-transparent" />
      </div>
    </div>
  );
}

function CapabilityNetwork({ studio }) {
  return (
    <div className="relative min-h-[360px] overflow-hidden rounded-[28px] border border-black/[0.07] bg-[#12110f] shadow-[0_24px_70px_rgba(40,30,20,.12)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(214,166,106,.16),transparent_22%)]" />
      <div className="absolute left-1/2 top-1/2 flex h-[116px] w-[116px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[#D6A66A]/35 bg-[#17130f] shadow-[0_0_55px_rgba(214,166,106,.13)]">
        <div className="text-center">
          <div className="text-[8px] font-semibold uppercase tracking-[0.16em] text-[#E0B77E]">
            {studio}
          </div>
          <div className="mt-1 text-[7px] uppercase tracking-[0.15em] text-white/28">
            Capability
          </div>
        </div>
      </div>
      <svg
        aria-hidden="true"
        className="absolute inset-0 h-full w-full text-[#D6A66A]"
        viewBox="0 0 600 360"
        preserveAspectRatio="none"
      >
        <path
          d="M300 180 C225 140 190 90 105 78"
          stroke="currentColor"
          strokeOpacity=".20"
          fill="none"
        />
        <path
          d="M300 180 C375 140 410 90 495 78"
          stroke="currentColor"
          strokeOpacity=".20"
          fill="none"
        />
        <path
          d="M300 180 C225 220 190 270 105 282"
          stroke="currentColor"
          strokeOpacity=".20"
          fill="none"
        />
        <path
          d="M300 180 C375 220 410 270 495 282"
          stroke="currentColor"
          strokeOpacity=".20"
          fill="none"
        />
      </svg>
      {[
        ["Studio", "Mission", "left-[6%] top-[12%]"],
        ["API", "Workflow", "right-[6%] top-[12%]"],
        ["Agent", "Tool", "left-[6%] bottom-[12%]"],
        ["Embedded", "Experience", "right-[6%] bottom-[12%]"],
      ].map(([a, b, pos], i) => (
        <div
          key={a}
          className={`absolute ${pos} w-[120px] rounded-[15px] border border-white/[0.08] bg-white/[0.025] p-3`}
        >
          <div className="text-[7px] font-bold text-[#D6A66A]">0{i + 1}</div>
          <div className="mt-3 text-[10px] font-semibold text-white/72">
            {a}
          </div>
          <div className="text-[8px] text-white/28">{b}</div>
        </div>
      ))}
    </div>
  );
}

function StudioWorkspace({ studio }) {
  const video = studio.startsWith("Video");
  const music = studio.startsWith("Music");
  const labels = video
    ? ["Story", "Scenes", "Shots", "Dailies", "Edit", "Master"]
    : music
      ? ["Compose", "Arrange", "Vocals", "SFX", "Mix", "Master"]
      : ["Research", "Direction", "Create", "Review", "Repair", "Deliver"];
  const art = video
    ? "/art/creative-video.jpg"
    : music
      ? "/art/creative-music.jpg"
      : "/art/creative-image.jpg";
  const status = video
    ? "SHOT 024 / REVIEW"
    : music
      ? "MASTER BUS / REVIEW"
      : "CAMPAIGN 01 / REVIEW";
  return (
    <section className="border-b border-black/[0.06] bg-[#F1ECE4] text-[#1C1A17]">
      <div className="mx-auto max-w-[1320px] px-5 py-20 sm:px-7 lg:px-10 lg:py-24">
        <div className="grid gap-10 lg:grid-cols-[.72fr_1.28fr] lg:items-end">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9A744B]">
              Inside {studio}
            </p>
            <h2 className="mt-3 max-w-xl text-[38px] font-medium leading-[1.02] tracking-[-0.05em] sm:text-[48px]">
              A real production workspace, connected end to end.
            </h2>
            <p className="mt-5 max-w-lg text-[13px] leading-7 text-[#706A62]">
              Direction, production state, review and approved output stay
              connected while the creative work remains human, visual and
              grounded in the real world.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            {labels.map((x, i) => (
              <span
                key={x}
                className={`rounded-full border px-3 py-1.5 text-[8px] font-semibold uppercase tracking-[0.14em] ${i === 3 ? "border-[#B78A52]/35 bg-white text-[#8A633C] shadow-sm" : "border-black/[0.08] bg-white/55 text-[#766F66]"}`}
              >
                {String(i + 1).padStart(2, "0")} {x}
              </span>
            ))}
          </div>
        </div>
        <div className="relative mt-10 min-h-[560px] overflow-hidden rounded-[30px] border border-black/[0.08] bg-[#CFC4B4] shadow-[0_34px_100px_rgba(71,50,28,.16)]">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${art})` }}
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(16,13,10,.58),rgba(16,13,10,.08)_38%,rgba(16,13,10,.06)_64%,rgba(16,13,10,.56)),linear-gradient(180deg,rgba(0,0,0,.02),rgba(0,0,0,.12)_54%,rgba(8,7,6,.58))]" />
          <div className="absolute left-5 top-5 rounded-full border border-white/22 bg-black/28 px-3 py-1.5 text-[8px] font-semibold uppercase tracking-[0.18em] text-[#F0C98F] backdrop-blur-xl">
            {status}
          </div>
          <div className="absolute right-5 top-5 hidden rounded-[16px] border border-white/20 bg-white/12 px-3 py-2 text-right text-white backdrop-blur-xl sm:block">
            <div className="text-[7px] uppercase tracking-[0.17em] text-[#F0C98F]">
              Live production context
            </div>
            <div className="mt-1 text-[8px] text-white/64">
              Brief · direction · review
            </div>
          </div>
          <div className="absolute bottom-5 left-5 right-5 grid gap-3 lg:grid-cols-[1.05fr_.95fr]">
            <div className="rounded-[22px] border border-white/20 bg-black/34 p-4 text-white backdrop-blur-xl sm:p-5">
              <div className="text-[7px] uppercase tracking-[0.18em] text-[#E9C28C]">
                Production path
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
                {labels.map((x, i) => (
                  <div
                    key={x}
                    className={`rounded-xl border p-2.5 ${i === 3 ? "border-[#E2B779]/55 bg-[#D6A66A]/14" : "border-white/12 bg-white/[0.035]"}`}
                  >
                    <div className="text-[7px] text-white/36">0{i + 1}</div>
                    <div className="mt-2 text-[8px] font-semibold text-white/74">
                      {x}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-[22px] border border-white/20 bg-white/82 p-4 text-[#24201B] shadow-sm backdrop-blur-xl sm:p-5">
              <div className="flex items-center justify-between">
                <span className="text-[7px] uppercase tracking-[0.18em] text-[#8A633C]">
                  Quality review
                </span>
                <span className="rounded-full border border-[#B78A52]/25 bg-[#F8F2E9] px-2 py-1 text-[7px] text-[#8A633C]">
                  TARGETED REPAIR
                </span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
                {[
                  ["Direction", 96],
                  ["Continuity", 93],
                  ["Craft", 95],
                  ["Delivery", 98],
                ].map(([x, v]) => (
                  <div key={x}>
                    <div className="flex justify-between text-[8px]">
                      <span className="text-[#716A61]">{x}</span>
                      <span className="font-semibold text-[#51493F]">{v}</span>
                    </div>
                    <div className="mt-1.5 h-1 rounded-full bg-black/[0.07]">
                      <div
                        className="h-full rounded-full bg-[#B4844E]"
                        style={{ width: `${v}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-[8px] leading-4 text-[#7A736A]">
                Approved work remains locked. Only the failed detail returns to
                production.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function CreativeStudioProductPage({
  studio,
  title,
  subtitle,
  description,
  capabilities,
  useCases,
  cta,
}) {
  return (
    <main className="min-h-screen bg-[#F7F6F3] text-[#191919]">
      <PublicSiteHeader
        context={studio}
        audience="creative"
        links={[
          {
            label: "Creative Studios",
            href: "/creative-studios",
            visibility: "hidden md:inline-flex",
          },
        ]}
      />

      <section className="border-b border-black/[0.06] bg-[#F7F6F3]">
        <div className="mx-auto grid max-w-[1460px] gap-12 px-5 py-16 sm:px-7 lg:grid-cols-[.9fr_1.1fr] lg:items-center lg:px-10 lg:py-24">
          <div className="max-w-[690px]">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#9A744B]">
              Avantiqo {studio}
            </p>
            <h1 className="mt-5 text-[48px] font-medium leading-[.98] tracking-[-0.055em] text-[#181817] sm:text-[62px] lg:text-[72px]">
              {title}
            </h1>
            <p className="mt-5 text-[12px] font-semibold uppercase tracking-[0.18em] text-[#8D643C]">
              {subtitle}
            </p>
            <p className="mt-6 max-w-xl text-[16px] leading-8 text-[#625F59]">
              {description}
            </p>
            <div className="mt-8 flex flex-wrap gap-2.5">
              <a
                href="#capabilities"
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#171716] px-5 text-[11px] font-semibold text-white"
              >
                Explore {studio} <Arrow className="h-3.5 w-3.5" />
              </a>
              <a
                href="#process"
                className="inline-flex h-11 items-center rounded-xl border border-black/[0.09] bg-white px-5 text-[11px] font-semibold text-[#56514A]"
              >
                See production flow
              </a>
            </div>
          </div>
          <StudioArtwork studio={studio} />
        </div>
      </section>

      <section
        id="capabilities"
        className="border-b border-black/[0.06] bg-[#FBFAF8]"
      >
        <div className="mx-auto max-w-[1320px] px-5 py-20 sm:px-7 lg:px-10 lg:py-24">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9A744B]">
            A complete production system
          </p>
          <h2 className="mt-3 max-w-3xl text-[36px] font-medium leading-[1.04] tracking-[-0.045em] sm:text-[46px]">
            Not a generator. A professional creative workflow.
          </h2>
          <div className="mt-10 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {capabilities.map(([name, text], i) => (
              <article
                key={name}
                className="group min-h-[205px] rounded-[22px] border border-black/[0.07] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,.02)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(61,45,27,.06)]"
              >
                <DisciplineGlyph studio={studio} index={i} />
                <div className="mt-4 text-[8px] font-bold text-[#A37849]">
                  0{i + 1}
                </div>
                <h3 className="mt-3 text-[14px] font-semibold text-[#302D29]">
                  {name}
                </h3>
                <p className="mt-2 text-[9px] leading-5 text-[#7A756E]">
                  {text}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <StudioWorkspace studio={studio} />

      <section
        id="process"
        className="border-b border-black/[0.06] bg-[#F7F6F3]"
      >
        <div className="mx-auto max-w-[1320px] px-5 py-20 sm:px-7 lg:px-10 lg:py-24">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9A744B]">
            From idea to impact
          </p>
          <h2 className="mt-3 max-w-3xl text-[36px] font-medium leading-[1.04] tracking-[-0.045em] sm:text-[46px]">
            One connected production path.
          </h2>
          <p className="mt-5 max-w-2xl text-[13px] leading-6 text-[#77716A]">
            The mission does not restart between stages. Direction, decisions,
            references and quality checks stay attached to the work all the way to
            delivery.
          </p>
          <ProductPath />
        </div>
      </section>

      <section className="border-b border-white/[0.06] bg-[#171716] text-white">
        <div className="mx-auto max-w-[1320px] px-5 py-20 sm:px-7 lg:px-10 lg:py-24">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#D6A66A]">
            Real business use
          </p>
          <h2 className="mt-3 max-w-3xl text-[36px] font-medium leading-[1.04] tracking-[-0.045em] text-[#F7F4EF] sm:text-[46px]">
            Creative output built to do a job.
          </h2>
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {useCases.map(([name, text], index) => (
              <div
                key={name}
                className="group rounded-[20px] border border-white/[0.08] bg-white/[0.025] p-5 transition hover:-translate-y-0.5 hover:border-[#D6A66A]/25 hover:bg-white/[0.04]"
              >
                <div className="relative h-36 overflow-hidden rounded-[16px] border border-white/[0.08] bg-[#15120e]">
                  <div
                    className="absolute inset-0 bg-cover transition duration-700 group-hover:scale-[1.04]"
                    style={{
                      backgroundImage: `url(${studio.startsWith("Music") ? "/art/creative-music.jpg" : studio.startsWith("Video") ? "/art/creative-video.jpg" : "/art/creative-image.jpg"})`,
                      backgroundPosition: [
                        "50% 42%",
                        "62% 48%",
                        "38% 46%",
                        "70% 52%",
                        "46% 58%",
                        "58% 38%",
                      ][index % 6],
                    }}
                  />
                  <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,.04),rgba(0,0,0,.12)_48%,rgba(7,6,5,.74))]" />
                  <div className="absolute left-3 top-3 rounded-full border border-white/18 bg-black/24 px-2.5 py-1 text-[7px] font-semibold uppercase tracking-[0.15em] text-[#E9C28C] backdrop-blur-xl">
                    0{index + 1}
                  </div>
                  <div className="absolute bottom-3 left-3 right-3 text-[7px] uppercase tracking-[0.15em] text-white/48">
                    {studio.startsWith("Video")
                      ? "Production frame"
                      : studio.startsWith("Music")
                        ? "Studio session"
                        : "Visual direction"}
                  </div>
                </div>
                <h3 className="mt-5 text-[14px] font-semibold text-white/82">
                  {name}
                </h3>
                <p className="mt-2 text-[10px] leading-5 text-white/38">
                  {text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-black/[0.06] bg-[#FBFAF8]">
        <div className="mx-auto max-w-[1320px] px-5 py-20 sm:px-7 lg:px-10 lg:py-24">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9A744B]">Creative production workspace</p>
          <h2 className="mt-3 max-w-3xl text-[36px] font-medium leading-[1.04] tracking-[-0.045em] sm:text-[46px]">Everything the creative team needs stays in one production environment.</h2>
          <p className="mt-5 max-w-2xl text-[13px] leading-7 text-[#706A62]">Briefs, references, direction, versions, reviews, repairs and final delivery remain attached to the project instead of being scattered across unrelated tools.</p>
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[['Brief & direction','Define the business goal, audience and creative direction.'],['Production','Create the visual, film or music work inside the same project.'],['Review & repair','Critique weak output, repair it and preserve the accepted direction.'],['Delivery','Approve, export and deliver production-ready assets.']].map(([t,d],i)=>(
              <div key={t} className="rounded-[22px] border border-black/[0.07] bg-white p-5"><div className="text-[8px] font-bold text-[#A37849]">0{i+1}</div><h3 className="mt-6 text-[15px] font-semibold text-[#302D29]">{t}</h3><p className="mt-2 text-[10px] leading-5 text-[#7A756E]">{d}</p></div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-black/[0.06] bg-[#F1ECE4]">
        <div className="mx-auto max-w-[1320px] px-5 py-20 sm:px-7 lg:px-10 lg:py-24">
          <div className="grid gap-8 lg:grid-cols-[.72fr_1.28fr] lg:items-end">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9A744B]">
                Ways to work with Creative Studios
              </p>
              <h2 className="mt-3 max-w-xl text-[36px] font-medium leading-[1.04] tracking-[-0.045em] sm:text-[46px]">
                Choose the production support that matches the job.
              </h2>
            </div>
            <p className="max-w-2xl text-[13px] leading-7 text-[#706A62] lg:justify-self-end">
              Choose a complete production mission, recurring creative capacity or a focused production package depending on what the brand needs.
            </p>
          </div>
          <div className="mt-10 grid gap-3 lg:grid-cols-3">
            {[
              [
                "Production mission",
                "A defined creative outcome with research, direction, production, review and final delivery.",
                "START A PROJECT",
              ],
              [
                "Creative retainer",
                "Recurring production capacity for brands and teams that need a continuous flow of approved work.",
                "ONGOING CAPACITY",
              ],
              [
                "Focused production package",
                "A defined set of deliverables for launches, campaigns, recurring content or specialist production work.",
                "DEFINED DELIVERY",
              ],
            ].map(([title, text, label], i) => (
              <div
                key={title}
                className="rounded-[24px] border border-black/[0.07] bg-white p-6 shadow-[0_14px_42px_rgba(46,34,23,.04)]"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[8px] font-bold text-[#A37849]">
                    0{i + 1}
                  </span>
                  <span className="text-[6px] font-semibold uppercase tracking-[0.16em] text-[#9A744B]">
                    {label}
                  </span>
                </div>
                <h3 className="mt-8 text-[19px] font-semibold tracking-[-0.03em] text-[#2A2723]">
                  {title}
                </h3>
                <p className="mt-3 text-[10px] leading-5 text-[#756F67]">
                  {text}
                </p>
                <div className="mt-6 h-px bg-black/[0.06]">
                  <div
                    className="h-px bg-[#D6A66A]/65"
                    style={{ width: `${48 + i * 18}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#F7F6F3]">
        <div className="mx-auto max-w-[1320px] px-5 py-20 sm:px-7 lg:px-10 lg:py-24">
          <div className="relative overflow-hidden rounded-[34px] border border-black/[0.08] bg-[#12110f] px-6 py-16 text-center text-white shadow-[0_28px_90px_rgba(46,34,23,.11)] sm:px-10 lg:py-20">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_115%,rgba(214,166,106,.27),transparent_38%)]" />
            <div className="relative">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#D6A66A]">
                A more creative tomorrow
              </p>
              <h2 className="mx-auto mt-4 max-w-4xl text-[38px] font-medium leading-[1.02] tracking-[-0.05em] text-[#F7F4EF] sm:text-[50px]">
                {cta}
              </h2>
              <div className="mx-auto mt-5 h-px max-w-sm bg-gradient-to-r from-transparent via-[#D6A66A]/38 to-transparent" />
              <div className="mt-8 flex flex-wrap justify-center gap-2.5">
                <a
                  href="/login"
                  className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#F7F4EF] px-5 text-[11px] font-semibold text-[#171716]"
                >
                  Enter Avantiqo <Arrow className="h-3.5 w-3.5" />
                </a>
                <a
                  href="/creative-studios"
                  className="inline-flex h-11 items-center rounded-xl border border-white/[0.12] bg-white/[0.03] px-5 text-[11px] font-semibold text-white/70"
                >
                  All Creative Studios
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
