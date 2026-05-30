"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  useTenant,
} from "@/app/providers/TenantProvider";



export default function KitchenSettingsPage() {

  const tenant =
    useTenant();

  const tenantId =
    tenant?.id;


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
        "/api/settings/kitchen/load",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            tenantId:
              tenantId,
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
      "/api/settings/kitchen/save",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({

          tenantId:
            tenantId,

          settings,

        }),
      }
    );

    setSaving(false);

    alert(
      "Kitchen settings saved"
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
            Kitchen Runtime
          </div>

          <h1 className="text-5xl font-light">
            Kitchen Configuration
          </h1>

        </div>

        <div className="grid grid-cols-2 gap-6">

          {[
            [
              "auto_fire_orders",
              "Auto Fire Orders",
            ],

            [
              "auto_bump_completed",
              "Auto Bump Completed",
            ],

            [
              "require_expo_confirmation",
              "Require Expo Confirmation",
            ],

            [
              "enable_course_firing",
              "Enable Course Firing",
            ],

            [
              "enable_priority_orders",
              "Priority Orders",
            ],

            [
              "enable_sla_monitoring",
              "SLA Monitoring",
            ],

            [
              "auto_alert_delays",
              "Auto Delay Alerts",
            ],

            [
              "enable_station_routing",
              "Station Routing",
            ],

            [
              "enable_sound_alerts",
              "Sound Alerts",
            ],

            [
              "show_completed_orders",
              "Show Completed Orders",
            ],

            [
              "enable_kitchen_printing",
              "Kitchen Printing",
            ],

            [
              "auto_print_on_fire",
              "Auto Print On Fire",
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

        <div className="grid grid-cols-2 gap-6">

          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">

            <div className="mb-4 text-zinc-400 uppercase tracking-[0.2em] text-sm">
              Warning Time (Minutes)
            </div>

            <input
              type="number"
              value={
                settings.warning_time_minutes
              }
              onChange={e =>
                setSettings(prev => ({
                  ...prev,
                  warning_time_minutes:
                    Number(e.target.value),
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
              value={
                settings.critical_time_minutes
              }
              onChange={e =>
                setSettings(prev => ({
                  ...prev,
                  critical_time_minutes:
                    Number(e.target.value),
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

          {
            saving
              ? "Saving..."
              : "Save Kitchen Settings"
          }

        </button>

      </div>

    </div>

  );

}
