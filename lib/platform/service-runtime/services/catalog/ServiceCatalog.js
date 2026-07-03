export const SERVICE_CATALOG = [
  {
    id: "ai-intelligence",
    name: "AI & Intelligence",
    description: "Business AI services used across the organization.",
    services: [
      {
        id: "image-ai",
        name: "Image AI",
        description: "Generate, edit, analyze, and transform images.",
        providers: ["openai", "flux", "imagen", "ideogram"],
        default_enabled: true,
        package: "core",
      },
      {
        id: "text-ai",
        name: "Text AI",
        description: "Writing, reasoning, summarization, classification, and agents.",
        providers: ["openai", "anthropic", "google-ai"],
        default_enabled: true,
        package: "core",
      },
      {
        id: "voice-ai",
        name: "Voice AI",
        description: "Speech, transcription, voice agents, and audio workflows.",
        providers: ["openai", "elevenlabs", "google-ai"],
        default_enabled: false,
        package: "growth",
      },
      {
        id: "translation",
        name: "Translation",
        description: "Translate business documents, messages, and workflows.",
        providers: ["openai", "google-translate", "deepl"],
        default_enabled: true,
        package: "core",
      },
      {
        id: "ocr",
        name: "OCR",
        description: "Extract structured data from receipts, invoices, menus, IDs, and documents.",
        providers: ["openai", "google-vision", "aws-textract"],
        default_enabled: true,
        package: "core",
      },
      {
        id: "video-ai",
        name: "Video AI",
        description: "Generate and edit video assets for marketing and operations.",
        providers: ["openai", "runway", "pika", "kling"],
        default_enabled: false,
        package: "growth",
      },
    ],
  },
  {
    id: "marketing-social",
    name: "Marketing & Social",
    description: "Marketing channels, publishing, campaigns, reviews, and social automation.",
    services: [
      {
        id: "facebook",
        name: "Facebook",
        description: "Facebook pages, posts, comments, campaigns, and insights.",
        providers: ["meta"],
        default_enabled: true,
        package: "core",
      },
      {
        id: "instagram",
        name: "Instagram",
        description: "Instagram publishing, media, comments, campaigns, and insights.",
        providers: ["meta"],
        default_enabled: true,
        package: "core",
      },
      {
        id: "google-business",
        name: "Google Business",
        description: "Google Business Profile posts, reviews, photos, and local visibility.",
        providers: ["google-business"],
        default_enabled: true,
        package: "core",
      },
      {
        id: "tripadvisor",
        name: "Tripadvisor",
        description: "Review monitoring and hospitality reputation workflows.",
        providers: ["tripadvisor"],
        default_enabled: false,
        package: "growth",
      },
    ],
  },
  {
    id: "communication",
    name: "Communication",
    description: "Customer and staff communication channels.",
    services: [
      {
        id: "whatsapp",
        name: "WhatsApp",
        description: "WhatsApp messages, templates, customer service, and automation.",
        providers: ["meta-whatsapp", "twilio"],
        default_enabled: true,
        package: "core",
      },
      {
        id: "line",
        name: "LINE",
        description: "LINE messaging for customers, staff, and local market workflows.",
        providers: ["line"],
        default_enabled: true,
        package: "core",
      },
      {
        id: "telegram",
        name: "Telegram",
        description: "Telegram notifications, bots, and internal automation.",
        providers: ["telegram"],
        default_enabled: false,
        package: "growth",
      },
      {
        id: "email",
        name: "Email",
        description: "Transactional email, campaigns, notifications, and document delivery.",
        providers: ["resend", "sendgrid", "gmail"],
        default_enabled: true,
        package: "core",
      },
      {
        id: "sms",
        name: "SMS",
        description: "SMS alerts, OTP, booking reminders, and customer notifications.",
        providers: ["twilio"],
        default_enabled: false,
        package: "growth",
      },
    ],
  },
  {
    id: "payments",
    name: "Payments",
    description: "Payment acceptance, payouts, reconciliation, and payment automation.",
    services: [
      {
        id: "card-payments",
        name: "Card Payments",
        description: "Card payment processing and checkout.",
        providers: ["stripe"],
        default_enabled: false,
        package: "growth",
      },
      {
        id: "payment-links",
        name: "Payment Links",
        description: "Create payment links for invoices, bookings, and deposits.",
        providers: ["stripe"],
        default_enabled: false,
        package: "growth",
      },
    ],
  },
  {
    id: "travel-booking",
    name: "Travel & Booking",
    description: "Hotel, restaurant, reservation, and travel distribution channels.",
    services: [
      {
        id: "booking-platforms",
        name: "Booking Platforms",
        description: "Booking.com, Agoda, Expedia, and OTA integrations.",
        providers: ["booking-com", "agoda", "expedia"],
        default_enabled: false,
        package: "hotel",
      },
      {
        id: "google-hotels",
        name: "Google Hotels",
        description: "Google Hotels visibility, rates, and booking links.",
        providers: ["google-hotels"],
        default_enabled: false,
        package: "hotel",
      },
    ],
  },
  {
    id: "storage",
    name: "Storage",
    description: "Files, documents, media, backups, and object storage.",
    services: [
      {
        id: "business-files",
        name: "Business Files",
        description: "Store business documents, files, images, and generated assets.",
        providers: ["supabase-storage", "google-drive", "s3"],
        default_enabled: true,
        package: "core",
      },
    ],
  },
  {
    id: "identity",
    name: "Identity",
    description: "Authentication, SSO, user identity, and access management.",
    services: [
      {
        id: "sso",
        name: "SSO",
        description: "Single sign-on and identity federation.",
        providers: ["google", "microsoft"],
        default_enabled: false,
        package: "enterprise",
      },
    ],
  },
  {
    id: "commerce",
    name: "Commerce",
    description: "Online stores, checkout, products, orders, and commerce automation.",
    services: [
      {
        id: "online-store",
        name: "Online Store",
        description: "Shopify, WooCommerce, and custom commerce channels.",
        providers: ["shopify", "woocommerce"],
        default_enabled: false,
        package: "growth",
      },
    ],
  },
  {
    id: "accounting",
    name: "Accounting",
    description: "Accounting integrations, billing exports, tax data, and finance automation.",
    services: [
      {
        id: "accounting-sync",
        name: "Accounting Sync",
        description: "Sync invoices, payments, journals, and accounting documents.",
        providers: ["xero", "quickbooks"],
        default_enabled: false,
        package: "growth",
      },
    ],
  },
  {
    id: "crm",
    name: "CRM",
    description: "Customer records, sales pipelines, support, and lifecycle automation.",
    services: [
      {
        id: "crm-sync",
        name: "CRM Sync",
        description: "Sync customers, contacts, leads, and CRM activities.",
        providers: ["hubspot", "salesforce"],
        default_enabled: false,
        package: "growth",
      },
    ],
  },
  {
    id: "automation",
    name: "Automation",
    description: "Workflow automation, webhooks, tasks, and operational triggers.",
    services: [
      {
        id: "webhooks",
        name: "Webhooks",
        description: "Inbound and outbound webhooks for business workflows.",
        providers: ["avantiqo-webhooks", "zapier", "make"],
        default_enabled: true,
        package: "core",
      },
    ],
  },
  {
    id: "productivity",
    name: "Productivity",
    description: "Documents, calendars, email, tasks, and office productivity.",
    services: [
      {
        id: "google-workspace",
        name: "Google Workspace",
        description: "Gmail, Calendar, Drive, Docs, and Workspace automation.",
        providers: ["google-workspace"],
        default_enabled: false,
        package: "growth",
      },
      {
        id: "microsoft-365",
        name: "Microsoft 365",
        description: "Outlook, Teams, OneDrive, SharePoint, and Microsoft automation.",
        providers: ["microsoft-365"],
        default_enabled: false,
        package: "growth",
      },
    ],
  },
];

