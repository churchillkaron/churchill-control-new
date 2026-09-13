"use client";
import { useEffect } from "react";

export default function ImageStudioKeyboardShortcuts({ workspace, persistence }) {
  useEffect(() => {
    const handler = (event) => {
      const target = event.target;
      if (target?.matches?.("input,textarea,select,[contenteditable='true']")) return;
      const command = event.metaKey || event.ctrlKey;
      const step = event.shiftKey ? 10 : 1;
      if (event.key === "ArrowLeft") { event.preventDefault(); workspace.nudgeSelected(-step, 0); }
      if (event.key === "ArrowRight") { event.preventDefault(); workspace.nudgeSelected(step, 0); }
      if (event.key === "ArrowUp") { event.preventDefault(); workspace.nudgeSelected(0, -step); }
      if (event.key === "ArrowDown") { event.preventDefault(); workspace.nudgeSelected(0, step); }
      if ((event.key === "Backspace" || event.key === "Delete") && workspace.selection.layer_ids.length) { event.preventDefault(); workspace.deleteSelected(); }
      if (command && event.key.toLowerCase() === "d") { event.preventDefault(); workspace.duplicateSelected(); }
      if (command && event.key.toLowerCase() === "s") { event.preventDefault(); void persistence?.saveSelectedArtboard?.(); }
      if (event.key === "Escape") workspace.selectLayers([]);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [workspace, persistence]);
  return null;
}
