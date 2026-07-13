"use client";

import { useCallback } from "react";
import { useOrganizationRuntime } from "@/lib/hooks/useOrganizationRuntime";

function resolveId(value, fallback = null) {
  if (!value) return fallback;
  if (typeof value === "string") return value;
  return value.id || value.entity_id || value.entity_id || fallback;
}

export function useFinanceRuntime() {
  const runtime = useOrganizationRuntime();

  const organizationId =
    resolveId(runtime.organization, runtime.organization_id);

  const entityId =
    resolveId(runtime.entity, runtime.entity_id);

  const periodId =
    resolveId(runtime.period, runtime.period_id);

  const financeGet = useCallback(
    async (path, extra = {}) => {
      if (!organizationId) {
        throw new Error("organizationId unavailable");
      }

      const url = new URL(path, window.location.origin);

      url.searchParams.set("organizationId", organizationId);

      if (entityId) {
        url.searchParams.set("entityId", entityId);
      }

      if (periodId) {
        url.searchParams.set("periodId", periodId);
      }

      for (const [key, value] of Object.entries(extra || {})) {
        if (
          value !== undefined &&
          value !== null &&
          value !== ""
        ) {
          url.searchParams.set(key, value);
        }
      }

      const res = await fetch(url.toString(), {
        cache: "no-store",
      });

      if (!res.ok) {
        throw new Error(
          `Finance GET ${res.status}`
        );
      }

      return await res.json();
    },
    [
      organizationId,
      entityId,
      periodId,
    ]
  );

  const financePost = useCallback(
    async (path, body = {}) => {
      if (!organizationId) {
        throw new Error("organizationId unavailable");
      }

      const res = await fetch(path, {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...body,
          organizationId,
          organization_id: organizationId,
          entityId,
          entity_id: entityId,
          periodId,
          period_id: periodId,
        }),
      });

      if (!res.ok) {
        throw new Error(
          `Finance POST ${res.status}`
        );
      }

      return await res.json();
    },
    [
      organizationId,
      entityId,
      periodId,
    ]
  );

  return {
    ...runtime,
    organizationId,
    entityId,
    legalEntityId: entityId,
    periodId,
    financeGet,
    financePost,
  };
}
