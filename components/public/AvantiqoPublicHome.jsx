import ConnectedServiceDataOverview from "@/components/public/ConnectedServiceDataOverview";

const businessAreas = [
  ["Finance", "Accounting, cash, billing, receivables, payables, reporting and financial control."],
  ["Operations", "Daily work, approvals, service delivery, evidence, tasks and operational control."],
  ["Commercial", "Customers, opportunities, quotations, contracts, sales and revenue workflows."],
  ["Supply Chain", "Procurement, suppliers, inventory, warehouses, movement and fulfilment."],
  ["People", "Staff, roles, attendance, performance, payroll workflows and employee self-service."],
  ["Projects", "Plan, budget, approve, execute and close projects with accountability."],
  ["Documents", "Create, store, approve, govern and share business documents and evidence."],
  ["Marketing", "Research, campaigns, creative production, channels, publishing and performance."],
  ["Customers", "Customer records, portals, communications, service history and relationships."],
  ["Services", "Connected providers, external services, usage, execution and service governance."],
  ["Analytics", "Business reporting, operational intelligence, alerts, trends and decision support."],
  ["Administration", "Organizations, entities, users, permissions, integrations, policies and governance."],
];

const principles = [
  ["Organization first", "Each customer organization has its own business context, users, permissions, records and connected services."],
  ["Explicit authorization", "External accounts are connected only when an authorized customer user chooses to connect them."],
  ["Role-based access", "Users see and execute only the capabilities allowed by their organization and role."],
  ["Approval before commitment", "Important financial, operational, publishing and external actions can require approval before execution."],
  ["Auditable execution", "Important actions can be recorded with the organization, user or party, time, status and business context."],
  ["Disconnectable services", "Authorized administrators can disconnect external integrations and revoke provider access when required."],
];

function SectionTitle({ eyebrow, title, children }) {
  return (
    <div className="max-w-4xl">
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#D6A66A]">{eyebrow}</p>
      <h2 className="mt-4 text-3xl font-light tracking-[-0.04em] text-white sm:text-4xl lg:text-5xl">{title}</h2>
      {children ? <div className="mt-5 text-[15px] leading-7 text-white/55 sm:text-base sm:leading-8">{children}</div> : null}
    </div>
  );
}

function Card({ title, children }) {
  return (
    <article className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-6">
      <h3 className="text-lg font-medium text-white/90">{title}</h3>
      <div className="mt-3 text-sm leading-6 text-white/48">{children}</div>
    </article>
  );
}

