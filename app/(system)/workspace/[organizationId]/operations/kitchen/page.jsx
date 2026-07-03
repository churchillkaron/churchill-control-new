"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useBusinessContext } from "@/app/providers/BusinessContextProvider";
import { useOrganization } from "@/app/providers/OrganizationProvider";

export default function KitchenCompatibilityPage() {
  const router = useRouter();
  const businessContext = useBusinessContext();
  const { organization } = useOrganization();

  const [error, setError] = useState(null);

  useEffect(() => {
    async function redirectToWorkCenter() {
      const organizationId =
        organization?.id ||
        businessContext?.organization ||
        businessContext?.staff?.active_organization_id;

      if (!organizationId) return;

      const res = await fetch("/api/work-centers/list", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          organizationId,
        }),
      });

      const json = await res.json();
      const first = json.data?.[0];

      if (!first?.id) {
        setError("No active work centers configured.");
        return;
      }

      router.replace(
        `/operations/work-center/${first.id}`
      );
    }

    redirectToWorkCenter();
  }, [organization?.id, tenant]);

  return (
    <main className="min-h-screen bg-[#030712] p-8 text-white">
      <div className="rounded-[32px] border border-white/10 bg-white/[0.035] p-8">
        {error || "Opening work center..."}
      </div>
    </main>
  );
}
