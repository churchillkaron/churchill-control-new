"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";
import { useRouter } from "next/navigation";

const WORKSPACE_ALIASES = {
  master_video: "production",
  "master-video": "production",
  mastervideo: "production",
  video_production: "production",
  "video-production": "production",
  mission_control: "mission",
  "mission-control": "mission",
};

function normalizeWorkspaceId(value) {
  const workspaceId =
    String(value || "mission")
      .trim()
      .toLowerCase();

  return (
    WORKSPACE_ALIASES[workspaceId] ||
    workspaceId ||
    "mission"
  );
}

function resolveRuntimeWorkspace(runtime = {}) {
  return normalizeWorkspaceId(
    runtime.route?.[0] ||
    runtime.workspace?.id ||
    "mission",
  );
}

export function useCreativeEditor(runtime) {
  const router =
    useRouter();

  const [selection, setSelection] =
    useState(null);

  const [activeWorkspace, setActiveWorkspaceState] =
    useState(() =>
      resolveRuntimeWorkspace(runtime),
    );

  const [saving, setSaving] =
    useState(false);

  const [refreshing, setRefreshing] =
    useState(false);

  useEffect(() => {
    setActiveWorkspaceState(
      resolveRuntimeWorkspace(runtime),
    );
  }, [
    runtime.route?.[0],
    runtime.workspace?.id,
  ]);

  const setActiveWorkspace =
    useCallback((workspaceId) => {
      setActiveWorkspaceState(
        normalizeWorkspaceId(workspaceId),
      );
    }, []);

  const refresh =
    useCallback(() => {
      setRefreshing(true);
      router.refresh();
      setTimeout(
        () => setRefreshing(false),
        250,
      );
    }, [
      router,
    ]);

  const save = useCallback(async (values) => {
    if (!selection) return;

    setSaving(true);

    try {
      const api =
        selection.type === "scene"
          ? "/api/creative/scenes"
          : "/api/creative/shots";

      const payload = {
        ...values,
        id: selection.data.id,
        organization_id:
          runtime.organizationId,
        creative_project_id:
          runtime.projectRuntime?.current?.id,
      };

      const res =
        await fetch(api, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

      if (!res.ok) {
        throw new Error("Save failed");
      }

      const json =
        await res.json();

      setSelection({
        ...selection,
        data:
          json.scene ||
          json.shot,
      });

      refresh();
    } finally {
      setSaving(false);
    }
  }, [
    runtime,
    selection,
    refresh,
  ]);

  return {
    activeWorkspace,
    setActiveWorkspace,
    selection,
    setSelection,
    save,
    saving,
    refresh,
    refreshing,
  };
}
