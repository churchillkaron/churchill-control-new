export const INTEGRATION_REGISTRY = {

  ai: {

    id: "ai",

    name: "Artificial Intelligence",

    order: 10,

    providers: [

      {
        id: "openai",
        name: "OpenAI",
        capabilities: [
          "reasoning",
          "image",
          "speech",
          "embeddings",
        ],
      },

      {
        id: "anthropic",
        name: "Anthropic",
        capabilities: [
          "reasoning",
        ],
      },

      {
        id: "google_ai",
        name: "Google AI",
        capabilities: [
          "reasoning",
          "image",
          "video",
        ],
      },

      {
        id: "seedance",
        name: "Seedance",
        capabilities: [
          "video",
        ],
      },

      {
        id: "runway",
        name: "Runway",
        capabilities: [
          "video",
        ],
      },

      {
        id: "veo",
        name: "Veo",
        capabilities: [
          "video",
        ],
      },

      {
        id: "elevenlabs",
        name: "ElevenLabs",
        capabilities: [
          "voice",
        ],
      },

    ],

  },

  social: {

    id: "social",

    name: "Social",

    order: 20,

    providers: [

      {
        id: "meta",
        name: "Meta",
      },

      {
        id: "instagram",
        name: "Instagram",
      },

      {
        id: "threads",
        name: "Threads",
      },

      {
        id: "linkedin",
        name: "LinkedIn",
      },

      {
        id: "tiktok",
        name: "TikTok",
      },

      {
        id: "youtube",
        name: "YouTube",
      },

    ],

  },

  communication: {

    id: "communication",

    name: "Communication",

    order: 30,

    providers: [

      {
        id: "whatsapp",
        name: "WhatsApp",
      },

      {
        id: "email",
        name: "Email",
      },

      {
        id: "sms",
        name: "SMS",
      },

    ],

  },

  payments: {

    id: "payments",

    name: "Payments",

    order: 40,

    providers: [

      {
        id: "stripe",
        name: "Stripe",
      },

      {
        id: "adyen",
        name: "Adyen",
      },

      {
        id: "paypal",
        name: "PayPal",
      },

    ],

  },

  storage: {

    id: "storage",

    name: "Storage",

    order: 50,

    providers: [

      {
        id: "supabase",
        name: "Supabase",
      },

      {
        id: "aws_s3",
        name: "AWS S3",
      },

      {
        id: "cloudflare_r2",
        name: "Cloudflare R2",
      },

    ],

  },

};

export function getIntegrationRegistry() {

  return Object.values(
    INTEGRATION_REGISTRY
  );

}

export function getProvider(
  providerId
) {

  for (const category of Object.values(
    INTEGRATION_REGISTRY
  )) {

    const provider =
      category.providers.find(
        p => p.id === providerId
      );

    if (provider)
      return provider;

  }

  return null;

}

/*
==============================================================================
AVANTIQO PLATFORM SERVICE CATALOG (V2)
==============================================================================
Hierarchy

Services
    ↓
Connected Services
    ↓
Category
    ↓
Business Service
    ↓
Provider

Customer sees Business Services.
Avantiqo manages Providers.
==============================================================================*/

export const SERVICE_CATALOG = [

  {
    id: "ai",
    name: "AI & Intelligence",
    icon: "Sparkles",
    order: 10,

    services: [

      {
        id: "text_ai",
        name: "Text AI",
        icon: "MessageSquare",
        standard_for: ["all"],
        package: "STANDARD",
        managed_by: "AVANTIQO",
        authorization: "NONE",
        billable: true,

        providers: [
          "openai",
          "anthropic",
          "google_ai",
        ],
      },

      {
        id: "image_ai",
        name: "Image AI",
        icon: "Image",
        standard_for: [
          "restaurant",
          "hotel",
          "retail",
          "marketing",
          "creative",
        ],
        package: "PRO",
        managed_by: "AVANTIQO",
        authorization: "NONE",
        billable: true,

        providers: [
          "openai",
          "flux",
          "imagen",
          "recraft",
          "ideogram",
        ],
      },

      {
        id: "video_ai",
        name: "Video AI",
        icon: "Video",
        standard_for: [
          "marketing",
          "creative",
        ],
        package: "PRO",
        managed_by: "AVANTIQO",
        authorization: "NONE",
        billable: true,

        providers: [
          "seedance",
          "veo",
          "runway",
          "kling",
        ],
      },

      {
        id: "voice_ai",
        name: "Voice AI",
        icon: "Mic",
        standard_for: ["all"],
        package: "STANDARD",
        managed_by: "AVANTIQO",
        authorization: "NONE",
        billable: true,

        providers: [
          "elevenlabs",
        ],
      },

      {
        id: "ocr",
        name: "OCR",
        icon: "ScanText",
        standard_for: ["all"],
        package: "STANDARD",
        managed_by: "AVANTIQO",
        authorization: "NONE",
        billable: true,

        providers: [
          "google_ai",
        ],
      },

      {
        id: "translation",
        name: "Translation",
        icon: "Languages",
        standard_for: ["all"],
        package: "STANDARD",
        managed_by: "AVANTIQO",
        authorization: "NONE",
        billable: true,

        providers: [
          "google_ai",
          "openai",
        ],
      },

    ],

  },

  {
    id: "marketing",
    name: "Marketing & Social",
    icon: "Share2",
    order: 20,

    services: [

      {
        id: "facebook",
        name: "Facebook",
        standard_for: [
          "restaurant",
          "hotel",
          "retail",
        ],
        managed_by: "AVANTIQO",
        authorization: "ORGANIZATION",
        providers: ["meta"],
      },

      {
        id: "instagram",
        name: "Instagram",
        standard_for: [
          "restaurant",
          "hotel",
          "retail",
        ],
        managed_by: "AVANTIQO",
        authorization: "ORGANIZATION",
        providers: ["meta"],
      },

      {
        id: "google_business",
        name: "Google Business",
        standard_for: [
          "restaurant",
          "hotel",
          "retail",
        ],
        managed_by: "AVANTIQO",
        authorization: "ORGANIZATION",
        providers: ["google_ai"],
      },

    ],

  },

  {
    id: "travel",
    name: "Travel & Booking",
    icon: "Hotel",
    order: 30,

    services: [

      {
        id: "booking",
        name: "Booking Platforms",
        standard_for: ["hotel"],
        managed_by: "AVANTIQO",
        authorization: "ORGANIZATION",

        providers: [
          "booking_com",
          "agoda",
          "expedia",
          "airbnb",
          "trip_com",
        ],
      },

    ],

  },

];

export function getServiceCatalog() {
  return SERVICE_CATALOG;
}

export function getServiceCategory(categoryId) {
  return SERVICE_CATALOG.find(
    c => c.id === categoryId
  );
}

export function getBusinessService(serviceId) {

  for (const category of SERVICE_CATALOG) {

    const service =
      category.services.find(
        s => s.id === serviceId
      );

    if (service)
      return service;

  }

  return null;

}
