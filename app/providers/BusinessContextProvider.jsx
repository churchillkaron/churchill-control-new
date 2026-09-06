"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePathname } from "next/navigation";

import { supabase } from "@/lib/shared/supabase/client";

const BusinessContext = createContext(null);

const EMPTY_STATE = {
  ready: false,
  loading: true,
  user: null,
  staff: null,
  organization: null,
  organizations: [],
  organization_id: null,
  is_platform_operator_workspace: false,
  entity: null,
  entities: [],
  entity_id: null,
  period: null,
  period_id: null,
  country: null,
  currency: null,
  modules: [],
  permissions: [],
  role: null,
  error: null,
};

function text(value) {
  return String(value ?? "").trim();
}

function workspaceOrganizationId(pathname) {
  const match = String(pathname || "").match(/^\/workspace\/([^/]+)/);
  const candidate = text(match?.[1]);
  if (!candidate || candidate.toLowerCase() === "platform") return null;

  try {
    return decodeURIComponent(candidate);
  } catch {
    return candidate;
  }
}

function emailLocalPart(value) {
  const email = text(value);
  const local = email.includes("@") ? email.split("@")[0] : "";
  if (!local) return "";

  return local
    .replace(/[._-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function authenticatedPersonName(user, staff) {
  return (
    text(staff?.name) ||
    text(staff?.display_name) ||
    text(staff?.full_name) ||
    text(user?.user_metadata?.full_name) ||
    text(user?.user_metadata?.name) ||
    text(user?.user_metadata?.display_name) ||
    emailLocalPart(user?.email || staff?.email)
  );
}

function canonicalStaff(user, staff) {
  if (!staff && !user) return null;
  const source = staff && typeof staff === "object" ? staff : {};
  const name = authenticatedPersonName(user, source);

  return {
    ...source,
    ...(name ? { name, display_name: source.display_name || name } : {}),
    email: source.email || user?.email || null,
  };
}

export function BusinessContextProvider({ children }) {
  const pathname = usePathname();
  const routeOrganizationId = useMemo(
    () => workspaceOrganizationId(pathname),
    [pathname],
  );
  const [state, setState] = useState(EMPTY_STATE);

  useEffect(() => {
    let mounted = true;

    async function loadBusinessContext() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!mounted) return;

        if (!user) {
          setState({
            ...EMPTY_STATE,
            ready: true,
            loading: false,
          });
          return;
        }

        setState((previous) => ({
          ...previous,
          ready: false,
          loading: true,
          error: null,
        }));

        // The organization encoded in /workspace/:organizationId is the
        // authoritative navigation context. Re-select it server-side before
        // bootstrap so direct links and client-side organization switches cannot
        // retain a previous organization's entity, period, branding or modules.
        if (routeOrganizationId) {
          const selectionResponse = await fetch("/api/session/organization", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ organizationId: routeOrganizationId }),
            cache: "no-store",
            credentials: "same-origin",
          });
          const selectionData = await selectionResponse.json().catch(() => ({}));

          if (!selectionResponse.ok || !selectionData?.success) {
            throw new Error(
              selectionData?.error || "Unable to select workspace organization",
            );
          }
        }

        const response = await fetch("/api/session/bootstrap", {
          method: "GET",
          cache: "no-store",
          credentials: "same-origin",
        });
        const data = await response.json();

        if (!mounted) return;

        if (!data?.success) {
          setState((previous) => ({
            ...previous,
            ready: true,
            loading: false,
            user,
            staff: canonicalStaff(user, null),
            organization: null,
            organizations: [],
            organization_id: null,
            is_platform_operator_workspace: false,
            entity: null,
            entity_id: null,
            period: null,
            period_id: null,
            entities: [],
            modules: [],
            permissions: [],
            error: data?.error || data?.reason || "Business context bootstrap failed",
          }));
          return;
        }

        const organizationId =
          data.active_organization_id ||
          data.organization_id ||
          data.staff?.active_organization_id ||
          null;
        const staff = canonicalStaff(user, data.staff || null);

        if (routeOrganizationId && organizationId !== routeOrganizationId) {
          throw new Error("Workspace organization did not synchronize correctly");
        }

        setState({
          ready: true,
          loading: false,
          user,
          staff,
          organization: data.organization || null,
          organizations: Array.isArray(data.organizations)
            ? data.organizations
            : data.organization
              ? [data.organization]
              : [],
          organization_id: organizationId,
          is_platform_operator_workspace:
            data.is_platform_operator_workspace === true,
          entity: data.entity || null,
          entities: Array.isArray(data.entities)
            ? data.entities
            : data.entity
              ? [data.entity]
              : [],
          entity_id: data.entity_id || data.active_entity_id || null,
          period: data.period || null,
          period_id: data.period_id || data.active_period_id || null,
          country:
            data.country ||
            data.entity?.country ||
            data.organization?.country ||
            null,
          currency:
            data.currency ||
            data.entity?.currency ||
            data.organization?.default_currency ||
            null,
          modules: Array.isArray(data.modules) ? data.modules : [],
          permissions: Array.isArray(data.permissions) ? data.permissions : [],
          role: data.role || staff?.role || null,
          error: null,
        });
      } catch (error) {
        console.error("Business context load failed", error);

        if (!mounted) return;

        setState((previous) => ({
          ...previous,
          ready: true,
          loading: false,
          organization: null,
          organization_id: null,
          entity: null,
          entity_id: null,
          period: null,
          period_id: null,
          organizations: [],
          entities: [],
          modules: [],
          permissions: [],
          is_platform_operator_workspace: false,
          error: error.message,
        }));
      }
    }

    loadBusinessContext();

    return () => {
      mounted = false;
    };
  }, [routeOrganizationId]);

  const value = useMemo(() => state, [state]);

  return <BusinessContext.Provider value={value}>{children}</BusinessContext.Provider>;
}

export function useBusinessContext() {
  return useContext(BusinessContext);
}
