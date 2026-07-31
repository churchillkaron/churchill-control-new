"use client";

import { useCallback, useEffect, useState } from "react";

function cacheKey(organizationId, entityId, periodId) {
  return `operations-access:${organizationId || ""}:${entityId || ""}:${periodId || ""}`;
}

function cachedAccess(key) {
  if (typeof window === "undefined" || !key) return null;

  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.savedAt || Date.now() - parsed.savedAt > 5 * 60 * 1000) {
      window.sessionStorage.removeItem(key);
      return null;
    }
    return parsed.value || null;
  } catch {
    return null;
  }
}

export function useOperationsAccess({ organizationId, entityId = null, periodId = null } = {}) {
  const key = cacheKey(organizationId, entityId, periodId);
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

    const cached = cachedAccess(key);
    if (cached) {
      setAccess({
        ...cached,
        loading: false,
        error: "",
      });
    } else {
      setAccess((current) => ({ ...current, loading: true, error: "" }));
    }

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

      const value = {
        loading: false,
        error: "",
        permissions: Array.isArray(json.permissions) ? json.permissions : [],
        assignments: Array.isArray(json.assignments) ? json.assignments : [],
        can: json.can || {},
        user: json.user || null,
        role: json.role || null,
      };

      setAccess(value);

      try {
        window.sessionStorage.setItem(
          key,
          JSON.stringify({ savedAt: Date.now(), value })
        );
      } catch {
        // Cache is an optional acceleration only.
      }
    } catch (error) {
      if (!cached) {
        setAccess({
          loading: false,
          error: error.message || "Operations access could not be resolved.",
          permissions: [],
          assignments: [],
          can: {},
          user: null,
        });
      }
    }
  }, [organizationId, entityId, periodId, key]);

  useEffect(() => {
    load();
  }, [load]);

  return {
    ...access,
    refresh: load,
  };
}

export default useOperationsAccess;
