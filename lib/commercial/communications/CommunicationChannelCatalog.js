const CHANNELS = {
  internal: {
    family: "internal",
    label: "Internal",
    sendable: true,
  },
  whatsapp: {
    family: "whatsapp",
    label: "WhatsApp",
    sendable: true,
    serviceId: "whatsapp",
    capability: "communication.whatsapp.send",
  },
  line: {
    family: "line",
    label: "LINE",
    sendable: true,
    serviceId: "line",
    capability: "communication.line.send",
  },
  facebook_messenger: {
    family: "messenger",
    label: "Messenger",
    sendable: true,
    serviceId: "facebook",
    capability: "communication.facebook.messenger.send",
  },
  instagram_messaging: {
    family: "instagram",
    label: "Instagram",
    sendable: true,
    serviceId: "instagram",
    capability: "communication.instagram.send",
  },
  email_google: {
    family: "email",
    label: "Email",
    sendable: false,
  },
  email_microsoft: {
    family: "email",
    label: "Email",
    sendable: false,
  },
  email_imap: {
    family: "email",
    label: "Email",
    sendable: false,
  },
  meta: {
    family: "messenger",
    label: "Messenger / Meta",
    sendable: false,
  },
  threads: {
    family: "threads",
    label: "Threads",
    sendable: false,
  },
  linkedin: {
    family: "linkedin",
    label: "LinkedIn",
    sendable: false,
  },
  tiktok: {
    family: "tiktok",
    label: "TikTok",
    sendable: false,
  },
  x: {
    family: "x",
    label: "X",
    sendable: false,
  },
};

export function communicationChannelDescriptor(provider) {
  const key = String(provider || "").trim().toLowerCase();
  return {
    provider: key,
    family: CHANNELS[key]?.family || key || "channel",
    label: CHANNELS[key]?.label || provider || "Channel",
    sendable: CHANNELS[key]?.sendable === true,
    serviceId: CHANNELS[key]?.serviceId || null,
    capability: CHANNELS[key]?.capability || null,
  };
}

export function communicationFilterOptions() {
  const seen = new Set();
  const rows = [{ id: "all", label: "All" }];
  for (const channel of Object.values(CHANNELS)) {
    if (seen.has(channel.family)) continue;
    seen.add(channel.family);
    rows.push({ id: channel.family, label: channel.label });
  }
  return rows;
}
