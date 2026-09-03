"use client";

import { useParams } from "next/navigation";

import FinanceAccountantOverview from "@/components/workspace/finance/FinanceAccountantOverview";
import FinancePracticePortfolioFocus from "@/components/workspace/finance/FinancePracticePortfolioFocus";
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

  return (
    <>
      <FinancePracticePortfolioFocus organizationId={organizationId} />
      <FinanceAccountantOverview organizationId={organizationId} />
    </>
  );
}
