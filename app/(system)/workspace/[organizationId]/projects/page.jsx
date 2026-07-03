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

  const workspace = getWorkspaceMeta("projects");
  const groups = getWorkspaceGroups("projects");

  return (
    <>
      <WorkspaceHeader
        workspace={workspace?.name || "projects"}
        title={workspace?.title || workspace?.name || "projects"}
        description={workspace?.description || ""}
      />

      <WorkspaceModuleGrid
        workspace="projects"
        organizationId={organizationId}
      />
    </>
  );
}
