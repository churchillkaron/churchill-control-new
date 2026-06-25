"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/shared/supabase/client";
import { useTenant } from "@/app/providers/TenantProvider";

const WorkspaceRuntimeContext = createContext(null);

export function WorkspaceRuntimeProvider({ children }) {
  const tenant = useTenant();

  const [state, setState] = useState({
    ready: false,
    loading: true,
    runtime: null,
    access: null,
    organizations: [],
    organizationTree: [],
    organization: null,
    activeOrganization: null,
    modules: [],
    navigation: [],
    resolvedRuntime: null,
    error: null,
  });

  useEffect(() => {
    async function init() {
      try {
        if (!tenant?.staff?.email) {
          setState(prev => ({
            ...prev,
            ready: true,
            loading: false,
            error: tenant === null ? null : "Missing tenant staff email",
          }));
          return;
        }

        const organizationId =
          tenant.activeOrganization ||
          tenant.staff?.active_organization_id ||
          null;

        if (!organizationId) {
          setState(prev => ({
            ...prev,
            ready: true,
            loading: false,
            error: "Missing active organization",
          }));
          return;
        }

        const res = await fetch(
          `/api/workspace?organizationId=${organizationId}&userEmail=${encodeURIComponent(tenant.staff.email)}`,
          {
            method: "GET",
            credentials: "include",
          }
        );

        const runtime = await res.json();

        console.log(
          "RUNTIME MODULES",
          (runtime.modules || []).map(
            m => m.id || m.module_id
          )
        );

        if (!runtime?.success) {
          setState(prev => ({
            ...prev,
            ready: true,
            loading: false,
            runtime,
            error: runtime?.error || "Workspace runtime failed",
          }));
          return;
        }

        setState({
          ready: true,
          loading: false,
          runtime,
          access: runtime.access || null,
          organizations: runtime.organizations || [],
          organizationTree: runtime.organizationTree || [],
          organization:
            runtime.activeOrganization || null,
          activeOrganization:
            runtime.activeOrganization || null,
          modules: runtime.modules || [],
          navigation: runtime.navigation || {
            executive: [],
            tree: [],
          },
          resolvedRuntime: runtime.resolvedRuntime || null,
          error: null,
        });

      } catch (error) {
        console.error("Workspace runtime load failed", error);

        setState(prev => ({
          ...prev,
          ready: true,
          loading: false,
          error: error.message,
        }));
      }
    }

    init();
  }, [tenant]);

  return (
    <WorkspaceRuntimeContext.Provider value={state}>
      {children}
    </WorkspaceRuntimeContext.Provider>
  );
}

export function useWorkspaceRuntime() {
  return useContext(WorkspaceRuntimeContext);
}
