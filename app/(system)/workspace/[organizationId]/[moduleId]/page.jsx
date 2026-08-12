export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";

import WorkspaceHeader from "@/components/workspace/WorkspaceHeader";
import WorkspaceModuleGrid from "@/components/workspace/WorkspaceModuleGrid";
import {
  getWorkspaceMeta,
  getWorkspaceGroups,
} from "@/lib/platform/registry/erpRegistry";
import { requirePlatformAdminAccess } from "@/lib/platform/security/requirePlatformAdminAccess";
import { isPlatformOperatorWorkspace } from "@/lib/platform/security/PlatformOperatorWorkspaceRuntime";

const PLATFORM_ONLY_MODULES = new Set(["services", "intelligence"]);

function titleFromId(value) {
  return String(value || "Workspace")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

async function canAccessPlatformModule(organizationId) {
  const access = await requirePlatformAdminAccess().catch(() => ({ success: false }));
  if (!access.success) return false;

  return isPlatformOperatorWorkspace(organizationId).catch(() => false);
}

export default async function OrganizationModulePage({ params }) {
  const resolvedParams = await params;
  const organizationId = String(resolvedParams?.organizationId || "").trim();
  const moduleId = String(resolvedParams?.moduleId || "").trim().toLowerCase();

  if (
    PLATFORM_ONLY_MODULES.has(moduleId) &&
    !(await canAccessPlatformModule(organizationId))
  ) {
    notFound();
  }

  const workspace = getWorkspaceMeta(moduleId);

  if (!workspace) {
    notFound();
  }

  getWorkspaceGroups(moduleId);

  const title = workspace.title || titleFromId(moduleId);

  return (
    <>
      <WorkspaceHeader
        workspace={title}
        title={title}
        description={workspace.description || ""}
      />

      <WorkspaceModuleGrid
        workspace={moduleId}
        organizationId={organizationId}
      />
    </>
  );
}
