"use client";

import { useParams } from "next/navigation";
import { useBusinessContext } from "@/app/providers/BusinessContextProvider";
import FinanceCloseCockpit from "@/components/workspace/finance/FinanceCloseCockpit";
import FinanceClosePackageFreshnessRail from "@/components/workspace/finance/FinanceClosePackageFreshnessRail";

export const dynamic = "force-dynamic";

export default function FinanceClosePage() {
  const params = useParams();
  const businessContext = useBusinessContext() || {};
  const organizationId = params?.organizationId || businessContext.organization_id || businessContext.organization?.id || null;

  return (
    <div className="space-y-4">
      <FinanceClosePackageFreshnessRail organizationId={organizationId} />
      <FinanceCloseCockpit organizationId={organizationId} />
    </div>
  );
}
