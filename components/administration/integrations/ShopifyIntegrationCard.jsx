"use client";

import { useEffect, useMemo, useState } from "react";

function text(value) {
  return String(value ?? "").trim();
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function entityLabel(entity) {
  return entity?.display_name || entity?.legal_name || entity?.code || "Unnamed entity";
}

function healthClass(state) {
  if (state === "READY") return "border-emerald-400/20 bg-emerald-400/10 text-emerald-200";
  if (state === "ACTION_REQUIRED" || state === "ATTENTION") {
    return "border-amber-400/20 bg-amber-400/10 text-amber-100";
  }
  if (state === "SYNCING") return "border-sky-400/20 bg-sky-400/10 text-sky-100";
  return "border-white/10 bg-white/[0.04] text-white/60";
}

export default function ShopifyIntegrationCard({ organizationId }) {
  const [shop, setShop] = useState("");
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  const normalized = shop
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/administration/integrations/shopify?organizationId=${encodeURIComponent(organizationId)}`,
        { cache: "no-store" },
      );
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Unable to load Shopify integration");
      }
      setSnapshot(data);
    } catch (loadError) {
      setError(loadError.message || "Unable to load Shopify integration");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [organizationId]);

  function connect() {
    if (!normalized) return;
    window.location.href = `/api/shopify/auth?organizationId=${encodeURIComponent(organizationId)}&shop=${encodeURIComponent(normalized)}`;
  }

  async function post(body, key) {
    setSaving(key);
    setError("");
    try {
      const response = await fetch("/api/administration/integrations/shopify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, ...body }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Unable to update Shopify integration");
      }
      setSnapshot(data);
    } catch (saveError) {
      setError(saveError.message || "Unable to update Shopify integration");
    } finally {
      setSaving("");
    }
  }

  const inventoryById = useMemo(
    () => new Map((snapshot?.inventoryItems || []).map((item) => [item.id, item])),
    [snapshot?.inventoryItems],
  );

  const variants = useMemo(() => {
    const value = query.trim().toLowerCase();
    const rows = snapshot?.variants || [];
    if (!value) return rows;
    return rows.filter((variant) =>
      [variant.name, variant.sku, variant.barcode, variant.external_id]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(value),
    );
  }, [snapshot?.variants, query]);

  const connection = snapshot?.connection;
  const store = snapshot?.store;
  const health = snapshot?.health || {};
  const projection = snapshot?.projection || {};
  const reconciliation = snapshot?.reconciliation || {};
  const mapping = snapshot?.mapping || {};

  return (
    <main className="min-h-screen bg-black p-5 text-white lg:p-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="rounded-[30px] border border-white/10 bg-white/[0.025] p-6 lg:p-8">
          <a
            href={`/workspace/${encodeURIComponent(organizationId)}/administration/integrations`}
            className="text-sm text-[#D6A66A]"
          >
            ← Integrations
          </a>

          <div className="mt-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.22em] text-white/30">Commerce</div>
              <h1 className="mt-2 text-4xl font-light">Shopify</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/45">
                Connect the store once. Avantiqo receives verified Shopify events, performs recovery synchronization, and projects orders into canonical Commercial sales documents.
              </p>
            </div>
            {connection ? (
              <div className={`rounded-2xl border px-4 py-3 text-sm ${healthClass(health.state)}`}>
                <div className="font-medium">{health.label || "Connected"}</div>
                <div className="mt-1 max-w-sm text-xs opacity-70">{health.detail}</div>
              </div>
            ) : null}
          </div>

          {error ? (
            <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100">
              {error}
            </div>
          ) : null}

          {loading ? (
            <div className="mt-8 text-sm text-white/40">Loading Shopify status…</div>
          ) : !connection ? (
            <div className="mt-8 max-w-2xl rounded-3xl border border-white/10 bg-black/40 p-5">
              <div className="text-sm font-medium">Connect a Shopify store</div>
              <p className="mt-2 text-sm leading-6 text-white/40">
                Enter the store address. Shopify will ask the store administrator to approve Avantiqo. No API keys are required from the customer.
              </p>
              <label className="mt-5 block text-xs text-white/45">Shopify store</label>
              <input
                value={shop}
                onChange={(event) => setShop(event.target.value)}
                placeholder="your-store.myshopify.com"
                className="mt-2 w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-sm text-white outline-none"
              />
              <button
                type="button"
                onClick={connect}
                disabled={!normalized}
                className="mt-4 rounded-2xl bg-[#D6A66A] px-5 py-3 text-sm font-semibold text-black disabled:opacity-40"
              >
                Continue to Shopify
              </button>
            </div>
          ) : (
            <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {[
                ["Store", store?.name || connection?.metadata?.account_name || connection?.metadata?.shop || "Connected"],
                ["Webhook", connection?.metadata?.webhook_ready ? "Ready" : "Setup pending"],
                ["Projected events", projection.processed ?? 0],
                ["Variant mappings", `${mapping.mapped_variants || 0} / ${mapping.total_variants || 0}`],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-white/10 bg-black/30 p-4">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-white/30">{label}</div>
                  <div className="mt-2 text-lg font-medium text-white/85">{value}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {connection && !loading ? (
          <>
            <section className="rounded-[30px] border border-white/10 bg-white/[0.025] p-6 lg:p-8">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="text-xs uppercase tracking-[0.22em] text-white/30">Ownership scope</div>
                  <h2 className="mt-2 text-2xl font-light">Legal entity</h2>
                  <p className="mt-2 text-sm text-white/40">
                    Shopify orders are not allowed into Commercial until the store is assigned to the legal entity that owns the sales activity.
                  </p>
                </div>
                <select
                  value={store?.entity_id || ""}
                  onChange={(event) =>
                    post(
                      { action: "map-store", assetId: store.id, entityId: event.target.value },
                      "store-entity",
                    )
                  }
                  disabled={!store || saving === "store-entity"}
                  className="min-w-[280px] rounded-xl border border-white/10 bg-black px-4 py-3 text-sm text-white outline-none"
                >
                  <option value="" disabled>Select legal entity</option>
                  {(snapshot?.entities || []).map((entity) => (
                    <option key={entity.id} value={entity.id}>{entityLabel(entity)}</option>
                  ))}
                </select>
              </div>
            </section>

            <section className="rounded-[30px] border border-white/10 bg-white/[0.025] p-6 lg:p-8">
              <div className="text-xs uppercase tracking-[0.22em] text-white/30">Synchronization</div>
              <h2 className="mt-2 text-2xl font-light">Operational health</h2>
              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                  <div className="text-xs text-white/35">Pending events</div>
                  <div className="mt-2 text-2xl">{projection.pending || 0}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                  <div className="text-xs text-white/35">Blocked events</div>
                  <div className="mt-2 text-2xl">{projection.blocked || 0}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                  <div className="text-xs text-white/35">Failed events</div>
                  <div className="mt-2 text-2xl">{projection.failed || 0}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                  <div className="text-xs text-white/35">Last recovery sync</div>
                  <div className="mt-2 text-sm text-white/80">{formatDate(reconciliation.last_full_sync_at)}</div>
                </div>
              </div>
              <div className="mt-4 text-xs text-white/30">
                Webhook configured: {formatDate(connection?.metadata?.webhook_configured_at)} · Latest provider event: {formatDate(projection?.latest?.created_at)}
              </div>
            </section>

            <section className="rounded-[30px] border border-white/10 bg-white/[0.025] p-6 lg:p-8">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <div className="text-xs uppercase tracking-[0.22em] text-white/30">Inventory mapping</div>
                  <h2 className="mt-2 text-2xl font-light">Shopify variants → Avantiqo inventory</h2>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-white/40">
                    Mapping is explicit. Avantiqo never guesses from a matching name or SKU. Unmapped Shopify order lines remain valid external sale lines and do not reserve or change native stock.
                  </p>
                </div>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search variant or SKU"
                  className="w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-sm text-white outline-none lg:w-72"
                />
              </div>

              {!store?.entity_id ? (
                <div className="mt-6 rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-100">
                  Assign the Shopify store to a legal entity before mapping inventory.
                </div>
              ) : !(snapshot?.variants || []).length ? (
                <div className="mt-6 rounded-2xl border border-white/10 bg-black/30 p-5 text-sm text-white/40">
                  Shopify variants will appear here after the first recovery synchronization or product webhook.
                </div>
              ) : (
                <div className="mt-6 overflow-hidden rounded-2xl border border-white/10">
                  <div className="hidden grid-cols-[1.4fr_.7fr_1.5fr] gap-4 border-b border-white/10 bg-white/[0.03] px-4 py-3 text-[11px] uppercase tracking-[0.16em] text-white/30 md:grid">
                    <div>Shopify variant</div>
                    <div>SKU</div>
                    <div>Avantiqo inventory item</div>
                  </div>
                  <div className="divide-y divide-white/10">
                    {variants.map((variant) => {
                      const mappedItem = inventoryById.get(variant.inventory_item_id);
                      return (
                        <div key={variant.id} className="grid gap-3 px-4 py-4 md:grid-cols-[1.4fr_.7fr_1.5fr] md:items-center">
                          <div>
                            <div className="text-sm text-white/85">{variant.name}</div>
                            <div className="mt-1 text-xs text-white/25">Shopify ID {variant.external_id}</div>
                          </div>
                          <div className="text-sm text-white/55">{variant.sku || "—"}</div>
                          <div className="flex gap-2">
                            <select
                              value={variant.inventory_item_id || ""}
                              disabled={saving === `variant-${variant.id}`}
                              onChange={(event) =>
                                post(
                                  event.target.value
                                    ? {
                                        action: "map-variant",
                                        variantAssetId: variant.id,
                                        inventoryItemId: event.target.value,
                                      }
                                    : {
                                        action: "unmap-variant",
                                        variantAssetId: variant.id,
                                      },
                                  `variant-${variant.id}`,
                                )
                              }
                              className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black px-3 py-2.5 text-sm text-white outline-none"
                            >
                              <option value="">Not mapped</option>
                              {(snapshot?.inventoryItems || []).map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.name}{item.code ? ` · ${item.code}` : ""}
                                </option>
                              ))}
                            </select>
                            {mappedItem ? (
                              <span className="hidden self-center rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-[11px] text-emerald-200 xl:inline">
                                Mapped
                              </span>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
