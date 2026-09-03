"use client";

import { createContext, useCallback, useContext, useMemo } from "react";
import useSWR from "swr";

import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

const FinanceLandingRuntimeContext = createContext(null);

function buildSnapshotKey(organizationId, entityId, periodId) {
  if (!organizationId || !entityId || !periodId) return null;
  return ["finance-landing", organizationId, entityId, periodId];
}

function buildUrl(path, organizationId, entityId, periodId) {
  const query = new URLSearchParams({ organizationId, entityId, periodId });
  return `${path}?${query.toString()}`;
}

async function fetchJson(url, fallbackMessage) {
  const response = await fetch(url, { cache: "no-store", credentials: "include" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.success === false) {
    const error = new Error(body?.error || fallbackMessage || `Finance request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return body;
}

async function financeSnapshotFetcher([, organizationId, entityId, periodId]) {
  const [commandCenter, accountHealth] = await Promise.all([
    fetchJson(
      buildUrl("/api/workspace/finance/command-center", organizationId, entityId, periodId),
      "Unable to load Finance command center",
    ),
    fetchJson(
      buildUrl("/api/workspace/finance/account-health", organizationId, entityId, periodId),
      "Unable to load account health",
    ),
  ]);

  return {
    commandCenter,
    accountHealth,
    generatedAt: commandCenter?.generated_at || accountHealth?.generated_at || new Date().toISOString(),
  };
}

export function FinanceLandingRuntimeProvider({ organizationId, children }) {
  const businessContext = useBusinessContext() || {};
  const entityId = businessContext.entity_id || businessContext.entity?.id || null;
  const periodId = businessContext.period_id || businessContext.period?.id || null;
  const entity = businessContext.entity || null;
  const period = businessContext.period || null;
  const organization = businessContext.organization || null;
  const key = buildSnapshotKey(organizationId, entityId, periodId);

  const { data, error, isLoading, isValidating, mutate } = useSWR(key, financeSnapshotFetcher, {
    dedupingInterval: 2000,
    revalidateOnFocus: true,
    focusThrottleInterval: 30000,
    shouldRetryOnError: false,
    keepPreviousData: true,
  });

  const refresh = useCallback(async () => {
    if (!key) return null;
    return mutate();
  }, [key, mutate]);

  const value = useMemo(() => ({
    organizationId,
    entityId,
    periodId,
    entity,
    period,
    organization,
    data: data?.commandCenter || null,
    accountHealth: data?.accountHealth || null,
    currency:
      data?.commandCenter?.context?.currency ||
      data?.accountHealth?.context?.currency ||
      entity?.currency ||
      organization?.default_currency ||
      null,
    loading: Boolean(key) && isLoading,
    refreshing: Boolean(key) && isValidating,
    error: error?.message || "",
    stale: Boolean(error && data),
    generatedAt: data?.generatedAt || null,
    refresh,
  }), [
    organizationId,
    entityId,
    periodId,
    entity,
    period,
    organization,
    data,
    error,
    key,
    isLoading,
    isValidating,
    refresh,
  ]);

  return (
    <FinanceLandingRuntimeContext.Provider value={value}>
      {children}
    </FinanceLandingRuntimeContext.Provider>
  );
}

export function useFinanceLandingRuntime() {
  const runtime = useContext(FinanceLandingRuntimeContext);
  if (!runtime) {
    throw new Error("Finance landing components must be rendered inside FinanceLandingRuntimeProvider");
  }
  return runtime;
}
