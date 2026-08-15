export const metadata = {
  title: "Data Deletion | Avantiqo",
  description:
    "Instructions for requesting deletion of Avantiqo account, organization and connected-service data.",
};

const steps = [
  {
    title: "Disconnect connected services",
    text: "If your request concerns a connected provider such as Meta, Google, LinkedIn or another integration, an authorized organization administrator should first disconnect that integration in Avantiqo. This stops future provider access while the deletion request is processed.",
  },
  {
    title: "Submit the deletion request",
    text: "Send the request from the email address associated with your Avantiqo account to patric@pcsphuket.com with the subject ‘Avantiqo Data Deletion Request’. Include your name, organization name, the connected service or account involved, and whether you are requesting deletion of specific connected-service data or all eligible Avantiqo data associated with your account.",
  },
  {
    title: "Identity and authority verification",
    text: "Avantiqo may ask for additional information needed to verify your identity and, for organization data, that you are authorized to request deletion on behalf of that organization. This protects business and personal information from unauthorized deletion requests.",
  },
  {
    title: "Deletion and confirmation",
    text: "After verification, Avantiqo will delete or anonymize data that is eligible for deletion and confirm completion through the verified contact channel. Some records may need to be retained where required for legal, accounting, fraud-prevention, security, contractual or audit obligations.",
  },
];

export default function DataDeletionPage() {
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
            <a href="/terms" className="hover:text-white">Terms</a>
            <a href="/login" className="rounded-xl bg-[#D6A66A] px-4 py-2.5 font-semibold text-black">Login</a>
          </div>
        </div>
      </header>

      <section className="border-b border-white/[0.07] px-6 py-20 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#D6A66A]">Privacy & data</p>
          <h1 className="mt-5 max-w-5xl text-5xl font-light tracking-[-0.05em] text-white sm:text-6xl">
            Data deletion instructions
          </h1>
          <p className="mt-7 max-w-4xl text-lg leading-8 text-white/55">
            These instructions explain how an Avantiqo user or authorized organization representative can request deletion of eligible account, organization and connected-service data.
          </p>
          <p className="mt-3 text-xs text-white/35">Last updated: 15 August 2026</p>
          <div className="mt-8 max-w-4xl rounded-2xl border border-[#D6A66A]/20 bg-[#D6A66A]/[0.04] p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#D6A66A]">Legal operator</p>
            <p className="mt-3 text-sm leading-7 text-white/55">
              Avantiqo is operated by BEA Co., Ltd., Company Registration No. 0835553004601, with registered office at 514, 1-8 Patak Rd, Karon Beach, Karon, Mueang Phuket District, Phuket 83100, Thailand.
            </p>
          </div>
        </div>
      </section>

      <section className="border-b border-white/[0.07] px-6 py-16 lg:px-8 lg:py-20">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-5 md:grid-cols-2">
            {steps.map((step, index) => (
              <article key={step.title} className="rounded-[24px] border border-white/[0.08] bg-white/[0.025] p-7">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#D6A66A]">Step {index + 1}</p>
                <h2 className="mt-3 text-xl font-medium text-white/90">{step.title}</h2>
                <p className="mt-4 text-sm leading-7 text-white/50">{step.text}</p>
              </article>
            ))}
          </div>

          <div className="mt-8 rounded-[24px] border border-white/[0.08] bg-[#070812] p-7 md:p-9">
            <h2 className="text-xl font-medium text-white/90">Meta, Facebook, Instagram and WhatsApp data</h2>
            <p className="mt-4 max-w-5xl text-sm leading-7 text-white/50">
              If you connected a Meta business account, Facebook Page, Instagram account or WhatsApp Business Account to Avantiqo, disconnect the relevant integration in Avantiqo and then submit a deletion request using the instructions above. The request should identify the organization and Meta-connected asset so Avantiqo can locate the correct organization-scoped records without affecting another customer’s data.
            </p>
          </div>
        </div>
      </section>

      <footer className="px-6 py-8 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 text-sm text-white/40">
          <div>
            <div>Avantiqo Business Operating System</div>
            <div className="mt-1 text-xs text-white/30">Operated by BEA Co., Ltd. · Company Registration No. 0835553004601</div>
          </div>
          <div className="flex gap-5">
            <a href="/" className="hover:text-white">Home</a>
            <a href="/policy" className="hover:text-white">Privacy Policy</a>
            <a href="/terms" className="hover:text-white">Terms of Service</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
