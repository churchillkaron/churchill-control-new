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

export default function PolicyPage() {
  return (
    <main className="min-h-screen bg-[#050507] text-white">
      <header className="border-b border-white/[0.07] bg-[#050507]">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-8">
          <a href="/" className="flex items-center gap-3">
            <img src="/branding/avantiqo-logo.png" alt="Avantiqo" className="h-9 w-auto" />
            <span className="text-sm font-semibold tracking-[0.14em] text-[#E8CB8A]">Avantiqo</span>
          </a>
          <div className="flex items-center gap-4 text-xs text-white/50">
            <a href="/terms" className="hover:text-white">Terms</a>
            <a href="/login" className="rounded-xl bg-[#D6A66A] px-4 py-2.5 font-semibold text-black">Login</a>
          </div>
        </div>
      </header>

      <section className="border-b border-white/[0.07] px-6 py-20 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#D6A66A]">Privacy & data</p>
          <h1 className="mt-5 max-w-5xl text-5xl font-light tracking-[-0.05em] text-white sm:text-6xl">
            Avantiqo Privacy Policy
          </h1>
          <p className="mt-7 max-w-4xl text-lg leading-8 text-white/55">
            This policy explains how Avantiqo handles information used by the Business Operating System, customer organizations and connected business services.
          </p>
        </div>
      </section>

      <section className="border-b border-white/[0.07] px-6 py-16 lg:px-8 lg:py-20">
        <div className="mx-auto grid max-w-7xl gap-5 md:grid-cols-2">
          {policySections.map((section) => (
            <article key={section.title} className="rounded-[24px] border border-white/[0.08] bg-white/[0.025] p-7">
              <h2 className="text-xl font-medium text-white/90">{section.title}</h2>
              <p className="mt-4 text-sm leading-7 text-white/50">{section.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-b border-white/[0.07] bg-[#070812] px-6 py-20 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#D6A66A]">Google API user data</p>
          <h2 className="mt-5 max-w-4xl text-4xl font-light tracking-[-0.045em] text-white sm:text-5xl">
            How Avantiqo uses Google user data
          </h2>
          <p className="mt-6 max-w-4xl text-base leading-8 text-white/55">
            Avantiqo accesses Google user data only after an authorized user explicitly connects a Google service. Access is limited to the organization and features selected by that user. Avantiqo requests only the Google permissions required to provide those connected features.
          </p>

          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {googleData.map((item) => (
              <div key={item} className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-6 text-sm leading-7 text-white/50">
                {item}
              </div>
            ))}
          </div>

          <div className="mt-10 grid gap-6 rounded-[28px] border border-[#D6A66A]/18 bg-[#D6A66A]/[0.035] p-7 md:grid-cols-2 md:p-9">
            <div>
              <h3 className="text-xl font-medium text-white/88">Use</h3>
              <p className="mt-2 text-sm leading-7 text-white/52">
                Google user data is used only to provide or improve user-facing Avantiqo features requested by the connected organization, including Business Profile management, review workflows, Google Ads campaign management, reporting, spend reconciliation and approved optimization. Avantiqo does not use Google user data for unrelated advertising or to build general-purpose advertising profiles.
              </p>
            </div>
            <div>
              <h3 className="text-xl font-medium text-white/88">Storage and security</h3>
              <p className="mt-2 text-sm leading-7 text-white/52">
                Authorization credentials and connected-service records are stored with organization-scoped access controls. Avantiqo applies access restrictions so one customer organization cannot access another organization's connected Google data.
              </p>
            </div>
            <div>
              <h3 className="text-xl font-medium text-white/88">Sharing and transfers</h3>
              <p className="mt-2 text-sm leading-7 text-white/52">
                Avantiqo does not sell Google user data. Google user data is not transferred to third parties except when necessary to provide the user-requested Avantiqo feature, comply with law, protect security, or with the user's explicit consent. Any processing remains subject to applicable Google API Services User Data Policy requirements.
              </p>
            </div>
            <div>
              <h3 className="text-xl font-medium text-white/88">Retention, deletion and revocation</h3>
              <p className="mt-2 text-sm leading-7 text-white/52">
                Connected Google data is retained only for as long as needed to provide the organization's enabled features, meet legitimate legal or accounting obligations, and maintain required audit records. An authorized organization administrator can disconnect a Google integration to stop future access. Users can also revoke Avantiqo's Google access from their Google Account permissions.
              </p>
            </div>
          </div>

          <p className="mt-8 max-w-5xl text-sm leading-7 text-white/42">
            Avantiqo's use and transfer of information received from Google APIs adheres to the Google API Services User Data Policy, including applicable Limited Use requirements.
          </p>
        </div>
      </section>

      <footer className="px-6 py-8 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 text-sm text-white/40">
          <span>Avantiqo Business Operating System</span>
          <div className="flex gap-5">
            <a href="/" className="hover:text-white">Home</a>
            <a href="/terms" className="hover:text-white">Terms of Service</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
