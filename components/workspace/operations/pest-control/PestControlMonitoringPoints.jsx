"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Barcode,
  CheckCircle2,
  CircleDot,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Wrench,
} from "lucide-react";

function text(value) { return String(value ?? "").trim(); }
function normalized(value) { return text(value).toLowerCase().replace(/[\s-]+/g, "_"); }
function dateValue(value) { const date = value ? new Date(value) : null; return date && !Number.isNaN(date.getTime()) ? date : null; }
function formatDate(value) { const date = dateValue(value); return date ? date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : "Not checked"; }
function pointTypeLabel(value) {
  return ({
    rodent_bait_station: "Rodent bait station",
    rodent_trap: "Rodent trap",
    glue_board: "Glue board",
    insect_light_trap: "Insect light trap",
    termite_station: "Termite station",
    monitoring_trap: "Monitoring trap",
    other: "Monitoring point",
  })[value] || "Monitoring point";
}
function dueTone(value) {
  if (value === "overdue") return "border-[#B36B52]/25 bg-[#B36B52]/[0.07] text-[#8B4937]";
  if (value === "due_today") return "border-[#D6A66A]/35 bg-[#D6A66A]/[0.10] text-[#806143]";
  if (value === "inactive") return "border-black/[0.08] bg-[#F2F0EC] text-[#827B73]";
  return "border-[#6F8B77]/25 bg-[#6F8B77]/[0.08] text-[#55705D]";
}
function activityTone(value) {
  if (["high", "critical"].includes(normalized(value))) return "text-[#99523F]";
  if (normalized(value) === "medium") return "text-[#947049]";
  return "text-[#63756A]";
}

function Metric({ label, value, detail, attention = false }) {
  return <div className="rounded-2xl border border-black/[0.07] bg-white px-4 py-3.5"><div className="text-[8px] font-medium uppercase tracking-[0.12em] text-[#918A82]">{label}</div><div className={`mt-2 text-[22px] font-medium tracking-[-0.03em] ${attention && Number(value) > 0 ? "text-[#98513D]" : "text-[#27231F]"}`}>{value}</div><div className="mt-1 text-[8px] leading-4 text-[#9A948C]">{detail}</div></div>;
}

function StatusPill({ row }) {
  const label = row.due_state === "overdue" ? "Overdue" : row.due_state === "due_today" ? "Due today" : row.due_state === "inactive" ? "Inactive" : row.due_state === "unset" ? "No cadence" : "Healthy";
  return <span className={`rounded-full border px-2.5 py-1 text-[8px] font-medium uppercase tracking-[0.08em] ${dueTone(row.due_state)}`}>{label}</span>;
}

const INITIAL_CREATE = { pointType: "rodent_bait_station", customerLocationId: "", area: "", placement: "", checkCadenceDays: "30", barcode: "" };
const INITIAL_CHECK = { condition: "good", activityLevel: "none", pestName: "", count: "0", actionTaken: "inspected", notes: "" };
const CADENCES = [["7", "Weekly"], ["14", "Every 2 weeks"], ["30", "Monthly"], ["60", "Every 2 months"], ["90", "Quarterly"]];

function FieldLabel({ children, optional = false }) {
  return <div className="mb-1.5 text-[8px] font-medium uppercase tracking-[0.09em] text-[#8E877F]">{children}{optional ? <span className="ml-1 normal-case tracking-normal text-[#B1AAA2]">optional</span> : null}</div>;
}

