"use client";

import { useParams } from "next/navigation";
import { useBusinessContext } from "@/app/providers/BusinessContextProvider";
import FinanceAreaHub from "@/components/workspace/finance/FinanceAreaHub";

export const dynamic = "force-dynamic";

export default function FinanceReportsPage() {
  const params = useParams();
  const businessContext = useBusinessContext() || {};
  const organizationId = params?.organizationId || businessContext.organization_id || businessContext.organization?.id || null;
  return <FinanceAreaHub organizationId={organizationId} area="reports" />;
}
