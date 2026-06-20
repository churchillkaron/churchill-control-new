"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTenant } from "@/app/providers/TenantProvider";
import { useOrganization } from "@/app/providers/OrganizationProvider";

export default function BarCompatibilityPage() {
  const router = useRouter();
  const tenant = useTenant();
  const { organization } = useOrganization();

  const [message, setMessage] = useState(
    "Opening work center..."
  );

  useEffect(() => {
    async function openWorkCenter() {
      const organizationId =
        organization?.id ||
        tenant?.activeOrganization ||
        tenant?.staff?.active_organization_id;

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
      const centers = json.data || [];

      const bar =
        centers.find(
          center =>
            String(center.code || "")
              .toUpperCase() === "BAR"
        ) ||
        centers.find(
          center =>
            String(center.name || "")
              .toUpperCase() === "BAR"
        );

      if (!bar?.id) {
        setMessage(
          "No Bar work center configured. Create a Bar work center first."
        );
        return;
      }

      router.replace(
        `/operations/work-center/${bar.id}`
      );
    }

    openWorkCenter();
  }, [organization?.id, tenant]);

  return (
    <main className="min-h-screen bg-[#030712] p-8 text-white">
      <div className="rounded-[32px] border border-white/10 bg-white/[0.035] p-8">
        {message}
      </div>
    </main>
  );
}
