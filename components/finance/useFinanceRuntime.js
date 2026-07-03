"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

export function useFinanceRuntime() {
  const params = useParams();
  const businessContext = useBusinessContext();

  const organization =
    businessContext?.organization || {};

  const entity =
    businessContext?.entity || null;

  const period =
    businessContext?.period || null;

  const organizationId =
    params?.organizationId ||
    businessContext?.organization_id ||
    organization?.id ||
    null;

  const entityId =
    businessContext?.entity_id ||
    entity?.id ||
    null;

  const periodId =
    businessContext?.period_id ||
    period?.id ||
    null;

  const runtime = {
    organization,
    entity,
    period,
    finance: {
      organizationId,
      organization_id: organizationId,
      entityId,
      entity_id: entityId,
      periodId,
      period_id: periodId,
      currency: businessContext?.currency || null,
      country: businessContext?.country || null,
    },
  };

  return useMemo(() => ({
    ready: Boolean(organizationId),
    organizationId,
    entityId,
    periodId,
    runtime,
    organization,
    entity,
    period,
    hasEntity: Boolean(entityId),
  }), [
    organizationId,
    entityId,
    periodId,
    organization,
    entity,
    period,
  ]);
}

export function buildFinanceQuery(finance, extra = {}) {
  const params = new URLSearchParams();

  if (finance?.organizationId) {
    params.set("organizationId", finance.organizationId);
  }

  if (finance?.entityId) {
    params.set("entityId", finance.entityId);
  }

  if (finance?.periodId) {
    params.set("periodId", finance.periodId);
  }

  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, value);
    }
  }

  return params.toString();
}
