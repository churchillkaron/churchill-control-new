"use client";

import { useParams } from "next/navigation";
import { moduleRegistry } from "@/lib/platform/modules/moduleRegistry";
import { Boxes } from "lucide-react";

export default function PlatformModulePage() {
  const params = useParams();
  const industryId = params?.industryId;
  const moduleId = params?.moduleId;

  const module = moduleRegistry[moduleId];

  return (
    <main className="min-h-screen bg-[#030712] text-white p-10">
      <div className="mx-auto max-w-7xl">
        <div className="rounded-[42px] border border-white/10 bg-white/[0.03] p-10">
          <div className="mb-4 flex items-center gap-3">
            <Boxes className="h-6 w-6 text-violet-300" />
            <span className="text-xs uppercase tracking-[0.30em] text-violet-300/80">
              Platform Module
            </span>
          </div>
          <h1 className="text-6xl font-light capitalize tracking-[-0.06em]">
            {module?.name || moduleId}
          </h1>
          <p className="mt-4 text-white/60">{module?.category}</p>
          <p className="mt-2 text-white/50">{module?.description}</p>

          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {(module?.kpis || []).map(kpi => (
              <div key={kpi} className="rounded-2xl bg-black/40 p-4 text-center border border-white/10 shadow-lg">
                <p className="text-sm text-white/40">{kpi}</p>
                <p className="mt-2 text-2xl font-semibold">0</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
