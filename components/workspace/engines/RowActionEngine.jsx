"use client";

import { useMemo, useState } from "react";

import CapabilityActionResolver from "@/components/workspace/master-data/CapabilityActionResolver";

import {
  resolveRowAction,
} from "@/lib/platform/actions/resolveRowAction";
import { getForm } from "@/lib/platform/forms";

function titleFromAction(action) {
  return (
    action?.label ||
    action?.title ||
    action?.name ||
    action?.id ||
    action?.type ||
    "Action"
  )
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase());
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

  const direct =
    action?.action ||
    action?.type ||
    action?.id ||
    "";

  if (direct) {
    const normalized =
      String(direct)
      .toLowerCase()
      .replace(/-/g, "_");

    return (
      inferredKinds.find(kind => normalized.includes(kind)) ||
      normalized
    );
  }

  const label =
    String(action?.label || action?.title || "")
      .toLowerCase();

  for (const kind of inferredKinds) {
    if (label.includes(kind)) {
      return kind;
    }
  }

  return "";
}

function endpointFromAction(action) {
  return (
    action?.endpoint ||
    action?.api ||
    action?.url ||
    null
  );
}

function valueLabel(key) {
  return String(key || "")
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase());
}

function formatValue(value) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
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
  const fields = useMemo(
    () => Object.entries(row || {})
      .filter(([, value]) => value !== undefined && typeof value !== "function")
      .slice(0, 24),
    [row]
  );
  console.log(
    "ROW ACTION DEBUG",
    {
      action,
      moduleKey,
      row,
    }
  );


  const kind =
    resolveKind(action);

  const resolvedAction =
    resolveRowAction({
      moduleKey,
      action,
      row,
      organizationId,
      entityId,
    });


  const isCapabilityAction =
    Boolean(
      action?.capability &&
      action?.action &&
      action?.form
    );


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

        fallbackLabel={
          titleFromAction(action)
        }

        schema={schema}

        values={values}

        onChange={(name, value) => setValues(current => ({ ...current, [name]: value }))}

        onClose={onClose}

        onSave={saveCapability}

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


  const endpoint =
    resolvedAction?.endpoint ||
    endpointFromAction(action);


  const method =
    resolvedAction?.method ||
    action?.method ||
    "POST";

  const isDestructive =
    kind === "delete" ||
    kind === "archive";

  const canExecute =
    Boolean(endpoint);

  async function execute() {
    if (!endpoint) {
      setMessage(
        "This action is available in the menu, but no execution endpoint is configured for it yet."
      );
      return;
    }

    try {
      setBusy(true);
      setError("");
      setMessage("");

      const actionPayload = {
            organizationId,
            organization_id:
              organizationId,
            entityId,
            entity_id:
              entityId,
            periodId,
            period_id:
              periodId,
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
            row,
            id:
              row?.id,

            ...(resolvedAction?.payload || {}),
          };

      const requestUrl = method === "GET"
        ? `${endpoint}${endpoint.includes("?") ? "&" : "?"}${new URLSearchParams(
            Object.entries(actionPayload)
              .filter(([, value]) => value !== null && value !== undefined && typeof value !== "object")
              .map(([key, value]) => [key, String(value)])
          ).toString()}`
        : endpoint;

      const response = await fetch(requestUrl, {
        method,
        headers: { "Content-Type": "application/json" },
        ...(method === "GET" ? {} : { body: JSON.stringify(actionPayload) }),
      });

      const json =
        await response.json()
          .catch(() => ({}));

      if (!response.ok || json?.success === false) {
        throw new Error(
          json?.error ||
          json?.message ||
          `${titleFromAction(action)} failed`
        );
      }


      if (
        json?.redirect
      ) {

        window.location.href =
          json.redirect;

        return;

      }


      setMessage(
        json?.message ||
        `${titleFromAction(action)} completed.`
      );
      onComplete?.();
    } catch (err) {
      setError(
        err.message ||
        "Action failed"
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 px-4 backdrop-blur">
      <div className="w-full max-w-3xl overflow-hidden rounded-[28px] border border-white/10 bg-[#0a0a0a] shadow-2xl shadow-black">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-5">
          <div>
            <div className="text-[11px] uppercase tracking-[0.28em] text-amber-300/70">
              Row Action
            </div>
            <h2 className="mt-2 text-3xl font-light tracking-[-0.05em] text-white">
              {titleFromAction(action)}
            </h2>
            <div className="mt-2 text-sm text-white/42">
              {row?.invoice_number ||
                row?.reference_number ||
                row?.name ||
                row?.display_name ||
                row?.legal_name ||
                row?.id ||
                "Selected record"}
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
          {kind === "history" ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/58">
              <div className="text-white/78">
                Record timeline
              </div>
              <div className="mt-3 grid gap-2">
                {[
                  ["Created", row?.created_at],
                  ["Updated", row?.updated_at],
                  ["Status", row?.status],
                  ["Reference", row?.reference_number || row?.invoice_number || row?.code],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="flex justify-between gap-4 border-b border-white/[0.06] py-2 last:border-b-0"
                  >
                    <span className="text-white/35">{label}</span>
                    <span className="text-right">{formatValue(value)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : kind === "attachments" ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/58">
              No attachment provider is configured for this record yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {fields.map(([key, value]) => (
                <div
                  key={key}
                  className="rounded-2xl border border-white/[0.07] bg-black/24 p-4"
                >
                  <div className="text-[11px] uppercase tracking-[0.18em] text-white/30">
                    {valueLabel(key)}
                  </div>
                  <div className="mt-2 break-words text-sm text-white/72">
                    {formatValue(value)}
                  </div>
                </div>
              ))}
            </div>
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

          {canExecute || [
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
          ].includes(kind) ? (
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
