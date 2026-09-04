"use client";

export const dynamic = "force-dynamic";

import { useMemo } from "react";
import { useParams } from "next/navigation";

import OperationsIndustryCommandCenter from "@/components/workspace/operations/OperationsIndustryCommandCenter";
import { useOrganizationRuntime } from "@/lib/hooks/useOrganizationRuntime";
import PestControlOperationsProfile from "@/lib/operations/presentation/PestControlOperationsProfile";
import { getOperationsIndustryProfile } from "@/lib/operations/presentation/OperationsIndustryProfiles";
import { resolveOrganizationOperationalSolutions } from "@/lib/platform/solutions/OrganizationOperationalSolutionRegistry";

export default function FieldServiceControlPage() {
  const params = useParams();
  const { organization, loading } = useOrganizationRuntime();
  const organizationId = params?.organizationId || organization?.id || "";

  const profile = useMemo(() => {
    const solutions = resolveOrganizationOperationalSolutions({
      organization,
      organizationId,
    });
    const isPestControl = solutions.some((solution) => solution.id === "pest-control");
    return isPestControl
      ? PestControlOperationsProfile
      : getOperationsIndustryProfile("fieldService");
  }, [organization, organizationId]);

  if (loading) {
    return <div className="min-h-[420px] bg-[#F7F6F3] p-8 text-sm text-[#77736C]">Preparing Field Service Control...</div>;
  }

  return (
    <OperationsIndustryCommandCenter
      profile={profile}
      organizationId={organizationId}
      organizationName={organization?.name}
    />
  );
}
