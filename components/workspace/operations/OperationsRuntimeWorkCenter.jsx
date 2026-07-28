"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Search, X } from "lucide-react";

import WorkspaceHeader from "@/components/workspace/WorkspaceHeader";
import { useBusinessContext } from "@/app/providers/BusinessContextProvider";
import OperationsRecordHistoryPanel from "./OperationsRecordHistoryPanel";
import {
  buildOperationsFormPayload,
  getOperationsFormSchema,
  getOperationsInitialValues,
  validateOperationsForm,
} from "@/lib/operations/forms/OperationsFormSchemaRegistry";
import {
  buildOperationsCommandPayload,
  getOperationsCommandInitialValues,
  getOperationsCommandSchema,
  validateOperationsCommand,
} from "@/lib/operations/forms/OperationsCommandSchemaRegistry";

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
  return record?.name
    || record?.code
    || record?.reference
    || record?.id
    || "Operations record";
}

function titleCase(value) {
  return String(value || "")
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function Field({ field, value, onChange, lookupOptions = [] }) {
  const common = {
    value: value ?? "",
    onChange: (event) => onChange(field.name, event.target.value),
    className: "mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-[#D6A66A]/40",
    required: Boolean(field.required),
  };

  return (
    <label className="block">
      <span className="text-xs uppercase tracking-[0.16em] text-white/35">
        {field.label}{field.required ? " *" : ""}
      </span>

      {field.type === "textarea" ? (
        <textarea
          {...common}
          placeholder={field.placeholder}
          className={`${common.className} min-h-28`}
        />
      ) : field.type === "select" ? (
        <select {...common}>
          {(field.options || []).map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      ) : field.type === "lookup" ? (
        <select {...common}>
          <option value="">Select {field.label.toLowerCase()}</option>
          {lookupOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      ) : (
        <input
          {...common}
          type={field.type || "text"}
          step={field.step}
          placeholder={field.placeholder}
        />
      )}
    </label>
  );
}

export default function OperationsRuntimeWorkCenter({ capability }) {
  const businessContext = useBusinessContext() || {};
  const organizationId = businessContext.organization_id
    || businessContext.organization?.id
    || null;
  const entityId = businessContext.entity_id
    || businessContext.entity?.id
    || null;
  const periodId = businessContext.period_id
    || businessContext.period?.id
    || null;

  const capabilityId = capability?.capabilityId
    || capability?.runtime?.capability
    || capability?.id;
  const listApi = capability?.runtime?.listApi
    || capability?.ui?.api
    || `/api/operations/${capabilityId}`;
  const formSchema = useMemo(
    () => getOperationsFormSchema(capability),
    [capability],
  );
  const initialValues = useMemo(
    () => getOperationsInitialValues(capability),
    [capability],
  );

  const [rows, setRows] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(initialValues);
  const [commandModal, setCommandModal] = useState(null);
  const [commandValues, setCommandValues] = useState({});
  const [assignees, setAssignees] = useState([]);
  const [assigneesLoading, setAssigneesLoading] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  useEffect(() => {
    setForm(initialValues);
  }, [initialValues]);

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

      const response = await fetch(
        `${listApi}?${params.toString()}`,
        { cache: "no-store" },
      );
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
      JSON.stringify(row.attributes || {}),
    ].filter(Boolean).join(" ").toLowerCase().includes(normalized));
  }, [rows, query]);

  const selected = filteredRows.find((row) => row.id === selectedId)
    || filteredRows[0]
    || null;

  const createCommand = capability?.create?.command
    || capability?.create?.action
    || null;
  const rowActionMap = useMemo(() => new Map(
    (capability?.ui?.rowMenu || [])
      .filter((action) => action?.command)
      .map((action) => [action.command, action]),
  ), [capability]);

  const allowedCommands = Array.isArray(selected?.allowed_commands)
    ? selected.allowed_commands
    : [];

  const rowCommands = allowedCommands.map((command) => (
    rowActionMap.get(command) || {
      id: command,
      command,
      label: titleCase(command),
    }
  ));

  async function loadAssignees() {
    if (!organizationId || assigneesLoading || assignees.length > 0) return;

    setAssigneesLoading(true);

    try {
      const params = new URLSearchParams({ organizationId });
      const response = await fetch(
        `/api/platform/users/assignable?${params.toString()}`,
        { cache: "no-store" },
      );
      const json = await response.json().catch(() => ({}));

      if (!response.ok || !json.success) {
        throw new Error(json.error || "Assignable users could not be loaded.");
      }

      setAssignees((json.users || []).map((user) => ({
        value: user.party_id || user.staff_id,
        label: [user.name, user.position || user.role, user.department]
          .filter(Boolean)
          .join(" · "),
        party_id: user.party_id || null,
        staff_id: user.staff_id || null,
      })).filter((option) => option.value));
    } catch (lookupError) {
      setError(lookupError.message || "Assignable users could not be loaded.");
    } finally {
      setAssigneesLoading(false);
    }
  }

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

      setNotice(`${titleCase(command)} completed.`);
      setCreateOpen(false);
      setCommandModal(null);
      setCommandValues({});
      setForm(initialValues);
      await load();
      setHistoryRefreshKey((current) => current + 1);
    } catch (commandError) {
      setError(commandError.message || "Operations command failed.");
    } finally {
      setSaving(false);
    }
  }

  function submitCreate() {
    const missing = validateOperationsForm(formSchema, form);
    if (missing.length > 0) {
      setError(`Complete required fields: ${missing.join(", ")}`);
      return;
    }

    executeCommand(
      createCommand,
      buildOperationsFormPayload(formSchema, form),
    );
  }

  async function openCommand(command) {
    if (!selected || !allowedCommands.includes(command)) return;

    const schema = getOperationsCommandSchema(command);
    setError("");
    setCommandValues(getOperationsCommandInitialValues(command, selected));
    setCommandModal(schema);

    if (schema.fields.some((field) => field.optionsSource === "assignable-users")) {
      await loadAssignees();
    }
  }

  function submitCommand() {
    if (!selected || !commandModal) return;

    const missing = validateOperationsCommand(commandModal, commandValues);
    if (missing.length > 0) {
      setError(`Complete required fields: ${missing.join(", ")}`);
      return;
    }

    executeCommand(commandModal.command, {
      id: selected.id,
      record_id: selected.id,
      ...buildOperationsCommandPayload(
        commandModal,
        commandValues,
        { assignees },
      ),
    });
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
                  type="button"
                  onClick={() => {
                    setForm(initialValues);
                    setCreateOpen(true);
                  }}
                  className="rounded-xl border border-[#D6A66A]/35 bg-[#D6A66A]/10 px-4 py-2 text-sm text-[#D6A66A]"
                >
                  {capability.create.label || "Create"}
                </button>
              ) : null}
              <button
                type="button"
                onClick={exportRows}
                className="rounded-xl border border-white/10 bg-white/[0.035] px-4 py-2 text-sm text-white/65"
              >
                Export
              </button>
              <button
                type="button"
                onClick={load}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-4 py-2 text-sm text-white/65"
              >
                <RefreshCw size={15} /> Refresh
              </button>
            </div>
          )}
        />

        {capability?.boundary ? (
          <div className="mb-5 rounded-2xl border border-[#D6A66A]/20 bg-[#D6A66A]/[0.06] p-4 text-sm text-white/60">
            <span className="font-semibold text-[#D6A66A]">Boundary:</span> {capability.boundary}
          </div>
        ) : null}
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
                <div className="mt-2 text-sm text-white/40">
                  {loading ? "Loading…" : `${filteredRows.length} records`}
                </div>
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
                  type="button"
                  key={row.id}
                  onClick={() => setSelectedId(row.id)}
                  className={`w-full rounded-2xl border p-4 text-left transition ${selected?.id === row.id ? "border-[#D6A66A]/40 bg-[#D6A66A]/10" : "border-white/10 bg-black/20 hover:border-white/20"}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold text-white">{recordLabel(row)}</div>
                      <div className="mt-1 text-xs text-white/35">
                        {row.description || row.record_type || capability?.recordType}
                      </div>
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
                  <div className="mt-1 text-sm text-white/40">
                    {selected.description || "No description"}
                  </div>
                </div>

                <dl className="grid grid-cols-2 gap-3 text-sm">
                  {[
                    ["Status", selected.status],
                    ["Priority", selected.priority],
                    ["Code", selected.code],
                    ["Last command", selected.last_command],
                    ["Assignee", selected.attributes?.assignee_name || selected.assigned_to],
                    ["Source", selected.source_domain],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl border border-white/10 bg-black/20 p-3">
                      <dt className="text-[10px] uppercase tracking-[0.16em] text-white/30">{label}</dt>
                      <dd className="mt-1 break-all text-white/70">{clean(value) || "—"}</dd>
                    </div>
                  ))}
                </dl>

                {selected.attributes && Object.keys(selected.attributes).length > 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="text-[10px] uppercase tracking-[0.16em] text-white/30">Operational details</div>
                    <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap text-xs leading-5 text-white/60">
                      {JSON.stringify(selected.attributes, null, 2)}
                    </pre>
                  </div>
                ) : null}

                <OperationsRecordHistoryPanel
                  capabilityId={capabilityId}
                  recordId={selected.id}
                  organizationId={organizationId}
                  entityId={entityId}
                  periodId={periodId}
                  refreshKey={historyRefreshKey}
                />

                {rowCommands.length ? (
                  <div className="flex flex-wrap gap-2 border-t border-white/10 pt-4">
                    {rowCommands.map((action) => (
                      <button
                        type="button"
                        key={action.command}
                        disabled={saving}
                        onClick={() => openCommand(action.command)}
                        className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/65 transition hover:border-[#D6A66A]/35 hover:text-[#D6A66A] disabled:opacity-50"
                      >
                        {action.label || titleCase(action.command)}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="border-t border-white/10 pt-4 text-xs text-white/35">
                    No further lifecycle actions are available from this state.
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-5 text-sm text-white/40">Select a record to inspect it.</div>
            )}
          </aside>
        </section>
      </div>

      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-5 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[30px] border border-white/10 bg-[#101010] p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.28em] text-[#D6A66A]">New record</div>
                <h2 className="mt-2 text-2xl font-semibold text-white">{capability?.name}</h2>
                <p className="mt-2 text-sm text-white/40">{capability?.description}</p>
              </div>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="rounded-xl border border-white/10 p-2 text-white/45"
                aria-label="Close create form"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {formSchema.map((field) => (
                <div
                  key={field.name}
                  className={field.type === "textarea" ? "md:col-span-2" : ""}
                >
                  <Field
                    field={field}
                    value={form[field.name]}
                    onChange={(name, value) => setForm((current) => ({
                      ...current,
                      [name]: value,
                    }))}
                  />
                </div>
              ))}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="rounded-xl border border-white/10 px-4 py-2 text-sm text-white/55"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={submitCreate}
                className="rounded-xl border border-[#D6A66A]/35 bg-[#D6A66A]/10 px-4 py-2 text-sm text-[#D6A66A] disabled:opacity-50"
              >
                {saving ? "Saving…" : capability?.create?.label || "Create"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {commandModal && selected ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-5 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[30px] border border-white/10 bg-[#101010] p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.28em] text-[#D6A66A]">Lifecycle action</div>
                <h2 className="mt-2 text-2xl font-semibold text-white">{commandModal.title}</h2>
                <p className="mt-2 text-sm text-white/40">{commandModal.description}</p>
                <p className="mt-2 text-xs text-white/30">
                  {recordLabel(selected)} · {selected.status}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCommandModal(null)}
                className="rounded-xl border border-white/10 p-2 text-white/45"
                aria-label="Close lifecycle action"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {commandModal.fields.map((field) => (
                <div
                  key={field.name}
                  className={field.type === "textarea" ? "md:col-span-2" : ""}
                >
                  <Field
                    field={field}
                    value={commandValues[field.name]}
                    lookupOptions={field.optionsSource === "assignable-users" ? assignees : []}
                    onChange={(name, value) => setCommandValues((current) => ({
                      ...current,
                      [name]: value,
                    }))}
                  />
                  {field.optionsSource === "assignable-users" && assigneesLoading ? (
                    <div className="mt-2 text-xs text-white/30">Loading eligible users…</div>
                  ) : null}
                </div>
              ))}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setCommandModal(null)}
                className="rounded-xl border border-white/10 px-4 py-2 text-sm text-white/55"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving || assigneesLoading}
                onClick={submitCommand}
                className={`rounded-xl border px-4 py-2 text-sm disabled:opacity-50 ${commandModal.danger ? "border-red-400/30 bg-red-500/10 text-red-200" : "border-[#D6A66A]/35 bg-[#D6A66A]/10 text-[#D6A66A]"}`}
              >
                {saving ? "Saving…" : commandModal.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
