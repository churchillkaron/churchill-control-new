"use client";

import Link from "next/link";
import { Building2, Boxes, ArrowUpRight } from "lucide-react";

export default function PlatformDemoPage() {
  const demoModules = [
    { id: "pos", name: "POS", category: "Operations" },
    { id: "finance", name: "Finance", category: "Finance" },
    { id: "payroll", name: "Payroll", category: "Workforce" },
    { id: "marketing_ai", name: "Marketing AI", category: "AI" },
    { id: "inventory", name: "Inventory", category: "Operations" }
  ];

  return (
    <main className="min-h-screen bg-[#F7F6F3] text-[#191919] p-10">
      <div className="mx-auto max-w-7xl">

        <section className="mb-12 overflow-hidden rounded-[42px] border border-black/[0.08] bg-gradient-to-br from-white to-[#FBF8F3] px-10 py-10 shadow-lg">
          <div className="mb-4 flex items-center gap-3">
            <Building2 className="h-6 w-6 text-[#9B6F3F]" />
            <span className="text-xs uppercase tracking-[0.30em] text-[#9B6F3F]">
              Demo Platform
            </span>
          </div>

          <h1 className="text-6xl font-light tracking-[-0.06em]">Platform Demo</h1>
          <p className="mt-4 max-w-3xl text-[#5F5A54]">
            Explore a live demo of modules and industry features in the platform.
          </p>
        </section>

        <section>
          <div className="mb-6 flex items-center gap-3">
            <Boxes className="h-5 w-5 text-[#D6A66A]" />
            <h2 className="text-xl font-light">Demo Modules</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {demoModules.map(mod => (
              <Link
                key={mod.id}
                href={`/workspace/platform/demo/${mod.id}`}
                className="group rounded-3xl border border-black/[0.08] bg-[#FBF8F3] p-6 transition hover:border-[#D6A66A]/60 hover:bg-white"
              >
                <div className="mb-4 flex justify-between">
                  <Boxes className="h-5 w-5 text-[#D6A66A]" />
                  <ArrowUpRight className="h-5 w-5 text-[#A19A92]" />
                </div>
                <p className="text-lg font-semibold">{mod.name}</p>
                <p className="mt-2 text-sm text-[#817A72]">{mod.category}</p>
              </Link>
            ))}
          </div>
        </section>

      </div>
    </main>
  );
}
