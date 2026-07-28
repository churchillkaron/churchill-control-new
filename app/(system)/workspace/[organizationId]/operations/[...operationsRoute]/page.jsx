"use client";

export const dynamic = "force-dynamic";

import { notFound, useParams } from "next/navigation";

import OperationsEventWorkCenter from "@/components/workspace/operations/OperationsEventWorkCenter";
import OperationsRuntimeWorkCenter from "@/components/workspace/operations/OperationsRuntimeWorkCenter";
import { getOperationsWorkspaceItem } from "@/lib/operations/registry/OperationsWorkspaceResolver";

export default function OperationsCapabilityPage() {
  const params = useParams();
  const routeParts = Array.isArray(params?.operationsRoute)
    ? params.operationsRoute
    : [];
  const capabilityId = routeParts.join("/");
  const capability = getOperationsWorkspaceItem(capabilityId);

  if (!capability) {
    notFound();
  }

  if (capability.renderer === "OperationsEventWorkCenter") {
    return <OperationsEventWorkCenter capability={capability} />;
  }

  return <OperationsRuntimeWorkCenter capability={capability} />;
}
