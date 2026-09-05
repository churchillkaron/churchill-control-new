"use client";

import { useCallback, useEffect, useState } from "react";

export function useCreativeOrchestration(runtime) {
  const projectId = runtime.projectRuntime?.current?.id || null;
  const organizationId = runtime.organizationId || null;
  const [orchestration, setOrchestration] = useState(null);
  const [loading, setLoading] = useState(Boolean(projectId && organizationId));
  const [error, setError] = useState("");

  const refresh = useCallback(async ({ quiet = false } = {}) => {
    if (!projectId || !organizationId) {
      setOrchestration(null);
      setError("");
      setLoading(false);
      return null;
    }

    if (!quiet) setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/creative/studio/orchestration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organization_id: organizationId,
          creative_project_id: projectId,
        }),
      });
      const result = await response.json();
      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Studio orchestration inspection failed");
      }
      setOrchestration(result.orchestration || null);
      return result.orchestration || null;
    } catch (refreshError) {
      setError(refreshError.message || "Studio orchestration inspection failed");
      return null;
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [organizationId, projectId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    current: orchestration,
    loading,
    error,
    refresh,
  };
}
