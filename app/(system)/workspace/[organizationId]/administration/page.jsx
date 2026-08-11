"use client";

export const dynamic = "force-dynamic";

import { notFound, useParams } from "next/navigation";

import WorkspaceHeader from "@/components/workspace/WorkspaceHeader";
import WorkspaceModuleGrid from "@/components/workspace/WorkspaceModuleGrid";
import {
  getWorkspaceGroups,
  getWorkspaceMeta,
} from "@/lib/platform/registry/erpRegistry";

export default function AdministrationWorkspacePage() {
  const params = useParams();
  const organizationId = params.organizationId;
  const workspaceId = "administration";
  const workspace = getWorkspaceMeta(workspaceId);

  if (!workspace) {
    notFound();
  }

  getWorkspaceGroups(workspaceId);

  return (
    <>
      <WorkspaceHeader
        workspace={workspace.title || "Administration"}
        title={workspace.title || "Administration"}
        description={workspace.description || ""}
      />

      <WorkspaceModuleGrid
        workspace={workspaceId}
        organizationId={organizationId}
      />
    </>
  );
}
