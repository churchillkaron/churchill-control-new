"use client";

import { createContext, useContext, useMemo } from "react";
import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

const OrganizationContext = createContext(null);

export function OrganizationProvider({ children }) {
  const businessContext = useBusinessContext();

  const value = useMemo(
    () => ({
      organization:
        businessContext?.organization || null,

      organizations:
        businessContext?.organizations ||
        (
          businessContext?.organization
            ? [businessContext.organization]
            : []
        ),

      setOrganization: () => {
        console.warn(
          "setOrganization() is deprecated. Active organization is controlled by BusinessContext."
        );
      },
    }),
    [businessContext]
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
