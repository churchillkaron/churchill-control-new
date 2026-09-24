"use client";

import { useCallback, useEffect, useState } from "react";
import {
  useOrganizationRuntime,
} from "@/lib/hooks/useOrganizationRuntime";

export default function TableSettingsPage() {
  const { organization } = useOrganizationRuntime();
  const organizationId = organization?.id || null;

  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);

  const loadSettings = useCallback(async () => {
    if (!organizationId) {
      setSettings(null);
      return;
    }

    const response = await fetch(
      "/api/settings/tables/load",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          organizationId,
        }),
      }
    );

    const result = await response.json();

    if (!response.ok || !result?.success) {
      throw new Error(
        result?.error || "Unable to load table settings"
      );
    }

    setSettings(result.settings);
  }, [organizationId]);

  async function saveSettings() {
    if (!organizationId) {
      return;
    }

    try {
      setSaving(true);

      const response = await fetch(
        "/api/settings/tables/save",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            organizationId,
            settings,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok || !result?.success) {
        throw new Error(
          result?.error || "Unable to save table settings"
        );
      }

      alert("Table settings saved");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    loadSettings().catch((error) => {
      console.error("LOAD_TABLE_SETTINGS_ERROR", error);
    });
  }, [loadSettings]);

  if (!organizationId) {
    return (
      <div className="p-10 text-[#191919]">
        Select an organization to manage table settings.
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="p-10 text-[#191919]">
        Loading...
      </div>
    );
  }

  function toggle(key) {
    setSettings((previous) => ({
      ...previous,
      [key]: !previous[key],
    }));
  }

  return (
    <div className="min-h-screen bg-[#F7F6F3] p-10 text-[#191919]">
      <div className="max-w-5xl mx-auto space-y-8">
        <div>
          <div className="text-sm uppercase tracking-[0.3em] text-[#817A72] mb-3">
            Table Runtime
          </div>

          <h1 className="text-5xl font-light">
            Table Configuration
          </h1>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {[
            ["enable_table_locking", "Enable Table Locking"],
            ["auto_release_paid_tables", "Auto Release Paid Tables"],
            ["allow_manual_table_release", "Manual Table Release"],
            ["allow_table_transfer", "Allow Table Transfer"],
            ["allow_table_merge", "Allow Table Merge"],
            ["require_manager_transfer", "Manager Transfer Approval"],
            ["require_manager_merge", "Manager Merge Approval"],
            ["enable_reservations", "Enable Reservations"],
            ["auto_release_no_show", "Auto Release No Show"],
            ["enable_capacity_limits", "Capacity Limits"],
            ["realtime_table_sync", "Realtime Sync"],
            ["show_table_timers", "Show Table Timers"],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => toggle(key)}
              className={`rounded-2xl border p-5 text-left transition ${
                settings[key]
                  ? "border-[#D6A66A]/55 bg-[#F1E2CF] text-[#4C3520]"
                  : "border-black/[0.08] bg-white text-[#5F5A54]"
              }`}
            >
              <div className="text-[11px] font-semibold">
                {label}
              </div>
            </button>
          ))}
        </div>

        <button
          onClick={saveSettings}
          disabled={saving}
          className="h-14 w-full rounded-2xl border border-[#C89558]/30 bg-[#D6A66A] text-[15px] font-semibold text-[#2F2418] transition hover:bg-[#C99A61] disabled:opacity-45"
        >
          {saving ? "Saving..." : "Save Table Settings"}
        </button>
      </div>
    </div>
  );
}
