"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

const WorkspaceRuntimeContext =
  createContext(null);

export function WorkspaceRuntimeProvider({
  children,
}) {

  const [
    runtime,
    setRuntime,
  ] = useState(null);

  const [
    loading,
    setLoading,
  ] = useState(true);

  async function loadWorkspaceRuntime() {

    try {

      setLoading(true);

      const response =
        await fetch(
          `/api/workspace`
        );

      if (!response.ok) {

        throw new Error(
          `Workspace runtime failed: ${response.status}`
        );

      }

      const data =
        await response.json();

      console.log(
        "WORKSPACE RUNTIME:",
        data?.activeOrganization?.name,
        data?.activeOrganization?.tenant_id
      );

      setRuntime(data);

    } catch (error) {

      console.error(
        "workspace runtime error",
        error
      );

    } finally {

      setLoading(false);

    }

  }

  useEffect(() => {

    loadWorkspaceRuntime();

  }, []);

  const value =
    useMemo(
      () => ({

        runtime,

        loading,

        reloadRuntime:
          loadWorkspaceRuntime,

      }),
      [runtime, loading]
    );

  return (

    <WorkspaceRuntimeContext.Provider
      value={value}
    >

      {children}

    </WorkspaceRuntimeContext.Provider>

  );

}

export function useWorkspaceRuntime() {

  return useContext(
    WorkspaceRuntimeContext
  );

}
