"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Beaker,
  Bug,
  CheckCircle2,
  ClipboardCheck,
  PackageOpen,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
} from "lucide-react";

const PESTS = ["Cockroach", "Ant", "Rodent", "Mosquito", "Termite", "Fly", "Bed bug"];
const METHODS = ["Spray", "Gel", "Bait", "Dust", "Trap", "Fogging", "Inspection only"];
const ACTIVITIES = [
  ["sighted", "Sighted"],
  ["live_activity", "Live activity"],
  ["dead_activity", "Dead activity"],
  ["droppings", "Droppings"],
  ["damage", "Damage"],
  ["nesting", "Nesting"],
  ["device_activity", "Device activity"],
  ["other", "Other"],
];

function text(value) { return String(value ?? "").trim(); }
function numberValue(value) { if (value === "") return ""; const number = Number(value); return Number.isFinite(number) ? number : ""; }
function newFinding(pestName = "") { return { finding_id: crypto.randomUUID(), pest_name: pestName, activity_type: "sighted", severity: 1, count: "", area: "", condition: "", notes: "" }; }
function newApplication() { return { application_id: crypto.randomUUID(), item_id: "", warehouse_id: "", location_id: "", quantity: "", application_method: "", target_pests: "", treatment_area: "", dilution_rate: "", device: "", registration_number: "", active_ingredients: "", batch_lot: "", notes: "" }; }
function SmallLabel({ children }) { return <span className="text-[8px] font-medium uppercase tracking-[0.1em] text-[#918A82]">{children}</span>; }

const inputClass = "mt-1.5 w-full rounded-xl border border-black/[0.09] bg-white px-3 py-2.5 text-[10px] text-[#312E2A] outline-none transition placeholder:text-[#B0AAA2] focus:border-[#D6A66A]/60 disabled:bg-[#F4F2EE] disabled:text-[#8D877F]";
const addButtonClass = "inline-flex items-center gap-1 rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-[8px] font-medium text-[#665B4E] transition hover:border-[#D6A66A]/45 hover:text-[#76583A]";

function ContextCard({ label, value, detail }) {
  return <div className="rounded-2xl border border-black/[0.07] bg-white px-4 py-3.5"><SmallLabel>{label}</SmallLabel><div className="mt-1.5 truncate text-[11px] font-medium text-[#413C36]">{value || "—"}</div>{detail ? <div className="mt-1 truncate text-[8px] text-[#9A948C]">{detail}</div> : null}</div>;
}

