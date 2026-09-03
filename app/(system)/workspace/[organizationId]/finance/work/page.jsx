"use client";

import { useParams } from "next/navigation";

import { useBusinessContext } from "@/app/providers/BusinessContextProvider";
import FinanceDailyWorkDesk from "@/components/workspace/finance/FinanceDailyWorkDesk";

export const dynamic = "force-dynamic";

export default function FinanceWorkPage() {
  const params = useParams();
  const businessContext = useBusinessContext() || {};
  const organizationId = params?.organizationId || businessContext.organization_id || businessContext.organization?.id || null;

  return (
    <div className="mx-auto max-w-[1720px]">
      <FinanceDailyWorkDesk organizationId={organizationId} />
    </div>
  );
}
