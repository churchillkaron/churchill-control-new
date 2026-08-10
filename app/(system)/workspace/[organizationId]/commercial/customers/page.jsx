"use client";

export const dynamic = "force-dynamic";

import ERPEngine from "@/lib/platform/erp-engine/ERPRuntime";
import {
  getWorkspaceItemByRoute,
} from "@/lib/platform/registry/erpRegistry";
import {
  serializeCapability,
} from "@/lib/platform/registry/serializeCapability";

function liveCustomerCapability() {
  const registered = serializeCapability(
    getWorkspaceItemByRoute("/commercial/customers")
  );

  if (!registered) return null;

  return {
    ...registered,
    status: "active",
    contextScope: "organization",
    document: registered.document || "CustomerParty",
    runtime: {
      ...(registered.runtime || {}),
      renderer: "CustomerRuntimeWorkCenter",
      listApi: "/api/commercial/customers",
      detailApi: "/api/commercial/customers/:partyId/detail",
    },
    ui: {
      ...(registered.ui || {}),
      api: "/api/commercial/customers",
      rowsKey: "rows",
      detailApi: "/api/commercial/customers/:partyId/detail",
      detailKey: "row",
      search: [
        "customer_name",
        "customer_number",
        "customer_email",
        "customer_phone",
        "tax_id",
      ],
    },
    data: {
      ...(registered.data || {}),
      capability: "commercial_customers",
      identity: "party_id",
      organizationScope: true,
      financeProjection: "entity",
    },
  };
}

export default function CustomersPage({ params }) {
  const capability = liveCustomerCapability();

  if (!capability) return null;

  return (
    <ERPEngine
      workspaceId="customer_management"
      capabilityId="customers"
      capability={capability}
      organizationId={params.organizationId}
      context={{
        route: {
          pathname: "/commercial/customers",
        },
        organizationId: params.organizationId,
        organization_id: params.organizationId,
      }}
    />
  );
}
