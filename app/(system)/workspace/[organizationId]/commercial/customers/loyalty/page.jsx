"use client";

export const dynamic = "force-dynamic";

import ERPEngine from "@/lib/platform/erp-engine/ERPRuntime";
import { getWorkspaceItemByRoute } from "@/lib/platform/registry/erpRegistry";
import { serializeCapability } from "@/lib/platform/registry/serializeCapability";

function liveLoyaltyCapability() {
  const base = serializeCapability(
    getWorkspaceItemByRoute("/commercial/customers/loyalty")
  );

  if (!base) return null;

  return {
    ...base,
    status: "active",
    type: "business-workspace",
    document: "LoyaltyAccount",
    runtime: {
      ...(base.runtime || {}),
      renderer: "MasterDataRuntimeWorkCenter",
      listApi: "/api/commercial/customers/loyalty",
    },
    ui: {
      ...(base.ui || {}),
      api: "/api/commercial/customers/loyalty",
      rowsKey: "rows",
      search: ["party_id", "tier", "status"],
    },
    data: {
      ...(base.data || {}),
      capability: "commercial_loyalty",
      identity: "party_id",
    },
  };
}

export default function LoyaltyPage({ params }) {
  const capability = liveLoyaltyCapability();

  if (!capability) return null;

  return (
    <ERPEngine
      workspaceId="commercial"
      capabilityId="loyalty"
      capability={capability}
      organizationId={params.organizationId}
    />
  );
}
