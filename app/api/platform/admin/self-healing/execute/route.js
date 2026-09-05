import { requirePlatformAdminAccess } from "@/lib/platform/security/requirePlatformAdminAccess";
import { POST as prepareSelfHealingMission } from "@/app/api/platform/admin/self-healing/route";
import {
  executePlatformSelfHealingCodeMission,
  PLATFORM_SELF_HEALING_CODE_EXECUTION_CONTRACT,
} from "@/lib/platform/self-healing/PlatformSelfHealingCodeExecutionRuntime";

export const runtime = "nodejs";
export const maxDuration = 300;

function text(value, limit = 1000) {
  return String(value ?? "").trim().slice(0, limit);
}

function safeError(error) {
  return text(error?.message || error || "PLATFORM_SELF_HEALING_EXECUTION_FAILED", 800);
}

export async function POST(request) {
  const access = await requirePlatformAdminAccess();
  if (!access.success) {
    return Response.json({ success: false, error: access.error }, { status: access.status });
  }

  const preparationResponse = await prepareSelfHealingMission(request.clone());
  const prepared = await preparationResponse.json().catch(() => null);

  if (!preparationResponse.ok || !prepared?.success) {
    return Response.json({
      success: false,
      contract: PLATFORM_SELF_HEALING_CODE_EXECUTION_CONTRACT,
      status: "PREPARATION_FAILED",
      preparation_status: preparationResponse.status,
      error: prepared?.error || "SELF_HEALING_PREPARATION_FAILED",
      code_execution_started: false,
      commit_performed: false,
      production_deploy_performed: false,
      fixed: false,
    }, { status: preparationResponse.status >= 400 ? preparationResponse.status : 409 });
  }

  if (prepared.status !== "RESEARCHED_CODE_MISSION_READY") {
    return Response.json({
      success: true,
      contract: PLATFORM_SELF_HEALING_CODE_EXECUTION_CONTRACT,
      status: "CODE_EXECUTION_NOT_APPLICABLE",
      preparation: prepared,
      code_execution_started: false,
      commit_performed: false,
      production_deploy_performed: false,
      fixed: false,
    });
  }

  try {
    const result = await executePlatformSelfHealingCodeMission({
      context: {
        organizationId: prepared.organizationId,
        organization_id: prepared.organizationId,
        partyId: access.staff?.party_id || null,
        actor: { id: access.user?.id || null },
        metadata: {
          partyId: access.staff?.party_id || null,
          platform_self_healing: true,
          platform_self_healing_execution: true,
          platform_operator_signal_key: prepared.signalKey || null,
        },
      },
      prepared,
    });

    return Response.json({
      ...result,
      signalKey: prepared.signalKey || null,
      authoritative_source_resolved: prepared.authoritative_source_resolved === true,
      browser_evidence_authoritative: false,
      commit_performed: false,
      production_deploy_performed: false,
    });
  } catch (error) {
    console.error("PLATFORM_SELF_HEALING_CODE_EXECUTION_FAILED", {
      signal_key: prepared.signalKey || null,
      error: safeError(error),
      commit_performed: false,
      production_deploy_performed: false,
    });
    return Response.json({
      success: false,
      contract: PLATFORM_SELF_HEALING_CODE_EXECUTION_CONTRACT,
      status: "CODE_EXECUTION_FAILED",
      error: safeError(error),
      code_execution_started: true,
      commit_performed: false,
      production_deploy_performed: false,
      fixed: false,
    }, { status: 500 });
  }
}
