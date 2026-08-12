import * as AssetGraphRepository from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import { CREATIVE_ASSET_NODE_TYPES } from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import { ProductionTaskRuntime } from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";

const CONTRACT = "CREATIVE_SHOT_CANDIDATE_SELECTION_V1";
const WORLD_CLASS_FLOOR = 94;

function text(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function candidateScore(node = {}) {
  return {
    weakest: finite(node.metadata?.shot_candidate_weakest_score, 0),
    overall: finite(node.metadata?.shot_candidate_review_score, 0),
    provider: text(node.lineage?.provider_id) || null,
  };
}

function eligible(node = {}) {
  const score = candidateScore(node);
  return node.type === CREATIVE_ASSET_NODE_TYPES.VIDEO &&
    node.metadata?.shot_candidate_review_passed === true &&
    score.weakest >= WORLD_CLASS_FLOOR &&
    score.overall >= WORLD_CLASS_FLOOR;
}

function compare(left, right) {
  const a = candidateScore(left);
  const b = candidateScore(right);
  if (a.weakest !== b.weakest) return b.weakest - a.weakest;
  if (a.overall !== b.overall) return b.overall - a.overall;
  const aTime = Date.parse(left.created_at || "") || 0;
  const bTime = Date.parse(right.created_at || "") || 0;
  if (aTime !== bTime) return aTime - bTime;
  return text(left.id).localeCompare(text(right.id));
}

function shotId(node = {}) {
  return text(node.metadata?.shot_id) || null;
}

export const CreativeShotCandidateSelectionRuntime = {
  contract: CONTRACT,
  world_class_floor: WORLD_CLASS_FLOOR,

  async select({ organization_id, creative_project_id, shot_id } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!creative_project_id) throw new Error("creative_project_id required");
    if (!shot_id) throw new Error("shot_id required");

    const nodes = await AssetGraphRepository.listByProject({
      organization_id,
      creative_project_id,
    });
    const candidates = nodes
      .filter((node) =>
        node.type === CREATIVE_ASSET_NODE_TYPES.VIDEO &&
        shotId(node) === text(shot_id) &&
        Boolean(node.metadata?.shot_candidate_review_report_id),
      )
      .sort(compare);
    const qualified = candidates.filter(eligible);

    if (!qualified.length) {
      return {
        contract: CONTRACT,
        status: "BLOCKED",
        shot_id,
        world_class_floor: WORLD_CLASS_FLOOR,
        winner: null,
        candidate_count: candidates.length,
        candidates: candidates.map((node) => ({
          asset_node_id: node.id,
          passed: node.metadata?.shot_candidate_review_passed === true,
          ...candidateScore(node),
          failed_checks: node.metadata?.shot_candidate_failed_checks || [],
          repair_instructions:
            node.metadata?.shot_candidate_repair_instructions || [],
        })),
        reason: candidates.length
          ? "NO_WORLD_CLASS_CANDIDATE"
          : "NO_REVIEWED_CANDIDATES",
      };
    }

    const winner = qualified[0];
    for (const candidate of candidates) {
      const selected = candidate.id === winner.id;
      await AssetGraphRepository.update(candidate.id, {
        metadata: {
          ...(candidate.metadata || {}),
          shot_candidate_selection_contract: CONTRACT,
          shot_candidate_selected: selected,
          selected_for_master: selected,
          include_in_master: selected,
          selection_weakest_score: candidateScore(candidate).weakest,
          selection_overall_score: candidateScore(candidate).overall,
          selected_at: selected ? new Date().toISOString() : null,
        },
      });
    }

    const taskId = text(winner.production_task_id || winner.metadata?.production_task_id);
    if (taskId) {
      const task = await ProductionTaskRuntime.get(taskId);
      if (task && text(task.organization_id) === text(organization_id)) {
        await ProductionTaskRuntime.update(task.id, {
          metadata: {
            ...(task.metadata || {}),
            shot_candidate_selection_contract: CONTRACT,
            selected_candidate_asset_node_id: winner.id,
            selected_candidate_weakest_score: candidateScore(winner).weakest,
            selected_candidate_overall_score: candidateScore(winner).overall,
            selected_for_master: true,
          },
        });
      }
    }

    return {
      contract: CONTRACT,
      status: "SELECTED",
      shot_id,
      world_class_floor: WORLD_CLASS_FLOOR,
      candidate_count: candidates.length,
      qualified_candidate_count: qualified.length,
      winner: {
        asset_node_id: winner.id,
        production_task_id: taskId || null,
        ...candidateScore(winner),
      },
      alternatives: qualified.slice(1).map((node) => ({
        asset_node_id: node.id,
        ...candidateScore(node),
      })),
    };
  },
};
