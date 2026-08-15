import {
  create,
  listByOrganization,
} from "../repositories/ProviderEventRepository";
import {
  AttributionRuntime,
} from "@/lib/platform/service-runtime/attribution/runtime/AttributionRuntime";
import {
  CustomerIdentityRuntime,
} from "@/lib/platform/service-runtime/identity/runtime/CustomerIdentityRuntime";

async function attributeProviderEvent({
  event,
  organization_id,
  provider_id,
  external_event_id = null,
  customer_reference = null,
  event_type,
  value = 0,
  currency = null,
  payload = {},
  order_id = null,
  invoice_id = null,
}) {
  if (!event?.id || event?.duplicate === true) return null;

  let identity = null;
  if (customer_reference) {
    identity = await CustomerIdentityRuntime.resolve({
      organization_id,
      provider_id,
      external_id: customer_reference,
    }).catch(() => null);
  }

  return AttributionRuntime.record({
    organization_id,
    provider_event_id: event.id,
    provider_id,
    source_type: "PROVIDER",
    source_id: external_event_id,
    party_id: identity?.party_id || null,
    lead_id: identity?.lead_id || null,
    order_id,
    invoice_id,
    event_type,
    value,
    currency,
    metadata: payload,
  });
}

export const ProviderEventRuntime = {
  async ingest({
    organization_id,
    connection_id = null,
    provider_id,
    asset_id = null,
    event_type,
    external_event_id = null,
    customer_reference = null,
    value = 0,
    currency = null,
    payload = {},
  }) {
    return create({
      organization_id,
      connection_id,
      provider_id,
      asset_id,
      event_type,
      external_event_id,
      customer_reference,
      value,
      currency,
      payload,
    });
  },

  async attribute(args) {
    return attributeProviderEvent(args);
  },

  async record(args) {
    const event = await this.ingest(args);
    await attributeProviderEvent({ ...args, event });
    return event;
  },

  async organization(organization_id) {
    return listByOrganization(organization_id);
  },
};
