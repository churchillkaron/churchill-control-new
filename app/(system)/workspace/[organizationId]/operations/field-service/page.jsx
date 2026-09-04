"use client";

export const dynamic = "force-dynamic";

import { useMemo } from "react";
import { useParams } from "next/navigation";

import OperationsIndustryCommandCenter from "@/components/workspace/operations/OperationsIndustryCommandCenter";
import PestControlServiceHealth from "@/components/workspace/operations/pest-control/PestControlServiceHealth";
import { useOrganizationRuntime } from "@/lib/hooks/useOrganizationRuntime";
import PestControlOperationsProfile from "@/lib/operations/presentation/PestControlOperationsProfile";
import { getOperationsIndustryProfile } from "@/lib/operations/presentation/OperationsIndustryProfiles";
import { organizationHasIndustrySolution } from "@/lib/platform/solutions/OrganizationIndustrySolutionResolver";

export default function FieldServiceControlPage() {
  const params = useParams();
  const { organization, loading } = useOrganizationRuntime();
  const organizationId = params?.organizationId || organization?.id || "";

  const isPestControl = useMemo(() => organizationHasIndustrySolution({
    organization,
    organizationId,
    solutionId: "pest-control",
  }), [organization, organizationId]);

  const profile = isPestControl
    ? PestControlOperationsProfile
    : getOperationsIndustryProfile("fieldService");

  if (loading) {
    return <div className="min-h-[420px] bg-[#F7F6F3] p-8 text-sm text-[#77736C]">Preparing Field Service Control...</div>;
  }

  return (
    <OperationsIndustryCommandCenter
      profile={profile}
      organizationId={organizationId}
      organizationName={organization?.name}
    >
      {isPestControl ? <PestControlServiceHealth organizationId={organizationId} /> : null}
    </OperationsIndustryCommandCenter>
  );
}
