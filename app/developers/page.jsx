import Image from "next/image";
import PublicSiteHeader from "@/components/public/PublicSiteHeader";

const capabilityFamilies = [
  {
    name: "Finance",
    code: "FIN",
    image: "/art/generated/products/products-finance-v1.png",
    description:
      "Embed accounting and financial operations without rebuilding the underlying business logic.",
    capabilities: [
      "Invoice extraction",
      "Three-way matching",
      "Bank reconciliation",
      "Ledger posting",
      "VAT & tax",
      "Cash forecasting",
    ],
  },
  {
    name: "Documents",
    code: "DOC",
    image: "/art/generated/products/products-documents-v1.png",
    description:
      "Turn business documents into structured, validated and actionable data.",
    capabilities: [
      "OCR",
      "Classification",
      "Field extraction",
      "Table extraction",
      "Document validation",
      "Semantic retrieval",
    ],
  },
  {
    name: "Intelligence",
    code: "INT",
    image: "/art/generated/products/products-intelligence-v2.png",
    description:
      "Add business-aware reasoning, organization scope and controlled execution to your own product.",
    capabilities: [
      "Organization context",
      "Knowledge retrieval",
      "Planning",
      "Agent execution",
      "Verification",
      "Decision records",
    ],
  },
  {
    name: "Creative",
    code: "CRE",
    image: "/art/generated/products/products-creative-v2.png",
    description:
      "Use production workflows, not just generators: brief, direction, generation, review and repair.",
    capabilities: [
      "Image Studio",
      "Video Studio",
      "Music Studio",
      "Creative direction",
      "Quality review",
      "Production orchestration",
    ],
  },
  {
    name: "Operations",
    code: "OPS",
    image: "/art/generated/products/products-stock-v1.png",
    description:
      "Bring operational capability into software for restaurants, hotels, field service and more.",
    capabilities: [
      "Inventory",
      "Procurement",
      "Recipe costing",
      "Service management",
      "POS operations",
      "Hospitality workflows",
    ],
  },
  {
    name: "People",
    code: "PPL",
    image: "/art/generated/products/products-people-v1.png",
    description:
      "Embed workforce context, attendance, scheduling and labor intelligence.",
    capabilities: [
      "Attendance",
      "Scheduling",
      "Availability",
      "Qualifications",
      "Payroll workflows",
      "Workforce intelligence",
    ],
  },
];

