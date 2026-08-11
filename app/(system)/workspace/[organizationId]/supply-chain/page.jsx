"use client";

export const dynamic = "force-dynamic";

import { notFound, useParams } from "next/navigation";

import WorkspaceHeader from "@/components/workspace/WorkspaceHeader";
import WorkspaceModuleGrid from "@/components/workspace/WorkspaceModuleGrid";
import { getWorkspaceMeta } from "@/lib/platform/registry/erpRegistry";

export default function SupplyChainWorkspacePage() {
  const params = useParams();
  const organizationId = params.organizationId;
  const workspaceId = "supply-chain";
  const workspace = getWorkspaceMeta(workspaceId);

  if (!workspace) {
    notFound();
  }

  return (
    <>
      <WorkspaceHeader
        workspace={workspace.title || "Supply Chain"}
        title={workspace.title || "Supply Chain"}
        description={workspace.description || ""}
      />

      <WorkspaceModuleGrid
        workspace={workspaceId}
        organizationId={organizationId}
      />
    </>
  );
}
