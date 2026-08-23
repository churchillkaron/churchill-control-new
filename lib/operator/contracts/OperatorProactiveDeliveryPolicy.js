const DELIVERY_LEVELS = ["watch", "important", "urgent"];
const DELIVERY_LEVEL_WEIGHT = Object.freeze({
  clear: 0,
  watch: 1,
  important: 2,
  urgent: 3,
});

export const OPERATOR_PROACTIVE_DELIVERY_CHANNELS = Object.freeze({
  email: Object.freeze({
    channel: "email",
    label: "Email",
    service_id: "email",
    capability: "communication.email.send",
    providers: Object.freeze(["email_google", "email_microsoft", "email_imap"]),
    default_provider: null,
  }),
  whatsapp: Object.freeze({
    channel: "whatsapp",
    label: "WhatsApp",
    service_id: "whatsapp",
    capability: "communication.whatsapp.send",
    providers: Object.freeze(["whatsapp"]),
    default_provider: "whatsapp",
  }),
  line: Object.freeze({
    channel: "line",
    label: "LINE",
    service_id: "line",
    capability: "communication.line.send",
    providers: Object.freeze(["line"]),
    default_provider: "line",
  }),
});

const MAX_CHANNELS = Object.keys(OPERATOR_PROACTIVE_DELIVERY_CHANNELS).length;
const SECRET_KEY_PATTERN = /(access[_-]?token|refresh[_-]?token|api[_-]?key|password|client[_-]?secret|private[_-]?key|service[_-]?role)/i;

function text(value, limit = 1200) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function normalizedChannel(value) {
  return text(value, 40).toLowerCase();
}

function normalizedProvider(value) {
  return text(value, 80).toLowerCase();
}

function normalizedLevel(value, fallback = "important") {
  const level = text(value, 40).toLowerCase();
  return DELIVERY_LEVELS.includes(level) ? level : fallback;
}

function destinationValid(channel, destination) {
  if (!destination) return false;
  if (channel === "email") {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destination) && destination.length <= 320;
  }
  if (channel === "whatsapp") {
    return /^\+?[1-9]\d{6,14}$/.test(destination);
  }
  if (channel === "line") {
    return destination.length >= 4 && destination.length <= 240;
  }
  return false;
}

function assertNoSecrets(value, path = "delivery_policy") {
  if (!value || typeof value !== "object") return;
  for (const [key, entry] of Object.entries(value)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      throw new Error(`${path}.${key} must not contain provider credentials or secrets`);
    }
    if (entry && typeof entry === "object") {
      assertNoSecrets(entry, `${path}.${key}`);
    }
  }
}

function normalizeDeliveryChannel(source = {}, { strict = false } = {}) {
  const input = object(source);
  const channel = normalizedChannel(input.channel || input.type);
  const descriptor = OPERATOR_PROACTIVE_DELIVERY_CHANNELS[channel] || null;
  if (!descriptor) {
    if (strict) throw new Error(`Unsupported proactive delivery channel: ${channel || "unknown"}`);
    return null;
  }

  const destination = text(input.destination || input.recipient, 320);
  if (!destinationValid(channel, destination)) {
    if (strict) throw new Error(`A valid ${descriptor.label} destination is required`);
    return null;
  }

  const requestedProvider = normalizedProvider(input.provider_id || input.providerId);
  const providerId = requestedProvider || descriptor.default_provider;
  if (!providerId || !descriptor.providers.includes(providerId)) {
    if (strict) {
      throw new Error(
        `${descriptor.label} requires an explicitly supported provider${descriptor.providers.length ? ` (${descriptor.providers.join(", ")})` : ""}`,
      );
    }
    return null;
  }

  return {
    channel,
    provider_id: providerId,
    destination,
    minimum_level: normalizedLevel(input.minimum_level || input.minimumLevel),
    enabled: input.enabled !== false,
  };
}

export function normalizeOperatorProactiveDeliveryPolicySource(
  source = {},
  { strict = false } = {},
) {
  const input = object(source);
  if (strict) assertNoSecrets(input);

  const seen = new Set();
  const channels = [];
  for (const row of list(input.channels).slice(0, MAX_CHANNELS * 2)) {
    const normalized = normalizeDeliveryChannel(row, { strict });
    if (!normalized || seen.has(normalized.channel)) {
      if (strict && normalized && seen.has(normalized.channel)) {
        throw new Error(`Only one ${normalized.channel} proactive delivery destination may be configured`);
      }
      continue;
    }
    seen.add(normalized.channel);
    channels.push(normalized);
    if (channels.length >= MAX_CHANNELS) break;
  }

  const enabled = input.enabled === true;
  if (strict && enabled && !channels.some((channel) => channel.enabled !== false)) {
    throw new Error("At least one explicit proactive delivery channel is required before offline alerts can be enabled");
  }

  return {
    version: 1,
    enabled,
    channels,
    default_minimum_level: normalizedLevel(
      input.default_minimum_level || input.defaultMinimumLevel,
    ),
    explicit_owner_opt_in: enabled && channels.some((channel) => channel.enabled !== false),
    automatic_recipient_inference: false,
  };
}

export function normalizeOperatorProactiveDeliveryPolicy(projectState = {}) {
  return normalizeOperatorProactiveDeliveryPolicySource(
    object(projectState?.business_watch?.delivery_policy),
  );
}

export function operatorProactiveDeliveryPublicPolicy(projectState = {}, { revealDestinations = false } = {}) {
  const policy = normalizeOperatorProactiveDeliveryPolicy(projectState);
  return {
    ...policy,
    channels: policy.channels.map((channel) => ({
      ...channel,
      destination: revealDestinations
        ? channel.destination
        : maskOperatorProactiveDeliveryDestination(channel.channel, channel.destination),
    })),
  };
}

export function operatorProactiveDeliveryChannelDescriptor(channel) {
  return OPERATOR_PROACTIVE_DELIVERY_CHANNELS[normalizedChannel(channel)] || null;
}

export function operatorProactiveDeliveryLevelEligible(alertLevel, minimumLevel = "important") {
  const alert = DELIVERY_LEVEL_WEIGHT[text(alertLevel, 40).toLowerCase()] ?? 0;
  const minimum = DELIVERY_LEVEL_WEIGHT[normalizedLevel(minimumLevel)] ?? DELIVERY_LEVEL_WEIGHT.important;
  return alert >= minimum;
}

export function maskOperatorProactiveDeliveryDestination(channel, destination) {
  const value = text(destination, 320);
  if (!value) return "";
  if (channel === "email") {
    const [local, domain] = value.split("@");
    if (!domain) return "••••";
    const visible = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
    return `${visible}${"•".repeat(Math.max(2, Math.min(8, local.length - visible.length)))}@${domain}`;
  }
  if (channel === "whatsapp") {
    const prefix = value.startsWith("+") ? "+" : "";
    const digits = value.replace(/\D/g, "");
    return `${prefix}${"•".repeat(Math.max(4, digits.length - 4))}${digits.slice(-4)}`;
  }
  return value.length <= 8 ? `${value.slice(0, 2)}••••` : `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

export function operatorProactiveDeliveryChannelCatalog() {
  return Object.values(OPERATOR_PROACTIVE_DELIVERY_CHANNELS).map((channel) => ({
    channel: channel.channel,
    label: channel.label,
    service_id: channel.service_id,
    capability: channel.capability,
    providers: [...channel.providers],
  }));
}
