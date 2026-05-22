"use client";

import {
  useEffect,
  useState,
} from "react";

const TENANT_ID =
  "76e2caa6-dd78-49e5-b0f5-1ff94185c2d4";

export default function TableSettingsPage() {

  const [
    settings,
    setSettings,
  ] = useState(null);

  const [
    saving,
    setSaving,
  ] = useState(false);

  async function loadSettings() {

    const response =
      await fetch(
        "/api/settings/tables/load",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            tenantId:
              TENANT_ID,
          }),
        }
      );

    const result =
      await response.json();

    setSettings(
      result.settings
    );

  }

  async function saveSettings() {

    setSaving(true);

    await fetch(
      "/api/settings/tables/save",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({

          tenantId:
            TENANT_ID,

          settings,

        }),
      }
    );

    setSaving(false);

    alert(
      "Table settings saved"
    );

  }

  useEffect(() => {

    loadSettings();

  }, []);

  if (!settings) {

    return (
      <div className="p-10 text-white">
        Loading...
      </div>
    );

  }

  function toggle(key) {

    setSettings(prev => ({

      ...prev,

      [key]:
        !prev[key],

    }));

  }

  return (

    <div className="min-h-screen bg-black text-white p-10">

      <div className="max-w-5xl mx-auto space-y-8">

        <div>

          <div className="text-sm uppercase tracking-[0.3em] text-zinc-500 mb-3">
            Table Runtime
          </div>

          <h1 className="text-5xl font-light">
            Table Configuration
          </h1>

        </div>

        <div className="grid grid-cols-2 gap-6">

          {[
            [
              "enable_table_locking",
              "Enable Table Locking",
            ],

            [
              "auto_release_paid_tables",
              "Auto Release Paid Tables",
            ],

            [
              "allow_manual_table_release",
              "Manual Table Release",
            ],

            [
              "allow_table_transfer",
              "Allow Table Transfer",
            ],

            [
              "allow_table_merge",
              "Allow Table Merge",
            ],

            [
              "require_manager_transfer",
              "Manager Transfer Approval",
            ],

            [
              "require_manager_merge",
              "Manager Merge Approval",
            ],

            [
              "enable_reservations",
              "Enable Reservations",
            ],

            [
              "auto_release_no_show",
              "Auto Release No Show",
            ],

            [
              "enable_capacity_limits",
              "Capacity Limits",
            ],

            [
              "realtime_table_sync",
              "Realtime Sync",
            ],

            [
              "show_table_timers",
              "Show Table Timers",
            ],

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

              <div className="text-lg">
                {label}
              </div>

            </button>

          ))}

        </div>

        <button
          onClick={saveSettings}
          disabled={saving}
          className="w-full h-16 rounded-3xl bg-emerald-500 text-black text-xl font-semibold"
        >

          {
            saving
              ? "Saving..."
              : "Save Table Settings"
          }

        </button>

      </div>

    </div>

  );

}
