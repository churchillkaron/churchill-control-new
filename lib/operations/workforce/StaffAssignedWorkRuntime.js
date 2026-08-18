import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { businessDayRange } from "@/lib/shared/time/organizationTime";
import { serverOperationsApi } from "@/lib/operations/api/createServerOperationsApi";

const WORK_CAPABILITY_ID = "work-orders";
const TERMINAL_STATUSES = new Set(["cancel", "cancelled", "archived"]);

function cleanText(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function serviceDelivery(record = {}) {
  return record?.attributes?.service_delivery || {};
}

function executionProtocol(record = {}) {
  return serviceDelivery(record)?.execution_protocol || null;
}

function coordinatesFromRecord(record = {}) {
  const service = serviceDelivery(record);
  const candidates = [
    service.location,
    service.customer_location,
    record?.attributes?.location,
    record?.attributes?.customer_location,
  ].filter(Boolean);

  for (const candidate of candidates) {
    const latitude = finiteNumber(
      candidate.latitude ?? candidate.lat ?? candidate.location_latitude
    );
    const longitude = finiteNumber(
      candidate.longitude ?? candidate.lng ?? candidate.lon ?? candidate.location_longitude
    );

    if (latitude !== null && longitude !== null) {
      return { latitude, longitude };
    }
  }

  const latitude = finiteNumber(
    service.customer_latitude ??
      service.latitude ??
      record?.attributes?.latitude ??
      record?.attributes?.customer_latitude
  );
  const longitude = finiteNumber(
    service.customer_longitude ??
      service.longitude ??
      record?.attributes?.longitude ??
      record?.attributes?.customer_longitude
  );

  return latitude !== null && longitude !== null
    ? { latitude, longitude }
    : null;
}

function destinationText(record = {}) {
  const service = serviceDelivery(record);

  return cleanText(
    service.customer_location_address ||
      service.customer_address ||
      service.customer_location_name ||
      record?.attributes?.location_address ||
      record?.attributes?.address ||
      record?.attributes?.location_name
  );
}

function actionNoun(record = {}) {
  const service = serviceDelivery(record);
  const vocabulary = [
    service.industry_key,
    service.service_category,
    service.service_name,
    record.name,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (vocabulary.includes("pest") || vocabulary.includes("treatment")) {
    return "Treatment";
  }
  if (vocabulary.includes("clean") || vocabulary.includes("housekeep")) {
    return "Cleaning";
  }
  if (
    vocabulary.includes("maintenance") ||
    vocabulary.includes("repair") ||
    vocabulary.includes("service")
  ) {
    return "Job";
  }
  if (vocabulary.includes("inspect")) {
    return "Inspection";
  }

  return record.source_domain === "service-management" ? "Service" : "Job";
}

function customerName(record = {}) {
  const service = serviceDelivery(record);
  return cleanText(service.customer_name) || cleanText(record.name) || "Assigned work";
}

function serviceName(record = {}) {
  const service = serviceDelivery(record);
  return cleanText(service.service_name) || cleanText(record.name) || "Work order";
}

function timestampInside(value, range) {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return false;
  return timestamp >= new Date(range.start).getTime() && timestamp < new Date(range.nextStart).getTime();
}

function activeRecord(record = {}) {
  return ["start", "pause"].includes(String(record.status || "").toLowerCase());
}

function recordBelongsToToday(record, range) {
  if (activeRecord(record)) return true;
  if (timestampInside(record.scheduled_start, range)) return true;
  if (!record.scheduled_start && timestampInside(record.due_at, range)) return true;
  return false;
}

function normalizedStatus(record = {}) {
  const status = String(record.status || "draft").toLowerCase();
  if (status === "start") return "in_progress";
  if (status === "pause") return "paused";
  if (status === "complete") return "completed";
  if (status === "cancel") return "cancelled";
  return status;
}

function normalizeJob(record = {}) {
  const destinationCoordinates = coordinatesFromRecord(record);
  const destination = destinationText(record);
  const service = serviceDelivery(record);
  const protocol = executionProtocol(record);

  return {
    id: record.id,
    capabilityId: record.capability_id,
    status: normalizedStatus(record),
    rawStatus: record.status,
    priority: record.priority || "normal",
    scheduledStart: record.scheduled_start,
    scheduledEnd: record.scheduled_end,
    dueAt: record.due_at,
    completedAt: record.completed_at,
    customerName: customerName(record),
    serviceName: serviceName(record),
    serviceCategory: cleanText(service.service_category),
    industryKey: cleanText(service.industry_key),
    locationName: cleanText(service.customer_location_name) || destination,
    destination,
    destinationCoordinates,
    actionNoun: actionNoun(record),
    description: cleanText(record.description),
    sourceDomain: cleanText(record.source_domain),
    sourceType: cleanText(record.source_type),
    sourceId: cleanText(record.source_id),
    executionProtocol: protocol,
    completionSubmission: record?.attributes?.staff_execution?.protocol_submission || null,
    attributes: record.attributes || {},
  };
}

function isMissingValue(value, type = "text") {
  if (type === "checkbox") return value !== true;
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return !value.trim();
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function evidenceList(completion, key) {
  const value = completion?.evidence?.[key];
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function validateProtocolCompletion({ record, completion, distance }) {
  const protocol = executionProtocol(record);
  if (!protocol) return null;

  const submission = completion && typeof completion === "object" ? completion : {};
  const fields = submission.fields && typeof submission.fields === "object" ? submission.fields : {};
  const requiredFields = Array.isArray(protocol.field_schema)
    ? protocol.field_schema.filter((field) => field?.required)
    : [];
  const missingFields = requiredFields
    .filter((field) => isMissingValue(fields[field.key], field.type))
    .map((field) => field.label || field.key);

  if (missingFields.length) {
    const error = new Error(`Complete required service fields: ${missingFields.join(", ")}.`);
    error.status = 409;
    throw error;
  }

  const evidence = protocol.evidence_requirements || {};
  if (evidence.before_photos && evidenceList(submission, "before_photos").length === 0) {
    const error = new Error("At least one before photo is required.");
    error.status = 409;
    throw error;
  }
  if (evidence.after_photos && evidenceList(submission, "after_photos").length === 0) {
    const error = new Error("At least one after photo is required.");
    error.status = 409;
    throw error;
  }
  if (evidence.customer_signature && !cleanText(submission?.evidence?.customer_signature)) {
    const error = new Error("Customer signature is required.");
    error.status = 409;
    throw error;
  }
  if (evidence.technician_signature && !cleanText(submission?.evidence?.technician_signature)) {
    const error = new Error("Technician signature is required.");
    error.status = 409;
    throw error;
  }
  if (evidence.location_confirmation) {
    const destinationCoordinates = coordinatesFromRecord(record);
    if (!destinationCoordinates) {
      const error = new Error("This protocol requires location confirmation, but the service location has no coordinates.");
      error.status = 409;
      throw error;
    }
    if (distance === null || distance > 250) {
      const error = new Error("Move within 250 meters of the service location before completing this job.");
      error.status = 409;
      throw error;
    }
  }

  const rules = protocol.completion_rules || {};
  const outcome = cleanText(submission.outcome);
  if (rules.require_outcome !== false && !outcome) {
    const error = new Error("Service outcome is required before completion.");
    error.status = 409;
    throw error;
  }
  if (rules.allow_follow_up === false && outcome === "follow_up") {
    const error = new Error("This protocol does not allow completion with a follow-up outcome.");
    error.status = 409;
    throw error;
  }

  return {
    template_id: protocol.template_id,
    template_code: protocol.code,
    template_version: protocol.version,
    submitted_at: new Date().toISOString(),
    fields,
    outcome,
    follow_up_notes: cleanText(submission.follow_up_notes),
    evidence: submission.evidence || {},
  };
}

export function distanceMeters(a, b) {
  const lat1 = finiteNumber(a?.latitude);
  const lon1 = finiteNumber(a?.longitude);
  const lat2 = finiteNumber(b?.latitude);
  const lon2 = finiteNumber(b?.longitude);

  if ([lat1, lon1, lat2, lon2].some((value) => value === null)) {
    return null;
  }

  const toRadians = (value) => (value * Math.PI) / 180;
  const earthRadius = 6371000;
  const deltaLat = toRadians(lat2 - lat1);
  const deltaLon = toRadians(lon2 - lon1);
  const first = toRadians(lat1);
  const second = toRadians(lat2);
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(first) * Math.cos(second) * Math.sin(deltaLon / 2) ** 2;

  return Math.round(2 * earthRadius * Math.asin(Math.sqrt(haversine)));
}

export async function listAssignedWorkForStaff({
  organizationId,
  staffId,
  timezone = "UTC",
}) {
  if (!organizationId || !staffId) {
    throw new Error("Assigned work requires organizationId and staffId.");
  }

  const range = businessDayRange(timezone);
  const { data, error } = await supabaseAdmin
    .from("operations_records")
    .select(
      "id,organization_id,entity_id,period_id,capability_id,name,description,status,priority,assigned_to,scheduled_start,scheduled_end,due_at,completed_at,last_command,source_domain,source_type,source_id,attributes,created_at,updated_at"
    )
    .eq("organization_id", organizationId)
    .eq("capability_id", WORK_CAPABILITY_ID)
    .eq("assigned_to", staffId)
    .limit(250);

  if (error) throw error;

  const jobs = (data || [])
    .filter((record) => !TERMINAL_STATUSES.has(String(record.status || "").toLowerCase()))
    .filter((record) => recordBelongsToToday(record, range))
    .map(normalizeJob)
    .sort((a, b) => {
      const left = new Date(a.scheduledStart || a.dueAt || 0).getTime();
      const right = new Date(b.scheduledStart || b.dueAt || 0).getTime();
      return left - right;
    });

  const completed = jobs.filter((job) => job.status === "completed").length;
  const inProgress = jobs.filter((job) => job.status === "in_progress").length;
  const remaining = jobs.length - completed;
  const next =
    jobs.find((job) => job.status === "in_progress") ||
    jobs.find((job) => !["completed", "cancelled"].includes(job.status)) ||
    null;

  return {
    businessDate: range.businessDate,
    timezone,
    jobs,
    summary: {
      total: jobs.length,
      completed,
      inProgress,
      remaining,
    },
    next,
  };
}

async function requireAssignedWork({ organizationId, staffId, workOrderId }) {
  const { data, error } = await supabaseAdmin
    .from("operations_records")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("capability_id", WORK_CAPABILITY_ID)
    .eq("id", workOrderId)
    .eq("assigned_to", staffId)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    const notFound = new Error("This work order is not assigned to you.");
    notFound.status = 404;
    throw notFound;
  }

  return data;
}

function requireGps(location) {
  const latitude = finiteNumber(location?.latitude);
  const longitude = finiteNumber(location?.longitude);
  const accuracy = finiteNumber(location?.accuracy);

  if (latitude === null || longitude === null) {
    const error = new Error("GPS location is required for this action.");
    error.status = 400;
    throw error;
  }

  return {
    latitude,
    longitude,
    accuracy,
    captured_at: cleanText(location?.capturedAt) || new Date().toISOString(),
  };
}

export async function executeAssignedWorkForStaff({
  organizationId,
  staffId,
  actorId,
  workOrderId,
  action,
  location,
  completion = null,
}) {
  const command = String(action || "").trim().toLowerCase();
  if (!["start", "complete"].includes(command)) {
    const error = new Error("Unsupported staff work action.");
    error.status = 400;
    throw error;
  }

  const record = await requireAssignedWork({
    organizationId,
    staffId,
    workOrderId,
  });

  if (command === "start" && ["complete", "cancel"].includes(record.status)) {
    const error = new Error("This work order can no longer be started.");
    error.status = 409;
    throw error;
  }

  const gps = requireGps(location);
  const destinationCoordinates = coordinatesFromRecord(record);
  const distance = destinationCoordinates
    ? distanceMeters(gps, destinationCoordinates)
    : null;
  const capturedAt = new Date().toISOString();
  const protocolSubmission = command === "complete"
    ? validateProtocolCompletion({ record, completion, distance })
    : null;
  const previousExecution = record?.attributes?.staff_execution || {};
  const staffExecution = {
    ...previousExecution,
    staff_id: staffId,
    ...(protocolSubmission ? { protocol_submission: protocolSubmission } : {}),
    [command === "start" ? "started" : "completed"]: {
      at: capturedAt,
      gps,
      distance_from_destination_meters: distance,
      destination_coordinates: destinationCoordinates,
    },
  };

  const payload = {
    id: record.id,
    assigned_to: staffId,
    attributes: {
      ...(record.attributes || {}),
      staff_execution: staffExecution,
    },
    ...(command === "complete" ? { completed_at: capturedAt } : {}),
  };

  const response = await serverOperationsApi.execute({
    capabilityId: WORK_CAPABILITY_ID,
    command,
    context: {
      organization_id: organizationId,
      entity_id: record.entity_id || null,
      period_id: record.period_id || null,
      actor_id: actorId || null,
    },
    payload,
  });

  if (response.status >= 400 || !response.body?.ok) {
    const error = new Error(response.body?.error || "Unable to update assigned work.");
    error.status = response.status || 500;
    throw error;
  }

  return {
    job: normalizeJob(response.body.execution?.result || record),
    gps: {
      ...gps,
      distanceFromDestinationMeters: distance,
      destinationCoordinates,
      verified:
        distance === null
          ? null
          : distance <= 250,
    },
  };
}

export default Object.freeze({
  listAssignedWorkForStaff,
  executeAssignedWorkForStaff,
  distanceMeters,
});
