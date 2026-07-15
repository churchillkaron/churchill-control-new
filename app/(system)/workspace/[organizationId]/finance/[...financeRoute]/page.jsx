"use client";

import { notFound } from "next/navigation";

import ERPEngine from "@/lib/platform/erp-engine/ERPRuntime";


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

    <ERPEngine

      renderer={
        capability?.runtime?.renderer ||
        capability?.renderer
      }

      capability={capability}

      workspaceId="finance"

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

    />

  );
}
