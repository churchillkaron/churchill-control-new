import Image from "next/image";

export const metadata = {
  title: "Privacy Policy | Avantiqo",
  description:
    "How Avantiqo handles platform data, organization data and connected-service data, including Google API user data.",
};

const policySections = [
  {
    title: "Platform and organizational data",
    text: "Avantiqo processes organizational, operational, financial, workforce, commercial, customer, document and configuration data to provide the business workflows an organization enables. Access is governed by organization context, user permissions, roles and approved platform capabilities.",
  },
  {
    title: "Connected-service data",
    text: "When an authorized user connects an external provider, Avantiqo may access the provider data required for the selected feature. The exact information depends on the provider and the permissions granted by the customer through that provider's authorization process.",
  },
  {
    title: "Use of information",
    text: "Avantiqo uses information to provide requested business functionality, execute authorized workflows, maintain records and auditability, support reporting and reconciliation, improve enabled user-facing features, protect the service and comply with applicable legal obligations.",
  },
  {
    title: "Organization isolation and access",
    text: "Avantiqo is designed so business records and connected-service access remain associated with the correct organization. Users are given access according to organization membership, role and permissions. External accounts are connected only by users authorized to act for that organization.",
  },
  {
    title: "AI and automation",
    text: "Where enabled, Avantiqo may use authorized business data to research, summarize, classify, recommend, create drafts, detect issues and coordinate approved workflows. Organizations remain responsible for configuring approvals and deciding which actions may be automated.",
  },
  {
    title: "Sharing and service providers",
    text: "Avantiqo does not sell personal data or connected-service user data. Information may be processed by infrastructure or service providers when necessary to deliver a customer-requested feature, maintain security, comply with law or act with the user's or organization's authorization.",
  },
  {
    title: "Retention and deletion",
    text: "Information is retained for as long as reasonably required to provide enabled services, maintain legitimate business and audit records, meet legal or accounting obligations and protect platform integrity. Authorized administrators can disconnect integrations to stop future provider access. Data deletion requests can be submitted through Avantiqo support subject to applicable retention obligations.",
  },
  {
    title: "Security",
    text: "Avantiqo uses access controls, organization-scoped authorization and protected infrastructure to reduce unauthorized access. Customers are responsible for protecting their credentials, assigning appropriate permissions and promptly removing access that is no longer required.",
  },
];

const googleData = [
  "Google Account email address, used to identify the Google account that authorized a connection.",
  "Google Business Profile data, including business locations, reviews and review replies, when an organization connects Google Business Profile.",
  "Google Ads account, campaign, budget, asset, performance and spend data, when an organization connects Google Ads.",
];

const googleUseSections = [
  {
    title: "Use",
    text: "Google user data is used only to provide or improve user-facing Avantiqo features requested by the connected organization, including Business Profile management, review workflows, Google Ads campaign management, reporting, spend reconciliation and approved optimization. Avantiqo does not use Google user data for unrelated advertising or to build general-purpose advertising profiles.",
  },
  {
    title: "Storage and security",
    text: "Authorization credentials and connected-service records are stored with organization-scoped access controls. Avantiqo applies access restrictions so one customer organization cannot access another organization's connected Google data.",
  },
  {
    title: "Sharing and transfers",
    text: "Avantiqo does not sell Google user data. Google user data is not transferred to third parties except when necessary to provide the user-requested Avantiqo feature, comply with law, protect security, or with the user's explicit consent. Any processing remains subject to applicable Google API Services User Data Policy requirements.",
  },
  {
    title: "Retention, deletion and revocation",
    text: "Connected Google data is retained only for as long as needed to provide the organization's enabled features, meet legitimate legal or accounting obligations, and maintain required audit records. An authorized organization administrator can disconnect a Google integration to stop future access. Users can also revoke Avantiqo's Google access from their Google Account permissions.",
  },
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
          <a href="/terms" className="rounded-lg px-3 py-2 text-[10px] font-medium text-[#6C6963] transition hover:bg-white hover:text-[#292723]">Terms</a>
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
          <a href="/terms" className="transition hover:text-[#8A633C]">Terms of Service</a>
          <a href="/login" className="transition hover:text-[#8A633C]">Login</a>
        </div>
      </div>
    </footer>
  );
}

