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

  const workspace = getWorkspaceMeta("administration");
  const groups = getWorkspaceGroups("administration");

  return (
    <>
      <WorkspaceHeader
        workspace={workspace?.name || "administration"}
        title={workspace?.title || workspace?.name || "administration"}
        description={workspace?.description || ""}
      />

      <WorkspaceModuleGrid
        workspace="administration"
        organizationId={organizationId}
      />
    </>
  );
}
