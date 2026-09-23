import { createHash, createHmac, randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const MAX_WEBHOOK_ATTEMPTS = 20;
const DELIVERY_TIMEOUT_MS = 10_000;

function nonPublicIpv4(address) {
  const parts = String(address).split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }
  const [a, b, c] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function privateAddress(address) {
  if (!address) return true;
  const normalized = String(address).toLowerCase().split("%")[0];
  if (isIP(normalized) === 4) return nonPublicIpv4(normalized);
  if (isIP(normalized) !== 6) return true;

  if (
    normalized === "::1" ||
    normalized === "::" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb") ||
    normalized.startsWith("ff") ||
    normalized.startsWith("::ffff:") ||
    normalized.startsWith("2001:db8:")
  ) {
    return true;
  }

  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return nonPublicIpv4(mapped[1]);
  return false;
}

async function resolvePublicWebhookTarget(value) {
  let url;
  try {
    url = new URL(String(value || "").trim());
  } catch {
    throw new Error("WEBHOOK_URL_INVALID");
  }
  if (url.protocol !== "https:") throw new Error("WEBHOOK_HTTPS_REQUIRED");
  if (url.username || url.password) throw new Error("WEBHOOK_URL_CREDENTIALS_BLOCKED");
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local")) {
    throw new Error("WEBHOOK_PRIVATE_DESTINATION_BLOCKED");
  }
  const records = await lookup(host, { all: true, verbatim: true });
  if (!records.length || records.some((record) => privateAddress(record.address))) {
    throw new Error("WEBHOOK_PRIVATE_DESTINATION_BLOCKED");
  }
  return { url, records };
}

export async function assertPublicWebhookUrl(value) {
  const target = await resolvePublicWebhookTarget(value);
  return target.url.toString();
}

async function postPinnedWebhook({ target, headers, body, signal }) {
  const record = target.records[0];
  if (!record || privateAddress(record.address)) {
    throw new Error("WEBHOOK_PRIVATE_DESTINATION_BLOCKED");
  }

  return new Promise((resolve, reject) => {
    const request = httpsRequest(target.url, {
      method: "POST",
      headers,
      servername: target.url.hostname,
      lookup: (_hostname, options, callback) => {
        if (options?.all) {
          callback(null, target.records.map((item) => ({
            address: item.address,
            family: item.family,
          })));
          return;
        }
        callback(null, record.address, record.family);
      },
      signal,
    }, (response) => {
      response.resume();
      resolve({ status: Number(response.statusCode || 0) });
    });
    request.on("error", reject);
    request.end(body);
  });
}

function signature(secret, timestamp, body) {
  return createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
}

function payloadHash(body) {
  return createHash("sha256").update(body).digest("hex");
}

function retryDelaySeconds(attempt) {
  const safeAttempt = Math.max(1, Math.min(MAX_WEBHOOK_ATTEMPTS, Number(attempt) || 1));
  return Math.min(3600, 30 * (2 ** Math.max(0, safeAttempt - 1)));
}

function transientWebhookStatus(status) {
  const code = Number(status || 0);
  return code === 408 || code === 425 || code === 429 || code >= 500;
}

function nextRetryAt(attempt) {
  if (Number(attempt || 0) >= MAX_WEBHOOK_ATTEMPTS) return null;
  return new Date(Date.now() + retryDelaySeconds(attempt) * 1000).toISOString();
}



function environmentRow(endpoint) {
  return Array.isArray(endpoint?.developer_environments)
    ? endpoint.developer_environments[0]
    : endpoint?.developer_environments;
}

async function persistWebhookEvent({ organizationId, environmentId, eventId, eventType, data }) {
  const payload = {
    id: eventId,
    type: eventType,
    created_at: new Date().toISOString(),
    data,
  };
  const result = await supabaseAdmin
    .from("developer_webhook_events")
    .insert({
      organization_id: organizationId,
      environment_id: environmentId,
      event_id: eventId,
      event_type: eventType,
      payload,
    })
    .select("id,environment_id,event_id,event_type,payload,expires_at")
    .single();
  if (result.error) throw result.error;
  return result.data;
}

