"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";

import OperationsIndustryCommandCenter from "@/components/workspace/operations/OperationsIndustryCommandCenter";
import PestControlDispatchControl from "@/components/workspace/operations/pest-control/PestControlDispatchControl";
import PestControlServiceHealth from "@/components/workspace/operations/pest-control/PestControlServiceHealth";
import { useOrganizationRuntime } from "@/lib/hooks/useOrganizationRuntime";
import PestControlOperationsProfile from "@/lib/operations/presentation/PestControlOperationsProfile";
import { organizationHasIndustrySolution } from "@/lib/platform/solutions/OrganizationIndustrySolutionResolver";

export default function PestControlPage() {
  const params = useParams();
  const router = useRouter();
  const { organization, loading } = useOrganizationRuntime();
  const organizationId = params?.organizationId || organization?.id || "";

  const isPestControl = useMemo(() => organizationHasIndustrySolution({
    organization,
    organizationId,
    solutionId: "pest-control",
  }), [organization, organizationId]);

  useEffect(() => {
    if (loading || !organization || isPestControl) return;
    const activeOrganizationId = organization.id || organizationId;
    router.replace(
      `/workspace/${encodeURIComponent(activeOrganizationId)}/operations/field-service`,
    );
  }, [isPestControl, loading, organization, organizationId, router]);

  if (loading) {
    return (
      <div className="min-h-[420px] bg-[#F7F6F3] p-8 text-sm text-[#77736C]">
        Preparing Pest Control...
      </div>
    );
  }

  if (!organization || !isPestControl) {
    return (
      <div className="min-h-[420px] bg-[#F7F6F3] p-8 text-sm text-[#77736C]">
        Opening the installed field-service workspace...
      </div>
    );
  }

  return (
    <OperationsIndustryCommandCenter
      profile={PestControlOperationsProfile}
      organizationId={organizationId}
      organizationName={organization?.name}
    >
      <div className="space-y-5">
        <PestControlDispatchControl organizationId={organizationId} />
        <PestControlServiceHealth organizationId={organizationId} />
      </div>
    </OperationsIndustryCommandCenter>
  );
}
