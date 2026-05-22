"use client";

import { useEffect, useState } from "react";

export default function PayrollSettingsPage() {

  const [settings, setSettings] =
    useState({

      country: "Thailand",

      currency: "THB",

      tax_rate: 3,

      social_security_rate: 5,

      max_social_security: 750,

      payroll_frequency: "MONTHLY",

      overtime_multiplier: 1.5,

      standard_work_hours: 8,

      pension_rate: 0,

      payroll_approval_required: true,

      payroll_auto_lock: true,

      allow_manual_adjustments: false,

    });

  async function loadSettings() {

    try {

      const response =
        await fetch(
          "/api/settings/payroll/load",
          {
            method: "POST",
          }
        );

      const data =
        await response.json();

      if (
        data?.success &&
        data?.settings
      ) {

        setSettings(
          prev => ({
            ...prev,
            ...data.settings,
          })
        );

      }

    } catch (error) {

      console.error(
        "LOAD PAYROLL SETTINGS ERROR",
        error
      );

    }

  }

  async function saveSettings() {

    try {

      await fetch(
        "/api/settings/payroll/save",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body:
            JSON.stringify(
              settings
            ),
        }
      );

      alert(
        "Payroll settings saved"
      );

    } catch (error) {

      console.error(
        "SAVE PAYROLL SETTINGS ERROR",
        error
      );

    }

  }

  useEffect(() => {

    loadSettings();

  }, []);

  return (

    <div className="p-6 text-white">

      <h1 className="text-3xl font-bold mb-6">
        Payroll Configuration
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        <input
          className="bg-black/30 border border-white/10 p-3 rounded"
          placeholder="Country"
          value={settings.country}
          onChange={(e) =>
            setSettings({
              ...settings,
              country:
                e.target.value,
            })
          }
        />

        <input
          className="bg-black/30 border border-white/10 p-3 rounded"
          placeholder="Currency"
          value={settings.currency}
          onChange={(e) =>
            setSettings({
              ...settings,
              currency:
                e.target.value,
            })
          }
        />

        <input
          type="number"
          className="bg-black/30 border border-white/10 p-3 rounded"
          placeholder="Tax Rate"
          value={settings.tax_rate}
          onChange={(e) =>
            setSettings({
              ...settings,
              tax_rate:
                Number(e.target.value),
            })
          }
        />

        <input
          type="number"
          className="bg-black/30 border border-white/10 p-3 rounded"
          placeholder="Social Security %"
          value={settings.social_security_rate}
          onChange={(e) =>
            setSettings({
              ...settings,
              social_security_rate:
                Number(e.target.value),
            })
          }
        />

        <input
          type="number"
          className="bg-black/30 border border-white/10 p-3 rounded"
          placeholder="Max Social Security"
          value={settings.max_social_security}
          onChange={(e) =>
            setSettings({
              ...settings,
              max_social_security:
                Number(e.target.value),
            })
          }
        />

        <input
          type="number"
          className="bg-black/30 border border-white/10 p-3 rounded"
          placeholder="Overtime Multiplier"
          value={
            settings.overtime_multiplier
          }
          onChange={(e) =>
            setSettings({
              ...settings,
              overtime_multiplier:
                Number(e.target.value),
            })
          }
        />

      </div>

      <button
        onClick={saveSettings}
        className="mt-6 px-6 py-3 rounded bg-blue-600"
      >
        Save Payroll Settings
      </button>

    </div>

  );

}
