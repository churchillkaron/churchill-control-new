"use client";

import { useEffect, useState } from "react";
import {
  useOrganizationRuntime,
} from "@/lib/hooks/useOrganizationRuntime";

export default function KitchenSettingsPage() {
  const { organization } = useOrganizationRuntime();
  const organizationId = organization?.id || null;

  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);

  async function loadSettings() {
    if (!organizationId) {
      setSettings(null);
      return;
    }

    const response = await fetch(
      "/api/settings/kitchen/load",
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
        result?.error || "Unable to load kitchen settings"
      );
    }

    setSettings(result.settings);
  }

  async function saveSettings() {
    if (!organizationId) {
      return;
    }

    try {
      setSaving(true);

      const response = await fetch(
        "/api/settings/kitchen/save",
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
          result?.error || "Unable to save kitchen settings"
        );
      }

      alert("Kitchen settings saved");
    } catch (error) {
      console.error("SAVE_KITCHEN_SETTINGS_ERROR", error);
      alert(error?.message || "Unable to save kitchen settings");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    loadSettings().catch((error) => {
      console.error("LOAD_KITCHEN_SETTINGS_ERROR", error);
    });
  }, [organizationId]);

  if (!organizationId) {
    return (
      <div className="p-10 text-white">
        Select an organization to manage kitchen settings.
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="p-10 text-white">
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
    <div className="min-h-screen bg-black text-white p-10">
      <div className="max-w-5xl mx-auto space-y-8">
        <div>
          <div className="text-sm uppercase tracking-[0.3em] text-zinc-500 mb-3">
            Kitchen Runtime
          </div>
          <h1 className="text-5xl font-light">
            Kitchen Configuration
          </h1>
        </div>

        <div className="grid grid-cols-2 gap-6">
          {[
            ["auto_fire_orders", "Auto Fire Orders"],
            ["auto_bump_completed", "Auto Bump Completed"],
            ["require_expo_confirmation", "Require Expo Confirmation"],
            ["enable_course_firing", "Enable Course Firing"],
            ["enable_priority_orders", "Priority Orders"],
            ["enable_sla_monitoring", "SLA Monitoring"],
            ["auto_alert_delays", "Auto Delay Alerts"],
            ["enable_station_routing", "Station Routing"],
            ["enable_sound_alerts", "Sound Alerts"],
            ["show_completed_orders", "Show Completed Orders"],
            ["enable_kitchen_printing", "Kitchen Printing"],
            ["auto_print_on_fire", "Auto Print On Fire"],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => toggle(key)}
              className={`p-6 rounded-3xl border transition ${
                settings[key]
                  ? "bg-emerald-500 text-black border-emerald-400"
                  : "bg-white/5 border-white/10"
              }`}
            >
              <div className="text-lg">{label}</div>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
            <div className="mb-4 text-zinc-400 uppercase tracking-[0.2em] text-sm">
              Warning Time (Minutes)
            </div>
            <input
              type="number"
              value={settings.warning_time_minutes}
              onChange={(event) =>
                setSettings((previous) => ({
                  ...previous,
                  warning_time_minutes: Number(event.target.value),
                }))
              }
              className="w-full h-16 rounded-2xl bg-black border border-white/10 px-6 text-2xl"
            />
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
            <div className="mb-4 text-zinc-400 uppercase tracking-[0.2em] text-sm">
              Critical Time (Minutes)
            </div>
            <input
              type="number"
              value={settings.critical_time_minutes}
              onChange={(event) =>
                setSettings((previous) => ({
                  ...previous,
                  critical_time_minutes: Number(event.target.value),
                }))
              }
              className="w-full h-16 rounded-2xl bg-black border border-white/10 px-6 text-2xl"
            />
          </div>
        </div>

        <button
          onClick={saveSettings}
          disabled={saving}
          className="w-full h-16 rounded-3xl bg-emerald-500 text-black text-xl font-semibold"
        >
          {saving ? "Saving..." : "Save Kitchen Settings"}
        </button>
      </div>
    </div>
  );
}
