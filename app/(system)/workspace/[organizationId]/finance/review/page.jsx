"use client";

import { useParams } from "next/navigation";

import { useBusinessContext } from "@/app/providers/BusinessContextProvider";
import FinanceReviewerWorkspace from "@/components/workspace/finance/FinanceReviewerWorkspace";

export const dynamic = "force-dynamic";

export default function FinanceReviewerPage() {
  const params = useParams();
  const businessContext = useBusinessContext() || {};
  const organizationId =
    params?.organizationId ||
    businessContext.organization_id ||
    businessContext.organization?.id ||
    null;

  return <FinanceReviewerWorkspace organizationId={organizationId} />;
}
