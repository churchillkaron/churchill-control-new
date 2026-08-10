"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/shared/supabase/client";
import { resolvePlatformHostContext } from "@/lib/platform/context/resolvePlatformHostContext";

const WORKSPACE_ROLES = new Set([
  "OWNER",
  "ORGANIZATION_OWNER",
  "ORG_OWNER",
  "PLATFORM_OWNER",
  "SUPER_ADMIN",
  "ADMIN",
  "MANAGER",
  "ACCOUNTING",
  "FINANCE",
  "HR",
  "HUMAN_RESOURCES",
]);

function browserOrganizationId() {
  if (typeof window === "undefined") return null;

  return resolvePlatformHostContext(window.location.hostname).organizationId;
}

function normalizeRole(value) {
  return String(value || "").trim().toUpperCase();
}

function postLoginDestination(data, organizationId) {
  const role = normalizeRole(data?.role || data?.staff?.role);

  if (!WORKSPACE_ROLES.has(role)) {
    return "/staff";
  }

  return `/workspace/${organizationId}`;
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

        const requestedOrganizationId = browserOrganizationId();
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

        const activeOrganizationId =
          data.active_organization_id || data.organization_id;

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

          router.push(postLoginDestination(data, activeOrganizationId));
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
    <div className="flex h-screen items-center justify-center bg-black text-white">
      Loading workspace...
    </div>
  );
}
