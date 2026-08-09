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

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#050507] text-white">
      <header className="border-b border-white/[0.07] bg-[#050507]">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-8">
          <a href="/" className="flex items-center gap-3">
            <img src="/branding/avantiqo-logo.png" alt="Avantiqo" className="h-9 w-auto" />
            <span className="text-sm font-semibold tracking-[0.14em] text-[#E8CB8A]">Avantiqo</span>
          </a>
          <div className="flex items-center gap-4 text-xs text-white/50">
            <a href="/policy" className="hover:text-white">Privacy</a>
            <a href="/login" className="rounded-xl bg-[#D6A66A] px-4 py-2.5 font-semibold text-black">Login</a>
          </div>
        </div>
      </header>

      <section className="border-b border-white/[0.07] px-6 py-20 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#D6A66A]">Terms of Service</p>
          <h1 className="mt-5 max-w-5xl text-5xl font-light tracking-[-0.05em] text-white sm:text-6xl">
            Terms for using the Avantiqo Business Operating System.
          </h1>
          <p className="mt-7 max-w-4xl text-lg leading-8 text-white/55">
            These terms govern authorized access to Avantiqo, organization workspaces, connected providers, AI functionality and business workflows.
          </p>
        </div>
      </section>

      <section className="px-6 py-16 lg:px-8 lg:py-20">
        <div className="mx-auto grid max-w-7xl gap-5 md:grid-cols-2">
          {sections.map(([title, text]) => (
            <article key={title} className="rounded-[24px] border border-white/[0.08] bg-white/[0.025] p-7">
              <h2 className="text-xl font-medium text-white/90">{title}</h2>
              <p className="mt-4 text-sm leading-7 text-white/50">{text}</p>
            </article>
          ))}
        </div>
      </section>

      <footer className="border-t border-white/[0.07] px-6 py-8 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 text-sm text-white/40">
          <span>Avantiqo Business Operating System</span>
          <div className="flex gap-5">
            <a href="/" className="hover:text-white">Home</a>
            <a href="/policy" className="hover:text-white">Privacy Policy</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
