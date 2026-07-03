"use client";

import { useParams } from "next/navigation";

import WorkspaceHeader from "@/components/workspace/WorkspaceHeader";
import WorkspaceModuleGrid from "@/components/workspace/WorkspaceModuleGrid";

import {
  getWorkspaceMeta,
  getWorkspaceGroups,
} from "@/lib/platform/registry/erpRegistry";


function titleFromId(value) {
  return String(value || "Workspace")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase());
}

export default function OrganizationModulePage() {

  const params =
    useParams();

  const organizationId =
    params.organizationId;

  const moduleId =
    String(params.moduleId || "").toLowerCase();

  const workspace =
    getWorkspaceMeta(moduleId);

  const groups =
    getWorkspaceGroups(moduleId);

  const title =
    workspace?.title ||
    titleFromId(moduleId);

  return (
    <>
      <WorkspaceHeader
        workspace={title}
        title={title}
        description={
          workspace?.description ||
          ""
        }
      />

      <WorkspaceModuleGrid
        workspace={moduleId}
        organizationId={organizationId}
        capabilities={capabilities}
      />
    </>
  );

}
