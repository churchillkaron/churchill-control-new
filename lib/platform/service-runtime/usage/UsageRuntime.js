import {
  createServiceUsageRecord,
} from "./documents/ServiceUsageRecord";

import * as Repository
from "./repositories/ServiceUsageRepository";

const OPEN_STATUSES = ["PENDING"];
const TERMINAL_STATUSES = new Set(["SUCCESS", "FAILED"]);

async function transitionTerminal({
  usage_id,
  target_status,
  updates,
}) {
  const transitioned = await Repository.transition({
    id: usage_id,
    from_statuses: OPEN_STATUSES,
    updates: {
      ...updates,
      status: target_status,
    },
  });

  if (transitioned) return transitioned;

  const existing = await Repository.getById(usage_id);
  if (existing.status === target_status) return existing;

  if (TERMINAL_STATUSES.has(existing.status)) {
    throw new Error(
      `SERVICE_USAGE_TERMINAL_STATE_CONFLICT:${existing.status}:${target_status}`,
    );
  }

  throw new Error(
    `SERVICE_USAGE_STATE_TRANSITION_REJECTED:${existing.status}:${target_status}`,
  );
}

export const UsageRuntime = {

  async start(input = {}) {
    return Repository.create(
      createServiceUsageRecord({
        ...input,
        status: "PENDING",
        invoice_status:
          "UNBILLED",
      })
    );
  },

  async complete({
    usage_id,
    supplier_cost,
    platform_markup,
    customer_price,
    quantity,
    unit,
    latency_ms,
    metadata = {},
  }) {
    return transitionTerminal({
      usage_id,
      target_status: "SUCCESS",
      updates: {
        supplier_cost:
          Number(
            supplier_cost || 0
          ),
        platform_markup:
          Number(
            platform_markup || 0
          ),
        customer_price:
          Number(
            customer_price || 0
          ),
        quantity:
          Number(
            quantity || 1
          ),
        unit:
          unit || "request",
        latency_ms:
          latency_ms || null,
        metadata,
        error_message: null,
      },
    });
  },

  async fail({
    usage_id,
    error,
    latency_ms = null,
    metadata = {},
  }) {
    return transitionTerminal({
      usage_id,
      target_status: "FAILED",
      updates: {
        latency_ms,
        error_message:
          error?.message ||
          String(error || "Unknown error"),
        metadata,
      },
    });
  },

  async markInvoiced({
    usage_id,
    invoice_id,
    billing_invoice_line_id,
  }) {
    return Repository.update(
      usage_id,
      {
        invoice_status:
          "INVOICED",
        invoice_id,
        billing_invoice_line_id,
      }
    );
  },

  async record(input = {}) {
    return Repository.create(
      createServiceUsageRecord({
        ...input,
        status:
          input.status ||
          "SUCCESS",
      })
    );
  },

  async get(usage_id) {
    return Repository.getById(
      usage_id
    );
  },

  async organization(
    organization_id
  ) {
    return Repository.listByOrganization(
      organization_id
    );
  },

  async provider({
    organization_id,
    provider,
  }) {
    const rows =
      await Repository
        .listByOrganization(
          organization_id
        );

    return rows.filter(
      row =>
        row.provider === provider
    );
  },

  async capability({
    organization_id,
    capability,
  }) {
    const rows =
      await Repository
        .listByOrganization(
          organization_id
        );

    return rows.filter(
      row =>
        row.capability === capability
    );
  },
};
