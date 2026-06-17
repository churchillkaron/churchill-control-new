"use client";

import { createContext, useContext, useMemo } from "react";
import { useWorkspaceRuntime } from "@/app/providers/WorkspaceRuntimeProvider";

const OrganizationContext = createContext(null);

export function OrganizationProvider({ children }) {
  const runtime = useWorkspaceRuntime();

  const value = useMemo(
    () => ({
      organization:
        runtime?.activeOrganization ||
        runtime?.organization ||
        null,

      organizations:
        runtime?.organizations || [],

      setOrganization: () => {
        console.warn(
          "setOrganization() is deprecated. Active organization is controlled by WorkspaceRuntime."
        );
      },
    }),
    [runtime]
  );

  return (
    <OrganizationContext.Provider value={value}>
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganization() {
  return useContext(OrganizationContext);
}
