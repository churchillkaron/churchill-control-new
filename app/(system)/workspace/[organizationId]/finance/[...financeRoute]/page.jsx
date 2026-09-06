"use client";

import { notFound } from "next/navigation";

import FinanceSourceReturnRail from "@/components/workspace/finance/FinanceSourceReturnRail";
import ERPEngine from "@/lib/platform/erp-engine/ERPRuntime";
import { getWorkspaceItemByRoute } from "@/lib/platform/registry/erpRegistry";
import { serializeCapability } from "@/lib/platform/registry/serializeCapability";
import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

export const dynamic = "force-dynamic";

export default function FinanceDynamicCapabilityPage({ params }) {
  const businessContext = useBusinessContext() || {};
  const routeParts = params.financeRoute || [];
  const route = `/finance/${routeParts.join("/")}`;
  const capability = serializeCapability(getWorkspaceItemByRoute(route));

  if (!capability) notFound();

  const routeOrganizationId = String(params.organizationId || "").trim() || null;
  const contextOrganizationId =
    businessContext.organization_id ||
    businessContext.organization?.id ||
    null;
  const organizationId = routeOrganizationId || contextOrganizationId || null;
  const contextMatchesRoute =
    !routeOrganizationId ||
    !contextOrganizationId ||
    routeOrganizationId === contextOrganizationId;

  // A client-side organization switch can briefly leave the root provider with
  // the previous organization's entity/period. Never let those identifiers cross
  // an organization boundary while the provider re-synchronizes.
  const entityId = contextMatchesRoute
    ? businessContext.entity_id || businessContext.entity?.id || null
    : null;
  const periodId = contextMatchesRoute
    ? businessContext.period_id || businessContext.period?.id || null
    : null;

  if (routeOrganizationId && contextOrganizationId && !contextMatchesRoute) {
    return (
      <div className="flex min-h-[240px] items-center justify-center bg-[#F7F6F3] px-6 text-sm text-[#6C6963]">
        Loading the selected organization...
      </div>
    );
  }

  return <>
    <FinanceSourceReturnRail organizationId={organizationId} capability={capability} />
    <ERPEngine
      renderer={capability?.runtime?.renderer || capability?.renderer}
      capability={capability}
      workspaceId="finance"
      organizationId={organizationId}
      entityId={entityId}
      periodId={periodId}
    />
  </>;
}
