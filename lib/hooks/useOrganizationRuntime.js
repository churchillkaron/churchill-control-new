"use client";

import { useEffect, useMemo, useState } from "react";

import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

function resolveId(value, fallback = null) {
  if (!value) return fallback;
  if (typeof value === "string") return value;
  return value.id || value.entity_id || fallback;
}

function numericMetric(metric, { currency = null, currencyMetric = false } = {}) {
  if (!metric || metric.status !== "connected") return metric || null;
  const value = Number(metric.value || 0);

  if (currencyMetric && currency) {
    try {
      return {
        ...metric,
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
    ...metric,
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
  const [homeMetrics, setHomeMetrics] = useState(null);
  const [homeMetricsLoading, setHomeMetricsLoading] = useState(false);
  const [homeMetricsError, setHomeMetricsError] = useState(null);

  useEffect(() => {
    if (!context?.ready || !organizationId) {
      setHomeMetrics(null);
      setHomeMetricsError(null);
      return;
    }

    const controller = new AbortController();

    async function loadHomeMetrics() {
      setHomeMetricsLoading(true);
      setHomeMetricsError(null);

      try {
        const params = new URLSearchParams({ organizationId });
        if (entityId) params.set("entityId", entityId);
        if (periodId) params.set("periodId", periodId);

        const response = await fetch(`/api/workspace/home/metrics?${params.toString()}`, {
          method: "GET",
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        });
        const payload = await response.json();

        if (!response.ok || !payload?.success) {
          throw new Error(payload?.error || "Unable to load Home business metrics");
        }

        const currency = payload?.context?.currency || context?.currency || null;
        const source = payload?.metrics || {};
        setHomeMetrics({
          revenue: numericMetric(source.revenue, {
            currency,
            currencyMetric: true,
          }),
          orders: numericMetric(source.orders),
          approvals: numericMetric(source.approvals),
          inventoryAlerts: numericMetric(source.inventory_alerts),
          context: payload.context || null,
          generated_at: payload.generated_at || null,
        });
      } catch (error) {
        if (error?.name === "AbortError") return;
        console.error("Home business metrics load failed", error);
        setHomeMetrics(null);
        setHomeMetricsError(error?.message || "Unable to load Home business metrics");
      } finally {
        if (!controller.signal.aborted) setHomeMetricsLoading(false);
      }
    }

    loadHomeMetrics();
    return () => controller.abort();
  }, [context?.ready, context?.currency, organizationId, entityId, periodId]);

  const runtime = useMemo(() => {
    if (!context) return null;
    return {
      ...context,
      metrics: homeMetrics || context.metrics || {},
      metrics_loading: homeMetricsLoading,
      metrics_error: homeMetricsError,
    };
  }, [context, homeMetrics, homeMetricsLoading, homeMetricsError]);

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
