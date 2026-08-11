"use client";

import { useEffect, useState } from "react";

import {
  useOrganizationRuntime,
} from "@/lib/hooks/useOrganizationRuntime";

export default function MarketingSettingsPage() {
  const { organization } = useOrganizationRuntime();
  const organizationId = organization?.id || null;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({
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
    if (!organizationId) {
      setLoading(false);
      return;
    }

    loadSettings();
  }, [organizationId]);

  async function loadSettings() {
    try {
      setLoading(true);

      const response = await fetch(
        "/api/settings/marketing/load",
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

      const data = await response.json();

      if (!response.ok || !data?.success) {
        throw new Error(
          data?.error || "Unable to load marketing settings"
        );
      }

      if (data?.settings) {
        setSettings((previous) => ({
          ...previous,
          ...data.settings,
        }));
      }
    } catch (error) {
      console.error("LOAD_MARKETING_SETTINGS_ERROR", error);
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings() {
    try {
      if (!organizationId) {
        throw new Error("Organization required");
      }

      setSaving(true);

      const response = await fetch(
        "/api/settings/marketing/save",
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

      const data = await response.json();

      if (!response.ok || !data?.success) {
        throw new Error(
          data?.error || "Unable to save marketing settings"
        );
      }

      alert("Marketing settings saved");
    } catch (error) {
      console.error("SAVE_MARKETING_SETTINGS_ERROR", error);
      alert(error?.message || "Unable to save marketing settings");
    } finally {
      setSaving(false);
    }
  }

  function updateField(field, value) {
    setSettings((previous) => ({
      ...previous,
      [field]: value,
    }));
  }

  if (loading) {
    return (
      <div className="p-8 text-white">
        Loading...
      </div>
    );
  }

  if (!organizationId) {
    return (
      <div className="p-8 text-white">
        Select an organization to manage Marketing Brand DNA.
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
          ["brand_name", "Brand Name"],
          ["industry", "Industry"],
          ["brand_voice", "Brand Voice"],
          ["brand_tone", "Brand Tone"],
          ["writing_style", "Writing Style"],
          ["primary_audience", "Primary Audience"],
          ["secondary_audience", "Secondary Audience"],
          ["age_range", "Age Range"],
          ["primary_color", "Primary Color"],
          ["secondary_color", "Secondary Color"],
          ["accent_color", "Accent Color"],
          ["campaign_goal", "Campaign Goal"],
          ["preferred_cta", "Preferred CTA"],
          ["preferred_offer_style", "Preferred Offer Style"],
        ].map(([field, label]) => (
          <div key={field}>
            <label className="block text-sm text-white/60 mb-2">
              {label}
            </label>

            <input
              value={settings[field] || ""}
              onChange={(event) =>
                updateField(field, event.target.value)
              }
              className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3"
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
          value={settings.business_description || ""}
          onChange={(event) =>
            updateField("business_description", event.target.value)
          }
          className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3"
        />
      </div>

      <button
        onClick={saveSettings}
        disabled={saving}
        className="mt-8 px-6 py-3 rounded-xl bg-orange-500 text-white disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save Marketing DNA"}
      </button>
    </div>
  );
}
