"use client";

export const dynamic = "force-dynamic";

import ERPEngine from "@/lib/platform/erp-engine/ERPRuntime";
import {
  getWorkspaceItemByRoute,
} from "@/lib/platform/registry/erpRegistry";

import {
  serializeCapability,
} from "@/lib/platform/registry/serializeCapability";


export default function CustomersPage({
  params,
}) {

  const capability =
    serializeCapability(
      getWorkspaceItemByRoute(
        "/commercial/customers"
      )
    );


  if (!capability) {
    return null;
  }


  return (
    <ERPEngine
      workspaceId="customer_management"
      capabilityId="customers"
      capability={capability}
      context={{
        route:{
          pathname:
            "/commercial/customers"
        },
        organizationId:
          params.organizationId
      }}
    />
  );
}
