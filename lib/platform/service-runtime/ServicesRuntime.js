export const ServicesRuntime = {

  domain: "services",

  name: "Platform Services",

  version: "1.0.0",

  capabilities: {

    wallet: {

      Status: () =>
        import(
          "@/lib/platform/service-runtime/wallet/capabilities/Status/execute"
        ),

      TopUp: () =>
        import(
          "@/lib/platform/service-runtime/wallet/capabilities/TopUp/execute"
        ),

    },

  },

};
