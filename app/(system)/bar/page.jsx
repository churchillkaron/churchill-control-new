"use client";

export const dynamic = "force-dynamic";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useBusinessContext } from "@/app/providers/BusinessContextProvider";
import { useOrganization } from "@/app/providers/OrganizationProvider";

export default function BarCompatibilityPage() {
  const router = useRouter();
  const businessContext = useBusinessContext();
  const { organization } = useOrganization();
  const organizationId =
    organization?.id ||
    businessContext?.organization_id ||
    businessContext?.organization?.id ||
    businessContext?.staff?.active_organization_id ||
    null;

  useEffect(() => {
    if (!organizationId) return;

    router.replace(
      `/workspace/${encodeURIComponent(organizationId)}/operations/bar`
    );
  }, [organizationId, router]);

  return (
    <main className="min-h-screen bg-[#F7F6F3] p-8 text-[#191919]">
      <div className="rounded-[32px] border border-black/[0.08] bg-[#FBF8F3] p-8">
        Opening Bar Display...
      </div>
    </main>
  );
}
