"use client";

import {
  useMemo,
} from "react";

import {
  useParams,
} from "next/navigation";

import {
  useWorkspaceRuntime,
} from "@/app/providers/WorkspaceRuntimeProvider";

export function useOrganizationRuntime() {

  const params =
    useParams();

  const {
    runtime,
    loading,
    reloadRuntime,
  } = useWorkspaceRuntime();

  const organizationRuntime =
    useMemo(() => {

      return (
        runtime?.organizationRuntimes || []
      ).find(
        item =>
          item?.activeOrganization?.id ===
          params?.organizationId
      );

    }, [
      runtime,
      params?.organizationId,
    ]);

  console.log(
    "ORG PARAM:",
    params?.organizationId
  );

  console.log(
    "AVAILABLE RUNTIMES:",
    (runtime?.organizationRuntimes || []).map(
      x => ({
        id: x?.activeOrganization?.id,
        name: x?.activeOrganization?.name,
      })
    )
  );

  console.log(
    "FOUND RUNTIME:",
    organizationRuntime?.activeOrganization?.name
  );

  return {

    loading,

    reloadRuntime,

    runtime:
      organizationRuntime || null,

    organization:
      organizationRuntime?.activeOrganization || null,

    modules:
      organizationRuntime?.modules || [],

    dashboards:
      organizationRuntime?.dashboards || [],

    industries:
      organizationRuntime?.industries || [],

    accountingProfile:
      organizationRuntime?.accountingProfile || null,

  };

}
