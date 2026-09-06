"use client";

export const dynamic = "force-dynamic";

import { useMemo } from "react";
import { useParams } from "next/navigation";

import OperationsRuntimeWorkCenter from "@/components/workspace/operations/OperationsRuntimeWorkCenter";
import PestControlWorkControl from "@/components/workspace/operations/pest-control/PestControlWorkControl";
import { useOrganizationRuntime } from "@/lib/hooks/useOrganizationRuntime";
import { getOperationsWorkspaceItem } from "@/lib/operations/registry/OperationsWorkspaceResolver";
import { organizationHasIndustrySolution } from "@/lib/platform/solutions/OrganizationIndustrySolutionResolver";

export default function WorkOrdersPage() {
  const params = useParams();
  const { organization, loading } = useOrganizationRuntime();
  const organizationId = params?.organizationId || organization?.id || "";
  const capability = getOperationsWorkspaceItem("work-orders");

  const isPestControl = useMemo(() => organizationHasIndustrySolution({
    organization,
    organizationId,
    solutionId: "pest-control",
  }), [organization, organizationId]);

  if (loading) {
    return <div className="min-h-[420px] bg-[#F7F6F3] p-8 text-sm text-[#77736C]">Preparing work control...</div>;
  }

  if (organization && isPestControl) {
    return <PestControlWorkControl organizationId={organizationId} />;
  }

  return capability ? <OperationsRuntimeWorkCenter capability={capability} /> : null;
}
