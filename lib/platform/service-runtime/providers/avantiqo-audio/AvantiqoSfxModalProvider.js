export const AvantiqoSfxModalProvider = Object.freeze({
  id: "retired-avantiqo-sfx-cloud",
  retired: true,
  local_only: true,
  async execute() { throw new Error("AVANTIQO_AUDIO_CLOUD_RUNTIME_RETIRED_LOCAL_ONLY"); },
  async getStatus() { throw new Error("AVANTIQO_AUDIO_CLOUD_RUNTIME_RETIRED_LOCAL_ONLY"); },
});
export default AvantiqoSfxModalProvider;
