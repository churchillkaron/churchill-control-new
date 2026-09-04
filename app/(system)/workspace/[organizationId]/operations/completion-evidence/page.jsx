"use client";

export const dynamic = "force-dynamic";

import { useMemo } from "react";
import { useParams } from "next/navigation";

import OperationsRuntimeWorkCenter from "@/components/workspace/operations/OperationsRuntimeWorkCenter";
import PestControlEvidenceHub from "@/components/workspace/operations/pest-control/PestControlEvidenceHub";
import { useOrganizationRuntime } from "@/lib/hooks/useOrganizationRuntime";
import { getOperationsWorkspaceItem } from "@/lib/operations/registry/OperationsWorkspaceResolver";
import { organizationHasIndustrySolution } from "@/lib/platform/solutions/OrganizationIndustrySolutionResolver";

export default function CompletionEvidencePage() {
  const params = useParams();
  const { organization, loading } = useOrganizationRuntime();
  const organizationId = params?.organizationId || organization?.id || "";
  const capability = getOperationsWorkspaceItem("completion-evidence");

  const isPestControl = useMemo(() => organizationHasIndustrySolution({
    organization,
    organizationId,
    solutionId: "pest-control",
  }), [organization, organizationId]);

  if (loading) {
    return <div className="min-h-[420px] bg-[#F7F6F3] p-8 text-sm text-[#77736C]">Preparing completion evidence...</div>;
  }

  if (organization && isPestControl) {
    return <PestControlEvidenceHub organizationId={organizationId} />;
  }

  return capability ? <OperationsRuntimeWorkCenter capability={capability} /> : null;
}
