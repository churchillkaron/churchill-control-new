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
  return action?.action || action?.type || "";
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
  workspaceId,
  moduleKey,
  variant = "dropdown",
  onSelect,
  onCreate,
  onClose,
  onRefresh,
}) {
  const router = useRouter();

  function execute(action) {
    if (!action || action.type === "section") return;

    const kind = resolveKind(action);

    const context = {
      row,
      organizationId,
      workspaceId,
      moduleKey,
      router,
      refresh: onRefresh,
      action,
    };

    if (
      action?.engine &&
      action.type !== "capability" &&
      action.type !== "document"
    ) {

      console.log(
        "ROW PREVIEW ACTION",
        {
          row,
          action,
        }
      );


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


    if (kind === "select" || kind === "open" || kind === "view") {
      onSelect?.(row?.id);
      onClose?.();
      return;
    }

    if (kind === "create" || kind === "create_record") {
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
        "lock",
        "unlock",
        "communication",
      ].includes(kind)
    ) {
      emitWorkspaceEvent(kind, {
        row,
        moduleKey,
        workspaceId,
        organizationId,
        action,
      });

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

    if (typeof action.onClick === "function") {
      action.onClick(context);
      onClose?.();
      return;
    }

    const href = resolveHref(action, context);

    if (href) {
      router.push(href);
      onClose?.();
      return;
    }

    alert(`${titleFromAction(action)} is not wired yet.`);
    onClose?.();
  }

  if (!actions.length) return null;

  const renderAction = (action, index) => {
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
