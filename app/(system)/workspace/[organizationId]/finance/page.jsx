"use client";

import { useParams } from "next/navigation";
import WorkspaceHeader from "@/components/workspace/WorkspaceHeader";
import WorkspaceModuleGrid from "@/components/workspace/WorkspaceModuleGrid";

export default function FinanceWorkspacePage() {
  const params = useParams();

  const organizationId =
    params?.organizationId;

  return (
    <>
      <WorkspaceHeader
        workspace="Finance"
        title="Finance"
        description="Professional financial management for accounting firms, operators and multi-entity businesses."
      />

      <WorkspaceModuleGrid
        workspace="finance"
        organizationId={organizationId}
      />
    </>
  );
}
