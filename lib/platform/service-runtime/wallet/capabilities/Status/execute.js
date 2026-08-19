import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { WalletRepository } from "@/lib/platform/service-runtime/wallet/repositories/WalletRepository";

function text(value) {
  return String(value ?? "").trim();
}

function decimal(value) {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

export const manifest = defineCapability({
  domain: "services",
  capability: "wallet",
  action: "status",
  name: "Service Wallet Status",
  document: "service_wallet",
  description:
    "Read the current organization-scoped prepaid Services wallet balance and operating status without changing funds or billing policy.",
  permissions: ["services.wallet.read"],
  events: [],
  tags: [
    "services",
    "wallet",
    "balance",
    "billing",
    "prepaid",
    "status",
    "read",
  ],
  operatorAliases: [
    "service wallet",
    "wallet balance",
    "service balance",
    "service credit",
    "prepaid balance",
    "available service credit",
  ],
  operatorExamples: [
    "What is our service wallet balance?",
    "How much service credit do we have?",
    "Is our prepaid service wallet active?",
  ],
  transactional: false,
  aiEnabled: false,
  operatorEnabled: true,
  operatorMode: "read",
  operatorAutoExecute: true,
  operatorRequiresConfirmation: false,
  reversible: true,
  risk: "low",
  contextScope: "organization",
  inputSchema: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    properties: {
      wallet_exists: { type: "boolean" },
      currency: { type: ["string", "null"] },
      available_balance: { type: ["string", "null"] },
      reserved_balance: { type: ["string", "null"] },
      status: { type: ["string", "null"] },
      billing_policy: { type: ["string", "null"] },
      wallet_type: { type: ["string", "null"] },
      auto_topup: { type: ["boolean", "null"] },
      has_available_balance: { type: "boolean" },
      updated_at: { type: ["string", "null"] },
    },
    additionalProperties: false,
  },
});

export async function execute({ context }) {
  const organizationId = text(context?.organizationId);
  if (!organizationId) {
    throw new Error("SERVICES_WALLET_STATUS_ORGANIZATION_REQUIRED");
  }

  const wallet = await WalletRepository.getByOrganization(organizationId);

  if (!wallet) {
    return {
      wallet_exists: false,
      currency: null,
      available_balance: null,
      reserved_balance: null,
      status: null,
      billing_policy: null,
      wallet_type: null,
      auto_topup: null,
      has_available_balance: false,
      updated_at: null,
    };
  }

  const available = Number(wallet.available_balance || 0);

  return {
    wallet_exists: true,
    currency: text(wallet.currency) || null,
    available_balance: decimal(wallet.available_balance),
    reserved_balance: decimal(wallet.reserved_balance),
    status: text(wallet.status) || null,
    billing_policy: text(wallet.billing_policy) || null,
    wallet_type: text(wallet.wallet_type) || null,
    auto_topup:
      typeof wallet.auto_topup === "boolean" ? wallet.auto_topup : null,
    has_available_balance: Number.isFinite(available) && available > 0,
    updated_at: text(wallet.updated_at) || null,
  };
}
