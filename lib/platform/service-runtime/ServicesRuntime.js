export const ServicesRuntime = {

  domain: "services",

  name: "Platform Services",

  version: "1.0.0",

  capabilities: {

    wallet: {

      Status: () =>
        import(
          "./wallet/capabilities/Status/execute.js"
        ),

      TopUp: () =>
        import(
          "./wallet/capabilities/TopUp/execute.js"
        ),

    },

  },

};
