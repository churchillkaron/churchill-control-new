"use client";

import {
  useEffect,
  useState,
} from "react";

import { supabase }
from "@/lib/shared/supabase/client";

import {
  useTenant,
} from "@/app/providers/TenantProvider";



export default function ServiceChargeSettingsPage() {

  const tenant =
    useTenant();

  const tenantId =
    tenant?.id;


  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    form,
    setForm,
  ] = useState({

    payout_model:
      "EQUAL",

    service_charge_percentage:
      5,

    foh_percentage:
      50,

    bar_percentage:
      30,

    kitchen_percentage:
      20,

    performance_enabled:
      true,

    void_penalty_enabled:
      true,

  });

  async function loadPolicy() {

    const {
      data,
    } = await supabase

      .from(
        "tenant_payout_policies"
      )

      .select("*")

      .eq(
        "tenant_id",
        tenantId
      )

      .limit(1)

      .single();

    if (data) {

      setForm(data);

    }

    setLoading(false);

  }

  async function savePolicy() {

    setLoading(true);

    await supabase

      .from(
        "tenant_payout_policies"
      )

      .upsert({

        tenant_id:
          tenantId,

        ...form,

      });

    alert(
      "Policy saved"
    );

    setLoading(false);

  }

  useEffect(() => {

    loadPolicy();

  }, []);

  if (loading) {

    return (

      <div className="min-h-screen bg-black p-10 text-white">

        Loading...

      </div>

    );

  }

  return (

    <div className="min-h-screen bg-black p-10 text-white">

      <div className="mx-auto max-w-5xl">

        <div className="mb-10">

          <div className="text-6xl font-bold">

            Service Charge Runtime

          </div>

          <div className="mt-3 text-zinc-500">

            Multi-tenant payout governance engine

          </div>

        </div>

        <div className="space-y-8 rounded-3xl border border-zinc-800 bg-zinc-950 p-8">

          <Field
            label="Payout Model"
          >

            <select
              value={
                form.payout_model
              }
              onChange={e =>
                setForm({
                  ...form,
                  payout_model:
                    e.target.value,
                })
              }
              className="w-full rounded-2xl border border-zinc-700 bg-black p-4"
            >

              <option value="EQUAL">
                Equal Split
              </option>

              <option value="DEPARTMENT">
                Department Split
              </option>

            </select>

          </Field>

          <Field
            label="Service Charge %"
          >

            <input
              type="number"
              value={
                form.service_charge_percentage
              }
              onChange={e =>
                setForm({
                  ...form,
                  service_charge_percentage:
                    e.target.value,
                })
              }
              className="w-full rounded-2xl border border-zinc-700 bg-black p-4"
            />

          </Field>

          <div className="grid grid-cols-3 gap-6">

            <Field label="FOH %">

              <input
                type="number"
                value={
                  form.foh_percentage
                }
                onChange={e =>
                  setForm({
                    ...form,
                    foh_percentage:
                      e.target.value,
                  })
                }
                className="w-full rounded-2xl border border-zinc-700 bg-black p-4"
              />

            </Field>

            <Field label="BAR %">

              <input
                type="number"
                value={
                  form.bar_percentage
                }
                onChange={e =>
                  setForm({
                    ...form,
                    bar_percentage:
                      e.target.value,
                  })
                }
                className="w-full rounded-2xl border border-zinc-700 bg-black p-4"
              />

            </Field>

            <Field label="KITCHEN %">

              <input
                type="number"
                value={
                  form.kitchen_percentage
                }
                onChange={e =>
                  setForm({
                    ...form,
                    kitchen_percentage:
                      e.target.value,
                  })
                }
                className="w-full rounded-2xl border border-zinc-700 bg-black p-4"
              />

            </Field>

          </div>

          <div className="grid grid-cols-2 gap-6">

            <Toggle
              label="Performance Enabled"
              checked={
                form.performance_enabled
              }
              onChange={() =>
                setForm({
                  ...form,
                  performance_enabled:
                    !form.performance_enabled,
                })
              }
            />

            <Toggle
              label="Void Penalty Enabled"
              checked={
                form.void_penalty_enabled
              }
              onChange={() =>
                setForm({
                  ...form,
                  void_penalty_enabled:
                    !form.void_penalty_enabled,
                })
              }
            />

          </div>

          <button
            onClick={savePolicy}
            className="rounded-2xl bg-emerald-500 px-8 py-4 text-lg font-semibold text-black"
          >

            SAVE POLICY

          </button>

        </div>

      </div>

    </div>

  );

}

function Field({
  label,
  children,
}) {

  return (

    <div>

      <div className="mb-3 text-sm uppercase tracking-[0.2em] text-zinc-500">

        {label}

      </div>

      {children}

    </div>

  );

}

function Toggle({
  label,
  checked,
  onChange,
}) {

  return (

    <button
      onClick={onChange}
      className={`rounded-2xl border p-5 text-left ${
        checked
          ? "border-emerald-500 bg-emerald-500/10"
          : "border-zinc-700 bg-black"
      }`}
    >

      <div className="text-lg font-semibold">

        {label}

      </div>

      <div className="mt-2 text-sm text-zinc-500">

        {checked
          ? "Enabled"
          : "Disabled"}

      </div>

    </button>

  );

}