export const PROVIDER_CATALOG = {
  openai: { id: "openai", name: "OpenAI", auth_type: "api_key" },
  anthropic: { id: "anthropic", name: "Anthropic", auth_type: "api_key" },
  "google-ai": { id: "google-ai", name: "Google AI", auth_type: "api_key" },
  flux: { id: "flux", name: "Flux", auth_type: "api_key" },
  imagen: { id: "imagen", name: "Imagen", auth_type: "api_key" },
  ideogram: { id: "ideogram", name: "Ideogram", auth_type: "api_key" },
  elevenlabs: { id: "elevenlabs", name: "ElevenLabs", auth_type: "api_key" },
  "google-translate": { id: "google-translate", name: "Google Translate", auth_type: "api_key" },
  deepl: { id: "deepl", name: "DeepL", auth_type: "api_key" },
  "google-vision": { id: "google-vision", name: "Google Vision", auth_type: "service_account" },
  "aws-textract": { id: "aws-textract", name: "AWS Textract", auth_type: "api_key" },
  runway: { id: "runway", name: "Runway", auth_type: "api_key" },
  pika: { id: "pika", name: "Pika", auth_type: "api_key" },
  kling: { id: "kling", name: "Kling", auth_type: "api_key" },
  meta: { id: "meta", name: "Meta", auth_type: "oauth" },
  "meta-whatsapp": { id: "meta-whatsapp", name: "Meta WhatsApp", auth_type: "oauth" },
  "google-business": { id: "google-business", name: "Google Business", auth_type: "oauth" },
  tripadvisor: { id: "tripadvisor", name: "Tripadvisor", auth_type: "oauth" },
  line: { id: "line", name: "LINE", auth_type: "oauth" },
  telegram: { id: "telegram", name: "Telegram", auth_type: "bot_token" },
  resend: { id: "resend", name: "Resend", auth_type: "api_key" },
  sendgrid: { id: "sendgrid", name: "SendGrid", auth_type: "api_key" },
  gmail: { id: "gmail", name: "Gmail", auth_type: "oauth" },
  twilio: { id: "twilio", name: "Twilio", auth_type: "api_key" },
  stripe: { id: "stripe", name: "Stripe", auth_type: "oauth_or_api_key" },
  "booking-com": { id: "booking-com", name: "Booking.com", auth_type: "partner" },
  agoda: { id: "agoda", name: "Agoda", auth_type: "partner" },
  expedia: { id: "expedia", name: "Expedia", auth_type: "partner" },
  "google-hotels": { id: "google-hotels", name: "Google Hotels", auth_type: "oauth" },
  "supabase-storage": { id: "supabase-storage", name: "Supabase Storage", auth_type: "platform_managed" },
  "google-drive": { id: "google-drive", name: "Google Drive", auth_type: "oauth" },
  s3: { id: "s3", name: "Amazon S3", auth_type: "api_key" },
  google: { id: "google", name: "Google", auth_type: "oauth" },
  microsoft: { id: "microsoft", name: "Microsoft", auth_type: "oauth" },
  shopify: { id: "shopify", name: "Shopify", auth_type: "oauth" },
  woocommerce: { id: "woocommerce", name: "WooCommerce", auth_type: "api_key" },
  xero: { id: "xero", name: "Xero", auth_type: "oauth" },
  quickbooks: { id: "quickbooks", name: "QuickBooks", auth_type: "oauth" },
  hubspot: { id: "hubspot", name: "HubSpot", auth_type: "oauth" },
  salesforce: { id: "salesforce", name: "Salesforce", auth_type: "oauth" },
  "avantiqo-webhooks": { id: "avantiqo-webhooks", name: "Avantiqo Webhooks", auth_type: "platform_managed" },
  zapier: { id: "zapier", name: "Zapier", auth_type: "oauth" },
  make: { id: "make", name: "Make", auth_type: "oauth" },
  "google-workspace": { id: "google-workspace", name: "Google Workspace", auth_type: "oauth" },
  "microsoft-365": { id: "microsoft-365", name: "Microsoft 365", auth_type: "oauth" },
};

export function getServiceCategory(categoryId) {
  return SERVICE_CATALOG.find((category) => category.id === categoryId) || null;
}

export function getService(categoryId, serviceId) {
  const category = getServiceCategory(categoryId);
  return category?.services.find((service) => service.id === serviceId) || null;
}

export function getProvider(providerId) {
  return PROVIDER_CATALOG[providerId] || null;
}

export function flattenServiceCatalog() {
  return SERVICE_CATALOG.flatMap((category) =>
    category.services.map((service) => ({
      ...service,
      category_id: category.id,
      category_name: category.name,
    }))
  );
}
