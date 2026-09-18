import PublicSiteHeader from "@/components/public/PublicSiteHeader";
import PublicArtStage from "@/components/public/PublicArtStage";

const capabilityFamilies = [
  {
    name: "Finance",
    code: "FIN",
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
    description:
      "Add business-aware reasoning, context and governed execution to your own product.",
    capabilities: [
      "Business context",
      "Knowledge retrieval",
      "Planning",
      "Agent execution",
      "Verification",
      "Decision evidence",
    ],
  },
  {
    name: "Creative",
    code: "CRE",
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
  ["Webhooks", "React to completed jobs, business events and governed execution outcomes."],
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
      <PublicSiteHeader
        context="Developers"
        audience="developers"
        links={[
          {
            label: "Capabilities",
            href: "#capabilities",
            visibility: "hidden md:inline-flex",
          },
          {
            label: "Integration",
            href: "#integration",
            visibility: "hidden md:inline-flex",
          },
          { label: "API Platform", href: "/api-platform", visibility: "hidden lg:inline-flex" },
          { label: "Compute", href: "/compute", visibility: "hidden xl:inline-flex" },
        ]}
        action={{ label: "Developer access", href: "#access" }}
      />

      <section className="relative overflow-hidden border-b border-white/[0.08] bg-[#151310] text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(214,166,106,.14),transparent_30%)]" />
        <div className="relative mx-auto max-w-[1540px] lg:grid lg:min-h-[720px] lg:grid-cols-[42%_58%]">
          <div className="relative z-10 flex items-center px-5 py-16 sm:px-7 lg:px-10 lg:py-20 xl:px-14">
            <div className="max-w-[620px]">
              <p className="text-[9px] font-semibold uppercase tracking-[0.30em] text-[#D6A66A]">
                AVANTIQO DEVELOPERS
              </p>
              <h1 className="mt-5 text-[52px] font-medium leading-[.94] tracking-[-0.065em] text-[#F7F4EF] sm:text-[64px] lg:text-[72px] xl:text-[80px]">
                Build on the operating layer.
              </h1>
              <p className="mt-7 max-w-[560px] text-[16px] leading-8 text-white/62">
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
                  className="inline-flex h-11 items-center rounded-full border border-white/[0.13] bg-white/[0.035] px-5 text-[10px] font-semibold text-white/72"
                >
                  Integration model
                </a>
              </div>
              <div className="mt-10 flex flex-wrap gap-x-5 gap-y-2 border-t border-white/[0.09] pt-5 text-[7px] font-semibold uppercase tracking-[0.16em] text-white/38">
                {[
                  "Capability based",
                  "Metered",
                  "Organization scoped",
                  "Governed",
                ].map((item) => (
                  <span key={item} className="inline-flex items-center gap-1.5">
                    <Check className="h-3 w-3 text-[#D6A66A]" />
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="relative min-h-[580px] overflow-hidden border-t border-white/[0.08] lg:min-h-0 lg:border-l lg:border-t-0">
            <PublicArtStage kind="developer" />
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
                className={`group min-h-[330px] p-6 transition hover:bg-[#FCFBF9] ${index % 3 !== 2 ? "lg:border-r lg:border-black/[0.06]" : ""} ${index < 3 ? "border-b border-black/[0.06]" : ""} ${index % 2 === 0 ? "md:border-r md:border-black/[0.06] lg:border-r" : ""}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-black/[0.06] bg-[#F7F2EA] text-[8px] font-bold tracking-[0.08em] text-[#8D643C]">
                    {family.code}
                  </div>
                  <Arrow className="mt-1 h-3.5 w-3.5 text-[#C3BDB4] transition group-hover:translate-x-0.5 group-hover:text-[#A37849]" />
                </div>
                <h3 className="mt-6 text-[18px] font-semibold tracking-[-0.025em] text-[#2D2925]">
                  {family.name}
                </h3>
                <p className="mt-2 min-h-[62px] text-[11px] leading-5 text-[#7A756E]">
                  {family.description}
                </p>
                <div className="mt-5 flex flex-wrap gap-1.5">
                  {family.capabilities.map((item) => (
                    <span
                      key={item}
                      className="rounded-lg border border-black/[0.06] bg-[#FBFAF8] px-2.5 py-1.5 text-[8px] font-medium text-[#68635C]"
                    >
                      {item}
                    </span>
                  ))}
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
      </section>

      <section className="border-b border-black/[0.06] bg-[#171716] text-white">
        <div className="mx-auto max-w-[1320px] px-5 py-20 sm:px-7 lg:px-10 lg:py-24">
          <div className="max-w-3xl">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#D6A66A]">
              One engine, multiple surfaces
            </p>
            <h2 className="mt-3 text-[36px] font-medium leading-[1.04] tracking-[-0.045em] text-[#F7F4EF] sm:text-[44px] lg:text-[52px]">
              The same capability can power Avantiqo or your product.
            </h2>
            <p className="mt-5 text-[14px] leading-7 text-white/52">
              Compose Avantiqo capabilities into your own application while organization scope, permissions and execution records stay consistent.
            </p>
          </div>
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[
              "SDK",
              "Webhook",
              "Sandbox",
              "Tooling",
              "Embedded flow",
            ].map((item, index) => (
              <div
                key={item}
                className="rounded-[18px] border border-white/[0.08] bg-white/[0.025] p-4"
              >
                <div className="text-[8px] font-bold text-[#D6A66A]">
                  0{index + 1}
                </div>
                <div className="mt-4 text-[11px] font-semibold text-white/72">
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
          <div>
            <div>
              <span className="font-semibold text-[#3E3933]">
                Avantiqo Developers
              </span>
              <span className="ml-2">
                Business capabilities for software builders
              </span>
            </div>
            <div className="mt-2 text-[9px] leading-5 text-[#9B958D]">
              Avantiqo is operated by BEA Co., Ltd., Thailand. Company
              Registration No. 0835553004601.
            </div>
          </div>
          <div className="flex flex-wrap gap-5">
            <a href="/api-platform" className="transition hover:text-[#8A633C]">API Platform</a>
            <a href="/compute" className="transition hover:text-[#8A633C]">Compute</a>
            <a href="/policy" className="transition hover:text-[#8A633C]">
              Privacy Policy
            </a>
            <a href="/terms" className="transition hover:text-[#8A633C]">
              Terms
            </a>
            <a href="/login?portal=developer" className="transition hover:text-[#8A633C]">
              Login
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}
