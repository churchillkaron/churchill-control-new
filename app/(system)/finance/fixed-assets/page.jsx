"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/shared/supabase/client";

export default function FixedAssetsPage() {
  const [assets, setAssets] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [legalEntities, setLegalEntities] = useState([]);
  const [costCenters, setCostCenters] = useState([]);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    asset_name: "",
    asset_category: "",
    purchase_date: "",
    purchase_cost: "",
    useful_life_years: 5,
    salvage_value: 0,
    depreciation_method: "straight_line",
    vendor_id: "",
    legal_entity_id: "",
    cost_center_id: "",
    notes: "",
  });

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);

    const { data: assetData } = await supabase
      .from("fixed_assets")
      .select(`
        *,
        vendors (
          id,
          legal_name
        ),
        legal_entities (
          id,
          legal_name,
          code
        ),
        cost_centers (
          id,
          name,
          code
        )
      `)
      .order("created_at", { ascending: false });

    const { data: vendorData } = await supabase
      .from("vendors")
      .select("*")
      .eq("is_active", true)
      .order("legal_name");

    const { data: entityData } = await supabase
      .from("legal_entities")
      .select("*")
      .eq("is_active", true)
      .order("legal_name");

    const { data: costCenterData } = await supabase
      .from("cost_centers")
      .select("*")
      .eq("is_active", true)
      .order("code");

    setAssets(assetData || []);
    setVendors(vendorData || []);
    setLegalEntities(entityData || []);
    setCostCenters(costCenterData || []);
    setLoading(false);
  }

  async function createAsset() {
    if (!form.asset_name) {
      alert("Asset name required");
      return;
    }

    const purchaseCost = Number(form.purchase_cost || 0);
    const salvageValue = Number(form.salvage_value || 0);

    const assetCode = `FA-${Date.now()}`;

    const { error } = await supabase.from("fixed_assets").insert([
      {
        asset_code: assetCode,
        asset_name: form.asset_name,
        asset_category: form.asset_category,
        purchase_date: form.purchase_date || null,
        purchase_cost: purchaseCost,
        useful_life_years: Number(form.useful_life_years || 5),
        salvage_value: salvageValue,
        depreciation_method: form.depreciation_method,
        accumulated_depreciation: 0,
        current_book_value: purchaseCost,
        status: "active",
        vendor_id: form.vendor_id || null,
        legal_entity_id: form.legal_entity_id || null,
        cost_center_id: form.cost_center_id || null,
        notes: form.notes,
      },
    ]);

    if (error) {
      console.error(error);
      alert(error.message);
      return;
    }

    setForm({
      asset_name: "",
      asset_category: "",
      purchase_date: "",
      purchase_cost: "",
      useful_life_years: 5,
      salvage_value: 0,
      depreciation_method: "straight_line",
      vendor_id: "",
      legal_entity_id: "",
      cost_center_id: "",
      notes: "",
    });

    await fetchData();
  }

  const totals = useMemo(() => {
    const purchaseCost = assets.reduce(
      (sum, asset) => sum + Number(asset.purchase_cost || 0),
      0
    );

    const accumulatedDepreciation = assets.reduce(
      (sum, asset) => sum + Number(asset.accumulated_depreciation || 0),
      0
    );

    const bookValue = assets.reduce(
      (sum, asset) => sum + Number(asset.current_book_value || 0),
      0
    );

    return {
      purchaseCost,
      accumulatedDepreciation,
      bookValue,
    };
  }, [assets]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white p-10">
        Loading fixed assets...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-10">
      <div className="mb-10">
        <h1 className="text-4xl font-bold">Fixed Assets</h1>
        <div className="text-white/50 mt-2">
          Enterprise asset registry and depreciation foundation
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-10">
        <SummaryCard title="Purchase Cost" value={totals.purchaseCost} />
        <SummaryCard
          title="Accumulated Depreciation"
          value={totals.accumulatedDepreciation}
        />
        <SummaryCard title="Book Value" value={totals.bookValue} highlight />
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-10">
        <h2 className="text-2xl mb-6">Create Fixed Asset</h2>

        <div className="grid grid-cols-3 gap-4">
          <input
            placeholder="Asset Name"
            value={form.asset_name}
            onChange={(e) =>
              setForm({
                ...form,
                asset_name: e.target.value,
              })
            }
            className="bg-black border border-white/10 rounded-xl px-4 py-3"
          />

          <input
            placeholder="Asset Category"
            value={form.asset_category}
            onChange={(e) =>
              setForm({
                ...form,
                asset_category: e.target.value,
              })
            }
            className="bg-black border border-white/10 rounded-xl px-4 py-3"
          />

          <input
            type="date"
            value={form.purchase_date}
            onChange={(e) =>
              setForm({
                ...form,
                purchase_date: e.target.value,
              })
            }
            className="bg-black border border-white/10 rounded-xl px-4 py-3"
          />

          <input
            type="number"
            placeholder="Purchase Cost"
            value={form.purchase_cost}
            onChange={(e) =>
              setForm({
                ...form,
                purchase_cost: e.target.value,
              })
            }
            className="bg-black border border-white/10 rounded-xl px-4 py-3"
          />

          <input
            type="number"
            placeholder="Useful Life Years"
            value={form.useful_life_years}
            onChange={(e) =>
              setForm({
                ...form,
                useful_life_years: e.target.value,
              })
            }
            className="bg-black border border-white/10 rounded-xl px-4 py-3"
          />

          <input
            type="number"
            placeholder="Salvage Value"
            value={form.salvage_value}
            onChange={(e) =>
              setForm({
                ...form,
                salvage_value: e.target.value,
              })
            }
            className="bg-black border border-white/10 rounded-xl px-4 py-3"
          />

          <select
            value={form.vendor_id}
            onChange={(e) =>
              setForm({
                ...form,
                vendor_id: e.target.value,
              })
            }
            className="bg-black border border-white/10 rounded-xl px-4 py-3"
          >
            <option value="">Vendor</option>
            {vendors.map((vendor) => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.legal_name}
              </option>
            ))}
          </select>

          <select
            value={form.legal_entity_id}
            onChange={(e) =>
              setForm({
                ...form,
                legal_entity_id: e.target.value,
              })
            }
            className="bg-black border border-white/10 rounded-xl px-4 py-3"
          >
            <option value="">Legal Entity</option>
            {legalEntities.map((entity) => (
              <option key={entity.id} value={entity.id}>
                {entity.code} — {entity.legal_name}
              </option>
            ))}
          </select>

          <select
            value={form.cost_center_id}
            onChange={(e) =>
              setForm({
                ...form,
                cost_center_id: e.target.value,
              })
            }
            className="bg-black border border-white/10 rounded-xl px-4 py-3"
          >
            <option value="">Cost Center</option>
            {costCenters.map((center) => (
              <option key={center.id} value={center.id}>
                {center.code} — {center.name}
              </option>
            ))}
          </select>
        </div>

        <textarea
          placeholder="Notes"
          value={form.notes}
          onChange={(e) =>
            setForm({
              ...form,
              notes: e.target.value,
            })
          }
          className="bg-black border border-white/10 rounded-xl px-4 py-3 w-full mt-4 min-h-[100px]"
        />

        <button
          onClick={createAsset}
          className="mt-6 bg-green-600 hover:bg-green-700 px-6 py-3 rounded-xl"
        >
          Create Asset
        </button>
      </div>

      <h2 className="text-2xl mb-6">Asset Register</h2>

      {assets.length === 0 && <Empty text="No fixed assets registered" />}

      {assets.map((asset) => (
        <div
          key={asset.id}
          className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-4"
        >
          <div className="flex justify-between items-start">
            <div>
              <div className="text-2xl font-semibold">{asset.asset_name}</div>
              <div className="text-white/40 mt-1">{asset.asset_code}</div>

              <div className="mt-4 space-y-1 text-white/70">
                <div>Category: {asset.asset_category || "-"}</div>
                <div>Vendor: {asset.vendors?.legal_name || "-"}</div>
                <div>
                  Entity: {asset.legal_entities?.code || "-"} —{" "}
                  {asset.legal_entities?.legal_name || "-"}
                </div>
                <div>
                  Cost Center: {asset.cost_centers?.code || "-"} —{" "}
                  {asset.cost_centers?.name || "-"}
                </div>
                <div>
                  Purchase Cost: ฿
                  {Number(asset.purchase_cost || 0).toLocaleString()}
                </div>
                <div>
                  Book Value: ฿
                  {Number(asset.current_book_value || 0).toLocaleString()}
                </div>
              </div>
            </div>

            <div className="px-4 py-2 rounded-full text-sm bg-green-600/20 text-green-300">
              {asset.status}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function SummaryCard({ title, value, highlight = false }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
      <div className="text-white/50 text-sm">{title}</div>
      <div
        className={`text-3xl font-bold mt-2 ${
          highlight ? "text-green-400" : "text-white"
        }`}
      >
        ฿{Number(value || 0).toLocaleString()}
      </div>
    </div>
  );
}

function Empty({ text }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-white/40">
      {text}
    </div>
  );
}