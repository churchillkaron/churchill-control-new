import PublicSiteHeader from "@/components/public/PublicSiteHeader";
import PublicArtStage from "@/components/public/PublicArtStage";

export const metadata = { title: "Start with Avantiqo | Avantiqo" };

const PATHS = [
  ["Run", "Business OS", "Finance, operations, supply chain, commercial, people, projects and analytics in one governed operating system.", "Operate", "/business", "Enter Business OS", "/bg-hero-control.jpg", null],
  ["Think", "Intelligence", "Business Partner, agents, research, memory, learning, insights and governed execution.", "Reason & act", "/intelligence-platform", "Enter Intelligence", "/branding/avantiqo-intelligence-core-hero.webp", "intelligence"],
  ["Create", "Creative Studios", "Image, video, music and production missions with research, direction, review and repair.", "Produce", "/creative-studios", "Enter Creative Studios", "/art/creative-image.jpg", null],
  ["Speak", "Voice", "Speech-to-text, realtime transcription, TTS, voice production and telephony connected to intelligence.", "Listen & respond", "/voice", "Enter Voice", "/art/creative-music.jpg", "voice"],
  ["Build", "Avantiqo Code", "Software work from understanding and planning through build, test, integration and verification.", "Engineer", "/code", "Enter Code", "/art/developer-work.jpg", "code"],
  ["Process", "Documents", "OCR, extraction, classification, validation and document understanding connected to business workflows.", "Understand files", "/documents", "Enter Documents", "/art/commercial-integrations.jpg", "documents"],
  ["Develop", "Developer Platform", "SDKs, tools and embedded experiences for teams building on Avantiqo.", "Build on Avantiqo", "/developers", "Enter Developers", "/art/developer-work.jpg", "developer"],
  ["Connect", "API Platform", "Governed Avantiqo capabilities exposed through APIs, jobs, webhooks and metered execution.", "Consume capabilities", "/api-platform", "Enter API Platform", "/art/commercial-integrations.jpg", "api"],
  ["Scale", "Compute", "GPU, inference, rendering, batch and specialist infrastructure with owned capacity first.", "Run workloads", "/compute", "Enter Compute", "/art/commercial-compute.jpg", "compute"],
];

function Arrow() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="h-3.5 w-3.5"
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

