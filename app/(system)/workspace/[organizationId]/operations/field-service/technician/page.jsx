"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

import PestControlTechnicianCockpit from "@/components/workspace/operations/pest-control/PestControlTechnicianCockpit";
import PestControlTreatmentReadinessBanner from "@/components/workspace/operations/pest-control/PestControlTreatmentReadinessBanner";
import { useOrganizationRuntime } from "@/lib/hooks/useOrganizationRuntime";
import { organizationHasIndustrySolution } from "@/lib/platform/solutions/OrganizationIndustrySolutionResolver";

export default function PestControlTechnicianPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { organization, loading } = useOrganizationRuntime();
  const organizationId = params?.organizationId || organization?.id || "";
  const occurrenceId = searchParams?.get("occurrenceId") || "";
  const workOrderId = searchParams?.get("workOrderId") || "";

  const isPestControl = useMemo(() => organizationHasIndustrySolution({
    organization,
    organizationId,
    solutionId: "pest-control",
  }), [organization, organizationId]);

  useEffect(() => {
    if (loading || !organization || isPestControl) return;
    router.replace(`/workspace/${encodeURIComponent(organization.id || organizationId)}/operations/work-orders`);
  }, [isPestControl, loading, organization, organizationId, router]);

  if (loading) {
    return <div className="min-h-[420px] bg-[#F7F6F3] p-8 text-sm text-[#77736C]">Preparing technician execution...</div>;
  }

  if (!organization || !isPestControl) {
    return <div className="min-h-[420px] bg-[#F7F6F3] p-8 text-sm text-[#77736C]">Opening the installed Operations workspace...</div>;
  }

  return (
    <>
      <PestControlTreatmentReadinessBanner organizationId={organizationId} occurrenceId={occurrenceId} workOrderId={workOrderId} />
      <PestControlTechnicianCockpit organizationId={organizationId} />
    </>
  );
}
