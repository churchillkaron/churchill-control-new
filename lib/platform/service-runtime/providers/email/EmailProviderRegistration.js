import { PROVIDER_REGISTRY } from "../ProviderRegistry.js";

const CAPABILITIES = [
  "communication.email.send",
];

PROVIDER_REGISTRY.email_google = {
  id: "email_google",
  connectionModel: "oauth",
  name: "Google Mail",
  category: "communication",
  capabilities: CAPABILITIES,
  countries: ["*"],
  currencies: ["*"],
  runtime: "email_google",
  runtimeAvailable: true,
  active: true,
  metadata: {
    customer_provider_account_required: true,
    supplier_billing_required: false,
  },
};

PROVIDER_REGISTRY.email_microsoft = {
  id: "email_microsoft",
  connectionModel: "oauth",
  name: "Microsoft Mail",
  category: "communication",
  capabilities: CAPABILITIES,
  countries: ["*"],
  currencies: ["*"],
  runtime: "email_microsoft",
  runtimeAvailable: true,
  active: true,
  metadata: {
    customer_provider_account_required: true,
    supplier_billing_required: false,
  },
};

PROVIDER_REGISTRY.email_imap = {
  id: "email_imap",
  connectionModel: "customer_credentials",
  name: "IMAP / SMTP Mail",
  category: "communication",
  capabilities: CAPABILITIES,
  countries: ["*"],
  currencies: ["*"],
  runtime: "email_imap",
  runtimeAvailable: true,
  active: true,
  metadata: {
    customer_provider_account_required: true,
    supplier_billing_required: false,
  },
};
