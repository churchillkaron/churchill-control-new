import { ShotRuntime } from "@/lib/creative/shots/runtime/ShotRuntime";

export const CREATIVE_CHAT_SHOT_REFERENCE_CONTRACT =
  "AVANTIQO_CHAT_SHOT_REFERENCE_V1";

const CURRENT_REFERENCES = new Set([
  "this",
  "this shot",
  "current",
  "current shot",
  "same",
  "same shot",
  "that",
  "that shot",
]);
const PREVIOUS_REFERENCES = new Set([
  "previous",
  "previous shot",
  "prev",
  "shot before",
  "the shot before",
  "one before",
]);
const NEXT_REFERENCES = new Set([
  "next",
  "next shot",
  "shot after",
  "the shot after",
  "one after",
]);

function text(value, limit = 2400) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function normalized(value) {
  return text(value, 1200)
    .toLowerCase()
    .replace(/[“”"'`]/g, "")
    .replace(/[_/\\-]+/g, " ")
    .replace(/[^a-z0-9. ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value) {
  return [...new Set(
    normalized(value)
      .split(" ")
      .map((item) => item.trim())
      .filter((item) => item.length >= 2),
  )];
}

function shotNumber(value) {
  const source = normalized(value);
  const match = source.match(/^(?:shot\s*)?#?(\d{1,4})$/i) ||
    source.match(/\bshot\s*#?\s*(\d{1,4})\b/i);
  return match ? Number(match[1]) : null;
}

function cameraCorpus(shot = {}) {
  const camera = object(shot.camera);
  const coverage = object(shot.coverage || shot.metadata?.coverage);
  return [
    camera.shot_size,
    camera.framing,
    camera.angle,
    camera.camera_distance,
    camera.movement,
    camera.lens,
    coverage.shot_size,
    coverage.framing,
    coverage.camera_position,
    coverage.camera_height,
    coverage.subject_distance,
    coverage.coverage_role,
    coverage.purpose,
  ];
}

function shotCorpus(shot = {}) {
  return normalized([
    shot.title,
    shot.purpose,
    shot.subject,
    shot.action,
    shot.performance,
    ...cameraCorpus(shot),
  ].filter(Boolean).join(" "));
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
    duration_seconds: Number(shot.duration_seconds || 0) || null,
  };
}

function candidateError(code, reference, candidates = [], details = {}) {
  const error = new Error(code);
  error.status = 409;
  error.details = {
    contract: CREATIVE_CHAT_SHOT_REFERENCE_CONTRACT,
    reference: text(reference, 1200) || null,
    candidates: candidates.slice(0, 8),
    ...details,
  };
  return error;
}

function resolveRelative(shots, reference, anchorShotId) {
  const value = normalized(reference);
  const anchorIndex = shots.findIndex(
    (shot) => text(shot.id, 180) === text(anchorShotId, 180),
  );
  if (anchorIndex < 0) {
    throw candidateError(
      "CREATIVE_CHAT_SHOT_REFERENCE_ANCHOR_REQUIRED",
      reference,
      [],
      {
        resolution:
          "Inspect a concrete shot first so Chat has a server-verified active shot anchor.",
      },
    );
  }

  if (CURRENT_REFERENCES.has(value)) return shots[anchorIndex];
  if (PREVIOUS_REFERENCES.has(value)) {
    if (anchorIndex === 0) {
      throw candidateError(
        "CREATIVE_CHAT_SHOT_REFERENCE_NO_PREVIOUS_SHOT",
        reference,
        [shotSummary(shots[anchorIndex], anchorIndex)],
      );
    }
    return shots[anchorIndex - 1];
  }
  if (NEXT_REFERENCES.has(value)) {
    if (anchorIndex >= shots.length - 1) {
      throw candidateError(
        "CREATIVE_CHAT_SHOT_REFERENCE_NO_NEXT_SHOT",
        reference,
        [shotSummary(shots[anchorIndex], anchorIndex)],
      );
    }
    return shots[anchorIndex + 1];
  }
  return null;
}

function lexicalCandidates(shots, reference) {
  const query = normalized(reference);
  const queryTokens = tokens(query);
  if (!query || !queryTokens.length) return [];

  return shots
    .map((shot, index) => {
      const corpus = shotCorpus(shot);
      const title = normalized(shot.title);
      const purpose = normalized(shot.purpose);
      let score = 0;

      if (title && title === query) score += 100;
      if (title && title.includes(query)) score += 55;
      if (purpose && purpose.includes(query)) score += 30;
      if (corpus.includes(query)) score += 35;

      let matched = 0;
      for (const token of queryTokens) {
        if (corpus.includes(token)) matched += 1;
      }
      score += matched * 8;
      if (matched === queryTokens.length) score += 20;

      return { shot, index, score, matched };
    })
    .filter((row) => row.score > 0)
    .sort((left, right) =>
      right.score - left.score || left.index - right.index,
    );
}

export async function resolveCreativeChatShotReference({
  organization_id,
  creative_project_id,
  shot_id = null,
  shot_reference = null,
  anchor_shot_id = null,
} = {}) {
  if (!organization_id) throw new Error("organization_id required");
  if (!creative_project_id) throw new Error("creative_project_id required");

  const shots = await ShotRuntime.list({ organization_id, creative_project_id });
  if (!shots.length) {
    const error = new Error("CREATIVE_CHAT_SHOT_REFERENCE_NO_SHOTS");
    error.status = 404;
    throw error;
  }

  const exactShotId = text(shot_id, 180);
  if (exactShotId) {
    const index = shots.findIndex((shot) => text(shot.id, 180) === exactShotId);
    if (index < 0) {
      const error = new Error("CREATIVE_CHAT_SHOT_REFERENCE_EXACT_ID_NOT_FOUND");
      error.status = 404;
      throw error;
    }
    return {
      contract: CREATIVE_CHAT_SHOT_REFERENCE_CONTRACT,
      resolution: "EXACT_ID",
      reference: exactShotId,
      anchor_shot_id: text(anchor_shot_id, 180) || null,
      shot: shots[index],
      summary: shotSummary(shots[index], index),
    };
  }

  const reference = text(shot_reference, 1200);
  if (!reference) {
    const error = new Error("CREATIVE_CHAT_SHOT_REFERENCE_REQUIRED");
    error.status = 400;
    throw error;
  }

  const relative = resolveRelative(shots, reference, anchor_shot_id);
  if (relative) {
    const index = shots.findIndex((shot) => shot.id === relative.id);
    return {
      contract: CREATIVE_CHAT_SHOT_REFERENCE_CONTRACT,
      resolution: CURRENT_REFERENCES.has(normalized(reference))
        ? "ACTIVE_SHOT"
        : PREVIOUS_REFERENCES.has(normalized(reference))
          ? "PREVIOUS_SHOT"
          : "NEXT_SHOT",
      reference,
      anchor_shot_id: text(anchor_shot_id, 180) || null,
      shot: relative,
      summary: shotSummary(relative, index),
    };
  }

  const numeric = shotNumber(reference);
  if (numeric !== null) {
    const byShotNumber = shots
      .map((shot, index) => ({ shot, index }))
      .filter(({ shot }) => Number(shot.shot_number) === numeric);
    if (byShotNumber.length === 1) {
      const match = byShotNumber[0];
      return {
        contract: CREATIVE_CHAT_SHOT_REFERENCE_CONTRACT,
        resolution: "SHOT_NUMBER",
        reference,
        anchor_shot_id: text(anchor_shot_id, 180) || null,
        shot: match.shot,
        summary: shotSummary(match.shot, match.index),
      };
    }
    if (byShotNumber.length > 1) {
      const ordinal = shots[numeric - 1] || null;
      if (ordinal && Number(ordinal.shot_number) !== numeric) {
        return {
          contract: CREATIVE_CHAT_SHOT_REFERENCE_CONTRACT,
          resolution: "PROJECT_ORDINAL",
          reference,
          anchor_shot_id: text(anchor_shot_id, 180) || null,
          shot: ordinal,
          summary: shotSummary(ordinal, numeric - 1),
        };
      }
      throw candidateError(
        "CREATIVE_CHAT_SHOT_REFERENCE_NUMBER_AMBIGUOUS",
        reference,
        byShotNumber.map(({ shot, index }) => shotSummary(shot, index)),
        {
          resolution:
            "Use the shot title, scene context, or inspect the candidate list before revising.",
        },
      );
    }

    const ordinal = shots[numeric - 1] || null;
    if (ordinal) {
      return {
        contract: CREATIVE_CHAT_SHOT_REFERENCE_CONTRACT,
        resolution: "PROJECT_ORDINAL",
        reference,
        anchor_shot_id: text(anchor_shot_id, 180) || null,
        shot: ordinal,
        summary: shotSummary(ordinal, numeric - 1),
      };
    }
  }

  const candidates = lexicalCandidates(shots, reference);
  if (!candidates.length) {
    throw candidateError(
      "CREATIVE_CHAT_SHOT_REFERENCE_NOT_FOUND",
      reference,
      shots.slice(0, 8).map((shot, index) => shotSummary(shot, index)),
      {
        resolution:
          "Inspect direction to see the canonical shot list, then refer to a shot number, title, or exact visual description.",
      },
    );
  }

  const best = candidates[0];
  const second = candidates[1] || null;
  const clearlyBest =
    best.score >= 36 &&
    (!second || best.score - second.score >= 12 || best.score >= second.score * 1.35);
  if (!clearlyBest) {
    throw candidateError(
      "CREATIVE_CHAT_SHOT_REFERENCE_AMBIGUOUS",
      reference,
      candidates.slice(0, 8).map(({ shot, index }) => shotSummary(shot, index)),
      {
        resolution:
          "Choose one candidate explicitly; Chat must not guess which shot you meant.",
      },
    );
  }

  return {
    contract: CREATIVE_CHAT_SHOT_REFERENCE_CONTRACT,
    resolution: "SEMANTIC_MATCH",
    reference,
    anchor_shot_id: text(anchor_shot_id, 180) || null,
    shot: best.shot,
    summary: shotSummary(best.shot, best.index),
  };
}

export const CreativeChatShotReferenceRuntime = Object.freeze({
  contract: CREATIVE_CHAT_SHOT_REFERENCE_CONTRACT,
  resolve: resolveCreativeChatShotReference,
});

export default CreativeChatShotReferenceRuntime;
