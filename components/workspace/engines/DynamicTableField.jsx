"use client";

import { useEffect, useMemo, useState } from "react";

const INPUT_CLASS =
  "h-10 min-w-0 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-[#D6A66A]/50";

const CREATABLE_LOOKUPS = Object.freeze({
  items: "Item / Service",
  cost_centers: "Cost Centre",
  departments: "Department",
  projects: "Project",
});

function initialValue(column) {
  if (column.defaultValue !== undefined) return column.defaultValue;
  if (column.name === "quantity") return 1;
  if (column.name === "discount_amount" || column.name === "tax_amount") return 0;
  if (column.type === "number" || column.type === "calculated-money") return 0;
  return "";
}

function calculateLineTotal(row) {
  const quantity = Number(row?.quantity || 0);
  const unitPrice = Number(row?.unit_price || 0);
  const discount = Number(row?.discount_amount || 0);
  const tax = Number(row?.tax_amount || 0);
  return quantity * unitPrice - discount + tax;
}

function money(value) {
  return Number(value || 0).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function TypedLookupCell({ column, row, value, organizationId, entityId, onChange }) {
  const [options, setOptions] = useState(Array.isArray(column.options) ? column.options : []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createCode, setCreateCode] = useState("");
  const [createSaving, setCreateSaving] = useState(false);
  const createLabel = CREATABLE_LOOKUPS[column.lookup] || null;

  useEffect(() => {
    let active = true;
    if (Array.isArray(column.options) || !column.lookup) return undefined;

    const query = new URLSearchParams({
      lookup: column.lookup,
      organizationId: organizationId || "",
      entityId: entityId || "",
    });

    setLoading(true);
    setError("");

    fetch(`/api/platform/lookups?${query.toString()}`, {
      cache: "no-store",
      credentials: "include",
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error || "Lookup unavailable");
        return payload;
      })
      .then((payload) => {
        if (!active) return;
        setOptions(Array.isArray(payload) ? payload : []);
      })
      .catch((loadError) => {
        if (!active) return;
        setOptions([]);
        setError(loadError?.message || "Lookup unavailable");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [column.lookup, column.options, organizationId, entityId]);

  const emptyItemCatalogue = column.lookup === "items" && !loading && !error && options.length === 0;
  const noVatLookup = column.lookup === "tax_codes";

  async function createOption() {
    const name = createName.trim();
    if (!name || !createLabel) return;

    try {
      setCreateSaving(true);
      setError("");
      const response = await fetch("/api/platform/lookups", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lookup: column.lookup,
          organizationId,
          entityId,
          name,
          code: createCode.trim() || undefined,
          salePrice: column.lookup === "items" ? Number(row?.unit_price || 0) : undefined,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.success === false || !payload?.option?.value) {
        throw new Error(payload?.error || `Unable to create ${createLabel}`);
      }

      setOptions((current) => {
        const next = current.filter((option) => String(option?.value ?? option) !== String(payload.option.value));
        return [payload.option, ...next];
      });
      onChange(payload.option.value);
      setCreateName("");
      setCreateCode("");
      setCreating(false);
    } catch (createError) {
      setError(createError?.message || `Unable to create ${createLabel}`);
    } finally {
      setCreateSaving(false);
    }
  }

  return (
    <div className="min-w-0">
      <select
        value={value || ""}
        required={column.required}
        onChange={(event) => onChange(event.target.value)}
        className={INPUT_CLASS}
      >
        <option value="">
          {loading
            ? "Loading…"
            : noVatLookup
              ? "No VAT"
              : emptyItemCatalogue
                ? "No saved items or services"
                : options.length
                  ? "Select…"
                  : "No options available"}
        </option>
        {options.map((option) => {
          const item = typeof option === "string" ? { value: option, label: option } : option;
          const optionLabel = item.description && column.lookup === "tax_codes"
            ? `${item.label} · ${item.description}`
            : item.label;
          return (
            <option key={item.value} value={item.value}>
              {optionLabel}
            </option>
          );
        })}
      </select>

      {createLabel ? (
        <div className="mt-1.5">
          {!creating ? (
            <button
              type="button"
              onClick={() => {
                setCreating(true);
                setCreateName(column.lookup === "items" ? String(row?.description || "") : "");
              }}
              className="text-[10px] font-medium text-[#D6A66A] hover:text-[#E9C18E]"
            >
              + Create new {createLabel}
            </button>
          ) : (
            <div className="space-y-2 rounded-lg border border-[#D6A66A]/20 bg-[#D6A66A]/[0.05] p-2.5">
              <input
                autoFocus
                value={createName}
                onChange={(event) => setCreateName(event.target.value)}
                placeholder={`${createLabel} name`}
                className={INPUT_CLASS}
              />
              <input
                value={createCode}
                onChange={(event) => setCreateCode(event.target.value)}
                placeholder="Code (optional)"
                className={INPUT_CLASS}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={createOption}
                  disabled={createSaving || !createName.trim()}
                  className="h-8 rounded-lg bg-[#D6A66A] px-3 text-[10px] font-semibold text-black disabled:opacity-40"
                >
                  {createSaving ? "Saving…" : `Save ${createLabel}`}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCreating(false);
                    setCreateName("");
                    setCreateCode("");
                    setError("");
                  }}
                  className="h-8 rounded-lg border border-white/10 px-3 text-[10px] text-white/60"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {error ? <p className="mt-1 text-[10px] text-red-300">{error}</p> : null}
      {emptyItemCatalogue && !creating ? (
        <p className="mt-1 text-[10px] leading-4 text-white/35">
          Create the service here once and it will be available on future invoices.
        </p>
      ) : null}
      {noVatLookup && !value ? (
        <p className="mt-1 text-[10px] leading-4 text-white/35">No VAT selected.</p>
      ) : null}
    </div>
  );
}

function TableCell({ column, row, organizationId, entityId, onChange }) {
  const value = row?.[column.name];

  if (column.type === "calculated-money") {
    return (
      <div className="flex h-10 items-center justify-end rounded-lg border border-white/5 bg-white/[0.03] px-3 tabular-nums text-white/80">
        {money(calculateLineTotal(row))}
      </div>
    );
  }

  if (column.type === "lookup") {
    return (
      <TypedLookupCell
        column={column}
        row={row}
        value={value}
        organizationId={organizationId}
        entityId={entityId}
        onChange={onChange}
      />
    );
  }

  if (column.type === "select") {
    return (
      <select
        value={value || ""}
        required={column.required}
        onChange={(event) => onChange(event.target.value)}
        className={INPUT_CLASS}
      >
        <option value="">Select…</option>
        {(column.options || []).map((option) => {
          const item = typeof option === "string" ? { value: option, label: option } : option;
          return (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          );
        })}
      </select>
    );
  }

  const numeric = column.type === "number";
  return (
    <input
      type={numeric ? "number" : column.type || "text"}
      inputMode={numeric ? "decimal" : undefined}
      value={value ?? ""}
      required={column.required}
      min={column.min}
      max={column.max}
      step={column.step || (numeric ? "any" : undefined)}
      readOnly={column.readOnly}
      placeholder={column.placeholder || ""}
      onChange={(event) =>
        onChange(
          numeric
            ? event.target.value === ""
              ? ""
              : Number(event.target.value)
            : event.target.value
        )
      }
      className={INPUT_CLASS}
    />
  );
}

function createEmptyRow(columns) {
  return Object.fromEntries(columns.map((column) => [column.name, initialValue(column)]));
}

export default function DynamicTableField({
  field,
  value = [],
  onChange,
  organizationId,
  entityId,
}) {
  const columns = Array.isArray(field.columns) ? field.columns : [];
  const rows = Array.isArray(value) ? value : [];
  const minimumRows = Number(field.minimumRows ?? (field.required ? 1 : 0));
  const isDebitCredit = field.balanceMode === "debit-credit";

  useEffect(() => {
    if (minimumRows <= 0 || rows.length >= minimumRows) return;
    const nextRows = [...rows];
    while (nextRows.length < minimumRows) nextRows.push(createEmptyRow(columns));
    onChange(field.name, nextRows);
  }, [columns, field.name, minimumRows, onChange, rows]);

  const totals = useMemo(() => {
    if (!isDebitCredit) return null;
    const debit = rows.reduce((sum, row) => sum + Number(row?.debit || 0), 0);
    const credit = rows.reduce((sum, row) => sum + Number(row?.credit || 0), 0);
    return {
      debit,
      credit,
      difference: Math.round((debit - credit) * 100) / 100,
    };
  }, [isDebitCredit, rows]);

  function writeRows(nextRows) {
    const reconciled = nextRows.map((row) => ({
      ...row,
      ...(columns.some((column) => column.name === "line_total")
        ? { line_total: calculateLineTotal(row) }
        : {}),
    }));
    onChange(field.name, reconciled);
  }

  function updateRow(index, key, nextValue) {
    writeRows(
      rows.map((row, rowIndex) => {
        if (rowIndex !== index) return row;
        const nextRow = { ...row, [key]: nextValue };
        if (isDebitCredit && key === "debit" && Number(nextValue || 0) > 0) nextRow.credit = 0;
        if (isDebitCredit && key === "credit" && Number(nextValue || 0) > 0) nextRow.debit = 0;
        if (key === "tax_code_id" && !nextValue) nextRow.tax_amount = 0;
        return nextRow;
      })
    );
  }

  function addRow() {
    writeRows([...rows, createEmptyRow(columns)]);
  }

  function removeRow(index) {
    if (rows.length <= minimumRows) return;
    writeRows(rows.filter((_, rowIndex) => rowIndex !== index));
  }

  return (
    <div className="col-span-full min-w-0">
      <label className="mb-3 block text-[10px] font-medium uppercase tracking-[0.18em] text-white/45 sm:text-xs sm:tracking-[0.25em]">
        {field.label}
        {field.required ? <span className="ml-1 text-orange-400">*</span> : null}
      </label>

      <div className="space-y-3">
        {rows.map((row, index) => (
          <section
            key={row.id || index}
            className="min-w-0 rounded-xl border border-white/10 bg-black/20 p-3 sm:p-4"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#D6A66A]/80">
                Line {index + 1}
              </div>
              <button
                type="button"
                onClick={() => removeRow(index)}
                disabled={rows.length <= minimumRows}
                className="rounded-md px-2 py-1 text-[11px] text-red-300 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-25"
              >
                Remove
              </button>
            </div>

            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {columns.map((column) => (
                <div
                  key={column.name}
                  className={`min-w-0 ${column.name === "description" ? "sm:col-span-2" : ""}`}
                >
                  <label className="mb-1.5 block text-[10px] text-white/45">
                    {column.label}{column.required ? " *" : ""}
                  </label>
                  <TableCell
                    column={column}
                    row={row}
                    organizationId={organizationId}
                    entityId={entityId}
                    onChange={(nextValue) => updateRow(index, column.name, nextValue)}
                  />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {totals ? (
        <div className={`mt-3 rounded-xl border px-3 py-3 text-sm sm:flex sm:items-center sm:justify-between sm:px-4 ${totals.difference === 0 && totals.debit > 0 ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-200" : "border-red-400/25 bg-red-500/10 text-red-200"}`}>
          <span>
            {totals.difference === 0 && totals.debit > 0
              ? "Journal is balanced"
              : "Journal must balance before posting"}
          </span>
          <div className="mt-1 flex gap-4 tabular-nums sm:mt-0">
            <span>Debit {money(totals.debit)}</span>
            <span>Credit {money(totals.credit)}</span>
            <strong>Difference {money(Math.abs(totals.difference))}</strong>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={addRow}
        className="mt-3 h-10 w-full rounded-xl border border-white/10 px-4 text-sm text-white/70 hover:bg-white/5 sm:w-auto"
      >
        + Add Line
      </button>
    </div>
  );
}
