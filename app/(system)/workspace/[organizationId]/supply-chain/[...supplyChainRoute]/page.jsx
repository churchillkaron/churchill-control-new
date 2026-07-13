"use client";

export const dynamic = "force-dynamic";

import { notFound, useParams } from "next/navigation";
import MasterDataRuntimeWorkCenter from "@/components/workspace/master-data/MasterDataRuntimeWorkCenter";
import {
  getWorkspaceItemByRoute,
} from "@/lib/platform/registry/erpRegistry";

export default function SupplyChainDynamicCapabilityPage() {

  const params = useParams();

  const routeParts =
    params.supplyChainRoute || [];

  const route =
    `/${
      routeParts.join("/")
    }`;

  console.log(
    "SUPPLY CHAIN ROUTE DEBUG",
    route
  );

  const capability =
    getWorkspaceItemByRoute(route);

  console.log(
    "SUPPLY CHAIN CAPABILITY DEBUG",
    capability
  );

  if (!capability) {
    notFound();
  }

  return (
    <MasterDataRuntimeWorkCenter
      workspaceId="supply-chain"
      organizationId={params.organizationId}
      capability={capability}
      eyebrow={`Supply Chain / ${capability.groupName || "Workspace"}`}
    />
  );

}
