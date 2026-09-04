import { ShotRuntime } from "@/lib/creative/shots/runtime/ShotRuntime";
import {
  CreativeProfessionalDirectionAuthorityRuntime,
} from "@/lib/creative/continuity/runtime/CreativeProfessionalDirectionAuthorityRuntime";
import {
  CreativeShotSurgicalRevisionRuntime,
} from "@/lib/creative/revisions/runtime/CreativeShotSurgicalRevisionRuntime";

export const CREATIVE_CHAT_SHOT_REVISION_CONTRACT =
  "AVANTIQO_CHAT_SHOT_REVISION_V1";

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

function lockedRoot(path = "") {
  return text(path, 500).split(".")[0] || "";
}

function lockConflicts(shot = {}, scope = []) {
  const roots = new Set(scope.filter((item) => item !== "edit"));
  if (scope.includes("edit")) {
    for (const root of EDIT_ROOTS) roots.add(root);
  }
  return CreativeProfessionalDirectionAuthorityRuntime.lockedFields(shot)
    .filter((path) => roots.has(lockedRoot(path)));
}

export const CreativeChatShotRevisionRuntime = Object.freeze({
  contract: CREATIVE_CHAT_SHOT_REVISION_CONTRACT,

  async revise({
    organization_id,
    creative_project_id,
    shot_id,
    instruction,
    revision_scope,
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!creative_project_id) throw new Error("creative_project_id required");
    if (!shot_id) throw new Error("shot_id required");
    if (!text(instruction, 1600)) throw new Error("revision instruction required");

    const scope = normalizeScope(revision_scope);
    if (!scope.length) throw new Error("CREATIVE_CHAT_REVISION_SCOPE_REQUIRED");

    const shots = await ShotRuntime.list({
      organization_id,
      creative_project_id,
    });
    const target = shots.find((shot) => text(shot.id, 180) === text(shot_id, 180));
    if (!target) throw new Error("CREATIVE_CHAT_REVISION_SHOT_NOT_FOUND");

    const conflicts = lockConflicts(target, scope);
    if (conflicts.length) {
      const error = new Error(
        `CREATIVE_CHAT_REVISION_PROFESSIONAL_LOCKED:${conflicts.slice(0, 12).join(",")}`,
      );
      error.status = 409;
      error.details = {
        contract: CREATIVE_CHAT_SHOT_REVISION_CONTRACT,
        creative_project_id,
        shot_id,
        requested_scope: scope,
        locked_fields: conflicts,
        resolution:
          "Release the relevant human-authority lock in Pro Studio before AI Chat may revise that craft decision.",
      };
      throw error;
    }

    const revised = await CreativeShotSurgicalRevisionRuntime.revise({
      organization_id,
      creative_project_id,
      shot_id,
      instruction: text(instruction, 1600),
      revision_scope: scope,
    });

    return {
      ...revised,
      contract: CREATIVE_CHAT_SHOT_REVISION_CONTRACT,
      underlying_revision_contract: revised.contract,
      source: "OPERATOR_CHAT",
      professional_locks_preserved: true,
      professional_locked_fields: CreativeProfessionalDirectionAuthorityRuntime.lockedFields(target),
      media_generation_executed: false,
      publish_authorized: false,
    };
  },
});

export default CreativeChatShotRevisionRuntime;
