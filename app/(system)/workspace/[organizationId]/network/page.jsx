import WorkspaceHeader from "@/components/workspace/WorkspaceHeader";

const groups = [
  {
    title: "Connections",
    items: ["Customers", "Suppliers", "Partners", "Accounting Firms", "Banks", "Insurance", "Government", "Logistics"],
  },
  {
    title: "Discover",
    items: ["Search Companies", "Marketplace", "Verified Businesses", "AI Services"],
  },
];

export default function BusinessNetworkPage() {
  return (
    <div className="space-y-6">
      <WorkspaceHeader
        title="Business Network"
        description="Discover, connect and collaborate with businesses worldwide."
      />

      <section className="rounded-3xl border border-white/10 bg-white/[0.025] p-6">
        <div className="text-[11px] uppercase tracking-[0.28em] text-[#D6A66A]">
          Global Company Graph
        </div>

        <h1 className="mt-3 text-3xl font-light text-white">
          Connect companies, suppliers, customers and service providers.
        </h1>

        <p className="mt-3 max-w-3xl text-sm font-light leading-6 text-white/55">
          Business Network is the Avantiqo platform layer for verified company identity,
          relationships, shared documents, capabilities, marketplace discovery and AI-assisted collaboration.
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {groups.map((group) => (
          <section
            key={group.title}
            className="rounded-3xl border border-white/10 bg-white/[0.025] p-5"
          >
            <h2 className="text-sm font-light uppercase tracking-[0.22em] text-white/75">
              {group.title}
            </h2>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {group.items.map((item) => (
                <div
                  key={item}
                  className="rounded-2xl border border-white/8 bg-black/20 p-4 text-sm font-light text-white/65"
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
