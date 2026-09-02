"use client";

export const dynamic = "force-dynamic";

import { notFound, useParams } from "next/navigation";

import ERPEngine from "@/lib/platform/erp-engine/ERPRuntime";
import { getWorkspaceItemByRoute } from "@/lib/platform/registry/erpRegistry";

export default function SupplyChainDynamicCapabilityPage() {
  const params = useParams();
  const routeParts = Array.isArray(params?.supplyChainRoute)
    ? params.supplyChainRoute
    : [];
  const route = `/${routeParts.join("/")}`;
  const capability = getWorkspaceItemByRoute(route);

  if (!capability) {
    notFound();
  }

  return (
    <ERPEngine
      renderer={capability?.runtime?.renderer || capability?.renderer}
      capability={capability}
      organizationId={params.organizationId}
    />
  );
}
