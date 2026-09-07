"use client";

import { useState } from "react";

export default function useCreateEngine() {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  return {
    open,
    saving,

    show() {
      setOpen(true);
    },

    hide() {
      setOpen(false);
    },

    async save(fn) {
      try {
        setSaving(true);

        if (fn) {
          await fn();
        }

        setOpen(false);
      } catch (error) {
        const message = error?.message || "Unable to create this record";
        console.error("CREATE ENGINE SAVE FAILED", error);
        if (typeof window !== "undefined") {
          window.alert(message);
        }
        throw error;
      } finally {
        setSaving(false);
      }
    },
  };
}
