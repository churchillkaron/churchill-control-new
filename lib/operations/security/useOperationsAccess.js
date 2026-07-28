"use client";

import { useCallback, useEffect, useState } from "react";

export function useOperationsAccess({ organizationId, entityId = null, periodId = null } = {}) {
  const [access, setAccess] = useState({
    loading: true,
    error: "",
    permissions: [],
    assignments: [],
    can: {},
    user: null,
  });

  const load = useCallback(async () => {
    if (!organizationId) {
      setAccess({
        loading: false,
        error: "",
        permissions: [],
        assignments: [],
        can: {},
        user: null,
      });
      return;
    }

    setAccess((current) => ({ ...current, loading: true, error: "" }));

    try {
      const params = new URLSearchParams({ organization_id: organizationId });
      if (entityId) params.set("entity_id", entityId);
      if (periodId) params.set("period_id", periodId);

      const response = await fetch(`/api/operations/access?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await response.json().catch(() => ({}));

      if (!response.ok || !json.ok) {
        throw new Error(json.error || "Operations access could not be resolved.");
      }

      setAccess({
        loading: false,
        error: "",
        permissions: Array.isArray(json.permissions) ? json.permissions : [],
        assignments: Array.isArray(json.assignments) ? json.assignments : [],
        can: json.can || {},
        user: json.user || null,
        role: json.role || null,
      });
    } catch (error) {
      setAccess({
        loading: false,
        error: error.message || "Operations access could not be resolved.",
        permissions: [],
        assignments: [],
        can: {},
        user: null,
      });
    }
  }, [organizationId, entityId, periodId]);

  useEffect(() => {
    load();
  }, [load]);

  return {
    ...access,
    refresh: load,
  };
}

export default useOperationsAccess;
