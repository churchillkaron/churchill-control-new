"use client";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/shared/supabase/client";

import PageWrapper from "@/components/PageWrapper";

export default function SettingsPage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    settings,
    setSettings,
  ] = useState({

    restaurant_name:
      "Churchill",

    service_charge: 5,

    vat_percent: 7,

    currency: "THB",

    timezone:
      "Asia/Bangkok",
  });

  // ===== LOAD =====
  async function loadSettings() {

    if (!tenantId) {
      return;
    }

    const {
      data,
      error,
    } = await supabase
      .from(
        "restaurant_settings"
      )
      .select("*")
      .eq(
        "tenant_id",
        tenantId
      )
      .single();

    if (data) {

      setSettings({

        restaurant_name:
          data.restaurant_name ||
          "Churchill",

        service_charge:
          data.service_charge || 5,

        vat_percent:
          data.vat_percent || 7,

        currency:
          data.currency ||
          "THB",

        timezone:
          data.timezone ||
          "Asia/Bangkok",
      });
    }

    if (error) {

      console.error(
        error
      );
    }

    setLoading(false);
  }

  // ===== SAVE =====
  async function saveSettings() {

    try {

      setSaving(true);

      const payload = {

        tenant_id:
          tenantId,

        restaurant_name:
          settings.restaurant_name,

        service_charge:
          Number(
            settings.service_charge
          ),

        vat_percent:
          Number(
            settings.vat_percent
          ),

        currency:
          settings.currency,

        timezone:
          settings.timezone,
      };

      const {
        error,
      } = await supabase
        .from(
          "restaurant_settings"
        )
        .upsert(
          payload,
          {
            onConflict:
              "tenant_id",
          }
        );

      if (error) {

        console.error(
          error
        );

        alert(
          "Failed to save settings"
        );

        return;
      }

      alert(
        "Settings saved"
      );

    } catch (error) {

      console.error(
        error
      );

    } finally {

      setSaving(false);
    }
  }

  // ===== INIT =====
  useEffect(() => {

    async function init() {

      const {
        data: { user },
      } =
        await supabase.auth.getUser();

      if (!user) {
        return;
      }

      const {
        data,
      } = await supabase
        .from(
          "staff_accounts"
        )
        .select(
          "tenant_id"
        )
        .eq(
          "auth_user_id",
          user.id
        )
        .single();

      if (
        !data?.tenant_id
      ) {
        return;
      }

      setTenantId(
        data.tenant_id
      );
    }

    init();

  }, []);

  // ===== LOAD =====
  useEffect(() => {

    if (!tenantId) {
      return;
    }

    loadSettings();

  }, [tenantId]);

  return (
    <div className="min-h-screen bg-[#050507]">

      <PageWrapper
        title="Settings"
        subtitle="Operational configuration"
      >

        {loading ? (

          <div className="text-white/40">
            Loading settings...
          </div>

        ) : (

          <div className="max-w-3xl space-y-6">

            <div className="rounded-[28px] border border-white/10 bg-[#111117] p-8">

              <div className="grid grid-cols-2 gap-5">

                <div>

                  <div className="mb-2 text-sm text-white/50">
                    Restaurant Name
                  </div>

                  <input
                    value={
                      settings.restaurant_name
                    }
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        restaurant_name:
                          e.target.value,
                      })
                    }
                    className="w-full rounded-[18px] border border-white/10 bg-black/20 px-5 py-4 text-white outline-none"
                  />

                </div>

                <div>

                  <div className="mb-2 text-sm text-white/50">
                    Currency
                  </div>

                  <input
                    value={
                      settings.currency
                    }
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        currency:
                          e.target.value,
                      })
                    }
                    className="w-full rounded-[18px] border border-white/10 bg-black/20 px-5 py-4 text-white outline-none"
                  />

                </div>

                <div>

                  <div className="mb-2 text-sm text-white/50">
                    Service Charge %
                  </div>

                  <input
                    type="number"
                    value={
                      settings.service_charge
                    }
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        service_charge:
                          e.target.value,
                      })
                    }
                    className="w-full rounded-[18px] border border-white/10 bg-black/20 px-5 py-4 text-white outline-none"
                  />

                </div>

                <div>

                  <div className="mb-2 text-sm text-white/50">
                    VAT %
                  </div>

                  <input
                    type="number"
                    value={
                      settings.vat_percent
                    }
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        vat_percent:
                          e.target.value,
                      })
                    }
                    className="w-full rounded-[18px] border border-white/10 bg-black/20 px-5 py-4 text-white outline-none"
                  />

                </div>

                <div className="col-span-2">

                  <div className="mb-2 text-sm text-white/50">
                    Timezone
                  </div>

                  <input
                    value={
                      settings.timezone
                    }
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        timezone:
                          e.target.value,
                      })
                    }
                    className="w-full rounded-[18px] border border-white/10 bg-black/20 px-5 py-4 text-white outline-none"
                  />

                </div>

              </div>

              <button
                onClick={
                  saveSettings
                }
                disabled={saving}
                className="mt-8 rounded-[18px] bg-[#8B5CF6] px-8 py-4 text-white transition hover:bg-[#9D6BFF] disabled:opacity-40"
              >
                {saving
                  ? "SAVING..."
                  : "SAVE SETTINGS"}
              </button>

            </div>

          </div>

        )}

      </PageWrapper>

    </div>
  );
}
