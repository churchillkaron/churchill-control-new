"use client";

import { useMemo, useState } from "react";

import CapabilityActionResolver from "@/components/workspace/master-data/CapabilityActionResolver";
import { resolveRowAction } from "@/lib/platform/actions/resolveRowAction";
import { resolveInventoryRowAction } from "@/lib/inventory/actions/resolveInventoryRowAction";
import { getForm } from "@/lib/platform/forms";

const TECHNICAL_KEYS = new Set([
  "id",
  "organization_id",
  "organizationId",
  "entity_id",
  "entityId",
  "period_id",
  "periodId",
  "tenant_id",
  "tenantId",
  "metadata",
  "value_json",
  "payload",
  "raw_data",
  "created_by",
  "updated_by",
]);

const EXECUTABLE_KINDS = new Set([
  "delete",
  "archive",
  "duplicate",
  "approve",
  "reject",
  "post",
  "reverse",
  "reconcile",
  "assign",
  "complete",
  "close",
  "submit",
  "restore",
  "merge",
  "split",
  "sync",
  "publish",
  "lock",
  "unlock",
  "print",
  "download",
  "upload",
  "attach",
  "email",
  "sms",
  "whatsapp",
]);

function humanize(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .replace(/\b\w/g, character => character.toUpperCase());
}

function titleFromAction(action) {
  return humanize(
    action?.label ||
    action?.title ||
    action?.name ||
    action?.id ||
    action?.type ||
    "Action"
  );
}

function resolveKind(action) {
  const inferredKinds = [
    "archive",
    "delete",
    "duplicate",
    "history",
    "attachments",
    "edit",
    "approve",
    "reject",
    "post",
    "reverse",
    "reconcile",
    "assign",
    "complete",
    "lock",
    "unlock",
    "create",
    "open",
    "view",
    "select",
    "close",
    "submit",
    "restore",
    "merge",
    "split",
    "sync",
    "publish",
    "print",
    "download",
    "upload",
    "attach",
    "email",
    "sms",
    "whatsapp",
    "connect_service",
    "complete_connection",
    "disconnect_service",
    "manage_connection",
    "view_usage",
    "view_costs",
    "view_capabilities",
  ];

  const direct = action?.action || action?.type || action?.id || "";
  if (direct) {
    const normalized = String(direct).toLowerCase().replace(/-/g, "_");
    return inferredKinds.find(kind => normalized.includes(kind)) || normalized;
  }

  const label = String(action?.label || action?.title || "").toLowerCase();
  return inferredKinds.find(kind => label.includes(kind)) || "";
}

function endpointFromAction(action) {
  return action?.endpoint || action?.api || action?.url || null;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "")
  );
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: String(value).includes("T") ? "2-digit" : undefined,
    minute: String(value).includes("T") ? "2-digit" : undefined,
  }).format(date);
}

