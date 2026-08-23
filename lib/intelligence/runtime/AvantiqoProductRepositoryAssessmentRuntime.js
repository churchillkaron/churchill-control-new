import {
  CodeWorkspaceSandboxRuntime,
} from "@/lib/code/runtime/CodeWorkspaceSandboxRuntime";
import {
  AvantiqoStructuredIntelligenceSupervisorRuntime,
} from "@/lib/intelligence/runtime/AvantiqoStructuredIntelligenceSupervisorRuntime";
import {
  AVANTIQO_PRODUCT_CONSTITUTION,
} from "@/lib/intelligence/runtime/AvantiqoProductConstitution";

export const AVANTIQO_PRODUCT_REPOSITORY_ASSESSMENT_CONTRACT =
  "AVANTIQO_PRODUCT_REPOSITORY_ASSESSMENT_V1";

const DEFAULT_REPOSITORY =
  "https://github.com/churchillkaron/churchill-control-new.git";
const DEFAULT_REF = "main";
const EVIDENCE_FILES = [
  ["AGENTS.md", 1, 420],
  ["package.json", 1, 180],
  ["lib/platform/runtime/PlatformDomainRuntime.js", 1, 420],
  ["lib/intelligence/runtime/AvantiqoProductConstitution.js", 1, 520],
  ["lib/intelligence/runtime/AvantiqoProductAutonomyAssessmentRuntime.js", 1, 420],
  ["scripts/operator-intelligence-autonomy-v2-audit.mjs", 1, 520],
];

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

async function readEvidenceFile(workspace, [filePath, startLine, endLine]) {
  try {
    const result = await workspace.read({
      file_path: filePath,
      start_line: startLine,
      end_line: endLine,
    });
    return {
      file_path: filePath,
      found: true,
      start_line: result.start_line,
      end_line: result.end_line,
      total_lines: result.total_lines,
      content: text(result.content, 30000),
    };
  } catch (error) {
    return {
      file_path: filePath,
      found: false,
      error: text(error?.message, 500) || "REPOSITORY_EVIDENCE_READ_FAILED",
    };
  }
}

async function searchEvidence(workspace, query, paths = []) {
  try {
    const result = await workspace.search({ query, paths });
    return {
      query,
      match_count: Number(result.match_count || 0),
      truncated: result.truncated === true,
      matches: list(result.matches).slice(0, 80),
    };
  } catch (error) {
    return {
      query,
      match_count: 0,
      truncated: false,
      matches: [],
      error: text(error?.message, 500) || "REPOSITORY_EVIDENCE_SEARCH_FAILED",
    };
  }
}

function assessmentSystem() {
  return [
    "You are Avantiqo's owned Product Owner and Architecture Intelligence assessing ACTUAL checked-out GitHub main source evidence.",
    "The repository evidence comes from a fresh read-only Code AI workspace clone. The reported current_main_head is repository evidence; do not replace it with assumptions from the running application process.",
    "Assess only what the bounded evidence proves. This is still not a full repository certification: files not supplied may contain additional implementation or constraints.",
    "Use the permanent Product Constitution as authority and repository evidence as current implementation evidence.",
    "Choose exactly one next bounded engineering objective with the highest leverage for Avantiqo autonomy. The objective must instruct Code AI to inspect the newest main itself before editing, preserve concurrent changes, verify locally, repair failures, and stop only on evidence-based completion.",
    "If the supplied verified_commit_sha differs from current_main_head, treat that as normal concurrent progress. Base the next objective on current_main_head and explicitly note that main advanced after the verified commit.",
    "Never authorize a commit, deployment, migration, publication, secret access, force push, destructive operation, or recursive autonomous loop.",
    "Return exactly one JSON object with keys: status, executive_summary, repository_observations, gaps, engineering_objective, completion_criteria, evidence_limits.",
  ].join("\n");
}

