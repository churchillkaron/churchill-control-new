"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CircleAlert, FileCheck2, FileUp, LoaderCircle, RefreshCw, ShieldCheck } from "lucide-react";

const label = (value) => String(value || "").replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const shortDate = (value) => value ? String(value).slice(0, 10) : "—";
function tone(status) {
  const value = String(status || "").toUpperCase();
  if (["CREATED","READY_FOR_CREATE_AND_MATCH"].includes(value)) return "border-emerald-700/15 bg-emerald-50 text-emerald-800";
  if (["CLARIFICATION_REQUIRED","FAILED","DUPLICATE"].includes(value)) return "border-amber-700/15 bg-amber-50 text-amber-900";
  return "border-black/[0.07] bg-white text-[#665F57]";
}

export default function FinanceApIntakePanel({ organizationId, entityId, onVendorBillsChanged }) {
  const inputRef = useRef(null);
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(true);

  const load = useCallback(async () => {
    if (!organizationId || !entityId) return;
    try {
      setError("");
      const url = new URL("/api/finance/vendor-invoices/intake", window.location.origin);
      url.searchParams.set("organizationId", organizationId); url.searchParams.set("entityId", entityId);
      const response = await fetch(url.toString(), { cache: "no-store", credentials: "include" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) throw new Error(body?.error || "Unable to load AP inbox");
      setRows(body.rows || []);
    } catch (e) { setError(e?.message || "Unable to load AP inbox"); }
  }, [entityId, organizationId]);
  useEffect(() => { load(); }, [load]);

  async function upload(files) {
    if (!files?.length) return;
    try {
      setBusy("upload"); setError("");
      const form = new FormData(); form.set("organizationId", organizationId); form.set("entityId", entityId);
      for (const file of Array.from(files).slice(0, 20)) form.append("files", file);
      const response = await fetch("/api/finance/vendor-invoices/intake", { method: "POST", credentials: "include", body: form });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) throw new Error(body?.error || "Supplier invoice intake failed");
      setRows((current) => [...(body.rows || []), ...current.filter((row) => !(body.rows || []).some((next) => next.id === row.id))]);
      if (inputRef.current) inputRef.current.value = "";
    } catch (e) { setError(e?.message || "Supplier invoice intake failed"); }
    finally { setBusy(""); }
  }

  async function confirm(row) {
    try {
      setBusy(row.id); setError("");
      const response = await fetch("/api/finance/vendor-invoices/intake", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId, entityId, intakeId: row.id }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) throw new Error(body?.error || "Unable to create vendor bill");
      await load(); await onVendorBillsChanged?.();
    } catch (e) { setError(e?.message || "Unable to create vendor bill"); await load(); }
    finally { setBusy(""); }
  }

  const pending = rows.filter((row) => !["CREATED","DUPLICATE"].includes(String(row.preparation_status || "").toUpperCase()));
  return <section className="mt-4 rounded-2xl border border-black/[0.07] bg-white">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/[0.06] px-4 py-3">
      <button type="button" onClick={() => setExpanded((value) => !value)} className="text-left"><div className="flex items-center gap-2 text-[11px] font-semibold text-[#3E3933]"><FileCheck2 size={14} className="text-[#A37849]"/>AP Inbox</div><div className="mt-0.5 text-[9px] text-[#918B83]">Upload supplier invoices → extract → exact procurement match → confirm → approval queue.</div></button>
      <div className="flex items-center gap-2"><span className="rounded-full bg-[#F3EFE9] px-2 py-1 text-[8px] font-semibold text-[#776A5D]">{pending.length} pending</span><input ref={inputRef} type="file" multiple accept="application/pdf,image/*,.csv,.xlsx,.xls" onChange={(event) => upload(event.target.files)} className="hidden"/><button type="button" disabled={Boolean(busy) || !entityId} onClick={() => inputRef.current?.click()} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#1F1E1B] px-3 text-[9px] font-semibold text-white disabled:opacity-40"><FileUp size={11}/>{busy === "upload" ? "Analyzing…" : "Upload supplier invoice"}</button><button type="button" onClick={load} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-black/[0.08] bg-white"><RefreshCw size={11}/></button></div>
    </div>
    {expanded ? <div className="p-3">
      {error ? <div className="mb-3 flex gap-2 rounded-xl border border-red-700/15 bg-red-50 p-3 text-[9px] text-red-800"><CircleAlert size={12} className="shrink-0"/>{error}</div> : null}
      {!rows.length ? <div className="rounded-xl bg-[#F8F6F2] p-5 text-center text-[9px] text-[#8D857C]">No supplier invoices in the AP inbox yet. Upload a PDF or image and Avantiqo will prepare it without creating accounting entries.</div> : <div className="space-y-2">{rows.slice(0, 12).map((row) => {
        const evidence = row.preparation_evidence?.prepared_candidate || {};
        const procurement = evidence.procurement_evidence || {};
        const canConfirm = ["READY_FOR_REVIEW","READY_FOR_CREATE_AND_MATCH"].includes(String(row.preparation_status || "").toUpperCase());
        return <div key={row.id} className="grid gap-3 rounded-xl border border-black/[0.06] bg-[#FCFBF9] p-3 lg:grid-cols-[minmax(180px,1.2fr)_minmax(170px,1fr)_minmax(170px,1fr)_auto] lg:items-center"><div className="min-w-0"><div className="truncate text-[10px] font-semibold text-[#403A34]">{row.source_file_name || row.invoice_number || "Supplier invoice"}</div><div className="mt-1 text-[8px] text-[#918B83]">{row.invoice_number || "Invoice number pending"} · {shortDate(row.invoice_date)}{row.currency_code ? ` · ${row.currency_code}` : ""}</div></div><div className="text-[8px]"><div className="text-[#9A9289]">Procurement evidence</div><div className="mt-1 font-semibold text-[#5C554E]">{procurement.purchase_order_number || procurement.purchase_order_reference || label(procurement.status || "Non-PO / review")}{procurement.goods_receipt_number ? ` · ${procurement.goods_receipt_number}` : ""}</div></div><div><span className={`rounded-full border px-2 py-1 text-[8px] font-semibold ${tone(row.preparation_status)}`}>{label(row.touchless_stage || row.preparation_status)}</span>{row.clarification_question ? <div className="mt-1 max-w-sm text-[8px] leading-4 text-amber-800">{row.clarification_question}</div> : null}</div><div>{canConfirm ? <button type="button" disabled={Boolean(busy)} onClick={() => confirm(row)} className="inline-flex h-8 min-w-[130px] items-center justify-center gap-1.5 rounded-lg bg-[#76583A] px-3 text-[8px] font-semibold text-white disabled:opacity-40">{busy === row.id ? <LoaderCircle size={10} className="animate-spin"/> : <ShieldCheck size={10}/>}Confirm & create bill</button> : row.preparation_status === "CREATED" ? <div className="text-[8px] font-semibold text-emerald-700">Created · approval still required</div> : row.preparation_status === "DUPLICATE" ? <div className="text-[8px] font-semibold text-amber-800">Existing vendor bill found</div> : null}</div></div>;
      })}</div>}
    </div> : null}
  </section>;
}
