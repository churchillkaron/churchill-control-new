"use client";

import { notFound } from "next/navigation";

import MasterDataRuntimeWorkCenter from "@/components/workspace/master-data/MasterDataRuntimeWorkCenter";

import {
  getWorkspaceItemByRoute,
} from "@/lib/platform/registry/erpRegistry";

import {
  serializeCapability,
} from "@/lib/platform/registry/serializeCapability";

import {
  useBusinessContext,
} from "@/app/providers/BusinessContextProvider";


export const dynamic = "force-dynamic";


export default function FinanceDynamicCapabilityPage({
  params,
}) {

  const businessContext =
    useBusinessContext() || {};


  const routeParts =
    params.financeRoute || [];


  const route =
    `/finance/${routeParts.join("/")}`;


  const capability =
    serializeCapability(
      getWorkspaceItemByRoute(route)
    );


  if (!capability) {

    notFound();

  }


  return (

    <MasterDataRuntimeWorkCenter

      workspaceId="finance"

      capability={capability}

      organizationId={
        businessContext.organization_id ||
        businessContext.organization?.id ||
        params.organizationId ||
        null
      }

      entityId={
        businessContext.entity_id ||
        businessContext.entity?.id ||
        null
      }

      periodId={
        businessContext.period_id ||
        businessContext.period?.id ||
        null
      }

      eyebrow={
        `Finance / ${capability.groupName || "Workspace"}`
      }

    />

  );

}
