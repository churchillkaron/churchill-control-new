"use client";
import { create } from "zustand";
import { buildImageStudioWorkspaceState } from "@/lib/creative/stills/runtime/CreativeImageStudioWorkspaceRuntime.js";
import { adaptBoundsToArtboard, alignLayers, distributeLayers, reorderNormalizedLayers } from "@/lib/creative/stills/runtime/CreativeImageStudioDesignRuntime.js";
import { captureImageStudioHistoryState, pushImageStudioHistory, restoreImageStudioHistoryState } from "@/lib/creative/stills/runtime/CreativeImageStudioHistoryRuntime.js";

export const useImageStudioWorkspaceStore = create((set) => ({
  ...buildImageStudioWorkspaceState(),
  historyPast: [],
  historyFuture: [],
  historyTransaction: null,
  clipboardLayers: [],
  hydrate: (input) => set({ ...buildImageStudioWorkspaceState(input), historyPast: [], historyFuture: [], historyTransaction: null, clipboardLayers: [] }),
  beginHistoryTransaction: () => set((state) => state.historyTransaction ? state : { historyTransaction: captureImageStudioHistoryState(state) }),
  endHistoryTransaction: () => set((state) => state.historyTransaction ? { historyPast: pushImageStudioHistory(state.historyPast, state.historyTransaction), historyFuture: [], historyTransaction: null } : state),
  undo: () => set((state) => { const previous = state.historyPast.at(-1); if (!previous) return state; const current = captureImageStudioHistoryState(state); return { ...restoreImageStudioHistoryState(state, previous), historyPast: state.historyPast.slice(0, -1), historyFuture: [current, ...state.historyFuture].slice(0, 60), historyTransaction: null }; }),
  redo: () => set((state) => { const next = state.historyFuture[0]; if (!next) return state; const current = captureImageStudioHistoryState(state); return { ...restoreImageStudioHistoryState(state, next), historyPast: pushImageStudioHistory(state.historyPast, current), historyFuture: state.historyFuture.slice(1), historyTransaction: null }; }),
  setPanel: (panel) => set((state) => ({ ui: { ...state.ui, panel } })),
  setTool: (tool) => set((state) => ({ ui: { ...state.ui, tool } })),
  selectArtboard: (artboard_id) => set((state) => ({ selection: { ...state.selection, artboard_id, layer_ids: [] } })),
  selectLayers: (layer_ids) => set((state) => ({ selection: { ...state.selection, layer_ids: Array.isArray(layer_ids) ? layer_ids : [] } })),
  toggleLayerSelection: (id) => set((state) => ({ selection: { ...state.selection, layer_ids: state.selection.layer_ids.includes(id) ? state.selection.layer_ids.filter((item) => item !== id) : [...state.selection.layer_ids, id] } })),
  setViewport: (viewport) => set((state) => ({ viewport: { ...state.viewport, ...viewport } })),
  toggleCompare: () => set((state) => ({ ui: { ...state.ui, compare: !state.ui.compare } })),
  toggleGrid: () => set((state) => ({ ui: { ...state.ui, grid: !state.ui.grid } })),
  setRegion: (region) => set((state) => ({ ui: { ...state.ui, region } })),
  setCommentPoint: (comment_point) => set((state) => ({ ui: { ...state.ui, comment_point } })),
  updateLayerLocal: (id, patch) => set((state) => { const historyPast = state.historyTransaction ? state.historyPast : pushImageStudioHistory(state.historyPast, captureImageStudioHistoryState(state)); return { layers: state.layers.map((layer) => layer.id === id ? { ...layer, ...patch } : layer), dirty: true, historyPast, historyFuture: state.historyTransaction ? state.historyFuture : [] }; }),
  addLayerLocal: (layer) => set((state) => ({ layers: [...state.layers, layer], selection: { ...state.selection, layer_ids: [layer.id] }, dirty: true, historyPast: pushImageStudioHistory(state.historyPast, captureImageStudioHistoryState(state)), historyFuture: [] })),
  reorderLayer: (id, delta) => set((state) => { const target = state.layers.find((layer) => layer.id === id); if (!target) return state; const scoped = state.layers.filter((layer) => layer.artboard_id === target.artboard_id); const normalized = reorderNormalizedLayers(scoped, id, delta); const unchanged = normalized.every((layer, index) => layer.id === scoped.slice().sort((a,b)=>Number(a.sort_order||0)-Number(b.sort_order||0))[index]?.id && Number(layer.sort_order||0) === index); if (unchanged) return state; const byId = new Map(normalized.map((layer) => [layer.id, layer])); return { layers: state.layers.map((layer) => byId.get(layer.id) || layer), dirty: true, historyPast: pushImageStudioHistory(state.historyPast, captureImageStudioHistoryState(state)), historyFuture: [] }; }),
  duplicateArtboardLocal: (sourceId, preset) => set((state) => {
    const source = state.artboards.find((item) => item.id === sourceId); if (!source) return state;
    const id = crypto.randomUUID();
    const board = { ...source, id, name: `${source.name} · ${preset.label}`, width: preset.width, height: preset.height, sort_order: state.artboards.length, status: "DRAFT", export_preset: { id: preset.id } };
    const copied = state.layers.filter((layer) => layer.artboard_id === sourceId).map((layer, index) => ({ ...layer, id: crypto.randomUUID(), artboard_id: id, bounds: adaptBoundsToArtboard(layer.bounds, source, board, layer.metadata?.focal_point), sort_order: index }));
    return { artboards: [...state.artboards, board], layers: [...state.layers, ...copied], selection: { artboard_id: id, layer_ids: [] }, dirty: true, historyPast: pushImageStudioHistory(state.historyPast, captureImageStudioHistoryState(state)), historyFuture: [] };
  }),
  alignSelected: (mode) => set((state) => { const board = state.artboards.find((item) => item.id === state.selection.artboard_id); const chosen = state.layers.filter((layer) => state.selection.layer_ids.includes(layer.id)); if (!chosen.length) return state; const aligned = alignLayers(chosen, board, mode); const map = new Map(aligned.map((layer) => [layer.id, layer])); return { layers: state.layers.map((layer) => map.get(layer.id) || layer), dirty: true, historyPast: pushImageStudioHistory(state.historyPast, captureImageStudioHistoryState(state)), historyFuture: [] }; }),
  distributeSelected: (axis) => set((state) => { const chosen = state.layers.filter((layer) => state.selection.layer_ids.includes(layer.id)); if (chosen.length < 3) return state; const distributed = distributeLayers(chosen, axis); const map = new Map(distributed.map((layer) => [layer.id, layer])); return { layers: state.layers.map((layer) => map.get(layer.id) || layer), dirty: true, historyPast: pushImageStudioHistory(state.historyPast, captureImageStudioHistoryState(state)), historyFuture: [] }; }),
  addCommentLocal: (comment) => set((state) => ({ comments: [...state.comments, comment] })),
  updateCommentLocal: (comment) => set((state) => ({ comments: state.comments.map((item) => item.id === comment.id ? { ...item, ...comment } : item) })),
  focusComment: (comment) => set((state) => ({
    selection: { artboard_id: comment.artboard_id || state.selection.artboard_id, layer_ids: comment.layer_id ? [comment.layer_id] : [] },
    ui: { ...state.ui, comment_focus_id: comment.id, comment_point: comment.position || null },
  })),
  nudgeSelected: (dx, dy) => set((state) => { const movable = state.layers.some((layer) => state.selection.layer_ids.includes(layer.id) && !layer.locked); if (!movable) return state; return { layers: state.layers.map((layer) => state.selection.layer_ids.includes(layer.id) && !layer.locked ? { ...layer, bounds: { ...layer.bounds, x: Number(layer.bounds?.x || 0) + dx, y: Number(layer.bounds?.y || 0) + dy } } : layer), dirty: true, historyPast: pushImageStudioHistory(state.historyPast, captureImageStudioHistoryState(state)), historyFuture: [] }; }),
  deleteSelected: () => set((state) => { const deletable = state.layers.some((layer) => state.selection.layer_ids.includes(layer.id) && !layer.locked); if (!deletable) return state; return { layers: state.layers.filter((layer) => !state.selection.layer_ids.includes(layer.id) || layer.locked), selection: { ...state.selection, layer_ids: [] }, dirty: true, historyPast: pushImageStudioHistory(state.historyPast, captureImageStudioHistoryState(state)), historyFuture: [] }; }),
  duplicateSelected: () => set((state) => { const copies = state.layers.filter((layer) => state.selection.layer_ids.includes(layer.id)).map((layer) => ({ ...layer, id: crypto.randomUUID(), bounds: { ...layer.bounds, x: Number(layer.bounds?.x || 0) + 16, y: Number(layer.bounds?.y || 0) + 16 }, sort_order: Number(layer.sort_order || 0) + 1 })); if (!copies.length) return state; return { layers: [...state.layers, ...copies], selection: { ...state.selection, layer_ids: copies.map((layer) => layer.id) }, dirty: true, historyPast: pushImageStudioHistory(state.historyPast, captureImageStudioHistoryState(state)), historyFuture: [] }; }),
  copySelected: () => set((state) => ({ clipboardLayers: state.layers.filter((layer) => state.selection.layer_ids.includes(layer.id)).map((layer) => structuredClone(layer)) })),
  pasteClipboard: () => set((state) => { if (!state.clipboardLayers.length) return state; const selectedBoard = state.selection.artboard_id || state.clipboardLayers[0]?.artboard_id; const copies = state.clipboardLayers.map((layer, index) => ({ ...structuredClone(layer), id: crypto.randomUUID(), artboard_id: selectedBoard, bounds: { ...layer.bounds, x: Number(layer.bounds?.x || 0) + 24, y: Number(layer.bounds?.y || 0) + 24 }, sort_order: state.layers.filter((item) => item.artboard_id === selectedBoard).length + index })); return { layers: [...state.layers, ...copies], selection: { artboard_id: selectedBoard, layer_ids: copies.map((layer) => layer.id) }, dirty: true, historyPast: pushImageStudioHistory(state.historyPast, captureImageStudioHistoryState(state)), historyFuture: [] }; }),
  setCompareVersion: (version_id) => set((state) => ({ ui: { ...state.ui, compare_version_id: version_id } })),
  markSaved: () => set({ dirty: false }),
}));
