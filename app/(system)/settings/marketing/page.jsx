"use client";

import { useEffect, useState } from "react";

import { useTenant }
from "@/app/providers/TenantProvider";

import {
  useOrganizationRuntime,
} from "@/lib/hooks/useOrganizationRuntime";

export default function MarketingSettingsPage() {

  const tenant =
    useTenant();

  const {
    organization,
  } =
    useOrganizationRuntime();

  const tenantId =
    organization?.tenant_id ||
    tenant?.id;

  const organizationId =
    organization?.id;

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [settings, setSettings] =
    useState({

      brand_name: "",

      industry: "",

      business_description: "",

      brand_voice: "",

      brand_tone: "",

      writing_style: "",

      primary_audience: "",

      secondary_audience: "",

      age_range: "",

      primary_color: "",

      secondary_color: "",

      accent_color: "",

      campaign_goal: "",

      preferred_cta: "",

      preferred_offer_style: "",

    });

  useEffect(() => {

    if (
      !tenantId ||
      !organizationId
    ) {
      return;
    }

    loadSettings();

  }, [
    tenantId,
    organizationId,
  ]);

  async function loadSettings() {

    try {

      const response =
        await fetch(
          "/api/settings/marketing/load",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              tenantId,
              organizationId,
            }),
          }
        );

      const data =
        await response.json();

      if (
        data?.settings
      ) {

        setSettings(
          prev => ({
            ...prev,
            ...data.settings,
          })
        );

      }

    } finally {

      setLoading(false);

    }

  }

  async function saveSettings() {

    try {

      setSaving(true);

      await fetch(
        "/api/settings/marketing/save",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({

            tenantId,

            organizationId,

            settings,

          }),
        }
      );

      alert(
        "Marketing settings saved"
      );

    } finally {

      setSaving(false);

    }

  }

  function updateField(
    field,
    value
  ) {

    setSettings(
      prev => ({
        ...prev,
        [field]: value,
      })
    );

  }

  if (loading) {

    return (
      <div className="p-8 text-white">
        Loading...
      </div>
    );

  }

  return (

    <div className="p-8 text-white max-w-5xl">

      <h1 className="text-3xl font-semibold mb-8">
        Marketing Brand DNA
      </h1>

      <div className="grid grid-cols-2 gap-4">

        {[
          ["brand_name","Brand Name"],
          ["industry","Industry"],
          ["brand_voice","Brand Voice"],
          ["brand_tone","Brand Tone"],
          ["writing_style","Writing Style"],
          ["primary_audience","Primary Audience"],
          ["secondary_audience","Secondary Audience"],
          ["age_range","Age Range"],
          ["primary_color","Primary Color"],
          ["secondary_color","Secondary Color"],
          ["accent_color","Accent Color"],
          ["campaign_goal","Campaign Goal"],
          ["preferred_cta","Preferred CTA"],
          ["preferred_offer_style","Preferred Offer Style"],
        ].map(([field,label]) => (

          <div key={field}>

            <label className="block text-sm text-white/60 mb-2">
              {label}
            </label>

            <input
              value={
                settings[field] || ""
              }
              onChange={(e) =>
                updateField(
                  field,
                  e.target.value
                )
              }
              className="
                w-full
                bg-black/30
                border
                border-white/10
                rounded-xl
                px-4
                py-3
              "
            />

          </div>

        ))}

      </div>

      <div className="mt-6">

        <label className="block text-sm text-white/60 mb-2">
          Business Description
        </label>

        <textarea
          rows={6}
          value={
            settings.business_description || ""
          }
          onChange={(e) =>
            updateField(
              "business_description",
              e.target.value
            )
          }
          className="
            w-full
            bg-black/30
            border
            border-white/10
            rounded-xl
            px-4
            py-3
          "
        />

      </div>

      <button
        onClick={saveSettings}
        disabled={saving}
        className="
          mt-8
          px-6
          py-3
          rounded-xl
          bg-orange-500
          text-white
        "
      >
        {saving
          ? "Saving..."
          : "Save Marketing DNA"}
      </button>

    </div>

  );

}
