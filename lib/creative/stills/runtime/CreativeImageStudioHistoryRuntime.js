const HISTORY_LIMIT = 60;

function clone(value) {
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

export function captureImageStudioHistoryState(state = {}) {
  return clone({
    artboards: state.artboards || [],
    layers: state.layers || [],
    selection: state.selection || { artboard_id: null, layer_ids: [] },
    dirty: Boolean(state.dirty),
  });
}

export function pushImageStudioHistory(past = [], snapshot) {
  return [...past, clone(snapshot)].slice(-HISTORY_LIMIT);
}

export function restoreImageStudioHistoryState(state, snapshot) {
  if (!snapshot) return state;
  return { ...state, ...clone(snapshot) };
}
