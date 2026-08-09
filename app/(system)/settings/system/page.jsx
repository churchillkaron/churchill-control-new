"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import {
  useOrganizationRuntime,
} from "@/lib/hooks/useOrganizationRuntime";

const defaultSettings = {
  mode: "small",
  production_mode: "combined",
  pos_mode: "tables",
};

export default function SystemSettingsPage() {
  const { organization } = useOrganizationRuntime();
  const organizationId = organization?.id || null;

  const [settings, setSettings] = useState(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function loadSettings() {
    if (!organizationId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const response = await fetch(
        "/api/settings/operational",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            organizationId,
            domain: "SYSTEM",
          }),
        }
      );

      const result = await response.json();

      if (!response.ok || !result?.success) {
        throw new Error(
          result?.error || "Unable to load system settings"
        );
      }

      setSettings({
        ...defaultSettings,
        ...(result.settings || {}),
      });
    } catch (error) {
      console.error("LOAD_SYSTEM_SETTINGS_ERROR", error);
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings() {
    if (!organizationId) {
      return;
    }

    try {
      setSaving(true);

      const response = await fetch(
        "/api/settings/operational",
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            organizationId,
            domain: "SYSTEM",
            settings,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok || !result?.success) {
        throw new Error(
          result?.error || "Unable to save system settings"
        );
      }

      alert("System settings saved");
    } catch (error) {
      console.error("SAVE_SYSTEM_SETTINGS_ERROR", error);
      alert(error?.message || "Unable to save system settings");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    loadSettings();
  }, [organizationId]);

  if (!organizationId) {
    return (
      <div className="p-6 text-white">
        Select an organization to manage system settings.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6 text-white">
        Loading system settings...
      </div>
    );
  }

  return (
    <div className="p-6 text-white max-w-xl space-y-6">
      <h1 className="text-2xl">System Configuration</h1>

      <div>
        <label className="text-sm text-white/60">Operation Type</label>
        <select
          value={settings.mode}
          onChange={(event) =>
            setSettings({
              ...settings,
              mode: event.target.value,
            })
          }
          className="mt-2 w-full bg-white/10 p-2 rounded"
        >
          <option value="small">Small</option>
          <option value="standard">Standard</option>
          <option value="enterprise">Enterprise</option>
        </select>
      </div>

      <div>
        <label className="text-sm text-white/60">Production Mode</label>
        <select
          value={settings.production_mode}
          onChange={(event) =>
            setSettings({
              ...settings,
              production_mode: event.target.value,
            })
          }
          className="mt-2 w-full bg-white/10 p-2 rounded"
        >
          <option value="combined">Combined</option>
          <option value="separate">Separate Work Centers</option>
        </select>
      </div>

      <div>
        <label className="text-sm text-white/60">Commerce Mode</label>
        <select
          value={settings.pos_mode}
          onChange={(event) =>
            setSettings({
              ...settings,
              pos_mode: event.target.value,
            })
          }
          className="mt-2 w-full bg-white/10 p-2 rounded"
        >
          <option value="tables">Session / Table Service</option>
          <option value="direct">Direct Sales</option>
        </select>
      </div>

      <button
        onClick={saveSettings}
        disabled={saving}
        className="bg-orange-500 px-4 py-2 rounded disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save System Settings"}
      </button>
    </div>
  );
}
