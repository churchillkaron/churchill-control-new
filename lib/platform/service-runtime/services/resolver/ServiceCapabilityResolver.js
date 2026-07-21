import {
  SERVICE_CATALOG,
} from "@/lib/platform/registry/business-services/BusinessServiceRegistry";

const CANONICAL_SERVICE_CAPABILITIES = {
  "ai.text.generate": ["ai.text.generate"],
  "ai.reasoning.execute": ["ai.reasoning.execute"],
  "ai.image.generate": ["ai.image.generate"],
  "ai.image.analyze": ["ai.image.analyze"],
  "ai.image.upscale": ["ai.image.upscale"],
  "ai.video.generate": ["ai.video.generate"],
  "ai.video.image_to_video": ["ai.video.image_to_video"],
  "ai.voice.generate": ["ai.voice.generate"],
  "ai.music.generate": ["ai.music.generate"],
  "ai.sfx.generate": ["ai.sfx.generate"],
  "ai.speech.to.text": ["ai.speech.to.text"],
  "ai.video.lipsync": ["ai.video.lipsync"],
  "document.ocr": ["document.ocr"],
  "document.classify": ["document.classify"],
};

const SERVICE_PACKAGE_ALIASES = {
  "ai.text.generate": "text-ai",
  "ai.reasoning.execute": "text-ai",
  "ai.image.generate": "image-ai",
  "ai.image.analyze": "image-ai",
  "ai.image.upscale": "image-ai",
  "ai.video.generate": "video-ai",
  "ai.video.image_to_video": "video-ai",
  "ai.voice.generate": "voice-ai",
  "ai.music.generate": "voice-ai",
  "ai.sfx.generate": "voice-ai",
  "ai.speech.to.text": "voice-ai",
  "ai.video.lipsync": "video-ai",
  "document.ocr": "ocr",
  "document.classify": "ocr",
};

function findCatalogService(serviceId) {
  for (const category of SERVICE_CATALOG) {
    const service = (category.services || []).find(
      (item) => item.id === serviceId,
    );

    if (service) return service;
  }

  return null;
}

export function resolveServiceCapabilities(serviceId) {
  const direct = findCatalogService(serviceId);

  if (direct) {
    return {
      service_id: direct.id,
      name: direct.name,
      package: direct.package,
      capabilities: direct.requires || [],
    };
  }

  const capabilities = CANONICAL_SERVICE_CAPABILITIES[serviceId];
  if (!capabilities) return null;

  const packageService = findCatalogService(
    SERVICE_PACKAGE_ALIASES[serviceId],
  );

  return {
    service_id: serviceId,
    name: serviceId,
    package: packageService?.package || "core",
    package_service_id:
      packageService?.id ||
      SERVICE_PACKAGE_ALIASES[serviceId] ||
      null,
    capabilities,
  };
}

export function resolveOrganizationCapabilities(services = []) {
  return services.flatMap((service) => {
    const resolved = resolveServiceCapabilities(
      service.service_id,
    );

    if (!resolved) return [];

    return [
      {
        ...resolved,
        status: service.status,
        organization_service_id: service.id,
      },
    ];
  });
}
