import { requirePlatformOperatorWorkspaceAccess } from "@/lib/platform/security/requirePlatformOperatorWorkspaceAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const LEARNING_SCOPES = [
  "platform_learning_runs",
  "platform_learning_agenda",
  "platform_training_candidates",
  "platform_training_examples",
  "platform_model_benchmark_runs",
  "platform_model_benchmark_suites",
  "platform_model_training_jobs",
  "platform_training_datasets",
];

function text(value) {
  return String(value ?? "").trim();
}

function metadataOf(row) {
  return row?.metadata && typeof row.metadata === "object" ? row.metadata : {};
}

function statusOf(row) {
  return text(metadataOf(row).status).toUpperCase() || "UNKNOWN";
}

function latestFor(rows, scope) {
  return rows.find((row) => row.memory_scope === scope) || null;
}

function countFor(rows, scope) {
  return rows.filter((row) => row.memory_scope === scope).length;
}

function compactError(row) {
  const metadata = metadataOf(row);
  const raw = text(metadata.error || row?.content);
  if (!raw) return "Learning run did not persist a failure reason.";
  return raw.length > 240 ? `${raw.slice(0, 237)}...` : raw;
}

function explicitPromotionObserved(metadata) {
  const effect = text(metadata?.production_model_promotion_effect).toUpperCase();
  return metadata?.production_model_promoted === true || (effect && effect !== "NONE");
}

