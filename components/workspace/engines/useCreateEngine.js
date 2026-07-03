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
      } finally {
        setSaving(false);
      }
    },
  };
}
