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

  const workspace = getWorkspaceMeta("compliance");
  const groups = getWorkspaceGroups("compliance");

  return (
    <>
      <WorkspaceHeader
        workspace={workspace?.name || "compliance"}
        title={workspace?.title || workspace?.name || "compliance"}
        description={workspace?.description || ""}
      />

      <WorkspaceModuleGrid
        workspace="compliance"
        organizationId={organizationId}
      />
    </>
  );
}