function SectionHeader({ icon: Icon, title, detail, action }) {
  return <div className="flex flex-wrap items-start justify-between gap-3 border-b border-black/[0.055] pb-3"><div><div className="flex items-center gap-1.5 text-[11px] font-medium text-[#3F3A34]"><Icon size={12} /> {title}</div><div className="mt-1 max-w-2xl text-[8px] leading-4 text-[#928B82]">{detail}</div></div>{action}</div>;
}

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
  const technicianHref = `/workspace/${encodeURIComponent(organizationId)}/operations/field-service/technician`;
  const evidenceHref = `/workspace/${encodeURIComponent(organizationId)}/operations/completion-evidence`;
  const stockHref = `/workspace/${encodeURIComponent(organizationId)}/supply-chain/inventory`;

  const summary = useMemo(() => ({
    severe: findings.filter((row) => Number(row.severity || 0) >= 4).length,
    areas: new Set(findings.map((row) => text(row.area)).filter(Boolean)).size,
    pests: [...new Set(findings.map((row) => text(row.pest_name)).filter(Boolean))],
  }), [findings]);

  const readinessIssues = useMemo(() => {
    const issues = [];
    findings.forEach((row, index) => {
      if (!text(row.pest_name)) issues.push(`Finding ${index + 1}: identify pest/activity.`);
      if (!text(row.area)) issues.push(`Finding ${index + 1}: record exact area.`);
    });
    applications.forEach((row, index) => {
      if (!text(row.item_id)) issues.push(`Application ${index + 1}: select approved product.`);
      if (!(Number(row.quantity) > 0)) issues.push(`Application ${index + 1}: enter quantity.`);
      if (!text(row.application_method)) issues.push(`Application ${index + 1}: record method.`);
      if (!text(row.treatment_area)) issues.push(`Application ${index + 1}: record treatment area.`);
      if (row.stock_shortage) issues.push(`Application ${index + 1}: resolve stock shortage.`);
    });
    return issues;
  }, [applications, findings]);

  function patchFinding(id, key, value) { setFindings((rows) => rows.map((row) => row.finding_id === id ? { ...row, [key]: value } : row)); }
  function patchApplication(id, key, value) {
    setApplications((rows) => rows.map((row) => {
      if (row.application_id !== id) return row;
      if (key === "warehouse_id") return { ...row, warehouse_id: value, location_id: "" };
      if (key === "item_id") { const item = itemById.get(value); return { ...row, item_id: value, unit: item?.unit || null }; }
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
      setNotice("Treatment validated and saved. Stock remains unchanged until governed service completion.");
    } catch (error) { setNotice(error?.message || "Treatment draft could not be saved."); }
    finally { setBusy(false); }
  }

  return (
    <main className="min-h-[calc(100vh-61px)] bg-[#F7F6F3] px-4 py-5 text-[#191919] md:px-7 lg:px-9 lg:py-7">
      <div className="mx-auto max-w-[1580px]">
        <header className="flex flex-col gap-5 border-b border-black/[0.07] pb-5 xl:flex-row xl:items-end xl:justify-between">
          <div><Link href={treatmentHubHref} className="inline-flex items-center gap-1.5 text-[9px] text-[#8D867E] hover:text-[#79593A]"><ArrowLeft size={10} /> Treatment register</Link><div className="mt-3 text-[10px] font-medium uppercase tracking-[0.18em] text-[#9A744B]">Visit treatment</div><h1 className="mt-1 text-[27px] font-medium tracking-[-0.04em] text-[#201E1B]">Inspect, treat & prove</h1><p className="mt-1 max-w-3xl text-[11px] leading-5 text-[#777169]">Work in the order a technician thinks on site: inspect the problem, capture findings, record exact applications, verify traceability and hand clean evidence into completion.</p></div>
          <div className="flex items-center gap-2"><Link href={technicianHref} className="rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-[9px] text-[#625D56]">Technician workspace</Link><button type="button" onClick={load} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-black/[0.08] bg-white text-[#806143]" aria-label="Refresh treatment"><RefreshCw size={11} className={state.loading ? "animate-spin" : ""} /></button></div>
        </header>

        {state.error ? <div className="mt-4 flex items-start gap-2 rounded-xl border border-[#B36B52]/20 bg-[#B36B52]/[0.05] px-4 py-3 text-[10px] text-[#8B4937]"><AlertTriangle size={12} className="mt-0.5" />{state.error}</div> : null}
        {state.data ? <>
          <section className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <ContextCard label="Customer" value={delivery.customer_name || "Customer"} />
            <ContextCard label="Site" value={delivery.customer_location_name || "Site not named"} detail={delivery.customer_location_address || delivery.address || null} />
            <ContextCard label="Service" value={delivery.service_name || "Service visit"} />
            <ContextCard label="Visit state" value={occurrence.status || "Open"} detail={immutable ? "Treatment locked with closed service" : "Editable until completion"} />
          </section>

          <section className="mt-4 grid gap-2 rounded-2xl border border-black/[0.07] bg-white p-3 md:grid-cols-4">
            {[["1","Inspect",findings.length ? `${findings.length} findings` : "Capture activity"],["2","Treat",applications.length ? `${applications.length} applications` : "Inspection-only allowed"],["3","Validate",readinessIssues.length ? `${readinessIssues.length} items to review` : "Record structurally clean"],["4","Complete","Evidence + controlled close"]].map(([step,title,detail]) => <div key={step} className="flex items-center gap-3 rounded-xl bg-[#FBFAF8] px-3 py-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#D6A66A]/25 bg-white text-[8px] font-medium text-[#8A6742]">{step}</span><div><div className="text-[9px] font-medium text-[#4B453F]">{title}</div><div className="mt-0.5 text-[7px] text-[#9A948C]">{detail}</div></div></div>)}
          </section>

          {!catalog.items?.length ? <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#C08A4A]/20 bg-[#C08A4A]/[0.045] p-4"><div className="flex gap-2"><PackageOpen size={14} className="mt-0.5 text-[#9A744B]" /><div><div className="text-[10px] font-medium text-[#6F5338]">No approved treatment materials in Supply Chain</div><div className="mt-1 text-[8px] leading-4 text-[#8A7C6D]">Operations will not invent free-text chemicals as stock. Add approved materials first; they then become selectable and stock-preflighted here.</div></div></div><Link href={stockHref} className="rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-[9px] font-medium text-[#665B4E]">Open Materials & stock</Link></div> : null}

          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_330px] xl:items-start"><div className="space-y-5">
            <section className="rounded-2xl border border-black/[0.07] bg-white p-4">
              <SectionHeader icon={Bug} title="1. Pest findings" detail="Capture the pest/activity and exact location so repeat pressure can be understood later instead of buried in notes." action={!immutable ? <button type="button" onClick={() => setFindings((rows) => [...rows, newFinding()])} className={addButtonClass}><Plus size={9} /> Add finding</button> : null} />
              {!immutable && !findings.length ? <div className="mt-3 flex flex-wrap gap-1.5"><span className="mr-1 self-center text-[7px] uppercase tracking-[0.08em] text-[#9A948C]">Quick start</span>{PESTS.map((pest) => <button key={pest} type="button" onClick={() => setFindings((rows) => [...rows, newFinding(pest)])} className="rounded-full border border-black/[0.07] bg-[#FBFAF8] px-2.5 py-1.5 text-[8px] text-[#6F6961]">{pest}</button>)}</div> : null}
              <div className="mt-3 space-y-3">{findings.map((row,index) => <div key={row.finding_id} className="rounded-2xl border border-black/[0.06] bg-[#FBFAF8] p-3.5">
                <div className="flex items-center justify-between"><span className="text-[9px] font-medium text-[#5B554D]">Finding {index + 1} · {text(row.pest_name) || "Unidentified"}</span>{!immutable ? <button type="button" onClick={() => setFindings((rows) => rows.filter((item) => item.finding_id !== row.finding_id))} className="text-[#A06A58]"><Trash2 size={10} /></button> : null}</div>
                <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-4"><label><SmallLabel>Pest / activity</SmallLabel><input disabled={immutable} list="pc-pests" className={inputClass} value={row.pest_name || ""} onChange={(e) => patchFinding(row.finding_id,"pest_name",e.target.value)} /></label><label><SmallLabel>Evidence type</SmallLabel><select disabled={immutable} className={inputClass} value={row.activity_type || "sighted"} onChange={(e) => patchFinding(row.finding_id,"activity_type",e.target.value)}>{ACTIVITIES.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="xl:col-span-2"><SmallLabel>Exact area</SmallLabel><input disabled={immutable} className={inputClass} placeholder="Kitchen dry store · under sink · room 204" value={row.area || ""} onChange={(e) => patchFinding(row.finding_id,"area",e.target.value)} /></label></div>
                <div className="mt-2 grid gap-2 md:grid-cols-[minmax(0,1fr)_140px_minmax(0,1fr)]"><div><SmallLabel>Severity</SmallLabel><div className="mt-1.5 flex gap-1">{[0,1,2,3,4,5].map((level) => <button key={level} disabled={immutable} type="button" onClick={() => patchFinding(row.finding_id,"severity",level)} className={`flex h-9 flex-1 items-center justify-center rounded-lg border text-[8px] ${Number(row.severity) === level ? level >= 4 ? "border-[#B36B52]/30 bg-[#B36B52]/[0.07] text-[#98513D]" : "border-[#D6A66A]/40 bg-[#D6A66A]/[0.08] text-[#7A5A39]" : "border-black/[0.07] bg-white text-[#8E8880]"}`}>{level}</button>)}</div></div><label><SmallLabel>Observed count</SmallLabel><input disabled={immutable} type="number" min="0" className={inputClass} value={row.count ?? ""} onChange={(e) => patchFinding(row.finding_id,"count",numberValue(e.target.value))} /></label><label><SmallLabel>Condition / source</SmallLabel><input disabled={immutable} className={inputClass} placeholder="Moisture, gap, food source…" value={row.condition || ""} onChange={(e) => patchFinding(row.finding_id,"condition",e.target.value)} /></label></div>
                <label className="mt-2 block"><SmallLabel>Technician observation</SmallLabel><textarea disabled={immutable} className={`${inputClass} min-h-20 resize-y`} value={row.notes || ""} onChange={(e) => patchFinding(row.finding_id,"notes",e.target.value)} placeholder="What matters for the next visit or customer follow-up?" /></label>
              </div>)}{!findings.length ? <div className="rounded-xl bg-[#FBFAF8] p-4 text-[9px] text-[#817B73]">No pest activity recorded. A clear inspection can be valid; Avantiqo does not force a fake finding.</div> : null}</div>
              <datalist id="pc-pests">{PESTS.map((value) => <option key={value} value={value} />)}</datalist>
            </section>

            <section className="rounded-2xl border border-black/[0.07] bg-white p-4">
              <SectionHeader icon={Beaker} title="2. Treatment applications" detail="Record every product, amount, method and area separately. Operations records what happened; Supply Chain remains authoritative for materials and stock." action={!immutable && catalog.items?.length ? <button type="button" onClick={() => setApplications((rows) => [...rows, newApplication()])} className={addButtonClass}><Plus size={9} /> Add application</button> : null} />
              <div className="mt-3 space-y-3">{applications.map((row,index) => { const item = itemById.get(row.item_id); const locations = (catalog.locations || []).filter((location) => !row.warehouse_id || location.warehouse_id === row.warehouse_id); return <div key={row.application_id} className="rounded-2xl border border-black/[0.06] bg-[#FBFAF8] p-3.5">
                <div className="flex items-center justify-between"><span className="text-[9px] font-medium text-[#5B554D]">Application {index + 1} · {item?.name || row.material_name || "Treatment"}</span>{!immutable ? <button type="button" onClick={() => setApplications((rows) => rows.filter((itemRow) => itemRow.application_id !== row.application_id))} className="text-[#A06A58]"><Trash2 size={10} /></button> : null}</div>
                <div className="mt-2 grid gap-2 md:grid-cols-3"><label className="md:col-span-2"><SmallLabel>Approved product / material</SmallLabel><select disabled={immutable} className={inputClass} value={row.item_id || ""} onChange={(e) => patchApplication(row.application_id,"item_id",e.target.value)}><option value="">Select Supply Chain item…</option>{(catalog.items || []).map((catalogItem) => <option key={catalogItem.id} value={catalogItem.id}>{catalogItem.name}{catalogItem.code ? ` · ${catalogItem.code}` : ""}{catalogItem.unit ? ` · ${catalogItem.unit}` : ""}</option>)}</select></label><label><SmallLabel>Quantity {item?.unit || row.unit ? `(${item?.unit || row.unit})` : ""}</SmallLabel><input disabled={immutable} type="number" min="0" step="any" className={inputClass} value={row.quantity ?? ""} onChange={(e) => patchApplication(row.application_id,"quantity",numberValue(e.target.value))} /></label><label><SmallLabel>Method</SmallLabel><input disabled={immutable} list="pc-methods" className={inputClass} placeholder="Spray, gel, bait…" value={row.application_method || ""} onChange={(e) => patchApplication(row.application_id,"application_method",e.target.value)} /></label><label className="md:col-span-2"><SmallLabel>Treatment area</SmallLabel><input disabled={immutable} className={inputClass} placeholder="Kitchen perimeter · exterior drains" value={row.treatment_area || ""} onChange={(e) => patchApplication(row.application_id,"treatment_area",e.target.value)} /></label><label className="md:col-span-2"><div className="flex items-center justify-between"><SmallLabel>Target pests</SmallLabel>{!immutable && summary.pests.length ? <button type="button" onClick={() => patchApplication(row.application_id,"target_pests",summary.pests.join(", "))} className="text-[7px] font-medium text-[#8A6742]">Use visit findings</button> : null}</div><input disabled={immutable} className={inputClass} value={row.target_pests || ""} onChange={(e) => patchApplication(row.application_id,"target_pests",e.target.value)} /></label><label><SmallLabel>Dilution / mix</SmallLabel><input disabled={immutable} className={inputClass} value={row.dilution_rate || ""} onChange={(e) => patchApplication(row.application_id,"dilution_rate",e.target.value)} /></label></div>
                <div className="mt-3 rounded-xl border border-black/[0.055] bg-white p-3"><div className="flex items-center gap-1.5 text-[8px] font-medium uppercase tracking-[0.08em] text-[#82796E]"><ShieldCheck size={9} /> Traceability & stock</div><div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-4"><label><SmallLabel>Device / station</SmallLabel><input disabled={immutable} className={inputClass} placeholder="B12 · UV-03" value={row.device || ""} onChange={(e) => patchApplication(row.application_id,"device",e.target.value)} /></label><label><SmallLabel>Batch / lot</SmallLabel><input disabled={immutable} className={inputClass} value={row.batch_lot || ""} onChange={(e) => patchApplication(row.application_id,"batch_lot",e.target.value)} /></label><label><SmallLabel>Registration no.</SmallLabel><input disabled={immutable} className={inputClass} value={row.registration_number || ""} onChange={(e) => patchApplication(row.application_id,"registration_number",e.target.value)} /></label><label><SmallLabel>Active ingredient(s)</SmallLabel><input disabled={immutable} className={inputClass} value={row.active_ingredients || ""} onChange={(e) => patchApplication(row.application_id,"active_ingredients",e.target.value)} /></label><label><SmallLabel>Warehouse</SmallLabel><select disabled={immutable} className={inputClass} value={row.warehouse_id || ""} onChange={(e) => patchApplication(row.application_id,"warehouse_id",e.target.value)}><option value="">Auto if unambiguous</option>{(catalog.warehouses || []).map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></label><label><SmallLabel>Stock location</SmallLabel><select disabled={immutable} className={inputClass} value={row.location_id || ""} onChange={(e) => patchApplication(row.application_id,"location_id",e.target.value)}><option value="">Auto if unambiguous</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label><label className="md:col-span-2"><SmallLabel>Application note</SmallLabel><input disabled={immutable} className={inputClass} value={row.notes || ""} onChange={(e) => patchApplication(row.application_id,"notes",e.target.value)} /></label></div>{row.stock_before !== undefined && row.stock_before !== null ? <div className={`mt-3 flex items-center justify-between rounded-lg border px-3 py-2 text-[8px] ${row.stock_shortage ? "border-[#B36B52]/20 bg-[#B36B52]/[0.05] text-[#8B4937]" : "border-[#748267]/15 bg-[#748267]/[0.04] text-[#65705D]"}`}><span>Stock: {row.stock_before} {row.unit || ""}</span><span>Projected after completion: {row.projected_stock_after} {row.unit || ""}</span></div> : null}</div>
              </div>; })}{!applications.length ? <div className="rounded-xl bg-[#FBFAF8] p-4 text-[9px] text-[#817B73]">No product application recorded. Inspection-only visits remain valid; Avantiqo does not force chemical use.</div> : null}</div>
              <datalist id="pc-methods">{METHODS.map((value) => <option key={value} value={value} />)}</datalist>
            </section>
          </div>

          <aside className="space-y-4 xl:sticky xl:top-5"><section className="rounded-2xl border border-black/[0.07] bg-[#24211E] p-4 text-white"><div className="flex items-start justify-between gap-3"><div><div className="text-[8px] font-medium uppercase tracking-[0.14em] text-[#CDB89D]">Visit control</div><div className="mt-1 text-[14px] font-medium">{readinessIssues.length ? "Finish the treatment record" : "Record is structurally ready"}</div></div>{readinessIssues.length ? <ClipboardCheck size={18} className="text-[#D6A66A]" /> : <CheckCircle2 size={18} className="text-[#A9B69B]" />}</div><div className="mt-4 grid grid-cols-2 gap-2"><div className="rounded-xl border border-white/[0.07] bg-white/[0.035] p-3"><div className="text-[7px] uppercase tracking-[0.08em] text-white/45">Findings</div><div className="mt-1 text-[18px] font-medium">{findings.length}</div><div className="text-[7px] text-white/45">{summary.areas} areas · {summary.severe} severe</div></div><div className="rounded-xl border border-white/[0.07] bg-white/[0.035] p-3"><div className="text-[7px] uppercase tracking-[0.08em] text-white/45">Applications</div><div className="mt-1 text-[18px] font-medium">{applications.length}</div><div className="text-[7px] text-white/45">Stock posts at close</div></div></div>
            {readinessIssues.length ? <div className="mt-3 space-y-1.5 rounded-xl border border-[#D6A66A]/20 bg-[#D6A66A]/[0.06] p-3">{readinessIssues.slice(0,6).map((issue) => <div key={issue} className="flex items-start gap-1.5 text-[8px] leading-4 text-[#E2C9A8]"><AlertTriangle size={9} className="mt-0.5 shrink-0" />{issue}</div>)}</div> : <div className="mt-3 flex items-center gap-1.5 rounded-xl border border-[#8E9C83]/20 bg-[#8E9C83]/[0.07] p-3 text-[8px] text-[#C7D0BF]"><CheckCircle2 size={10} /> Treatment structure is complete.</div>}
            {state.data?.treatment?.status === "ready" ? <div className="mt-3 flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.035] p-3 text-[8px] text-white/65"><ShieldCheck size={10} /> Governed draft saved</div> : null}{notice ? <div className={`mt-3 rounded-xl border p-3 text-[8px] ${notice.toLowerCase().includes("could not") || notice.toLowerCase().includes("insufficient") ? "border-[#B36B52]/30 bg-[#B36B52]/[0.09] text-[#E1AE9E]" : "border-[#8E9C83]/20 bg-[#8E9C83]/[0.07] text-[#C7D0BF]"}`}>{notice}</div> : null}
            {!immutable ? <button type="button" onClick={save} disabled={busy} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#D6A66A] px-4 py-3.5 text-[10px] font-medium text-[#201B16] disabled:opacity-35"><Save size={11} />{busy ? "Validating…" : "Validate & save treatment"}</button> : <div className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.035] p-3 text-[8px] text-white/55">Treatment is immutable because this service is closed.</div>}<div className="mt-3 text-[7px] leading-3 text-white/35">Saving never changes inventory. Consumption is revalidated and posted exactly once on governed service completion.</div></section>
            <section className="rounded-2xl border border-black/[0.07] bg-white p-4"><div className="text-[9px] font-medium text-[#4A453F]">Next in this visit</div><div className="mt-3 space-y-2"><Link href={technicianHref} className="flex items-center justify-between rounded-xl bg-[#FBFAF8] px-3 py-3 text-[8px] text-[#6F6961]"><span>Protocol & technician execution</span><ArrowRight size={9} /></Link><Link href={evidenceHref} className="flex items-center justify-between rounded-xl bg-[#FBFAF8] px-3 py-3 text-[8px] text-[#6F6961]"><span>Completion evidence & sign-off</span><ArrowRight size={9} /></Link><Link href={stockHref} className="flex items-center justify-between rounded-xl bg-[#FBFAF8] px-3 py-3 text-[8px] text-[#6F6961]"><span>Materials & authoritative stock</span><ArrowRight size={9} /></Link></div></section>
          </aside></div>
        </> : null}
      </div>
    </main>
  );
}
