import CreativeStudioProductPage from "@/components/public/CreativeStudioProductPage";

export const metadata = {
  title: "Video Studio | Avantiqo",
  description: "Avantiqo Video Studio is a professional film, VFX and finishing environment built around real shot production, 3D, simulation, compositing, color, audio and delivery.",
};

export default function Page() {
  return <CreativeStudioProductPage
    studio="Video Studio"
    title="An intelligent film-production house."
    subtitle="Not prompt-to-video. Full cinematic production."
    description="Creative direction, storyboard and previs move into shot production, owned video generation, Blender/Cycles 3D, physical simulation, matchmove, roto, multilayer EXR/AOV rendering, VFX compositing, optical finishing, edit and picture lock, Color/DI, sealed Audio Studio mastering, temporal 4K and delivery QC. Generation is one department in the pipeline — not the product."
    capabilities={[
      ["Creative direction & shot architecture", "Treatment, storyboard/previs, camera language, continuity, shot purpose and exact production state before expensive rendering begins."],
      ["3D / Cycles production", "Blender/Cycles rendering, OpenUSD scene composition and variants, automotive materials, measured paint/carbon/glass workflows and governed MaterialX interchange."],
      ["EXR / AOV production", "Multilayer EXR with Z, normals, vectors and Cryptomatte for repairable VFX passes. Deep EXR architecture exists and remains under production certification rather than being marketed as finished."],
      ["Simulation & FX", "Rigid and soft body, liquid, cloth, particles, pyro, atmosphere and other physically controlled effects as independent shot layers."],
      ["Matchmove & roto", "Calibrated camera solving, feature tracking, distortion/parallax evidence and governed roto propagation for integrating live-action plates with CG and VFX."],
      ["Professional compositing", "Mattes, depth, keying, tracking, cleanup, relighting, atmosphere, shot assembly and targeted pass repair instead of flattening the whole shot."],
      ["Lens / optical / Color DI", "Lens and sensor finishing, motion character, halation, grain, bloom, distortion plus ACES/OCIO-aware color authority and HDR targets including Rec.2020/PQ."],
      ["Edit, audio & mastering", "Picture lock, ProRes workflows, sealed Audio Studio master integration, temporal 4K / FlashVSR, deterministic master certification and derivative/channel QC."],
    ]}
    useCases={[
      ["Automotive commercials", "Camera-accurate live action, CG materials, tracking, simulation, VFX, optical finishing, sound and final color in one governed shot pipeline."],
      ["Brand films", "Narrative films with controlled direction, continuity, VFX and final finishing rather than disconnected generated clips."],
      ["Product films", "Precise product cinematography, material control, passes, simulation, compositing and high-end optical polish."],
      ["VFX-heavy campaigns", "Shot reconstruction, matchmove, roto, AOVs, compositing and targeted repair for demanding commercial work."],
      ["Launch films", "Directed hero shots, simulations, sound design, Color/DI, picture lock and release-ready masters."],
      ["Long-form productions", "Scene and shot systems that preserve approved work and source lineage across larger productions."],
    ]}
    cta="Build the film, not just the clip."
  />;
}
