import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

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
  })[text(mimeType).toLowerCase()] || "bin";
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

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  }
  return value >>> 0;
});

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function zipDateTime() {
  return { date: 33, time: 0 };
}

function createDeterministicZip(entries = []) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const { date, time } = zipDateTime();
  for (const entry of entries) {
    const name = Buffer.from(entry.name.replace(/\\/g, "/"), "utf8");
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data);
    const checksum = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const centralBuffer = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralBuffer, end]);
}

async function uploadPrivate({ bucket, storagePath, buffer, contentType }) {
  const { error } = await supabaseAdmin.storage.from(bucket).upload(storagePath, buffer, {
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

async function collectDeliverables(tasks) {
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
    if (!references.length) throw new Error(`CREATIVE_CAMPAIGN_REAL_ARTIFACT_REQUIRED:${deliverableId}`);
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
  try {
    const buffer = await fs.readFile(materialized.file_path);
    const checksum = sha256(buffer);
    if (reference.checksum && reference.checksum.toLowerCase() !== checksum) {
      throw new Error(`CREATIVE_CAMPAIGN_ARTIFACT_CHECKSUM_MISMATCH:${reference.url}`);
    }
    const extension = extensionFromUrl(
      reference.name || reference.url,
      reference.mime_type || materialized.mime_type,
    );
    const fileName = `${String(index + 1).padStart(2, "0")}-${safe(reference.role || reference.name || "artifact")}.${extension}`;
    await fs.writeFile(path.join(directory, fileName), buffer);
    return {
      file_name: fileName,
      buffer,
      checksum,
      file_size_bytes: buffer.length,
      mime_type: reference.mime_type || materialized.mime_type || "application/octet-stream",
      source_url: reference.url,
      role: reference.role || null,
    };
  } finally {
    await materialized.cleanup();
  }
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
    const deliverables = await collectDeliverables(tasks);
    const identity = packageIdentity(task, deliverables);
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-campaign-"));
    try {
      const entries = [];
      const manifestDeliverables = [];
      for (const deliverable of deliverables) {
        const files = [];
        for (const [index, reference] of deliverable.references.entries()) {
          const materialized = await materializeReference(task, reference, directory, index);
          entries.push({
            name: `deliverables/${safe(deliverable.deliverable_id)}/${materialized.file_name}`,
            data: materialized.buffer,
          });
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
        generated_at: task.created_at || null,
        published: false,
        deliverable_count: manifestDeliverables.length,
        deliverables: manifestDeliverables,
      };
      const manifestBuffer = Buffer.from(`${stableStringify(manifest)}\n`);
      entries.push({ name: "campaign-manifest.json", data: manifestBuffer });
      const packageBuffer = createDeterministicZip(entries);
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
          candidate.status === "COMPLETED" && candidate.capability === "creative.campaign.package",
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
      const coherenceFailures = campaignQualityFailures(coherence.output);
      failures.push(...(coherenceFailures.length ? coherenceFailures : ["CAMPAIGN_COHERENCE_REJECTED"]));
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
