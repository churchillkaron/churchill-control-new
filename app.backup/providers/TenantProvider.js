"use client";

import {
  createContext,
  useContext,
} from "react";

const TenantContext =
  createContext(null);

export function TenantProvider({
  children,
}) {

  const tenant = {

    id:
      "76e2caa6-dd78-49e5-b0f5-1ff94185c2d4",

    name:
      "Churchill Phuket",
  };

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