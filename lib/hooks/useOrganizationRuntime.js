"use client";

import { useEffect, useMemo, useState } from "react";

import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

function resolveId(value, fallback = null) {
  if (!value) return fallback;
  if (typeof value === "string") return value;
  return value.id || value.entity_id || fallback;
}

function numericMetric(metric, { currency = null, currencyMetric = false } = {}) {
  if (metric === undefined || metric === null) return null;
  const source = typeof metric === "object" ? metric : { value: metric, status: "connected" };
  if (source.status && source.status !== "connected") return source;
  const value = Number(source.value || 0);

  if (currencyMetric && currency) {
    try {
      return {
        ...source,
        value,
        formatted: new Intl.NumberFormat(undefined, {
          style: "currency",
          currency,
          maximumFractionDigits: 0,
        }).format(value),
      };
    } catch {
      // Fall through to deterministic numeric formatting if the currency code is invalid.
    }
  }

  return {
    ...source,
    value,
    formatted: new Intl.NumberFormat(undefined, {
      maximumFractionDigits: 0,
    }).format(value),
  };
}

export function useOrganizationRuntime() {
  const context = useBusinessContext();
  const entity = context?.entity || null;
  const entityId = resolveId(entity, context?.entity_id || null);
  const periodId = resolveId(context?.period, context?.period_id || null);
  const organizationId = context?.organization_id || context?.organization?.id || null;
  const [homeState, setHomeState] = useState(null);
  const [homeLoading, setHomeLoading] = useState(false);
  const [homeError, setHomeError] = useState(null);

  useEffect(() => {
    if (!context?.ready || !organizationId) {
      setHomeState(null);
      setHomeError(null);
      return;
    }

    const controller = new AbortController();

    async function loadHomeState() {
      setHomeLoading(true);
      setHomeError(null);

      try {
        const params = new URLSearchParams({ organizationId });
        if (entityId) params.set("entityId", entityId);
        if (periodId) params.set("periodId", periodId);

        const response = await fetch(`/api/workspace/home/command-center?${params.toString()}`, {
          method: "GET",
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        });
        const payload = await response.json();

        if (!response.ok || !payload?.success) {
          throw new Error(payload?.error || "Unable to load Home operating state");
        }

        const currency = payload?.context?.currency || context?.currency || null;
        const source = payload?.metrics || {};
        setHomeState({
          metrics: {
            revenue: numericMetric(source.revenue, { currency, currencyMetric: true }),
            orders: numericMetric(source.orders),
            approvals: numericMetric(source.approvals),
            attention: numericMetric(source.attention),
            inventoryAlerts: numericMetric(source.inventory_alerts),
          },
          queue: Array.isArray(payload.queue) ? payload.queue : [],
          domains: Array.isArray(payload.domains) ? payload.domains : [],
          sources: Array.isArray(payload.sources) ? payload.sources : [],
          context: payload.context || null,
          generated_at: payload.generated_at || null,
        });
      } catch (error) {
        if (error?.name === "AbortError") return;
        console.error("Home operating state load failed", error);
        setHomeState(null);
        setHomeError(error?.message || "Unable to load Home operating state");
      } finally {
        if (!controller.signal.aborted) setHomeLoading(false);
      }
    }

    loadHomeState();
    return () => controller.abort();
  }, [context?.ready, context?.currency, organizationId, entityId, periodId]);

  const runtime = useMemo(() => {
    if (!context) return null;
    return {
      ...context,
      metrics: homeState?.metrics || context.metrics || {},
      home_queue: homeState?.queue || [],
      home_domains: homeState?.domains || [],
      home_sources: homeState?.sources || [],
      home_context: homeState?.context || null,
      home_generated_at: homeState?.generated_at || null,
      metrics_loading: homeLoading,
      metrics_error: homeError,
    };
  }, [context, homeState, homeLoading, homeError]);

  return {
    ready: context?.ready || false,
    loading: context?.loading || false,
    organization: context?.organization || null,
    organizations:
      context?.organizations ||
      (context?.organization ? [context.organization] : []),
    navigation: context?.navigation || {
      domains: [],
      solutions: [],
      tree: [],
    },
    role: context?.role || null,
    staff: context?.staff || null,
    user: context?.user || null,
    entity,
    entities:
      context?.entities ||
      (entity ? [entity] : []),
    entityId,
    legalEntityId: entityId,
    period: context?.period || null,
    periodId,
    modules: context?.modules || [],
    permissions: context?.permissions || [],
    runtime,
  };
}
