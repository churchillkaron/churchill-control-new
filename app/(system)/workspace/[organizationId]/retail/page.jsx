"use client";

import Link from "next/link";
import { useOrganization } from "@/app/providers/OrganizationProvider";

const modules = [
  { name: "Dashboard", href: "dashboard" },
  { name: "POS", href: "pos" },
  { name: "Inventory", href: "inventory" },
  { name: "Products", href: "products" },
  { name: "Customers", href: "customers" },
  { name: "Suppliers", href: "suppliers" },
  { name: "Promotions", href: "promotions" },
  { name: "Finance", href: "finance" },
  { name: "Analytics", href: "analytics" },
];

export default function RetailPage() {
  const { organization } = useOrganization();

  return (
    <main className="min-h-screen bg-[#030712] p-8 text-white">
      <section className="mb-8 rounded-[36px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(139,92,246,0.22),transparent_35%),linear-gradient(135deg,rgba(18,15,35,0.95),rgba(3,7,18,0.98))] p-8">
        <p className="text-xs uppercase tracking-[0.32em] text-violet-300/80">
          Industry Workspace
        </p>
        <h1 className="mt-3 text-5xl font-semibold tracking-[-0.04em]">
          Retail
        </h1>
        <p className="mt-3 text-white/50">
          {organization?.name}
        </p>
      </section>

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
        {modules.map((module) => (
          <Link
            key={module.href}
            href={organization?.id ? `/workspace/${organization.id}/retail/${module.href}` : "#"}
            className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition hover:border-violet-400/40 hover:bg-white/[0.06]"
          >
            <div className="text-lg font-semibold">{module.name}</div>
          </Link>
        ))}
      </div>
    </main>
  );
}
