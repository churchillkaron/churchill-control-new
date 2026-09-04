"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

import PestControlVisitMonitoringScanner from "@/components/workspace/operations/pest-control/PestControlVisitMonitoringScanner";
import { useOrganizationRuntime } from "@/lib/hooks/useOrganizationRuntime";
import { organizationHasIndustrySolution } from "@/lib/platform/solutions/OrganizationIndustrySolutionResolver";

export default function PestControlVisitMonitoringScannerPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { organization, loading } = useOrganizationRuntime();
  const organizationId = params?.organizationId || organization?.id || "";
  const occurrenceId = searchParams.get("occurrenceId") || "";
  const initialLookup = searchParams.get("lookup") || "";
  const isPestControl = useMemo(
    () => organizationHasIndustrySolution({ organization, organizationId, solutionId: "pest-control" }),
    [organization, organizationId],
  );

  useEffect(() => {
    if (loading || !organization || isPestControl) return;
    router.replace(`/workspace/${encodeURIComponent(organization.id || organizationId)}/operations/work-orders`);
  }, [isPestControl, loading, organization, organizationId, router]);

  if (loading) return <div className="min-h-[420px] bg-[#F7F6F3] p-8 text-sm text-[#77736C]">Preparing visit scanner...</div>;
  if (!organization || !isPestControl) return <div className="min-h-[420px] bg-[#F7F6F3] p-8 text-sm text-[#77736C]">Opening the installed Operations workspace...</div>;
  if (!occurrenceId) return <div className="min-h-[420px] bg-[#F7F6F3] p-8 text-sm text-[#8B4937]">A service occurrence is required for visit-bound monitoring.</div>;
  return <PestControlVisitMonitoringScanner organizationId={organizationId} occurrenceId={occurrenceId} initialLookup={initialLookup} />;
}
