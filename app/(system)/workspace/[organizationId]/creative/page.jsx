"use client";

import { useParams } from "next/navigation";
import WorkspaceHeader from "@/components/workspace/WorkspaceHeader";
import WorkspaceModuleGrid from "@/components/workspace/WorkspaceModuleGrid";
import {
  getWorkspaceMeta,
  getWorkspaceGroups,
} from "@/lib/platform/registry/erpRegistry";

export const dynamic = "force-dynamic";

export default function CreativeWorkspacePage() {

  const { organizationId } =
    useParams();

  const workspace =
    getWorkspaceMeta("creative");

  const groups =
    getWorkspaceGroups("creative");

  const title =
    workspace?.title ||
    "Design Studio";

  const description =
    workspace?.description ||
    "AI-powered creative production.";

  return (
    <>
      <WorkspaceHeader
        workspace="Design Studio"
        title={title}
        description={description}
      />

      {groups.length > 0 ? (
        <WorkspaceModuleGrid
          workspace="creative"
          organizationId={organizationId}
        />
      ) : (
        <section className="rounded-[32px] border border-white/10 bg-white/[0.035] p-8">

          <div className="text-xs uppercase tracking-[0.32em] text-[#D6A66A]/70">
            Design Studio
          </div>

          <h2 className="mt-3 text-2xl font-semibold tracking-[-0.035em] text-white">
            Design Studio
          </h2>

          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/45">
            No Design Studio work centers are configured in ERP_REGISTRY.
          </p>

        </section>
      )}

    </>
  );

}
