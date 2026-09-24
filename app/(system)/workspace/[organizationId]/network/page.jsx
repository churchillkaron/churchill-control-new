import WorkspaceHeader from "@/components/workspace/WorkspaceHeader";

const groups = [
  {
    title: "Connections",
    items: [
      "Customers",
      "Suppliers",
      "Partners",
      "Accounting Firms",
      "Banks",
      "Insurance",
      "Government",
      "Logistics",
    ],
  },
  {
    title: "Discover",
    items: ["Search Companies", "Marketplace", "Verified Businesses"],
  },
];

export default function BusinessNetworkPage() {
  return (
    <div className="space-y-6">
      <WorkspaceHeader
        title="Business Network"
        description="Discover, connect and collaborate with businesses worldwide."
      />

      <section className="rounded-3xl border border-black/[0.08] bg-[#FBF8F3] p-6">
        <div className="text-[11px] uppercase tracking-[0.28em] text-[#D6A66A]">
          Global Company Graph
        </div>

        <h1 className="mt-3 text-3xl font-light text-[#191919]">
          Connect companies, suppliers, customers and service providers.
        </h1>

        <p className="mt-3 max-w-3xl text-sm font-light leading-6 text-[#5F5A54]">
          Business Network is the Avantiqo business layer for verified company identity,
          relationships, shared documents, capabilities, marketplace discovery and
          business collaboration.
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {groups.map((group) => (
          <section
            key={group.title}
            className="rounded-3xl border border-black/[0.08] bg-[#FBF8F3] p-5"
          >
            <h2 className="text-sm font-light uppercase tracking-[0.22em] text-[#4F4A45]">
              {group.title}
            </h2>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {group.items.map((item) => (
                <div
                  key={item}
                  className="rounded-2xl border border-black/[0.08] bg-[#F7F6F3]/20 p-4 text-sm font-light text-[#5F5A54]"
                >
                  {item}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
