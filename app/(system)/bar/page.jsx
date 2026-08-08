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
    <main className="min-h-screen bg-[#030712] p-8 text-white">
      <div className="rounded-[32px] border border-white/10 bg-white/[0.035] p-8">
        Opening Bar Display...
      </div>
    </main>
  );
}
