"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useBusinessContext } from "@/app/providers/BusinessContextProvider";
import FinanceAreaHub from "@/components/workspace/finance/FinanceAreaHub";

export const dynamic = "force-dynamic";

export default function FinanceConfigurePage() {
  const params = useParams();
  const businessContext = useBusinessContext() || {};
  const organizationId = params?.organizationId || businessContext.organization_id || businessContext.organization?.id || null;

  return (
    <div className="space-y-3">
      <FinanceAreaHub organizationId={organizationId} area="configure" />
      {organizationId ? (
        <div className="mx-auto max-w-[1720px] px-1">
          <Link href={`/workspace/${organizationId}/finance/work-programs`} className="inline-flex h-9 items-center rounded-xl border border-[#A37849]/20 bg-white px-3 text-[9px] font-semibold text-[#76583A]">
            Open work-program template studio
          </Link>
        </div>
      ) : null}
    </div>
  );
}
