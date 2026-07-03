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

  const workspace = getWorkspaceMeta("documents");
  const groups = getWorkspaceGroups("documents");

  return (
    <>
      <WorkspaceHeader
        workspace={workspace?.name || "documents"}
        title={workspace?.title || workspace?.name || "documents"}
        description={workspace?.description || ""}
      />

      <WorkspaceModuleGrid
        workspace="documents"
        organizationId={organizationId}
      />
    </>
  );
}
