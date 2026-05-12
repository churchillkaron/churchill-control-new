"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/shared/supabase/client";

const TENANT_ID = "76e2caa6-dd78-49e5-b0f5-1ff94185c2d4";

export default function SystemSettingsPage() {
  const [settings, setSettings] = useState({
    mode: "small",
    production_mode: "combined",
    pos_mode: "tables",
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const { data } = await supabase
      .from("restaurant_settings")
      .select("*")
      .eq("tenant_id", TENANT_ID)
      .single();

    if (data) setSettings(data);
  };

  const saveSettings = async () => {
    await supabase
      .from("restaurant_settings")
      .upsert({
        ...settings,
        tenant_id: TENANT_ID,
      });

    alert("System settings saved");
  };

  return (
    <div className="p-6 text-white max-w-xl space-y-6">
      <h1 className="text-2xl">System Configuration</h1>

      {/* MODE */}
      <div>
        <label className="text-sm text-white/60">Restaurant Type</label>
        <select
          value={settings.mode}
          onChange={(e) =>
            setSettings({ ...settings, mode: e.target.value })
          }
          className="mt-2 w-full bg-white/10 p-2 rounded"
        >
          <option value="small">Small (All-in-one staff)</option>
          <option value="standard">Standard</option>
          <option value="enterprise">Enterprise</option>
        </select>
      </div>

      {/* PRODUCTION */}
      <div>
        <label className="text-sm text-white/60">Production Mode</label>
        <select
          value={settings.production_mode}
          onChange={(e) =>
            setSettings({
              ...settings,
              production_mode: e.target.value,
            })
          }
          className="mt-2 w-full bg-white/10 p-2 rounded"
        >
          <option value="combined">Kitchen + Production</option>
          <option value="separate">Separate Production Staff</option>
        </select>
      </div>

      {/* POS */}
      <div>
        <label className="text-sm text-white/60">POS Mode</label>
        <select
          value={settings.pos_mode}
          onChange={(e) =>
            setSettings({
              ...settings,
              pos_mode: e.target.value,
            })
          }
          className="mt-2 w-full bg-white/10 p-2 rounded"
        >
          <option value="tables">Table Service</option>
          <option value="direct">Direct Sales</option>
        </select>
      </div>

      <button
        onClick={saveSettings}
        className="bg-orange-500 px-4 py-2 rounded"
      >
        Save System Settings
      </button>
    </div>
  );
}