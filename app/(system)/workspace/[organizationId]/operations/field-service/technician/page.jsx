"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

import PestControlTechnicianCockpit from "@/components/workspace/operations/pest-control/PestControlTechnicianCockpit";
import { useOrganizationRuntime } from "@/lib/hooks/useOrganizationRuntime";
import { organizationHasIndustrySolution } from "@/lib/platform/solutions/OrganizationIndustrySolutionResolver";

const TERMINAL_OCCURRENCE_STATUSES = new Set(["completed", "cancelled", "canceled", "archived"]);

export default function PestControlTechnicianPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { organization, loading } = useOrganizationRuntime();
  const organizationId = params?.organizationId || organization?.id || "";
  const occurrenceId = searchParams?.get("occurrenceId") || "";

  const isPestControl = useMemo(() => organizationHasIndustrySolution({
    organization,
    organizationId,
    solutionId: "pest-control",
  }), [organization, organizationId]);

  useEffect(() => {
    if (loading || !organization || isPestControl) return;
    router.replace(`/workspace/${encodeURIComponent(organization.id || organizationId)}/operations/work-orders`);
  }, [isPestControl, loading, organization, organizationId, router]);

  useEffect(() => {
    if (loading || !organization || !isPestControl || !organizationId || occurrenceId) return undefined;
    let cancelled = false;

    async function bindInitialVisit() {
      try {
        const response = await fetch(`/api/service-management/technician?organizationId=${encodeURIComponent(organizationId)}&limit=500`, {
          cache: "no-store",
          credentials: "include",
        });
        const json = await response.json().catch(() => ({}));
        if (cancelled || !response.ok || !json.success) return;
        const rows = Array.isArray(json.rows) ? json.rows : [];
        const selected = rows.find((row) => !TERMINAL_OCCURRENCE_STATUSES.has(String(row.occurrence_status || "").toLowerCase())) || rows[0] || null;
        if (!selected?.occurrence_id) return;
        const query = new URLSearchParams({ occurrenceId: selected.occurrence_id });
        if (selected.work_order_id) query.set("workOrderId", selected.work_order_id);
        router.replace(`/workspace/${encodeURIComponent(organizationId)}/operations/field-service/technician?${query.toString()}`, { scroll: false });
      } catch {
        // The cockpit owns visible load errors. This effect only binds URL context.
      }
    }

    bindInitialVisit();
    return () => { cancelled = true; };
  }, [isPestControl, loading, occurrenceId, organization, organizationId, router]);

  if (loading) {
    return <div className="min-h-[420px] bg-[#F7F6F3] p-8 text-sm text-[#77736C]">Preparing technician execution...</div>;
  }

  if (!organization || !isPestControl) {
    return <div className="min-h-[420px] bg-[#F7F6F3] p-8 text-sm text-[#77736C]">Opening the installed Operations workspace...</div>;
  }

  return <PestControlTechnicianCockpit organizationId={organizationId} />;
}