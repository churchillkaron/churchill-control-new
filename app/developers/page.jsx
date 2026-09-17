import Image from "next/image";

const capabilityFamilies = [
  {
    name: "Finance",
    code: "FIN",
    description: "Embed accounting and financial operations without rebuilding the underlying business logic.",
    capabilities: ["Invoice extraction", "Three-way matching", "Bank reconciliation", "Ledger posting", "VAT & tax", "Cash forecasting"],
  },
  {
    name: "Documents",
    code: "DOC",
    description: "Turn business documents into structured, validated and actionable data.",
    capabilities: ["OCR", "Classification", "Field extraction", "Table extraction", "Document validation", "Semantic retrieval"],
  },
  {
    name: "Intelligence",
    code: "INT",
    description: "Add business-aware reasoning, context and governed execution to your own product.",
    capabilities: ["Business context", "Knowledge retrieval", "Planning", "Agent execution", "Verification", "Decision evidence"],
  },
  {
    name: "Creative",
    code: "CRE",
    description: "Use production workflows, not just generators: brief, direction, generation, review and repair.",
    capabilities: ["Image Studio", "Video Studio", "Music Studio", "Creative direction", "Quality review", "Production orchestration"],
  },
  {
    name: "Operations",
    code: "OPS",
    description: "Bring operational capability into software for restaurants, hotels, field service and more.",
    capabilities: ["Inventory", "Procurement", "Recipe costing", "Service management", "POS operations", "Hospitality workflows"],
  },
  {
    name: "People",
    code: "PPL",
    description: "Embed workforce context, attendance, scheduling and labor intelligence.",
    capabilities: ["Attendance", "Scheduling", "Availability", "Qualifications", "Payroll workflows", "Workforce intelligence"],
  },
];

const integrationModes = [
  ["REST API", "Call an individual capability from your own application."],
  ["Jobs + webhooks", "Run long-form work such as creative production or document batches asynchronously."],
  ["Agent tools", "Let your own agent invoke governed Avantiqo business capabilities."],
  ["Embedded workflows", "Place selected Avantiqo capability flows inside your existing product experience."],
];

