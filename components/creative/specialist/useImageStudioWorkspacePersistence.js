"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function apiUrl({ organizationId, projectId }) {
  const params = new URLSearchParams({ organization_id: organizationId, project_id: projectId });
  return `/api/workspace/creative/image-studio?${params.toString()}`;
}

async function json(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) {
    const error = new Error(body.error || `Image Studio request failed (${response.status})`);
    error.status = response.status;
    error.code = body.error || null;
    throw error;
  }
  return body;
}

function isConflict(error) {
  return error?.status === 409 || /IMAGE_STUDIO_(?:ARTBOARD|LAYER)_CONFLICT/.test(String(error?.code || error?.message || ""));
}

export function useImageStudioWorkspacePersistence({ organizationId, projectId, workspace }) {
  const [status, setStatus] = useState("IDLE");
  const [error, setError] = useState(null);
  const [hydrationState, setHydrationState] = useState("PENDING");
  const [hydratedScope, setHydratedScope] = useState(null);
  const [conflict, setConflict] = useState(null);
  const activeLoadScopeRef = useRef(null);
  const hydrate = workspace.hydrate;

  const load = useCallback(async () => {
    if (!organizationId || !projectId) return null;
    const scopeKey = `${organizationId}:${projectId}`;
    activeLoadScopeRef.current = scopeKey;
    setStatus("LOADING"); setError(null); setHydrationState("LOADING");
    try {
      const body = await json(await fetch(apiUrl({ organizationId, projectId }), { cache: "no-store" }));
      if (activeLoadScopeRef.current !== scopeKey) return null;
      const hasDurableWorkspace = Boolean(body.workspace?.artboards?.length);
      if (hasDurableWorkspace) hydrate(body.workspace);
      setHydratedScope(scopeKey);
      setHydrationState(hasDurableWorkspace ? "DURABLE" : "EMPTY");
      setStatus("READY");
      return body.workspace || null;
    } catch (nextError) {
      if (activeLoadScopeRef.current !== scopeKey) return null;
      setHydratedScope(scopeKey);
      setError(nextError.message); setHydrationState("ERROR"); setStatus("ERROR");
      return null;
    }
  }, [organizationId, projectId, hydrate]);
  const action = useCallback(async (type, payload = {}) => {
    if (!organizationId || !projectId) throw new Error("Image Studio scope unavailable");
    setStatus("SAVING"); setError(null);
    try {
      const body = await json(await fetch("/api/workspace/creative/image-studio", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type, organization_id: organizationId, project_id: projectId, payload }),
      }));
      setStatus("READY");
      return body.result;
    } catch (nextError) {
      setError(nextError.message); setStatus(isConflict(nextError) ? "CONFLICT" : "ERROR");
      throw nextError;
    }
  }, [organizationId, projectId]);

  const saveSelectedArtboard = useCallback(async () => {
    if (conflict) throw new Error("IMAGE_STUDIO_CONFLICT_REQUIRES_RESOLUTION");
    const current = workspace.artboards.find((item) => item.id === workspace.selection.artboard_id) || workspace.artboards[0];
    if (!current) throw new Error("No artboard selected");
    const activeLayers = workspace.layers.filter((item) => item.artboard_id === current.id);
    const localSnapshot = { artboard: structuredClone(current), layers: structuredClone(activeLayers) };
    try {
      const id = UUID.test(current.id) ? current.id : crypto.randomUUID();
      const saved = await action(UUID.test(current.id) ? "update_artboard" : "create_artboard", { ...current, id, expected_updated_at: UUID.test(current.id) ? current.updated_at || null : null });
      workspace.selectArtboard(saved.id);
      for (const layer of activeLayers) {
        await action("update_layer", { ...layer, artboard_id: saved.id, id: UUID.test(layer.id) ? layer.id : crypto.randomUUID(), expected_updated_at: UUID.test(layer.id) ? layer.updated_at || null : null });
      }
      await load();
      workspace.selectArtboard(saved.id);
      workspace.markSaved();
      return saved;
    } catch (nextError) {
      if (isConflict(nextError)) setConflict({ message: nextError.message, local_snapshot: localSnapshot, created_at: new Date().toISOString(), server_reloaded: false });
      throw nextError;
    }
  }, [action, conflict, load, workspace]);

  const reloadLatestAfterConflict = useCallback(async () => {
    if (!conflict) return null;
    const latest = await load();
    setConflict((current) => current ? { ...current, server_reloaded: true } : current);
    setStatus("CONFLICT_RELOADED");
    return latest;
  }, [conflict, load]);

  const restoreConflictDraftAsCopy = useCallback(() => {
    if (!conflict?.local_snapshot) return null;
    const restoredId = workspace.restoreArtboardDraftCopy(conflict.local_snapshot);
    setConflict(null); setError(null); setStatus("READY");
    return restoredId;
  }, [conflict, workspace]);

  const discardConflict = useCallback(() => { setConflict(null); setError(null); setStatus("READY"); }, []);

  const snapshotSelectedArtboard = useCallback(async () => {
    let artboard = workspace.artboards.find((item) => item.id === workspace.selection.artboard_id) || workspace.artboards[0];
    if (!artboard) throw new Error("No artboard selected");
    if (!UUID.test(artboard.id)) artboard = await saveSelectedArtboard();
    const versions = workspace.versions.filter((item) => item.artboard_id === artboard.id);
    const result = await action("snapshot_version", {
      id: crypto.randomUUID(),
      artboard_id: artboard.id,
      based_on_version_id: artboard.metadata?.restored_from_version_id || null,
      status: "WORKING",
      summary: artboard.metadata?.restored_from_version_id ? `Restored lineage snapshot from v${artboard.metadata?.restored_from_version_number || "?"}` : "Image Studio workspace snapshot",
      snapshot: { artboard, layers: workspace.layers.filter((item) => item.artboard_id === artboard.id) },
    });
    await load();
    return result;
  }, [action, load, saveSelectedArtboard, workspace]);
  useEffect(() => {
    if (!organizationId || !projectId) return;
    void load();
  }, [organizationId, projectId, load]);

  return {
    status,
    error,
    hydrationState,
    hydratedScope,
    conflict,
    load,
    action,
    saveSelectedArtboard,
    snapshotSelectedArtboard,
    reloadLatestAfterConflict,
    restoreConflictDraftAsCopy,
    discardConflict,
  };
}
