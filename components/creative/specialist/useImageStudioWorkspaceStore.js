"use client";
import { create } from "zustand";
import { buildImageStudioWorkspaceState } from "@/lib/creative/stills/runtime/CreativeImageStudioWorkspaceRuntime.js";
import { adaptBoundsToArtboard, alignLayers, distributeLayers } from "@/lib/creative/stills/runtime/CreativeImageStudioDesignRuntime.js";

export const useImageStudioWorkspaceStore = create((set) => ({
  ...buildImageStudioWorkspaceState(),
  hydrate: (input) => set(buildImageStudioWorkspaceState(input)),
  setPanel: (panel) => set((state) => ({ ui: { ...state.ui, panel } })),
  setTool: (tool) => set((state) => ({ ui: { ...state.ui, tool } })),
  selectArtboard: (artboard_id) => set((state) => ({ selection: { ...state.selection, artboard_id, layer_ids: [] } })),
  selectLayers: (layer_ids) => set((state) => ({ selection: { ...state.selection, layer_ids: Array.isArray(layer_ids) ? layer_ids : [] } })),
  setViewport: (viewport) => set((state) => ({ viewport: { ...state.viewport, ...viewport } })),
  toggleCompare: () => set((state) => ({ ui: { ...state.ui, compare: !state.ui.compare } })),
  toggleGrid: () => set((state) => ({ ui: { ...state.ui, grid: !state.ui.grid } })),
  setRegion: (region) => set((state) => ({ ui: { ...state.ui, region } })),
  setCommentPoint: (comment_point) => set((state) => ({ ui: { ...state.ui, comment_point } })),
  updateLayerLocal: (id, patch) => set((state) => ({ layers: state.layers.map((layer) => layer.id === id ? { ...layer, ...patch } : layer), dirty: true })),
  addLayerLocal: (layer) => set((state) => ({ layers: [...state.layers, layer], selection: { ...state.selection, layer_ids: [layer.id] }, dirty: true })),
  reorderLayer: (id, delta) => set((state) => ({ layers: state.layers.map((layer) => layer.id === id ? { ...layer, sort_order: Math.max(0, Number(layer.sort_order || 0) + delta) } : layer), dirty: true })),
  duplicateArtboardLocal: (sourceId, preset) => set((state) => {
    const source = state.artboards.find((item) => item.id === sourceId); if (!source) return state;
    const id = crypto.randomUUID();
    const board = { ...source, id, name: `${source.name} · ${preset.label}`, width: preset.width, height: preset.height, sort_order: state.artboards.length, status: "DRAFT", export_preset: { id: preset.id } };
    const copied = state.layers.filter((layer) => layer.artboard_id === sourceId).map((layer, index) => ({ ...layer, id: crypto.randomUUID(), artboard_id: id, bounds: adaptBoundsToArtboard(layer.bounds, source, board, layer.metadata?.focal_point), sort_order: index }));
    return { artboards: [...state.artboards, board], layers: [...state.layers, ...copied], selection: { artboard_id: id, layer_ids: [] }, dirty: true };
  }),
  alignSelected: (mode) => set((state) => { const board = state.artboards.find((item) => item.id === state.selection.artboard_id); const chosen = state.layers.filter((layer) => state.selection.layer_ids.includes(layer.id)); const aligned = alignLayers(chosen, board, mode); const map = new Map(aligned.map((layer) => [layer.id, layer])); return { layers: state.layers.map((layer) => map.get(layer.id) || layer), dirty: true }; }),
  distributeSelected: (axis) => set((state) => { const chosen = state.layers.filter((layer) => state.selection.layer_ids.includes(layer.id)); const distributed = distributeLayers(chosen, axis); const map = new Map(distributed.map((layer) => [layer.id, layer])); return { layers: state.layers.map((layer) => map.get(layer.id) || layer), dirty: true }; }),
  addCommentLocal: (comment) => set((state) => ({ comments: [...state.comments, comment] })),
  setCompareVersion: (version_id) => set((state) => ({ ui: { ...state.ui, compare_version_id: version_id } })),
  markSaved: () => set({ dirty: false }),
}));
