import { ProductionTaskRuntime } from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import { CreativeAudioFinishingRuntime } from "./CreativeAudioFinishingRuntime";
import { unwrapAudioOutput } from "./AudioFinishingContractRuntime";

function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function text(value) { return String(value ?? "").trim(); }

export function localAudioOperation(task = {}) {
  const capability = text(task.capability || task.service_code);
  if (capability === "creative.audio.finish") return "finish";
  if (capability === "creative.audio.validate") return "validate";
  return null;
}

export function isAudioQualityTask(task = {}) {
  const workflow = text(task.metadata?.workflow_kind).toUpperCase();
  const step = text(task.metadata?.production_step_id).toLowerCase();
  return workflow === "AUDIO" && step !== "release-validation" &&
    (task.metadata?.quality_gate === true || step === "quality" || step === "semantic-review");
}

export async function dispatchAudioTask(task) {
  const operation = localAudioOperation(task);
  if (!operation) return null;
  try {
    const output = operation === "finish"
      ? await CreativeAudioFinishingRuntime.finish(task)
      : await CreativeAudioFinishingRuntime.validate(task);
    return ProductionTaskRuntime.complete(task.id, {
      provider: "avantiqo-local-audio-worker",
      settlement: "LOCAL_EXECUTION",
      output,
    });
  } catch (error) {
    return ProductionTaskRuntime.fail(task.id, error);
  }
}

export async function ensureAudioFinishTask(qualityTask) {
  const tasks = await ProductionTaskRuntime.list({
    organization_id: qualityTask.organization_id,
    creative_project_id: qualityTask.creative_project_id,
  });
  let finish = tasks.find((task) => task.metadata?.audio_finish_for_task_id === qualityTask.id) || null;
  if (!finish) {
    finish = await ProductionTaskRuntime.create({
      organization_id: qualityTask.organization_id,
      creative_project_id: qualityTask.creative_project_id,
      production_graph_id: qualityTask.production_graph_id,
      type: "EXECUTE_CAPABILITY",
      status: "WAITING",
      title: `Finish ${qualityTask.title || "audio deliverable"}`,
      description: "Assemble the generated stems, master loudness, export delivery codecs and create waveform evidence before semantic review.",
      service_id: "creative.audio.finish",
      service_code: "creative.audio.finish",
      capability: "creative.audio.finish",
      priority: Math.max(0, Number(qualityTask.priority || 100) - 1),
      depends_on: list(qualityTask.depends_on),
      input: {
        ...(qualityTask.input || {}),
        output_spec: qualityTask.metadata?.requirements?.output_spec || qualityTask.input?.output_spec || qualityTask.metadata?.output_spec || {},
      },
      cost: { estimated: 0, actual: 0, currency: qualityTask.cost?.currency || null, approved: true },
      timing: { estimated_seconds: 0 },
      review: { required: false, approved: false },
      metadata: {
        ...(qualityTask.metadata || {}),
        execution_node_id: `${qualityTask.metadata?.execution_node_id || qualityTask.id}:audio-finish`,
        execution_step_id: `${qualityTask.metadata?.execution_step_id || qualityTask.id}:audio-finish`,
        production_step_id: "finish",
        production_step_index: Number(qualityTask.metadata?.production_step_index || 1) - 0.5,
        quality_gate: false,
        release_candidate: true,
        audio_finish_for_task_id: qualityTask.id,
      },
    });
  }
  await ProductionTaskRuntime.update(qualityTask.id, {
    depends_on: [finish.id],
    metadata: {
      ...(qualityTask.metadata || {}),
      audio_finish_task_id: finish.id,
      release_candidate: false,
    },
  });
  return finish;
}

export async function bindAudioEvidenceForReview(task) {
  if (task.metadata?.audio_evidence_review_bound) return task;
  const finishId = task.metadata?.audio_finish_task_id;
  if (!finishId) throw new Error("CREATIVE_AUDIO_FINISH_TASK_REQUIRED");
  const finish = await ProductionTaskRuntime.get(finishId);
  if (!finish || finish.status !== "COMPLETED") throw new Error("CREATIVE_AUDIO_FINISH_NOT_COMPLETED");
  const output = unwrapAudioOutput(finish.output);
  if (!output?.master_url || !output?.master_report) throw new Error("CREATIVE_AUDIO_FINISH_EVIDENCE_REQUIRED");
  const prompt = [
    task.input?.prompt || task.input?.provider_prompt || "Review this completed audio master evidence.",
    "Return only JSON with keys: passed, verdict, failed_checks, repair_instructions.",
    "Evaluate timing, intelligibility, performance, artefacts, mix hierarchy, loudness, true peak, delivery codecs, waveform evidence and fitness for the declared audience and channel.",
    "Reject missing stems, clipping, weak speech clarity, abrupt edits, unresolved noise, poor balance, or delivery evidence that does not satisfy the production direction.",
  ].join("\n");
  return ProductionTaskRuntime.update(task.id, {
    input: {
      ...(task.input || {}),
      prompt,
      provider_prompt: prompt,
      audio_master: {
        task_id: finish.id,
        master_url: output.master_url,
        waveform_url: output.waveform_url,
        checksum: output.checksum,
        master_report: output.master_report,
      },
    },
    metadata: {
      ...(task.metadata || {}),
      audio_evidence_review_bound: true,
    },
  });
}
