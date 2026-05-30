"use client";

import {
  createContext,
  useContext,
} from "react";

import {
  useActiveOrganization,
} from "@/lib/hooks/useActiveOrganization";

const TenantContext =
  createContext(null);

export function TenantProvider({
  children,
}) {

  const {
    tenantId,
    activeOrganization,
  } = useActiveOrganization();

  const tenant =
    tenantId
      ? {
          id: tenantId,

          name:
            activeOrganization?.name ||
            "Active Tenant",
        }
      : null;

  return (

    <TenantContext.Provider
      value={tenant}
    >
      {children}
    </TenantContext.Provider>

  );

}

export function useTenant() {

  return useContext(
    TenantContext
  );

}
