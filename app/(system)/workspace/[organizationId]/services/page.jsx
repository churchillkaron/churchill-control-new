"use client";

export const dynamic = "force-dynamic";

import { useParams } from "next/navigation";

import WorkspaceHeader from "@/components/workspace/WorkspaceHeader";
import WorkspaceModuleGrid from "@/components/workspace/WorkspaceModuleGrid";

export default function ServicesPage() {
  const { organizationId } = useParams();

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
