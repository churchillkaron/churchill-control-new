"use client";

import { useParams } from "next/navigation";
import { useBusinessContext } from "@/app/providers/BusinessContextProvider";
import FinanceClosePackageFreshnessRail from "@/components/workspace/finance/FinanceClosePackageFreshnessRail";
import FinanceReportingDesk from "@/components/workspace/finance/FinanceReportingDesk";
import FinanceAuditorPackagePanel from "@/components/workspace/finance/FinanceAuditorPackagePanel";

export const dynamic = "force-dynamic";

export default function FinanceReportsPage() {
  const params = useParams();
  const businessContext = useBusinessContext() || {};
  const organizationId = params?.organizationId || businessContext.organization_id || businessContext.organization?.id || null;
  return (
    <div className="space-y-4">
      <FinanceClosePackageFreshnessRail organizationId={organizationId} compact />
      <FinanceAuditorPackagePanel organizationId={organizationId} />
      <FinanceReportingDesk organizationId={organizationId} />
    </div>
  );
}