function Arrow({ className = "" }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className={className} fill="none">
      <path d="M4 10h11M11 6l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Check({ className = "" }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className={className} fill="none">
      <circle cx="10" cy="10" r="7.25" stroke="currentColor" strokeWidth="1.3" />
      <path d="m6.8 10.1 2 2 4.5-4.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CodeWindow() {
  return (
    <div className="overflow-hidden rounded-[24px] border border-white/[0.09] bg-[#11110F] shadow-[0_35px_100px_rgba(0,0,0,0.24)]">
      <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-white/20" />
          <span className="h-2 w-2 rounded-full bg-white/20" />
          <span className="h-2 w-2 rounded-full bg-[#D6A66A]/70" />
        </div>
        <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white/35">Example integration model</span>
      </div>
      <pre className="overflow-x-auto p-5 text-[11px] leading-6 text-white/66 sm:p-7 sm:text-[12px]"><code>{`const result = await avantiqo.capabilities.run({
  capability: "finance.invoice.extract",
  input: {
    document: invoiceFile,
    organization: "your-customer"
  }
});

console.log(result.data);
console.log(result.confidence);
console.log(result.evidence);`}</code></pre>
      <div className="grid border-t border-white/[0.07] sm:grid-cols-3">
        {[['Capability', 'finance.invoice.extract'], ['Execution', 'Governed'], ['Output', 'Structured + evidence']].map(([label, value], index) => (
          <div key={label} className={`px-5 py-4 ${index ? "border-t border-white/[0.07] sm:border-l sm:border-t-0" : ""}`}>
            <div className="text-[8px] font-semibold uppercase tracking-[0.16em] text-[#D6A66A]">{label}</div>
            <div className="mt-1.5 text-[10px] text-white/58">{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export const metadata = {
  title: "Developers | Avantiqo",
  description: "Build with Avantiqo business capabilities across finance, documents, intelligence, creative, operations and people.",
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

      <section className="relative overflow-hidden border-b border-black/[0.06] bg-[#171716] text-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_76%_8%,rgba(214,166,106,.16),transparent_34%),radial-gradient(circle_at_18%_30%,rgba(163,120,73,.07),transparent_30%)]" />
        <div className="relative mx-auto grid max-w-[1460px] gap-12 px-5 pb-20 pt-20 sm:px-7 lg:grid-cols-[.86fr_1.14fr] lg:items-center lg:px-10 lg:pb-24 lg:pt-28 xl:gap-20">
          <div className="max-w-[680px]">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#D6A66A]/25 bg-[#D6A66A]/[0.08] px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-[#E0BB83]"><span className="h-1.5 w-1.5 rounded-full bg-[#D6A66A]" />Developer platform preview</div>
            <h1 className="mt-7 text-[48px] font-medium leading-[0.98] tracking-[-0.06em] text-[#F7F4EF] sm:text-[60px] lg:text-[68px] xl:text-[76px]">Build with Avantiqo.</h1>
            <p className="mt-7 max-w-2xl text-[17px] leading-8 text-white/62 sm:text-[18px]">Bring finance, documents, intelligence, creative production and operational capabilities into the software you already build.</p>
            <p className="mt-4 max-w-xl text-[13px] leading-6 text-white/38">Use one capability or compose many. Avantiqo is being structured so the same business engines that power the platform can also become developer-facing services.</p>
            <div className="mt-8 flex flex-wrap items-center gap-2.5">
              <a href="#capabilities" className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#F7F4EF] px-5 text-[11px] font-semibold text-[#171716] transition hover:-translate-y-0.5">Explore capabilities <Arrow className="h-3.5 w-3.5" /></a>
              <a href="#integration" className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.035] px-5 text-[11px] font-semibold text-white/72 transition hover:border-[#D6A66A]/40 hover:text-white">How integration works</a>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 border-t border-white/[0.08] pt-5 text-[9px] font-medium text-white/38">
              {["Capability based", "Meterable", "Organization scoped", "Governed execution"].map((item) => <span key={item} className="inline-flex items-center gap-1.5"><Check className="h-3 w-3 text-[#D6A66A]" />{item}</span>)}
            </div>
          </div>
          <CodeWindow />
        </div>
      </section>

      <section id="capabilities" className="border-b border-black/[0.06] bg-[#F7F6F3]">
        <div className="mx-auto max-w-[1320px] px-5 py-20 sm:px-7 lg:px-10 lg:py-24">
          <div className="max-w-3xl">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9A744B]">Capability catalog</p>
            <h2 className="mt-3 text-[36px] font-medium leading-[1.04] tracking-[-0.045em] text-[#1B1A18] sm:text-[44px] lg:text-[52px]">Business capabilities, not another software suite.</h2>
            <p className="mt-5 text-[14px] leading-7 text-[#6C6963] sm:text-[15px]">The long-term developer surface is organized around reusable capability families. A customer can integrate one narrow function or combine multiple capabilities into a complete workflow.</p>
          </div>
          <div className="mt-12 grid overflow-hidden rounded-[24px] border border-black/[0.075] bg-white md:grid-cols-2 lg:grid-cols-3">
            {capabilityFamilies.map((family, index) => (
              <article key={family.name} className={`group min-h-[330px] p-6 transition hover:bg-[#FCFBF9] ${index % 3 !== 2 ? "lg:border-r lg:border-black/[0.06]" : ""} ${index < 3 ? "border-b border-black/[0.06]" : ""} ${index % 2 === 0 ? "md:border-r md:border-black/[0.06] lg:border-r" : ""}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-black/[0.06] bg-[#F7F2EA] text-[8px] font-bold tracking-[0.08em] text-[#8D643C]">{family.code}</div>
                  <Arrow className="mt-1 h-3.5 w-3.5 text-[#C3BDB4] transition group-hover:translate-x-0.5 group-hover:text-[#A37849]" />
                </div>
                <h3 className="mt-6 text-[18px] font-semibold tracking-[-0.025em] text-[#2D2925]">{family.name}</h3>
                <p className="mt-2 min-h-[62px] text-[11px] leading-5 text-[#7A756E]">{family.description}</p>
                <div className="mt-5 flex flex-wrap gap-1.5">
                  {family.capabilities.map((item) => <span key={item} className="rounded-lg border border-black/[0.06] bg-[#FBFAF8] px-2.5 py-1.5 text-[8px] font-medium text-[#68635C]">{item}</span>)}
                </div>
              </article>
            ))}
          </div>
          <div className="mt-5 rounded-[20px] border border-[#D6A66A]/24 bg-[#FBF7F0] p-5 text-[11px] leading-6 text-[#6F6961]">
            <span className="font-semibold text-[#8D643C]">This catalog will expand.</span> The internal Avantiqo capability registry is much larger than the first public developer surface. We can expose individual capabilities only when their contracts, governance and quality are ready for external use.
          </div>
        </div>
      </section>

      <section id="integration" className="border-b border-black/[0.06] bg-white/55">
        <div className="mx-auto grid max-w-[1320px] gap-12 px-5 py-20 sm:px-7 lg:grid-cols-[.8fr_1.2fr] lg:px-10 lg:py-24">
          <div className="max-w-xl">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9A744B]">Integration model</p>
            <h2 className="mt-3 text-[36px] font-medium leading-[1.04] tracking-[-0.045em] text-[#1B1A18] sm:text-[44px] lg:text-[52px]">Choose the level of control you need.</h2>
            <p className="mt-5 text-[14px] leading-7 text-[#6C6963]">A developer should not be forced into one abstraction level. Use a focused API for a single operation, or hand Avantiqo a larger mission and let the workflow coordinate the work.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {integrationModes.map(([title, description], index) => (
              <article key={title} className="rounded-[20px] border border-black/[0.075] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F7F2EA] text-[9px] font-bold text-[#9A744B]">0{index + 1}</div>
                <h3 className="mt-5 text-[15px] font-semibold tracking-[-0.02em] text-[#2A2723]">{title}</h3>
                <p className="mt-2 text-[11px] leading-5 text-[#77736C]">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-black/[0.06] bg-[#171716] text-white">
        <div className="mx-auto max-w-[1320px] px-5 py-20 sm:px-7 lg:px-10 lg:py-24">
          <div className="max-w-3xl">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#D6A66A]">One engine, multiple surfaces</p>
            <h2 className="mt-3 text-[36px] font-medium leading-[1.04] tracking-[-0.045em] text-[#F7F4EF] sm:text-[44px] lg:text-[52px]">The same capability can power Avantiqo or your product.</h2>
            <p className="mt-5 text-[14px] leading-7 text-white/52">A capability such as invoice extraction can be used inside Avantiqo Finance, invoked by the Business Partner, called through an API, triggered by automation or embedded in another company&apos;s accounting product.</p>
          </div>
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {["Avantiqo workspace", "REST API", "Agent tool", "Automation", "Embedded flow"].map((item, index) => <div key={item} className="rounded-[18px] border border-white/[0.08] bg-white/[0.025] p-4"><div className="text-[8px] font-bold text-[#D6A66A]">0{index + 1}</div><div className="mt-4 text-[11px] font-semibold text-white/72">{item}</div></div>)}
          </div>
        </div>
      </section>

      <section id="access" className="bg-[#F7F6F3]">
        <div className="mx-auto max-w-[1120px] px-5 py-20 text-center sm:px-7 lg:px-10 lg:py-24">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl border border-[#D6A66A]/25 bg-[#D6A66A]/[0.08] text-[9px] font-bold text-[#9A744B]">DEV</div>
          <h2 className="mx-auto mt-6 max-w-3xl text-[36px] font-medium leading-[1.04] tracking-[-0.045em] text-[#1B1A18] sm:text-[44px] lg:text-[52px]">Developer access is being opened capability by capability.</h2>
          <p className="mx-auto mt-5 max-w-2xl text-[14px] leading-7 text-[#716C65]">This page is the foundation for the Avantiqo developer platform. Documentation, API keys, metering, webhooks, SDKs and live capability access can be added here as each external contract is certified.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-2.5">
            <a href="/" className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#171716] px-5 text-[11px] font-semibold text-white shadow-[0_6px_18px_rgba(20,18,15,0.14)]">Back to Avantiqo <Arrow className="h-3.5 w-3.5" /></a>
            <a href="/login" className="inline-flex h-11 items-center gap-2 rounded-xl border border-black/[0.09] bg-white px-5 text-[11px] font-semibold text-[#56514A]">Login</a>
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
