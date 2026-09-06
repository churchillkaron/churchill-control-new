import ConnectedServiceDataOverview from "@/components/public/ConnectedServiceDataOverview";

const businessAreas = [
  ["Finance", "Accounting, cash, billing, receivables, payables, reporting and financial control."],
  ["Operations", "Daily work, service delivery, evidence, approvals, tasks and operational control."],
  ["Supply Chain", "Procurement, suppliers, inventory, warehouses, movement and fulfilment."],
  ["Commercial", "Customers, opportunities, quotations, contracts, sales and revenue workflows."],
  ["People", "Staff, roles, attendance, performance, payroll workflows and employee self-service."],
  ["Projects", "Plan, budget, approve, execute and close projects with accountability."],
  ["Documents", "Create, store, approve, govern and share business documents and evidence."],
  ["Analytics", "Business reporting, operational intelligence, alerts, trends and decision support."],
  ["Compliance", "Policies, controls, evidence and governed follow-through across the business."],
];

const principles = [
  ["Business context first", "Work stays attached to the correct organization, legal entity, period and authorized user context."],
  ["Attention before dashboards", "Surface the exceptions, approvals and next human moves that can change the business now."],
  ["Governed execution", "Important actions can require permission, approval and durable evidence before they become business truth."],
  ["Intelligence in the workflow", "Research, recommendations and automation work with the same business context instead of living in a disconnected AI tab."],
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

function Spark({ className = "" }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className={className} fill="none">
      <path d="M10 2.8c.45 3.65 2.25 5.45 5.9 5.9-3.65.45-5.45 2.25-5.9 5.9-.45-3.65-2.25-5.45-5.9-5.9C7.75 8.25 9.55 6.45 10 2.8Z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
      <path d="M15.2 13.7c.18 1.45.9 2.17 2.35 2.35-1.45.18-2.17.9-2.35 2.35-.18-1.45-.9-2.17-2.35-2.35 1.45-.18 2.17-.9 2.35-2.35Z" fill="currentColor" />
    </svg>
  );
}

function SectionTitle({ eyebrow, title, children, center = false }) {
  return (
    <div className={center ? "mx-auto max-w-3xl text-center" : "max-w-3xl"}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9A744B]">{eyebrow}</p>
      <h2 className="mt-3 text-[32px] font-medium leading-[1.05] tracking-[-0.045em] text-[#1B1A18] sm:text-[40px] lg:text-[48px]">{title}</h2>
      {children ? <div className="mt-5 text-[14px] leading-7 text-[#6C6963] sm:text-[15px]">{children}</div> : null}
    </div>
  );
}

