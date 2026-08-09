"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/shared/supabase/client";

const CHURCHILL_ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";

function hostnameOrganizationId() {
  if (typeof window === "undefined") return null;

  const hostname = String(window.location.hostname || "").trim().toLowerCase();

  if (
    hostname === "churchillkaron.com" ||
    hostname.endsWith(".churchillkaron.com")
  ) {
    return CHURCHILL_ORGANIZATION_ID;
  }

  return null;
}

export default function LoginCallback() {
  const router = useRouter();

  useEffect(() => {
    const run = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          router.push("/");
          return;
        }

        const requestedOrganizationId = hostnameOrganizationId();
        const bootstrapUrl = requestedOrganizationId
          ? `/api/session/bootstrap?organizationId=${encodeURIComponent(requestedOrganizationId)}`
          : "/api/session/bootstrap";

        const res = await fetch(bootstrapUrl, {
          method: "GET",
          cache: "no-store",
        });

        const data = await res.json();

        if (!data?.success) {
          if (
            data?.reason === "ORGANIZATION_SELECTION_REQUIRED" ||
            (Array.isArray(data?.availableOrganizationIds) &&
              data.availableOrganizationIds.length > 1)
          ) {
            router.push("/workspace");
            return;
          }

          router.push("/onboarding");
          return;
        }

        const activeOrganizationId = data.active_organization_id || data.organization_id;

        if (activeOrganizationId) {
          const selectionResponse = await fetch("/api/session/organization", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              organizationId: activeOrganizationId,
            }),
          });

          if (!selectionResponse.ok) {
            router.push("/workspace");
            return;
          }

          router.push(`/workspace/${activeOrganizationId}`);
          return;
        }

        router.push("/workspace");
      } catch (err) {
        console.error(err);
        router.push("/");
      }
    };

    run();
  }, [router]);

  return (
    <div className="h-screen flex items-center justify-center bg-black text-white">
      Loading system...
    </div>
  );
}
