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

  const workspace = getWorkspaceMeta("analytics");
  const groups = getWorkspaceGroups("analytics");

  return (
    <>
      <WorkspaceHeader
        workspace={workspace?.name || "analytics"}
        title={workspace?.title || workspace?.name || "analytics"}
        description={workspace?.description || ""}
      />

      <WorkspaceModuleGrid
        workspace="analytics"
        organizationId={organizationId}
      />
    </>
  );
}
