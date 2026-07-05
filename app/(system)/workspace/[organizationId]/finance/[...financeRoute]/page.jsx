"use client";

export const dynamic = "force-dynamic";

import { notFound, useParams } from "next/navigation";
import MasterDataRuntimeWorkCenter from "@/components/workspace/master-data/MasterDataRuntimeWorkCenter";
import {
  getWorkspaceItemByRoute,
} from "@/lib/platform/registry/erpRegistry";

export default function FinanceDynamicCapabilityPage() {
  const params = useParams();

  const routeParts =
    params.financeRoute || [];

  const route =
    `/finance/${routeParts.join("/")}`;

  const capability =
    getWorkspaceItemByRoute(route);

  if (!capability) {
    notFound();
  }

  return (
    <MasterDataRuntimeWorkCenter
      workspaceId="finance"
      capability={capability}
      eyebrow={`Finance / ${capability.groupName || "Workspace"}`}
    />
  );
}
