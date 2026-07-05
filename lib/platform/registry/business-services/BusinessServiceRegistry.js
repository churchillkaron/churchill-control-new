import {
  CAPABILITY_REGISTRY as SERVICE_CAPABILITIES,
} from "../capabilities/CapabilityRegistry";


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
        requires: ["IMAGE_AI"],
        default_enabled: true,
        package: "core",
      },
      {
        id: "text-ai",
        name: "Text AI",
        description: "Writing, reasoning, summarization, classification, and agents.",
        requires: ["TEXT_AI"],
        default_enabled: true,
        package: "core",
      },
      {
        id: "voice-ai",
        name: "Voice AI",
        description: "Speech, transcription, voice agents, and audio workflows.",
        requires: ["VOICE_AI"],
        default_enabled: false,
        package: "growth",
      },
      {
        id: "translation",
        name: "Translation",
        description: "Translate business documents, messages, and workflows.",
        requires: ["TRANSLATION"],
        default_enabled: true,
        package: "core",
      },
      {
        id: "ocr",
        name: "OCR",
        description: "Extract structured data from receipts, invoices, menus, IDs, and documents.",
        requires: ["OCR"],
        default_enabled: true,
        package: "core",
      },
      {
        id: "video-ai",
        name: "Video AI",
        description: "Generate and edit video assets for marketing and operations.",
        requires: ["VIDEO_AI"],
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
        requires: ["FACEBOOK"],
        default_enabled: true,
        package: "core",
      },
      {
        id: "instagram",
        name: "Instagram",
        description: "Instagram publishing, media, comments, campaigns, and insights.",
        requires: ["INSTAGRAM"],
        default_enabled: true,
        package: "core",
      },
      {
        id: "google-business",
        name: "Google Business",
        description: "Google Business Profile posts, reviews, photos, and local visibility.",
        requires: ["GOOGLE_BUSINESS"],
        default_enabled: true,
        package: "core",
      },
      {
        id: "tripadvisor",
        name: "Tripadvisor",
        description: "Review monitoring and hospitality reputation workflows.",
        requires: ["TRIPADVISOR"],
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
        requires: ["WHATSAPP"],
        default_enabled: true,
        package: "core",
      },
      {
        id: "line",
        name: "LINE",
        description: "LINE messaging for customers, staff, and local market workflows.",
        requires: ["LINE"],
        default_enabled: true,
        package: "core",
      },
      {
        id: "telegram",
        name: "Telegram",
        description: "Telegram notifications, bots, and internal automation.",
        requires: ["TELEGRAM"],
        default_enabled: false,
        package: "growth",
      },
      {
        id: "email",
        name: "Email",
        description: "Transactional email, campaigns, notifications, and document delivery.",
        requires: ["EMAIL"],
        default_enabled: true,
        package: "core",
      },
      {
        id: "sms",
        name: "SMS",
        description: "SMS alerts, OTP, booking reminders, and customer notifications.",
        requires: ["SMS"],
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
        requires: ["CARD_PAYMENTS"],
        default_enabled: false,
        package: "growth",
      },
      {
        id: "payment-links",
        name: "Payment Links",
        description: "Create payment links for invoices, bookings, and deposits.",
        requires: ["PAYMENT_LINKS"],
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
        description: "Booking.com, Agoda, Expedia, Airbnb, and OTA integrations.",
        requires: ["BOOKING"],
        default_enabled: false,
        package: "hotel",
      },
      {
        id: "channel-manager",
        name: "Channel Manager",
        description: "Rates, inventory, availability, and booking channel distribution.",
        requires: ["CHANNEL_MANAGER"],
        default_enabled: false,
        package: "hotel",
      },
      {
        id: "google-hotels",
        name: "Google Hotels",
        description: "Google Hotels visibility, rates, and booking links.",
        requires: ["GOOGLE_HOTELS"],
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
        requires: ["STORAGE"],
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
        requires: ["SSO"],
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
        requires: ["COMMERCE"],
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
        requires: ["ACCOUNTING_SYNC"],
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
        requires: ["CRM_SYNC"],
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
        requires: ["WEBHOOKS"],
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
        id: "productivity-suite",
        name: "Productivity Suite",
        description: "Email, calendar, documents, drive, and office automation.",
        requires: ["PRODUCTIVITY"],
        default_enabled: false,
        package: "growth",
      },
    ],
  },
];

export function getServiceCategory(categoryId) {
  return SERVICE_CATALOG.find((category) => category.id === categoryId) || null;
}

export function getService(categoryId, serviceId) {
  const category = getServiceCategory(categoryId);
  return category?.services.find((service) => service.id === serviceId) || null;
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
