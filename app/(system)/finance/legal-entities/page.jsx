"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/shared/supabase/client";

export default function LegalEntitiesPage() {

  const [entities, setEntities] = useState([]);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    code: "",
    legal_name: "",
    display_name: "",
    tax_id: "",
    registration_number: "",
    country: "",
    currency: "THB",
    address: "",
    phone: "",
    email: "",
    is_holding_company: false,
  });

  useEffect(() => {
    fetchEntities();
  }, []);

  async function fetchEntities() {

    setLoading(true);

    const { data, error } =
      await supabase
        .from("legal_entities")
        .select("*")
        .order("created_at", {
          ascending: false,
        });

    if (error) {

      console.error(error);
      alert(error.message);

    }

    setEntities(data || []);

    setLoading(false);

  }

  async function createEntity() {

    if (
      !form.code ||
      !form.legal_name
    ) {

      alert(
        "Code and legal name required"
      );

      return;

    }

    const { error } =
      await supabase
        .from("legal_entities")
        .insert([{

          code:
            form.code,

          legal_name:
            form.legal_name,

          display_name:
            form.display_name,

          tax_id:
            form.tax_id,

          registration_number:
            form.registration_number,

          country:
            form.country,

          currency:
            form.currency,

          address:
            form.address,

          phone:
            form.phone,

          email:
            form.email,

          is_holding_company:
            form.is_holding_company,

          is_active:
            true,

        }]);

    if (error) {

      console.error(error);
      alert(error.message);

      return;

    }

    setForm({
      code: "",
      legal_name: "",
      display_name: "",
      tax_id: "",
      registration_number: "",
      country: "",
      currency: "THB",
      address: "",
      phone: "",
      email: "",
      is_holding_company: false,
    });

    await fetchEntities();

  }

  async function toggleEntity(entity) {

    const { error } =
      await supabase
        .from("legal_entities")
        .update({
          is_active:
            !entity.is_active,
          updated_at:
            new Date().toISOString(),
        })
        .eq("id", entity.id);

    if (error) {

      console.error(error);
      alert(error.message);

      return;

    }

    await fetchEntities();

  }

  if (loading) {

    return (
      <div className="min-h-screen bg-black text-white p-10">
        Loading legal entities...
      </div>
    );

  }

  return (

    <div className="min-h-screen bg-black text-white p-10">

      {/* HEADER */}
      <div className="mb-10">

        <h1 className="text-4xl font-bold">
          Legal Entities
        </h1>

        <div className="text-white/50 mt-2">
          Enterprise corporate structure management
        </div>

      </div>

      {/* CREATE */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-10">

        <h2 className="text-2xl mb-6">
          Create Legal Entity
        </h2>

        <div className="grid grid-cols-3 gap-4">

          <input
            placeholder="Code"
            value={form.code}
            onChange={(e) =>
              setForm({
                ...form,
                code:
                  e.target.value,
              })
            }
            className="bg-black border border-white/10 rounded-xl px-4 py-3"
          />

          <input
            placeholder="Legal Name"
            value={form.legal_name}
            onChange={(e) =>
              setForm({
                ...form,
                legal_name:
                  e.target.value,
              })
            }
            className="bg-black border border-white/10 rounded-xl px-4 py-3"
          />

          <input
            placeholder="Display Name"
            value={form.display_name}
            onChange={(e) =>
              setForm({
                ...form,
                display_name:
                  e.target.value,
              })
            }
            className="bg-black border border-white/10 rounded-xl px-4 py-3"
          />

          <input
            placeholder="Tax ID"
            value={form.tax_id}
            onChange={(e) =>
              setForm({
                ...form,
                tax_id:
                  e.target.value,
              })
            }
            className="bg-black border border-white/10 rounded-xl px-4 py-3"
          />

          <input
            placeholder="Registration Number"
            value={form.registration_number}
            onChange={(e) =>
              setForm({
                ...form,
                registration_number:
                  e.target.value,
              })
            }
            className="bg-black border border-white/10 rounded-xl px-4 py-3"
          />

          <input
            placeholder="Country"
            value={form.country}
            onChange={(e) =>
              setForm({
                ...form,
                country:
                  e.target.value,
              })
            }
            className="bg-black border border-white/10 rounded-xl px-4 py-3"
          />

          <input
            placeholder="Currency"
            value={form.currency}
            onChange={(e) =>
              setForm({
                ...form,
                currency:
                  e.target.value,
              })
            }
            className="bg-black border border-white/10 rounded-xl px-4 py-3"
          />

          <input
            placeholder="Phone"
            value={form.phone}
            onChange={(e) =>
              setForm({
                ...form,
                phone:
                  e.target.value,
              })
            }
            className="bg-black border border-white/10 rounded-xl px-4 py-3"
          />

          <input
            placeholder="Email"
            value={form.email}
            onChange={(e) =>
              setForm({
                ...form,
                email:
                  e.target.value,
              })
            }
            className="bg-black border border-white/10 rounded-xl px-4 py-3"
          />

        </div>

        <textarea
          placeholder="Address"
          value={form.address}
          onChange={(e) =>
            setForm({
              ...form,
              address:
                e.target.value,
            })
          }
          className="bg-black border border-white/10 rounded-xl px-4 py-3 w-full mt-4 min-h-[100px]"
        />

        <div className="flex items-center gap-3 mt-4">

          <input
            type="checkbox"
            checked={
              form.is_holding_company
            }
            onChange={(e) =>
              setForm({
                ...form,
                is_holding_company:
                  e.target.checked,
              })
            }
          />

          <div className="text-white/70">
            Holding Company
          </div>

        </div>

        <button
          onClick={createEntity}
          className="mt-6 bg-green-600 hover:bg-green-700 px-6 py-3 rounded-xl"
        >
          Create Entity
        </button>

      </div>

      {/* ENTITIES */}
      <div>

        <h2 className="text-2xl mb-6">
          Registered Legal Entities
        </h2>

        {entities.length === 0 && (

          <Empty text="No legal entities created" />

        )}

        {entities.map((entity) => (

          <div
            key={entity.id}
            className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-4"
          >

            <div className="flex justify-between items-start">

              <div>

                <div className="text-2xl font-semibold">
                  {entity.legal_name}
                </div>

                <div className="text-white/40 mt-1">
                  {entity.code}
                </div>

                <div className="mt-4 space-y-1 text-white/70">

                  <div>
                    Tax ID:
                    {" "}
                    {entity.tax_id || "-"}
                  </div>

                  <div>
                    Registration:
                    {" "}
                    {entity.registration_number || "-"}
                  </div>

                  <div>
                    Country:
                    {" "}
                    {entity.country || "-"}
                  </div>

                  <div>
                    Currency:
                    {" "}
                    {entity.currency || "-"}
                  </div>

                </div>

              </div>

              <div className="flex flex-col items-end">

                <div
                  className={`px-4 py-2 rounded-full text-sm ${
                    entity.is_active
                      ? "bg-green-600/20 text-green-300"
                      : "bg-red-600/20 text-red-300"
                  }`}
                >

                  {entity.is_active
                    ? "ACTIVE"
                    : "INACTIVE"}

                </div>

                {entity.is_holding_company && (

                  <div className="mt-3 px-4 py-2 rounded-full text-sm bg-blue-600/20 text-blue-300">

                    HOLDING

                  </div>

                )}

                <button
                  onClick={() =>
                    toggleEntity(entity)
                  }
                  className="mt-4 bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl"
                >
                  Toggle Status
                </button>

              </div>

            </div>

          </div>

        ))}

      </div>

    </div>

  );

}

function Empty({
  text,
}) {

  return (

    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-white/40">
      {text}
    </div>

  );

}