"use client";

import { useParams } from "next/navigation";
import { moduleRegistry } from "@/lib/platform/modules/moduleRegistry";
import { Boxes } from "lucide-react";

export default function PlatformModulePage() {
  const params = useParams();
  const industryId = params?.industryId;
  const moduleId = params?.moduleId;
  const platformModule = moduleRegistry[moduleId];

  return (
    <main className="min-h-screen bg-[#F7F6F3] text-[#191919] p-10">
      <div className="mx-auto max-w-7xl">
        <div className="rounded-[42px] border border-black/[0.08] bg-[#FBF8F3] p-10">
          <div className="mb-4 flex items-center gap-3">
            <Boxes className="h-6 w-6 text-amber-300" />
            <span className="text-xs uppercase tracking-[0.30em] text-amber-300/80">
              Platform Module
            </span>
          </div>
          <h1 className="text-6xl font-light capitalize tracking-[-0.06em]">
            {platformModule?.name || moduleId}
          </h1>
          <p className="mt-4 text-[#5F5A54]">{platformModule?.category}</p>
          <p className="mt-2 text-[#746E66]">{platformModule?.description}</p>

          <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
            {(platformModule?.kpis || []).map((kpi) => (
              <div
                key={kpi}
                className="rounded-2xl border border-black/[0.08] bg-[#F7F6F3]/40 p-4 text-center shadow-lg"
              >
                <p className="text-sm text-[#817A72]">{kpi}</p>
                <p className="mt-2 text-2xl font-semibold">0</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