function formatValue(value, key = "") {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Active" : "Inactive";
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? "" : "s"}`;
  if (typeof value === "object") return "Available in the related record";
  if (isUuid(value)) return "Linked record";
  if (/(_at|_date|date|timestamp)$/i.test(key)) return formatDate(value);
  return String(value);
}

function firstValue(row, keys, fallback = null) {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return fallback;
}

function accountDetail(row) {
  const status = firstValue(row, ["status"], row?.is_active === false ? "Inactive" : "Active");
  const parent = firstValue(row, [
    "parent_account_name",
    "parent_name",
    "parent_account_code",
  ]);

  return {
    eyebrow: "Account Details",
    title: firstValue(row, ["account_name", "name"], "Account"),
    subtitle: [
      firstValue(row, ["account_code", "code"]),
      firstValue(row, ["account_type", "type"]),
    ].filter(Boolean).join(" · "),
    sections: [
      {
        title: "Account Structure",
        fields: [
          ["Account Code", firstValue(row, ["account_code", "code"])],
          ["Account Name", firstValue(row, ["account_name", "name"])],
          ["Account Type", firstValue(row, ["account_type", "type"])],
          ["Category", firstValue(row, ["category", "account_category"])],
          ["Normal Balance", firstValue(row, ["normal_balance", "balance_type"])],
          ["Parent Account", parent],
        ],
      },
      {
        title: "Control",
        fields: [
          ["Status", status],
          ["Posting Allowed", firstValue(row, ["allow_posting", "posting_allowed", "is_posting"], true)],
          ["System Account", firstValue(row, ["is_system", "system_account"], false)],
          ["Description", firstValue(row, ["description", "notes"])],
        ],
      },
    ],
  };
}

function genericDetail(row) {
  const preferredKeys = [
    "name",
    "display_name",
    "legal_name",
    "account_name",
    "account_code",
    "invoice_number",
    "journal_number",
    "reference_number",
    "reference",
    "code",
    "type",
    "category",
    "status",
    "description",
    "notes",
    "currency_code",
    "currency",
    "amount",
    "total_amount",
    "balance",
    "start_date",
    "end_date",
    "due_date",
    "posting_date",
    "created_at",
    "updated_at",
  ];

  const keys = [
    ...preferredKeys.filter(key => row?.[key] !== undefined),
    ...Object.keys(row || {}).filter(key => !preferredKeys.includes(key)),
  ];

  const fields = keys
    .filter(key => !TECHNICAL_KEYS.has(key))
    .filter(key => !key.endsWith("_id") && !key.endsWith("Id"))
    .filter(key => typeof row?.[key] !== "function")
    .filter(key => !isUuid(row?.[key]))
    .filter(key => !["metadata", "payload", "raw", "json"].some(token => key.toLowerCase().includes(token)))
    .slice(0, 16)
    .map(key => [humanize(key), row?.[key], key]);

  return {
    eyebrow: "Record Details",
    title: firstValue(row, [
      "account_name",
      "invoice_number",
      "journal_number",
      "reference_number",
      "name",
      "display_name",
      "legal_name",
      "code",
    ], "Selected Record"),
    subtitle: firstValue(row, ["status", "type", "category"], "Business record"),
    sections: [
      {
        title: "Summary",
        fields,
      },
    ],
  };
}

function detailPresentation(moduleKey, row) {
  if (moduleKey === "chart_of_accounts") return accountDetail(row);
  return genericDetail(row);
}

function DetailSections({ presentation, row }) {
  const lines = Array.isArray(row?.lines) ? row.lines : [];

  return (
    <div className="space-y-5">
      {presentation.sections.map(section => (
        <section key={section.title}>
          <div className="text-[11px] uppercase tracking-[0.24em] text-white/35">
            {section.title}
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            {section.fields.map(([label, value, key]) => (
              <div
                key={label}
                className="rounded-2xl border border-white/[0.07] bg-black/25 p-4"
              >
                <div className="text-[11px] uppercase tracking-[0.18em] text-white/35">
                  {label}
                </div>
                <div className="mt-2 break-words text-sm text-white/75">
                  {formatValue(value, key || label)}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      {lines.length ? (
        <section>
          <div className="text-[11px] uppercase tracking-[0.24em] text-white/35">
            Lines
          </div>
          <div className="mt-3 space-y-2">
            {lines.map((line, index) => (
              <div
                key={line?.id || index}
                className="grid gap-3 rounded-2xl border border-white/[0.07] bg-black/25 p-4 text-sm text-white/70 md:grid-cols-4"
              >
                <div>{firstValue(line, ["account_code", "code"], `Line ${index + 1}`)}</div>
                <div>{firstValue(line, ["account_name", "description", "name"], "—")}</div>
                <div>Debit: {formatValue(line?.debit)}</div>
                <div>Credit: {formatValue(line?.credit)}</div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

export default function RowActionEngine({
  action,
  row,
  organizationId,
  entityId,
  periodId,
  workspaceId,
  moduleKey,
  onClose,
  onComplete,
}) {
  const [values, setValues] = useState(() => ({
    ...(row || {}),
    ...(action?.id === "duplicate" ? { id: null } : {}),
    customer_id: row?.customer_id || row?.id || null,
    customer: row?.customer_name || null,
    party_id: row?.party_id || null,
    vendor_party_id: row?.vendor_party_id || row?.party_id || null,
    vendor: row?.vendor_name || null,
    journal_id: row?.id || null,
    bank_account_id: row?.id || null,
    transaction_id: row?.id || null,
  }));
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const kind = resolveKind(action);
  const isDetail = kind === "open" || kind === "view";
  const presentation = useMemo(
    () => detailPresentation(moduleKey, row || {}),
    [moduleKey, row]
  );

  const resolvedAction =
    resolveInventoryRowAction({
      moduleKey,
      kind,
      row,
      organizationId,
      entityId,
    }) ||
    resolveRowAction({
      action,
      row,
      organizationId,
      entityId,
    });

  const isCapabilityAction = Boolean(
    action?.capability && action?.action && action?.form
  );

  const resolvedSchema =
    Array.isArray(
      resolvedAction?.schema
    )
      ? resolvedAction.schema.filter(Boolean)
      : [];

  const isResolvedFormAction =
    resolvedSchema.length > 0;

  if (isCapabilityAction) {
    const schema = getForm(action?.form);

    async function saveCapability() {
      try {
        setSaving(true);
        const directEndpoint = action?.endpoint || action?.api || null;
        const response = await fetch(directEndpoint || "/api/ubte/execute", {
          method: action?.method || "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            directEndpoint
              ? {
                  ...values,
                  organizationId,
                  organization_id: organizationId,
                  entityId: entityId || row?.entity_id || null,
                  entity_id: entityId || row?.entity_id || null,
                  periodId: periodId || row?.period_id || null,
                  period_id: periodId || row?.period_id || null,
                }
              : {
                  organizationId,
                  organization_id: organizationId,
                  entity_id: entityId || row?.entity_id || null,
                  period_id: periodId || row?.period_id || null,
                  domain: action?.domain || "finance",
                  capability: action?.capability,
                  action: action?.action,
                  payload: { ...values, source_row: row },
                }
          ),
        });
        const json = await response.json().catch(() => ({}));
        if (!response.ok || json?.success === false) {
          throw new Error(json?.error || json?.message || "Action failed");
        }
        onComplete?.();
        onClose?.();
      } catch (saveError) {
        window.alert(saveError.message || "Action failed");
      } finally {
        setSaving(false);
      }
    }

    return (
      <CapabilityActionResolver
        open={true}
        saving={saving}
        action={action}
        fallbackLabel={titleFromAction(action)}
        schema={schema}
        values={values}
        onChange={(name, value) =>
          setValues(current => ({ ...current, [name]: value }))
        }
        onClose={onClose}
        onSave={saveCapability}
        organizationId={organizationId}
        entityId={entityId}
        partyId={row?.party_id || null}
        periodId={periodId}
        moduleKey={moduleKey}
        onComplete={onComplete}
      />
    );
  }

  if (isResolvedFormAction) {
    const formEndpoint =
      resolvedAction?.endpoint ||
      endpointFromAction(
        action
      );

    const formMethod =
      resolvedAction?.method ||
      action?.method ||
      "POST";

    async function saveResolvedFormAction() {
      try {
        setSaving(true);

        if (!formEndpoint) {
          throw new Error(
            "This action is not connected to an execution endpoint yet."
          );
        }

        const missing =
          resolvedSchema
            .filter(
              field => {
                if (
                  !field?.required
                ) {
                  return false;
                }

                const value =
                  values[
                    field.name
                  ];

                return (
                  value ===
                    undefined ||
                  value ===
                    null ||
                  value ===
                    ""
                );
              }
            )
            .map(
              field =>
                field.label ||
                field.name
            );

        if (missing.length) {
          throw new Error(
            `Complete required fields: ${missing.join(", ")}`
          );
        }

        const fieldPayload =
          Object.fromEntries(
            resolvedSchema.map(
              field => [
                field.name,
                values[
                  field.name
                ],
              ]
            )
          );

        const resolvedEntityId =
          resolvedAction
            ?.payload
            ?.entity_id ||
          row?.entity_id ||
          entityId ||
          null;

        const payload = {
          ...(
            resolvedAction?.payload ||
            {}
          ),

          ...fieldPayload,

          organizationId,
          organization_id:
            organizationId,

          entityId:
            resolvedEntityId,

          entity_id:
            resolvedEntityId,

          periodId:
            periodId ||
            row?.period_id ||
            null,

          period_id:
            periodId ||
            row?.period_id ||
            null,

          workspaceId,
          workspace_id:
            workspaceId,

          moduleKey,
          module:
            moduleKey,

          action:
            kind,

          action_id:
            action?.id ||
            kind,

          id:
            row?.id,
        };

        const response =
          await fetch(
            formEndpoint,
            {
              method:
                formMethod,

              headers: {
                "Content-Type":
                  "application/json",
              },

              body:
                JSON.stringify(
                  payload
                ),
            }
          );

        const json =
          await response
            .json()
            .catch(
              () => ({})
            );

        if (
          !response.ok ||
          json?.success ===
            false
        ) {
          throw new Error(
            json?.error ||
            json?.message ||
            `${titleFromAction(action)} failed`
          );
        }

        onComplete?.();
        onClose?.();
      } catch (saveError) {
        window.alert(
          saveError?.message ||
          "Action failed"
        );
      } finally {
        setSaving(false);
      }
    }

    return (
      <CapabilityActionResolver
        open={true}
        saving={saving}
        action={{
          ...action,
          ...resolvedAction,
          engine:
            resolvedAction?.engine ||
            "create",
        }}
        fallbackLabel={
          resolvedAction?.title ||
          titleFromAction(action)
        }
        schema={
          resolvedSchema
        }
        values={
          values
        }
        onChange={(name, value) =>
          setValues(
            current => ({
              ...current,
              [name]:
                value,
            })
          )
        }
        onClose={
          onClose
        }
        onSave={
          saveResolvedFormAction
        }
        organizationId={
          organizationId
        }
        entityId={
          entityId
        }
        partyId={
          row?.party_id ||
          null
        }
        periodId={
          periodId
        }
        moduleKey={
          moduleKey
        }
        onComplete={
          onComplete
        }
      />
    );
  }

  const endpoint = resolvedAction?.endpoint || endpointFromAction(action);
  const method = resolvedAction?.method || action?.method || "POST";
  const isDestructive = kind === "delete" || kind === "archive";
  const canExecute = Boolean(endpoint);

  async function execute() {
    if (!endpoint) {
      setMessage("This action is not connected to an execution endpoint yet.");
      return;
    }

    try {
      setBusy(true);
      setError("");
      setMessage("");

      const actionPayload = {
        organizationId,
        organization_id: organizationId,
        entityId,
        entity_id: entityId,
        periodId,
        period_id: periodId,
        workspaceId,
        workspace_id: workspaceId,
        moduleKey,
        module: moduleKey,
        action: kind,
        action_id: action?.id || kind,
        row,
        id: row?.id,
        ...(resolvedAction?.payload || {}),
      };

      const requestUrl = method === "GET"
        ? `${endpoint}${endpoint.includes("?") ? "&" : "?"}${new URLSearchParams(
            Object.entries(actionPayload)
              .filter(([, value]) =>
                value !== null && value !== undefined && typeof value !== "object"
              )
              .map(([key, value]) => [key, String(value)])
          ).toString()}`
        : endpoint;

      const response = await fetch(requestUrl, {
        method,
        headers: { "Content-Type": "application/json" },
        ...(method === "GET" ? {} : { body: JSON.stringify(actionPayload) }),
      });
      const json = await response.json().catch(() => ({}));

      if (!response.ok || json?.success === false) {
        throw new Error(
          json?.error || json?.message || `${titleFromAction(action)} failed`
        );
      }

      if (json?.redirect) {
        window.location.href = json.redirect;
        return;
      }

      setMessage(json?.message || `${titleFromAction(action)} completed.`);
      onComplete?.();
    } catch (executionError) {
      setError(executionError.message || "Action failed");
    } finally {
      setBusy(false);
    }
  }

  const eyebrow = isDetail
    ? presentation.eyebrow
    : kind === "history"
      ? "Record History"
      : kind === "attachments"
        ? "Attachments"
        : "Record Action";
  const title = isDetail ? presentation.title : titleFromAction(action);
  const subtitle = isDetail
    ? presentation.subtitle
    : firstValue(row, [
        "invoice_number",
        "journal_number",
        "reference_number",
        "account_name",
        "name",
        "display_name",
        "legal_name",
        "code",
      ], "Selected record");

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 px-4 backdrop-blur">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-4xl overflow-hidden rounded-[28px] border border-white/10 bg-[#0a0a0a] shadow-2xl shadow-black"
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-5">
          <div>
            <div className="text-[11px] uppercase tracking-[0.28em] text-amber-300/70">
              {eyebrow}
            </div>
            <h2 className="mt-2 text-3xl font-light tracking-[-0.05em] text-white">
              {title}
            </h2>
            <div className="mt-2 text-sm text-white/45">
              {subtitle || "Business record"}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 px-4 py-2 text-sm text-white/60 hover:bg-white/5"
          >
            Close
          </button>
        </div>

        <div className="max-h-[68vh] overflow-auto px-6 py-5">
          {isDetail ? (
            <DetailSections presentation={presentation} row={row || {}} />
          ) : kind === "history" ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/60">
              <div className="text-white/80">Record timeline</div>
              <div className="mt-3 grid gap-2">
                {[
                  ["Created", row?.created_at, "created_at"],
                  ["Updated", row?.updated_at, "updated_at"],
                  ["Status", row?.status, "status"],
                  [
                    "Reference",
                    row?.reference_number || row?.invoice_number || row?.code,
                    "reference",
                  ],
                ].map(([label, value, key]) => (
                  <div
                    key={label}
                    className="flex justify-between gap-4 border-b border-white/[0.06] py-2 last:border-b-0"
                  >
                    <span className="text-white/35">{label}</span>
                    <span className="text-right">{formatValue(value, key)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : kind === "attachments" ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/60">
              No attachments are linked to this record.
            </div>
          ) : (
            <DetailSections presentation={genericDetail(row || {})} row={row || {}} />
          )}

          {message ? (
            <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
              {message}
            </div>
          ) : null}

          {error ? (
            <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap justify-end gap-3 border-t border-white/10 px-6 py-5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 px-5 py-3 text-sm text-white/60 hover:bg-white/5"
          >
            Back
          </button>

          {canExecute || EXECUTABLE_KINDS.has(kind) ? (
            <button
              type="button"
              onClick={execute}
              disabled={busy}
              className={[
                "rounded-xl px-5 py-3 text-sm font-semibold disabled:opacity-50",
                isDestructive
                  ? "bg-red-400 text-black"
                  : "bg-amber-400 text-black",
              ].join(" ")}
            >
              {busy
                ? "Working..."
                : canExecute
                  ? titleFromAction(action)
                  : "Check Action"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
