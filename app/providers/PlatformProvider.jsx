"use client";

import {
  createContext,
  use,
  useContext,
} from "react";

const PlatformContext =
  createContext(null);

export function PlatformProvider({

  children,

  runtimePromise,

}) {

  const runtime =
    use(
      runtimePromise
    );

  return (

    <PlatformContext.Provider
      value={runtime}
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