export default function PolicyPage() {
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
                Privacy & data
              </div>
              <h1 className="mt-7 text-[46px] font-medium leading-[1] tracking-[-0.055em] text-[#181817] sm:text-[58px] lg:text-[68px]">Avantiqo Privacy Policy</h1>
              <p className="mt-7 max-w-3xl text-[16px] leading-8 text-[#625F59] sm:text-[17px]">
                This policy explains how Avantiqo handles information used by the Business Operating System, customer organizations and connected business services.
              </p>
            </div>

            <aside className="rounded-[22px] border border-[#D6A66A]/24 bg-[#FBF7F0] p-5 shadow-[0_8px_30px_rgba(62,49,35,0.05)]">
              <p className="text-[9px] font-semibold uppercase tracking-[0.17em] text-[#9A744B]">Legal operator</p>
              <p className="mt-3 text-[11px] leading-6 text-[#6F6961]">
                Avantiqo is a business platform operated by BEA Co., Ltd., a company registered in Thailand under Company Registration No. 0835553004601, with registered office at 514, 1-8 Patak Rd, Karon Beach, Karon, Mueang Phuket District, Phuket 83100, Thailand.
              </p>
            </aside>
          </div>
        </div>
      </section>

      <section className="border-b border-black/[0.06] bg-white/55">
        <div className="mx-auto max-w-[1320px] px-5 py-16 sm:px-7 lg:px-10 lg:py-20">
          <div className="mb-9 max-w-2xl">
            <p className="text-[10px] font-semibold uppercase tracking-[0.19em] text-[#9A744B]">Core policy</p>
            <h2 className="mt-3 text-[30px] font-medium leading-[1.08] tracking-[-0.04em] text-[#1B1A18] sm:text-[38px]">How information is governed in Avantiqo.</h2>
          </div>

          <div className="grid overflow-hidden rounded-[24px] border border-black/[0.075] bg-white md:grid-cols-2">
            {policySections.map((section, index) => (
              <article key={section.title} className={`min-h-[220px] p-6 sm:p-7 ${index % 2 === 0 ? "md:border-r md:border-black/[0.06]" : ""} ${index < policySections.length - 2 ? "border-b border-black/[0.06]" : ""}`}>
                <div className="flex items-start justify-between gap-4">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#F7F2EA] text-[8px] font-bold text-[#9A744B]">{String(index + 1).padStart(2, "0")}</span>
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[#B78A5A]" />
                </div>
                <h3 className="mt-5 text-[16px] font-semibold tracking-[-0.02em] text-[#302D29]">{section.title}</h3>
                <p className="mt-3 text-[11px] leading-6 text-[#77716A]">{section.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-black/[0.06] bg-[#F4F1EB]">
        <div className="mx-auto max-w-[1320px] px-5 py-16 sm:px-7 lg:px-10 lg:py-20">
          <div className="grid gap-8 lg:grid-cols-[.72fr_1.28fr] lg:gap-14">
            <div className="max-w-lg">
              <p className="text-[10px] font-semibold uppercase tracking-[0.19em] text-[#9A744B]">Google API user data</p>
              <h2 className="mt-3 text-[32px] font-medium leading-[1.06] tracking-[-0.045em] text-[#1B1A18] sm:text-[42px]">How Avantiqo uses Google user data.</h2>
              <p className="mt-5 text-[12px] leading-6 text-[#716C65]">
                Avantiqo accesses Google user data only after an authorized user explicitly connects a Google service. Access is limited to the organization and features selected by that user. Avantiqo requests only the Google permissions required to provide those connected features.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {googleData.map((item, index) => (
                <div key={item} className="rounded-[20px] border border-black/[0.075] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
                  <div className="text-[8px] font-bold uppercase tracking-[0.14em] text-[#A37849]">Data {index + 1}</div>
                  <p className="mt-4 text-[10px] leading-5 text-[#6F6A63]">{item}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-10 grid overflow-hidden rounded-[24px] border border-[#D6A66A]/22 bg-[#FBF8F2] md:grid-cols-2">
            {googleUseSections.map((section, index) => (
              <article key={section.title} className={`p-6 sm:p-7 ${index % 2 === 0 ? "md:border-r md:border-[#D6A66A]/16" : ""} ${index < 2 ? "border-b border-[#D6A66A]/16" : ""}`}>
                <h3 className="text-[15px] font-semibold tracking-[-0.02em] text-[#37322C]">{section.title}</h3>
                <p className="mt-3 text-[10px] leading-6 text-[#746D64]">{section.text}</p>
              </article>
            ))}
          </div>

          <div className="mt-8 flex items-start gap-3 rounded-2xl border border-black/[0.07] bg-white px-5 py-4">
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#A37849]" />
            <p className="text-[10px] leading-5 text-[#77716A]">
              Avantiqo&apos;s use and transfer of information received from Google APIs adheres to the Google API Services User Data Policy, including applicable Limited Use requirements.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-[#F7F6F3]">
        <div className="mx-auto flex max-w-[1320px] flex-col gap-5 px-5 py-12 sm:flex-row sm:items-center sm:justify-between sm:px-7 lg:px-10">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.17em] text-[#9A744B]">Related legal information</p>
            <h2 className="mt-2 text-[22px] font-medium tracking-[-0.035em] text-[#25221F]">Review the terms governing use of Avantiqo.</h2>
          </div>
          <a href="/terms" className="inline-flex h-10 shrink-0 items-center gap-2 self-start rounded-xl border border-black/[0.09] bg-white px-4 text-[10px] font-semibold text-[#5A554E] transition hover:border-[#D6A66A]/45 hover:text-[#8A633C] sm:self-auto">Terms of Service <Arrow /></a>
        </div>
      </section>

      <LegalFooter />
    </main>
  );
}
