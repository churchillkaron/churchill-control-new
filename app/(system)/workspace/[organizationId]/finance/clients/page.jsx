"use client";

import { useParams } from "next/navigation";
import { useBusinessContext } from "@/app/providers/BusinessContextProvider";
import FinancePracticeControlTower from "@/components/workspace/finance/FinancePracticeControlTower";

export const dynamic = "force-dynamic";

export default function FinanceClientsPage() {
  const params = useParams();
  const businessContext = useBusinessContext() || {};
  const organizationId = params?.organizationId || businessContext.organization_id || businessContext.organization?.id || null;

  return (
    <div className="mx-auto max-w-[1720px]">
      <FinancePracticeControlTower organizationId={organizationId} initialView="clients" />
    </div>
  );
}
