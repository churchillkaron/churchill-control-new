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

export function BusinessContextProvider({ children }) {
  const [state, setState] = useState({
    ready: false,
    loading: true,
    user: null,
    staff: null,
    organization: null,
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
  });

  useEffect(() => {
    async function loadBusinessContext() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          setState((previous) => ({
            ...previous,
            ready: true,
            loading: false,
            user: null,
            staff: null,
            organization: null,
            organization_id: null,
            entity: null,
            entity_id: null,
            period: null,
            period_id: null,
            modules: [],
            permissions: [],
            role: null,
            error: null,
          }));
          return;
        }

        const response = await fetch("/api/session/bootstrap", {
          method: "GET",
          cache: "no-store",
        });
        const data = await response.json();

        if (!data?.success) {
          setState((previous) => ({
            ...previous,
            ready: true,
            loading: false,
            user,
            modules: [],
            error: data?.error || data?.reason || "Business context bootstrap failed",
          }));
          return;
        }

        const organizationId =
          data.active_organization_id ||
          data.organization_id ||
          data.staff?.active_organization_id ||
          null;

        const next = {
          ready: true,
          loading: false,
          user,
          staff: data.staff || null,
          organization: data.organization || null,
          organization_id: organizationId,
          entity: data.entity || null,
          entity_id: data.entity_id || data.active_entity_id || null,
          period: data.period || null,
          period_id: data.period_id || data.active_period_id || null,
          country: data.country || data.organization?.country || data.entity?.country || null,
          currency:
            data.currency || data.organization?.default_currency || data.entity?.currency || null,
          modules: Array.isArray(data.modules) ? data.modules : [],
          permissions: Array.isArray(data.permissions) ? data.permissions : [],
          role: data.role || data.staff?.role || null,
          error: null,
        };

        setState(next);
      } catch (error) {
        console.error("Business context load failed", error);

        setState((previous) => ({
          ...previous,
          ready: true,
          loading: false,
          modules: [],
          error: error.message,
        }));
      }
    }

    loadBusinessContext();
  }, []);

  const value = useMemo(() => state, [state]);

  return <BusinessContext.Provider value={value}>{children}</BusinessContext.Provider>;
}

export function useBusinessContext() {
  return useContext(BusinessContext);
}
