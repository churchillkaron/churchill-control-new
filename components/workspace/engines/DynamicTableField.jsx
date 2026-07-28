"use client";

import { useEffect, useMemo, useState } from "react";

const INPUT_CLASS =
  "h-10 min-w-[120px] w-full rounded-lg border border-white/10 bg-black/30 px-3 text-white outline-none";

function initialValue(column) {
  if (column.type === "number" || column.type === "calculated-money") {
    return 0;
  }

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

function TypedLookupCell({
  column,
  value,
  organizationId,
  entityId,
  onChange,
}) {
  const [options, setOptions] = useState(
    Array.isArray(column.options) ? column.options : []
  );

  useEffect(() => {
    let active = true;

    if (Array.isArray(column.options) || !column.lookup) {
      return undefined;
    }

    const query = new URLSearchParams({
      lookup: column.lookup,
      organizationId: organizationId || "",
      entityId: entityId || "",
    });

    fetch(`/api/platform/lookups?${query.toString()}`, {
      cache: "no-store",
    })
      .then((response) => response.json())
      .then((payload) => {
        if (!active) return;
        setOptions(Array.isArray(payload) ? payload : []);
      })
      .catch(() => {
        if (active) setOptions([]);
      });

    return () => {
      active = false;
    };
  }, [column.lookup, column.options, organizationId, entityId]);

  return (
    <select
      value={value || ""}
      required={column.required}
      onChange={(event) => onChange(event.target.value)}
      className={INPUT_CLASS}
      style={{ minWidth: column.minWidth || undefined }}
    >
      <option value="">Select...</option>
      {options.map((option) => {
        const item =
          typeof option === "string"
            ? { value: option, label: option }
            : option;

        return (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        );
      })}
    </select>
  );
}

function TableCell({
  column,
  row,
  organizationId,
  entityId,
  onChange,
}) {
  const value = row?.[column.name];

  if (column.type === "calculated-money") {
    return (
      <div className="min-w-[120px] px-3 py-2 text-right tabular-nums text-white/75">
        {money(calculateLineTotal(row))}
      </div>
    );
  }

  if (column.type === "lookup") {
    return (
      <TypedLookupCell
        column={column}
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
        style={{ minWidth: column.minWidth || undefined }}
      >
        <option value="">Select...</option>
        {(column.options || []).map((option) => {
          const item =
            typeof option === "string"
              ? { value: option, label: option }
              : option;
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
      style={{ minWidth: column.minWidth || undefined }}
    />
  );
}

function createEmptyRow(columns) {
  return Object.fromEntries(
    columns.map((column) => [column.name, initialValue(column)])
  );
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
  const minimumRows = Number(field.minimumRows || 0);
  const isDebitCredit = field.balanceMode === "debit-credit";

  useEffect(() => {
    if (minimumRows <= 0 || rows.length >= minimumRows) return;

    const nextRows = [...rows];
    while (nextRows.length < minimumRows) {
      nextRows.push(createEmptyRow(columns));
    }

    onChange(field.name, nextRows);
  }, [columns, field.name, minimumRows, onChange, rows]);

  const totals = useMemo(() => {
    if (!isDebitCredit) return null;

    const debit = rows.reduce(
      (sum, row) => sum + Number(row?.debit || 0),
      0
    );
    const credit = rows.reduce(
      (sum, row) => sum + Number(row?.credit || 0),
      0
    );

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

        if (isDebitCredit && key === "debit" && Number(nextValue || 0) > 0) {
          nextRow.credit = 0;
        }

        if (isDebitCredit && key === "credit" && Number(nextValue || 0) > 0) {
          nextRow.debit = 0;
        }

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
    <div className="col-span-full">
      <label className="mb-3 block text-xs uppercase tracking-[0.25em] text-white/40">
        {field.label}
        {field.required ? (
          <span className="ml-1 text-orange-400">*</span>
        ) : null}
      </label>

      <div className="overflow-auto rounded-xl border border-white/10">
        <table className="min-w-full text-sm">
          <thead className="bg-white/5">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.name}
                  className="whitespace-nowrap px-3 py-3 text-left text-xs text-white/50"
                  style={{ minWidth: column.minWidth || undefined }}
                >
                  {column.label}
                  {column.required ? " *" : ""}
                </th>
              ))}
              <th className="w-20" />
            </tr>
          </thead>

          <tbody>
            {rows.map((row, index) => (
              <tr key={row.id || index} className="border-t border-white/10">
                {columns.map((column) => (
                  <td key={column.name} className="p-2 align-top">
                    <TableCell
                      column={column}
                      row={row}
                      organizationId={organizationId}
                      entityId={entityId}
                      onChange={(nextValue) =>
                        updateRow(index, column.name, nextValue)
                      }
                    />
                  </td>
                ))}
                <td className="p-2 align-middle">
                  <button
                    type="button"
                    onClick={() => removeRow(index)}
                    disabled={rows.length <= minimumRows}
                    className="text-xs text-red-300 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-25"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>

          {totals ? (
            <tfoot className="border-t border-[#D6A66A]/25 bg-[#D6A66A]/[0.06]">
              <tr>
                <td
                  colSpan={Math.max(
                    1,
                    columns.findIndex((column) => column.name === "debit")
                  )}
                  className="px-3 py-3 text-right text-xs uppercase tracking-[0.16em] text-white/45"
                >
                  Totals
                </td>
                {columns.map((column) => {
                  if (column.name === "debit") {
                    return (
                      <td key={column.name} className="px-3 py-3 text-right font-semibold tabular-nums text-white">
                        {money(totals.debit)}
                      </td>
                    );
                  }

                  if (column.name === "credit") {
                    return (
                      <td key={column.name} className="px-3 py-3 text-right font-semibold tabular-nums text-white">
                        {money(totals.credit)}
                      </td>
                    );
                  }

                  return <td key={column.name} />;
                })}
                <td />
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>

      {totals ? (
        <div className={`mt-3 flex items-center justify-between rounded-xl border px-4 py-3 text-sm ${totals.difference === 0 && totals.debit > 0 ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-200" : "border-red-400/25 bg-red-500/10 text-red-200"}`}>
          <span>
            {totals.difference === 0 && totals.debit > 0
              ? "Journal is balanced"
              : "Journal must balance before posting"}
          </span>
          <strong className="tabular-nums">
            Difference: {money(Math.abs(totals.difference))}
          </strong>
        </div>
      ) : null}

      <button
        type="button"
        onClick={addRow}
        className="mt-3 rounded-xl border border-white/10 px-4 py-2 text-sm text-white/70 hover:bg-white/5"
      >
        + Add Line
      </button>
    </div>
  );
}
