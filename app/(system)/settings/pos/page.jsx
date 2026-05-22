"use client";

import {
  useEffect,
  useState,
} from "react";

const TENANT_ID =
  "76e2caa6-dd78-49e5-b0f5-1ff94185c2d4";

export default function POSSettingsPage() {

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
        "/api/settings/pos/load",
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
      "/api/settings/pos/save",
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
      "POS settings saved"
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

      <div className="max-w-4xl mx-auto space-y-8">

        <div>

          <div className="text-sm uppercase tracking-[0.3em] text-zinc-500 mb-3">
            Restaurant Operations
          </div>

          <h1 className="text-5xl font-light">
            POS Settings
          </h1>

        </div>

        <div className="grid grid-cols-2 gap-6">

          {[
            [
              "auto_fire_kitchen",
              "Auto Fire Kitchen",
            ],

            [
              "require_table_assignment",
              "Require Table Assignment",
            ],

            [
              "allow_split_payment",
              "Allow Split Payment",
            ],

            [
              "allow_order_edit_after_send",
              "Allow Edit After Send",
            ],

            [
              "require_manager_void",
              "Require Manager Void",
            ],

            [
              "enable_service_charge",
              "Enable Service Charge",
            ],

            [
              "enable_receipt_printing",
              "Receipt Printing",
            ],

            [
              "enable_kitchen_printing",
              "Kitchen Printing",
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

        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">

          <div className="mb-4 text-zinc-400 uppercase tracking-[0.2em] text-sm">
            Service Charge %
          </div>

          <input
            type="number"
            value={
              settings.service_charge_percent
            }
            onChange={e =>
              setSettings(prev => ({
                ...prev,
                service_charge_percent:
                  Number(
                    e.target.value
                  ),
              }))
            }
            className="w-full h-16 rounded-2xl bg-black border border-white/10 px-6 text-2xl"
          />

        </div>

        <button
          onClick={saveSettings}
          disabled={saving}
          className="w-full h-16 rounded-3xl bg-emerald-500 text-black text-xl font-semibold"
        >

          {
            saving
              ? "Saving..."
              : "Save POS Settings"
          }

        </button>

      </div>

    </div>

  );

}
