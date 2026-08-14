// Scripted stand-in for the organization service catalogue, used only by the
// repair-path test. Keeps the test free of a database so it can run anywhere,
// including in CI where no Supabase instance is reachable.
//
// The shape mirrors what OrganizationServiceRuntime.list returns: categories that
// each hold services. ai.reasoning.execute is present because the director requires
// it, and the image and video services are what the test plans reference.

const SERVICES = [
  "ai.reasoning.execute",
  "ai.image.generate",
  "ai.video.generate",
  "ai.music.generate",
];

export const OrganizationServiceRuntime = Object.freeze({
  async list() {
    return [
      {
        id: "stub-category",
        name: "Stub AI",
        services: SERVICES.map((serviceId) => ({
          id: `stub-${serviceId}`,
          service_id: serviceId,
          status: "ACTIVE",
          usage_enabled: true,
          billing_enabled: true,
        })),
      },
    ];
  },
});

export default OrganizationServiceRuntime;
