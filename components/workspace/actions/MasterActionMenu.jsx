"use client";

import { useRouter } from "next/navigation";

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
    .replace(/\b\w/g, character => character.toUpperCase());
}

function resolveKind(action) {
  if (action?.capability && action?.action) return action.action;
  if (action?.action) return action.action;
  if (action?.type) return action.type;
  if (action?.id) return action.id;
  return "";
}

function resolveHref(action, context) {
  if (!action) return null;
  if (typeof action.href === "function") return action.href(context);
  return action.href || null;
}

function emitWorkspaceEvent(kind, detail) {
  window.dispatchEvent(
    new CustomEvent(`workspace:${kind}`, {
      detail,
    })
  );
}

function actionKey(action) {
  return String(
    action?.id ||
    action?.action ||
    action?.type ||
    action?.label ||
    ""
  )
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_");
}

function withGeneralLedgerActions(actions, moduleKey, row) {
  if (String(moduleKey || "").toLowerCase() !== "general_ledger") {
    return actions;
  }

  const configured = Array.isArray(actions) ? actions : [];
  const journalId = row?.journal_entry_id || row?.journal_id || null;
  const additions = [
    { id: "open", type: "open", label: "Open Ledger Line" },
    { id: "history", type: "history", label: "History" },
    { id: "attachments", type: "attachments", label: "Attachments" },
    ...(journalId
      ? [
          {
            id: "request_reversal",
            type: "capability",
            label: "Request Reversal",
            capability: "general_ledger",
            action: "requestJournalReversalCommand",
            form: "journal-reversal",
            endpoint: "/api/finance/journals/request-reversal",
          },
          {
            id: "create_adjustment",
            type: "capability",
            label: "Create Adjustment Journal",
            capability: "journal_entry",
            action: "createAdjustmentJournal",
            form: "journal-entry",
            endpoint: "/api/finance/journals/create",
          },
        ]
      : []),
  ];

  const seen = new Set();
  return [...configured, ...additions].filter(action => {
    const key = actionKey(action);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const STANDARD_ACTION_KINDS = new Set([
  "import",
  "export",
  "ai",
  "report",
  "reports",
  "settings",
  "automation",
  "permissions",
  "history",
  "attachments",
  "duplicate",
  "archive",
  "delete",
  "edit",
  "approve",
  "reject",
  "post",
  "reverse",
  "reconcile",
  "close",
  "submit",
  "assign",
  "complete",
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
  "communication",
]);

export default function MasterActionMenu({
  actions = [],
  row = null,
  organizationId,
  entityId,
  periodId,
  workspaceId,
  moduleKey,
  variant = "dropdown",
  onSelect,
  onCreate,
  onAction,
  onClose,
  onRefresh,
}) {
  const router = useRouter();
  const effectiveActions = withGeneralLedgerActions(actions, moduleKey, row);

  function execute(action) {
    if (!action || action.type === "section") return;

    const kind = resolveKind(action);
    const context = {
      row,
      organizationId,
      entityId: row?.entity_id || entityId || null,
      periodId: row?.period_id || periodId || null,
      workspaceId,
      moduleKey,
      router,
      refresh: onRefresh,
      action,
    };

    const href = resolveHref(action, context);
    if (href) {
      router.push(href);
      onClose?.();
      return;
    }

    if (
      action?.engine &&
      action.type !== "capability" &&
      action.type !== "document"
    ) {
      window.dispatchEvent(
        new CustomEvent("workspace:engine", {
          detail: {
            action,
            context,
            props:
              action.engine === "preview"
                ? {
                    action,
                    payload: row || {},
                    organizationId,
                    entityId: row?.entity_id || null,
                  }
                : undefined,
          },
        })
      );
      onClose?.();
      return;
    }

    if (kind === "open" || kind === "view") {
      if (onAction) {
        onAction({
          row,
          organizationId,
          entityId: row?.entity_id || entityId || null,
          periodId,
          workspaceId,
          moduleKey,
          action: { ...action },
        });
      } else {
        emitWorkspaceEvent("open", context);
      }
      onClose?.();
      return;
    }

    if (kind === "select") {
      onSelect?.(row?.id);
      onClose?.();
      return;
    }

    if (
      (kind === "create" || kind === "create_record") &&
      !(action?.capability && action?.action)
    ) {
      onCreate?.();
      onClose?.();
      return;
    }

    if (STANDARD_ACTION_KINDS.has(kind)) {
      if (onAction) onAction(context);
      else emitWorkspaceEvent(kind, context);

      onClose?.();

      if (
        [
          "edit",
          "history",
          "attachments",
          "duplicate",
          "archive",
          "delete",
        ].includes(kind)
      ) {
        onSelect?.(row?.id);
      }
      return;
    }

    if (action?.handler) {
      console.warn("Legacy action handler:", action.handler);
      onClose?.();
      return;
    }

    if (onAction) {
      onAction(context);
      onClose?.();
      return;
    }

    window.alert(`${titleFromAction(action)} is not wired yet.`);
    onClose?.();
  }

  if (!effectiveActions.length) return null;

  function renderAction(action, index) {
    if (action.type === "section") {
      return (
        <div
          key={`${action.label}-${index}`}
          className={
            variant === "grid"
              ? "col-span-2 pt-2 text-[10px] uppercase tracking-[0.24em] text-[#D6A66A]/70 first:pt-0"
              : "px-3 pb-1 pt-3 text-[10px] uppercase tracking-[0.22em] text-[#D6A66A]/70 first:pt-1"
          }
        >
          {action.label}
        </div>
      );
    }

    return (
      <button
        key={`${titleFromAction(action)}-${index}`}
        type="button"
        onClick={event => {
          event.stopPropagation();
          execute(action);
        }}
        className={
          variant === "grid"
            ? [
                "rounded-xl border border-white/[0.07] bg-black/24 px-3 py-3 text-left text-[12px] transition hover:bg-white/[0.06]",
                action.danger
                  ? "text-red-300 hover:text-red-200"
                  : "text-white/55 hover:text-white/80",
              ].join(" ")
            : [
                "block w-full rounded-xl px-3 py-2.5 text-left text-[12px] transition hover:bg-white/[0.07]",
                action.danger
                  ? "text-red-300 hover:text-red-200"
                  : "text-white/65 hover:text-white",
              ].join(" ")
        }
      >
        {titleFromAction(action)}
      </button>
    );
  }

  if (variant === "grid") {
    return (
      <div className="grid grid-cols-2 gap-2">
        {effectiveActions.map(renderAction)}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {effectiveActions.map(renderAction)}
    </div>
  );
}
