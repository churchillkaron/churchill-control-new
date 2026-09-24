"use client";

import { useParams } from "next/navigation";
import { Sparkles } from "lucide-react";

import WorkspaceHeader from "@/components/workspace/WorkspaceHeader";
import WorkspaceModuleGrid from "@/components/workspace/WorkspaceModuleGrid";
import HomeAvantiqoIntelligenceDock from "@/components/operator/HomeAvantiqoIntelligenceDock";

export default function AIWorkspacePage() {
  const params = useParams();
  const organizationId = params?.organizationId || null;

  return (
    <main className="min-h-screen py-1 text-[#191919]">
      <div className="mx-auto max-w-[1540px] space-y-6">
        <WorkspaceHeader
          workspace="AI"
          title="Avantiqo Intelligence"
          description="Ask about this business, make decisions, and use governed intelligence in the active organization context."
        />

        <section className="overflow-hidden rounded-[26px] border border-black/[0.075] bg-white shadow-[0_10px_30px_rgba(31,27,20,0.045)]">
          <div className="flex items-center gap-2 border-b border-black/[0.06] px-5 py-4 text-[10px] font-medium uppercase tracking-[0.18em] text-[#9A744B]">
            <Sparkles size={14} />
            Business Partner
          </div>
          <HomeAvantiqoIntelligenceDock organizationId={organizationId} />
        </section>

        <WorkspaceModuleGrid workspace="ai" organizationId={organizationId} />
      </div>
    </main>
  );
}
