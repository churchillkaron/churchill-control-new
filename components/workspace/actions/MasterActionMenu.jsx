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
    .replace(/\b\w/g, c => c.toUpperCase());
}

function resolveKind(action) {

  if (action?.capability && action?.action) {
    return action.action;
  }


  if (action?.action) {
    return action.action;
  }


  if (action?.type) {
    return action.type;
  }


  if (action?.id) {
    return action.id;
  }


  return "";

}

function resolveHref(action, context) {
  if (!action) return null;

  if (typeof action.href === "function") {
    return action.href(context);
  }

  return action.href || null;
}

function emitWorkspaceEvent(kind, detail) {
  window.dispatchEvent(
    new CustomEvent(`workspace:${kind}`, {
      detail,
    })
  );
}

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

  function execute(action) {

    console.log(
      "MASTER ACTION CLICK",
      action
    );

    if (!action || action.type === "section") return;

    const kind = resolveKind(action);

    console.log(
      "MASTER ACTION KIND",
      {
        kind,
        action,
      }
    );

    const context = {
      row,
      organizationId,
      entityId:
        row?.entity_id ||
        entityId ||
        null,
      periodId:
        row?.period_id ||
        periodId ||
        null,
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
        new CustomEvent(
          "workspace:engine",
          {
            detail:{

              action,

              context,

              props:
                action.engine === "preview"
                  ? {

                      action,

                      payload: row || {},

                      organizationId,

                      entityId:
                        row?.entity_id || null,

                    }
                  : undefined,


            },
          }
        )
      );


      onClose?.();

      return;
    }


    if (kind === "open" || kind === "view") {

      if (onAction) {

        onAction({
          row,
          organizationId,
          entityId:
            row?.entity_id ||
            entityId ||
            null,
          periodId,
          workspaceId,
          moduleKey,
          action: {
            ...action,
          },
        });

      } else {

        emitWorkspaceEvent(
          "open",
          context
        );

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
      !(
        action?.capability &&
        action?.action
      )
    ) {
      onCreate?.();
      onClose?.();
      return;
    }

    if (
      [
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
      ].includes(kind)
    ) {
      if (onAction) {
        onAction(context);
      } else {
        emitWorkspaceEvent(kind, context);
      }

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

      console.warn(
        "Legacy action handler:",
        action.handler
      );

      onToggleMenu?.(null);
      return;

    }



    if (onAction) {
      onAction(context);

      onClose?.();

      return;
    }

    alert(`${titleFromAction(action)} is not wired yet.`);
    onClose?.();
  }

  if (!actions.length) return null;

  const renderAction = (action, index) => {

    console.log(
      "MASTER MENU RENDER ACTION",
      {
        action,
        actionsLength: actions.length,
        row,
      }
    );

    if (action.type === "section") {
      return (
        <div
          key={`${action.label}-${index}`}
          className={
            variant === "grid"
              ? "col-span-2 pt-2 text-[10px] uppercase tracking-[0.24em] text-[#D6A66A]/70 first:pt-0"
              : "px-3 pt-3 pb-1 text-[10px] uppercase tracking-[0.22em] text-[#D6A66A]/70 first:pt-1"
          }
        >
          {action.label}
        </div>
      );
    }

    return (
      <button
        key={`${titleFromAction(action)}-${index}`}
        onClick={(event) => {
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
  };

  if (variant === "grid") {
    return (
      <div className="grid grid-cols-2 gap-2">
        {actions.map(renderAction)}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {actions.map(renderAction)}
    </div>
  );
}
