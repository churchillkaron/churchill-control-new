"use client";

export const dynamic = "force-dynamic";

import { useParams } from "next/navigation";
import WorkspaceHeader from "@/components/workspace/WorkspaceHeader";
import WorkspaceModuleGrid from "@/components/workspace/WorkspaceModuleGrid";
import {
  getWorkspaceMeta,
  getWorkspaceGroups,
} from "@/lib/platform/registry/erpRegistry";

export default function OperationsWorkspacePage() {
  const { organizationId } = useParams();

  const workspace = getWorkspaceMeta("operations");
  const groups = getWorkspaceGroups("operations");

  return (
    <>
      <WorkspaceHeader
        workspace="Operations"
        title={workspace?.title || "Operations"}
        description={
          workspace?.description ||
          "Operations, execution, production and daily workflows."
        }
      />

      {groups.length > 0 ? (
        <WorkspaceModuleGrid
          workspace="operations"
          organizationId={organizationId}
        />
      ) : (
        <section className="rounded-[32px] border border-white/10 bg-white/[0.035] p-8">
          <div className="text-xs uppercase tracking-[0.32em] text-[#D6A66A]/70">
            Operations
          </div>

          <h2 className="mt-3 text-2xl font-semibold tracking-[-0.035em] text-white">
            Operations Workspace
          </h2>

          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/45">
            No Operations work centers are configured in ERP_REGISTRY.
          </p>
        </section>
      )}
    </>
  );
}