function explicitImprovementObserved(metadata) {
  return metadata?.verified_improvement === true
    || metadata?.candidate_outperformed_baseline === true
    || metadata?.candidate_better_than_baseline === true
    || text(metadata?.decision).toUpperCase() === "PROMOTE";
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = text(
      url.searchParams.get("organization_id") || url.searchParams.get("organizationId"),
    );

    const access = await requirePlatformOperatorWorkspaceAccess({ organizationId });
    if (!access.success) {
      return Response.json(
        { success: false, error: access.error },
        { status: access.status },
      );
    }

    const { data, error } = await supabaseAdmin
      .from("intelligence_memories")
      .select(
        "id,memory_scope,memory_key,memory_type,subject,content,confidence,source,active,created_at,updated_at,metadata",
      )
      .eq("organization_id", access.organizationId)
      .in("memory_scope", LEARNING_SCOPES)
      .order("created_at", { ascending: false })
      .limit(250);

    if (error) throw error;

    const rows = Array.isArray(data) ? data : [];
    const latestTraining = latestFor(rows, "platform_model_training_jobs");
    const latestBenchmark = latestFor(rows, "platform_model_benchmark_runs");
    const latestDataset = latestFor(rows, "platform_training_datasets");
    const latestSuite = latestFor(rows, "platform_model_benchmark_suites");

    const trainingMetadata = metadataOf(latestTraining);
    const benchmarkMetadata = metadataOf(latestBenchmark);
    const datasetMetadata = metadataOf(latestDataset);
    const suiteMetadata = metadataOf(latestSuite);
    const trainingMetrics = trainingMetadata.training_metrics || {};
    const readiness = benchmarkMetadata.benchmark_readiness || {};

    const baselineCompleted = benchmarkMetadata.baseline_completed === true;
    const candidateCompleted = benchmarkMetadata.candidate_completed === true;
    const benchmarkStatus = statusOf(latestBenchmark);
    const benchmarkExecutionVerified = baselineCompleted
      && candidateCompleted
      && ["BENCHMARK_COMPLETED", "BENCHMARK_SUCCESS", "SUCCESS", "COMPLETED"].includes(benchmarkStatus);
    const verifiedImprovement = benchmarkExecutionVerified
      && explicitImprovementObserved(benchmarkMetadata);
    const productionPromotionObserved = explicitPromotionObserved(benchmarkMetadata)
      || explicitPromotionObserved(trainingMetadata)
      || explicitPromotionObserved(datasetMetadata)
      || explicitPromotionObserved(suiteMetadata);

    const blockers = rows
      .filter((row) => row.memory_scope === "platform_learning_runs")
      .filter((row) => row.memory_type === "blocker" || statusOf(row) === "ERROR")
      .map((row) => ({
        id: row.id,
        topic: text(metadataOf(row).topic_key || row.subject) || "learning-topic",
        domain: text(metadataOf(row).knowledge_domain) || null,
        status: statusOf(row),
        error: compactError(row),
        createdAt: row.created_at,
      }));

    const agenda = rows
      .filter((row) => row.memory_scope === "platform_learning_agenda")
      .map((row) => ({
        id: row.id,
        topic: text(metadataOf(row).topic_key || row.subject) || "learning-topic",
        status: statusOf(row),
        createdAt: row.created_at,
      }));

    const latestEvidenceAt = rows.reduce((latest, row) => {
      const timestamp = new Date(row.created_at || 0).getTime();
      return timestamp > latest ? timestamp : latest;
    }, 0);

    return Response.json({
      success: true,
      operatorOrganizationId: access.organizationId,
      source: "AVANTIQO_PLATFORM_INTELLIGENCE_MEMORIES",
      summary: {
        evidenceRecords: rows.length,
        agendaTopics: countFor(rows, "platform_learning_agenda"),
        blockedLearningRuns: blockers.length,
        trainingCandidates: countFor(rows, "platform_training_candidates"),
        compiledTrainingExamples: countFor(rows, "platform_training_examples"),
        trainingJobs: countFor(rows, "platform_model_training_jobs"),
        benchmarkRuns: countFor(rows, "platform_model_benchmark_runs"),
        benchmarkSuites: countFor(rows, "platform_model_benchmark_suites"),
        trainingDatasets: countFor(rows, "platform_training_datasets"),
        latestEvidenceAt: latestEvidenceAt ? new Date(latestEvidenceAt).toISOString() : null,
        verifiedImprovement,
        productionPromotionObserved,
      },
      model: {
        trainingStatus: statusOf(latestTraining),
        benchmarkStatus,
        benchmarkExecutionVerified,
        verifiedImprovement,
        productionPromotionObserved,
        productionPromotionEffect:
          text(
            benchmarkMetadata.production_model_promotion_effect
              || trainingMetadata.production_model_promotion_effect
              || datasetMetadata.production_model_promotion_effect
              || suiteMetadata.production_model_promotion_effect,
          ) || "NONE",
        foundationModel:
          text(trainingMetadata.foundation_model || trainingMetadata.recipe?.foundation_model || datasetMetadata.foundation_model) || null,
        trainingMethod:
          text(trainingMetadata.training_method || trainingMetadata.recipe?.method) || null,
        trainExampleCount:
          Number(trainingMetrics.train_example_count ?? readiness.example_count ?? 0) || 0,
        holdoutExampleCount:
          Number(trainingMetrics.holdout_example_count ?? 0) || 0,
        benchmarkCaseCount:
          Number(readiness.case_count ?? suiteMetadata.case_count ?? 0) || 0,
        holdoutLoss: Number.isFinite(Number(trainingMetrics.holdout_loss))
          ? Number(trainingMetrics.holdout_loss)
          : null,
        holdoutPerplexity: Number.isFinite(Number(trainingMetrics.holdout_perplexity))
          ? Number(trainingMetrics.holdout_perplexity)
          : null,
        gpuDevice: text(trainingMetrics.gpu_device_name) || null,
        latestTrainingAt: latestTraining?.created_at || null,
        latestBenchmarkAt: latestBenchmark?.created_at || null,
        benchmarkRecoveryReason: text(benchmarkMetadata.recovery_reason) || null,
        baselineCompleted,
        candidateCompleted,
      },
      governance: {
        memoryGrantsAuthorization: false,
        automaticModelPromotion: false,
        explicitProductionPromotionRequired:
          trainingMetadata.requires_explicit_production_promotion !== false,
        customerPrivateContentIncluded:
          datasetMetadata.privacy?.customer_private_content_included === true
          || suiteMetadata.customer_private_content_included === true,
        rawReasoningIncluded:
          datasetMetadata.privacy?.raw_reasoning_included === true
          || suiteMetadata.raw_reasoning_required === true,
      },
      blockers,
      agenda,
    });
  } catch (error) {
    console.error("PLATFORM_INTELLIGENCE_PROGRESS_GET_ERROR", error);
    return Response.json(
      {
        success: false,
        error: error?.message || "Unable to read platform intelligence progress",
      },
      { status: 500 },
    );
  }
}
