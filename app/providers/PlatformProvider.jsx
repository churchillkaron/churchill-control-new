"use client";

import {
  createContext,
  useContext,
} from "react";

const PlatformContext =
  createContext({
    tenant: null,
    user: null,
    runtime: null,
  });

export function PlatformProvider({
  children,
}) {

  const platform = {

    tenant: null,

    user: null,

    runtime: null,

  };

  return (

    <PlatformContext.Provider
      value={platform}
    >

      {children}

    </PlatformContext.Provider>

  );

}

export function usePlatform() {

  return useContext(
    PlatformContext
  );

}
