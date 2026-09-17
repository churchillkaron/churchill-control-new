import PublicSiteHeader from "@/components/public/PublicSiteHeader";

export const metadata = { title: "Start with Avantiqo | Avantiqo" };

const PATHS = [
  [
    "Business",
    "Business OS",
    "For owners, managers and teams running finance, operations, supply chain, commercial work, people, projects and documents.",
    "ERP & operations",
    "/",
    "Enter Business OS",
  ],
  [
    "Creative",
    "Creative Studios",
    "For brands and production teams creating professional image, video and music through complete production workflows.",
    "Production missions",
    "/creative-studios",
    "Enter Creative Studios",
  ],
  [
    "Developers",
    "Developer Platform",
    "For developers building applications, integrations, automations and embedded experiences on Avantiqo.",
    "SDKs & tooling",
    "/developers",
    "Enter Developers",
  ],
  [
    "API",
    "Avantiqo API",
    "For products and systems consuming governed Avantiqo capabilities through metered APIs and jobs.",
    "Usage based",
    "/api-platform",
    "Enter API Platform",
  ],
  [
    "Compute",
    "Avantiqo Compute",
    "For workloads that need GPU or specialist infrastructure, with owned capacity first and governed overflow when needed.",
    "Infrastructure",
    "/compute",
    "Enter Compute",
  ],
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
      <PublicSiteHeader
        context="Start"
        audience="platform"
        links={[
          { label: "Solutions", href: "/solutions" },
          { label: "Pricing", href: "/pricing" },
          { label: "Developers", href: "/developers" },
        ]}
      />
      <section className="relative overflow-hidden border-b border-black/[0.06] bg-[#F4F0E8]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(214,166,106,.14),transparent_30%)]" />
        <div className="relative mx-auto grid max-w-[1540px] lg:min-h-[690px] lg:grid-cols-[43%_57%]">
          <div className="flex items-center px-5 py-16 sm:px-7 lg:px-10 lg:py-20 xl:px-14">
            <div className="max-w-[620px]">
              <p className="text-[10px] font-semibold uppercase tracking-[0.30em] text-[#9A744B]">
                START WITH AVANTIQO
              </p>
              <h1 className="mt-5 text-[50px] font-medium leading-[.96] tracking-[-0.06em] text-[#171614] sm:text-[64px] lg:text-[72px]">
                Choose your Avantiqo workspace.
              </h1>
              <p className="mt-7 max-w-xl text-[16px] leading-8 text-[#625F59]">
                Business customers, creative teams, developers, API users and compute customers each enter a focused environment. The platform stays connected underneath without mixing the journeys on the surface.
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
          <div className="relative min-h-[560px] overflow-hidden border-t border-black/[0.06] bg-[#151310] lg:min-h-0 lg:border-l lg:border-t-0">
            <div className="absolute inset-0 grid grid-cols-[1.25fr_.75fr] gap-px bg-[#D6A66A]/20">
              <div className="relative overflow-hidden">
                <div
                  className="absolute inset-0 bg-cover bg-center"
                  style={{ backgroundImage: "url(/bg-hero-control.jpg)" }}
                />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,.02),rgba(0,0,0,.10)_46%,rgba(6,5,4,.72))]" />
              </div>
              <div className="grid grid-rows-2 gap-px bg-[#D6A66A]/20">
                <div className="relative overflow-hidden">
                  <div
                    className="absolute inset-0 bg-cover bg-center"
                    style={{ backgroundImage: "url(/art/creative-image.jpg)" }}
                  />
                  <div className="absolute inset-0 bg-black/18" />
                </div>
                <div className="relative overflow-hidden">
                  <div
                    className="absolute inset-0 bg-cover bg-center"
                    style={{
                      backgroundImage:
                        "url(/branding/avantiqo-intelligence-core-hero.webp)",
                    }}
                  />
                  <div className="absolute inset-0 bg-black/16" />
                </div>
              </div>
            </div>
            <div className="absolute left-7 top-7 text-[7px] font-semibold uppercase tracking-[0.24em] text-[#F1C98E]">
              AVANTIQO / CHOOSE YOUR WORKSPACE
            </div>
            <div className="absolute bottom-7 left-7 right-7 rounded-[24px] border border-white/[0.14] bg-[#11100E]/74 p-5 text-white shadow-[0_28px_80px_rgba(0,0,0,.28)] backdrop-blur-xl sm:p-6">
              <div className="text-[7px] font-semibold uppercase tracking-[0.21em] text-[#D6A66A]">
                BUSINESS · CREATIVE · DEVELOPERS · API · COMPUTE
              </div>
              <div className="mt-3 max-w-2xl text-[14px] leading-6 text-white/70">
                Separate customer journeys above. Shared Avantiqo infrastructure underneath — with
                ways for customers, developers, partners and infrastructure
                owners to create value.
              </div>
            </div>
          </div>
        </div>
      </section>
      <section id="paths" className="bg-[#FBFAF8]">
        <div className="mx-auto max-w-[1320px] px-5 py-16 sm:px-7 lg:px-10 lg:py-20">
          <div className="grid gap-3 md:grid-cols-2">
            {PATHS.map(([title, area, description, status, href, cta], i) => (
              <a
                key={area}
                href={href}
                className="group rounded-[26px] border border-black/[0.075] bg-white p-6 shadow-[0_14px_45px_rgba(40,30,20,.035)] transition hover:-translate-y-0.5 hover:border-[#D6A66A]/35 sm:p-7"
              >
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
              </a>
            ))}
          </div>
        </div>
      </section>
      <section className="bg-[#171716] text-white">
        <div className="mx-auto grid max-w-[1320px] gap-10 px-5 py-16 sm:px-7 lg:grid-cols-[1fr_.8fr] lg:items-center lg:px-10 lg:py-20">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[#D6A66A]">
              Commercial architecture
            </p>
            <h2 className="mt-3 max-w-3xl text-[38px] font-medium leading-[1.03] tracking-[-0.05em] text-[#F7F4EF] sm:text-[50px]">
              Subscription. Consumption. Transactions. Platform economics.
            </h2>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              "Software subscriptions",
              "Vertical solution packages",
              "Professional services",
              "Creative missions",
              "API usage",
              "Compute usage & host supply",
              "Governed agents",
              "Premium insights",
              "Integration economics",
              "Templates & packs",
              "White-label / embedded",
              "Training & certification",
              "Private enterprise deployments",
              "Transaction revenue",
            ].map((x) => (
              <div
                key={x}
                className="rounded-[16px] border border-white/[0.08] bg-white/[0.025] px-4 py-3 text-[10px] text-white/55"
              >
                {x}
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
