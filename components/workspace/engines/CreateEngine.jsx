"use client";

import { useEffect, useMemo } from "react";
import DynamicForm from "./DynamicForm";

const COST_CENTRE_FIELDS = Object.freeze([
  {
    name: "name",
    label: "Cost Centre Name",
    type: "text",
    required: true,
    placeholder: "Example: Kitchen Operations",
  },
  {
    name: "code",
    label: "Cost Centre Code",
    type: "text",
    required: true,
    placeholder: "Example: KITCHEN",
  },
  {
    name: "type",
    label: "Cost Centre Type",
    type: "select",
    required: true,
    defaultValue: "OPERATIONAL",
    options: [
      { value: "OPERATIONAL", label: "Operational" },
      { value: "ADMINISTRATIVE", label: "Administrative" },
      { value: "SALES", label: "Sales" },
      { value: "SERVICE", label: "Service Delivery" },
      { value: "PROJECT", label: "Project" },
      { value: "SHARED", label: "Shared / Corporate" },
      { value: "OTHER", label: "Other" },
    ],
  },
  {
    name: "parent_cost_center_id",
    label: "Parent Cost Centre",
    type: "lookup",
    lookup: "cost_centers",
    required: false,
  },
  {
    name: "manager",
    label: "Responsible Manager",
    type: "text",
    required: false,
    placeholder: "Manager or owner responsible for this centre",
  },
  {
    name: "is_active",
    label: "Active",
    type: "boolean",
    defaultValue: true,
  },
  {
    name: "entity_id",
    label: "Legal Entity",
    type: "hidden",
  },
]);

function isJournalForm(fields) {
  const names = new Set(fields.map((field) => field?.name));
  const linesField = fields.find((field) => field?.name === "lines");
  const lineNames = new Set(
    (Array.isArray(linesField?.columns) ? linesField.columns : []).map(
      (column) => column?.name
    )
  );

  return (
    names.has("journal_type") &&
    names.has("posting_date") &&
    lineNames.has("debit") &&
    lineNames.has("credit")
  );
}

function validateJournal(values = {}) {
  const lines = Array.isArray(values.lines) ? values.lines : [];

  if (!values.posting_date) return false;
  if (!values.document_date) return false;
  if (!values.journal_type) return false;
  if (!String(values.description || "").trim()) return false;
  if (!values.currency_code && !values.currency) return false;

  const exchangeRate = Number(values.exchange_rate);
  if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) return false;
  if (lines.length < 2) return false;

  let debit = 0;
  let credit = 0;

  for (const line of lines) {
    if (!line?.account_id) return false;
    if (!String(line?.description || "").trim()) return false;

    const lineDebit = Number(line?.debit || 0);
    const lineCredit = Number(line?.credit || 0);

    if (!Number.isFinite(lineDebit) || !Number.isFinite(lineCredit)) {
      return false;
    }

    if (lineDebit < 0 || lineCredit < 0) return false;
    if (
      (lineDebit > 0 && lineCredit > 0) ||
      (lineDebit === 0 && lineCredit === 0)
    ) {
      return false;
    }

    debit += lineDebit;
    credit += lineCredit;
  }

  return (
    debit > 0 &&
    Math.round(debit * 100) === Math.round(credit * 100)
  );
}

function validateCostCentre(values = {}) {
  return Boolean(
    String(values.name || "").trim() &&
    String(values.code || "").trim() &&
    String(values.type || "").trim()
  );
}