export default function StartPage() {
  return (
    <main className="min-h-screen bg-[#F7F6F3] text-[#191919]">
      <PublicSiteHeader context="Start" audience="platform" />
      <section className="relative overflow-hidden border-b border-black/[0.06] bg-[#F4F0E8]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(214,166,106,.14),transparent_30%)]" />
        <div className="relative mx-auto grid max-w-[1540px] lg:min-h-[690px] lg:grid-cols-[43%_57%]">
          <div className="flex items-center px-5 py-16 sm:px-7 lg:px-10 lg:py-20 xl:px-14">
            <div className="max-w-[620px]">
              <p className="text-[10px] font-semibold uppercase tracking-[0.30em] text-[#9A744B]">
                START WITH AVANTIQO
              </p>
              <h1 className="mt-5 text-[50px] font-medium leading-[.96] tracking-[-0.06em] text-[#171614] sm:text-[64px] lg:text-[72px]">
                Enter the Avantiqo world you need.
              </h1>
              <p className="mt-7 max-w-xl text-[16px] leading-8 text-[#625F59]">
                Run a company, work with intelligence, create, speak, build software, process documents, use APIs or run compute. Each world has its own customer journey while identity, capabilities, Wallet, execution and evidence stay connected underneath.
              </p>
              <div className="mt-9 flex flex-wrap gap-2.5">
                <a
                  href="#paths"
                  className="inline-flex h-11 items-center gap-2 rounded-full bg-[#171614] px-5 text-[10px] font-semibold text-white"
                >
                  Choose a workspace <Arrow />
                </a>
                <a
                  href="/pricing"
                  className="inline-flex h-11 items-center rounded-full border border-black/[0.10] bg-white/70 px-5 text-[10px] font-semibold text-[#56514A]"
                >
                  Commercial model
                </a>
              </div>
            </div>
          </div>
          <div className="relative min-h-[560px] overflow-hidden border-t border-black/[0.06] bg-[#171614] lg:min-h-0 lg:border-l lg:border-t-0">
            <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-px bg-[#D6A66A]/28">
              {[["RUN","/bg-hero-control.jpg"],["CREATE","/art/creative-video.jpg"],["BUILD","/art/developer-work.jpg"],["SCALE","/art/commercial-compute.jpg"]].map(([label,image]) => (
                <div key={label} className="relative overflow-hidden">
                  <div className="absolute inset-0 scale-[1.025] bg-cover bg-center" style={{ backgroundImage: `url(${image})` }} />
                  <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(17,14,11,.04),rgba(17,14,11,.13)_48%,rgba(17,14,11,.68))]" />
                  <div className="absolute bottom-5 left-5 text-[7px] font-semibold uppercase tracking-[0.22em] text-[#F1C98E]">{label}</div>
                </div>
              ))}
            </div>
            <div className="absolute left-7 top-7 text-[7px] font-semibold uppercase tracking-[0.24em] text-[#F1C98E]">
              AVANTIQO / CHOOSE YOUR WORKSPACE
            </div>
            <div className="absolute bottom-7 left-7 right-7 rounded-[24px] border border-white/[0.14] bg-[#11100E]/74 p-5 text-white shadow-[0_28px_80px_rgba(0,0,0,.28)] backdrop-blur-xl sm:p-6">
              <div className="text-[7px] font-semibold uppercase tracking-[0.21em] text-[#D6A66A]">
                RUN · THINK · CREATE · VOICE · CODE · DOCUMENTS · API · COMPUTE
              </div>
              <div className="mt-3 max-w-2xl text-[14px] leading-6 text-white/70">
                Different product worlds above. One Avantiqo core underneath — identity, context, capabilities, intelligence, Wallet, execution, evidence and billing.
              </div>
            </div>
          </div>
        </div>
      </section>
      <section id="paths" className="bg-[#FBFAF8]">
        <div className="mx-auto max-w-[1320px] px-5 py-16 sm:px-7 lg:px-10 lg:py-20">
          <div className="grid gap-3 md:grid-cols-2">
            {PATHS.map(([title, area, description, status, href, cta, image, artKind], i) => (
              <a
                key={area}
                href={href}
                className="group overflow-hidden rounded-[26px] border border-black/[0.075] bg-white shadow-[0_14px_45px_rgba(40,30,20,.035)] transition hover:-translate-y-0.5 hover:border-[#D6A66A]/35"
              >
                <div className="relative h-[220px] overflow-hidden bg-[#171614]">
                  {artKind ? <PublicArtStage kind={artKind} /> : <div className="absolute inset-0 bg-cover bg-center transition duration-700 group-hover:scale-[1.03]" style={{ backgroundImage: `url(${image})` }} />}
                  <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,.03),rgba(0,0,0,.12)_48%,rgba(8,7,6,.72))]" />
                  <div className="absolute left-5 top-5 rounded-full border border-white/20 bg-black/22 px-3 py-1.5 text-[7px] font-semibold uppercase tracking-[0.16em] text-[#F1C98E] backdrop-blur-xl">AVANTIQO / {area}</div>
                  <div className="absolute bottom-5 left-5 right-5 flex items-end justify-between gap-5">
                    <div className="text-[10px] font-medium text-white/74">{status}</div>
                    <div className="text-[7px] uppercase tracking-[0.16em] text-white/34">Separate workspace</div>
                  </div>
                </div>
                <div className="p-6 sm:p-7">
                <div className="flex items-start justify-between gap-5">
                  <div>
                    <div className="text-[8px] font-semibold uppercase tracking-[0.18em] text-[#A37849]">
                      0{i + 1} · {area}
                    </div>
                    <h2 className="mt-5 text-[28px] font-medium tracking-[-0.045em] text-[#1D1B18]">
                      {title}
                    </h2>
                  </div>
                  <span className="rounded-full border border-[#D6A66A]/25 bg-[#D6A66A]/[0.06] px-2.5 py-1.5 text-[7px] font-semibold uppercase tracking-[0.14em] text-[#8A633C]">
                    {status}
                  </span>
                </div>
                <p className="mt-4 max-w-xl text-[11px] leading-6 text-[#746F68]">
                  {description}
                </p>
                <div className="mt-7 inline-flex items-center gap-2 text-[10px] font-semibold text-[#8A633C]">
                  {cta}
                  <Arrow />
                </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>
      <section className="border-y border-black/[0.06] bg-[#F4F0E8]">
        <div className="mx-auto max-w-[1320px] px-5 py-16 sm:px-7 lg:px-10 lg:py-20">
          <div className="grid gap-8 lg:grid-cols-[.72fr_1.28fr] lg:items-end">
            <div><p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-[#9A744B]">ONE ACCOUNT · DIFFERENT WAYS TO BUY VALUE</p><h2 className="mt-3 text-[36px] font-medium leading-[1.03] tracking-[-0.05em] text-[#1D1B18] sm:text-[48px]">Use only the Avantiqo layer you need.</h2></div>
            <p className="max-w-2xl text-[13px] leading-7 text-[#706A62] lg:justify-self-end">Business software can be subscription-led, while creative missions, API usage, compute and enterprise implementation remain clear commercial layers around the same Avantiqo account.</p>
          </div>
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[["Business OS","Subscription","/business"],["Creative Studios","Mission / package","/creative-studios"],["Developers & API","Usage","/developers"],["Compute","Usage / reserved","/compute"],["Enterprise","Contract / services","/enterprise"]].map(([title,model,href],i)=>(<a key={title} href={href} className="group rounded-[22px] border border-black/[0.075] bg-white/72 p-5 transition hover:-translate-y-0.5 hover:border-[#D6A66A]/40"><div className="flex items-center justify-between"><span className="text-[8px] font-bold text-[#A37849]">0{i+1}</span><span className="text-[8px] text-[#9A8F82]">→</span></div><div className="mt-8 text-[15px] font-semibold text-[#302D29]">{title}</div><div className="mt-2 text-[9px] uppercase tracking-[0.15em] text-[#9A744B]">{model}</div></a>))}
          </div>
        </div>
      </section>
      <section className="bg-[#171716] text-white">
        <div className="mx-auto grid max-w-[1320px] gap-10 px-5 py-16 sm:px-7 lg:grid-cols-[.9fr_1.1fr] lg:items-center lg:px-10 lg:py-20">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[#D6A66A]">ONE AVANTIQO CORE</p>
            <h2 className="mt-3 max-w-3xl text-[38px] font-medium leading-[1.03] tracking-[-0.05em] text-[#F7F4EF] sm:text-[50px]">Different worlds. Shared intelligence and execution underneath.</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {["Identity","Organization","Business Context","Capabilities","Intelligence","Wallet","Execution","Evidence","Billing"].map((x, i) => (
              <div key={x} className="flex items-center gap-2 rounded-full border border-white/[0.09] bg-white/[0.035] px-4 py-3 text-[9px] text-white/58">
                <span className="text-[7px] font-semibold text-[#D6A66A]">0{String(i + 1).padStart(2,"0")}</span>{x}
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
