import Image from "next/image";

export const metadata = {
  title: "Terms of Service | Avantiqo",
  description:
    "Terms governing authorized use of the Avantiqo Business Operating System and connected business services.",
};

const sections = [
  ["Platform usage", "Avantiqo provides business operating infrastructure for authorized organizational management, workflows, reporting, automation and connected services. The platform may not be used for unlawful activity, unauthorized access, deliberate disruption or misuse of connected systems."],
  ["Organization and user access", "Organizations are responsible for maintaining accurate users, roles and permissions. Users may act only within organizations and capabilities for which they are authorized. Access may be restricted or removed when required for security, compliance or account administration."],
  ["Connected services", "Organizations may choose to connect third-party accounts and providers. The person connecting a service must be authorized to do so. Third-party services remain subject to their own terms, availability, permissions and policies. Avantiqo uses connected services only for features the organization enables."],
  ["Approvals and execution", "Avantiqo can support approval workflows, external execution, publishing, financial actions and automation. Organizations are responsible for configuring appropriate approval rules and reviewing commitments that require human authorization under their policies or applicable law."],
  ["AI and automation", "AI features may research, summarize, classify, recommend, create drafts, detect issues and support workflow execution. AI output should be reviewed according to the organization's governance requirements, especially where a decision creates financial, legal, employment, customer or external commitments."],
  ["Data and records", "Organizations are responsible for the lawful collection and use of data they place in or connect to Avantiqo. Platform records may be retained for business continuity, auditability, security, accounting and legal obligations according to applicable policies and requirements."],
  ["Security responsibilities", "Users must protect credentials and must not share access in a way that bypasses role or organization controls. Attempts to circumvent security, access another organization's information without authorization or interfere with platform infrastructure are prohibited."],
  ["Service availability", "Avantiqo develops and maintains the platform continuously, but uninterrupted availability cannot be guaranteed. Maintenance, third-party outages, infrastructure incidents or provider changes may temporarily affect features or connected services."],
  ["Changes to services", "Platform capabilities, providers and workflows may evolve as Avantiqo develops. Material changes that require new external permissions or customer authorization should be presented through the relevant connection or approval flow."],
  ["Compliance", "Each organization remains responsible for ensuring its use of Avantiqo complies with the laws, regulations, contractual obligations and industry requirements that apply to its own activities and jurisdiction."],
];

function Arrow() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3 w-3" fill="none">
      <path d="M4 10h11M11 6l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LegalHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-black/[0.07] bg-[#F7F6F3]/95 backdrop-blur-xl">
      <div className="mx-auto flex h-[64px] max-w-[1320px] items-center justify-between gap-5 px-5 sm:px-7 lg:px-10">
        <a href="/" className="flex items-center gap-3" aria-label="Avantiqo home">
          <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl bg-[#171716] p-1.5 shadow-[0_2px_6px_rgba(20,18,15,.12)]">
            <Image src="/branding/avantiqo-logo.png" alt="" width={28} height={28} className="h-full w-full object-contain" />
          </div>
          <div>
            <div className="text-[12px] font-semibold tracking-[-0.01em] text-[#2A2723]">Avantiqo</div>
            <div className="mt-0.5 text-[7px] font-semibold uppercase tracking-[0.16em] text-[#9A744B]">Business Operating System</div>
          </div>
        </a>

        <nav className="flex items-center gap-1.5">
          <a href="/policy" className="rounded-lg px-3 py-2 text-[10px] font-medium text-[#6C6963] transition hover:bg-white hover:text-[#292723]">Privacy</a>
          <a href="/" className="hidden rounded-lg px-3 py-2 text-[10px] font-medium text-[#6C6963] transition hover:bg-white hover:text-[#292723] sm:inline-flex">Home</a>
          <a href="/login" className="ml-1 inline-flex h-9 items-center gap-2 rounded-xl bg-[#171716] px-4 text-[10px] font-semibold text-white shadow-[0_3px_10px_rgba(20,18,15,0.15)] transition hover:bg-[#2A2926]">Login <Arrow /></a>
        </nav>
      </div>
    </header>
  );
}

