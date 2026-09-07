"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { Suspense, useEffect, useMemo } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, UserRound } from "lucide-react";

import PestControlCompletionEvidenceWorkspace from "@/components/workspace/operations/pest-control/PestControlCompletionEvidenceWorkspace";
import { useOrganizationRuntime } from "@/lib/hooks/useOrganizationRuntime";
import { organizationHasIndustrySolution } from "@/lib/platform/solutions/OrganizationIndustrySolutionResolver";

function EvidencePageContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { organization, loading } = useOrganizationRuntime();
  const organizationId = params?.organizationId || organization?.id || "";
  const occurrenceId = params?.occurrenceId || "";
  const source = searchParams.get("from") || "proof-queue";

  const isPestControl = useMemo(() => organizationHasIndustrySolution({
    organization,
    organizationId,
    solutionId: "pest-control",
  }), [organization, organizationId]);

  useEffect(() => {
    if (loading || !organization || isPestControl) return;
    router.replace(`/workspace/${encodeURIComponent(organization.id || organizationId)}/operations/completion-evidence`);
  }, [isPestControl, loading, organization, organizationId, router]);

  const proofQueueHref = `/workspace/${encodeURIComponent(organizationId)}/operations/completion-evidence`;
  const technicianHref = `/workspace/${encodeURIComponent(organizationId)}/operations/field-service/technician?occurrenceId=${encodeURIComponent(occurrenceId)}`;
  const returnHref = source === "technician" ? technicianHref : proofQueueHref;
  const returnLabel = source === "technician" ? "Return to technician visit" : "Return to proof queue";

  if (loading) {
    return <div className="min-h-[420px] bg-[#F7F6F3] p-8 text-sm text-[#77736C]">Preparing governed service proof...</div>;
  }

  if (!organization || !isPestControl) {
    return <div className="min-h-[420px] bg-[#F7F6F3] p-8 text-sm text-[#77736C]">Opening the installed Operations evidence workspace...</div>;
  }

  return (
    <div className="pest-evidence-source-aware bg-[#F7F6F3]">
      <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-3 px-4 pt-4 md:px-7 lg:px-9">
        <Link href={returnHref} className="inline-flex items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-[9px] font-medium text-[#625D56]">
          <ArrowLeft size={10} /> {returnLabel}
        </Link>
        {source !== "technician" ? (
          <Link href={technicianHref} className="inline-flex items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-[9px] text-[#766B5F]">
            <UserRound size={10} /> Technician execution
          </Link>
        ) : null}
      </div>
      <PestControlCompletionEvidenceWorkspace organizationId={organizationId} occurrenceId={occurrenceId} />
      <style jsx global>{`
        .pest-evidence-source-aware a[href$="/operations/field-service/technician"] {
          display: none !important;
        }
      `}</style>
    </div>
  );
}

export default function PestControlCompletionEvidencePage() {
  return (
    <Suspense fallback={<div className="min-h-[420px] bg-[#F7F6F3] p-8 text-sm text-[#77736C]">Preparing governed service proof...</div>}>
      <EvidencePageContent />
    </Suspense>
  );
}
