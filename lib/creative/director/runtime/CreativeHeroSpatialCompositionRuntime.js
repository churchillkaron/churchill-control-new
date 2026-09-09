export const CreativeHeroSpatialCompositionRuntime = Object.freeze({
  contract: "CREATIVE_HERO_SPATIAL_COMPOSITION_V1",

  create() {
    return {
      contract: "CREATIVE_HERO_SPATIAL_COMPOSITION_V1",
      subject_count: {
        primary: 1,
        secondary: 1,
      },
      duplicate_primary_subjects_forbidden: true,
      duplicate_secondary_subjects_forbidden: true,
      primary_subject_zone: "UPPER_LEFT_TO_CENTER",
      secondary_subject_zone: "CENTER_RIGHT_TO_LOWER_RIGHT",
      subjects_must_share_single_physical_axis: true,
      subjects_must_read_as_one_causal_event: true,
      horizon_target_vertical_percent: 38,
      horizon_tolerance_percent: 8,
      camera_distance_policy: "CLOSE_ENOUGH_FOR_INDUSTRIAL_DETAIL_AND_ROTOR_READABILITY",
      empty_foreground_water_max_percent: 42,
      disconnected_background_structures_forbidden: true,
      collage_or_multi_panel_layout_forbidden: true,
    };
  },
});
