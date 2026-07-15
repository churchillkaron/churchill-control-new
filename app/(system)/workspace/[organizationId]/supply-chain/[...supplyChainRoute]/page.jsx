"use client";

export const dynamic = "force-dynamic";

import { notFound, useParams } from "next/navigation";
import ERPEngine from "@/lib/platform/erp-engine/ERPRuntime";
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
    <ERPEngine

      renderer={
        capability?.runtime?.renderer ||
        capability?.renderer
      }

      capability={capability}

      organizationId={
        params.organizationId
      }

    />
  );

}
