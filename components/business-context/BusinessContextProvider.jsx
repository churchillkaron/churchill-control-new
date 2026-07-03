"use client";

import {
  createContext,
  useContext,
  useMemo,
} from "react";

import {
  useParams,
} from "next/navigation";

import {
  useOrganizationRuntime,
} from "@/lib/hooks/useOrganizationRuntime";

const BusinessContext =
  createContext(null);

export function BusinessContextProvider({
  children,
}) {
  const params =
    useParams();

  const {
    runtime,
    organization,
    loading,
  } = useOrganizationRuntime();

  const finance =
    runtime?.finance ||
    runtime?.resolvedRuntime?.finance ||
    {};

  const entity =
    finance.entity ||
    finance.activeEntity ||
    runtime?.activeEntity ||
    null;

  const period =
    finance.currentPeriod ||
    runtime?.activePeriod ||
    null;

  const value =
    useMemo(
      () => ({
        loading,

        user:
          runtime?.access?.user ||
          runtime?.access?.staff ||
          null,

        organization:
          organization ||
          runtime?.activeOrganization ||
          null,

        organizationId:
          params?.organizationId ||
          organization?.id ||
          runtime?.activeOrganization?.id ||
          null,

        entity,

        entityId:
          entity?.id ||
          finance.entityId ||
          finance.entity_id ||
          null,

        period,

        periodId:
          period?.id ||
          finance.periodId ||
          finance.period_id ||
          null,

        country:
          entity?.country ||
          finance.taxRegime ||
          organization?.country ||
          null,

        currency:
          entity?.currency ||
          finance.baseCurrency ||
          organization?.default_currency ||
          "THB",

        permissions:
          runtime?.permissions ||
          runtime?.access?.permissions ||
          [],

        workspace:
          params?.moduleId ||
          null,

        registry:
          null,

        runtime,
        finance,

        ready:
          Boolean(
            params?.organizationId ||
            organization?.id ||
            runtime?.activeOrganization?.id
          ),
      }),
      [
        loading,
        params?.organizationId,
        params?.moduleId,
        organization,
        runtime,
        entity,
        period,
        finance,
      ]
    );

  return (
    <BusinessContext.Provider value={value}>
      {children}
    </BusinessContext.Provider>
  );
}

export function useBusinessContext() {
  const context =
    useContext(BusinessContext);

  if (!context) {
    throw new Error(
      "useBusinessContext must be used inside BusinessContextProvider"
    );
  }

  return context;
}