export default function CreateEngine({
  open,
  title = "Create",
  schema = [],
  values = {},
  onChange,
  children,
  onClose,
  onSave,
  onPreview,
  saving = false,
  organizationId,
  entityId,
  moduleKey,
  action,
}) {
  const costCentreForm = action?.form === "cost-center";

  const fields = useMemo(() => {
    if (costCentreForm) {
      return COST_CENTRE_FIELDS.map((field) => ({ ...field }));
    }

    return Array.isArray(schema) ? schema.filter(Boolean) : [];
  }, [schema, costCentreForm]);

  const journalForm = useMemo(
    () => isJournalForm(fields),
    [fields]
  );

  useEffect(() => {
    if (!open || typeof onChange !== "function") return;

    fields.forEach((field) => {
      let resolvedDefault =
        field.defaultValue !== undefined
          ? field.defaultValue
          : field.name === "template_source_url"
            ? "builtin://finance/standard"
            : undefined;

      if (journalForm && field.name === "journal_type") {
        resolvedDefault = "GENERAL";
      }

      if (journalForm && field.name === "exchange_rate") {
        resolvedDefault = 1;
      }

      if (
        journalForm &&
        field.name === "document_date" &&
        values.posting_date
      ) {
        resolvedDefault = values.posting_date;
      }

      if (costCentreForm && field.name === "entity_id") {
        resolvedDefault = entityId || null;
      }

      if (
        values[field.name] === undefined &&
        resolvedDefault !== undefined
      ) {
        onChange(field.name, resolvedDefault);
      }
    });
  }, [
    open,
    fields,
    values,
    onChange,
    journalForm,
    costCentreForm,
    entityId,
  ]);

  if (!open) return null;

  const visibleFields = fields.filter(
    (field) =>
      field.type !== "hidden" &&
      field.name !== "template_source_url"
  );

  const previewEnabled = Boolean(
    typeof onPreview === "function" &&
    (
      action?.preview === true ||
      action?.preview?.enabled === true ||
      action?.documentType ||
      moduleKey === "customer_invoices"
    )
  );

  const journalReady = !journalForm || validateJournal(values);
  const costCentreReady =
    !costCentreForm || validateCostCentre(values);
  const saveDisabled = saving || !journalReady || !costCentreReady;

  const saveLabel = journalForm
    ? saving
      ? "Posting..."
      : "Post Journal"
    : costCentreForm
      ? saving
        ? "Creating..."
        : "Create Cost Centre"
      : saving
        ? "Saving..."
        : action?.submitLabel || "Create";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-5xl rounded-[30px] border border-white/10 bg-[#0b0b0b] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-amber-300/70">
              {journalForm ? "Post" : "Create"}
            </div>

            <h2 className="mt-2 text-3xl font-light text-white">
              {costCentreForm ? "New Cost Centre" : title}
            </h2>
          </div>

          <button
            onClick={onClose}
            className="rounded-xl border border-white/10 px-4 py-2 text-sm text-white/60 hover:bg-white/5"
          >
            Close
          </button>
        </div>

        <div className="max-h-[72vh] overflow-auto p-6">
          {costCentreForm ? (
            <div className="mb-5 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/55">
              This cost centre will belong to the selected organisation
              {entityId
                ? " and selected legal entity."
                : " and will be available organisation-wide."}
            </div>
          ) : null}

          {visibleFields.length > 0 ? (
            <DynamicForm
              schema={visibleFields}
              values={values}
              onChange={onChange}
              organizationId={organizationId}
              entityId={entityId}
              moduleKey={moduleKey}
              action={action}
            />
          ) : (
            children
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-white/10 px-6 py-5">
          <div className="text-xs text-white/40">
            {journalForm && !journalReady
              ? "Complete all required fields and balance debit and credit before posting."
              : journalForm
                ? "Posting creates an immutable accounting journal. Use reversal for later corrections."
                : costCentreForm
                  ? "Only active cost centres appear in journal and reporting selectors."
                  : null}
          </div>

          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              className="rounded-xl border border-white/10 px-5 py-3 text-sm text-white/60"
            >
              Cancel
            </button>

            {previewEnabled ? (
              <button
                onClick={onPreview}
                className="rounded-xl border border-amber-300/30 px-5 py-3 text-sm text-amber-200"
              >
                Preview
              </button>
            ) : null}

            <button
              onClick={onSave}
              disabled={saveDisabled}
              className="rounded-xl bg-amber-400 px-5 py-3 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-35"
            >
              {saveLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
