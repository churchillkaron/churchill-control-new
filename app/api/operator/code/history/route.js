import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import {
  listCodeAIMissionHistory,
  loadCodeAIMissionHistoryDetail,
  CODE_AI_MISSION_HISTORY_CONTRACT,
} from "@/lib/code/runtime/CodeAIMissionHistoryRuntime";
import {
  loadLatestCodeAICompetitiveBenchmarkEvidence,
} from "@/lib/code/runtime/CodeAICompetitiveBenchmarkEvidenceRuntime";

export const runtime = "nodejs";

const REQUIRED_PERMISSION = "platform.code.ai.execute";

function text(value, maximum = 4000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function truthy(value) {
  return ["1", "true", "yes", "on"].includes(text(value, 20).toLowerCase());
}


function publicHistoryIntegrityReason(value) {
  const reason = text(value, 160).toUpperCase();
  if (!reason) return null;
  if (reason === "LEGACY_UNSEALED_HISTORY") return "LEGACY_UNSEALED";
  if (reason.includes("SECRET_UNAVAILABLE") || reason.includes("KEY_UNKNOWN") || reason.includes("KEYRING")) {
    return "ATTESTATION_UNAVAILABLE";
  }
  if (reason.includes("HISTORY_HEAD")) return "HISTORY_HEAD_INVALID";
  if (reason.includes("ROW_") || reason.includes("MEMORY_KEY") || reason.includes("REPLAY")) {
    return "HISTORY_RECORD_INVALID";
  }
  return "HISTORY_INTEGRITY_INVALID";
}

function contextFor(access, organizationId) {
  return {
    organizationId,
    organization_id: organizationId,
    actor: { id: text(access.user?.id || access.userId, 200) },
  };
}


async function loadCompetitiveEvidence() {
  try {
    const loaded = await loadLatestCodeAICompetitiveBenchmarkEvidence();
    if (loaded?.found !== true || !loaded?.evidence) return null;
    return {
      ...loaded.evidence,
      history_integrity: {
        valid: loaded?.history_integrity?.valid === true,
        legacy_unsealed: loaded?.history_integrity?.legacy_unsealed === true,
        quarantined: loaded?.evidence?.history_integrity_valid === false,
        reason: publicHistoryIntegrityReason(loaded?.history_integrity?.reason),
        history_head_valid: loaded?.history_integrity?.history_head_valid === true,
      },
    };
  } catch (error) {
    console.error(JSON.stringify({
      event: "AVANTIQO_CODE_HISTORY_COMPETITIVE_EVIDENCE_LOAD_FAILED",
      reason: text(error?.message || error, 500),
      history_load_blocked: false,
      authorization_effect: "NONE",
    }));
    return null;
  }
}

function response(payload = {}, status = 200) {
  return Response.json({
    contract: CODE_AI_MISSION_HISTORY_CONTRACT,
    actor_scoped: true,
    organization_scoped: true,
    raw_reasoning_returned: false,
    raw_resume_state_returned: false,
    authorization_effect: "NONE",
    commit_authority: false,
    production_deploy_authority: false,
    ...payload,
  }, { status });
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = text(
      url.searchParams.get("organizationId") || url.searchParams.get("organization_id"),
      200,
    );
    const missionId = text(
      url.searchParams.get("missionId") || url.searchParams.get("mission_id"),
      240,
    );
    const query = text(url.searchParams.get("q") || url.searchParams.get("query"), 2000);
    const file = text(url.searchParams.get("file"), 1000);
    const repositoryUrl = text(
      url.searchParams.get("repositoryUrl") || url.searchParams.get("repository_url"),
      1000,
    );
    const ref = text(url.searchParams.get("ref"), 160);
    const verifiedOnly = truthy(
      url.searchParams.get("verifiedOnly") || url.searchParams.get("verified_only"),
    );
    const limit = Number(url.searchParams.get("limit") || 20);
    if (!organizationId) {
      return response({ success: false, error: "organization_id required" }, 400);
    }

    const access = await requireOrganizationAccess({
      organizationId,
      request,
      requiredPermission: REQUIRED_PERMISSION,
    });
    if (!access.success) {
      return response({ success: false, error: access.error }, access.status || 403);
    }

    const context = contextFor(access, organizationId);
    if (missionId) {
      const detail = await loadCodeAIMissionHistoryDetail({ context, missionId });
      return response({ success: true, ...detail });
    }

    const [history, competitiveEvidence] = await Promise.all([
      listCodeAIMissionHistory({
        context,
        limit,
        query: query || null,
        file: file || null,
        verifiedOnly,
        repositoryUrl: repositoryUrl || null,
        ref: ref || null,
      }),
      loadCompetitiveEvidence(),
    ]);
    return response({
      success: true,
      sessions: history.sessions,
      count: history.count,
      search: history.search,
      performance: history.performance || null,
      performance_trend: history.performance_trend || null,
      improvement_backlog: history.improvement_backlog || null,
      competitive_evidence: competitiveEvidence,
    });
  } catch (error) {
    return response({
      success: false,
      error: text(error?.message || error, 700) || "CODE_AI_MISSION_HISTORY_LOAD_FAILED",
    }, 500);
  }
}
