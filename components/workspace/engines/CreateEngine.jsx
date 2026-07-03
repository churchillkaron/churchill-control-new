"use client";

import { useEffect, useState } from "react";
import DynamicForm from "./DynamicForm";

export default function CreateEngine({
  open,
  title = "Create",
  schema = [],
  values = {},
  onChange,
  children,
  onClose,
  onSave,
  saving = false,
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-3xl rounded-[30px] border border-white/10 bg-[#0b0b0b] shadow-2xl">

        <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-amber-300/70">
              Create
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

        <div className="max-h-[70vh] overflow-auto p-6">

          {schema.length>0 ? (
            <DynamicForm
              schema={schema}
              values={values}
              onChange={onChange}
            />
          ) : (
            children
          )}

        </div>

        <div className="flex justify-end gap-3 border-t border-white/10 px-6 py-5">
          <button
            onClick={onClose}
            className="rounded-xl border border-white/10 px-5 py-3 text-sm text-white/60"
          >
            Cancel
          </button>

          <button
            onClick={onSave}
            disabled={saving}
            className="rounded-xl bg-amber-400 px-5 py-3 text-sm font-semibold text-black disabled:opacity-50"
          >
            {saving ? "Saving..." : "Create"}
          </button>
        </div>

      </div>
    </div>
  );
}
