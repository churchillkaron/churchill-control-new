import crypto from "node:crypto";
import { ShotRuntime } from "@/lib/creative/shots/runtime/ShotRuntime";
import {
  CreativeChatShotReferenceRuntime,
} from "@/lib/creative/studio/runtime/CreativeChatShotReferenceRuntime";
import {
  CreativeProfessionalDirectionAuthorityRuntime,
} from "@/lib/creative/continuity/runtime/CreativeProfessionalDirectionAuthorityRuntime";

export const CREATIVE_CHAT_SHOT_SET_CONTRACT =
  "AVANTIQO_CHAT_SHOT_SET_V1";

const ALLOWED_SCOPES = new Set([
  "camera",
  "coverage",
  "continuity",
  "performance",
  "edit",
]);
const EDIT_ROOTS = new Set(["coverage", "transition_in", "transition_out"]);

function text(value, limit = 2400) {
  return String(value ?? "").trim().slice(0, limit);
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function normalizeScope(value) {
  return [...new Set(
    list(value)
      .map((item) => text(item, 80).toLowerCase())
      .filter((item) => ALLOWED_SCOPES.has(item)),
  )];
}

function normalized(value) {
  return text(value, 1200)
    .toLowerCase()
    .replace(/[“”"'`]/g, "")
    .replace(/[_/\\]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function shotSummary(shot = {}, index = null) {
  return {
    shot_id: text(shot.id, 180),
    scene_id: text(shot.scene_id, 180) || null,
    scene_number: Number(shot.scene_number || 0) || null,
    shot_number: Number(shot.shot_number || 0) || null,
    project_ordinal: Number.isInteger(index) ? index + 1 : null,
    title: text(shot.title, 500) || null,
    purpose: text(shot.purpose, 900) || null,
    revision_number: Number(shot.metadata?.revision_number || 0),
    professional_locked_fields:
      CreativeProfessionalDirectionAuthorityRuntime.lockedFields(shot),
  };
}

function conflictRoots(scope = []) {
  const roots = new Set(scope.filter((item) => item !== "edit"));
  if (scope.includes("edit")) {
    for (const root of EDIT_ROOTS) roots.add(root);
  }
  return roots;
}

function lockConflicts(shot = {}, scope = []) {
  const roots = conflictRoots(scope);
  return CreativeProfessionalDirectionAuthorityRuntime.lockedFields(shot)
    .filter((path) => roots.has(text(path, 500).split(".")[0]));
}

function rangeFromReference(reference) {
  const value = normalized(reference).replace(/–|—/g, "-");
  const match = value.match(/(?:shots?\s*)?#?(\d{1,4})\s*(?:-|to|through)\s*#?(\d{1,4})/i);
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (!start || !end) return null;
  return start <= end ? [start, end] : [end, start];
}

function sceneNumberFromReference(reference) {
  const match = normalized(reference).match(/\bscene\s*#?\s*(\d{1,4})\b/i);
  return match ? Number(match[1]) : null;
}

function isCurrentScene(reference) {
  const value = normalized(reference);
  return new Set([
    "this scene",
    "current scene",
    "the scene",
    "this whole scene",
    "current whole scene",
  ]).has(value);
}

function fingerprint({ creative_project_id, instruction, revision_scope, shots }) {
  const payload = JSON.stringify({
    contract: CREATIVE_CHAT_SHOT_SET_CONTRACT,
    creative_project_id,
    instruction: text(instruction, 1600),
    revision_scope: [...normalizeScope(revision_scope)].sort(),
    shots: shots.map((shot) => ({
      shot_id: text(shot.id, 180),
      revision_number: Number(shot.metadata?.revision_number || 0),
    })),
  });
  return crypto.createHash("sha256").update(payload).digest("hex");
}

function uniqueShots(shots = [], projectShots = []) {
  const order = new Map(projectShots.map((shot, index) => [shot.id, index]));
  return [...new Map(shots.map((shot) => [shot.id, shot])).values()]
    .sort((left, right) => (order.get(left.id) ?? 999999) - (order.get(right.id) ?? 999999));
}

async function resolveReferences({
  organization_id,
  creative_project_id,
  references,
  anchor_shot_id,
}) {
  const resolved = [];
  for (const reference of references) {
    const result = await CreativeChatShotReferenceRuntime.resolve({
      organization_id,
      creative_project_id,
      shot_reference: text(reference, 1200),
      anchor_shot_id,
    });
    resolved.push(result.shot);
  }
  return resolved;
}

export async function resolveCreativeChatShotSet({
  organization_id,
  creative_project_id,
  shot_ids = [],
  shot_references = [],
  shot_set_reference = null,
  anchor_shot_id = null,
  instruction = null,
  revision_scope = [],
  max_shots = 24,
} = {}) {
  if (!organization_id) throw new Error("organization_id required");
  if (!creative_project_id) throw new Error("creative_project_id required");

  const projectShots = await ShotRuntime.list({ organization_id, creative_project_id });
  if (!projectShots.length) {
    const error = new Error("CREATIVE_CHAT_SHOT_SET_NO_SHOTS");
    error.status = 404;
    throw error;
  }

  const byId = new Map(projectShots.map((shot) => [text(shot.id, 180), shot]));
  let selected = [];
  let resolution = null;

  const exactIds = list(shot_ids).map((id) => text(id, 180)).filter(Boolean);
  if (exactIds.length) {
    const missing = exactIds.filter((id) => !byId.has(id));
    if (missing.length) {
      const error = new Error(`CREATIVE_CHAT_SHOT_SET_ID_NOT_FOUND:${missing.slice(0, 8).join(",")}`);
      error.status = 404;
      throw error;
    }
    selected.push(...exactIds.map((id) => byId.get(id)));
    resolution = "EXACT_IDS";
  }

  const references = list(shot_references).map((value) => text(value, 1200)).filter(Boolean);
  if (references.length) {
    selected.push(...await resolveReferences({
      organization_id,
      creative_project_id,
      references,
      anchor_shot_id,
    }));
    resolution = resolution ? `${resolution}+REFERENCES` : "REFERENCES";
  }

  const setReference = text(shot_set_reference, 1200);
  if (setReference) {
    const range = rangeFromReference(setReference);
    if (range) {
      const [start, end] = range;
      const rangeShots = projectShots.slice(start - 1, end);
      if (rangeShots.length !== end - start + 1) {
        const error = new Error("CREATIVE_CHAT_SHOT_SET_RANGE_OUT_OF_BOUNDS");
        error.status = 409;
        error.details = { start, end, project_shot_count: projectShots.length };
        throw error;
      }
      selected.push(...rangeShots);
      resolution = resolution ? `${resolution}+PROJECT_RANGE` : "PROJECT_RANGE";
    } else if (isCurrentScene(setReference)) {
      const anchor = byId.get(text(anchor_shot_id, 180));
      if (!anchor) {
        const error = new Error("CREATIVE_CHAT_SHOT_SET_SCENE_ANCHOR_REQUIRED");
        error.status = 409;
        throw error;
      }
      selected.push(...projectShots.filter((shot) => shot.scene_id === anchor.scene_id));
      resolution = resolution ? `${resolution}+ACTIVE_SCENE` : "ACTIVE_SCENE";
    } else {
      const sceneNumber = sceneNumberFromReference(setReference);
      if (sceneNumber !== null) {
        const sceneShots = projectShots.filter(
          (shot) => Number(shot.scene_number || 0) === sceneNumber,
        );
        if (!sceneShots.length) {
          const error = new Error("CREATIVE_CHAT_SHOT_SET_SCENE_NOT_FOUND");
          error.status = 404;
          throw error;
        }
        selected.push(...sceneShots);
        resolution = resolution ? `${resolution}+SCENE_NUMBER` : "SCENE_NUMBER";
      } else {
        const single = await CreativeChatShotReferenceRuntime.resolve({
          organization_id,
          creative_project_id,
          shot_reference: setReference,
          anchor_shot_id,
        });
        selected.push(single.shot);
        resolution = resolution ? `${resolution}+SINGLE_REFERENCE` : "SINGLE_REFERENCE";
      }
    }
  }

  selected = uniqueShots(selected, projectShots);
  if (!selected.length) {
    const error = new Error("CREATIVE_CHAT_SHOT_SET_REFERENCE_REQUIRED");
    error.status = 400;
    throw error;
  }

  const limit = Math.max(1, Math.min(50, Number(max_shots) || 24));
  if (selected.length > limit) {
    const error = new Error("CREATIVE_CHAT_SHOT_SET_TOO_LARGE");
    error.status = 409;
    error.details = {
      selected_shot_count: selected.length,
      max_shots: limit,
      resolution:
        "Split the directing request into a smaller scene or shot range before execution.",
    };
    throw error;
  }

  const scope = normalizeScope(revision_scope);
  const lockConflictsByShot = selected
    .map((shot) => ({
      shot_id: shot.id,
      locked_fields: lockConflicts(shot, scope),
    }))
    .filter((row) => row.locked_fields.length);

  return {
    contract: CREATIVE_CHAT_SHOT_SET_CONTRACT,
    resolution: resolution || "EXACT_SET",
    creative_project_id,
    instruction: text(instruction, 1600) || null,
    revision_scope: scope,
    shot_count: selected.length,
    shots: selected,
    summaries: selected.map((shot) => shotSummary(
      shot,
      projectShots.findIndex((candidate) => candidate.id === shot.id),
    )),
    professional_lock_conflicts: lockConflictsByShot,
    plan_fingerprint: fingerprint({
      creative_project_id,
      instruction,
      revision_scope: scope,
      shots: selected,
    }),
    media_generation_executed: false,
    publish_authorized: false,
  };
}

export const CreativeChatShotSetRuntime = Object.freeze({
  contract: CREATIVE_CHAT_SHOT_SET_CONTRACT,
  resolve: resolveCreativeChatShotSet,
});

export default CreativeChatShotSetRuntime;