const integrationModes = [
  ["SDKs", "Build against stable Avantiqo contracts from your application code."],
  ["Webhooks", "React to completed jobs, business events and execution results."],
  ["Developer tools", "Use local tooling, test contexts and capability discovery while building integrations."],
  ["Embedded workflows", "Place selected Avantiqo flows inside your own product experience."],
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
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Check({ className = "" }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className={className}
      fill="none"
    >
      <circle
        cx="10"
        cy="10"
        r="7.25"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path
        d="m6.8 10.1 2 2 4.5-4.6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export const metadata = {
  title: "Developers | Avantiqo",
  description:
    "Build with Avantiqo business capabilities across finance, documents, intelligence, creative, operations and people.",
};

export default function DevelopersPage() {
  return (
    <main className="min-h-screen bg-[#F7F6F3] text-[#191919]">
      <header className="sticky top-0 z-50 border-b border-black/[0.07] bg-[#F7F6F3]/95 backdrop-blur-xl">
        <div className="mx-auto flex h-[62px] max-w-[1460px] items-center justify-between gap-5 px-5 sm:px-7 lg:px-10">
          <a href="/" className="flex items-center gap-3" aria-label="Avantiqo home">
            <span className="rounded-xl bg-[#171716] px-3 py-2 shadow-[0_4px_16px_rgba(0,0,0,.08)]">
              <Image src="/branding/avantiqo-wordmark.png" alt="Avantiqo" width={126} height={10} className="h-[10px] w-auto object-contain" priority />
            </span>
            <div className="hidden text-[7px] font-semibold uppercase tracking-[0.18em] text-[#9A744B] sm:block">Developers</div>
          </a>
          <nav className="flex items-center gap-1 sm:gap-1.5">
            <a href="#capabilities" className="hidden rounded-lg px-3 py-2 text-[10px] font-medium text-[#6C6963] transition hover:bg-white hover:text-[#292723] md:inline-flex">Capabilities</a>
            <a href="#integration" className="hidden rounded-lg px-3 py-2 text-[10px] font-medium text-[#6C6963] transition hover:bg-white hover:text-[#292723] md:inline-flex">Integration</a>
            <a href="/creative-studios" className="hidden rounded-lg px-3 py-2 text-[10px] font-medium text-[#6C6963] transition hover:bg-white hover:text-[#292723] lg:inline-flex">Creative Studios</a>
            <a href="/" className="hidden rounded-lg px-3 py-2 text-[10px] font-medium text-[#6C6963] transition hover:bg-white hover:text-[#292723] xl:inline-flex">Platform</a>
            <a href="#access" className="ml-1 inline-flex h-9 items-center gap-2 rounded-xl bg-[#171716] px-4 text-[10px] font-semibold text-white shadow-[0_3px_10px_rgba(20,18,15,0.15)] transition hover:bg-[#2A2926]">Developer access <Arrow className="h-3 w-3" /></a>
          </nav>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-black/[0.07] bg-[#F4F0E8] text-[#171614]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(214,166,106,.16),transparent_31%)]" />
        <div className="relative mx-auto max-w-[1460px] gap-12 px-5 py-16 sm:px-7 lg:grid lg:min-h-[700px] lg:grid-cols-[.9fr_1.1fr] lg:items-center lg:px-10 lg:py-24">
          <div className="relative z-10 flex items-center">
            <div className="max-w-[620px]">
              <p className="text-[9px] font-semibold uppercase tracking-[0.30em] text-[#D6A66A]">
                AVANTIQO DEVELOPERS
              </p>
              <h1 className="mt-5 text-[52px] font-medium leading-[.94] tracking-[-0.065em] text-[#171614] sm:text-[64px] lg:text-[72px] xl:text-[80px]">
                Build with Avantiqo business capabilities.
              </h1>
              <p className="mt-7 max-w-[560px] text-[16px] leading-8 text-[#625D55]">
                SDKs, webhooks, developer tooling and embedded workflows for building on Avantiqo without entering the Business OS customer interface.
              </p>
              <div className="mt-9 flex flex-wrap gap-2.5">
                <a
                  href="#capabilities"
                  className="inline-flex h-11 items-center gap-2 rounded-full border border-[#D6A66A]/50 bg-[#D6A66A] px-5 text-[10px] font-semibold text-[#171411] shadow-[0_12px_30px_rgba(0,0,0,.20)]"
                >
                  Explore capabilities <Arrow className="h-3.5 w-3.5" />
                </a>
                <a
                  href="#integration"
                  className="inline-flex h-11 items-center rounded-full border border-black/[0.10] bg-white/70 px-5 text-[10px] font-semibold text-[#56514A]"
                >
                  Integration model
                </a>
              </div>
              <div className="mt-10 flex flex-wrap gap-x-5 gap-y-2 border-t border-black/[0.08] pt-5 text-[7px] font-semibold uppercase tracking-[0.16em] text-[#857D74]">
                {[
                  "Capability based",
                  "Metered",
                  "Organization scoped",
                  "Controlled",
                ].map((item) => (
                  <span key={item} className="inline-flex items-center gap-1.5">
                    <Check className="h-3 w-3 text-[#D6A66A]" />
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="relative min-h-[560px] overflow-hidden rounded-[30px] border border-black/[0.08] bg-[#E9DFD1] shadow-[0_30px_90px_rgba(68,47,25,.13)]">
            <div className="absolute inset-0 bg-cover bg-center" style={{backgroundImage:"url(/art/developer-work.jpg)"}} />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,7,6,.02),rgba(8,7,6,.05)_54%,rgba(8,7,6,.48))]" />
            <div className="absolute left-5 top-5 rounded-full border border-white/70 bg-[#F8F0E6]/74 px-3 py-1.5 text-[7px] font-semibold uppercase tracking-[.20em] text-[#8D6339] backdrop-blur-xl">AVANTIQO / DEVELOPERS</div>
            <div className="absolute bottom-5 left-5 right-5 rounded-[22px] border border-white/72 bg-[#F8F1E8]/88 p-5 text-[#2B251F] shadow-[0_18px_45px_rgba(0,0,0,.12)] backdrop-blur-xl">
              <div className="text-[7px] font-semibold uppercase tracking-[.18em] text-[#A36F39]">BUILD FABRIC</div>
              <div className="mt-3 flex flex-wrap gap-2">{["CAPABILITIES","SDKs","WEBHOOKS","EMBEDDED","VERIFY"].map(x=><span key={x} className="rounded-full border border-black/[0.07] bg-white/52 px-2.5 py-1 text-[7px] text-[#74685D]">{x}</span>)}</div>
            </div>
          </div>
        </div>
      </section>
      <section className="border-b border-black/[0.06] bg-[#EEE8DE]">
        <div className="mx-auto grid max-w-[1320px] gap-10 px-5 py-16 sm:px-7 lg:grid-cols-[.82fr_1.18fr] lg:items-center lg:px-10 lg:py-20">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.20em] text-[#9A744B]">BUILD REAL SOFTWARE</p>
            <h2 className="mt-3 text-[38px] font-medium leading-[1.02] tracking-[-0.05em] text-[#1B1A18] sm:text-[50px]">From code to verified business capability.</h2>
            <p className="mt-5 max-w-xl text-[13px] leading-7 text-[#6C6963]">Avantiqo Developers is not a mockup surface. It is the route into real platform capabilities, business context, execution controls, webhooks, embedded workflows and verification.</p>
          </div>
          <div className="relative min-h-[430px] overflow-hidden rounded-[30px] border border-black/[0.08] bg-[#E9DFD1] shadow-[0_24px_70px_rgba(56,39,22,.10)]">
            <div className="absolute inset-0 bg-cover bg-center" style={{backgroundImage:"url(/art/generated/developers/developer-integration-v1.png)"}} />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,7,6,.01),rgba(8,7,6,.06)_56%,rgba(8,7,6,.42))]" />
            <div className="absolute bottom-5 left-5 right-5 rounded-[20px] border border-white/72 bg-[#F8F1E8]/88 p-5 text-[#2B251F] backdrop-blur-xl">
              <div className="text-[7px] font-semibold uppercase tracking-[.18em] text-[#A36F39]">INTEGRATE · TEST · VERIFY</div>
              <div className="mt-2 text-[12px] text-[#655B51]">Connect Avantiqo capabilities to the systems and workflows your product already uses.</div>
            </div>
          </div>
        </div>
      </section>

      <section
        id="capabilities"
        className="border-b border-black/[0.06] bg-[#F7F6F3]"
      >
        <div className="mx-auto max-w-[1320px] px-5 py-20 sm:px-7 lg:px-10 lg:py-24">
          <div className="max-w-3xl">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9A744B]">
              Capability catalog
            </p>
            <h2 className="mt-3 text-[36px] font-medium leading-[1.04] tracking-[-0.045em] text-[#1B1A18] sm:text-[44px] lg:text-[52px]">
              Business capabilities, not another software suite.
            </h2>
            <p className="mt-5 text-[14px] leading-7 text-[#6C6963] sm:text-[15px]">
              The long-term developer surface is organized around reusable
              capability families. A customer can integrate one narrow function
              or combine multiple capabilities into a complete workflow.
            </p>
          </div>
          <div className="mt-12 grid overflow-hidden rounded-[24px] border border-black/[0.075] bg-white md:grid-cols-2 lg:grid-cols-3">
            {capabilityFamilies.map((family, index) => (
              <article
                key={family.name}
                className={`group overflow-hidden bg-white transition hover:bg-[#FCFBF9] ${index % 3 !== 2 ? "lg:border-r lg:border-black/[0.06]" : ""} ${index < 3 ? "border-b border-black/[0.06]" : ""} ${index % 2 === 0 ? "md:border-r md:border-black/[0.06] lg:border-r" : ""}`}
              >
                <div className="relative h-[150px] overflow-hidden bg-[#E9DFD1]">
                  <div className="absolute inset-0 bg-cover bg-center transition duration-700 group-hover:scale-[1.025]" style={{backgroundImage:`url(${family.image})`}} />
                  <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,7,6,.02),rgba(8,7,6,.10)_58%,rgba(8,7,6,.58))]" />
                  <div className="absolute bottom-4 left-4 flex h-9 w-9 items-center justify-center rounded-xl border border-white/70 bg-[#F8F0E6]/72 text-[8px] font-bold tracking-[0.08em] text-[#8D6339] backdrop-blur-xl">{family.code}</div>
                  <Arrow className="absolute bottom-5 right-5 h-3.5 w-3.5 text-white/55 transition group-hover:translate-x-0.5 group-hover:text-[#F1C98E]" />
                </div>
                <div className="p-6">
                  <h3 className="text-[18px] font-semibold tracking-[-0.025em] text-[#2D2925]">{family.name}</h3>
                  <p className="mt-2 min-h-[54px] text-[11px] leading-5 text-[#7A756E]">{family.description}</p>
                  <div className="mt-5 flex flex-wrap gap-1.5">
                    {family.capabilities.map((item) => (
                      <span key={item} className="rounded-full border border-black/[0.06] bg-[#F8F4EE] px-2.5 py-1.5 text-[8px] font-medium text-[#68635C]">{item}</span>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>
          <div className="mt-5 rounded-[20px] border border-[#D6A66A]/24 bg-[#FBF7F0] p-5 text-[11px] leading-6 text-[#6F6961]">
            <span className="font-semibold text-[#8D643C]">
              Explore the capabilities available to build with.
            </span>{" "}
            Use the catalog to find business, document, intelligence, creative and operational capabilities that can be integrated into your own product. Each exposed capability includes the context and controls needed to use it safely.
          </div>
        </div>
      </section>

      <section
        id="integration"
        className="border-b border-black/[0.06] bg-white/55"
      >
        <div className="mx-auto grid max-w-[1320px] gap-12 px-5 py-20 sm:px-7 lg:grid-cols-[.8fr_1.2fr] lg:px-10 lg:py-24">
          <div className="max-w-xl">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9A744B]">
              Integration model
            </p>
            <h2 className="mt-3 text-[36px] font-medium leading-[1.04] tracking-[-0.045em] text-[#1B1A18] sm:text-[44px] lg:text-[52px]">
              Choose the level of control you need.
            </h2>
            <p className="mt-5 text-[14px] leading-7 text-[#6C6963]">
              Developer tooling should stay focused on building and integration. Use SDKs, webhooks, test contexts and embedded flows here; use the separate API Platform when the product only needs metered capability calls.
            </p>
          </div>
          <div>
            <div className="relative mb-5 min-h-[260px] overflow-hidden rounded-[24px] border border-black/[0.08] bg-[#E9DFD1] shadow-[0_18px_48px_rgba(56,39,22,.08)]">
              <div className="absolute inset-0 bg-cover bg-center" style={{backgroundImage:"url(/art/generated/developers/developer-integration-v1.png)"}} />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,7,6,.01),rgba(8,7,6,.36))]" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
            {integrationModes.map(([title, description], index) => (
              <article
                key={title}
                className="rounded-[20px] border border-black/[0.075] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.025)]"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F7F2EA] text-[9px] font-bold text-[#9A744B]">
                  0{index + 1}
                </div>
                <h3 className="mt-5 text-[15px] font-semibold tracking-[-0.02em] text-[#2A2723]">
                  {title}
                </h3>
                <p className="mt-2 text-[11px] leading-5 text-[#77736C]">
                  {description}
                </p>
              </article>
            ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-black/[0.06] bg-[#EEE6DB] text-[#1D1B18]">
        <div className="mx-auto max-w-[1320px] px-5 py-20 sm:px-7 lg:px-10 lg:py-24">
          <div className="max-w-3xl">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#D6A66A]">
              One engine, multiple surfaces
            </p>
            <h2 className="mt-3 text-[36px] font-medium leading-[1.04] tracking-[-0.045em] text-[#1D1B18] sm:text-[44px] lg:text-[52px]">
              The same capability can power Avantiqo or your product.
            </h2>
            <p className="mt-5 text-[14px] leading-7 text-[#6D645B]">
              Compose Avantiqo capabilities into your own application while organization scope, permissions and execution records stay consistent.
            </p>
          </div>
          <div className="mt-10 overflow-hidden rounded-[28px] border border-black/[0.07] bg-[#E9DFD1]">
            <div className="relative h-[360px] overflow-hidden">
              <div className="absolute inset-0 bg-cover bg-center" style={{backgroundImage:"url(/art/developer-work.jpg)"}} />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,7,6,.01),rgba(8,7,6,.42))]" />
              <div className="absolute bottom-5 left-5 rounded-full border border-white/70 bg-[#F8F0E6]/74 px-3 py-1.5 text-[7px] font-semibold uppercase tracking-[.18em] text-[#8D6339] backdrop-blur-xl">RUNTIME · DEPLOYMENT · HEALTH</div>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[
              "SDK",
              "Webhook",
              "Sandbox",
              "Tooling",
              "Embedded flow",
            ].map((item, index) => (
              <div
                key={item}
                className="rounded-[18px] border border-black/[0.07] bg-white/52 p-4"
              >
                <div className="text-[8px] font-bold text-[#D6A66A]">
                  0{index + 1}
                </div>
                <div className="mt-4 text-[11px] font-semibold text-[#51483F]">
                  {item}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="access" className="bg-[#F7F6F3]">
        <div className="mx-auto max-w-[1120px] px-5 py-20 text-center sm:px-7 lg:px-10 lg:py-24">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl border border-[#D6A66A]/25 bg-[#D6A66A]/[0.08] text-[9px] font-bold text-[#9A744B]">
            DEV
          </div>
          <h2 className="mx-auto mt-6 max-w-3xl text-[36px] font-medium leading-[1.04] tracking-[-0.045em] text-[#1B1A18] sm:text-[44px] lg:text-[52px]">
            Build with Avantiqo at the level your product needs.
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-[14px] leading-7 text-[#716C65]">
            Use this developer area to understand available capabilities, integration patterns and the tools for building on Avantiqo.
            Documentation, SDKs, webhooks, local tooling, sandboxes and embedded developer workflows live here. Metered direct capability calls belong in the separate API Platform.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-2.5">
            <a
              href="/api-platform"
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#171716] px-5 text-[11px] font-semibold text-white shadow-[0_6px_18px_rgba(20,18,15,0.14)]"
            >
              API Platform <Arrow className="h-3.5 w-3.5" />
            </a>
            <a
              href="/login?portal=developer"
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-black/[0.09] bg-white px-5 text-[11px] font-semibold text-[#56514A]"
            >
              Login
            </a>
          </div>
        </div>
      </section>

      <footer className="border-t border-black/[0.07] bg-[#FBFAF8]">
        <div className="mx-auto flex max-w-[1320px] flex-col gap-5 px-5 py-8 text-[10px] text-[#817B73] sm:flex-row sm:items-end sm:justify-between sm:px-7 lg:px-10">
          <div><div><span className="font-semibold text-[#3E3933]">Avantiqo Developers</span><span className="ml-2">Business capabilities for software builders</span></div><div className="mt-2 text-[9px] leading-5 text-[#9B958D]">Avantiqo is operated by BEA Co., Ltd., Thailand. Company Registration No. 0835553004601.</div></div>
          <div className="flex flex-wrap gap-5"><a href="/" className="transition hover:text-[#8A633C]">Platform</a><a href="/creative-studios" className="transition hover:text-[#8A633C]">Creative Studios</a><a href="/policy" className="transition hover:text-[#8A633C]">Privacy Policy</a><a href="/terms" className="transition hover:text-[#8A633C]">Terms</a><a href="/login" className="transition hover:text-[#8A633C]">Login</a></div>
        </div>
      </footer>
    </main>
  );
}
