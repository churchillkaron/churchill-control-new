"use client";

export const dynamic = "force-dynamic";

import { useParams } from "next/navigation";
import WorkspaceHeader from "@/components/workspace/WorkspaceHeader";
import WorkspaceModuleGrid from "@/components/workspace/WorkspaceModuleGrid";
import {
  getWorkspaceMeta,
  getWorkspaceGroups,
} from "@/lib/platform/registry/erpRegistry";

export default function WorkspacePage() {
  const { organizationId } = useParams();

  const workspace = getWorkspaceMeta("supply-chain");
  const groups = getWorkspaceGroups("supply-chain");

  return (
    <>
      <WorkspaceHeader
        workspace={workspace?.name || "supply-chain"}
        title={workspace?.title || workspace?.name || "supply-chain"}
        description={workspace?.description || ""}
      />

      <WorkspaceModuleGrid
        workspace="supply-chain"
        organizationId={organizationId}
      />
    </>
  );
}
