import {
  createServiceUsageRecord,
} from "./documents/ServiceUsageRecord";

import * as Repository
from "./repositories/ServiceUsageRepository";

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
    return Repository.update(
      usage_id,
      {
        status: "SUCCESS",
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
      }
    );
  },

  async fail({
    usage_id,
    error,
    latency_ms = null,
    metadata = {},
  }) {
    return Repository.update(
      usage_id,
      {
        status: "FAILED",
        latency_ms,
        error_message:
          error?.message ||
          String(error || "Unknown error"),
        metadata,
      }
    );
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
