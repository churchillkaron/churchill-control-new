"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Search, X } from "lucide-react";

import WorkspaceHeader from "@/components/workspace/WorkspaceHeader";
import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

function clean(value) {
  return value === undefined || value === null ? "" : String(value);
}

function createIdempotencyKey() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
}

function buildContextPayload({ organizationId, entityId, periodId }) {
  return {
    organization_id: organizationId,
    organizationId,
    entity_id: entityId || null,
    entityId: entityId || null,
    period_id: periodId || null,
    periodId: periodId || null,
  };
}

function recordLabel(record) {
  return record?.name || record?.code || record?.reference || record?.id || "Operations record";
}

export default function OperationsRuntimeWorkCenter({ capability }) {
  const businessContext = useBusinessContext() || {};
  const organizationId = businessContext.organization_id || businessContext.organization?.id || null;
  const entityId = businessContext.entity_id || businessContext.entity?.id || null;
  const periodId = businessContext.period_id || businessContext.period?.id || null;

  const capabilityId = capability?.capabilityId || capability?.runtime?.capability || capability?.id;
  const listApi = capability?.runtime?.listApi || capability?.ui?.api || `/api/operations/${capabilityId}`;
  const [rows, setRows] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    code: "",
    description: "",
    priority: "normal",
    status: "draft",
  });

  const contextPayload = useMemo(() => buildContextPayload({
    organizationId,
    entityId,
    periodId,
  }), [organizationId, entityId, periodId]);

  const load = useCallback(async () => {
    if (!organizationId || !capabilityId) {
      setRows([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({ organization_id: organizationId });
      if (entityId) params.set("entity_id", entityId);
      if (periodId) params.set("period_id", periodId);

      const response = await fetch(`${listApi}?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await response.json().catch(() => ({}));

      if (!response.ok || !json.ok) {
        throw new Error(json.error || "Operations data load failed.");
      }

      const nextRows = Array.isArray(json.rows) ? json.rows : [];
      setRows(nextRows);
      setSelectedId((current) => (
        current && nextRows.some((row) => row.id === current)
          ? current
          : nextRows[0]?.id || null
      ));
    } catch (loadError) {
      setRows([]);
      setError(loadError.message || "Operations data load failed.");
    } finally {
      setLoading(false);
    }
  }, [organizationId, entityId, periodId, capabilityId, listApi]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return rows;

    return rows.filter((row) => [
      row.name,
      row.code,
      row.description,
      row.status,
      row.priority,
      row.assigned_to,
      row.source_domain,
      row.source_type,
      row.source_id,
    ].filter(Boolean).join(" ").toLowerCase().includes(normalized));
  }, [rows, query]);

  const selected = filteredRows.find((row) => row.id === selectedId)
    || filteredRows[0]
    || null;

  async function executeCommand(command, payload = {}) {
    if (!organizationId || !capabilityId || !command) return;

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const endpoint = `/api/operations/${capabilityId}/commands/${command}`;
      const idempotencyKey = createIdempotencyKey();
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          ...contextPayload,
          ...payload,
          idempotency_key: idempotencyKey,
          idempotencyKey,
        }),
      });
      const json = await response.json().catch(() => ({}));

      if (!response.ok || !json.ok) {
        throw new Error(json.error || "Operations command failed.");
      }

      setNotice(`${command.replaceAll("_", " ")} completed.`);
      setCreateOpen(false);
      setForm({
        name: "",
        code: "",
        description: "",
        priority: "normal",
        status: "draft",
      });
      await load();
    } catch (commandError) {
      setError(commandError.message || "Operations command failed.");
    } finally {
      setSaving(false);
    }
  }

  function exportRows() {
    const payload = JSON.stringify(filteredRows, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${capabilityId}-operations.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const createCommand = capability?.create?.command || capability?.create?.action || null;
  const rowCommands = (capability?.ui?.rowMenu || []).filter((action) => (
    action?.command && action.command !== "open"
  ));

  return (
    <main className="min-h-screen px-6 py-7 text-white">
      <div className="mx-auto max-w-[1540px]">
        <WorkspaceHeader
          workspace="Operations"
          title={capability?.name || "Operations"}
          description={capability?.description || "Operational work centre."}
          actions={(
            <div className="flex flex-wrap gap-2">
              {capability?.create?.enabled && createCommand ? (
                <button
                  onClick={() => setCreateOpen(true)}
                  className="rounded-xl border border-[#D6A66A]/35 bg-[#D6A66A]/10 px-4 py-2 text-sm text-[#D6A66A]"
                >
                  {capability.create.label || "Create"}
                </button>
              ) : null}
              <button
                onClick={exportRows}
                className="rounded-xl border border-white/10 bg-white/[0.035] px-4 py-2 text-sm text-white/65"
              >
                Export
              </button>
              <button
                onClick={load}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-4 py-2 text-sm text-white/65"
              >
                <RefreshCw size={15} /> Refresh
              </button>
            </div>
          )}
        />

        {error ? (
          <div className="mb-5 rounded-2xl border border-red-400/25 bg-red-500/10 p-4 text-sm text-red-200">
            {error}
          </div>
        ) : null}
        {notice ? (
          <div className="mb-5 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-200">
            {notice}
          </div>
        ) : null}

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
          <div className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.28em] text-[#D6A66A]">Records</div>
                <div className="mt-2 text-sm text-white/40">{loading ? "Loading…" : `${filteredRows.length} records`}</div>
              </div>
              <div className="flex w-full items-center rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-white/45 md:w-[340px]">
                <Search size={16} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search records…"
                  className="ml-3 w-full bg-transparent text-sm text-white outline-none placeholder:text-white/30"
                />
              </div>
            </div>

            <div className="space-y-2">
              {filteredRows.map((row) => (
                <button
                  key={row.id}
                  onClick={() => setSelectedId(row.id)}
                  className={`w-full rounded-2xl border p-4 text-left transition ${selected?.id === row.id ? "border-[#D6A66A]/40 bg-[#D6A66A]/10" : "border-white/10 bg-black/20 hover:border-white/20"}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold text-white">{recordLabel(row)}</div>
                      <div className="mt-1 text-xs text-white/35">{row.description || row.record_type || capability?.recordType}</div>
                    </div>
                    <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-white/40">
                      {row.status || "unknown"}
                    </span>
                  </div>
                </button>
              ))}

              {!loading && filteredRows.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-black/20 p-6 text-sm text-white/40">
                  No Operations records in this scope.
                </div>
              ) : null}
            </div>
          </div>

          <aside className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5">
            <div className="text-xs uppercase tracking-[0.28em] text-[#D6A66A]">Record detail</div>
            {selected ? (
              <div className="mt-5 space-y-4">
                <div>
                  <div className="text-xl font-semibold text-white">{recordLabel(selected)}</div>
                  <div className="mt-1 text-sm text-white/40">{selected.description || "No description"}</div>
                </div>

                <dl className="grid grid-cols-2 gap-3 text-sm">
                  {[
                    ["Status", selected.status],
                    ["Priority", selected.priority],
                    ["Code", selected.code],
                    ["Last command", selected.last_command],
                    ["Source", selected.source_domain],
                    ["Source ID", selected.source_id],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl border border-white/10 bg-black/20 p-3">
                      <dt className="text-[10px] uppercase tracking-[0.16em] text-white/30">{label}</dt>
                      <dd className="mt-1 break-all text-white/70">{clean(value) || "—"}</dd>
                    </div>
                  ))}
                </dl>

                {rowCommands.length ? (
                  <div className="flex flex-wrap gap-2 border-t border-white/10 pt-4">
                    {rowCommands.map((action) => (
                      <button
                        key={action.command}
                        disabled={saving}
                        onClick={() => executeCommand(action.command, { id: selected.id, record_id: selected.id })}
                        className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/65 transition hover:border-[#D6A66A]/35 hover:text-[#D6A66A] disabled:opacity-50"
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="mt-5 text-sm text-white/40">Select a record to inspect it.</div>
            )}
          </aside>
        </section>
      </div>

      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-5 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-[30px] border border-white/10 bg-[#101010] p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.28em] text-[#D6A66A]">New record</div>
                <h2 className="mt-2 text-2xl font-semibold text-white">{capability?.name}</h2>
              </div>
              <button onClick={() => setCreateOpen(false)} className="rounded-xl border border-white/10 p-2 text-white/45"><X size={18} /></button>
            </div>

            <div className="mt-6 space-y-4">
              {[
                ["name", "Name"],
                ["code", "Code"],
                ["description", "Description"],
                ["priority", "Priority"],
                ["status", "Status"],
              ].map(([field, label]) => (
                <label key={field} className="block">
                  <span className="text-xs uppercase tracking-[0.16em] text-white/35">{label}</span>
                  {field === "description" ? (
                    <textarea
                      value={form[field]}
                      onChange={(event) => setForm((current) => ({ ...current, [field]: event.target.value }))}
                      className="mt-2 min-h-28 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-[#D6A66A]/40"
                    />
                  ) : (
                    <input
                      value={form[field]}
                      onChange={(event) => setForm((current) => ({ ...current, [field]: event.target.value }))}
                      className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-[#D6A66A]/40"
                    />
                  )}
                </label>
              ))}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setCreateOpen(false)} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-white/55">Cancel</button>
              <button
                disabled={saving || !form.name.trim()}
                onClick={() => executeCommand(createCommand, form)}
                className="rounded-xl border border-[#D6A66A]/35 bg-[#D6A66A]/10 px-4 py-2 text-sm text-[#D6A66A] disabled:opacity-50"
              >
                {saving ? "Saving…" : capability?.create?.label || "Create"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