export default function PestControlMonitoringPoints({ organizationId }) {
  const [state, setState] = useState({ loading: true, error: "", rows: [], sites: [], metrics: {}, authority: null });
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [view, setView] = useState("attention");
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(INITIAL_CREATE);
  const [checkForm, setCheckForm] = useState(INITIAL_CHECK);
  const [saving, setSaving] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!organizationId) return;
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const response = await fetch(`/api/service-management/monitoring-points?organizationId=${encodeURIComponent(organizationId)}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.success) throw new Error(body.error || "Unable to load monitoring points.");
      setState({ loading: false, error: "", rows: body.rows || [], sites: body.sites || [], metrics: body.metrics || {}, authority: body.authority || null });
      setSelectedId((current) => current || body.rows?.[0]?.id || "");
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: error.message || "Unable to load monitoring points." }));
    }
  }, [organizationId]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const needle = text(query).toLowerCase();
    return state.rows.filter((row) => {
      if (view === "attention" && !row.needs_attention) return false;
      if (view === "overdue" && row.due_state !== "overdue") return false;
      if (view === "active" && normalized(row.status) !== "active") return false;
      if (!needle) return true;
      return [row.code, row.barcode, row.customer_name, row.customer_location_name, row.area, row.point_type_label].some((value) => text(value).toLowerCase().includes(needle));
    });
  }, [query, state.rows, view]);

  const selected = useMemo(() => state.rows.find((row) => row.id === selectedId) || filtered[0] || state.rows[0] || null, [filtered, selectedId, state.rows]);
  const selectedSite = useMemo(() => state.sites.find((site) => site.customer_location_id === createForm.customerLocationId) || null, [createForm.customerLocationId, state.sites]);
  const activityObserved = normalized(checkForm.activityLevel) !== "none";

  async function post(body) {
    const response = await fetch("/api/service-management/monitoring-points", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, ...body }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.success) throw new Error(payload.error || "Monitoring point action failed.");
    return payload;
  }

  async function createPoint(event) {
    event.preventDefault();
    setSaving("create"); setMessage("");
    try {
      const result = await post({ action: "create", ...createForm, clientMutationId: crypto.randomUUID() });
      setCreateForm(INITIAL_CREATE); setCreateOpen(false);
      setMessage(`Monitoring point ${result.generated_code || "created"} is active and ready to scan.`);
      await load();
      if (result.row?.id) setSelectedId(result.row.id);
    } catch (error) { setMessage(error.message || "Unable to create monitoring point."); }
    finally { setSaving(""); }
  }

  async function recordCheck(event) {
    event.preventDefault();
    if (!selected?.id) return;
    if (activityObserved && !text(checkForm.pestName)) {
      setMessage("Tell Avantiqo what pest activity was found before saving this check.");
      return;
    }
    setSaving("check"); setMessage("");
    try {
      await post({ action: "check", pointId: selected.id, ...checkForm, count: activityObserved ? checkForm.count : "0", pestName: activityObserved ? checkForm.pestName : "", clientMutationId: crypto.randomUUID() });
      setCheckForm(INITIAL_CHECK); setMessage("Monitoring check saved to this exact point and customer site.");
      await load();
    } catch (error) { setMessage(error.message || "Unable to record monitoring check."); }
    finally { setSaving(""); }
  }

  async function transition(command) {
    if (!selected?.id) return;
    setSaving(command); setMessage("");
    try {
      await post({ action: "transition", pointId: selected.id, command, clientMutationId: crypto.randomUUID() });
      setMessage(command === "deactivate" ? "Monitoring point paused." : command === "activate" ? "Monitoring point reactivated." : "Monitoring point archived.");
      await load();
    } catch (error) { setMessage(error.message || "Unable to change monitoring point status."); }
    finally { setSaving(""); }
  }

  const fieldServiceHref = `/workspace/${encodeURIComponent(organizationId)}/operations/field-service`;
  const siteIntelligenceHref = `/workspace/${encodeURIComponent(organizationId)}/operations/field-service/site-intelligence`;

  return (
    <main className="min-h-[calc(100vh-61px)] bg-[#F7F6F3] px-4 py-5 text-[#191919] md:px-7 lg:px-9 lg:py-7">
      <div className="mx-auto max-w-[1580px]">
        <header className="flex flex-col gap-5 border-b border-black/[0.07] pb-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <Link href={fieldServiceHref} className="inline-flex items-center gap-1.5 text-[9px] text-[#8D867E] hover:text-[#79593A]"><ArrowLeft size={10} /> Pest Control</Link>
            <div className="mt-3 text-[10px] font-medium uppercase tracking-[0.18em] text-[#9A744B]">Monitoring control</div>
            <h1 className="mt-1 text-[27px] font-medium tracking-[-0.04em] text-[#201E1B]">Monitoring points</h1>
            <p className="mt-1 max-w-4xl text-[11px] leading-5 text-[#777169]">Staff record the physical point, where it is and what they actually find. Avantiqo owns the code, scan identity, site lineage and evidence history.</p>
          </div>
          <div className="flex items-center gap-2"><Link href={siteIntelligenceHref} className="rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-[9px] text-[#625D56]">Site intelligence</Link><button type="button" onClick={() => setCreateOpen((value) => !value)} className="inline-flex items-center gap-1.5 rounded-lg bg-[#28231E] px-3 py-2 text-[9px] font-medium text-white"><Plus size={11} /> Add monitoring point</button><button type="button" onClick={load} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-black/[0.08] bg-white text-[#806143]" aria-label="Refresh monitoring points"><RefreshCw size={11} className={state.loading ? "animate-spin" : ""} /></button></div>
        </header>

        {(state.error || message) ? <div className={`mt-4 flex items-start gap-2 rounded-xl border px-4 py-3 text-[10px] ${state.error || /unable|failed|required|already|before saving/i.test(message) ? "border-[#B36B52]/20 bg-[#B36B52]/[0.05] text-[#8B4937]" : "border-[#6F8B77]/20 bg-[#6F8B77]/[0.06] text-[#55705D]"}`}>{state.error ? <AlertTriangle size={12} className="mt-0.5" /> : <CheckCircle2 size={12} className="mt-0.5" />}{state.error || message}</div> : null}

        <section className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Metric label="Active" value={state.loading ? "…" : state.metrics.active || 0} detail="Points in service" />
          <Metric label="Due today" value={state.loading ? "…" : state.metrics.due_today || 0} detail="Checks due now" attention />
          <Metric label="Overdue" value={state.loading ? "…" : state.metrics.overdue || 0} detail="Checks missed" attention />
          <Metric label="Activity alerts" value={state.loading ? "…" : state.metrics.activity_alerts || 0} detail="High or critical pest activity" attention />
          <Metric label="Condition alerts" value={state.loading ? "…" : state.metrics.condition_alerts || 0} detail="Damaged, missing or blocked" attention />
          <Metric label="Never checked" value={state.loading ? "…" : state.metrics.unchecked || 0} detail="No field evidence yet" attention />
        </section>

        {createOpen ? <form onSubmit={createPoint} className="mt-4 rounded-2xl border border-[#D6A66A]/25 bg-white p-5"><div className="flex flex-col gap-2 border-b border-black/[0.06] pb-4 md:flex-row md:items-end md:justify-between"><div><div className="text-[9px] font-medium uppercase tracking-[0.12em] text-[#8A6846]">Add monitoring point</div><div className="mt-1 text-[10px] text-[#777169]">Tell Avantiqo what is physically installed and where. The system creates its code and scan identity automatically.</div></div>{selectedSite ? <div className="rounded-lg bg-[#F7F5F1] px-3 py-2 text-[8px] text-[#716A62]">{selectedSite.customer_name} · {selectedSite.customer_location_name}</div> : null}</div><div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3"><label><FieldLabel>Customer site</FieldLabel><select required value={createForm.customerLocationId} onChange={(e) => setCreateForm((f) => ({ ...f, customerLocationId: e.target.value }))} className="w-full rounded-lg border border-black/[0.09] bg-white px-3 py-2.5 text-[9px]"><option value="">Choose site</option>{state.sites.map((site) => <option key={site.customer_location_id} value={site.customer_location_id}>{site.customer_name} · {site.customer_location_name}</option>)}</select></label><label><FieldLabel>What is installed?</FieldLabel><select value={createForm.pointType} onChange={(e) => setCreateForm((f) => ({ ...f, pointType: e.target.value }))} className="w-full rounded-lg border border-black/[0.09] bg-white px-3 py-2.5 text-[9px]"><option value="rodent_bait_station">Rodent bait station</option><option value="rodent_trap">Rodent trap</option><option value="glue_board">Glue board</option><option value="insect_light_trap">Insect light trap</option><option value="termite_station">Termite station</option><option value="monitoring_trap">Monitoring trap</option><option value="other">Other monitoring point</option></select></label><label><FieldLabel>How often should it be checked?</FieldLabel><select value={createForm.checkCadenceDays} onChange={(e) => setCreateForm((f) => ({ ...f, checkCadenceDays: e.target.value }))} className="w-full rounded-lg border border-black/[0.09] bg-white px-3 py-2.5 text-[9px]">{CADENCES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label><FieldLabel>Area</FieldLabel><input required value={createForm.area} onChange={(e) => setCreateForm((f) => ({ ...f, area: e.target.value }))} placeholder="e.g. Kitchen, loading bay, room 204" className="w-full rounded-lg border border-black/[0.09] px-3 py-2.5 text-[9px] outline-none" /></label><label><FieldLabel>Exact placement</FieldLabel><input required value={createForm.placement} onChange={(e) => setCreateForm((f) => ({ ...f, placement: e.target.value }))} placeholder="e.g. Behind freezer, left side of rear door" className="w-full rounded-lg border border-black/[0.09] px-3 py-2.5 text-[9px] outline-none" /></label><label><FieldLabel optional>Existing physical label</FieldLabel><input value={createForm.barcode} onChange={(e) => setCreateForm((f) => ({ ...f, barcode: e.target.value }))} placeholder="Scan or type only if this device already has a label" className="w-full rounded-lg border border-black/[0.09] px-3 py-2.5 text-[9px] outline-none" /></label></div><div className="mt-4 flex items-center justify-between gap-4 rounded-xl bg-[#F7F5F1] px-4 py-3"><div className="text-[8px] leading-4 text-[#847D74]">No code, ID or system key is required from staff. Avantiqo creates them and keeps this point tied to the selected customer site.</div><button disabled={saving === "create"} className="shrink-0 rounded-lg bg-[#2A251F] px-4 py-2.5 text-[9px] font-medium text-white disabled:opacity-50">{saving === "create" ? "Creating…" : "Create & activate"}</button></div></form> : null}

        <section className="mt-4 grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
          <aside className="rounded-2xl border border-black/[0.07] bg-[#EEECE7]/65 p-3"><div className="rounded-xl border border-black/[0.06] bg-white p-2.5"><div className="flex items-center gap-2 rounded-lg border border-black/[0.07] bg-[#FAF9F7] px-3 py-2"><Search size={11} className="text-[#9B9389]" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Site, area or point" className="w-full bg-transparent text-[9px] outline-none placeholder:text-[#AAA39B]" /></div><div className="mt-2 flex rounded-lg bg-[#F3F1ED] p-1">{[["attention","Attention"],["overdue","Overdue"],["active","Active"],["all","All"]].map(([value,label]) => <button key={value} type="button" onClick={() => setView(value)} className={`flex-1 rounded-md px-2 py-1.5 text-[8px] font-medium ${view === value ? "bg-white text-[#5D4935] shadow-sm" : "text-[#8C857D]"}`}>{label}</button>)}</div></div><div className="mt-3 max-h-[720px] space-y-2 overflow-y-auto">{filtered.map((row) => <button key={row.id} type="button" onClick={() => setSelectedId(row.id)} className={`w-full rounded-xl border bg-white p-3.5 text-left ${selected?.id === row.id ? "border-[#C7A071] shadow-sm" : "border-black/[0.07]"}`}><div className="flex items-start justify-between gap-3"><div><div className="text-[11px] font-medium text-[#28231F]">{row.customer_location_name || row.code}</div><div className="mt-1 text-[8px] text-[#8C857D]">{row.area ? `${row.area} · ` : ""}{row.point_type_label || pointTypeLabel(row.point_type)}</div></div><StatusPill row={row} /></div><div className="mt-3 flex items-center gap-1.5 text-[8px] text-[#817A72]"><MapPin size={9} />{row.customer_name}{row.placement ? ` · ${row.placement}` : ""}</div><div className="mt-2 flex items-center justify-between text-[8px] text-[#9A948C]"><span>Last check {formatDate(row.latest_check?.checked_at)}</span><span className={activityTone(row.latest_check?.activity_level)}>{row.latest_check ? `${row.latest_check.activity_level} activity` : "Unchecked"}</span></div></button>)}{!state.loading && !filtered.length ? <div className="rounded-xl border border-dashed border-black/[0.09] bg-white/60 px-4 py-8 text-center text-[9px] text-[#938D85]">No monitoring points match this view.</div> : null}</div></aside>

          <div className="min-w-0">{!selected ? <div className="rounded-2xl border border-dashed border-black/[0.09] bg-white p-10 text-center text-[10px] text-[#8D877F]">Add the first monitoring point for a governed customer site.</div> : <><section className="rounded-2xl border border-black/[0.07] bg-white p-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><div className="flex items-center gap-2"><div className="text-[9px] font-medium uppercase tracking-[0.12em] text-[#94714E]">{selected.point_type_label || pointTypeLabel(selected.point_type)}</div><StatusPill row={selected} /></div><h2 className="mt-1 text-[22px] font-medium tracking-[-0.03em] text-[#27231F]">{selected.customer_location_name}</h2><div className="mt-1 flex items-center gap-1.5 text-[10px] text-[#837C74]"><MapPin size={11} />{selected.customer_name}{selected.area ? ` · ${selected.area}` : ""}{selected.placement ? ` · ${selected.placement}` : ""}</div><div className="mt-2 text-[8px] text-[#AAA39A]">System point {selected.code}{selected.barcode ? ` · Scan ${selected.barcode}` : ""}</div></div><div className="flex flex-wrap gap-2">{selected.barcode ? <div className="inline-flex items-center gap-1.5 rounded-lg border border-black/[0.08] bg-[#F8F7F4] px-3 py-2 text-[8px] text-[#6F6861]"><Barcode size={11} /> Scan ready</div> : null}{normalized(selected.status) === "active" ? <button onClick={() => transition("deactivate")} disabled={Boolean(saving)} className="rounded-lg border border-black/[0.08] px-3 py-2 text-[8px] text-[#716A62]">Pause point</button> : selected.allowed_commands?.includes("activate") ? <button onClick={() => transition("activate")} disabled={Boolean(saving)} className="rounded-lg border border-[#6F8B77]/20 bg-[#6F8B77]/[0.06] px-3 py-2 text-[8px] text-[#55705D]">Reactivate</button> : null}{selected.allowed_commands?.includes("archive") ? <button onClick={() => transition("archive")} disabled={Boolean(saving)} className="rounded-lg border border-[#B36B52]/15 px-3 py-2 text-[8px] text-[#8B4937]">Retire point</button> : null}</div></div><div className="mt-5 grid gap-3 md:grid-cols-4"><div className="rounded-xl bg-[#F7F5F1] p-3"><ShieldCheck size={13} className="text-[#987249]" /><div className="mt-2 text-[17px] font-medium">{selected.check_cadence_days || "—"}</div><div className="text-[8px] text-[#918A82]">Days between checks</div></div><div className="rounded-xl bg-[#F7F5F1] p-3"><CircleDot size={13} className="text-[#987249]" /><div className="mt-2 text-[17px] font-medium">{selected.check_count || 0}</div><div className="text-[8px] text-[#918A82]">Recorded checks</div></div><div className="rounded-xl bg-[#F7F5F1] p-3"><Wrench size={13} className="text-[#987249]" /><div className="mt-2 text-[17px] font-medium capitalize">{selected.latest_check?.condition || "Unchecked"}</div><div className="text-[8px] text-[#918A82]">Latest condition</div></div><div className="rounded-xl bg-[#F7F5F1] p-3"><AlertTriangle size={13} className="text-[#987249]" /><div className={`mt-2 text-[17px] font-medium capitalize ${activityTone(selected.latest_check?.activity_level)}`}>{selected.latest_check?.activity_level || "None"}</div><div className="text-[8px] text-[#918A82]">Latest pest activity</div></div></div></section>

          <div className="mt-4 grid gap-4 lg:grid-cols-2"><form onSubmit={recordCheck} className="rounded-2xl border border-black/[0.07] bg-white p-4"><div className="text-[9px] font-medium uppercase tracking-[0.12em] text-[#8B837A]">Check this point</div><div className="mt-1 text-[8px] text-[#9B948C]">Answer what you can see and what you did. Avantiqo handles the evidence identity.</div><div className="mt-4 space-y-4"><label><FieldLabel>What condition is the point in?</FieldLabel><select value={checkForm.condition} onChange={(e) => setCheckForm((f) => ({ ...f, condition: e.target.value }))} className="w-full rounded-lg border border-black/[0.09] px-3 py-2.5 text-[9px]"><option value="good">Good — no issue</option><option value="damaged">Damaged</option><option value="missing">Missing</option><option value="blocked">Access blocked</option><option value="contaminated">Contaminated</option><option value="replacement_required">Needs replacement</option></select></label><label><FieldLabel>What pest activity did you find?</FieldLabel><select value={checkForm.activityLevel} onChange={(e) => setCheckForm((f) => ({ ...f, activityLevel: e.target.value, ...(e.target.value === "none" ? { pestName: "", count: "0" } : {}) }))} className="w-full rounded-lg border border-black/[0.09] px-3 py-2.5 text-[9px]"><option value="none">No activity</option><option value="low">Low activity</option><option value="medium">Medium activity</option><option value="high">High activity</option><option value="critical">Critical activity</option></select></label>{activityObserved ? <div className="grid gap-3 sm:grid-cols-2"><label><FieldLabel>Which pest?</FieldLabel><input required value={checkForm.pestName} onChange={(e) => setCheckForm((f) => ({ ...f, pestName: e.target.value }))} placeholder="e.g. German cockroach" className="w-full rounded-lg border border-black/[0.09] px-3 py-2.5 text-[9px] outline-none" /></label><label><FieldLabel optional>How many?</FieldLabel><input type="number" min="0" max="100000" value={checkForm.count} onChange={(e) => setCheckForm((f) => ({ ...f, count: e.target.value }))} className="w-full rounded-lg border border-black/[0.09] px-3 py-2.5 text-[9px] outline-none" /></label></div> : null}<label><FieldLabel>What did you do?</FieldLabel><select value={checkForm.actionTaken} onChange={(e) => setCheckForm((f) => ({ ...f, actionTaken: e.target.value }))} className="w-full rounded-lg border border-black/[0.09] px-3 py-2.5 text-[9px]"><option value="inspected">Inspected only</option><option value="cleaned">Cleaned</option><option value="rebaited">Rebaited</option><option value="reset">Reset trap/device</option><option value="repaired">Repaired</option><option value="replaced">Replaced</option><option value="removed">Removed</option></select></label><label><FieldLabel optional>Anything the next person should know?</FieldLabel><textarea rows={3} value={checkForm.notes} onChange={(e) => setCheckForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Access issue, unusual activity, customer note, follow-up detail…" className="w-full resize-none rounded-lg border border-black/[0.09] px-3 py-2.5 text-[9px] outline-none" /></label></div><button disabled={saving === "check" || normalized(selected.status) !== "active"} className="mt-4 w-full rounded-lg bg-[#29241F] px-3 py-2.5 text-[9px] font-medium text-white disabled:opacity-40">{saving === "check" ? "Saving…" : "Save this check"}</button></form>

          <section className="rounded-2xl border border-black/[0.07] bg-white p-4"><div className="text-[9px] font-medium uppercase tracking-[0.12em] text-[#8B837A]">Point history</div><div className="mt-1 text-[8px] text-[#9B948C]">What was found and done at this exact point.</div><div className="mt-4 max-h-[500px] space-y-2 overflow-y-auto">{(selected.checks || []).map((check) => <div key={check.id} className="rounded-xl border border-black/[0.06] bg-[#FAF9F7] p-3"><div className="flex items-start justify-between gap-3"><div><div className="text-[9px] font-medium capitalize text-[#39332D]">{text(check.action_taken).replace(/_/g, " ")} · {text(check.condition).replace(/_/g, " ")}</div><div className="mt-1 text-[8px] text-[#8F887F]">{formatDate(check.checked_at)}{check.pest_name ? ` · ${check.pest_name}` : ""}{Number(check.count) ? ` · ${check.count}` : ""}</div></div><div className={`text-[8px] font-medium uppercase ${activityTone(check.activity_level)}`}>{check.activity_level}</div></div>{check.notes ? <div className="mt-2 text-[8px] leading-4 text-[#777067]">{check.notes}</div> : null}</div>)}{!(selected.checks || []).length ? <div className="rounded-xl border border-dashed border-black/[0.09] px-4 py-8 text-center text-[9px] text-[#958E86]">No checks recorded yet.</div> : null}</div></section></div>

          <div className="mt-4 rounded-xl border border-black/[0.06] bg-[#EEECE7]/70 px-4 py-3 text-[8px] leading-4 text-[#827B73]"><span className="font-medium text-[#5D564F]">How this works:</span> the customer site comes from the service plan, Avantiqo generates the point identity, each check is append-only evidence, and chemical/material stock stays under Supply Chain authority.</div></>}</div>
        </section>
      </div>
    </main>
  );
}
