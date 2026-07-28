"use client";

import { useEffect, useMemo } from "react";
import DynamicForm from "./DynamicForm";
import {
  FINANCE_ACCOUNTING_POLICY_OPTIONS,
  getFinanceAccountingPolicyDefinition,
  getFinanceAccountingPolicyOption,
} from "@/lib/finance/accounting-settings/FinanceAccountingPolicyDefinitions";

const FINANCE_APPROVAL_DOCUMENT_TYPES = Object.freeze([
  { value: "JOURNAL_ENTRY", label: "Journal Entry" },
  { value: "VENDOR_BILL", label: "Vendor Bill" },
  { value: "VENDOR_PAYMENT", label: "Vendor Payment" },
  { value: "CUSTOMER_CREDIT_NOTE", label: "Customer Credit Note" },
  { value: "CUSTOMER_REFUND", label: "Customer Refund" },
  { value: "BANK_PAYMENT", label: "Bank Payment" },
  { value: "PURCHASE_ORDER", label: "Purchase Order" },
  { value: "EXPENSE_CLAIM", label: "Expense Claim" },
  { value: "WRITE_OFF", label: "Write-Off" },
  { value: "PERIOD_CLOSE", label: "Period Close" },
  { value: "YEAR_END_CLOSE", label: "Year-End Close" },
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

function isApprovalWorkflowForm(fields) {
  const names = new Set(fields.map((field) => field?.name));

  return (
    names.has("document_type") &&
    names.has("approver_role") &&
    names.has("required_approvals") &&
    names.has("effective_from")
  );
}

function isAccountingSettingsForm(fields) {
  const names = new Set(fields.map((field) => field?.name));

  return (
    names.has("setting_key") &&
    names.has("name") &&
    names.has("value_json") &&
    names.has("effective_from")
  );
}

function normalizeApprovalWorkflowFields(fields) {
  return fields.map((field) => {
    if (field.name === "document_type") {
      return {
        ...field,
        type: "select",
        options: FINANCE_APPROVAL_DOCUMENT_TYPES,
        required: true,
      };
    }

    if (field.name === "approver_role") {
      return {
        ...field,
        type: "lookup",
        lookup: "finance_role_codes",
        label: "Approver Finance Role",
        required: true,
      };
    }

    if (field.name === "threshold_amount") {
      return {
        ...field,
        label: "Approval Required From Amount",
        type: "number",
        min: 0,
        step: "0.01",
        defaultValue: 0,
        required: true,
      };
    }

    if (field.name === "currency_code") {
      return {
        ...field,
        label: "Threshold Currency",
        type: "currency",
        lookup: "currencies",
        required: true,
      };
    }

    if (field.name === "required_approvals") {
      return {
        ...field,
        label: "Number of Approvals Required",
        type: "number",
        min: 1,
        step: 1,
        defaultValue: 1,
        required: true,
      };
    }

    if (field.name === "entity_id") {
      return {
        ...field,
        label: "Legal Entity Scope",
        description: "Leave blank to apply to all legal entities in this organisation.",
      };
    }

    if (field.name === "effective_from") {
      return {
        ...field,
        label: "Effective From",
        type: "date",
        required: true,
      };
    }

    if (field.name === "effective_to") {
      return {
        ...field,
        label: "Effective To",
        type: "date",
      };
    }

    return field;
  });
}

function accountingPolicyValue(value) {
  if (!value) return "";

  if (typeof value === "object") {
    return String(value.value || "").trim().toUpperCase();
  }

  try {
    const parsed = JSON.parse(value);
    return String(parsed?.value || "").trim().toUpperCase();
  } catch {
    return String(value).trim().toUpperCase();
  }
}

function normalizeAccountingSettingsFields(fields, values) {
  const definition = getFinanceAccountingPolicyDefinition(values?.setting_key);

  return fields.map((field) => {
    if (field.name === "setting_key") {
      return {
        ...field,
        label: "Accounting Policy",
        type: "select",
        options: FINANCE_ACCOUNTING_POLICY_OPTIONS,
        required: true,
        width: "full",
      };
    }

    if (field.name === "name") {
      return {
        ...field,
        type: "hidden",
      };
    }

    if (field.name === "value_json") {
      return {
        ...field,
        label: "Policy Value",
        type: "select",
        required: true,
        options: (definition?.options || []).map((option) => ({
          value: JSON.stringify({ value: option.value }),
          label: option.label,
        })),
        width: "full",
      };
    }

    if (field.name === "effective_from") {
      return {
        ...field,
        label: "Effective From",
        type: "date",
        required: true,
      };
    }

    if (field.name === "effective_to") {
      return {
        ...field,
        label: "Effective To",
        type: "date",
      };
    }

    return field;
  });
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
    if ((lineDebit > 0 && lineCredit > 0) || (lineDebit === 0 && lineCredit === 0)) {
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

function validateApprovalWorkflow(values = {}) {
  if (!String(values.name || "").trim()) return false;
  if (!values.document_type) return false;
  if (!values.approver_role) return false;
  if (!values.currency_code) return false;
  if (!values.effective_from) return false;

  const threshold = Number(values.threshold_amount);
  const approvals = Number(values.required_approvals);

  if (!Number.isFinite(threshold) || threshold < 0) return false;
  if (!Number.isInteger(approvals) || approvals < 1) return false;

  if (
    values.effective_to &&
    String(values.effective_to) < String(values.effective_from)
  ) {
    return false;
  }

  return true;
}

function validateAccountingSettings(values = {}) {
  const definition = getFinanceAccountingPolicyDefinition(values.setting_key);
  const selectedValue = accountingPolicyValue(values.value_json);

  if (!definition || !values.effective_from) return false;
  if (!getFinanceAccountingPolicyOption(definition.key, selectedValue)) {
    return false;
  }

  if (
    values.effective_to &&
    String(values.effective_to) < String(values.effective_from)
  ) {
    return false;
  }

  return true;
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
  const baseFields = useMemo(
    () => (Array.isArray(schema) ? schema.filter(Boolean) : []),
    [schema]
  );

  const approvalWorkflowForm = useMemo(
    () => isApprovalWorkflowForm(baseFields),
    [baseFields]
  );
  const accountingSettingsForm = useMemo(
    () => isAccountingSettingsForm(baseFields),
    [baseFields]
  );

  const fields = useMemo(() => {
    if (approvalWorkflowForm) {
      return normalizeApprovalWorkflowFields(baseFields);
    }

    if (accountingSettingsForm) {
      return normalizeAccountingSettingsFields(baseFields, values);
    }

    return baseFields;
  }, [baseFields, approvalWorkflowForm, accountingSettingsForm, values]);

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

      if (
        values[field.name] === undefined &&
        resolvedDefault !== undefined
      ) {
        onChange(field.name, resolvedDefault);
      }
    });

    if (accountingSettingsForm && values.setting_key) {
      const definition = getFinanceAccountingPolicyDefinition(values.setting_key);

      if (definition && values.name !== definition.name) {
        onChange("name", definition.name);
      }

      const currentValue = accountingPolicyValue(values.value_json);
      const validCurrentValue = getFinanceAccountingPolicyOption(
        definition?.key,
        currentValue
      );

      if (definition && !validCurrentValue) {
        onChange(
          "value_json",
          JSON.stringify({ value: definition.defaultValue })
        );
      }
    }
  }, [
    open,
    fields,
    values,
    onChange,
    journalForm,
    accountingSettingsForm,
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
  const approvalReady = !approvalWorkflowForm || validateApprovalWorkflow(values);
  const accountingSettingsReady =
    !accountingSettingsForm || validateAccountingSettings(values);
  const saveDisabled =
    saving || !journalReady || !approvalReady || !accountingSettingsReady;

  const saveLabel = journalForm
    ? saving
      ? "Posting..."
      : "Post Journal"
    : approvalWorkflowForm
      ? saving
        ? "Saving..."
        : "Create Approval Rule"
      : accountingSettingsForm
        ? saving
          ? "Saving..."
          : "Save Accounting Policy"
        : saving
          ? "Saving..."
          : action?.submitLabel || "Create";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-5xl rounded-[30px] border border-white/10 bg-[#0b0b0b] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-amber-300/70">
              {journalForm ? "Post" : accountingSettingsForm ? "Configure" : "Create"}
            </div>

            <h2 className="mt-2 text-3xl font-light text-white">
              {title}
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
                : approvalWorkflowForm && !approvalReady
                  ? "Complete the scope, threshold, approver role and valid effective dates."
                  : approvalWorkflowForm
                    ? "The most specific active rule with the highest applicable threshold will govern approval."
                    : accountingSettingsForm && !accountingSettingsReady
                      ? "Select a supported policy value and a valid effective date range."
                      : accountingSettingsForm
                        ? "Effective-dated policies govern system-generated Finance journals."
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