function ProductPreview() {
  const rail = ["H", "AI", "F", "O", "S", "C", "P", "D"];
  const attention = [
    ["Approve supplier payment", "Finance", "Review", "bg-amber-600"],
    ["Resolve stock exception", "Supply Chain", "Attention", "bg-red-600"],
    ["Review customer request", "Commercial", "Open", "bg-[#A37849]"],
  ];

  return (
    <div className="w-full">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1 text-[8px] font-medium uppercase tracking-[0.12em] text-[#98938B]">
        <span>Avantiqo workspace</span>
        <span>Illustrative data · interface mirrors the product</span>
      </div>
      <div className="overflow-hidden rounded-[24px] border border-black/[0.09] bg-[#F7F6F3] shadow-[0_32px_90px_rgba(37,31,24,0.13)]">
        <div className="flex h-[58px] items-center gap-3 border-b border-black/[0.07] bg-white px-3 sm:px-4">
          <div className="flex items-center gap-2.5 border-r border-black/[0.06] pr-3 sm:pr-4">
            <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-xl bg-[#171716] p-1.5">
              <img src="/branding/avantiqo-logo.png" alt="" className="h-full w-full object-contain" />
            </div>
            <div className="hidden sm:block">
              <div className="text-[10px] font-semibold text-[#38342F]">Avantiqo</div>
              <div className="mt-0.5 text-[7px] uppercase tracking-[0.16em] text-[#A49F97]">Business OS</div>
            </div>
          </div>
          <div className="hidden min-w-0 flex-1 items-center gap-2 md:flex">
            <div className="flex h-8 min-w-0 max-w-[190px] items-center gap-2 rounded-xl border border-black/[0.07] bg-[#FBFAF8] px-3 text-[#5E5A54]">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#A37849]" />
              <span className="truncate text-[9px] font-medium">Your organization</span>
              <span className="ml-auto text-[8px] text-[#AAA69E]">⌄</span>
            </div>
            <div className="hidden h-8 items-center gap-2 rounded-xl border border-black/[0.07] bg-[#FBFAF8] px-3 text-[#5E5A54] lg:flex">
              <span className="text-[8px] text-[#A37849]">◫</span><span className="text-[9px] font-medium">All entities</span>
            </div>
            <div className="hidden h-8 items-center gap-2 rounded-xl border border-black/[0.07] bg-[#FBFAF8] px-3 text-[#5E5A54] xl:flex">
              <span className="text-[8px] text-[#A37849]">○</span><span className="text-[9px] font-medium">Current period</span>
            </div>
          </div>
          <div className="ml-auto flex h-8 items-center gap-1.5 rounded-xl border border-[#D6A66A]/25 bg-[#D6A66A]/[0.08] px-2.5 text-[#8D643C]">
            <Spark className="h-3.5 w-3.5" /><span className="hidden text-[8px] font-semibold lg:inline">Intelligence</span>
          </div>
        </div>

        <div className="grid min-h-[500px] grid-cols-[52px_minmax(0,1fr)] sm:grid-cols-[62px_minmax(0,1fr)]">
          <aside className="flex flex-col items-center gap-1 border-r border-black/[0.07] bg-[#FBFAF8] px-2 py-3">
            {rail.map((item, index) => (
              <div key={item} className={index === 0 ? "flex h-9 w-9 items-center justify-center rounded-xl bg-[#171716] text-[8px] font-semibold text-white shadow-[0_3px_10px_rgba(20,18,15,0.14)]" : index === 1 ? "mb-1 flex h-9 w-9 items-center justify-center rounded-xl border border-[#D6A66A]/25 bg-[#D6A66A]/[0.08] text-[7px] font-semibold text-[#9A744B]" : "flex h-9 w-9 items-center justify-center rounded-xl text-[8px] font-semibold text-[#827D75]"}>
                {item}
              </div>
            ))}
            <div className="mt-auto flex h-8 w-8 items-center justify-center rounded-xl border border-black/[0.07] bg-white text-[7px] font-bold text-[#9A744B]">AV</div>
          </aside>

          <div className="min-w-0 p-3 sm:p-5 lg:p-6">
            <div className="border-b border-black/[0.07] pb-5">
              <div className="text-[8px] font-semibold uppercase tracking-[0.18em] text-[#9A744B]">My Business</div>
              <h3 className="mt-1.5 text-[22px] font-medium tracking-[-0.04em] text-[#181817] sm:text-[26px]">Your business at a glance</h3>
              <p className="mt-1 max-w-xl text-[9px] leading-4 text-[#77736C] sm:text-[10px]">Live priorities, business movement and governed work in one operating surface.</p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
              {[["Revenue", "—", "Posted Finance truth"], ["Orders", "—", "Current operating period"], ["Approvals", "4", "Waiting for decision"], ["Attention", "3", "Cross-domain exceptions"]].map(([label, value, hint]) => (
                <div key={label} className="rounded-2xl border border-black/[0.075] bg-white p-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
                  <div className="text-[7px] font-semibold uppercase tracking-[0.13em] text-[#8A867F]">{label}</div>
                  <div className="mt-2 text-[20px] font-medium tracking-[-0.035em] text-[#1A1917]">{value}</div>
                  <div className="mt-1 text-[7px] text-[#A09B93]">{hint}</div>
                </div>
              ))}
            </div>

            <div className="mt-3 grid gap-3 lg:grid-cols-[1.18fr_.82fr]">
              <section className="rounded-2xl border border-black/[0.075] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
                <div className="flex items-center justify-between gap-4">
                  <div><div className="text-[8px] font-semibold uppercase tracking-[0.15em] text-[#8A867F]">Needs attention</div><div className="mt-1 text-[8px] text-[#AAA69E]">Ranked work across the business</div></div>
                  <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-[#F7F2EA] px-2 text-[8px] font-semibold text-[#9A744B]">3</span>
                </div>
                <div className="mt-3 divide-y divide-black/[0.06]">
                  {attention.map(([title, domain, status, dot]) => (
                    <div key={title} className="flex items-center gap-2.5 py-3">
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
                      <div className="min-w-0 flex-1"><div className="truncate text-[9px] font-semibold text-[#3E3A34]">{title}</div><div className="mt-0.5 text-[7px] text-[#99938B]">{domain}</div></div>
                      <span className="text-[7px] text-[#99938B]">{status}</span><Arrow className="h-2.5 w-2.5 text-[#A37849]" />
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-2xl border border-black/[0.075] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
                <div><div className="text-[8px] font-semibold uppercase tracking-[0.15em] text-[#8A867F]">Business pulse</div><div className="mt-1 text-[8px] text-[#AAA69E]">Where attention is concentrated</div></div>
                <div className="mt-3 space-y-2">
                  {[["Finance", 4], ["Operations", 2], ["Supply Chain", 1], ["Commercial", 0]].map(([label, count]) => (
                    <div key={label} className="flex items-center gap-3 rounded-xl border border-black/[0.06] bg-[#FCFBF9] px-3 py-2.5">
                      <span className="min-w-0 flex-1 text-[8px] font-semibold text-[#4B4741]">{label}</span>
                      <span className={count ? "rounded-full bg-amber-50 px-2 py-1 text-[7px] font-semibold text-amber-800" : "rounded-full bg-emerald-50 px-2 py-1 text-[7px] font-semibold text-emerald-700"}>{count}</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AvantiqoPublicHome() {
  return (
    <main className="min-h-screen bg-[#F7F6F3] text-[#191919]">
      <header className="sticky top-0 z-50 border-b border-black/[0.07] bg-[#F7F6F3]/95 backdrop-blur-xl">
        <div className="mx-auto flex h-[64px] max-w-[1460px] items-center justify-between gap-6 px-5 sm:px-7 lg:px-10">
          <a href="/" className="flex items-center gap-3" aria-label="Avantiqo home">
            <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl bg-[#171716] p-1.5 shadow-[0_2px_6px_rgba(20,18,15,.12)]">
              <img src="/branding/avantiqo-logo.png" alt="Avantiqo" className="h-full w-full object-contain" />
            </div>
            <div>
              <div className="text-[12px] font-semibold tracking-[-0.01em] text-[#2A2723]">Avantiqo</div>
              <div className="mt-0.5 text-[7px] font-semibold uppercase tracking-[0.16em] text-[#9A744B]">Business Operating System</div>
            </div>
          </a>

          <nav className="flex items-center gap-1 sm:gap-1.5">
            <a href="#platform" className="hidden rounded-lg px-3 py-2 text-[10px] font-medium text-[#6C6963] transition hover:bg-white hover:text-[#292723] md:inline-flex">Platform</a>
            <a href="#intelligence" className="hidden rounded-lg px-3 py-2 text-[10px] font-medium text-[#6C6963] transition hover:bg-white hover:text-[#292723] lg:inline-flex">Intelligence</a>
            <a href="#connected-service-data" className="hidden rounded-lg px-3 py-2 text-[10px] font-medium text-[#6C6963] transition hover:bg-white hover:text-[#292723] lg:inline-flex">Integrations</a>
            <a href="/policy" className="hidden rounded-lg px-3 py-2 text-[10px] font-medium text-[#6C6963] transition hover:bg-white hover:text-[#292723] xl:inline-flex">Privacy</a>
            <a href="/terms" className="hidden rounded-lg px-3 py-2 text-[10px] font-medium text-[#6C6963] transition hover:bg-white hover:text-[#292723] xl:inline-flex">Terms</a>
            <a href="/login" className="ml-1 inline-flex h-9 items-center gap-2 rounded-xl bg-[#171716] px-4 text-[10px] font-semibold text-white shadow-[0_3px_10px_rgba(20,18,15,0.15)] transition hover:bg-[#2A2926]">Login <Arrow className="h-3 w-3" /></a>
          </nav>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-black/[0.06]">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[600px] bg-[radial-gradient(circle_at_76%_4%,rgba(214,166,106,.14),transparent_35%),radial-gradient(circle_at_12%_20%,rgba(163,120,73,.05),transparent_30%)]" />
        <div className="relative mx-auto max-w-[1460px] px-5 pb-16 pt-16 sm:px-7 sm:pt-20 lg:px-10 lg:pb-20 lg:pt-24">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,.82fr)_minmax(560px,1.18fr)] lg:items-center xl:gap-16">
            <div className="max-w-[650px]">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#D6A66A]/25 bg-[#D6A66A]/[0.08] px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.15em] text-[#8A633C]"><span className="h-1.5 w-1.5 rounded-full bg-[#A37849]" />One operating system for the company</div>
              <h1 className="mt-7 text-[48px] font-medium leading-[0.98] tracking-[-0.06em] text-[#181817] sm:text-[60px] lg:text-[64px] xl:text-[72px]">Run the company. Not the software.</h1>
              <p className="mt-7 max-w-xl text-[17px] leading-8 text-[#625F59] sm:text-[18px]">Avantiqo is a Business Operating System that brings finance, operations, supply chain, commercial work, people, projects, documents, analytics, connected services and intelligence into one governed business workspace.</p>
              <p className="mt-4 max-w-xl text-[13px] leading-6 text-[#8A867F]">Organizations use Avantiqo to bring business records, workflows, approvals, permissions and connected external services into the same operating context so owners, managers and staff can see what matters and move work forward.</p>
              <div className="mt-8 flex flex-wrap items-center gap-2.5">
                <a href="/login" className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#171716] px-5 text-[11px] font-semibold text-white shadow-[0_6px_18px_rgba(20,18,15,0.16)] transition hover:-translate-y-0.5 hover:bg-[#292825]">Login to Avantiqo <Arrow className="h-3.5 w-3.5" /></a>
                <a href="#how-it-works" className="inline-flex h-11 items-center gap-2 rounded-xl border border-black/[0.09] bg-white px-5 text-[11px] font-semibold text-[#56514A] transition hover:border-[#D6A66A]/45 hover:text-[#8A633C]">How the system works</a>
              </div>
              <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 border-t border-black/[0.07] pt-5 text-[9px] font-medium text-[#8F8A82]">
                {["Organization scoped", "Role based", "Approval aware", "Auditable"].map((item) => <span key={item} className="inline-flex items-center gap-1.5"><Check className="h-3 w-3 text-[#73816C]" />{item}</span>)}
              </div>
            </div>
            <div className="lg:-mr-28 xl:-mr-36"><ProductPreview /></div>
          </div>
        </div>
      </section>

      <section id="platform" className="border-b border-black/[0.06] bg-white/55">
        <div className="mx-auto max-w-[1320px] px-5 py-20 sm:px-7 lg:px-10 lg:py-24">
          <div className="grid gap-10 lg:grid-cols-[.8fr_1.2fr] lg:gap-16">
            <SectionTitle eyebrow="The Avantiqo system" title="Business software should feel like one system.">
              <p>Avantiqo keeps each business area responsible for its own rules while giving the company one consistent workspace, business context and operating language. Finance stays Finance. Operations stays Operations. The user does not have to rebuild the company context every time they move between them.</p>
            </SectionTitle>
            <div className="grid gap-3 sm:grid-cols-2">
              {principles.map(([title, description], index) => (
                <article key={title} className="rounded-[20px] border border-black/[0.075] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F7F2EA] text-[9px] font-bold text-[#9A744B]">0{index + 1}</div>
                  <h3 className="mt-5 text-[15px] font-semibold tracking-[-0.02em] text-[#2A2723]">{title}</h3><p className="mt-2 text-[11px] leading-5 text-[#77736C]">{description}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-black/[0.06] bg-[#F7F6F3]">
        <div className="mx-auto max-w-[1320px] px-5 py-20 sm:px-7 lg:px-10 lg:py-24">
          <SectionTitle eyebrow="Business areas" title="Every important area, one business context.">
            <p>Avantiqo connects work that is normally fragmented across separate applications, spreadsheets and inboxes while keeping permissions, records and responsibility explicit.</p>
          </SectionTitle>
          <div className="mt-10 grid overflow-hidden rounded-[22px] border border-black/[0.075] bg-white sm:grid-cols-2 lg:grid-cols-3">
            {businessAreas.map(([title, description], index) => (
              <article key={title} className={`group min-h-[170px] p-5 transition hover:bg-[#FCFBF9] ${index % 3 !== 2 ? "lg:border-r lg:border-black/[0.06]" : ""} ${index < 6 ? "border-b border-black/[0.06]" : ""}`}>
                <div className="flex items-start justify-between gap-4"><div className="flex h-9 w-9 items-center justify-center rounded-xl border border-black/[0.06] bg-[#FBFAF8] text-[9px] font-bold text-[#8D643C]">{title.slice(0, 2).toUpperCase()}</div><Arrow className="mt-1 h-3.5 w-3.5 text-[#C3BDB4] transition group-hover:translate-x-0.5 group-hover:text-[#A37849]" /></div>
                <h3 className="mt-5 text-[14px] font-semibold text-[#34302B]">{title}</h3><p className="mt-2 max-w-sm text-[10px] leading-5 text-[#827D75]">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="border-b border-black/[0.06] bg-white/55">
        <div className="mx-auto max-w-[1320px] px-5 py-20 sm:px-7 lg:px-10 lg:py-24">
          <SectionTitle eyebrow="How the system works" title="From business context to accountable execution." center>
            <p>Avantiqo starts with the organization and the user&apos;s authorized context, then routes work into the correct business area, workflow and record. Important actions can require approval before they are executed and recorded.</p>
          </SectionTitle>
          <div className="mt-12 grid gap-3 md:grid-cols-4">
            {[["01", "Set business context", "Organization, entity, user, role and period establish where the person is operating."], ["02", "Open the right business area", "Finance, Operations, Supply Chain and other domains keep their own rules and source records."], ["03", "Review the next move", "Avantiqo surfaces exceptions, approvals, requests and evidence instead of only passive dashboards."], ["04", "Execute and preserve truth", "Approved work moves forward and the resulting status, evidence and business record remain auditable."]].map(([number, title, description]) => (
              <article key={number} className="rounded-[20px] border border-black/[0.075] bg-white p-5"><div className="text-[9px] font-bold text-[#A37849]">{number}</div><h3 className="mt-5 text-[15px] font-semibold tracking-[-0.02em] text-[#302D29]">{title}</h3><p className="mt-2 text-[10px] leading-5 text-[#7A756E]">{description}</p></article>
            ))}
          </div>
        </div>
      </section>

      <section id="intelligence" className="border-b border-black/[0.06] bg-[#171716] text-white">
        <div className="mx-auto grid max-w-[1320px] gap-12 px-5 py-20 sm:px-7 lg:grid-cols-[.86fr_1.14fr] lg:items-center lg:px-10 lg:py-24">
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#D6A66A]"><Spark className="h-3.5 w-3.5" />Avantiqo Intelligence</div>
            <h2 className="mt-4 text-[36px] font-medium leading-[1.04] tracking-[-0.045em] text-[#F7F4EF] sm:text-[44px] lg:text-[52px]">Intelligence belongs inside the work.</h2>
            <p className="mt-6 text-[14px] leading-7 text-white/55">Avantiqo Intelligence is designed to work with the same organization, entity, period, permissions and business evidence as the person using the system. It can help research, summarize, identify next actions, prepare work and coordinate approved automation without becoming a separate source of business authority.</p>
            <div className="mt-7 grid gap-2 sm:grid-cols-2">{["Research with business context", "Surface next actions", "Prepare governed work", "Keep execution auditable"].map((item) => <div key={item} className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-3 text-[10px] text-white/65"><Check className="h-3 w-3 text-[#D6A66A]" />{item}</div>)}</div>
          </div>
          <div className="rounded-[24px] border border-white/[0.08] bg-[#201F1D] p-3 shadow-[0_30px_80px_rgba(0,0,0,0.28)] sm:p-4">
            <div className="rounded-[19px] border border-white/[0.07] bg-[#F7F6F3] p-4 text-[#191919] sm:p-5">
              <div className="flex items-center justify-between gap-4 border-b border-black/[0.06] pb-4"><div><div className="text-[8px] font-semibold uppercase tracking-[0.16em] text-[#9A744B]">Business Partner</div><div className="mt-1 text-[13px] font-semibold text-[#34302B]">What needs my attention today?</div></div><div className="flex h-8 w-8 items-center justify-center rounded-xl border border-[#D6A66A]/25 bg-[#D6A66A]/[0.08] text-[#9A744B]"><Spark className="h-3.5 w-3.5" /></div></div>
              <div className="mt-4 space-y-2.5">{[["1", "Finance", "Four approvals are waiting for decision before settlement can continue.", "Review approvals"], ["2", "Supply Chain", "One stock exception is blocking the next fulfilment step.", "Open exception"], ["3", "Operations", "Two service items need evidence before they can be completed.", "Review work"]].map(([number, area, text, action]) => <div key={number} className="grid grid-cols-[24px_minmax(0,1fr)] gap-3 rounded-xl border border-black/[0.06] bg-white p-3"><div className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#F7F2EA] text-[8px] font-bold text-[#9A744B]">{number}</div><div><div className="text-[7px] font-semibold uppercase tracking-[0.13em] text-[#8A867F]">{area}</div><p className="mt-1 text-[9px] leading-4 text-[#57524C]">{text}</p><div className="mt-2 inline-flex items-center gap-1 text-[8px] font-semibold text-[#8D643C]">{action}<Arrow className="h-2.5 w-2.5" /></div></div></div>)}</div>
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-black/[0.07] bg-[#FBFAF8] px-3 py-3 text-[9px] text-[#A09A92]"><Spark className="h-3 w-3 text-[#9A744B]" />Ask about the business, a decision or the next action…</div>
            </div>
          </div>
        </div>
      </section>

      <ConnectedServiceDataOverview />

      <section className="border-b border-black/[0.06] bg-white/55">
        <div className="mx-auto grid max-w-[1320px] gap-10 px-5 py-20 sm:px-7 lg:grid-cols-[1fr_.8fr] lg:items-start lg:px-10 lg:py-24">
          <SectionTitle eyebrow="Privacy & control" title="Connected services remain customer controlled.">
            <p>Avantiqo&apos;s Privacy Policy explains how organizational data and connected-service data are accessed, used, stored, shared, retained and deleted. Authorized administrators decide which external services are connected and can disconnect them when required.</p>
          </SectionTitle>
          <div className="grid gap-3">
            <a href="/policy" className="rounded-[20px] border border-[#D6A66A]/24 bg-[#FBF7F0] p-5 transition hover:border-[#D6A66A]/45"><p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#9A744B]">Privacy Policy</p><p className="mt-2 text-[11px] leading-5 text-[#6F6961]">How Avantiqo handles platform data, connected-service data and authorized provider access.</p></a>
            <a href="/terms" className="rounded-[20px] border border-black/[0.075] bg-white p-5 transition hover:border-black/[0.14]"><p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#69645D]">Terms of Service</p><p className="mt-2 text-[11px] leading-5 text-[#77716A]">The terms governing access to Avantiqo and authorized connected business services.</p></a>
          </div>
        </div>
      </section>

      <section className="bg-[#F7F6F3]">
        <div className="mx-auto max-w-[1120px] px-5 py-20 text-center sm:px-7 lg:px-10 lg:py-24">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl border border-[#D6A66A]/25 bg-[#D6A66A]/[0.08] text-[10px] font-bold text-[#9A744B]">AV</div>
          <h2 className="mx-auto mt-6 max-w-3xl text-[36px] font-medium leading-[1.04] tracking-[-0.045em] text-[#1B1A18] sm:text-[44px] lg:text-[52px]">One company context. One place to operate.</h2>
          <p className="mx-auto mt-5 max-w-2xl text-[14px] leading-7 text-[#716C65]">The organization decides who can access Avantiqo, which external services are connected, what requires approval and which workflows may be automated.</p>
          <a href="/login" className="mt-8 inline-flex h-11 items-center gap-2 rounded-xl bg-[#171716] px-5 text-[11px] font-semibold text-white shadow-[0_6px_18px_rgba(20,18,15,0.14)]">Login to Avantiqo <Arrow className="h-3.5 w-3.5" /></a>
        </div>
      </section>

      <footer className="border-t border-black/[0.07] bg-[#FBFAF8]">
        <div className="mx-auto flex max-w-[1320px] flex-col gap-5 px-5 py-8 text-[10px] text-[#817B73] sm:flex-row sm:items-end sm:justify-between sm:px-7 lg:px-10">
          <div><div><span className="font-semibold text-[#3E3933]">Avantiqo</span><span className="ml-2">Business Operating System</span></div><div className="mt-2 text-[9px] leading-5 text-[#9B958D]">Avantiqo is operated by BEA Co., Ltd., Thailand. Company Registration No. 0835553004601.</div></div>
          <div className="flex flex-wrap gap-5"><a href="/policy" className="transition hover:text-[#8A633C]">Privacy Policy</a><a href="/terms" className="transition hover:text-[#8A633C]">Terms of Service</a><a href="#connected-service-data" className="transition hover:text-[#8A633C]">Connected services</a><a href="/login" className="transition hover:text-[#8A633C]">Login</a></div>
        </div>
      </footer>
    </main>
  );
}
