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

  const capability =
    getWorkspaceItemByRoute(route);

  if (!capability) {
    notFound();
  }

  return (
    <MasterDataRuntimeWorkCenter
      workspaceId="supply-chain"
      capability={capability}
      eyebrow={`Supply Chain / ${capability.groupName || "Workspace"}`}
    />
  );

}
