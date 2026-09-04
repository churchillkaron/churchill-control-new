"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

export function useCreativeEditor(runtime) {
  const router = useRouter();

  const [selection, setSelection] = useState(null);
  const [activeWorkspace, setActiveWorkspace] = useState(
    runtime.workspace?.id || "mission",
  );
  const [missionComposerOpen, setMissionComposerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(() => {
    setRefreshing(true);
    router.refresh();
    setTimeout(() => setRefreshing(false), 250);
  }, [router]);

  const openMissionComposer = useCallback(() => {
    setActiveWorkspace("mission");
    setMissionComposerOpen(true);
  }, []);

  const closeMissionComposer = useCallback(() => {
    setMissionComposerOpen(false);
  }, []);

  const save = useCallback(async (values) => {
    if (!selection) return;

    setSaving(true);

    try {
      const api =
        selection.type === "scene"
          ? "/api/creative/scenes"
          : "/api/creative/shots";

      const professionalOverride = ["scene", "shot"].includes(selection.type);
      const payload = {
        ...values,
        id: selection.data.id,
        organization_id: runtime.organizationId,
        creative_project_id: runtime.projectRuntime?.current?.id,
        ...(professionalOverride
          ? {
              _professional_direction: true,
              professional_override: {
                source: "PRO_STUDIO",
                intent: "HUMAN_DIRECTION",
              },
            }
          : {}),
      };

      const res = await fetch(api, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Save failed");

      const json = await res.json();

      setSelection({
        ...selection,
        data: json.scene || json.shot,
      });

      refresh();
    } finally {
      setSaving(false);
    }
  }, [runtime, selection, refresh]);

  return {
    activeWorkspace,
    setActiveWorkspace,
    selection,
    setSelection,
    save,
    saving,
    refresh,
    refreshing,
    missionComposerOpen,
    openMissionComposer,
    closeMissionComposer,
  };
}
