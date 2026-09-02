"use client";

import { useParams } from "next/navigation";

import FinanceCommandCenter from "@/components/workspace/finance/FinanceCommandCenter";
import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

export const dynamic = "force-dynamic";

export default function FinancePage() {
  const params = useParams();
  const businessContext = useBusinessContext() || {};
  const organizationId =
    params?.organizationId ||
    businessContext.organization_id ||
    businessContext.organization?.id ||
    null;

  return <FinanceCommandCenter organizationId={organizationId} />;
}
