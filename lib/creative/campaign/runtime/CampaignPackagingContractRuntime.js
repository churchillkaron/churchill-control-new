function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value) {
  return String(value ?? "").trim();
}

export function unwrapCampaignOutput(value = {}) {
  let current = value;
  const seen = new Set();
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const next = current.output || current.result || current.data || current.json || null;
    if (!next || next === current) break;
    current = next;
  }
  return current || {};
}

const WORKFLOW_BY_TYPE = {
  IMAGE: "STILL",
  POSTER: "STILL",
  BANNER: "STILL",
  KEY_ART: "STILL",
  DOCUMENT: "DOCUMENT",
  MENU: "DOCUMENT",
  PRESENTATION: "DOCUMENT",
  REPORT: "DOCUMENT",
  BROCHURE: "DOCUMENT",
  WEBSITE: "INTERACTIVE",
  WEBPAGE: "INTERACTIVE",
  LANDING_PAGE: "INTERACTIVE",
  EXPERIENCE: "INTERACTIVE",
  APPLICATION: "SOFTWARE",
  APP: "SOFTWARE",
  SOFTWARE: "SOFTWARE",
  AUDIO: "AUDIO",
  VOICE: "AUDIO",
  MUSIC: "AUDIO",
  PODCAST: "AUDIO",
  SOUND_DESIGN: "AUDIO",
};

export function effectiveWorkflowKind(task = {}) {
  const declared = text(task.metadata?.workflow_kind).toUpperCase();
  if (declared !== "CAMPAIGN_SYSTEM") return declared;
  const type = text(task.metadata?.deliverable_type).toUpperCase();
  return WORKFLOW_BY_TYPE[type] || declared;
}

export function routeCampaignDeliverableTask(task = {}) {
  const workflow = effectiveWorkflowKind(task);
  if (!workflow || workflow === text(task.metadata?.workflow_kind).toUpperCase()) return task;
  return {
    ...task,
    metadata: {
      ...(task.metadata || {}),
      campaign_workflow_kind: "CAMPAIGN_SYSTEM",
      workflow_kind: workflow,
      effective_workflow_kind: workflow,
    },
  };
}

export function campaignQualityPass(value = {}) {
  const evidence = unwrapCampaignOutput(value);
  if (evidence.passed === true || evidence.approved === true || evidence.release_readiness === true) {
    return true;
  }
  const verdict = text(
    evidence.verdict || evidence.status || evidence.result || evidence.decision,
  ).toUpperCase();
  return ["PASS", "PASSED", "APPROVED", "READY", "RELEASE_READY"].includes(verdict);
}

export function campaignQualityFailures(value = {}) {
  const evidence = unwrapCampaignOutput(value);
  return [
    ...list(evidence.failed_checks),
    ...list(evidence.failures),
    ...list(evidence.critical_failures),
    ...list(evidence.issues).map((item) =>
      typeof item === "string" ? item : item?.message || item?.issue || item?.failure,
    ),
  ].filter(Boolean).map(String);
}

function addReference(output, references, value, details = {}) {
  const url = text(value);
  if (!url || references.some((item) => item.url === url)) return;
  references.push({ url, ...details });
}

export function campaignArtifactReferences(value = {}) {
  const output = object(unwrapCampaignOutput(value));
  const references = [];
  for (const file of list(output.files)) {
    addReference(output, references, file?.url || file?.file_url || file?.fileUrl, {
      name: text(file?.name || file?.file_name || file?.fileName),
      mime_type: text(file?.mime_type || file?.mimeType),
      checksum: text(file?.checksum || file?.sha256 || file?.checksum_sha256),
      role: text(file?.role || file?.type),
    });
  }
  for (const delivery of list(output.deliveries || output.variants || output.exports)) {
    addReference(output, references, delivery?.url || delivery?.file_url || delivery?.fileUrl, {
      name: text(delivery?.name || delivery?.file_name || delivery?.fileName),
      mime_type: text(delivery?.mime_type || delivery?.mimeType),
      checksum: text(delivery?.checksum || delivery?.sha256 || delivery?.checksum_sha256),
      role: text(delivery?.role || delivery?.type || "delivery"),
    });
  }
  const primary = [
    [output.url, "primary"],
    [output.file_url || output.fileUrl, "primary"],
    [output.package_url || output.packageUrl, "package"],
    [output.build_artifact_url || output.buildArtifactUrl, "build"],
    [output.master_url || output.masterUrl, "master"],
    [output.deployment_url || output.deploymentUrl, "deployment"],
    [output.preview_url || output.previewUrl, "preview"],
    [output.download_url || output.downloadUrl, "download"],
  ];
  for (const [url, role] of primary) {
    addReference(output, references, url, {
      name: "",
      mime_type: text(output.mime_type || output.mimeType),
      checksum: text(output.checksum || output.sha256 || output.checksum_sha256),
      role,
    });
  }
  return references;
}

export function isCampaignQualityTask(task = {}) {
  return task.type === "QUALITY_REVIEW" || task.metadata?.quality_gate === true;
}

export function campaignStepIndex(task = {}) {
  const value = Number(task.metadata?.production_step_index || 0);
  return Number.isFinite(value) ? value : 0;
}

export function latestCampaignTask(tasks = [], predicate = () => true) {
  return tasks
    .filter(predicate)
    .sort((left, right) => campaignStepIndex(right) - campaignStepIndex(left))[0] || null;
}

export const CampaignPackagingContractRuntime = {
  unwrap: unwrapCampaignOutput,
  artifactReferences: campaignArtifactReferences,
  qualityPass: campaignQualityPass,
};
