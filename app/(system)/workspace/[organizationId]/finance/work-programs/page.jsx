"use client";

import { useParams } from "next/navigation";

import { useBusinessContext } from "@/app/providers/BusinessContextProvider";
import FinanceWorkProgramTemplateStudio from "@/components/workspace/finance/FinanceWorkProgramTemplateStudio";

export const dynamic = "force-dynamic";

export default function FinanceWorkProgramLibraryPage() {
  const params = useParams();
  const businessContext = useBusinessContext() || {};
  const organizationId =
    params?.organizationId ||
    businessContext.organization_id ||
    businessContext.organization?.id ||
    null;

  return <FinanceWorkProgramTemplateStudio organizationId={organizationId} />;
}
