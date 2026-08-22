import {
  listActiveProduction,
} from "@/lib/creative/state/CreativeStateRepository";
import {
  CreativePartnerMissionRuntime,
} from "@/lib/creative/partner/runtime/CreativePartnerMissionRuntime";

const CONTRACT = "AVANTIQO_CREATIVE_PARTNER_SCHEDULER_V1";

function text(value) {
  return String(value ?? "").trim();
}

export const CreativePartnerSchedulerRuntime = Object.freeze({
  contract: CONTRACT,

  async process({ limit = 4 } = {}) {
    const boundedLimit = Math.max(1, Math.min(12, Number(limit || 4)));
    const states = await listActiveProduction({ limit: boundedLimit });
    const results = [];

    for (const state of states) {
      const organizationId = text(state.organization_id);
      const missionId = text(state.creative_mission_id);
      const projectId = text(state.creative_project_id);

      if (!organizationId || !missionId || !projectId) {
        results.push({
          creative_mission_id: missionId || null,
          creative_project_id: projectId || null,
          status: "SKIPPED_INVALID_STATE_SCOPE",
          keep_working: false,
        });
        continue;
      }

      try {
        const result = await CreativePartnerMissionRuntime.advance({
          organization_id: organizationId,
          creative_mission_id: missionId,
          creative_project_id: projectId,
          scheduler_tick: true,
        });
        results.push({
          creative_mission_id: missionId,
          creative_project_id: projectId,
          status: result?.mission?.status || result?.internal_execution_result?.status || "UNKNOWN",
          next_action: result?.mission?.next_action || null,
          keep_working: result?.mission?.keep_working === true,
          human_decision_required:
            result?.mission?.human_decision_required === true,
        });
      } catch (error) {
        results.push({
          creative_mission_id: missionId,
          creative_project_id: projectId,
          status: "PARTNER_TICK_FAILED",
          error_class: text(error?.message).split(":")[0] || "UNKNOWN",
          keep_working: true,
        });
      }
    }

    return {
      contract: CONTRACT,
      scanned: states.length,
      processed: results.length,
      continuing: results.filter((item) => item.keep_working).length,
      waiting_for_human: results.filter((item) => item.human_decision_required).length,
      results,
      provider_selection_exposed: false,
      raw_reasoning_persisted: false,
    };
  },
});

export default CreativePartnerSchedulerRuntime;