export async function assessAvantiqoCurrentRepository({
  context = {},
  repositoryUrl = DEFAULT_REPOSITORY,
  ref = DEFAULT_REF,
  verifiedCommitSha = null,
  focus = null,
  timeoutMs = null,
} = {}) {
  const organizationId = text(context.organizationId || context.organization_id, 160);
  if (!organizationId) {
    throw new Error("PRODUCT_REPOSITORY_ASSESSMENT_ORGANIZATION_REQUIRED");
  }

  const workspace = await CodeWorkspaceSandboxRuntime.open({
    repository_url: text(repositoryUrl, 500) || DEFAULT_REPOSITORY,
    ref: text(ref, 160) || DEFAULT_REF,
    ...(timeoutMs ? { timeout_ms: timeoutMs } : {}),
  });

  try {
    const repository = await workspace.inspect();
    if (!repository.clean) {
      throw new Error("PRODUCT_REPOSITORY_ASSESSMENT_WORKSPACE_NOT_CLEAN");
    }
    const files = await Promise.all(
      EVIDENCE_FILES.map((entry) => readEvidenceFile(workspace, entry)),
    );
    const searches = await Promise.all([
      searchEvidence(workspace, "platform.product_engineering_cycle.execute", ["lib", "scripts"]),
      searchEvidence(workspace, "platform.product_persistence_handoff.execute", ["lib", "scripts"]),
      searchEvidence(workspace, "TODO", ["lib/intelligence", "lib/operator", "lib/platform"]),
      searchEvidence(workspace, "FIXME", ["lib/intelligence", "lib/operator", "lib/platform"]),
    ]);

    const currentHead = text(repository.head_sha, 160);
    if (!currentHead) {
      throw new Error("PRODUCT_REPOSITORY_ASSESSMENT_HEAD_REQUIRED");
    }
    const verified = text(verifiedCommitSha, 160) || null;
    const snapshot = {
      generated_at: new Date().toISOString(),
      repository_url: text(repositoryUrl, 500) || DEFAULT_REPOSITORY,
      ref: text(ref, 160) || DEFAULT_REF,
      current_main_head: currentHead,
      verified_commit_sha: verified,
      verified_commit_is_current_head: verified ? verified === currentHead : null,
      main_advanced_after_verified_commit: verified ? verified !== currentHead : null,
      clean_checkout: repository.clean === true,
      package_manager: repository.package_manager || null,
      tracked_file_count: Number(repository.tracked_file_count || 0),
      tracked_files_sample: list(repository.tracked_files_sample).slice(0, 200),
      evidence_files: files,
      evidence_searches: searches,
      requested_focus: text(focus, 2000) || null,
      bounded_repository_evidence: true,
      full_repository_certification: false,
    };

    const result = await AvantiqoStructuredIntelligenceSupervisorRuntime.run({
      organization_id: organizationId,
      party_id: text(context?.metadata?.partyId || context.partyId, 160) || null,
      entity_id: text(context.entityId || context.entity_id, 160) || null,
      system: assessmentSystem(),
      messages: [{
        role: "user",
        content: JSON.stringify({
          contract: AVANTIQO_PRODUCT_REPOSITORY_ASSESSMENT_CONTRACT,
          constitution: AVANTIQO_PRODUCT_CONSTITUTION,
          repository_snapshot: snapshot,
        }),
      }],
      tools: [],
      authorization: { allow_mutating_tools: false },
      metadata: {
        module: "INTELLIGENCE",
        operation: "PRODUCT_REPOSITORY_ASSESSMENT",
        product_repository_assessment_contract:
          AVANTIQO_PRODUCT_REPOSITORY_ASSESSMENT_CONTRACT,
        repository_head: currentHead,
        assessment_only: true,
        repository_evidence_read_only: true,
        raw_reasoning_persisted: false,
      },
      mode: "deep",
      critique_instructions: [
        "Reject claims about files or behavior absent from supplied repository evidence.",
        "Make the engineering objective bounded and require Code AI to inspect current main again before edits because main may move after this assessment.",
        "Do not mistake this bounded source snapshot for build, test, end-to-end, provider, deployment or certification evidence.",
        "Do not authorize persistence or recursive execution.",
      ].join(" "),
      max_output_tokens: 1800,
    });

    return {
      contract: AVANTIQO_PRODUCT_REPOSITORY_ASSESSMENT_CONTRACT,
      status: "REPOSITORY_ASSESSMENT_ONLY_NOT_CERTIFICATION",
      repository_snapshot: snapshot,
      assessment: object(result.parsed),
      next_engineering_handoff: {
        capability_key: "platform.product_engineering_cycle.execute",
        focus: text(result.parsed?.engineering_objective, 4000) || null,
        repository_url: snapshot.repository_url,
        ref: snapshot.ref,
        repository_head_observed: currentHead,
        automatic_execution_started: false,
        authorization_effect: "NONE",
      },
      evidence_limits: [
        "Repository checkout evidence is not build evidence.",
        "Repository checkout evidence is not end-to-end evidence.",
        "The bounded evidence set is not a complete source-code certification.",
        "Main may advance again after this assessment; Code AI must refetch and re-inspect before edits.",
        "This read-only assessment does not authorize commit, deployment or migration execution.",
      ],
    };
  } finally {
    await workspace.stop();
  }
}

export default assessAvantiqoCurrentRepository;
