export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";

import WorkspaceHeader from "@/components/workspace/WorkspaceHeader";
import WorkspaceModuleGrid from "@/components/workspace/WorkspaceModuleGrid";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

export default async function ServicesPage({ params }) {
  const resolvedParams = await params;
  const organizationId = String(resolvedParams?.organizationId || "").trim();
  const access = await requireOrganizationAccess({ organizationId }).catch(() => ({ success: false }));

  if (!access.success) {
    notFound();
  }

  return (
    <>
      <WorkspaceHeader
        workspace="Services"
        title="Services"
        description="Manage Avantiqo services, wallet, usage, billing and service consumption."
      />

      <WorkspaceModuleGrid
        workspace="services"
        organizationId={access.organizationId}
      />
    </>
  );
}
