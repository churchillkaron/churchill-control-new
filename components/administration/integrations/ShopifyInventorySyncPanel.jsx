"use client";

import { useEffect, useMemo, useState } from "react";

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

export default function ShopifyInventorySyncPanel({ organizationId }) {
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/administration/integrations/shopify/inventory?organizationId=${encodeURIComponent(organizationId)}`,
        { cache: "no-store" },
      );
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Unable to load Shopify inventory settings");
      }
      setSnapshot(data);
    } catch (loadError) {
      setError(loadError.message || "Unable to load Shopify inventory settings");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [organizationId]);

  async function configure(location, patch) {
    const metadata = location || {};
    const warehouseId = patch.warehouseId ?? metadata.inventory_warehouse_id ?? "";
    const availableLocations = (snapshot?.inventoryLocations || []).filter(
      (row) => row.warehouse_id === warehouseId,
    );
    let locationId = patch.locationId ?? metadata.inventory_location_id ?? "";
    if (patch.warehouseId !== undefined && !availableLocations.some((row) => row.id === locationId)) {
      locationId = "";
    }
    const syncMode = patch.syncMode ?? metadata.inventory_sync_mode ?? "OBSERVE_ONLY";

    setSaving(location.id);
    setError("");
    try {
      const response = await fetch("/api/administration/integrations/shopify/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          action: "configure-location",
          assetId: location.id,
          warehouseId,
          locationId,
          syncMode,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Unable to update Shopify inventory settings");
      }
      setSnapshot(data);
    } catch (saveError) {
      setError(saveError.message || "Unable to update Shopify inventory settings");
    } finally {
      setSaving("");
    }
  }

  const locationsByWarehouse = useMemo(() => {
    const map = new Map();
    for (const location of snapshot?.inventoryLocations || []) {
      if (!map.has(location.warehouse_id)) map.set(location.warehouse_id, []);
      map.get(location.warehouse_id).push(location);
    }
    return map;
  }, [snapshot?.inventoryLocations]);

  const sync = snapshot?.inventorySync || {};
  const connected = Boolean(snapshot?.connection);

  return (
    <section className="bg-black px-5 pb-10 text-white lg:px-10">
      <div className="mx-auto max-w-6xl rounded-[30px] border border-white/10 bg-white/[0.025] p-6 lg:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.22em] text-white/30">Inventory synchronization</div>
            <h2 className="mt-2 text-2xl font-light">Shopify locations → Avantiqo stock</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/40">
              Observe only is the safe default. When Shopify controls Avantiqo stock, every external quantity change becomes a governed Inventory adjustment through the canonical stock ledger. Avantiqo does not write stock back to Shopify.
            </p>
          </div>
          {connected && !loading ? (
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2">
                <div className="text-white/30">Applied</div>
                <div className="mt-1 text-base text-white/80">{sync.applied || 0}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2">
                <div className="text-white/30">Pending</div>
                <div className="mt-1 text-base text-white/80">{(sync.pending || 0) + (sync.retrying || 0)}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2">
                <div className="text-white/30">Failed</div>
                <div className="mt-1 text-base text-white/80">{sync.failed || 0}</div>
              </div>
            </div>
          ) : null}
        </div>

        {error ? (
          <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="mt-6 text-sm text-white/35">Loading inventory synchronization…</div>
        ) : !connected ? (
          <div className="mt-6 rounded-2xl border border-white/10 bg-black/30 p-5 text-sm text-white/40">
            Connect Shopify first. Location and stock synchronization controls appear after Shopify discovery.
          </div>
        ) : !(snapshot?.shopifyLocations || []).length ? (
          <div className="mt-6 rounded-2xl border border-white/10 bg-black/30 p-5 text-sm text-white/40">
            Shopify locations will appear here after the recovery sync or the first location webhook.
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {(snapshot?.shopifyLocations || []).map((shopifyLocation) => {
              const warehouseLocations = locationsByWarehouse.get(shopifyLocation.inventory_warehouse_id) || [];
              const mapped = Boolean(shopifyLocation.inventory_warehouse_id && shopifyLocation.inventory_location_id);
              return (
                <div key={shopifyLocation.id} className="rounded-2xl border border-white/10 bg-black/30 p-4 lg:p-5">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                    <div className="min-w-0 xl:w-64">
                      <div className="text-sm font-medium text-white/85">{shopifyLocation.name}</div>
                      <div className="mt-1 text-xs text-white/30">
                        {shopifyLocation.inventory_sync_mode === "SHOPIFY_TO_AVANTIQO" ? "Stock sync enabled" : "Observe only"}
                      </div>
                    </div>

                    <div className="grid flex-1 gap-3 md:grid-cols-3">
                      <label className="block">
                        <span className="text-[11px] uppercase tracking-[0.14em] text-white/30">Warehouse</span>
                        <select
                          value={shopifyLocation.inventory_warehouse_id || ""}
                          disabled={saving === shopifyLocation.id}
                          onChange={(event) => configure(shopifyLocation, { warehouseId: event.target.value, locationId: "", syncMode: "OBSERVE_ONLY" })}
                          className="mt-2 w-full rounded-xl border border-white/10 bg-black px-3 py-2.5 text-sm text-white outline-none"
                        >
                          <option value="">Select warehouse</option>
                          {(snapshot?.warehouses || []).map((warehouse) => (
                            <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>
                          ))}
                        </select>
                      </label>

                      <label className="block">
                        <span className="text-[11px] uppercase tracking-[0.14em] text-white/30">Inventory location</span>
                        <select
                          value={shopifyLocation.inventory_location_id || ""}
                          disabled={!shopifyLocation.inventory_warehouse_id || saving === shopifyLocation.id}
                          onChange={(event) => configure(shopifyLocation, { locationId: event.target.value, syncMode: "OBSERVE_ONLY" })}
                          className="mt-2 w-full rounded-xl border border-white/10 bg-black px-3 py-2.5 text-sm text-white outline-none disabled:opacity-40"
                        >
                          <option value="">Select location</option>
                          {warehouseLocations.map((location) => (
                            <option key={location.id} value={location.id}>{location.name}</option>
                          ))}
                        </select>
                      </label>

                      <label className="block">
                        <span className="text-[11px] uppercase tracking-[0.14em] text-white/30">Stock authority</span>
                        <select
                          value={shopifyLocation.inventory_sync_mode || "OBSERVE_ONLY"}
                          disabled={!mapped || !snapshot?.store?.entity_id || saving === shopifyLocation.id}
                          onChange={(event) => configure(shopifyLocation, { syncMode: event.target.value })}
                          className="mt-2 w-full rounded-xl border border-white/10 bg-black px-3 py-2.5 text-sm text-white outline-none disabled:opacity-40"
                        >
                          <option value="OBSERVE_ONLY">Observe only</option>
                          <option value="SHOPIFY_TO_AVANTIQO">Shopify controls Avantiqo stock</option>
                        </select>
                      </label>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {connected && !loading ? (
          <div className="mt-5 text-xs leading-5 text-white/25">
            Latest stock observation: {formatDate(sync?.latest?.created_at)} · Enabled locations: {sync.enabled_locations || 0}. Quantity reconciliation uses explicit variant and location mappings only; no SKU/name guessing is performed.
          </div>
        ) : null}
      </div>
    </section>
  );
}