async function activeEndpoint({ organizationId, endpointId }) {
  const result = await supabaseAdmin
    .from("developer_webhook_endpoints")
    .select("id,organization_id,url,event_types,status,environment_id,developer_environments(status,environment_key)")
    .eq("organization_id", organizationId)
    .eq("id", endpointId)
    .maybeSingle();
  if (result.error) throw result.error;
  const endpoint = result.data;
  const environment = environmentRow(endpoint);
  if (!endpoint || endpoint.status !== "ACTIVE" || environment?.status !== "ACTIVE") {
    return null;
  }
  return endpoint;
}

async function sendStoredEvent({ organizationId, endpoint, event, deliveryId, attempt }) {
  const target = await resolvePublicWebhookTarget(endpoint.url);
  const secretResult = await supabaseAdmin.rpc("read_developer_webhook_secret", {
    p_organization_id: organizationId,
    p_endpoint_id: endpoint.id,
  });
  if (secretResult.error) throw secretResult.error;

  const body = JSON.stringify(event.payload);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
  let response;
  try {
    response = await postPinnedWebhook({
      target,
      headers: {
        "content-type": "application/json",
        "content-length": String(Buffer.byteLength(body)),
        "user-agent": "Avantiqo-Webhooks/1.0",
        "x-avantiqo-event-id": event.event_id,
        "x-avantiqo-delivery-id": deliveryId,
        "x-avantiqo-attempt": String(attempt),
        "x-avantiqo-environment": environmentRow(endpoint)?.environment_key || "unknown",
        "x-avantiqo-signature": `t=${timestamp},v1=${signature(secretResult.data, timestamp, body)}`,
      },
      body,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  const delivered = response.status >= 200 && response.status < 300;
  const retryScheduled = !delivered && transientWebhookStatus(response.status) && attempt < MAX_WEBHOOK_ATTEMPTS;
  const scheduledAt = retryScheduled ? nextRetryAt(attempt) : null;
  const update = await supabaseAdmin
    .from("developer_webhook_deliveries")
    .update({
      status: delivered ? "DELIVERED" : "FAILED",
      response_status: response.status,
      payload_hash: payloadHash(body),
      delivered_at: delivered ? new Date().toISOString() : null,
      error: delivered ? null : `HTTP_${response.status}`,
      next_attempt_at: scheduledAt,
      retry_lease_token: null,
      retry_lease_expires_at: null,
    })
    .eq("id", deliveryId)
    .eq("organization_id", organizationId);
  if (update.error) throw update.error;

  return {
    endpoint_id: endpoint.id,
    delivery_id: deliveryId,
    delivered,
    status: response.status,
    attempt,
    retry_scheduled: retryScheduled,
    next_attempt_at: scheduledAt,
  };
}

async function recordDeliveryFailure({ organizationId, deliveryId, error, attempt }) {
  const message = String(error?.message || "DELIVERY_FAILED").slice(0, 500);
  const retryScheduled = Number(attempt || 0) < MAX_WEBHOOK_ATTEMPTS;
  const scheduledAt = retryScheduled ? nextRetryAt(attempt) : null;
  const update = await supabaseAdmin
    .from("developer_webhook_deliveries")
    .update({
      status: "FAILED",
      error: message,
      next_attempt_at: scheduledAt,
      retry_lease_token: null,
      retry_lease_expires_at: null,
    })
    .eq("id", deliveryId)
    .eq("organization_id", organizationId);
  if (update.error) console.error("DEVELOPER_WEBHOOK_FAILURE_RECORD_FAILED", update.error.message);
  return {
    delivery_id: deliveryId,
    delivered: false,
    error: message,
    attempt,
    retry_scheduled: retryScheduled,
    next_attempt_at: scheduledAt,
  };
}

export async function deliverDeveloperWebhookEvent({
  organizationId,
  environmentId = null,
  eventType,
  data,
  eventId = randomUUID(),
  endpointId = null,
}) {
  let resolvedEnvironmentId = String(environmentId || "").trim() || null;
  let directEndpoint = null;

  if (endpointId) {
    directEndpoint = await activeEndpoint({ organizationId, endpointId });
    if (!directEndpoint) throw new Error("DEVELOPER_WEBHOOK_ENDPOINT_INACTIVE");
    if (resolvedEnvironmentId && directEndpoint.environment_id !== resolvedEnvironmentId) {
      throw new Error("DEVELOPER_WEBHOOK_ENVIRONMENT_MISMATCH");
    }
    resolvedEnvironmentId = directEndpoint.environment_id;
  }

  if (!resolvedEnvironmentId) {
    throw new Error("DEVELOPER_WEBHOOK_ENVIRONMENT_REQUIRED");
  }

  const event = await persistWebhookEvent({
    organizationId,
    environmentId: resolvedEnvironmentId,
    eventId,
    eventType,
    data,
  });

  let selected;
  if (directEndpoint) {
    selected = [directEndpoint];
  } else {
    const endpoints = await supabaseAdmin
      .from("developer_webhook_endpoints")
      .select("id,organization_id,url,event_types,status,environment_id,developer_environments(status,environment_key)")
      .eq("organization_id", organizationId)
      .eq("environment_id", resolvedEnvironmentId)
      .eq("status", "ACTIVE");
    if (endpoints.error) throw endpoints.error;
    selected = endpoints.data || [];
  }

  selected = selected.filter((endpoint) => {
    const types = Array.isArray(endpoint.event_types) ? endpoint.event_types : [];
    const environment = environmentRow(endpoint);
    return (
      endpoint.environment_id === resolvedEnvironmentId &&
      environment?.status === "ACTIVE" &&
      (types.includes("*") || types.includes(eventType))
    );
  });

  const results = [];
  for (const endpoint of selected) {
    const body = JSON.stringify(event.payload);
    const created = await supabaseAdmin
      .from("developer_webhook_deliveries")
      .insert({
        organization_id: organizationId,
        endpoint_id: endpoint.id,
        event_record_id: event.id,
        event_id: event.event_id,
        event_type: event.event_type,
        status: "PENDING",
        attempt: 1,
        payload_hash: payloadHash(body),
      })
      .select("id")
      .single();
    if (created.error) {
      results.push({ endpoint_id: endpoint.id, delivered: false, error: created.error.message });
      continue;
    }

    try {
      results.push(await sendStoredEvent({
        organizationId,
        endpoint,
        event,
        deliveryId: created.data.id,
        attempt: 1,
      }));
    } catch (error) {
      const failed = await recordDeliveryFailure({
        organizationId,
        deliveryId: created.data.id,
        error,
        attempt: 1,
      });
      results.push({ endpoint_id: endpoint.id, ...failed });
    }
  }

  return {
    event_id: event.event_id,
    event_type: event.event_type,
    endpoint_count: selected.length,
    results,
  };
}

async function ensureDeveloperWebhookEvent({
  organizationId,
  environmentId,
  eventId,
  eventType,
  data,
  occurredAt = null,
}) {
  const existing = await supabaseAdmin
    .from("developer_webhook_events")
    .select("id,environment_id,event_id,event_type,payload,expires_at")
    .eq("organization_id", organizationId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) {
    if (existing.data.environment_id && existing.data.environment_id !== environmentId) {
      throw new Error("DEVELOPER_WEBHOOK_ENVIRONMENT_MISMATCH");
    }
    return existing.data;
  }

  const payload = {
    id: eventId,
    type: eventType,
    created_at: occurredAt || new Date().toISOString(),
    data,
  };
  const inserted = await supabaseAdmin
    .from("developer_webhook_events")
    .insert({
      organization_id: organizationId,
      environment_id: environmentId,
      event_id: eventId,
      event_type: eventType,
      payload,
    })
    .select("id,environment_id,event_id,event_type,payload,expires_at")
    .single();

  if (!inserted.error) return inserted.data;
  if (inserted.error.code !== "23505") throw inserted.error;

  const raced = await supabaseAdmin
    .from("developer_webhook_events")
    .select("id,environment_id,event_id,event_type,payload,expires_at")
    .eq("organization_id", organizationId)
    .eq("event_id", eventId)
    .single();
  if (raced.error) throw raced.error;
  return raced.data;
}

async function ensureDeveloperWebhookDelivery({
  organizationId,
  endpoint,
  event,
}) {
  const existing = await supabaseAdmin
    .from("developer_webhook_deliveries")
    .select("id,status,attempt,response_status,error,next_attempt_at,delivered_at")
    .eq("organization_id", organizationId)
    .eq("event_record_id", event.id)
    .eq("endpoint_id", endpoint.id)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return { created: false, delivery: existing.data };

  const body = JSON.stringify(event.payload);
  const inserted = await supabaseAdmin
    .from("developer_webhook_deliveries")
    .insert({
      organization_id: organizationId,
      endpoint_id: endpoint.id,
      event_record_id: event.id,
      event_id: event.event_id,
      event_type: event.event_type,
      status: "PENDING",
      attempt: 1,
      payload_hash: payloadHash(body),
    })
    .select("id,status,attempt,response_status,error,next_attempt_at,delivered_at")
    .single();

  if (!inserted.error) return { created: true, delivery: inserted.data };
  if (inserted.error.code !== "23505") throw inserted.error;

  const raced = await supabaseAdmin
    .from("developer_webhook_deliveries")
    .select("id,status,attempt,response_status,error,next_attempt_at,delivered_at")
    .eq("organization_id", organizationId)
    .eq("event_record_id", event.id)
    .eq("endpoint_id", endpoint.id)
    .single();
  if (raced.error) throw raced.error;
  return { created: false, delivery: raced.data };
}

async function settleOperationsWebhookProjection({
  operationsEventId,
  leaseToken,
  status,
  error = null,
  retry = false,
}) {
  const update = await supabaseAdmin
    .from("developer_operations_webhook_projections")
    .update({
      status,
      last_error: error ? String(error).slice(0, 500) : null,
      next_attempt_at: retry ? new Date(Date.now() + 60_000).toISOString() : null,
      lease_token: null,
      lease_expires_at: null,
      projected_at: status === "PROJECTED" || status === "SKIPPED" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("operations_event_id", operationsEventId)
    .eq("lease_token", leaseToken)
    .select("operations_event_id")
    .maybeSingle();
  if (update.error) throw update.error;
  if (!update.data) throw new Error("DEVELOPER_OPERATIONS_WEBHOOK_PROJECTION_LEASE_LOST");
}

export async function processDeveloperOperationsWebhookProjections({ limit = 10 } = {}) {
  const claimed = await supabaseAdmin.rpc("claim_developer_operations_webhook_projections", {
    p_limit: Math.max(1, Math.min(50, Number(limit) || 10)),
    p_lease_seconds: 120,
  });
  if (claimed.error) throw claimed.error;

  const rows = claimed.data || [];
  const results = [];

  for (const row of rows) {
    const sourceEventId = `operations:${row.operations_event_id}`;
    try {
      const event = await ensureDeveloperWebhookEvent({
        organizationId: row.organization_id,
        environmentId: row.environment_id,
        eventId: sourceEventId,
        eventType: row.event_type,
        data: {
          source: "operations",
          operations_event_id: row.operations_event_id,
          payload: row.payload,
        },
        occurredAt: row.occurred_at,
      });

      const endpointsResult = await supabaseAdmin
        .from("developer_webhook_endpoints")
        .select("id,organization_id,url,event_types,status,environment_id,created_at,developer_environments(status,environment_key)")
        .eq("organization_id", row.organization_id)
        .eq("environment_id", row.environment_id)
        .eq("status", "ACTIVE");
      if (endpointsResult.error) throw endpointsResult.error;

      const sourceOccurredAt = new Date(row.occurred_at).getTime();
      const endpoints = (endpointsResult.data || []).filter((endpoint) => {
        const environment = environmentRow(endpoint);
        const types = Array.isArray(endpoint.event_types) ? endpoint.event_types : [];
        return (
          environment?.status === "ACTIVE" &&
          environment?.environment_key === "production" &&
          new Date(endpoint.created_at).getTime() <= sourceOccurredAt &&
          (types.includes("*") || types.includes(row.event_type))
        );
      });

      if (!endpoints.length) {
        await settleOperationsWebhookProjection({
          operationsEventId: row.operations_event_id,
          leaseToken: row.lease_token,
          status: "SKIPPED",
        });
        results.push({
          operations_event_id: row.operations_event_id,
          status: "SKIPPED",
          endpoint_count: 0,
        });
        continue;
      }

      const deliveries = [];
      for (const endpoint of endpoints) {
        const ensured = await ensureDeveloperWebhookDelivery({
          organizationId: row.organization_id,
          endpoint,
          event,
        });

        if (!ensured.created && ensured.delivery.status !== "PENDING") {
          deliveries.push({
            endpoint_id: endpoint.id,
            delivery_id: ensured.delivery.id,
            reused: true,
            status: ensured.delivery.status,
          });
          continue;
        }

        try {
          deliveries.push(await sendStoredEvent({
            organizationId: row.organization_id,
            endpoint,
            event,
            deliveryId: ensured.delivery.id,
            attempt: Math.max(1, Number(ensured.delivery.attempt || 1)),
          }));
        } catch (error) {
          const failed = await recordDeliveryFailure({
            organizationId: row.organization_id,
            deliveryId: ensured.delivery.id,
            error,
            attempt: 1,
          });
          deliveries.push({ endpoint_id: endpoint.id, ...failed });
        }
      }

      await settleOperationsWebhookProjection({
        operationsEventId: row.operations_event_id,
        leaseToken: row.lease_token,
        status: "PROJECTED",
      });
      results.push({
        operations_event_id: row.operations_event_id,
        status: "PROJECTED",
        endpoint_count: endpoints.length,
        deliveries,
      });
    } catch (error) {
      const message = String(error?.message || "DEVELOPER_OPERATIONS_WEBHOOK_PROJECTION_FAILED");
      const projectionState = await supabaseAdmin
        .from("developer_operations_webhook_projections")
        .select("attempt")
        .eq("operations_event_id", row.operations_event_id)
        .maybeSingle();
      const attempt = Number(projectionState.data?.attempt || 1);
      const deadLetter = attempt >= 20;
      try {
        await settleOperationsWebhookProjection({
          operationsEventId: row.operations_event_id,
          leaseToken: row.lease_token,
          status: deadLetter ? "DEAD_LETTER" : "FAILED",
          error: message,
          retry: !deadLetter,
        });
      } catch (settleError) {
        console.error("DEVELOPER_OPERATIONS_WEBHOOK_PROJECTION_SETTLE_FAILED", settleError?.message || settleError);
      }
      results.push({
        operations_event_id: row.operations_event_id,
        status: deadLetter ? "DEAD_LETTER" : "FAILED",
        error: message,
      });
    }
  }

  return {
    success: results.every((item) => ["PROJECTED", "SKIPPED"].includes(item.status)),
    claimed_count: rows.length,
    projected_count: results.filter((item) => item.status === "PROJECTED").length,
    skipped_count: results.filter((item) => item.status === "SKIPPED").length,
    failed_count: results.filter((item) => item.status === "FAILED").length,
    dead_letter_count: results.filter((item) => item.status === "DEAD_LETTER").length,
    results,
  };
}

export async function replayDeveloperWebhookDelivery({
  organizationId,
  deliveryId,
  replayKey,
  confirmation,
}) {
  const key = String(replayKey || "").trim();
  if (key.length < 8 || key.length > 200) {
    throw new Error("DEVELOPER_WEBHOOK_REPLAY_KEY_INVALID");
  }

  const originalResult = await supabaseAdmin
    .from("developer_webhook_deliveries")
    .select("id,endpoint_id,event_record_id,event_id,event_type,status")
    .eq("organization_id", organizationId)
    .eq("id", deliveryId)
    .maybeSingle();
  if (originalResult.error) throw originalResult.error;
  const original = originalResult.data;
  if (!original) throw new Error("DEVELOPER_WEBHOOK_DELIVERY_NOT_FOUND");
  const expectedConfirmation = `REPLAY ${original.event_id}`;
  if (String(confirmation || "").trim() !== expectedConfirmation) {
    throw new Error(`DEVELOPER_WEBHOOK_REPLAY_CONFIRMATION_REQUIRED:${expectedConfirmation}`);
  }
  if (!original.event_record_id) throw new Error("DEVELOPER_WEBHOOK_EVENT_NOT_REPLAYABLE");
  if (!["DELIVERED", "FAILED"].includes(String(original.status || ""))) {
    throw new Error("DEVELOPER_WEBHOOK_DELIVERY_NOT_SETTLED");
  }

  const existing = await supabaseAdmin
    .from("developer_webhook_deliveries")
    .select("id,endpoint_id,event_id,event_type,status,attempt,response_status,error,next_attempt_at,created_at,delivered_at,replay_of_delivery_id,replay_key")
    .eq("organization_id", organizationId)
    .eq("replay_key", key)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) {
    if (existing.data.replay_of_delivery_id !== original.id) {
      throw new Error("DEVELOPER_WEBHOOK_REPLAY_KEY_CONFLICT");
    }
    return {
      replayed: true,
      reused: true,
      source_delivery_id: original.id,
      delivery_id: existing.data.id,
      delivered: existing.data.status === "DELIVERED",
      status: existing.data.response_status || null,
      attempt: existing.data.attempt,
      delivery_status: existing.data.status,
      next_attempt_at: existing.data.next_attempt_at || null,
    };
  }

  const endpoint = await activeEndpoint({ organizationId, endpointId: original.endpoint_id });
  if (!endpoint) throw new Error("DEVELOPER_WEBHOOK_ENDPOINT_INACTIVE");

  const eventResult = await supabaseAdmin
    .from("developer_webhook_events")
    .select("id,environment_id,event_id,event_type,payload,expires_at")
    .eq("organization_id", organizationId)
    .eq("id", original.event_record_id)
    .maybeSingle();
  if (eventResult.error) throw eventResult.error;
  const event = eventResult.data;
  if (!event) throw new Error("DEVELOPER_WEBHOOK_EVENT_NOT_FOUND");
  if (event.environment_id && event.environment_id !== endpoint.environment_id) {
    throw new Error("DEVELOPER_WEBHOOK_ENVIRONMENT_MISMATCH");
  }
  if (new Date(event.expires_at).getTime() <= Date.now()) {
    throw new Error("DEVELOPER_WEBHOOK_EVENT_EXPIRED");
  }

  const body = JSON.stringify(event.payload);
  const inserted = await supabaseAdmin
    .from("developer_webhook_deliveries")
    .insert({
      organization_id: organizationId,
      endpoint_id: endpoint.id,
      event_record_id: event.id,
      event_id: event.event_id,
      event_type: event.event_type,
      status: "PENDING",
      attempt: 1,
      payload_hash: payloadHash(body),
      replay_of_delivery_id: original.id,
      replay_key: key,
    })
    .select("id")
    .single();

  if (inserted.error) {
    if (inserted.error.code === "23505") {
      const raced = await supabaseAdmin
        .from("developer_webhook_deliveries")
        .select("id,status,attempt,response_status,next_attempt_at,replay_of_delivery_id")
        .eq("organization_id", organizationId)
        .eq("replay_key", key)
        .single();
      if (raced.error) throw raced.error;
      if (raced.data.replay_of_delivery_id !== original.id) {
        throw new Error("DEVELOPER_WEBHOOK_REPLAY_KEY_CONFLICT");
      }
      return {
        replayed: true,
        reused: true,
        source_delivery_id: original.id,
        delivery_id: raced.data.id,
        delivered: raced.data.status === "DELIVERED",
        status: raced.data.response_status || null,
        attempt: raced.data.attempt,
        delivery_status: raced.data.status,
        next_attempt_at: raced.data.next_attempt_at || null,
      };
    }
    throw inserted.error;
  }

  try {
    const sent = await sendStoredEvent({
      organizationId,
      endpoint,
      event,
      deliveryId: inserted.data.id,
      attempt: 1,
    });
    return {
      replayed: true,
      reused: false,
      source_delivery_id: original.id,
      ...sent,
    };
  } catch (error) {
    const failed = await recordDeliveryFailure({
      organizationId,
      deliveryId: inserted.data.id,
      error,
      attempt: 1,
    });
    return {
      replayed: true,
      reused: false,
      source_delivery_id: original.id,
      endpoint_id: endpoint.id,
      ...failed,
    };
  }
}

export async function retryDeveloperWebhookDelivery({
  organizationId,
  deliveryId,
  leaseToken = null,
}) {
  const deliveryResult = await supabaseAdmin
    .from("developer_webhook_deliveries")
    .select("id,endpoint_id,event_record_id,event_id,event_type,status,attempt,retry_lease_token,retry_lease_expires_at")
    .eq("organization_id", organizationId)
    .eq("id", deliveryId)
    .maybeSingle();
  if (deliveryResult.error) throw deliveryResult.error;
  const delivery = deliveryResult.data;
  if (!delivery) throw new Error("DEVELOPER_WEBHOOK_DELIVERY_NOT_FOUND");
  if (!delivery.event_record_id) throw new Error("DEVELOPER_WEBHOOK_EVENT_NOT_REPLAYABLE");
  if (Number(delivery.attempt || 0) >= MAX_WEBHOOK_ATTEMPTS) {
    throw new Error("DEVELOPER_WEBHOOK_MAX_ATTEMPTS_REACHED");
  }

  const leased = Boolean(leaseToken);
  if (leased) {
    if (
      delivery.status !== "RETRYING" ||
      String(delivery.retry_lease_token || "") !== String(leaseToken) ||
      !delivery.retry_lease_expires_at ||
      new Date(delivery.retry_lease_expires_at).getTime() <= Date.now()
    ) {
      throw new Error("DEVELOPER_WEBHOOK_RETRY_LEASE_INVALID");
    }
  } else if (delivery.status !== "FAILED") {
    throw new Error("DEVELOPER_WEBHOOK_DELIVERY_NOT_FAILED");
  }

  const endpoint = await activeEndpoint({ organizationId, endpointId: delivery.endpoint_id });
  if (!endpoint) throw new Error("DEVELOPER_WEBHOOK_ENDPOINT_INACTIVE");

  const eventResult = await supabaseAdmin
    .from("developer_webhook_events")
    .select("id,environment_id,event_id,event_type,payload,expires_at")
    .eq("organization_id", organizationId)
    .eq("id", delivery.event_record_id)
    .maybeSingle();
  if (eventResult.error) throw eventResult.error;
  const event = eventResult.data;
  if (!event) throw new Error("DEVELOPER_WEBHOOK_EVENT_NOT_FOUND");
  if (event.environment_id && event.environment_id !== endpoint.environment_id) {
    throw new Error("DEVELOPER_WEBHOOK_ENVIRONMENT_MISMATCH");
  }
  if (new Date(event.expires_at).getTime() <= Date.now()) {
    throw new Error("DEVELOPER_WEBHOOK_EVENT_EXPIRED");
  }

  const attempt = Number(delivery.attempt || 0) + 1;
  let marking = supabaseAdmin
    .from("developer_webhook_deliveries")
    .update({
      status: "RETRYING",
      attempt,
      response_status: null,
      error: null,
      delivered_at: null,
      next_attempt_at: null,
    })
    .eq("organization_id", organizationId)
    .eq("id", delivery.id);

  if (leased) {
    marking = marking.eq("retry_lease_token", leaseToken);
  } else {
    marking = marking.eq("status", "FAILED");
  }
  const marked = await marking.select("id").maybeSingle();
  if (marked.error) throw marked.error;
  if (!marked.data) throw new Error("DEVELOPER_WEBHOOK_RETRY_CLAIM_LOST");

  try {
    return await sendStoredEvent({
      organizationId,
      endpoint,
      event,
      deliveryId: delivery.id,
      attempt,
    });
  } catch (error) {
    return recordDeliveryFailure({
      organizationId,
      deliveryId: delivery.id,
      error,
      attempt,
    });
  }
}

export async function processDueDeveloperWebhookRetries({ limit = 25 } = {}) {
  const claimed = await supabaseAdmin.rpc("claim_due_developer_webhook_retries", {
    p_limit: Math.max(1, Math.min(100, Number(limit) || 25)),
    p_lease_seconds: 90,
  });
  if (claimed.error) throw claimed.error;

  const rows = claimed.data || [];
  const results = [];
  for (const row of rows) {
    try {
      results.push(await retryDeveloperWebhookDelivery({
        organizationId: row.organization_id,
        deliveryId: row.delivery_id,
        leaseToken: row.lease_token,
      }));
    } catch (error) {
      const message = String(error?.message || "DEVELOPER_WEBHOOK_RETRY_WORKER_FAILED").slice(0, 500);
      const released = await supabaseAdmin
        .from("developer_webhook_deliveries")
        .update({
          status: "FAILED",
          error: message,
          next_attempt_at: null,
          retry_lease_token: null,
          retry_lease_expires_at: null,
        })
        .eq("organization_id", row.organization_id)
        .eq("id", row.delivery_id)
        .eq("retry_lease_token", row.lease_token);
      if (released.error) {
        console.error("DEVELOPER_WEBHOOK_RETRY_LEASE_RELEASE_FAILED", released.error.message);
      }
      results.push({
        delivery_id: row.delivery_id,
        delivered: false,
        retry_scheduled: false,
        error: message,
      });
    }
  }

  return {
    success: results.every((item) => item.delivered || item.retry_scheduled),
    claimed_count: rows.length,
    delivered_count: results.filter((item) => item.delivered).length,
    retry_scheduled_count: results.filter((item) => item.retry_scheduled).length,
    failed_count: results.filter((item) => !item.delivered && !item.retry_scheduled).length,
    results,
  };
}
