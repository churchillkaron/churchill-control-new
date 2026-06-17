"use client";

import { createContext, useContext, useState } from "react";
import { setOSMode, getOSMode } from "@/lib/platform/shell/osShell";

const OSContext = createContext(null);

export function OSProvider({ children }) {
  const [mode, setMode] = useState(getOSMode());

  function switchMode(newMode) {
    setOSMode(newMode);
    setMode(newMode);
  }

  return (
    <OSContext.Provider value={{ mode, switchMode }}>
      {children}
    </OSContext.Provider>
  );
}

export function useOS() {
  return useContext(OSContext);
}
