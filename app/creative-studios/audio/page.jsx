import CreativeStudioProductPage from "@/components/public/CreativeStudioProductPage";

export const metadata = {
  title: "Audio Post | Avantiqo",
  description: "Avantiqo Audio Post is a picture-aware professional sound environment for dialogue, Foley, SFX, world acoustics, spatial mixing, 5.1 / 7.1 / 7.1.4 mastering and delivery.",
};

export default function Page() {
  return <CreativeStudioProductPage
    studio="Audio Post"
    title="A complete sound-to-picture production room."
    subtitle="Not a background track. Full cinema audio production."
    description="Audio Post keeps sound locked to picture and timecode from spotting through final master: dialogue, ADR, Foley, ambience, designed SFX, music, object movement, world acoustics, routing, automation, premix, HRTF binaural preview, 5.1 / 7.1 / 7.1.4 rendering, stems, mastering and QC. The original sources remain preserved while approved processing and repair are versioned and reviewable."
    capabilities={[
      ["Picture-aware world acoustics", "Material-aware occlusion for walls, glass, wood, vehicle body, brick, concrete, metal and curtains, including attenuation, high-frequency loss, animated occlusion and changing room/reflection behavior locked to picture."],
      ["Spatial preview & multichannel render", "The same picture-aware behavior carries from HRTF binaural preview into final stereo, 5.1, 7.1 and native 7.1.4 speaker-layout rendering with picture-locked automation."],
      ["Measured ADR acoustic continuity", "Production dialogue and ADR are A/B measured for loudness, low/body/presence/air balance, perspective and room-tone continuity before engineer approval."],
      ["Non-destructive ADR matching", "Approved ADR matching renders a new 24-bit matched asset, keeps the original ADR untouched and requires an explicit Use matched asset action rather than silently replacing the take."],
      ["Dialogue / DX editorial", "Production dialogue cleanup, timing, continuity, replacement-ready material, dialogue stems and controlled restoration without flattening source history."],
      ["Foley & cinematic SFX", "Footsteps, cloth, props, vehicles, impacts, mechanical layers, subs, sweeteners, ambience and designed effects remain separate, editable production layers."],
      ["Premix / re-recording architecture", "DX, ADR, VO, Foley, FX, backgrounds and music route through controlled buses, sends, dynamics, reverbs, LFE eligibility, automation and stem architecture."],
      ["Mastering & delivery", "Loudness, true peak, dynamic range, phase, downmix and translation QC plus DX / FX / MX / M&E stems, multichannel masters and final picture mux packages."],
    ]}
    useCases={[
      ["Commercial films", "Premium dialogue, Foley, sound design, world acoustics, spatial movement and final mixes for brand and advertising films."],
      ["Narrative film & ADR", "Scene-based dialogue continuity, ADR matching, environments, Foley, designed effects and multichannel delivery."],
      ["Automotive", "Layer intake, exhaust, transmission, tires, wind, mechanics, body resonance, reflections, transient detail and sub energy as coherent picture-aware sound objects."],
      ["Product & launch films", "Precise sync, tactile Foley, impact design, acoustic perspective and spatial movement tied directly to product action."],
      ["Immersive mixes", "HRTF preview plus 5.1 / 7.1 / 7.1.4 production with object-aware movement and room behavior. Dolby certification is only claimed when a licensed Dolby delivery chain is actually connected."],
      ["Mastering & versioning", "Create stereo, surround, immersive, M&E, near-field and platform variants from one governed project state without destroying the approved mix."],
    ]}
    cta="Build the soundtrack, not just the audio track."
  />;
}
