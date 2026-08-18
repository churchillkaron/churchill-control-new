function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

const FIELD_MAP = {
  avq_oid: ["avq_oid", "organization_id", "organizationId"],
  avq_mid: ["avq_mid", "marketing_campaign_id", "marketingCampaignId"],
  avq_mmcid: ["avq_mmcid", "managed_media_campaign_id", "managedMediaCampaignId"],
  avq_pid: ["avq_pid", "provider_id", "providerId"],
  avq_pcid: ["avq_pcid", "provider_campaign_id", "providerCampaignId"],
  avq_sig: ["avq_sig", "signature", "sig"],
};

function first(source, keys) {
  for (const key of keys) {
    const value = text(source?.[key]);
    if (value) return value;
  }
  return "";
}

function normalize(source = {}) {
  const input = object(source);
  const fields = {};
  for (const [target, keys] of Object.entries(FIELD_MAP)) {
    const value = first(input, keys);
    if (value) fields[target] = value;
  }
  return fields;
}

function candidates(input = {}) {
  const payload = object(input);
  return [
    object(payload.marketing_attribution),
    object(payload.tracking),
    object(payload.attribution),
    object(payload.metadata?.marketing_attribution),
    object(payload.metadata?.tracking),
    payload,
  ];
}

export const MarketingAttributionCaptureRuntime = {
  fromObject(input = {}) {
    for (const candidate of candidates(input)) {
      const fields = normalize(candidate);
      if (fields.avq_sig || fields.avq_mid || fields.avq_oid) return fields;
    }
    return null;
  },

  fromUrl(url) {
    if (!url) return null;
    const parsed = url instanceof URL ? url : new URL(String(url));
    const fields = {};
    for (const key of Object.keys(FIELD_MAP)) {
      const value = text(parsed.searchParams.get(key));
      if (value) fields[key] = value;
    }
    return Object.keys(fields).length ? fields : null;
  },

  attach(input = {}, tracking = null) {
    const normalized = tracking ? normalize(tracking) : this.fromObject(input);
    if (!normalized) return { ...object(input) };
    return {
      ...object(input),
      marketing_attribution: normalized,
    };
  },
};
