"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/shared/supabase/client";
import {
  PLATFORM_LOGIN_BRAND_SESSION_KEY,
  resolvePlatformLoginContext,
} from "@/lib/platform/context/resolvePlatformHostContext";

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
  "DEVELOPER",
  "INTEGRATOR",
  "PARTNER",
]);

function browserOrganizationId() {
  if (typeof window === "undefined") return null;

  const storedBrand = window.sessionStorage.getItem(
    PLATFORM_LOGIN_BRAND_SESSION_KEY,
  );
  return resolvePlatformLoginContext(
    window.location.hostname,
    storedBrand,
  ).organizationId;
}

function clearBrowserBrandIntent() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(PLATFORM_LOGIN_BRAND_SESSION_KEY);
}

function normalizeRole(value) {
  return String(value || "").trim().toUpperCase();
}


function requestedPortal() {
  if (typeof window === "undefined") return "business";
  const portal = new URLSearchParams(window.location.search).get("portal");
  return portal === "developer" ? "developer" : portal === "supplier" ? "supplier" : portal === "staff" ? "staff" : "business";
}


function requestedSafeNonWorkspaceDestination() {
  if (typeof window === "undefined") return null;
  const next = new URLSearchParams(window.location.search).get("next");
  if (!next || next.startsWith("//")) return null;
  if (next.startsWith("/supplier-invite/") || next.startsWith("/developer-invite/") || next.startsWith("/accounting-client-invite/")) return next;
  return null;
}

function requestedWorkspaceDestination(organizationId) {
  if (typeof window === "undefined") return null;
  const next = new URLSearchParams(window.location.search).get("next");
  if (!next || !next.startsWith(`/workspace/${organizationId}`) || next.startsWith("//")) {
    return null;
  }
  return next;
}

function postLoginDestination(data, organizationId) {
  const role = normalizeRole(data?.role || data?.staff?.role);

  if (!WORKSPACE_ROLES.has(role)) {
    return "/staff";
  }

  if (requestedPortal() === "developer") {
    return `/workspace/${organizationId}/developers`;
  }
  if (requestedPortal() === "staff") {
    return "/staff";
  }

  return requestedWorkspaceDestination(organizationId) || `/workspace/${organizationId}`;
}

export default function LoginCallback() {
  const router = useRouter();

  useEffect(() => {
    const run = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.access_token || !session?.refresh_token) {
          clearBrowserBrandIntent();
          router.push("/login");
          return;
        }

        const syncResponse = await fetch("/api/auth/session/sync", {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            access_token: session.access_token,
            refresh_token: session.refresh_token,
          }),
        });

        if (!syncResponse.ok) {
          clearBrowserBrandIntent();
          router.push("/login");
          return;
        }

        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          clearBrowserBrandIntent();
          router.push("/login");
          return;
        }

        const nonWorkspaceDestination = requestedSafeNonWorkspaceDestination();
        if (nonWorkspaceDestination) {
          clearBrowserBrandIntent();
          router.push(nonWorkspaceDestination);
          return;
        }

        if (requestedPortal() === "supplier") {
          clearBrowserBrandIntent();
          router.push("/supplier-portal");
          return;
        }

        if (requestedPortal() === "developer") {
          const externalResponse = await fetch("/api/developers/access/organizations", { cache: "no-store" }).catch(() => null);
          const externalData = externalResponse?.ok ? await externalResponse.json().catch(() => null) : null;
          const externalOrganizations = Array.isArray(externalData?.organizations) ? externalData.organizations : [];
          if (externalOrganizations.length === 1) {
            clearBrowserBrandIntent();
            router.push(`/workspace/${externalOrganizations[0].organization_id}/developers`);
            return;
          }
          if (externalOrganizations.length > 1) {
            clearBrowserBrandIntent();
            router.push("/developer-access");
            return;
          }
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
          clearBrowserBrandIntent();
          if (
            data?.reason === "ORGANIZATION_SELECTION_REQUIRED" ||
            (Array.isArray(data?.availableOrganizationIds) &&
              data.availableOrganizationIds.length > 1)
          ) {
            router.push(requestedPortal() === "developer" ? "/workspace?portal=developer" : requestedPortal() === "staff" ? "/staff" : "/workspace");
            return;
          }

          if (requestedPortal() === "staff") {
            router.push("/staff-portal?access=required");
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
            clearBrowserBrandIntent();
            router.push(requestedPortal() === "developer" ? "/workspace?portal=developer" : requestedPortal() === "staff" ? "/staff" : "/workspace");
            return;
          }

          clearBrowserBrandIntent();
          router.push(postLoginDestination(data, activeOrganizationId));
          return;
        }

        clearBrowserBrandIntent();
        router.push(requestedPortal() === "developer" ? "/workspace?portal=developer" : requestedPortal() === "staff" ? "/staff" : "/workspace");
      } catch (err) {
        console.error(err);
        clearBrowserBrandIntent();
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