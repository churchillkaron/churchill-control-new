import Link from "next/link";

export const dynamic = "force-dynamic";

const capabilityGroups = [
  {
    title: "Operate",
    copy: "Finance, operations, supply chain, people, projects, documents and compliance connected through one operating model.",
    items: ["Finance", "Operations", "Supply Chain", "People", "Projects", "Compliance"],
  },
  {
    title: "Understand",
    copy: "Live analytics, forecasting and executive intelligence that turn company activity into clear decisions.",
    items: ["Analytics", "Forecasting", "Risk", "Executive Intelligence", "Business Health", "Planning"],
  },
  {
    title: "Create",
    copy: "Campaigns, advertising, websites, presentations, video, imagery and brand systems produced by an autonomous creative studio.",
    items: ["Advertising", "Creative Studio", "Websites", "Video", "Brand Systems", "Campaigns"],
  },
  {
    title: "Automate",
    copy: "Synthetic intelligence coordinates workflows, approvals, resources and outcomes across the entire business.",
    items: ["Workflows", "Agents", "Approvals", "Scheduling", "Orchestration", "Automation"],
  },
];

const systemSignals = [
  ["Continuous intelligence", "Always observing business context"],
  ["Universal architecture", "Built for companies across industries"],
  ["One operating model", "People, data, work and decisions connected"],
  ["Adaptive execution", "From insight to action without fragmentation"],
];

function BrandIdentity() {
  return (
    <div className="flex items-center gap-4">
      <div className="relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-[#D6A66A]/30 bg-black/30 shadow-[0_0_40px_rgba(214,166,106,.12)]">
        <img
          src="/app/branding/avantiqo-logo.webp"
          alt="Avantiqo"
          width="180"
          height="120"
          className="h-12 w-auto object-contain"
        />
      </div>
      <div>
        <div className="text-[16px] font-medium uppercase tracking-[0.34em] text-[#F3E8D2]">Avantiqo</div>
        <div className="mt-1 text-[8px] uppercase tracking-[0.28em] text-[#D6A66A]/62">
          Synthetic Intelligence Operating System
        </div>
      </div>
    </div>
  );
}

