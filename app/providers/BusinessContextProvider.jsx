"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

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
  entity: null,
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

export function BusinessContextProvider({ children }) {
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
            organization: null,
            organizations: [],
            organization_id: null,
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

        setState({
          ready: true,
          loading: false,
          user,
          staff: data.staff || null,
          organization: data.organization || null,
          organizations: Array.isArray(data.organizations)
            ? data.organizations
            : data.organization
              ? [data.organization]
              : [],
          organization_id: organizationId,
          entity: data.entity || null,
          entity_id: data.entity_id || data.active_entity_id || null,
          period: data.period || null,
          period_id: data.period_id || data.active_period_id || null,
          country:
            data.country ||
            data.organization?.country ||
            data.entity?.country ||
            null,
          currency:
            data.currency ||
            data.organization?.default_currency ||
            data.entity?.currency ||
            null,
          modules: Array.isArray(data.modules) ? data.modules : [],
          permissions: Array.isArray(data.permissions) ? data.permissions : [],
          role: data.role || data.staff?.role || null,
          error: null,
        });
      } catch (error) {
        console.error("Business context load failed", error);

        if (!mounted) return;

        setState((previous) => ({
          ...previous,
          ready: true,
          loading: false,
          organizations: [],
          modules: [],
          error: error.message,
        }));
      }
    }

    loadBusinessContext();

    return () => {
      mounted = false;
    };
  }, []);

  const value = useMemo(() => state, [state]);

  return <BusinessContext.Provider value={value}>{children}</BusinessContext.Provider>;
}

export function useBusinessContext() {
  return useContext(BusinessContext);
}
