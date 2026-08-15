import { listActiveByProvider } from "@/lib/platform/service-runtime/credentials/repositories/CredentialRepository";
import { registerProviderCredentialResolver } from "@/lib/platform/service-runtime/providers/ProviderCredentialRuntime";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function parseSecret(reference) {
  const raw = text(reference);
  if (!raw) return {};
  if (raw.toLowerCase().startsWith("env:")) {
    const envName = raw.slice(4).trim();
    const resolved = text(process.env[envName]);
    if (!resolved) return {};
    try {
      return JSON.parse(resolved);
    } catch {
      return { access_token: resolved };
    }
  }
  try {
    return JSON.parse(raw);
  } catch {
    return { access_token: raw };
  }
}

async function selectedCredential({ provider, organization_id, credential_id, purpose }) {
  const rows = await listActiveByProvider(provider);
  return rows
    .filter((row) => {
      const metadata = object(row.metadata);
      return (
        text(metadata.organization_id) === text(organization_id) &&
        text(metadata.purpose).toUpperCase() === purpose &&
        metadata.enabled !== false &&
        (!credential_id || text(row.id) === text(credential_id))
      );
    })
    .sort(
      (a, b) =>
        new Date(b.updated_at || b.created_at || 0) -
        new Date(a.updated_at || a.created_at || 0),
    )[0] || null;
}

registerProviderCredentialResolver(
  "email_google",
  async ({ organization_id, credential_id = null }) => {
    const row = await selectedCredential({
      provider: "email_google",
      organization_id,
      credential_id,
      purpose: "ORGANIZATION_GOOGLE_MAILBOX",
    });
    if (!row) return null;
    const metadata = object(row.metadata);
    return {
      credential_id: row.id,
      ...parseSecret(row.secret_reference),
      email: metadata.email || null,
      managed_by: "ORGANIZATION",
      credential_purpose: "ORGANIZATION_GOOGLE_MAILBOX",
    };
  },
);

registerProviderCredentialResolver(
  "email_microsoft",
  async ({ organization_id, credential_id = null }) => {
    const row = await selectedCredential({
      provider: "email_microsoft",
      organization_id,
      credential_id,
      purpose: "ORGANIZATION_MICROSOFT_MAILBOX",
    });
    if (!row) return null;
    const metadata = object(row.metadata);
    return {
      credential_id: row.id,
      ...parseSecret(row.secret_reference),
      email: metadata.email || null,
      external_account_id: metadata.external_account_id || null,
      managed_by: "ORGANIZATION",
      credential_purpose: "ORGANIZATION_MICROSOFT_MAILBOX",
    };
  },
);

registerProviderCredentialResolver(
  "email_imap",
  async ({ organization_id, credential_id = null }) => {
    const row = await selectedCredential({
      provider: "email_imap",
      organization_id,
      credential_id,
      purpose: "ORGANIZATION_IMAP_SMTP_MAILBOX",
    });
    if (!row) return null;
    const metadata = object(row.metadata);
    return {
      credential_id: row.id,
      ...parseSecret(row.secret_reference),
      email: metadata.email || null,
      managed_by: "ORGANIZATION",
      credential_purpose: "ORGANIZATION_IMAP_SMTP_MAILBOX",
    };
  },
);
