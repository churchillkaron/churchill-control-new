import {
  ProviderCircuitBreaker,
} from "../monitor/ProviderCircuitBreaker";

export const ProviderHealthRuntime = {

  list() {

    const blocked =
      ProviderCircuitBreaker.list();

    return [

      {
        id: "openai",
        online:
          ProviderCircuitBreaker.allow(
            "openai",
          ),
      },

      {
        id: "google_veo",
        online:
          ProviderCircuitBreaker.allow(
            "google_veo",
          ),
      },

      {
        id: "runway",
        online:
          ProviderCircuitBreaker.allow(
            "runway",
          ),
      },

      {
        id: "kling",
        online:
          ProviderCircuitBreaker.allow(
            "kling",
          ),
      },

      {
        id: "elevenlabs",
        online:
          ProviderCircuitBreaker.allow(
            "elevenlabs",
          ),
      },

      {
        id: "suno",
        online:
          ProviderCircuitBreaker.allow(
            "suno",
          ),
      },

    ];

  },

};
