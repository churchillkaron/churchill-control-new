"use client";
import { create } from "zustand";
import { buildImageStudioWorkspaceState } from "@/lib/creative/stills/runtime/CreativeImageStudioWorkspaceRuntime.js";
import { adaptLayerToArtboard, alignLayers, distributeLayers, reorderNormalizedLayers } from "@/lib/creative/stills/runtime/CreativeImageStudioDesignRuntime.js";
import { buildImageStudioGroupPatch } from "@/lib/creative/stills/runtime/CreativeImageStudioInteractionRuntime.js";
import { applyImageStudioStyleDefinition, buildImageStudioComponentDefinition, buildImageStudioStyleDefinition, instantiateImageStudioComponent } from "@/lib/creative/stills/runtime/CreativeImageStudioReusableDesignRuntime.js";
import { captureImageStudioHistoryState, pushImageStudioHistory, restoreImageStudioHistoryState } from "@/lib/creative/stills/runtime/CreativeImageStudioHistoryRuntime.js";
import { buildImageStudioRetouchOperation } from "@/lib/creative/stills/runtime/CreativeImageStudioRetouchRuntime.js";
import { buildImageStudioAdjustmentLayer } from "@/lib/creative/stills/runtime/CreativeImageStudioAdjustmentLayerRuntime.js";
import { buildImageStudioMaskLayer } from "@/lib/creative/stills/runtime/CreativeImageStudioMaskLayerRuntime.js";

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
  selectLayerOrGroup: (id, additive = false) => set((state) => {
    const layer = state.layers.find((item) => item.id === id);
    if (!layer) return state;
    const ids = layer.parent_layer_id
      ? state.layers.filter((item) => item.artboard_id === layer.artboard_id && item.parent_layer_id === layer.parent_layer_id).map((item) => item.id)
      : [id];
    if (!additive) return { selection: { ...state.selection, layer_ids: ids } };
    const selected = new Set(state.selection.layer_ids);
    const allSelected = ids.every((item) => selected.has(item));
    ids.forEach((item) => allSelected ? selected.delete(item) : selected.add(item));
    return { selection: { ...state.selection, layer_ids: [...selected] } };
  }),
  groupSelected: () => set((state) => {
    const patch = buildImageStudioGroupPatch(state.layers, state.selection.layer_ids, `group-${crypto.randomUUID()}`);
    if (!patch) return state;
    const childIds = new Set(patch.child_ids);
    const byId = new Map(patch.child_patches.map((item) => [item.id, item]));
    return {
      layers: state.layers.map((layer) => childIds.has(layer.id) ? { ...layer, ...byId.get(layer.id), metadata: { ...(layer.metadata || {}), logical_group_bounds: patch.bounds } } : layer),
      dirty: true,
      historyPast: pushImageStudioHistory(state.historyPast, captureImageStudioHistoryState(state)),
      historyFuture: [],
    };
  }),
  ungroupSelected: () => set((state) => {
    const selected = new Set(state.selection.layer_ids);
    const groupIds = new Set(state.layers.filter((layer) => selected.has(layer.id) && layer.parent_layer_id).map((layer) => layer.parent_layer_id));
    if (!groupIds.size) return state;
    return {
      layers: state.layers.map((layer) => groupIds.has(layer.parent_layer_id) ? { ...layer, parent_layer_id: null, metadata: { ...(layer.metadata || {}), logical_group_bounds: undefined } } : layer),
      dirty: true,
      historyPast: pushImageStudioHistory(state.historyPast, captureImageStudioHistoryState(state)),
      historyFuture: [],
    };
  }),
  updateArtboardLocal: (id, patch) => set((state) => ({ artboards: state.artboards.map((board) => board.id === id ? { ...board, ...patch } : board), dirty: true, historyPast: pushImageStudioHistory(state.historyPast, captureImageStudioHistoryState(state)), historyFuture: [] })),
  createReusableStyleFromSelected: (name = "Reusable style") => set((state) => {
    const layer=state.layers.find((item)=>state.selection.layer_ids.includes(item.id)); const board=state.artboards.find((item)=>item.id===state.selection.artboard_id); if(!layer||!board)return state;
    const id=`style-${crypto.randomUUID()}`; const definition=buildImageStudioStyleDefinition(layer,{id,name}); const styles=[...(board.metadata?.design_styles||[]).filter((item)=>item.id!==id),definition];
    return { artboards:state.artboards.map((item)=>item.id===board.id?{...item,metadata:{...(item.metadata||{}),design_styles:styles}}:item), layers:state.layers.map((item)=>item.id===layer.id?applyImageStudioStyleDefinition(item,definition):item), dirty:true, historyPast:pushImageStudioHistory(state.historyPast,captureImageStudioHistoryState(state)), historyFuture:[] };
  }),
  applyReusableStyleToSelected: (styleId) => set((state) => {
    const board=state.artboards.find((item)=>item.id===state.selection.artboard_id); const definition=board?.metadata?.design_styles?.find((item)=>item.id===styleId); if(!definition)return state; const selected=new Set(state.selection.layer_ids);
    return { layers:state.layers.map((layer)=>selected.has(layer.id)?applyImageStudioStyleDefinition(layer,definition):layer), dirty:true, historyPast:pushImageStudioHistory(state.historyPast,captureImageStudioHistoryState(state)), historyFuture:[] };
  }),
  createComponentFromSelected: (name = "Component") => set((state) => {
    const board=state.artboards.find((item)=>item.id===state.selection.artboard_id); if(!board)return state; const definition=buildImageStudioComponentDefinition(state.layers,state.selection.layer_ids,{id:`component-${crypto.randomUUID()}`,name}); if(!definition)return state; const components=[...(board.metadata?.design_components||[]),definition];
    return { artboards:state.artboards.map((item)=>item.id===board.id?{...item,metadata:{...(item.metadata||{}),design_components:components}}:item), dirty:true, historyPast:pushImageStudioHistory(state.historyPast,captureImageStudioHistoryState(state)), historyFuture:[] };
  }),
  instantiateComponent: (componentId) => set((state) => {
    const board=state.artboards.find((item)=>item.id===state.selection.artboard_id); const definition=board?.metadata?.design_components?.find((item)=>item.id===componentId); if(!board||!definition)return state; const copies=instantiateImageStudioComponent(definition,{artboard_id:board.id,x:Math.round(board.width*.1),y:Math.round(board.height*.1)}).map((layer,index)=>({...layer,sort_order:state.layers.filter((item)=>item.artboard_id===board.id).length+index}));
    return { layers:[...state.layers,...copies], selection:{...state.selection,layer_ids:copies.map((item)=>item.id)}, dirty:true, historyPast:pushImageStudioHistory(state.historyPast,captureImageStudioHistoryState(state)), historyFuture:[] };
  }),
  createAdjustmentLayerFromSelected: () => set((state) => {
    const board=state.artboards.find((item)=>item.id===state.selection.artboard_id);
    const targets=state.layers.filter((layer)=>state.selection.layer_ids.includes(layer.id)&&layer.artboard_id===board?.id&&layer.layer_type==="IMAGE");
    if(!board||!targets.length)return state;
    const layer=buildImageStudioAdjustmentLayer({id:`adjustment-${crypto.randomUUID()}`,artboard_id:board.id,target_layer_ids:targets.map((item)=>item.id),sort_order:Math.max(-1,...state.layers.filter((item)=>item.artboard_id===board.id).map((item)=>Number(item.sort_order||0)))+1,name:`Adjustment · ${targets.length} target${targets.length===1?"":"s"}`});
    return {layers:[...state.layers,layer],selection:{...state.selection,layer_ids:[layer.id]},dirty:true,historyPast:pushImageStudioHistory(state.historyPast,captureImageStudioHistoryState(state)),historyFuture:[]};
  }),
  createMaskLayerFromRegion: (mask_shape = "RECT") => set((state) => {
    if (!state.ui.region || state.selection.layer_ids.length !== 1) return state;
    const target = state.layers.find((layer) => layer.id === state.selection.layer_ids[0] && layer.artboard_id === state.selection.artboard_id && layer.layer_type === "IMAGE" && !layer.locked);
    if (!target) return state;
    const mask = buildImageStudioMaskLayer({
      id:`mask-${crypto.randomUUID()}`, artboard_id:target.artboard_id, target_layer_id:target.id,
      region:state.ui.region, mask_shape, sort_order:Number(target.sort_order || 0) + 1,
    });
    return {
      layers:[...state.layers.map((layer)=>layer.id===target.id?{...layer,metadata:{...(layer.metadata||{}),clip_mask_layer_id:mask.id}}:layer),mask],
      selection:{...state.selection,layer_ids:[mask.id]}, ui:{...state.ui,region:null}, dirty:true,
      historyPast:pushImageStudioHistory(state.historyPast,captureImageStudioHistoryState(state)),historyFuture:[],
    };
  }),
  createClippingMask: () => set((state) => {
    const chosen=state.layers.filter((layer)=>state.selection.layer_ids.includes(layer.id)&&layer.artboard_id===state.selection.artboard_id).sort((a,b)=>Number(a.sort_order||0)-Number(b.sort_order||0)); if(chosen.length!==2)return state; const target=chosen[0],mask=chosen[1];
    return { layers:state.layers.map((layer)=>layer.id===target.id?{...layer,metadata:{...(layer.metadata||{}),clip_mask_layer_id:mask.id}}:layer.id===mask.id?{...layer,metadata:{...(layer.metadata||{}),is_clip_mask:true,clip_mask_target_id:target.id}}:layer), selection:{...state.selection,layer_ids:[target.id]}, dirty:true, historyPast:pushImageStudioHistory(state.historyPast,captureImageStudioHistoryState(state)), historyFuture:[] };
  }),
  updateSelectedMaskSemantics: (patch = {}) => set((state) => {
    if(state.selection.layer_ids.length!==1)return state;
    const selected=state.layers.find((layer)=>layer.id===state.selection.layer_ids[0]);
    const maskId=selected?.layer_type==="MASK" ? selected.id : selected?.metadata?.clip_mask_layer_id;
    if(!maskId)return state;
    return {layers:state.layers.map((layer)=>layer.id===maskId?{...layer,metadata:{...(layer.metadata||{}),...patch}}:layer),dirty:true,historyPast:pushImageStudioHistory(state.historyPast,captureImageStudioHistoryState(state)),historyFuture:[]};
  }),
  releaseClippingMask: () => set((state) => {
    const target=state.layers.find((layer)=>state.selection.layer_ids.includes(layer.id)&&layer.metadata?.clip_mask_layer_id); if(!target)return state; const maskId=target.metadata.clip_mask_layer_id;
    return { layers:state.layers.map((layer)=>{ if(layer.id===target.id){const metadata={...(layer.metadata||{})};delete metadata.clip_mask_layer_id;return {...layer,metadata};} if(layer.id===maskId){const metadata={...(layer.metadata||{})};delete metadata.is_clip_mask;delete metadata.clip_mask_target_id;return {...layer,metadata};} return layer;}), dirty:true, historyPast:pushImageStudioHistory(state.historyPast,captureImageStudioHistoryState(state)), historyFuture:[] };
  }),
  setViewport: (viewport) => set((state) => ({ viewport: { ...state.viewport, ...viewport } })),
  requestFitToView: () => set((state) => ({ ui: { ...state.ui, fit_request: Number(state.ui.fit_request || 0) + 1 } })),
  toggleCompare: () => set((state) => ({ ui: { ...state.ui, compare: !state.ui.compare } })),
  toggleGrid: () => set((state) => ({ ui: { ...state.ui, grid: !state.ui.grid } })),
  setRegion: (region) => set((state) => ({ ui: { ...state.ui, region } })),
  setCommentPoint: (comment_point) => set((state) => ({ ui: { ...state.ui, comment_point } })),
  setRetouchSourceFromRegion: () => set((state) => {
    if (!state.ui.region || state.selection.layer_ids.length !== 1) return state;
    const layer = state.layers.find((item) => item.id === state.selection.layer_ids[0] && item.layer_type === "IMAGE" && !item.locked);
    if (!layer || Math.abs(Number(layer.transform?.rotation || 0)) > .001) return state;
    return { ui: { ...state.ui, retouch_source_region: { ...state.ui.region }, region: null } };
  }),
  clearRetouchSource: () => set((state) => ({ ui: { ...state.ui, retouch_source_region: null } })),
  addRetouchOperation: (kind, options = {}) => set((state) => {
    if (!state.ui.region || state.selection.layer_ids.length !== 1) return state;
    const id = state.selection.layer_ids[0];
    const layer = state.layers.find((item) => item.id === id && item.layer_type === "IMAGE" && !item.locked);
    if (!layer) return state;
    try {
      const operation = buildImageStudioRetouchOperation({ kind, region: state.ui.region, source_region: options.source_region || state.ui.retouch_source_region || null, layer, amount: options.amount, feather: options.feather });
      return {
        layers: state.layers.map((item) => item.id === id ? { ...item, style: { ...(item.style || {}), retouch_operations: [...(Array.isArray(item.style?.retouch_operations) ? item.style.retouch_operations : []), operation] } } : item),
        ui: { ...state.ui, region: null, retouch_source_region: ["CLONE","HEAL"].includes(String(kind || "").toUpperCase()) ? null : state.ui.retouch_source_region }, dirty: true,
        historyPast: pushImageStudioHistory(state.historyPast, captureImageStudioHistoryState(state)), historyFuture: [],
      };
    } catch { return state; }
  }),
  clearRetouchOperations: () => set((state) => {
    if (state.selection.layer_ids.length !== 1) return state;
    const id = state.selection.layer_ids[0];
    const target = state.layers.find((item) => item.id === id);
    if (!target || !(target.style?.retouch_operations || []).length) return state;
    return { layers: state.layers.map((item) => item.id === id ? { ...item, style: { ...(item.style || {}), retouch_operations: [] } } : item), dirty: true, historyPast: pushImageStudioHistory(state.historyPast, captureImageStudioHistoryState(state)), historyFuture: [] };
  }),
  updateLayerLocal: (id, patch) => set((state) => { const historyPast = state.historyTransaction ? state.historyPast : pushImageStudioHistory(state.historyPast, captureImageStudioHistoryState(state)); return { layers: state.layers.map((layer) => layer.id === id ? { ...layer, ...patch } : layer), dirty: true, historyPast, historyFuture: state.historyTransaction ? state.historyFuture : [] }; }),
  addLayerLocal: (layer) => set((state) => ({ layers: [...state.layers, layer], selection: { ...state.selection, layer_ids: [layer.id] }, dirty: true, historyPast: pushImageStudioHistory(state.historyPast, captureImageStudioHistoryState(state)), historyFuture: [] })),
  reorderLayer: (id, delta) => set((state) => { const target = state.layers.find((layer) => layer.id === id); if (!target) return state; const scoped = state.layers.filter((layer) => layer.artboard_id === target.artboard_id); const normalized = reorderNormalizedLayers(scoped, id, delta); const unchanged = normalized.every((layer, index) => layer.id === scoped.slice().sort((a,b)=>Number(a.sort_order||0)-Number(b.sort_order||0))[index]?.id && Number(layer.sort_order||0) === index); if (unchanged) return state; const byId = new Map(normalized.map((layer) => [layer.id, layer])); return { layers: state.layers.map((layer) => byId.get(layer.id) || layer), dirty: true, historyPast: pushImageStudioHistory(state.historyPast, captureImageStudioHistoryState(state)), historyFuture: [] }; }),
  duplicateArtboardLocal: (sourceId, preset) => set((state) => {
    const source = state.artboards.find((item) => item.id === sourceId); if (!source) return state;
    const id = crypto.randomUUID();
    const board = { ...source, id, name: `${source.name} · ${preset.label}`, width: preset.width, height: preset.height, sort_order: state.artboards.length, status: "DRAFT", export_preset: { id: preset.id } };
    const copied = state.layers.filter((layer) => layer.artboard_id === sourceId).map((layer, index) => ({ ...adaptLayerToArtboard(layer, source, board), id: crypto.randomUUID(), artboard_id: id, sort_order: index }));
    return { artboards: [...state.artboards, board], layers: [...state.layers, ...copied], selection: { artboard_id: id, layer_ids: [] }, dirty: true, historyPast: pushImageStudioHistory(state.historyPast, captureImageStudioHistoryState(state)), historyFuture: [] };
  }),
  alignSelected: (mode) => set((state) => { const board = state.artboards.find((item) => item.id === state.selection.artboard_id); const chosen = state.layers.filter((layer) => state.selection.layer_ids.includes(layer.id)); if (!chosen.length) return state; const aligned = alignLayers(chosen, board, mode); const map = new Map(aligned.map((layer) => [layer.id, layer])); return { layers: state.layers.map((layer) => map.get(layer.id) || layer), dirty: true, historyPast: pushImageStudioHistory(state.historyPast, captureImageStudioHistoryState(state)), historyFuture: [] }; }),
  distributeSelected: (axis) => set((state) => { const chosen = state.layers.filter((layer) => state.selection.layer_ids.includes(layer.id)); if (chosen.length < 3) return state; const distributed = distributeLayers(chosen, axis); const map = new Map(distributed.map((layer) => [layer.id, layer])); return { layers: state.layers.map((layer) => map.get(layer.id) || layer), dirty: true, historyPast: pushImageStudioHistory(state.historyPast, captureImageStudioHistoryState(state)), historyFuture: [] }; }),
  updateReferenceLocal: (reference) => set((state) => ({ references: state.references.map((item) => item.id === reference.id ? { ...item, ...reference } : item) })),
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
  restoreArtboardDraftCopy: (snapshot) => { let restoredId = null; set((state) => { const source = snapshot?.artboard; if (!source) return state; restoredId = `local-conflict-${crypto.randomUUID()}`; const board = { ...structuredClone(source), id: restoredId, name: `${source.name || "Artboard"} · Recovered local draft`, updated_at: null, status: "DRAFT", sort_order: state.artboards.length }; const copiedLayers = (snapshot.layers || []).map((layer, index) => ({ ...structuredClone(layer), id: `local-conflict-layer-${crypto.randomUUID()}`, artboard_id: restoredId, updated_at: null, sort_order: index })); return { artboards: [...state.artboards, board], layers: [...state.layers, ...copiedLayers], selection: { artboard_id: restoredId, layer_ids: [] }, dirty: true, historyPast: pushImageStudioHistory(state.historyPast, captureImageStudioHistoryState(state)), historyFuture: [], historyTransaction: null }; }); return restoredId; },
  restoreVersionAsDraft: (version) => { let restoredId = null; set((state) => { const snapshot = version?.snapshot; const source = snapshot?.artboard; if (!source) return state; restoredId = `local-version-${crypto.randomUUID()}`; const provenance = { ...(source.metadata || {}), restored_from_version_id: version.id || null, restored_from_version_number: version.version_number || null, restored_from_artboard_id: version.artboard_id || source.id || null, restored_at: new Date().toISOString() }; const board = { ...structuredClone(source), id: restoredId, name: `${source.name || "Artboard"} · Restored from v${version.version_number || "?"}`, updated_at: null, status: "DRAFT", sort_order: state.artboards.length, metadata: provenance }; const copiedLayers = (snapshot.layers || []).map((layer, index) => ({ ...structuredClone(layer), id: `local-version-layer-${crypto.randomUUID()}`, artboard_id: restoredId, updated_at: null, sort_order: index, metadata: { ...(layer.metadata || {}), restored_from_layer_id: layer.id || null, restored_from_version_id: version.id || null } })); return { artboards: [...state.artboards, board], layers: [...state.layers, ...copiedLayers], selection: { artboard_id: restoredId, layer_ids: [] }, dirty: true, historyPast: pushImageStudioHistory(state.historyPast, captureImageStudioHistoryState(state)), historyFuture: [], historyTransaction: null, ui: { ...state.ui, compare: false, compare_version_id: version.id || null } }; }); return restoredId; },
  setCompareVersion: (version_id) => set((state) => ({ ui: { ...state.ui, compare_version_id: version_id } })),
  markSaved: () => set({ dirty: false }),
}));
