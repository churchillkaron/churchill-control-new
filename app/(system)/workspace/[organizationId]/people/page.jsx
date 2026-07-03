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

  const workspace = getWorkspaceMeta("people");
  const groups = getWorkspaceGroups("people");

  return (
    <>
      <WorkspaceHeader
        workspace={workspace?.name || "people"}
        title={workspace?.title || workspace?.name || "people"}
        description={workspace?.description || ""}
      />

      <WorkspaceModuleGrid
        workspace="people"
        organizationId={organizationId}
      />
    </>
  );
}
