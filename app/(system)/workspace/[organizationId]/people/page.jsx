"use client";

export const dynamic = "force-dynamic";

import { notFound, useParams } from "next/navigation";

import WorkspaceHeader from "@/components/workspace/WorkspaceHeader";
import WorkspaceModuleGrid from "@/components/workspace/WorkspaceModuleGrid";
import { getWorkspaceMeta } from "@/lib/platform/registry/erpRegistry";

export default function PeopleWorkspacePage() {
  const params = useParams();
  const organizationId = params.organizationId;
  const workspaceId = "people";
  const workspace = getWorkspaceMeta(workspaceId);

  if (!workspace) {
    notFound();
  }

  return (
    <>
      <WorkspaceHeader
        workspace={workspace.title || "People"}
        title={workspace.title || "People"}
        description={workspace.description || ""}
      />

      <WorkspaceModuleGrid
        workspace={workspaceId}
        organizationId={organizationId}
      />
    </>
  );
}
