"use client";

export const dynamic = "force-dynamic";

import ERPEngine from "@/lib/platform/erp-engine/ERPRuntime";
import { getWorkspaceItemByRoute } from "@/lib/platform/registry/erpRegistry";
import { serializeCapability } from "@/lib/platform/registry/serializeCapability";

export default function LoyaltyPage({ params }) {
  const capability = serializeCapability(
    getWorkspaceItemByRoute("/commercial/customers/loyalty")
  );

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
