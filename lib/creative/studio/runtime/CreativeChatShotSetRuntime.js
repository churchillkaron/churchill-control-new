import crypto from "node:crypto";
import { ShotRuntime } from "@/lib/creative/shots/runtime/ShotRuntime";
import {
  CreativeChatShotReferenceRuntime,
} from "@/lib/creative/studio/runtime/CreativeChatShotReferenceRuntime";
import {
  CreativeProfessionalDirectionAuthorityRuntime,
} from "@/lib/creative/continuity/runtime/CreativeProfessionalDirectionAuthorityRuntime";

export const CREATIVE_CHAT_SHOT_SET_CONTRACT =
  "AVANTIQO_CHAT_SHOT_SET_V5";

const ALLOWED_SCOPES = new Set([
  "camera",
  "coverage",
  "continuity",
  "performance",
  "edit",
]);
const EDIT_ROOTS = new Set(["coverage", "transition_in", "transition_out"]);
const NUMBER_WORDS = Object.freeze({
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
});

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
    updated_at: text(shot.updated_at, 180) || null,
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
  if (/\bscene\s*#?\s*\d{1,4}\b/i.test(value)) return null;
  const match = value.match(/(?:shots?\s*)?#?(\d{1,4})\s*(?:-|to|through)\s*#?(\d{1,4})/i);
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (!start || !end) return null;
  return start <= end ? [start, end] : [end, start];
}

function sceneRangeFromReference(reference) {
  const value = normalized(reference).replace(/–|—/g, "-");
  const match = value.match(
    /\bscene\s*#?\s*(\d{1,4})\s*[,;:]?\s*(?:shots?\s*)?#?(\d{1,4})\s*(?:-|to|through)\s*#?(\d{1,4})\b/i,
  );
  if (!match) return null;
  const scene_number = Number(match[1]);
  const first = Number(match[2]);
  const last = Number(match[3]);
  if (!scene_number || !first || !last) return null;
  return {
    scene_number,
    start_shot_number: Math.min(first, last),
    end_shot_number: Math.max(first, last),
  };
}

function sceneNumberFromReference(reference) {
  const match = normalized(reference).match(/\bscene\s*#?\s*(\d{1,4})\b/i);
  return match ? Number(match[1]) : null;
}

function countToken(value) {
  const token = text(value, 40).toLowerCase();
  if (/^\d{1,2}$/.test(token)) return Number(token);
  return NUMBER_WORDS[token] || null;
}

function relativeWindowFromReference(reference) {
  const value = normalized(reference);
  const count = "(\\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)";
  let match = value.match(new RegExp(`^(?:this|current) shot(?: and)? (?:the )?next ${count}(?: shots?)?$`, "i"));
  if (match) return { direction: "next", count: countToken(match[1]), include_anchor: true };
  match = value.match(new RegExp(`^(?:from )?(?:this|current) shot (?:through|to) (?:the )?next ${count}(?: shots?)?$`, "i"));
  if (match) return { direction: "next", count: countToken(match[1]), include_anchor: true };
  match = value.match(new RegExp(`^(?:this|current) shot(?: and)? (?:the )?previous ${count}(?: shots?)?$`, "i"));
  if (match) return { direction: "previous", count: countToken(match[1]), include_anchor: true };
  match = value.match(new RegExp(`^(?:from )?(?:this|current) shot (?:through|to) (?:the )?previous ${count}(?: shots?)?$`, "i"));
  if (match) return { direction: "previous", count: countToken(match[1]), include_anchor: true };
  match = value.match(new RegExp(`^(?:the )?next ${count}(?: shots?)?$`, "i"));
  if (match) return { direction: "next", count: countToken(match[1]), include_anchor: false };
  match = value.match(new RegExp(`^(?:the )?previous ${count}(?: shots?)?$`, "i"));
  if (match) return { direction: "previous", count: countToken(match[1]), include_anchor: false };
  return null;
}

function relativeWindowShots(projectShots, window, anchorShotId, errorPrefix) {
  const anchorIndex = projectShots.findIndex(
    (shot) => text(shot.id, 180) === text(anchorShotId, 180),
  );
  if (anchorIndex < 0) {
    const error = new Error(`${errorPrefix}_ANCHOR_REQUIRED`);
    error.status = 409;
    error.details = {
      resolution:
        "Inspect a concrete shot first so the relative directing set has a server-verified active-shot anchor.",
    };
    throw error;
  }
  const count = Number(window?.count || 0);
  if (!count || count > 24) {
    const error = new Error(`${errorPrefix}_COUNT_INVALID`);
    error.status = 409;
    throw error;
  }

  let start;
  let end;
  if (window.direction === "previous") {
    start = anchorIndex - count;
    end = window.include_anchor ? anchorIndex : anchorIndex - 1;
  } else {
    start = window.include_anchor ? anchorIndex : anchorIndex + 1;
    end = anchorIndex + count;
  }
  if (start < 0 || end >= projectShots.length || start > end) {
    const error = new Error(`${errorPrefix}_OUT_OF_BOUNDS`);
    error.status = 409;
    error.details = {
      anchor_shot_id: text(anchorShotId, 180),
      direction: window.direction,
      count,
      project_shot_count: projectShots.length,
      resolution:
        "Use a smaller relative shot count or an explicit scene/shot range; Avantiqo will not silently truncate a directing set.",
    };
    throw error;
  }
  return projectShots.slice(start, end + 1);
}

function sceneRangeShots(projectShots, sceneRange, errorPrefix) {
  const sceneShots = projectShots.filter(
    (shot) => Number(shot.scene_number || 0) === sceneRange.scene_number,
  );
  if (!sceneShots.length) {
    const error = new Error(`${errorPrefix}_SCENE_NOT_FOUND`);
    error.status = 404;
    error.details = { scene_number: sceneRange.scene_number };
    throw error;
  }

  const requested = [];
  for (
    let shotNumber = sceneRange.start_shot_number;
    shotNumber <= sceneRange.end_shot_number;
    shotNumber += 1
  ) {
    const matches = sceneShots.filter(
      (shot) => Number(shot.shot_number || 0) === shotNumber,
    );
    if (!matches.length) {
      const error = new Error(`${errorPrefix}_SHOT_NOT_FOUND`);
      error.status = 404;
      error.details = {
        scene_number: sceneRange.scene_number,
        shot_number: shotNumber,
      };
      throw error;
    }
    if (matches.length > 1) {
      const error = new Error(`${errorPrefix}_SHOT_AMBIGUOUS`);
      error.status = 409;
      error.details = {
        scene_number: sceneRange.scene_number,
        shot_number: shotNumber,
        matching_shot_ids: matches.map((shot) => text(shot.id, 180)),
      };
      throw error;
    }
    requested.push(matches[0]);
  }
  return requested;
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

function splitInlinePreservation(reference) {
  const source = text(reference, 1200);
  if (!source) return { include_reference: null, preserve_clause: null };
  const match = source.match(/^(.*?)(?:\s+)(?:except|excluding|but\s+not|leave|keep)(?:\s+)(.+)$/i);
  if (!match) return { include_reference: source, preserve_clause: null };
  return {
    include_reference: text(match[1], 1200) || null,
    preserve_clause: text(match[2], 1200) || null,
  };
}

function shotReferencesFromClause(value) {
  const source = normalized(value);
  const refs = [];
  for (const match of source.matchAll(/\bshot\s*#?\s*(\d{1,4})\b/g)) {
    refs.push(`shot ${match[1]}`);
  }
  return [...new Set(refs)];
}

function selectionEdgeFromClause(value) {
  const source = normalized(value);
  const count = "(\\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)";
  const match = source.match(
    new RegExp(`^(?:the )?(first|last)(?: ${count})? shots?$`, "i"),
  );
  if (!match) return null;
  return {
    edge: match[1].toLowerCase(),
    count: match[2] ? countToken(match[2]) : 1,
  };
}

function selectionScopedPreservedShots({
  preserveClause,
  selectedShots,
  projectShots,
  selectionResolution,
}) {
  const selected = list(selectedShots);
  if (!preserveClause || !selected.length) return null;

  const edge = selectionEdgeFromClause(preserveClause);
  if (edge) {
    if (!edge.count || edge.count > selected.length) {
      const error = new Error(
        "CREATIVE_CHAT_SHOT_SET_PRESERVATION_SELECTED_EDGE_OUT_OF_BOUNDS",
      );
      error.status = 409;
      error.details = {
        edge: edge.edge,
        count: edge.count,
        selected_shot_count: selected.length,
      };
      throw error;
    }
    return edge.edge === "first"
      ? selected.slice(0, edge.count)
      : selected.slice(selected.length - edge.count);
  }

  const references = shotReferencesFromClause(preserveClause);
  if (!references.length || /\bscene\s*#?\s*\d{1,4}\b/i.test(normalized(preserveClause))) {
    return null;
  }
  const numbers = references.map((reference) =>
    Number(reference.match(/(\d{1,4})/)?.[1] || 0),
  );
  const selectedIds = new Set(selected.map((shot) => text(shot.id, 180)));

  if (text(selectionResolution, 500).includes("PROJECT_RANGE")) {
    const scoped = numbers.map((number) => projectShots[number - 1] || null);
    const invalid = scoped.find(
      (shot) => !shot || !selectedIds.has(text(shot.id, 180)),
    );
    if (invalid || scoped.some((shot) => !shot)) {
      const error = new Error(
        "CREATIVE_CHAT_SHOT_SET_PRESERVATION_PROJECT_ORDINAL_NOT_SELECTED",
      );
      error.status = 409;
      error.details = { requested_project_ordinals: numbers };
      throw error;
    }
    return scoped;
  }

  const sceneKeys = new Set(selected.map((shot) =>
    `${text(shot.scene_id, 180)}:${Number(shot.scene_number || 0)}`,
  ));
  if (sceneKeys.size !== 1) return null;

  const scoped = [];
  for (const number of numbers) {
    const matches = selected.filter(
      (shot) => Number(shot.shot_number || 0) === number,
    );
    if (!matches.length) {
      const error = new Error(
        "CREATIVE_CHAT_SHOT_SET_PRESERVATION_SELECTED_SHOT_NOT_FOUND",
      );
      error.status = 409;
      error.details = { shot_number: number };
      throw error;
    }
    if (matches.length > 1) {
      const error = new Error(
        "CREATIVE_CHAT_SHOT_SET_PRESERVATION_SELECTED_SHOT_AMBIGUOUS",
      );
      error.status = 409;
      error.details = {
        shot_number: number,
        matching_shot_ids: matches.map((shot) => text(shot.id, 180)),
      };
      throw error;
    }
    scoped.push(matches[0]);
  }
  return scoped;
}

function fingerprint({
  creative_project_id,
  instruction,
  revision_scope,
  shots,
  preserved_shots,
}) {
  const payload = JSON.stringify({
    contract: CREATIVE_CHAT_SHOT_SET_CONTRACT,
    creative_project_id,
    instruction: text(instruction, 1600),
    revision_scope: [...normalizeScope(revision_scope)].sort(),
    shots: shots.map((shot) => ({
      shot_id: text(shot.id, 180),
      revision_number: Number(shot.metadata?.revision_number || 0),
      updated_at: text(shot.updated_at, 180) || null,
    })),
    preserved_shots: preserved_shots.map((shot) => ({
      shot_id: text(shot.id, 180),
      revision_number: Number(shot.metadata?.revision_number || 0),
      updated_at: text(shot.updated_at, 180) || null,
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

async function resolvePreservedShots({
  organization_id,
  creative_project_id,
  projectShots,
  selectedShots,
  selectionResolution,
  byId,
  exclude_shot_ids,
  exclude_shot_references,
  preserve_clause,
  anchor_shot_id,
}) {
  let preserved = [];
  const exactIds = list(exclude_shot_ids).map((id) => text(id, 180)).filter(Boolean);
  const missing = exactIds.filter((id) => !byId.has(id));
  if (missing.length) {
    const error = new Error(`CREATIVE_CHAT_SHOT_SET_EXCLUDED_ID_NOT_FOUND:${missing.slice(0, 8).join(",")}`);
    error.status = 404;
    throw error;
  }
  preserved.push(...exactIds.map((id) => byId.get(id)));

  const references = list(exclude_shot_references)
    .map((value) => text(value, 1200))
    .filter(Boolean);
  if (references.length) {
    preserved.push(...await resolveReferences({
      organization_id,
      creative_project_id,
      references,
      anchor_shot_id,
    }));
  }

  if (preserve_clause) {
    const selectionScoped = selectionScopedPreservedShots({
      preserveClause: preserve_clause,
      selectedShots,
      projectShots,
      selectionResolution,
    });
    if (selectionScoped) {
      preserved.push(...selectionScoped);
    } else {
      const relativeWindow = relativeWindowFromReference(preserve_clause);
      if (relativeWindow) {
        preserved.push(...relativeWindowShots(
          projectShots,
          relativeWindow,
          anchor_shot_id,
          "CREATIVE_CHAT_SHOT_SET_EXCLUDED_RELATIVE_WINDOW",
        ));
      } else {
        const sceneRange = sceneRangeFromReference(preserve_clause);
        if (sceneRange) {
          preserved.push(...sceneRangeShots(
            projectShots,
            sceneRange,
            "CREATIVE_CHAT_SHOT_SET_EXCLUDED_SCENE_RANGE",
          ));
        } else {
          const range = rangeFromReference(preserve_clause);
          if (range) {
            const [start, end] = range;
            const rangeShots = projectShots.slice(start - 1, end);
            if (rangeShots.length !== end - start + 1) {
              const error = new Error("CREATIVE_CHAT_SHOT_SET_EXCLUDED_RANGE_OUT_OF_BOUNDS");
              error.status = 409;
              throw error;
            }
            preserved.push(...rangeShots);
          } else {
            const inlineReferences = shotReferencesFromClause(preserve_clause);
            if (inlineReferences.length) {
              preserved.push(...await resolveReferences({
                organization_id,
                creative_project_id,
                references: inlineReferences,
                anchor_shot_id,
              }));
            } else {
              preserved.push(...await resolveReferences({
                organization_id,
                creative_project_id,
                references: [preserve_clause],
                anchor_shot_id,
              }));
            }
          }
        }
      }
    }
  }

  return uniqueShots(preserved, projectShots);
}

export async function resolveCreativeChatShotSet({
  organization_id,
  creative_project_id,
  shot_ids = [],
  shot_references = [],
  shot_set_reference = null,
  exclude_shot_ids = [],
  exclude_shot_references = [],
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

  const inline = splitInlinePreservation(shot_set_reference);
  const setReference = text(inline.include_reference, 1200);
  if (setReference) {
    const relativeWindow = relativeWindowFromReference(setReference);
    if (relativeWindow) {
      selected.push(...relativeWindowShots(
        projectShots,
        relativeWindow,
        anchor_shot_id,
        "CREATIVE_CHAT_SHOT_SET_RELATIVE_WINDOW",
      ));
      resolution = resolution ? `${resolution}+RELATIVE_WINDOW` : "RELATIVE_WINDOW";
    } else {
      const sceneRange = sceneRangeFromReference(setReference);
      if (sceneRange) {
        selected.push(...sceneRangeShots(
          projectShots,
          sceneRange,
          "CREATIVE_CHAT_SHOT_SET_SCENE_RANGE",
        ));
        resolution = resolution ? `${resolution}+SCENE_SHOT_RANGE` : "SCENE_SHOT_RANGE";
      } else {
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
    }
  }

  selected = uniqueShots(selected, projectShots);
  if (!selected.length) {
    const error = new Error("CREATIVE_CHAT_SHOT_SET_REFERENCE_REQUIRED");
    error.status = 400;
    throw error;
  }

  const preserved = await resolvePreservedShots({
    organization_id,
    creative_project_id,
    projectShots,
    selectedShots: selected,
    selectionResolution: resolution,
    byId,
    exclude_shot_ids,
    exclude_shot_references,
    preserve_clause: inline.preserve_clause,
    anchor_shot_id,
  });
  const selectedIds = new Set(selected.map((shot) => text(shot.id, 180)));
  const outsideSelection = preserved.filter((shot) => !selectedIds.has(text(shot.id, 180)));
  if (outsideSelection.length) {
    const error = new Error("CREATIVE_CHAT_SHOT_SET_PRESERVATION_OUTSIDE_SELECTION");
    error.status = 409;
    error.details = {
      shot_ids: outsideSelection.map((shot) => text(shot.id, 180)),
      resolution:
        "Preserved shots must be part of the selected directing set so the confirmed plan is unambiguous.",
    };
    throw error;
  }

  const preservedIds = new Set(preserved.map((shot) => text(shot.id, 180)));
  selected = selected.filter((shot) => !preservedIds.has(text(shot.id, 180)));
  if (!selected.length) {
    const error = new Error("CREATIVE_CHAT_SHOT_SET_ALL_SHOTS_PRESERVED");
    error.status = 409;
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
  const governedShotCount = selected.length + preserved.length;
  if (governedShotCount > limit) {
    const error = new Error("CREATIVE_CHAT_SHOT_SET_CONTEXT_TOO_LARGE");
    error.status = 409;
    error.details = {
      editable_shot_count: selected.length,
      preserved_shot_count: preserved.length,
      governed_shot_count: governedShotCount,
      max_shots: limit,
      resolution:
        "Split the directing request into a smaller governed shot set; preserved shots still consume immutable reasoning context.",
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
    resolution: preserved.length ? `${resolution || "EXACT_SET"}+PRESERVED_SHOTS` : resolution || "EXACT_SET",
    creative_project_id,
    instruction: text(instruction, 1600) || null,
    revision_scope: scope,
    shot_count: selected.length,
    shots: selected,
    summaries: selected.map((shot) => shotSummary(
      shot,
      projectShots.findIndex((candidate) => candidate.id === shot.id),
    )),
    preserved_shot_count: preserved.length,
    preserved_shots: preserved,
    preserved_summaries: preserved.map((shot) => shotSummary(
      shot,
      projectShots.findIndex((candidate) => candidate.id === shot.id),
    )),
    professional_lock_conflicts: lockConflictsByShot,
    plan_fingerprint: fingerprint({
      creative_project_id,
      instruction,
      revision_scope: scope,
      shots: selected,
      preserved_shots: preserved,
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
