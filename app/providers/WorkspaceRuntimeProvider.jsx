"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

const WorkspaceRuntimeContext = createContext(null);

export function WorkspaceRuntimeProvider({ children }) {
  const businessContext = useBusinessContext();

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
        if (!businessContext?.ready) {
          return;
        }

        if (!businessContext?.staff?.email) {
          setState(prev => ({
            ...prev,
            ready: true,
            loading: false,
            error:
              businessContext === null
                ? null
                : "Missing business context staff email",
          }));
          return;
        }

        const organizationId =
          businessContext?.organization_id ||
          businessContext?.organization?.id ||
          businessContext?.staff?.active_organization_id ||
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
          `/api/workspace?organizationId=${organizationId}&userEmail=${encodeURIComponent(businessContext.staff.email)}`,
          {
            method: "GET",
            credentials: "include",
          }
        );

        const runtime = await res.json();

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
            businessContext.organization ||
            null,
          activeOrganization:
            businessContext.organization ||
            null,
          modules: runtime.modules || [],
          navigation: runtime.navigation || {
            domains: [],
            solutions: [],
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
  }, [businessContext]);

  return (
    <WorkspaceRuntimeContext.Provider value={state}>
      {children}
    </WorkspaceRuntimeContext.Provider>
  );
}

export function useWorkspaceRuntime() {
  return useContext(WorkspaceRuntimeContext);
}
