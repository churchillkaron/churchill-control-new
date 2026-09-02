"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  KeyRound,
  LoaderCircle,
  MapPin,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings2,
  X,
} from "lucide-react";

const DEFINITIONS = {
  "legal-entities": {
    title: "Legal Entities",
    subtitle: "Maintain legal and accounting entity structure without hardcoded jurisdiction, tax or currency assumptions.",
    resource: "legal-entities",
    icon: Building2,
    columns: [["code", "Code"], ["display_name", "Entity"], ["country", "Country"], ["currency", "Currency"], ["timezone", "Timezone"], ["is_active", "Active"]],
    fields: [
      ["code", "Code", "text", true],
      ["legal_name", "Legal name", "text", true],
      ["display_name", "Display name", "text", true],
      ["registration_number", "Registration number", "text"],
      ["tax_id", "Tax identifier", "text"],
      ["country", "Country / jurisdiction", "text"],
      ["currency", "Functional currency", "text"],
      ["timezone", "Timezone", "text"],
      ["locale", "Locale", "text"],
      ["address", "Registered address", "textarea"],
      ["phone", "Phone", "text"],
      ["email", "Email", "email"],
      ["is_holding_company", "Holding company", "checkbox"],
      ["is_default_accounting_entity", "Default accounting entity", "checkbox"],
      ["is_active", "Active", "checkbox"],
    ],
  },
  "business-locations": {
    title: "Business Locations",
    subtitle: "Operational locations with local timezone, currency and contact context. Values remain organization-configured.",
    resource: "business-locations",
    icon: MapPin,
    columns: [["code", "Code"], ["name", "Location"], ["location_type", "Type"], ["city", "City"], ["timezone", "Timezone"], ["status", "Status"]],
    fields: [
      ["code", "Code", "text", true],
      ["name", "Location name", "text", true],
      ["description", "Description", "textarea"],
      ["location_type", "Location type", "text"],
      ["status", "Status", "text"],
      ["address", "Address", "textarea"],
      ["city", "City", "text"],
      ["province", "State / province", "text"],
      ["postal_code", "Postal code", "text"],
      ["country", "Country", "text"],
      ["timezone", "Timezone", "text"],
      ["currency_code", "Currency", "text"],
      ["phone", "Phone", "text"],
      ["email", "Email", "email"],
      ["is_default", "Default location", "checkbox"],
    ],
  },
  modules: {
    title: "Modules & Features",
    subtitle: "Control which Avantiqo domains/capabilities are enabled for this organization without changing core business truth.",
    resource: "modules",
    icon: Settings2,
    columns: [["module_id", "Module"], ["status", "Status"], ["created_at", "Added"]],
    fields: [
      ["module_id", "Module ID", "text", true],
      ["status", "Status", "text", true],
    ],
  },
  permissions: {
    title: "Roles & Permissions",
    subtitle: "Organization-scoped role permissions. Roles are organization-defined identifiers and are not tied to any industry.",
    resource: "permissions",
    icon: KeyRound,
    columns: [["role", "Role"], ["module", "Module"], ["can_view", "View"], ["can_create", "Create"], ["can_update", "Update"], ["can_delete", "Delete"]],
    fields: [
      ["role", "Role identifier", "text", true],
      ["module", "Module / capability", "text", true],
      ["can_view", "Can view", "checkbox"],
      ["can_create", "Can create", "checkbox"],
      ["can_update", "Can update", "checkbox"],
      ["can_delete", "Can delete", "checkbox"],
    ],
  },
};

function emptyForm(definition) {
  return Object.fromEntries((definition.fields || []).map(([name, , type]) => [name, type === "checkbox" ? false : ""]));
}

function display(value, type) {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value === null || value === undefined || value === "") return "—";
  if (type === "date" || String(value).includes("T")) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toLocaleDateString();
  }
  return String(value);
}

