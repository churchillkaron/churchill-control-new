"use client";

import { useRouter } from "next/navigation";

function resolveHref(action, context) {
  if (!action) return null;

  if (typeof action.href === "function") {
    return action.href(context);
  }

  return action.href || null;
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

    if(action?.type==="communication"){

      window.dispatchEvent(

        new CustomEvent(

          "workspace:communication",

          {
            detail:{
              row,
              moduleKey,
              organizationId,
              action,
            },
          }

        )

      );

      onClose?.();

      return;

    }

    if(action?.type==="export"){

      window.dispatchEvent(

        new CustomEvent(

          "workspace:export",

          {
            detail:{
              row,
              moduleKey,
              organizationId,
              action,
            },
          }

        )

      );

      onClose?.();

      return;

    }

    if(action?.type==="import"){

      window.dispatchEvent(

        new CustomEvent(

          "workspace:import",

          {
            detail:{
              moduleKey,
              organizationId,
              action,
            },
          }

        )

      );

      onClose?.();

      return;

    }

    if (!action || action.type === "section") return;

    const context = {
      row,
      organizationId,
      workspaceId,
      moduleKey,
      router,
      refresh: onRefresh,
    };

    if (action.type === "select") {
      onSelect?.(row?.id);
      onClose?.();
      return;
    }

    if (action.type === "create") {
      onCreate?.();
      onClose?.();
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
    }
  }

  if (!actions.length) return null;

  if (variant === "grid") {
    return (
      <div className="grid grid-cols-2 gap-2">
        {actions.map((action, index) => {
          if (action.type === "section") {
            return (
              <div
                key={`${action.label}-${index}`}
                className="col-span-2 pt-2 text-[10px] uppercase tracking-[0.24em] text-[#D6A66A]/70 first:pt-0"
              >
                {action.label}
              </div>
            );
          }

          return (
            <button
              key={`${action.label}-${index}`}
              onClick={() => execute(action)}
              className={[
                "rounded-xl border border-white/[0.07] bg-black/24 px-3 py-3 text-left text-[12px] transition hover:bg-white/[0.06]",
                action.danger
                  ? "text-red-300 hover:text-red-200"
                  : "text-white/55 hover:text-white/80",
              ].join(" ")}
            >
              {action.label}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {actions.map((action, index) => {
        if (action.type === "section") {
          return (
            <div
              key={`${action.label}-${index}`}
              className="px-3 pt-3 pb-1 text-[10px] uppercase tracking-[0.22em] text-[#D6A66A]/70 first:pt-1"
            >
              {action.label}
            </div>
          );
        }

        return (
          <button
            key={`${action.label}-${index}`}
            onClick={(event) => {
              event.stopPropagation();
              execute(action);
            }}
            className={[
              "block w-full rounded-xl px-3 py-2.5 text-left text-[12px] transition hover:bg-white/[0.07]",
              action.danger
                ? "text-red-300 hover:text-red-200"
                : "text-white/65 hover:text-white",
            ].join(" ")}
          >
            {action.label}
          </button>
        );
      })}
    </div>
  );
}