function OrbitGraphic() {
  const nodes = [
    ["Finance", "left-[1%] top-[46%]"],
    ["Operations", "right-[1%] top-[46%]"],
    ["Commercial", "left-[18%] top-[10%]"],
    ["Creative", "right-[18%] top-[10%]"],
    ["People", "left-[18%] bottom-[10%]"],
    ["Analytics", "right-[18%] bottom-[10%]"],
  ];

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[640px]">
      <div className="absolute inset-[5%] rounded-full border border-[#D6A66A]/10" />
      <div className="absolute inset-[15%] rounded-full border border-[#D6A66A]/14" />
      <div className="absolute inset-[26%] rounded-full border border-[#D6A66A]/20" />
      <div className="absolute inset-[36%] rounded-full border border-[#D6A66A]/30 shadow-[0_0_80px_rgba(214,166,106,.08)]" />

      <div className="absolute inset-[36%] flex items-center justify-center rounded-full border border-[#F0C978]/50 bg-[radial-gradient(circle_at_35%_30%,rgba(214,166,106,.25),rgba(6,6,6,.96)_62%)] shadow-[0_0_100px_rgba(214,166,106,.14)]">
        <div className="text-center">
          <div className="font-serif text-[46px] text-[#F4DBA4] sm:text-[60px]">A</div>
          <div className="mt-1 text-[7px] uppercase tracking-[0.38em] text-white/45">Synthetic Core</div>
        </div>
      </div>

      {nodes.map(([label, position]) => (
        <div
          key={label}
          className={`absolute ${position} flex h-16 min-w-16 items-center justify-center rounded-full border border-white/[0.09] bg-black/75 px-3 text-[8px] uppercase tracking-[0.2em] text-white/58 shadow-[0_12px_34px_rgba(0,0,0,.55)] backdrop-blur-xl sm:h-20 sm:min-w-20`}
        >
          {label}
        </div>
      ))}
    </div>
  );
}

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#030303] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_72%_18%,rgba(214,166,106,.1),transparent_28%),radial-gradient(circle_at_18%_62%,rgba(120,84,120,.07),transparent_32%)]" />
      <div className="pointer-events-none fixed inset-0 opacity-[0.13] [background-image:linear-gradient(rgba(255,255,255,.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.035)_1px,transparent_1px)] [background-size:52px_52px] [mask-image:linear-gradient(to_bottom,black,transparent_78%)]" />

      <section className="relative z-10 mx-auto grid min-h-screen w-full max-w-[1500px] items-center gap-12 px-6 py-14 sm:px-10 lg:grid-cols-[0.94fr_1.06fr] lg:px-14 lg:py-20">
        <div className="max-w-[700px]">
          <BrandIdentity />

          <div className="mt-10 inline-flex items-center gap-3 rounded-full border border-[#D6A66A]/20 bg-[#D6A66A]/[0.04] px-4 py-2 text-[9px] uppercase tracking-[0.28em] text-[#D6A66A]/80">
            <span className="h-1.5 w-1.5 rounded-full bg-[#D6A66A] shadow-[0_0_14px_rgba(214,166,106,.9)]" />
            Coming soon
          </div>

          <h1 className="mt-7 font-serif text-[clamp(3.6rem,7.8vw,7.8rem)] font-normal leading-[0.86] tracking-[-0.055em] text-[#F3EFE8]">
            Synthetic
            <br />
            <span className="bg-gradient-to-r from-[#A96D2B] via-[#F1D28D] to-[#A47886] bg-clip-text text-transparent">
              Intelligence
            </span>
            <br />
            Operating System
          </h1>

          <p className="mt-8 max-w-[610px] text-[15px] leading-7 text-white/52 sm:text-[17px] sm:leading-8">
            A universal operating system that connects every business function, understands the full company context, and coordinates work from strategy to execution.
          </p>

          <div className="mt-9 flex flex-wrap gap-3">
            {["Unify", "Understand", "Create", "Operate", "Scale"].map((item) => (
              <span
                key={item}
                className="rounded-full border border-white/[0.08] bg-white/[0.025] px-4 py-2 text-[9px] uppercase tracking-[0.22em] text-white/45"
              >
                {item}
              </span>
            ))}
          </div>

          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Link
              href="/login"
              aria-label="Open Avantiqo system login"
              className="rounded-full border border-[#F1CF85] bg-[linear-gradient(100deg,#8B571F,#D9A54D,#F1D18B,#A76C27)] px-7 py-4 text-[10px] font-semibold uppercase tracking-[0.22em] text-black shadow-[0_16px_50px_rgba(191,128,45,.16)] transition hover:brightness-110"
            >
              Login to Avantiqo
            </Link>
            <span className="text-[9px] uppercase tracking-[0.24em] text-white/28">Private system access</span>
          </div>
        </div>

        <OrbitGraphic />
      </section>

      <section className="relative z-10 border-y border-white/[0.06] bg-white/[0.018]">
        <div className="mx-auto grid w-full max-w-[1500px] gap-px bg-white/[0.06] sm:grid-cols-2 lg:grid-cols-4">
          {systemSignals.map(([title, copy]) => (
            <div key={title} className="bg-[#050505] px-7 py-8 lg:px-8">
              <div className="text-[10px] uppercase tracking-[0.25em] text-[#D6A66A]/80">{title}</div>
              <p className="mt-3 text-[12px] leading-5 text-white/36">{copy}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="relative z-10 mx-auto w-full max-w-[1500px] px-6 py-24 sm:px-10 lg:px-14 lg:py-32">
        <div className="max-w-3xl">
          <div className="text-[9px] uppercase tracking-[0.34em] text-[#D6A66A]/65">One system. The whole business.</div>
          <h2 className="mt-5 font-serif text-4xl leading-tight text-[#F3EFE8] sm:text-6xl">
            Built beyond software modules.
            <span className="block text-white/28">Designed as a living operating system.</span>
          </h2>
        </div>

        <div className="mt-14 grid gap-4 md:grid-cols-2">
          {capabilityGroups.map((group, index) => (
            <article
              key={group.title}
              className="group relative overflow-hidden rounded-[28px] border border-white/[0.075] bg-[linear-gradient(145deg,rgba(18,18,18,.94),rgba(7,7,7,.96))] p-7 sm:p-9"
            >
              <div className="pointer-events-none absolute right-0 top-0 h-44 w-44 rounded-full bg-[#D6A66A]/[0.045] blur-3xl transition group-hover:bg-[#D6A66A]/[0.08]" />
              <div className="relative">
                <div className="text-[9px] uppercase tracking-[0.28em] text-[#D6A66A]/55">0{index + 1}</div>
                <h3 className="mt-4 font-serif text-4xl text-[#F2EBDD]">{group.title}</h3>
                <p className="mt-4 max-w-xl text-[13px] leading-6 text-white/40">{group.copy}</p>
                <div className="mt-8 flex flex-wrap gap-2">
                  {group.items.map((item) => (
                    <span
                      key={item}
                      className="rounded-full border border-white/[0.075] bg-black/30 px-3 py-2 text-[8px] uppercase tracking-[0.19em] text-white/38"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="relative z-10 border-t border-white/[0.06] px-6 py-20 sm:px-10 lg:px-14 lg:py-28">
        <div className="mx-auto w-full max-w-[1500px] text-center">
          <div className="text-[9px] uppercase tracking-[0.34em] text-[#D6A66A]/60">The next operating layer</div>
          <h2 className="mx-auto mt-5 max-w-5xl font-serif text-[clamp(2.8rem,6vw,6rem)] leading-[0.95] tracking-[-0.04em] text-[#F1ECE3]">
            Your company will not simply use Avantiqo.
            <span className="block bg-gradient-to-r from-[#D8A95D] to-[#9B7884] bg-clip-text text-transparent">
              It will operate through it.
            </span>
          </h2>
        </div>
      </section>

      <footer className="relative z-10 border-t border-white/[0.05] px-6 py-8 sm:px-10 lg:px-14">
        <div className="mx-auto flex w-full max-w-[1500px] flex-col justify-between gap-3 text-[8px] uppercase tracking-[0.24em] text-white/22 sm:flex-row">
          <span>Avantiqo</span>
          <span>Synthetic Intelligence Operating System</span>
          <span>Coming Soon</span>
        </div>
      </footer>
    </main>
  );
}
