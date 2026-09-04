"use client";

export const dynamic = "force-dynamic";

import { useParams } from "next/navigation";

import OperationsIndustryCommandCenter from "@/components/workspace/operations/OperationsIndustryCommandCenter";
import { useOrganizationRuntime } from "@/lib/hooks/useOrganizationRuntime";
import PestControlOperationsProfile from "@/lib/operations/presentation/PestControlOperationsProfile";

export default function PestControlPage() {
  const params = useParams();
  const { organization, loading } = useOrganizationRuntime();
  const organizationId = params?.organizationId || organization?.id || "";

  if (loading) {
    return (
      <div className="min-h-[420px] bg-[#F7F6F3] p-8 text-sm text-[#77736C]">
        Preparing Pest Control...
      </div>
    );
  }

  return (
    <OperationsIndustryCommandCenter
      profile={PestControlOperationsProfile}
      organizationId={organizationId}
      organizationName={organization?.name}
    />
  );
}
