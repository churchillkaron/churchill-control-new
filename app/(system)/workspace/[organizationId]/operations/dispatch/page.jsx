"use client";

export const dynamic = "force-dynamic";

import { useMemo } from "react";
import { useParams } from "next/navigation";

import OperationsRuntimeWorkCenter from "@/components/workspace/operations/OperationsRuntimeWorkCenter";
import PestControlDispatchControl from "@/components/workspace/operations/pest-control/PestControlDispatchControl";
import { useOrganizationRuntime } from "@/lib/hooks/useOrganizationRuntime";
import { getOperationsWorkspaceItem } from "@/lib/operations/registry/OperationsWorkspaceResolver";
import { organizationHasIndustrySolution } from "@/lib/platform/solutions/OrganizationIndustrySolutionResolver";

export default function DispatchPage() {
  const params = useParams();
  const { organization, loading } = useOrganizationRuntime();
  const organizationId = params?.organizationId || organization?.id || "";
  const capability = getOperationsWorkspaceItem("dispatch");

  const isPestControl = useMemo(() => organizationHasIndustrySolution({
    organization,
    organizationId,
    solutionId: "pest-control",
  }), [organization, organizationId]);

  if (loading) {
    return <div className="min-h-[420px] bg-[#F7F6F3] p-8 text-sm text-[#77736C]">Preparing dispatch control...</div>;
  }

  if (organization && isPestControl) {
    return (
      <main className="min-h-[calc(100vh-61px)] bg-[#F7F6F3] px-4 py-5 text-[#201E1B] md:px-7 lg:px-8">
        <div className="mx-auto max-w-[1540px]">
          <PestControlDispatchControl organizationId={organizationId} />
        </div>
      </main>
    );
  }

  return capability ? <OperationsRuntimeWorkCenter capability={capability} /> : null;
}
