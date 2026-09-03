"use client";

import { useParams } from "next/navigation";

import FinanceAccountantOverview from "@/components/workspace/finance/FinanceAccountantOverview";
import FinanceAccountHealthPanel from "@/components/workspace/finance/FinanceAccountHealthPanel";
import FinanceContinuousCloseRail from "@/components/workspace/finance/FinanceContinuousCloseRail";
import FinanceCorrectionWorkspace from "@/components/workspace/finance/FinanceCorrectionWorkspace";
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
      <FinanceContinuousCloseRail organizationId={organizationId} />
      <FinanceAccountHealthPanel organizationId={organizationId} />
      <FinanceCorrectionWorkspace organizationId={organizationId} />
      <FinanceAccountantOverview organizationId={organizationId} />
    </>
  );
}