export default function AdministrationRecordsWorkspace({ organizationId, mode }) {
  const definition = DEFINITIONS[mode] || DEFINITIONS["legal-entities"];
  const Icon = definition.icon;
  const [rows, setRows] = useState([]);
  const [writable, setWritable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(() => emptyForm(definition));

  useEffect(() => {
    setForm(emptyForm(definition));
    setEditingId(null);
    setEditorOpen(false);
  }, [mode]);

  async function load() {
    if (!organizationId) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ organizationId, resource: definition.resource });
      const response = await fetch(`/api/workspace/administration/records?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || json?.success === false) throw new Error(json?.error || `Administration records failed (${response.status})`);
      setRows(Array.isArray(json.rows) ? json.rows : []);
      setWritable(json.writable === true);
    } catch (loadError) {
      setRows([]);
      setError(loadError?.message || "Administration records could not be loaded");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [organizationId, definition.resource]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => Object.values(row || {}).some((value) => typeof value === "string" && value.toLowerCase().includes(needle)));
  }, [rows, query]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm(definition));
    setEditorOpen(true);
    setError("");
    setStatus("");
  }

  function openEdit(row) {
    const next = {};
    for (const [name, , type] of definition.fields) {
      next[name] = type === "checkbox" ? Boolean(row?.[name]) : row?.[name] ?? "";
    }
    setEditingId(row.id);
    setForm(next);
    setEditorOpen(true);
    setError("");
    setStatus("");
  }

  async function save() {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      for (const [name, label, type, required] of definition.fields) {
        if (!required) continue;
        const value = form[name];
        if (type !== "checkbox" && !String(value || "").trim()) throw new Error(`${label} is required`);
      }

      const data = {};
      for (const [name, , type] of definition.fields) {
        const value = form[name];
        if (type === "checkbox") data[name] = Boolean(value);
        else if (value !== "") data[name] = value;
      }

      const response = await fetch("/api/workspace/administration/records", {
        method: editingId ? "PATCH" : "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ organizationId, resource: definition.resource, id: editingId || undefined, data }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || json?.success === false) throw new Error(json?.error || `Save failed (${response.status})`);
      setStatus(editingId ? "Configuration updated and audited." : "Configuration created and audited.");
      setEditorOpen(false);
      setEditingId(null);
      await load();
    } catch (saveError) {
      setError(saveError?.message || "Administration record could not be saved");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#F7F6F3] p-4 text-[#1B1A18] md:p-6 lg:p-8">
      <div className="mx-auto max-w-[1600px] space-y-4">
        <section className="rounded-[24px] border border-black/[0.075] bg-white p-5 md:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <Link href={`/workspace/${organizationId}/administration`} className="inline-flex items-center gap-1.5 text-[10px] font-medium text-[#8B6238]"><ArrowLeft size={11} /> Administration</Link>
              <div className="mt-3 flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F5F2ED] text-[#A37849]"><Icon size={17} /></span><h1 className="text-[27px] font-semibold tracking-[-0.035em]">{definition.title}</h1></div>
              <p className="mt-2 max-w-3xl text-[12px] leading-5 text-[#77726A]">{definition.subtitle}</p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={load} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-xl border border-black/[0.09] bg-white px-3.5 text-[11px] font-medium text-[#4B4842]"><RefreshCw size={13} className={loading ? "animate-spin" : ""} />Refresh</button>
              {writable ? <button type="button" onClick={openCreate} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#1F1E1B] px-3.5 text-[11px] font-medium text-white"><Plus size={13} />New</button> : null}
            </div>
          </div>
        </section>

        {error ? <div className="rounded-xl border border-red-700/15 bg-red-50 px-4 py-3 text-[11px] text-red-800"><AlertTriangle size={13} className="mr-2 inline" />{error}</div> : null}
        {status ? <div className="rounded-xl border border-emerald-700/15 bg-emerald-50 px-4 py-3 text-[11px] text-emerald-800">{status}</div> : null}

        <section className="overflow-hidden rounded-[22px] border border-black/[0.075] bg-white">
          <div className="flex flex-col gap-3 border-b border-black/[0.06] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-[11px] text-[#77726A]">{filtered.length} record{filtered.length === 1 ? "" : "s"}</div>
            <label className="relative"><Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#99938B]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" className="h-9 w-full rounded-lg border border-black/[0.09] bg-[#FCFBF9] pl-8 pr-3 text-[11px] outline-none focus:border-[#D6A66A] sm:w-64" /></label>
          </div>

          {loading ? <div className="flex min-h-56 items-center justify-center text-[12px] text-[#817D76]"><LoaderCircle size={16} className="mr-2 animate-spin" />Loading…</div> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] border-collapse text-left">
                <thead className="bg-[#FAF9F7] text-[9px] font-medium uppercase tracking-[0.13em] text-[#817D76]"><tr>{definition.columns.map(([, label]) => <th key={label} className="px-4 py-3">{label}</th>)}{writable ? <th className="w-20 px-4 py-3" /> : null}</tr></thead>
                <tbody className="divide-y divide-black/[0.055] text-[11px]">
                  {filtered.map((row) => <tr key={row.id} className="hover:bg-[#FCFBF9]">{definition.columns.map(([name]) => <td key={name} className="max-w-[320px] truncate px-4 py-3.5 text-[#5E5952]">{display(row?.[name])}</td>)}{writable ? <td className="px-4 py-3.5 text-right"><button type="button" onClick={() => openEdit(row)} className="rounded-lg border border-black/[0.08] px-2.5 py-1.5 text-[9px] font-medium text-[#6D675F]">Edit</button></td> : null}</tr>)}
                  {!filtered.length ? <tr><td colSpan={definition.columns.length + (writable ? 1 : 0)} className="px-4 py-12 text-center text-[11px] text-[#8A867F]">No records yet.</td></tr> : null}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {editorOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[24px] border border-black/[0.09] bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4"><div><div className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#A37849]">{editingId ? "Edit" : "Create"}</div><h2 className="mt-1 text-[21px] font-semibold tracking-[-0.025em]">{definition.title}</h2></div><button type="button" onClick={() => setEditorOpen(false)} className="rounded-lg border border-black/[0.08] p-2 text-[#77716A]"><X size={15} /></button></div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {definition.fields.map(([name, label, type, required]) => (
                <label key={name} className={type === "textarea" ? "sm:col-span-2" : ""}>
                  <span className="mb-1.5 block text-[9px] font-medium uppercase tracking-[0.13em] text-[#77716A]">{label}{required ? " *" : ""}</span>
                  {type === "textarea" ? <textarea value={form[name] ?? ""} onChange={(event) => setForm((current) => ({ ...current, [name]: event.target.value }))} rows={3} className="w-full rounded-xl border border-black/[0.09] bg-[#FCFBF9] px-3 py-2.5 text-[11px] outline-none focus:border-[#D6A66A]" /> : type === "checkbox" ? <button type="button" onClick={() => setForm((current) => ({ ...current, [name]: !current[name] }))} className={`flex h-10 w-full items-center justify-between rounded-xl border px-3 text-[11px] ${form[name] ? "border-emerald-700/20 bg-emerald-50 text-emerald-800" : "border-black/[0.09] bg-[#FCFBF9] text-[#77716A]"}`}><span>{form[name] ? "Yes" : "No"}</span><span className={`h-4 w-4 rounded-full ${form[name] ? "bg-emerald-600" : "bg-[#D6D1C9]"}`} /></button> : <input type={type === "email" ? "email" : "text"} value={form[name] ?? ""} onChange={(event) => setForm((current) => ({ ...current, [name]: event.target.value }))} className="h-10 w-full rounded-xl border border-black/[0.09] bg-[#FCFBF9] px-3 text-[11px] outline-none focus:border-[#D6A66A]" />}
                </label>
              ))}
            </div>
            <div className="mt-6 flex gap-3"><button type="button" onClick={() => setEditorOpen(false)} className="h-11 flex-1 rounded-xl border border-black/[0.09] text-[11px] font-medium text-[#625D56]">Cancel</button><button type="button" onClick={save} disabled={busy} className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#1F1E1B] text-[11px] font-medium text-white disabled:opacity-40"><Save size={13} />{busy ? "Saving…" : "Save"}</button></div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
