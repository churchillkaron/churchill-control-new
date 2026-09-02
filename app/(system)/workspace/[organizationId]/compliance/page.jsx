"use client";

import { useParams } from "next/navigation";

import ComplianceCommandCenter from "@/components/workspace/compliance/ComplianceCommandCenter";
import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

export const dynamic = "force-dynamic";

export default function CompliancePage() {
  const params = useParams();
  const businessContext = useBusinessContext() || {};
  const organizationId =
    params?.organizationId ||
    businessContext.organization_id ||
    businessContext.organization?.id ||
    null;

  return <ComplianceCommandCenter organizationId={organizationId} />;
}
