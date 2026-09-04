"use client";

import { LockKeyhole, ShieldCheck, UnlockKeyhole } from "lucide-react";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function authority(item = {}) {
  return item.professional_direction || item.metadata?.professional_direction || {};
}

export default function ProfessionalDirectionAuthorityBar({ item, onSave, saving }) {
  const record = authority(item);
  const lockedFields = list(record.locked_fields);
  const locked = lockedFields.length > 0;

  return (
    <div className={`border px-3 py-3 ${
      locked
        ? "border-[#D6A66A]/20 bg-[#D6A66A]/[0.035]"
        : "border-white/[0.065] bg-white/[0.012]"
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          {locked ? (
            <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#D6A66A]/75" strokeWidth={1.5} />
          ) : (
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/32" strokeWidth={1.5} />
          )}
          <div className="min-w-0">
            <div className="text-[8px] font-semibold uppercase tracking-[0.18em] text-white/30">
              Human authority
            </div>
            <div className={`mt-1 text-[10px] font-medium ${locked ? "text-[#D6A66A]/82" : "text-white/55"}`}>
              {locked
                ? `${lockedFields.length} professional direction field${lockedFields.length === 1 ? "" : "s"} locked`
                : "AI may refine unlocked direction"}
            </div>
            <p className="mt-1 text-[8px] leading-3.5 text-white/24">
              {locked
                ? "AI revisions must preserve these exact human decisions unless you release them."
                : "Saving a professional craft change will lock only the fields you actually changed."}
            </p>
          </div>
        </div>

        {locked ? (
          <button
            type="button"
            disabled={saving}
            onClick={() => onSave({
              _unlock_professional_direction_fields: lockedFields,
              revision_reason: "Professional director released the current craft locks for AI revision.",
            })}
            className="flex shrink-0 items-center gap-1.5 border border-white/[0.08] px-2 py-1.5 text-[8px] font-medium text-white/42 transition hover:border-[#D6A66A]/30 hover:text-[#D6A66A]/78 disabled:opacity-35"
          >
            <UnlockKeyhole className="h-3 w-3" strokeWidth={1.5} />
            Release
          </button>
        ) : null}
      </div>

      {locked ? (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {lockedFields.slice(0, 8).map((field) => (
            <span
              key={field}
              className="border border-[#D6A66A]/12 bg-black/20 px-1.5 py-1 text-[7px] tracking-[0.04em] text-[#D6A66A]/52"
            >
              {field}
            </span>
          ))}
          {lockedFields.length > 8 ? (
            <span className="px-1.5 py-1 text-[7px] text-white/24">
              +{lockedFields.length - 8} more
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
