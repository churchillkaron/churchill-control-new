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
      const key = event.key.toLowerCase();
      if (command && key === "a") {
        event.preventDefault();
        const boardId = workspace.selection.artboard_id;
        workspace.selectLayers(workspace.layers.filter((layer) => layer.artboard_id === boardId && layer.visible !== false && !layer.locked).map((layer) => layer.id));
        return;
      }
      if (command && key === "z" && !event.shiftKey) { event.preventDefault(); workspace.undo(); return; }
      if ((command && key === "z" && event.shiftKey) || (event.ctrlKey && key === "y")) { event.preventDefault(); workspace.redo(); return; }
      if (command && key === "c" && workspace.selection.layer_ids.length) { event.preventDefault(); workspace.copySelected(); return; }
      if (command && key === "v") { event.preventDefault(); workspace.pasteClipboard(); return; }
      if (command && key === "d") { event.preventDefault(); workspace.duplicateSelected(); }
      if (command && key === "s") { event.preventDefault(); void persistence?.saveSelectedArtboard?.(); }
      if (event.key === "Escape") workspace.selectLayers([]);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [workspace, persistence]);
  return null;
}
