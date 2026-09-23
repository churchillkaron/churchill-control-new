export const AvantiqoMusicElasticModalProvider = Object.freeze({
  id: "retired-avantiqo-music-elastic-cloud",
  retired: true,
  local_only: true,
  async execute() { throw new Error("AVANTIQO_AUDIO_CLOUD_RUNTIME_RETIRED_LOCAL_ONLY"); },
  async getStatus() { throw new Error("AVANTIQO_AUDIO_CLOUD_RUNTIME_RETIRED_LOCAL_ONLY"); },
});
export default AvantiqoMusicElasticModalProvider;