function LegalFooter() {
  return (
    <footer className="border-t border-black/[0.07] bg-[#FBFAF8]">
      <div className="mx-auto flex max-w-[1320px] flex-col gap-5 px-5 py-8 text-[10px] text-[#817B73] sm:flex-row sm:items-end sm:justify-between sm:px-7 lg:px-10">
        <div>
          <div><span className="font-semibold text-[#3E3933]">Avantiqo</span><span className="ml-2">Business Operating System</span></div>
          <div className="mt-2 text-[9px] leading-5 text-[#9B958D]">Operated by BEA Co., Ltd. · Company Registration No. 0835553004601</div>
        </div>
        <div className="flex flex-wrap gap-5">
          <a href="/" className="transition hover:text-[#8A633C]">Home</a>
          <a href="/policy" className="transition hover:text-[#8A633C]">Privacy Policy</a>
          <a href="/login" className="transition hover:text-[#8A633C]">Login</a>
        </div>
      </div>
    </footer>
  );
}

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#F7F6F3] text-[#191919]">
      <LegalHeader />

      <section className="relative overflow-hidden border-b border-black/[0.06]">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(circle_at_78%_2%,rgba(214,166,106,.15),transparent_34%),radial-gradient(circle_at_10%_28%,rgba(163,120,73,.05),transparent_30%)]" />
        <div className="relative mx-auto max-w-[1320px] px-5 py-16 sm:px-7 sm:py-20 lg:px-10 lg:py-24">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end lg:gap-16">
            <div className="max-w-4xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#D6A66A]/25 bg-[#D6A66A]/[0.08] px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-[#8A633C]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#A37849]" />
                Terms of Service
              </div>
              <h1 className="mt-7 text-[46px] font-medium leading-[1] tracking-[-0.055em] text-[#181817] sm:text-[58px] lg:text-[68px]">Terms for using the Avantiqo Business Operating System.</h1>
              <p className="mt-7 max-w-3xl text-[16px] leading-8 text-[#625F59] sm:text-[17px]">
                These terms govern authorized access to Avantiqo, organization workspaces, connected providers, AI functionality and business workflows.
              </p>
            </div>

            <aside className="rounded-[22px] border border-[#D6A66A]/24 bg-[#FBF7F0] p-5 shadow-[0_8px_30px_rgba(62,49,35,0.05)]">
              <p className="text-[9px] font-semibold uppercase tracking-[0.17em] text-[#9A744B]">Legal operator and contracting entity</p>
              <p className="mt-3 text-[11px] leading-6 text-[#6F6961]">
                Avantiqo is operated by BEA Co., Ltd., Thailand, Company Registration No. 0835553004601. References to “Avantiqo” in these Terms refer to the Avantiqo platform operated by BEA Co., Ltd., with registered office at 514, 1-8 Patak Rd, Karon Beach, Karon, Mueang Phuket District, Phuket 83100, Thailand.
              </p>
            </aside>
          </div>
        </div>
      </section>

      <section className="border-b border-black/[0.06] bg-white/55">
        <div className="mx-auto max-w-[1320px] px-5 py-16 sm:px-7 lg:px-10 lg:py-20">
          <div className="mb-9 max-w-2xl">
            <p className="text-[10px] font-semibold uppercase tracking-[0.19em] text-[#9A744B]">Platform terms</p>
            <h2 className="mt-3 text-[30px] font-medium leading-[1.08] tracking-[-0.04em] text-[#1B1A18] sm:text-[38px]">Clear responsibilities for a governed operating system.</h2>
          </div>

          <div className="grid overflow-hidden rounded-[24px] border border-black/[0.075] bg-white md:grid-cols-2">
            {sections.map(([title, text], index) => (
              <article key={title} className={`min-h-[220px] p-6 sm:p-7 ${index % 2 === 0 ? "md:border-r md:border-black/[0.06]" : ""} ${index < sections.length - 2 ? "border-b border-black/[0.06]" : ""}`}>
                <div className="flex items-start justify-between gap-4">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#F7F2EA] text-[8px] font-bold text-[#9A744B]">{String(index + 1).padStart(2, "0")}</span>
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[#B78A5A]" />
                </div>
                <h3 className="mt-5 text-[16px] font-semibold tracking-[-0.02em] text-[#302D29]">{title}</h3>
                <p className="mt-3 text-[11px] leading-6 text-[#77716A]">{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#F4F1EB]">
        <div className="mx-auto grid max-w-[1320px] gap-6 px-5 py-14 sm:px-7 lg:grid-cols-[1fr_auto] lg:items-center lg:px-10">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.17em] text-[#9A744B]">Privacy and data use</p>
            <h2 className="mt-2 text-[24px] font-medium tracking-[-0.035em] text-[#25221F]">Understand how Avantiqo handles business and connected-service data.</h2>
            <p className="mt-3 max-w-3xl text-[11px] leading-6 text-[#77716A]">The Privacy Policy explains platform data handling, connected services, retention, security and Google API user data requirements.</p>
          </div>
          <a href="/policy" className="inline-flex h-10 shrink-0 items-center gap-2 self-start rounded-xl border border-black/[0.09] bg-white px-4 text-[10px] font-semibold text-[#5A554E] transition hover:border-[#D6A66A]/45 hover:text-[#8A633C] lg:self-auto">Privacy Policy <Arrow /></a>
        </div>
      </section>

      <LegalFooter />
    </main>
  );
}
