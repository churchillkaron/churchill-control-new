"use client";

import { useCallback, useEffect, useState } from "react";

export function useOperationsReadiness({ organizationId, entityId = null, periodId = null } = {}) {
  const [state, setState] = useState({
    loading: true,
    error: "",
    status: "unknown",
    checks: [],
    blocking_failures: [],
    warnings: [],
    capability_count: 0,
    checked_at: null,
  });

  const load = useCallback(async () => {
    if (!organizationId) {
      setState((current) => ({
        ...current,
        loading: false,
        error: "Missing organisation context.",
        status: "unavailable",
      }));
      return;
    }

    setState((current) => ({ ...current, loading: true, error: "" }));

    try {
      const params = new URLSearchParams({ organization_id: organizationId });
      if (entityId) params.set("entity_id", entityId);
      if (periodId) params.set("period_id", periodId);

      const response = await fetch(`/api/operations/readiness?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await response.json().catch(() => ({}));

      setState({
        loading: false,
        error: json.error || "",
        status: json.status || (response.ok ? "healthy" : "unavailable"),
        checks: Array.isArray(json.checks) ? json.checks : [],
        blocking_failures: Array.isArray(json.blocking_failures) ? json.blocking_failures : [],
        warnings: Array.isArray(json.warnings) ? json.warnings : [],
        capability_count: Number(json.capability_count || 0),
        checked_at: json.checked_at || null,
      });
    } catch (error) {
      setState({
        loading: false,
        error: error.message || "Operations readiness check failed.",
        status: "unavailable",
        checks: [],
        blocking_failures: [],
        warnings: [],
        capability_count: 0,
        checked_at: null,
      });
    }
  }, [organizationId, entityId, periodId]);

  useEffect(() => {
    const timer = window.setTimeout(load, 1500);
    return () => window.clearTimeout(timer);
  }, [load]);

  return {
    ...state,
    refresh: load,
  };
}

export default useOperationsReadiness;
