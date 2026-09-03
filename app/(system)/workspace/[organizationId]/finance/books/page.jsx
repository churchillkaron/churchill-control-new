"use client";

import { useParams } from "next/navigation";
import { useBusinessContext } from "@/app/providers/BusinessContextProvider";
import FinanceBooksDesk from "@/components/workspace/finance/FinanceBooksDesk";

export const dynamic = "force-dynamic";

export default function FinanceBooksPage() {
  const params = useParams();
  const businessContext = useBusinessContext() || {};
  const organizationId = params?.organizationId || businessContext.organization_id || businessContext.organization?.id || null;
  return <FinanceBooksDesk organizationId={organizationId} />;
}
