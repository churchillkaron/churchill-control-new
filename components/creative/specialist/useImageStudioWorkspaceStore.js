"use client";
import { create } from "zustand";
import { buildImageStudioWorkspaceState } from "@/lib/creative/stills/runtime/CreativeImageStudioWorkspaceRuntime.js";

export const useImageStudioWorkspaceStore = create((set) => ({
  ...buildImageStudioWorkspaceState(),
  hydrate: (input) => set(buildImageStudioWorkspaceState(input)),
  setPanel: (panel) => set((state) => ({ ui: { ...state.ui, panel } })),
  setTool: (tool) => set((state) => ({ ui: { ...state.ui, tool } })),
  selectArtboard: (artboard_id) => set((state) => ({ selection: { ...state.selection, artboard_id, layer_ids: [] } })),
  selectLayers: (layer_ids) => set((state) => ({ selection: { ...state.selection, layer_ids: Array.isArray(layer_ids) ? layer_ids : [] } })),
  setViewport: (viewport) => set((state) => ({ viewport: { ...state.viewport, ...viewport } })),
  toggleCompare: () => set((state) => ({ ui: { ...state.ui, compare: !state.ui.compare } })),
  updateLayerLocal: (id, patch) => set((state) => ({ layers: state.layers.map((layer) => layer.id === id ? { ...layer, ...patch } : layer), dirty: true })),
  markSaved: () => set({ dirty: false }),
}));
