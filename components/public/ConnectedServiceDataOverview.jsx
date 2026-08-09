const providers = [
  {
    name: "Google",
    status: "Available where enabled",
    purpose:
      "Google Business Profile, reviews, Google Ads, reporting, campaign management and approved optimization.",
    data:
      "Authorized business locations, reviews, review replies, Google Ads accounts, campaigns, budgets, assets, performance metrics, spend data and the Google account identity used to authorize the connection.",
  },
  {
    name: "Meta · Facebook · Instagram",
    status: "Available where enabled",
    purpose:
      "Connect business pages and advertising accounts for publishing, campaign management, audience workflows, reporting and approved optimization.",
    data:
      "Authorized business pages, Instagram professional accounts, ad accounts, campaigns, creatives, publishing status, performance metrics and the account identity used to authorize the connection.",
  },
  {
    name: "WhatsApp Business",
    status: "Available where enabled",
    purpose:
      "Support customer communication, service workflows, approved messaging, notifications and operational conversations.",
    data:
      "Authorized business account details, approved phone numbers, conversation metadata, message status and message content required for the customer-requested communication workflow.",
  },
  {
    name: "LINE",
    status: "Available where enabled",
    purpose:
      "Support customer communication, notifications, campaigns, service requests and approved messaging through connected LINE business channels.",
    data:
      "Authorized channel information, user or conversation identifiers, message status and message content required for enabled customer communication workflows.",
  },
  {
    name: "Microsoft 365",
    status: "Available where enabled",
    purpose:
      "Connect approved Microsoft business services for email, calendar, documents, collaboration and organization workflows.",
    data:
      "Only the Microsoft account, mailbox, calendar, document or collaboration data required by the specific feature the organization has chosen to enable.",
  },
  {
    name: "Payments & Banking",
    status: "Provider dependent",
    purpose:
      "Support approved payment collection, payouts, bank reconciliation, transaction matching and financial control through connected providers.",
    data:
      "Authorized account identifiers, transaction references, payment status, settlement information and financial data required for the enabled payment or reconciliation workflow.",
  },
  {
    name: "Websites · Portals · APIs",
    status: "Organization controlled",
    purpose:
      "Connect websites, forms, customer portals, mobile apps, kiosks, external systems, webhooks and APIs to Avantiqo workflows.",
    data:
      "Only the business, customer, request, booking, order, document, event or workflow data explicitly submitted or authorized through the connected channel.",
  },
  {
    name: "Other Business Providers",
    status: "Added as approved services",
    purpose:
      "Avantiqo can support additional accounting, logistics, hospitality, service, document, automation and specialist providers as organizations enable them.",
    data:
      "The minimum provider-specific data required to deliver the feature selected by the customer, subject to that provider's own authorization and Avantiqo's organization-level controls.",
  },
];

export default function ConnectedServiceDataOverview() {
  return (
    <section id="connected-service-data" className="border-b border-white/[0.07] bg-[#070812] text-white">
      <div className="mx-auto max-w-7xl px-6 py-20 lg:px-8 lg:py-24">
        <div className="max-w-5xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#D6A66A]">
            Connected service data
          </p>
          <h2 className="mt-4 text-3xl font-light tracking-[-0.04em] text-white sm:text-4xl lg:text-5xl">
            How Avantiqo uses data from connected business services.
          </h2>
          <p className="mt-5 text-[15px] leading-7 text-white/55 sm:text-base sm:leading-8">
            Avantiqo connects external services only when an authorized customer user chooses to connect them. The customer authenticates directly with the provider and grants the permissions needed for the selected feature. Avantiqo does not require customers to share their external-service passwords.
          </p>
          <p className="mt-3 text-[15px] leading-7 text-white/45 sm:text-base sm:leading-8">
            The exact data accessed depends on the provider and the feature the organization enables. Avantiqo is designed to use the minimum data required for that workflow, keep it attached to the correct organization, and allow authorized administrators to disconnect services when required.
          </p>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          {providers.map((provider) => (
            <article key={provider.name} className="rounded-[26px] border border-[#D6A66A]/18 bg-[#D6A66A]/[0.035] p-7">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h3 className="text-2xl font-light text-white">{provider.name}</h3>
                <span className="rounded-full border border-white/[0.08] bg-black/20 px-3 py-1.5 text-[9px] uppercase tracking-[0.13em] text-white/38">
                  {provider.status}
                </span>
              </div>
              <p className="mt-5 text-[15px] leading-7 text-white/55">{provider.purpose}</p>
              <div className="mt-6 rounded-2xl border border-white/[0.07] bg-black/25 p-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-[#D6A66A]">Data used for this feature</p>
                <p className="mt-3 text-sm leading-6 text-white/46">{provider.data}</p>
              </div>
            </article>
          ))}
        </div>

        <div className="mt-8 rounded-[26px] border border-white/[0.08] bg-[#090909] p-7">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#D6A66A]">Customer control</p>
          <div className="mt-5 grid gap-5 text-sm leading-7 text-white/48 md:grid-cols-3">
            <p><strong className="font-medium text-white/82">Authorization:</strong> external access begins only after an authorized customer user connects the service through the provider&apos;s own authorization flow.</p>
            <p><strong className="font-medium text-white/82">Use:</strong> connected data is used to provide the business feature selected by the customer, such as communication, publishing, reporting, reconciliation or approved execution.</p>
            <p><strong className="font-medium text-white/82">Revocation:</strong> authorized administrators can disconnect integrations in Avantiqo and, where supported, revoke access directly with the external provider.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
