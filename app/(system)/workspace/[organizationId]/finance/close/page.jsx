"use client";

import { useParams } from "next/navigation";
import { useBusinessContext } from "@/app/providers/BusinessContextProvider";
import FinanceCloseCockpit from "@/components/workspace/finance/FinanceCloseCockpit";

export const dynamic = "force-dynamic";

export default function FinanceClosePage() {
  const params = useParams();
  const businessContext = useBusinessContext() || {};
  const organizationId = params?.organizationId || businessContext.organization_id || businessContext.organization?.id || null;

  return <FinanceCloseCockpit organizationId={organizationId} />;
}