export default function AvantiqoPublicHome() {
  return (
    <main className="min-h-screen bg-[#050505] text-white">
      <header className="sticky top-0 z-50 border-b border-white/[0.07] bg-[#050505]/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-4 lg:px-8">
          <a href="/" className="flex items-center gap-3" aria-label="Avantiqo home">
            <img src="/branding/avantiqo-logo.png" alt="Avantiqo" className="h-10 w-auto object-contain" />
            <div>
              <div className="text-sm font-semibold tracking-[0.16em] text-[#E8CB8A]">Avantiqo</div>
              <div className="mt-1 text-[9px] uppercase tracking-[0.16em] text-white/35">Business Operating System</div>
            </div>
          </a>

          <nav className="flex items-center gap-4">
            <a href="#platform" className="hidden text-xs text-white/50 hover:text-white md:inline">Platform</a>
            <a href="#connected-service-data" className="hidden text-xs text-white/50 hover:text-white md:inline">Integrations</a>
            <a href="/policy" className="hidden text-xs text-white/50 hover:text-white sm:inline">Privacy</a>
            <a href="/terms" className="hidden text-xs text-white/50 hover:text-white sm:inline">Terms</a>
            <a href="/login" className="rounded-xl bg-[#D6A66A] px-5 py-2.5 text-xs font-semibold text-black transition hover:bg-[#E2BF79]">Login</a>
          </nav>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-white/[0.07]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_75%_15%,rgba(214,166,106,.14),transparent_34%),radial-gradient(circle_at_15%_75%,rgba(112,76,104,.12),transparent_34%)]" />
        <div className="relative mx-auto max-w-7xl px-6 py-20 sm:py-24 lg:px-8 lg:py-28">
          <div className="max-w-5xl">
            <p className="inline-flex rounded-full border border-[#D6A66A]/25 bg-[#D6A66A]/[0.06] px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#E7C67F]">Multi-tenant business management platform</p>
            <h1 className="mt-8 text-5xl font-light leading-[1.02] tracking-[-0.055em] text-[#F7F3EB] sm:text-6xl lg:text-7xl">
              Avantiqo is a Business Operating System for running companies from one accountable platform.
            </h1>
            <p className="mt-8 max-w-4xl text-lg leading-8 text-white/62 sm:text-xl sm:leading-9">
              Avantiqo helps organizations manage finance, operations, commercial activity, supply chain, people, projects, documents, customers, marketing, analytics, administration and connected business services in one system.
            </p>
            <p className="mt-5 max-w-4xl text-base leading-8 text-white/48">
              Each customer organization has its own users, permissions, business records, workflows, approvals and integrations. Avantiqo connects those parts so owners, managers, staff and authorized service providers can work from the same governed source of truth.
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <a href="/login" className="rounded-xl bg-[#D6A66A] px-6 py-3.5 text-sm font-semibold text-black transition hover:bg-[#E2BF79]">Login to Avantiqo</a>
              <a href="#how-it-works" className="rounded-xl border border-white/12 bg-white/[0.03] px-6 py-3.5 text-sm font-medium text-white/75 transition hover:border-white/25 hover:text-white">How Avantiqo works</a>
            </div>
          </div>
        </div>
      </section>

      <section id="platform" className="border-b border-white/[0.07] bg-white/[0.015]">
        <div className="mx-auto max-w-7xl px-6 py-20 lg:px-8 lg:py-24">
          <SectionTitle eyebrow="The platform" title="One operating system across the company.">
            <p>Avantiqo is not a single-purpose accounting app, CRM, POS or marketing tool. It is a platform that connects business domains while keeping responsibility, permissions and business rules inside the correct domain.</p>
          </SectionTitle>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {businessAreas.map(([title, description]) => <Card key={title} title={title}>{description}</Card>)}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="border-b border-white/[0.07]">
        <div className="mx-auto max-w-7xl px-6 py-20 lg:px-8 lg:py-24">
          <SectionTitle eyebrow="How it works" title="Avantiqo connects context, people, workflows and execution.">
            <p>The platform is designed around the organization. Business data and actions are not mixed between customers. Users operate inside the company context they are authorized to access.</p>
          </SectionTitle>
          <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[
              ["01", "Set up the organization", "Define the company, business entities, users, roles, policies and operating context."],
              ["02", "Connect business services", "Connect the external accounts, channels, providers and systems the organization chooses to use."],
              ["03", "Run governed workflows", "Create, review, approve and execute business work with clear responsibility and auditability."],
              ["04", "Use intelligence and automation", "Use reporting, alerts, recommendations, AI and approved automation to improve execution."],
            ].map(([number, title, description]) => (
              <article key={number} className="rounded-2xl border border-white/[0.08] bg-[#090909] p-6">
                <p className="text-xs font-semibold text-[#D6A66A]">{number}</p>
                <h3 className="mt-5 text-xl font-medium text-white/90">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-white/46">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-white/[0.07] bg-white/[0.015]">
        <div className="mx-auto max-w-7xl px-6 py-20 lg:px-8 lg:py-24">
          <SectionTitle eyebrow="Permissions & control" title="Customers control what Avantiqo can access and execute.">
            <p>The platform is designed to keep external connections, business data and execution attached to the correct organization and authorized user context.</p>
          </SectionTitle>
          <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {principles.map(([title, description]) => <Card key={title} title={title}>{description}</Card>)}
          </div>
        </div>
      </section>

      <section className="border-b border-white/[0.07]">
        <div className="mx-auto max-w-7xl px-6 py-20 lg:px-8 lg:py-24">
          <SectionTitle eyebrow="AI & automation" title="Intelligence supports the business. Governance stays in control.">
            <p>Avantiqo can use AI to research, summarize, classify, recommend, create drafts, detect issues and coordinate workflows. Automation can execute approved work where the organization enables it. Important commitments can still require human approval according to the organization&apos;s policy.</p>
          </SectionTitle>
          <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[
              ["Understand", "Bring relevant business context together so users do not have to search across disconnected systems."],
              ["Recommend", "Surface risks, opportunities, next actions and improvements based on available authorized data."],
              ["Create", "Prepare documents, campaigns, reports, communications and operational drafts for review."],
              ["Execute", "Run approved workflows and provider actions where the organization has enabled automation."],
            ].map(([title, description]) => <Card key={title} title={title}>{description}</Card>)}
          </div>
        </div>
      </section>

      <ConnectedServiceDataOverview />

      <section className="border-b border-white/[0.07]">
        <div className="mx-auto max-w-7xl px-6 py-20 lg:px-8 lg:py-24">
          <div className="grid gap-10 lg:grid-cols-[1fr_.8fr] lg:items-start">
            <SectionTitle eyebrow="Privacy & transparency" title="Customers should know what the platform does with their data.">
              <p>Avantiqo&apos;s Privacy Policy explains how organizational and connected-service data is accessed, used, stored, protected, retained and deleted. The Terms of Service explain the rules governing platform access and connected services.</p>
            </SectionTitle>
            <div className="grid gap-4">
              <a href="/policy" className="rounded-2xl border border-[#D6A66A]/22 bg-[#D6A66A]/[0.045] p-6 transition hover:border-[#D6A66A]/40">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#D6A66A]">Privacy Policy</p>
                <p className="mt-3 text-sm leading-6 text-white/50">How Avantiqo handles platform data and connected-service data.</p>
              </a>
              <a href="/terms" className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 transition hover:border-white/20">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/65">Terms of Service</p>
                <p className="mt-3 text-sm leading-6 text-white/45">The terms governing Avantiqo platform access and authorized business use.</p>
              </a>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="mx-auto max-w-7xl px-6 py-20 text-center lg:px-8 lg:py-24">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#D6A66A]">Avantiqo</p>
          <h2 className="mx-auto mt-5 max-w-4xl text-4xl font-light tracking-[-0.04em] text-white sm:text-5xl">One company context. Clear permissions. Connected workflows. Accountable execution.</h2>
          <p className="mx-auto mt-6 max-w-3xl text-base leading-8 text-white/48">The organization decides who can access the platform, which external services are connected, what requires approval and which workflows may be automated.</p>
          <a href="/login" className="mt-9 inline-flex rounded-xl bg-[#D6A66A] px-7 py-3.5 text-sm font-semibold text-black transition hover:bg-[#E2BF79]">Login to Avantiqo</a>
        </div>
      </section>

      <footer className="border-t border-white/[0.07] bg-black/50">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-6 py-8 text-sm text-white/40 sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <div><span className="font-medium text-white/65">Avantiqo</span><span className="ml-2">Business Operating System</span></div>
          <div className="flex gap-5">
            <a href="/policy" className="transition hover:text-white">Privacy Policy</a>
            <a href="/terms" className="transition hover:text-white">Terms of Service</a>
            <a href="/login" className="transition hover:text-white">Login</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
