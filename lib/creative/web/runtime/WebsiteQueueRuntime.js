import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import {
  creativeStorageReference,
  signCreativeStorageReference,
} from "@/lib/creative/assets/storage/CreativePrivateStorageRuntime";
import {
  CreativeWebsiteProductionRuntime,
} from "./CreativeWebsiteProductionRuntime";
import {
  unwrapWebsiteOutput,
} from "./WebsiteContractRuntime";

export function localWebsiteOperation(task = {}) {
  const capability = String(task.capability || task.service_code || "").trim();
  if (capability === "creative.website.build") return "build";
  if (capability === "creative.website.validate") return "validate";
  const workflow = String(task.metadata?.workflow_kind || "").toUpperCase();
  const step = String(task.metadata?.production_step_id || "").toLowerCase();
  if (workflow === "INTERACTIVE" && step === "build") return "build";
  if (workflow === "INTERACTIVE" && step === "release-validation") return "validate";
  return null;
}

export function isWebsiteQualityTask(task = {}) {
  const workflow = String(task.metadata?.workflow_kind || "").toUpperCase();
  const step = String(task.metadata?.production_step_id || "").toLowerCase();
  const capability = String(task.capability || task.service_code || "").toLowerCase();
  return workflow === "INTERACTIVE" &&
    step !== "release-validation" &&
    (step === "quality" || step === "semantic-review" || capability.includes("image.analyze"));
}

export async function dispatchWebsiteTask(task) {
  const operation = localWebsiteOperation(task);
  if (!operation) return null;
  try {
    const output = operation === "build"
      ? await CreativeWebsiteProductionRuntime.build(task)
      : await CreativeWebsiteProductionRuntime.validate(task);
    return ProductionTaskRuntime.complete(task.id, {
      provider: "avantiqo-local-website-worker",
      settlement: "LOCAL_EXECUTION",
      output,
    });
  } catch (error) {
    return ProductionTaskRuntime.fail(task.id, error);
  }
}

export async function bindWebsiteScreenshotForReview(task) {
  if (task.metadata?.website_screenshot_review_bound) return task;
  const dependencies = Array.isArray(task.depends_on) ? task.depends_on : [];
  const tasks = await ProductionTaskRuntime.list({
    organization_id: task.organization_id,
    creative_project_id: task.creative_project_id,
  });
  const build = tasks.find((candidate) =>
    dependencies.includes(candidate.id) &&
    localWebsiteOperation(candidate) === "build" &&
    candidate.status === "COMPLETED",
  ) || tasks.find((candidate) =>
    localWebsiteOperation(candidate) === "build" &&
    candidate.status === "COMPLETED" &&
    candidate.metadata?.deliverable_id === task.metadata?.deliverable_id,
  );
  if (!build) throw new Error("CREATIVE_WEBSITE_BUILD_NOT_COMPLETED");
  const output = unwrapWebsiteOutput(build.output);
  const privateUrl = output.screenshot_url;
  if (!privateUrl) throw new Error("CREATIVE_WEBSITE_SCREENSHOT_REQUIRED");
  const reviewUrl = creativeStorageReference(privateUrl)
    ? await signCreativeStorageReference({
        organization_id: task.organization_id,
        reference: privateUrl,
      })
    : privateUrl;
  const prompt = [
    task.input?.prompt || task.input?.provider_prompt || "Review this finished website screenshot.",
    "Return only JSON with keys: passed, verdict, failed_checks, repair_instructions.",
    "Evaluate hierarchy, brand fidelity, responsive plausibility, legibility, accessibility, content truth, CTA clarity and visual defects.",
    "Set passed=true only when the website is ready for release with no critical defects.",
  ].filter(Boolean).join("\n");
  return ProductionTaskRuntime.update(task.id, {
    service_id: "ai.image.analyze",
    service_code: "ai.image.analyze",
    capability: "ai.image.analyze",
    input: {
      ...(task.input || {}),
      prompt,
      provider_prompt: prompt,
      image: reviewUrl,
      media: reviewUrl,
      source: reviewUrl,
      assets: [{ url: reviewUrl, role: "website_browser_screenshot" }],
      website_build: {
        task_id: build.id,
        package_url: output.package_url || null,
        preview_url: output.preview_url || null,
        screenshot_private_url: privateUrl,
        screenshot_review_url: reviewUrl,
      },
    },
    metadata: {
      ...(task.metadata || {}),
      website_build_task_id: build.id,
      website_screenshot_review_bound: true,
      website_semantic_review_capability: "ai.image.analyze",
    },
  });
}
