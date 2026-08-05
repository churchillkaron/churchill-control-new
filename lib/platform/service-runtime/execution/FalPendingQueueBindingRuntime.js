import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.service.fal-pending-queue-binding.v2",
);

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function first(...values) {
  return values.map(text).find(Boolean) || null;
}

function trustedFalUrl(value, label) {
  const source = text(value);
  if (!source) return null;

  let parsed;
  try {
    parsed = new URL(source);
  } catch {
    throw new Error(`FAL_${label}_URL_INVALID`);
  }

  const hostname = parsed.hostname.toLowerCase();
  if (
    parsed.protocol !== "https:" ||
    !(
      hostname === "queue.fal.run" ||
      hostname.endsWith(".fal.run") ||
      hostname === "fal.ai" ||
      hostname.endsWith(".fal.ai")
    )
  ) {
    throw new Error(`FAL_${label}_URL_UNTRUSTED`);
  }

  return parsed.toString();
}

function extractQueueReferences(task = {}) {
  const output = object(task.output);
  const submission = object(output.provider_submission);
  const serviceProviderResult = object(submission.output);
  const providerOutput = object(serviceProviderResult.output);
  const providerRaw = object(providerOutput.raw);
  const providerQueue = object(providerOutput.queue);
  const submissionRaw = object(submission.raw);
  const inputStatus = object(task.input?.provider_status);
  const metadataStatus = object(task.metadata?.provider_status);

  const statusUrl = first(
    metadataStatus.status_url,
    metadataStatus.statusUrl,
    inputStatus.status_url,
    inputStatus.statusUrl,
    providerOutput.status_url,
    providerOutput.statusUrl,
    providerQueue.status_url,
    providerQueue.statusUrl,
    providerRaw.status_url,
    providerRaw.statusUrl,
    serviceProviderResult.status_url,
    serviceProviderResult.statusUrl,
    submissionRaw.status_url,
    submissionRaw.statusUrl,
  );
  const responseUrl = first(
    metadataStatus.response_url,
    metadataStatus.responseUrl,
    inputStatus.response_url,
    inputStatus.responseUrl,
    providerOutput.response_url,
    providerOutput.responseUrl,
    providerQueue.response_url,
    providerQueue.responseUrl,
    providerRaw.response_url,
    providerRaw.responseUrl,
    serviceProviderResult.response_url,
    serviceProviderResult.responseUrl,
    submissionRaw.response_url,
    submissionRaw.responseUrl,
  );
  const cancelUrl = first(
    metadataStatus.cancel_url,
    metadataStatus.cancelUrl,
    inputStatus.cancel_url,
    inputStatus.cancelUrl,
    providerOutput.cancel_url,
    providerOutput.cancelUrl,
    providerQueue.cancel_url,
    providerQueue.cancelUrl,
    providerRaw.cancel_url,
    providerRaw.cancelUrl,
    serviceProviderResult.cancel_url,
    serviceProviderResult.cancelUrl,
    submissionRaw.cancel_url,
    submissionRaw.cancelUrl,
  );

  return {
    status_url: trustedFalUrl(statusUrl, "STATUS"),
    response_url: trustedFalUrl(responseUrl, "RESPONSE"),
    cancel_url: trustedFalUrl(cancelUrl, "CANCEL"),
  };
}

function inputWithoutProviderStatus(input = {}) {
  const next = { ...object(input) };
  delete next.provider_status;
  return next;
}

async function bindTaskQueueReferences(taskOrId) {
  const task = typeof taskOrId === "string"
    ? await ProductionTaskRuntime.get(taskOrId)
    : taskOrId;
  if (!task) throw new Error("Production task not found");

  if (text(task.provider_id).toLowerCase() !== "fal") return task;
  if (text(task.status).toUpperCase() !== "RUNNING") return task;

  const references = extractQueueReferences(task);
  if (!references.status_url || !references.response_url) {
    throw new Error(
      `FAL_AUTHORITATIVE_QUEUE_REFERENCES_REQUIRED:${task.id}`,
    );
  }

  return ProductionTaskRuntime.update(task.id, {
    input: inputWithoutProviderStatus(task.input),
    metadata: {
      ...object(task.metadata),
      provider_status: {
        ...object(task.metadata?.provider_status),
        ...references,
        queue_contract: "FAL_AUTHORITATIVE_QUEUE_URLS_V1",
      },
      fal_authoritative_queue_binding_contract:
        "FAL_PENDING_QUEUE_BINDING_V2",
      fal_authoritative_status_url_bound: true,
      fal_authoritative_response_url_bound: true,
      provider_status_control_plane_location: "METADATA_ONLY",
    },
  });
}

function install() {
  if (ProductionTaskRuntime[INSTALL_FLAG]) return;

  const pollWithoutQueueBinding = ProductionTaskRuntime.poll.bind(
    ProductionTaskRuntime,
  );

  Object.defineProperty(ProductionTaskRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ProductionTaskRuntime.poll = async function pollWithFalQueueBinding(id) {
    const task = await ProductionTaskRuntime.get(id);
    if (!task) throw new Error("Production task not found");

    if (
      text(task.provider_id).toLowerCase() === "fal" &&
      text(task.status).toUpperCase() === "RUNNING"
    ) {
      await bindTaskQueueReferences(task);
    }

    return pollWithoutQueueBinding(id);
  };
}

install();

export const FalPendingQueueBindingRuntime = Object.freeze({
  installed: true,
  contract: "FAL_PENDING_QUEUE_BINDING_V2",
  extractQueueReferences,
  bindTaskQueueReferences,
  inputWithoutProviderStatus,
});
