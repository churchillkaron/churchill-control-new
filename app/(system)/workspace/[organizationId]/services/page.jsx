export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";

import WorkspaceHeader from "@/components/workspace/WorkspaceHeader";
import WorkspaceModuleGrid from "@/components/workspace/WorkspaceModuleGrid";
import { requirePlatformAdminAccess } from "@/lib/platform/security/requirePlatformAdminAccess";
import { isPlatformOperatorWorkspace } from "@/lib/platform/security/PlatformOperatorWorkspaceRuntime";

export default async function ServicesPage({ params }) {
  const resolvedParams = await params;
  const organizationId = String(resolvedParams?.organizationId || "").trim();
  const access = await requirePlatformAdminAccess().catch(() => ({ success: false }));
  const operatorWorkspace = access.success
    ? await isPlatformOperatorWorkspace(organizationId).catch(() => false)
    : false;

  if (!access.success || !operatorWorkspace) {
    notFound();
  }

  return (
    <>
      <WorkspaceHeader
        workspace="Services"
        title="Services"
        description="Manage platform services, integrations, wallet, usage, billing and platform operations."
      />

      <WorkspaceModuleGrid
        workspace="services"
        organizationId={organizationId}
      />
    </>
  );
}
