"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, Beaker, Bug, CheckCircle2, MapPin, PackageOpen, Plus, RefreshCw, Save, Trash2 } from "lucide-react";

function text(value) { return String(value ?? "").trim(); }
function numberValue(value) { const number = Number(value); return Number.isFinite(number) ? number : ""; }
function newFinding() { return { finding_id: crypto.randomUUID(), pest_name: "", activity_type: "sighted", severity: 1, count: "", area: "", condition: "", notes: "" }; }
function newApplication() { return { application_id: crypto.randomUUID(), item_id: "", warehouse_id: "", location_id: "", quantity: "", application_method: "", target_pests: "", treatment_area: "", dilution_rate: "", device: "", registration_number: "", active_ingredients: "", batch_lot: "", notes: "" }; }

function SmallLabel({ children }) { return <span className="text-[8px] font-medium uppercase tracking-[0.08em] text-[#918A82]">{children}</span>; }
const inputClass = "mt-1.5 w-full rounded-xl border border-black/[0.09] bg-white px-3 py-2.5 text-[10px] text-[#312E2A] outline-none focus:border-[#D6A66A]/60";

export default function PestControlTreatmentWorkspace({ organizationId, occurrenceId }) {
  const [state, setState] = useState({ loading: true, error: "", data: null });
  const [findings, setFindings] = useState([]);
  const [applications, setApplications] = useState([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!organizationId || !occurrenceId) return;
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const response = await fetch(`/api/service-management/treatment?organizationId=${encodeURIComponent(organizationId)}&occurrenceId=${encodeURIComponent(occurrenceId)}`, { cache: "no-store", credentials: "include" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(json.error || "Service treatment could not be loaded.");
      setState({ loading: false, error: "", data: json });
      setFindings(Array.isArray(json.treatment?.pest_findings) ? json.treatment.pest_findings : []);
      setApplications(Array.isArray(json.treatment?.applications) ? json.treatment.applications.map((row) => ({ ...row, target_pests: (row.target_pests || []).join(", ") })) : []);
    } catch (error) {
      setState({ loading: false, error: error?.message || "Service treatment could not be loaded.", data: null });
    }
  }, [occurrenceId, organizationId]);

  useEffect(() => { load(); }, [load]);

  const occurrence = state.data?.occurrence || null;
  const delivery = occurrence?.service_delivery || {};
  const catalog = state.data?.catalog || { items: [], warehouses: [], locations: [] };
  const immutable = ["completed", "cancelled", "canceled", "archived"].includes(text(occurrence?.status).toLowerCase());
  const itemById = useMemo(() => new Map((catalog.items || []).map((row) => [row.id, row])), [catalog.items]);
  const treatmentHubHref = `/workspace/${encodeURIComponent(organizationId)}/operations/field-service/treatments`;
  const stockHref = `/workspace/${encodeURIComponent(organizationId)}/supply-chain/inventory`;

  function patchFinding(id, key, value) { setFindings((rows) => rows.map((row) => row.finding_id === id ? { ...row, [key]: value } : row)); }
  function patchApplication(id, key, value) {
    setApplications((rows) => rows.map((row) => {
      if (row.application_id !== id) return row;
      if (key === "warehouse_id") return { ...row, warehouse_id: value, location_id: "" };
      if (key === "item_id") {
        const item = itemById.get(value);
        return { ...row, item_id: value, unit: item?.unit || null };
      }
      return { ...row, [key]: value };
    }));
  }

  async function save() {
    if (busy || immutable) return;
    setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/service-management/treatment", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, occurrenceId, pestFindings: findings, treatmentApplications: applications.map((row) => ({ ...row, target_pests: String(row.target_pests || "").split(",").map((value) => value.trim()).filter(Boolean) })) }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(json.error || "Treatment draft could not be saved.");
      setState({ loading: false, error: "", data: json });
      setFindings(json.treatment?.pest_findings || []);
      setApplications((json.treatment?.applications || []).map((row) => ({ ...row, target_pests: (row.target_pests || []).join(", ") })));
      setNotice("Treatment draft validated and saved. Stock remains unchanged until service completion.");
    } catch (error) { setNotice(error?.message || "Treatment draft could not be saved."); }
    finally { setBusy(false); }
  }

  return (
    <main className="min-h-[calc(100vh-61px)] bg-[#F7F6F3] px-4 py-5 text-[#191919] md:px-7 lg:px-9 lg:py-7">
      <div className="mx-auto max-w-[1500px]">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-black/[0.07] pb-5">
          <div><Link href={treatmentHubHref} className="inline-flex items-center gap-1.5 text-[9px] text-[#8D867E] hover:text-[#79593A]"><ArrowLeft size={10} /> Treatment register</Link><div className="mt-3 text-[10px] font-medium uppercase tracking-[0.18em] text-[#9A744B]">Visit treatment</div><h1 className="mt-1 text-[27px] font-medium tracking-[-0.04em] text-[#201E1B]">Inspect & treat</h1><p className="mt-1 max-w-3xl text-[11px] leading-5 text-[#777169]">Record what was found, exactly what was applied, where and why. Product identity and stock stay governed by Supply Chain.</p></div>
          <button type="button" onClick={load} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-black/[0.08] bg-white text-[#806143]"><RefreshCw size={11} className={state.loading ? "animate-spin" : ""} /></button>
        </header>

        {state.error ? <div className="mt-4 flex gap-2 rounded-xl border border-[#B36B52]/20 bg-[#B36B52]/[0.05] px-4 py-3 text-[10px] text-[#8B4937]"><AlertTriangle size={12} />{state.error}</div> : null}
        {state.data ? <>
          <section className="mt-5 grid gap-3 md:grid-cols-4"><div className="rounded-2xl border border-black/[0.07] bg-white p-4"><SmallLabel>Customer</SmallLabel><div className="mt-1 text-[11px] font-medium text-[#413C36]">{delivery.customer_name || "Customer"}</div></div><div className="rounded-2xl border border-black/[0.07] bg-white p-4"><SmallLabel>Site</SmallLabel><div className="mt-1 text-[11px] font-medium text-[#413C36]">{delivery.customer_location_name || "Site not named"}</div></div><div className="rounded-2xl border border-black/[0.07] bg-white p-4"><SmallLabel>Service</SmallLabel><div className="mt-1 text-[11px] font-medium text-[#413C36]">{delivery.service_name || "Service"}</div></div><div className="rounded-2xl border border-black/[0.07] bg-white p-4"><SmallLabel>Status</SmallLabel><div className="mt-1 text-[11px] font-medium capitalize text-[#413C36]">{occurrence.status || "Open"}</div></div></section>

          {!catalog.items?.length ? <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#C08A4A]/20 bg-[#C08A4A]/[0.045] p-4"><div className="flex gap-2"><PackageOpen size={14} className="mt-0.5 text-[#9A744B]" /><div><div className="text-[10px] font-medium text-[#6F5338]">No approved treatment materials in Supply Chain</div><div className="mt-1 text-[8px] leading-4 text-[#8A7C6D]">Avantiqo will not create free-text chemicals as authoritative stock. Add approved products first, then they become selectable here.</div></div></div><Link href={stockHref} className="rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-[9px] font-medium text-[#665B4E]">Open Materials & stock</Link></div> : null}

          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px] xl:items-start"><div className="space-y-5">
            <section className="rounded-2xl border border-black/[0.07] bg-white p-4"><div className="flex items-center justify-between"><div><div className="flex items-center gap-1.5 text-[10px] font-medium text-[#3F3A34]"><Bug size={11} /> Pest findings</div><div className="mt-1 text-[8px] text-[#928B82]">Capture activity by pest and exact area instead of burying findings in notes.</div></div>{!immutable ? <button type="button" onClick={() => setFindings((rows) => [...rows, newFinding()])} className="inline-flex items-center gap-1 rounded-lg border border-black/[0.08] px-3 py-2 text-[8px] text-[#665B4E]"><Plus size={9} /> Finding</button> : null}</div><div className="mt-3 space-y-3">{findings.map((row, index) => <div key={row.finding_id} className="rounded-xl border border-black/[0.06] bg-[#FBFAF8] p-3.5"><div className="flex items-center justify-between"><span className="text-[8px] font-medium text-[#81796F]">Finding {index + 1}</span>{!immutable ? <button type="button" onClick={() => setFindings((rows) => rows.filter((item) => item.finding_id !== row.finding_id))} className="text-[#A06A58]"><Trash2 size={10} /></button> : null}</div><div className="mt-2 grid gap-2 md:grid-cols-3"><label><SmallLabel>Pest</SmallLabel><input disabled={immutable} className={inputClass} value={row.pest_name || ""} onChange={(e) => patchFinding(row.finding_id,"pest_name",e.target.value)} /></label><label><SmallLabel>Activity</SmallLabel><select disabled={immutable} className={inputClass} value={row.activity_type || "sighted"} onChange={(e) => patchFinding(row.finding_id,"activity_type",e.target.value)}><option value="sighted">Sighted</option><option value="live_activity">Live activity</option><option value="dead_activity">Dead activity</option><option value="droppings">Droppings</option><option value="damage">Damage</option><option value="nesting">Nesting</option><option value="device_activity">Device activity</option><option value="other">Other</option></select></label><label><SmallLabel>Area</SmallLabel><input disabled={immutable} className={inputClass} value={row.area || ""} onChange={(e) => patchFinding(row.finding_id,"area",e.target.value)} /></label><label><SmallLabel>Severity 0–5</SmallLabel><input disabled={immutable} type="number" min="0" max="5" className={inputClass} value={row.severity ?? ""} onChange={(e) => patchFinding(row.finding_id,"severity",numberValue(e.target.value))} /></label><label><SmallLabel>Count</SmallLabel><input disabled={immutable} type="number" min="0" className={inputClass} value={row.count ?? ""} onChange={(e) => patchFinding(row.finding_id,"count",numberValue(e.target.value))} /></label><label><SmallLabel>Condition</SmallLabel><input disabled={immutable} className={inputClass} value={row.condition || ""} onChange={(e) => patchFinding(row.finding_id,"condition",e.target.value)} /></label></div></div>)}{!findings.length ? <div className="rounded-xl bg-[#FBFAF8] p-4 text-[9px] text-[#817B73]">No pest findings recorded yet.</div> : null}</div></section>

            <section className="rounded-2xl border border-black/[0.07] bg-white p-4"><div className="flex items-center justify-between"><div><div className="flex items-center gap-1.5 text-[10px] font-medium text-[#3F3A34]"><Beaker size={11} /> Treatment applications</div><div className="mt-1 text-[8px] text-[#928B82]">One visit can use multiple products, methods and treatment areas.</div></div>{!immutable && catalog.items?.length ? <button type="button" onClick={() => setApplications((rows) => [...rows, newApplication()])} className="inline-flex items-center gap-1 rounded-lg border border-black/[0.08] px-3 py-2 text-[8px] text-[#665B4E]"><Plus size={9} /> Application</button> : null}</div><div className="mt-3 space-y-3">{applications.map((row, index) => { const item = itemById.get(row.item_id); const locations = (catalog.locations || []).filter((location) => !row.warehouse_id || location.warehouse_id === row.warehouse_id); return <div key={row.application_id} className="rounded-xl border border-black/[0.06] bg-[#FBFAF8] p-3.5"><div className="flex items-center justify-between"><span className="text-[8px] font-medium text-[#81796F]">Application {index + 1}</span>{!immutable ? <button type="button" onClick={() => setApplications((rows) => rows.filter((itemRow) => itemRow.application_id !== row.application_id))} className="text-[#A06A58]"><Trash2 size={10} /></button> : null}</div><div className="mt-2 grid gap-2 md:grid-cols-3"><label className="md:col-span-2"><SmallLabel>Approved product / material</SmallLabel><select disabled={immutable} className={inputClass} value={row.item_id || ""} onChange={(e) => patchApplication(row.application_id,"item_id",e.target.value)}><option value="">Select Supply Chain item…</option>{(catalog.items || []).map((catalogItem) => <option key={catalogItem.id} value={catalogItem.id}>{catalogItem.name}{catalogItem.code ? ` · ${catalogItem.code}` : ""}{catalogItem.unit ? ` · ${catalogItem.unit}` : ""}</option>)}</select></label><label><SmallLabel>Quantity {item?.unit || row.unit ? `(${item?.unit || row.unit})` : ""}</SmallLabel><input disabled={immutable} type="number" min="0" step="any" className={inputClass} value={row.quantity ?? ""} onChange={(e) => patchApplication(row.application_id,"quantity",numberValue(e.target.value))} /></label><label><SmallLabel>Method</SmallLabel><input disabled={immutable} className={inputClass} placeholder="Spray, gel, bait, dust…" value={row.application_method || ""} onChange={(e) => patchApplication(row.application_id,"application_method",e.target.value)} /></label><label><SmallLabel>Target pests</SmallLabel><input disabled={immutable} className={inputClass} placeholder="Cockroach, ant" value={row.target_pests || ""} onChange={(e) => patchApplication(row.application_id,"target_pests",e.target.value)} /></label><label><SmallLabel>Treatment area</SmallLabel><input disabled={immutable} className={inputClass} placeholder="Kitchen perimeter" value={row.treatment_area || ""} onChange={(e) => patchApplication(row.application_id,"treatment_area",e.target.value)} /></label><label><SmallLabel>Dilution / mix</SmallLabel><input disabled={immutable} className={inputClass} value={row.dilution_rate || ""} onChange={(e) => patchApplication(row.application_id,"dilution_rate",e.target.value)} /></label><label><SmallLabel>Warehouse</SmallLabel><select disabled={immutable} className={inputClass} value={row.warehouse_id || ""} onChange={(e) => patchApplication(row.application_id,"warehouse_id",e.target.value)}><option value="">Auto if unambiguous</option>{(catalog.warehouses || []).map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></label><label><SmallLabel>Stock location</SmallLabel><select disabled={immutable} className={inputClass} value={row.location_id || ""} onChange={(e) => patchApplication(row.application_id,"location_id",e.target.value)}><option value="">Auto if unambiguous</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label></div>{row.stock_before !== undefined && row.stock_before !== null ? <div className={`mt-3 rounded-lg border px-3 py-2 text-[8px] ${row.stock_shortage ? "border-[#B36B52]/20 bg-[#B36B52]/[0.05] text-[#8B4937]" : "border-[#748267]/15 bg-[#748267]/[0.04] text-[#65705D]"}`}>Stock at validation: {row.stock_before} {row.unit || ""} → projected {row.projected_stock_after} {row.unit || ""}</div> : null}</div>; })}{!applications.length ? <div className="rounded-xl bg-[#FBFAF8] p-4 text-[9px] text-[#817B73]">No product applications recorded. Inspection-only visits can remain without product use.</div> : null}</div></section>
          </div>

          <aside className="xl:sticky xl:top-5"><section className="rounded-2xl border border-black/[0.07] bg-white p-4"><div className="text-[9px] font-medium uppercase tracking-[0.12em] text-[#8A867F]">Treatment control</div><div className="mt-3 space-y-2 text-[9px]"><div className="flex justify-between rounded-xl bg-[#FBFAF8] px-3 py-3"><span className="text-[#6F6961]">Pest findings</span><span>{findings.length}</span></div><div className="flex justify-between rounded-xl bg-[#FBFAF8] px-3 py-3"><span className="text-[#6F6961]">Applications</span><span>{applications.length}</span></div><div className="flex justify-between rounded-xl bg-[#FBFAF8] px-3 py-3"><span className="text-[#6F6961]">Inventory posting</span><span className="text-[#607057]">At completion</span></div></div>{state.data?.treatment?.status === "ready" ? <div className="mt-3 flex items-center gap-1.5 rounded-xl border border-[#748267]/15 bg-[#748267]/[0.04] p-3 text-[8px] text-[#607057]"><CheckCircle2 size={10} /> Validated draft saved</div> : null}{notice ? <div className={`mt-3 rounded-xl border p-3 text-[8px] leading-4 ${notice.toLowerCase().includes("could not") || notice.toLowerCase().includes("insufficient") ? "border-[#B36B52]/20 bg-[#B36B52]/[0.05] text-[#8B4937]" : "border-[#748267]/15 bg-[#748267]/[0.04] text-[#607057]"}`}>{notice}</div> : null}{!immutable ? <button type="button" onClick={save} disabled={busy} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#2C2925] px-4 py-3.5 text-[10px] font-medium text-white disabled:opacity-35"><Save size={11} />{busy ? "Validating…" : "Save validated treatment"}</button> : <div className="mt-4 rounded-xl border border-black/[0.07] bg-[#FBFAF8] p-3 text-[8px] text-[#777169]">Treatment is immutable because this service is closed.</div>}<div className="mt-3 text-[7px] leading-3 text-[#9A938A]">Saving never changes inventory. Product consumption is revalidated and posted exactly once when the service completes.</div></section></aside></div>
        </> : null}
      </div>
    </main>
  );
}
