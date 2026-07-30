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

  const organizationId =
    organization?.id ||
    businessContext?.organization?.id ||
    businessContext?.organizationId ||
    businessContext?.staff?.active_organization_id ||
    null;

  useEffect(() => {
    async function redirectToWorkCenter() {
      if (!organizationId) return;

      try {
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

        if (!res.ok || json.success === false) {
          throw new Error(json.error || "Unable to load work centers.");
        }

        const first = json.data?.[0];

        if (!first?.id) {
          setError("No active work centers configured.");
          return;
        }

        router.replace(
          `/workspace/${organizationId}/operations/work-centres?workCenterId=${encodeURIComponent(first.id)}`
        );
      } catch (redirectError) {
        setError(redirectError.message);
      }
    }

    redirectToWorkCenter();
  }, [organizationId, router]);

  return (
    <main className="min-h-screen bg-[#030712] p-8 text-white">
      <div className="rounded-[32px] border border-white/10 bg-white/[0.035] p-8">
        {error || "Opening work center..."}
      </div>
    </main>
  );
}
