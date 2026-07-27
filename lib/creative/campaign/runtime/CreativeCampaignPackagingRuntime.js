import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import JSZip from "jszip";

import { getServiceSupabase } from "@/lib/shared/supabase/service";
import { creativeStorageUri } from "@/lib/creative/assets/storage/CreativePrivateStorageRuntime";
import { materializeMedia } from "@/lib/creative/media/runtime/CreativeMediaInspectionRuntime";
import { ProductionTaskRuntime } from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import {
  campaignArtifactReferences,
  campaignQualityFailures,
  campaignQualityPass,
  isCampaignQualityTask,
  latestCampaignTask,
  unwrapCampaignOutput,
} from "./CampaignPackagingContractRuntime";

const supabaseAdmin = getServiceSupabase();

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function safe(value, fallback = "artifact") {
  return text(value || fallback)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || fallback;
}

function extensionFromUrl(value, mimeType = "") {
  const clean = text(value).split(/[?#]/)[0];
  const ext = path.extname(clean).replace(/^\./, "").toLowerCase();
  if (ext) return ext;
  const mime = text(mimeType).toLowerCase();
  return ({
    "application/pdf": "pdf",
    "application/zip": "zip",
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "audio/wav": "wav",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "video/mp4": "mp4",
    "text/html": "html",
    "application/json": "json",
  })[mime] || "bin";
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function uploadPrivate({ bucket, storagePath, buffer, contentType }) {
  const { error } = await supabaseAdmin.storage
    .from(bucket)
    .upload(storagePath, buffer, {
      contentType,
      upsert: false,
    });
  if (error && !String(error.message || error).includes("already exists")) throw error;
  return creativeStorageUri(bucket, storagePath);
}

function packagePolicy(task = {}) {
  return {
    max_bytes:
      task.input?.media_policy?.max_bytes ||
      task.input?.mediaPolicy?.maxBytes ||
      process.env.CREATIVE_CAMPAIGN_MAX_ARTIFACT_BYTES ||
      process.env.CREATIVE_MEDIA_MAX_INSPECTION_BYTES,
    timeout_ms:
      task.input?.media_policy?.timeout_ms ||
      task.input?.mediaPolicy?.timeoutMs ||
      process.env.CREATIVE_CAMPAIGN_ARTIFACT_TIMEOUT_MS ||
      process.env.CREATIVE_MEDIA_INSPECTION_TIMEOUT_MS,
    allowed_hosts:
      task.input?.media_policy?.allowed_hosts ||
      task.input?.mediaPolicy?.allowedHosts ||
      [],
    allow_private_networks: false,
    max_redirects: 0,
  };
}

function groupedDeliverables(tasks = []) {
  const groups = new Map();
  for (const task of tasks) {
    const id = text(task.metadata?.deliverable_id);
    if (!id) continue;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(task);
  }
  return groups;
}

function releaseCandidate(deliverableTasks) {
  return latestCampaignTask(deliverableTasks, (task) =>
    task.status === "COMPLETED" &&
    !isCampaignQualityTask(task) &&
    task.metadata?.release_candidate === true,
  ) || latestCampaignTask(deliverableTasks, (task) =>
    task.status === "COMPLETED" && !isCampaignQualityTask(task),
  );
}

function qualityTask(deliverableTasks) {
  return latestCampaignTask(deliverableTasks, (task) =>
    task.status === "COMPLETED" && isCampaignQualityTask(task),
  );
}

function coherenceTask(tasks = []) {
  return latestCampaignTask(tasks, (task) =>
    task.status === "COMPLETED" &&
    isCampaignQualityTask(task) &&
    !text(task.metadata?.deliverable_id),
  );
}

async function collectDeliverables(task, tasks) {
  const groups = groupedDeliverables(tasks);
  if (!groups.size) throw new Error("CREATIVE_CAMPAIGN_DELIVERABLES_REQUIRED");
  const deliverables = [];
  for (const [deliverableId, deliverableTasks] of groups.entries()) {
    const candidate = releaseCandidate(deliverableTasks);
    const review = qualityTask(deliverableTasks);
    if (!candidate) throw new Error(`CREATIVE_CAMPAIGN_RELEASE_CANDIDATE_REQUIRED:${deliverableId}`);
    if (!review) throw new Error(`CREATIVE_CAMPAIGN_QUALITY_REVIEW_REQUIRED:${deliverableId}`);
    if (!campaignQualityPass(review.output)) {
      const failures = campaignQualityFailures(review.output);
      throw new Error(`CREATIVE_CAMPAIGN_QUALITY_REJECTED:${deliverableId}:${failures.join("|") || "EXPLICIT_PASS_REQUIRED"}`);
    }
    const references = campaignArtifactReferences(candidate.output);
    if (!references.length) {
      throw new Error(`CREATIVE_CAMPAIGN_REAL_ARTIFACT_REQUIRED:${deliverableId}`);
    }
    deliverables.push({
      deliverable_id: deliverableId,
      deliverable_type: text(candidate.metadata?.deliverable_type),
      workflow_kind: text(candidate.metadata?.workflow_kind),
      candidate_task_id: candidate.id,
      quality_task_id: review.id,
      quality_evidence: unwrapCampaignOutput(review.output),
      references,
    });
  }
  return deliverables;
}

async function materializeReference(task, reference, directory, index) {
  const materialized = await materializeMedia({
    url: reference.url,
    file_name: reference.name || null,
    mime_type: reference.mime_type || null,
    organization_id: task.organization_id,
    policy: packagePolicy(task),
  });
  const buffer = await fs.readFile(materialized.file_path);
  const checksum = sha256(buffer);
  if (reference.checksum && reference.checksum.toLowerCase() !== checksum) {
    await materialized.cleanup();
    throw new Error(`CREATIVE_CAMPAIGN_ARTIFACT_CHECKSUM_MISMATCH:${reference.url}`);
  }
  const extension = extensionFromUrl(reference.name || reference.url, reference.mime_type || materialized.mime_type);
  const fileName = `${String(index + 1).padStart(2, "0")}-${safe(reference.role || reference.name || "artifact")}.${extension}`;
  const localPath = path.join(directory, fileName);
  await fs.writeFile(localPath, buffer);
  await materialized.cleanup();
  return {
    file_name: fileName,
    buffer,
    checksum,
    file_size_bytes: buffer.length,
    mime_type: reference.mime_type || materialized.mime_type || "application/octet-stream",
    source_url: reference.url,
    role: reference.role || null,
  };
}

function packageIdentity(task, deliverables) {
  return sha256(Buffer.from(stableStringify({
    organization_id: task.organization_id,
    creative_project_id: task.creative_project_id,
    production_graph_id: task.production_graph_id,
    deliverables: deliverables.map((item) => ({
      deliverable_id: item.deliverable_id,
      candidate_task_id: item.candidate_task_id,
      quality_task_id: item.quality_task_id,
      references: item.references.map((reference) => ({
        url: reference.url,
        checksum: reference.checksum || null,
      })),
    })),
  })));
}

export const CreativeCampaignPackagingRuntime = {
  async package(task = {}) {
    const tasks = await ProductionTaskRuntime.list({
      organization_id: task.organization_id,
      creative_project_id: task.creative_project_id,
    });
    const deliverables = await collectDeliverables(task, tasks);
    const identity = packageIdentity(task, deliverables);
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-campaign-"));
    try {
      const zip = new JSZip();
      const manifestDeliverables = [];
      for (const deliverable of deliverables) {
        const folder = zip.folder(`deliverables/${safe(deliverable.deliverable_id)}`);
        const files = [];
        for (const [index, reference] of deliverable.references.entries()) {
          const materialized = await materializeReference(task, reference, directory, index);
          folder.file(materialized.file_name, materialized.buffer, { date: new Date(0) });
          files.push({
            file_name: materialized.file_name,
            checksum: materialized.checksum,
            file_size_bytes: materialized.file_size_bytes,
            mime_type: materialized.mime_type,
            role: materialized.role,
            source_url: materialized.source_url,
          });
        }
        manifestDeliverables.push({
          deliverable_id: deliverable.deliverable_id,
          deliverable_type: deliverable.deliverable_type,
          workflow_kind: deliverable.workflow_kind,
          candidate_task_id: deliverable.candidate_task_id,
          quality_task_id: deliverable.quality_task_id,
          quality_passed: true,
          files,
        });
      }
      const manifest = {
        contract: "AVANTIQO_CREATIVE_CAMPAIGN_PACKAGE_V1",
        identity,
        organization_id: task.organization_id,
        creative_project_id: task.creative_project_id,
        production_graph_id: task.production_graph_id,
        generated_at: new Date().toISOString(),
        published: false,
        deliverable_count: manifestDeliverables.length,
        deliverables: manifestDeliverables,
      };
      const manifestBuffer = Buffer.from(`${stableStringify(manifest)}\n`);
      zip.file("campaign-manifest.json", manifestBuffer, { date: new Date(0) });
      const packageBuffer = await zip.generateAsync({
        type: "nodebuffer",
        compression: "DEFLATE",
        compressionOptions: { level: 9 },
        platform: "UNIX",
      });
      const packageChecksum = sha256(packageBuffer);
      const manifestChecksum = sha256(manifestBuffer);
      const bucket =
        task.input?.storage_policy?.bucket ||
        task.metadata?.storage_policy?.bucket ||
        process.env.CREATIVE_CAMPAIGN_PACKAGE_BUCKET ||
        process.env.CREATIVE_MEDIA_RENDER_BUCKET;
      if (!bucket) throw new Error("CREATIVE_CAMPAIGN_PACKAGE_BUCKET_REQUIRED");
      const base = [
        "organizations",
        safe(task.organization_id),
        "creative-projects",
        safe(task.creative_project_id),
        "campaign-packages",
        identity,
      ].join("/");
      const packageUrl = await uploadPrivate({
        bucket,
        storagePath: `${base}/campaign-package.zip`,
        buffer: packageBuffer,
        contentType: "application/zip",
      });
      const manifestUrl = await uploadPrivate({
        bucket,
        storagePath: `${base}/campaign-manifest.json`,
        buffer: manifestBuffer,
        contentType: "application/json",
      });
      return {
        success: true,
        passed: true,
        contract: manifest.contract,
        package_id: identity,
        package_url: packageUrl,
        manifest_url: manifestUrl,
        checksum: packageChecksum,
        manifest_checksum: manifestChecksum,
        file_size_bytes: packageBuffer.length,
        deliverable_count: manifestDeliverables.length,
        deliverables: manifestDeliverables,
        manifest,
        published: false,
      };
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  },

  async validate(task = {}) {
    const tasks = await ProductionTaskRuntime.list({
      organization_id: task.organization_id,
      creative_project_id: task.creative_project_id,
    });
    const packageTaskId = task.metadata?.campaign_package_task_id;
    const packageTask = packageTaskId
      ? await ProductionTaskRuntime.get(packageTaskId)
      : latestCampaignTask(tasks, (candidate) =>
          candidate.status === "COMPLETED" &&
          candidate.capability === "creative.campaign.package",
        );
    if (!packageTask) throw new Error("CREATIVE_CAMPAIGN_PACKAGE_TASK_REQUIRED");
    const output = unwrapCampaignOutput(packageTask.output);
    const coherence = coherenceTask(tasks);
    const failures = [];
    if (!output.package_url) failures.push("CAMPAIGN_PACKAGE_URL_REQUIRED");
    if (!output.manifest_url) failures.push("CAMPAIGN_MANIFEST_URL_REQUIRED");
    if (!output.checksum) failures.push("CAMPAIGN_PACKAGE_CHECKSUM_REQUIRED");
    if (!output.manifest_checksum) failures.push("CAMPAIGN_MANIFEST_CHECKSUM_REQUIRED");
    if (!Number(output.deliverable_count || 0)) failures.push("CAMPAIGN_DELIVERABLES_REQUIRED");
    if (!list(output.deliverables).every((item) => item.quality_passed === true && list(item.files).length)) {
      failures.push("CAMPAIGN_DELIVERABLE_ARTIFACT_EVIDENCE_REQUIRED");
    }
    if (!coherence) failures.push("CAMPAIGN_COHERENCE_REVIEW_REQUIRED");
    if (coherence && !campaignQualityPass(coherence.output)) {
      failures.push(...campaignQualityFailures(coherence.output));
      if (!failures.length) failures.push("CAMPAIGN_COHERENCE_REJECTED");
    }
    return {
      success: failures.length === 0,
      passed: failures.length === 0,
      verdict: failures.length === 0 ? "PASS" : "FAIL",
      failed_checks: [...new Set(failures)],
      repair_instructions: failures.map((failure) => `Resolve ${failure} before campaign release.`),
      release_readiness: failures.length === 0,
      package_url: output.package_url || null,
      manifest_url: output.manifest_url || null,
      checksum: output.checksum || null,
      manifest_checksum: output.manifest_checksum || null,
      deliverable_count: Number(output.deliverable_count || 0),
      package_task_id: packageTask.id,
      coherence_task_id: coherence?.id || null,
      published: false,
    };
  },
};
