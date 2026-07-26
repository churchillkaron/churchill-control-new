from pathlib import Path


def replace_once(path, old, new):
    file = Path(path)
    source = file.read_text()
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"EXPECTED_ONE_MATCH:{path}:{count}")
    file.write_text(source.replace(old, new, 1))


path = "lib/creative/production-graph/planner/ProductionGraphPlanner.js"

replace_once(
    path,
    '''function shotRequirements(scene = {}, shot = {}) {
  const actors = list(shot.actors).length ? shot.actors : scene.actors || [];
''',
    '''function shotRequirements(scene = {}, shot = {}) {
  const framePlan = object(shot.frame_plan);
  const audio = object(shot.audio);
  const actors = list(shot.actors).length ? shot.actors : scene.actors || [];
''',
)

replace_once(
    path,
    '''    opening_frame: shot.opening_frame || {},
    progression_frames: shot.progression_frames || [],
    closing_frame: shot.closing_frame || {},
''',
    '''    opening_frame: framePlan.opening_frame || shot.opening_frame || {},
    progression_frames:
      framePlan.progression_frames ||
      framePlan.progression ||
      shot.progression_frames ||
      [],
    closing_frame: framePlan.closing_frame || shot.closing_frame || {},
''',
)

replace_once(
    path,
    '''    music: shot.music || {},
    sound_effects: shot.sound_effects || [],
    sound_design: shot.sound_design || {},
''',
    '''    music: audio.music || shot.music || {},
    sound_effects: audio.sound_effects || shot.sound_effects || [],
    audio: Object.keys(audio).length ? audio : shot.sound_design || {},
''',
)

replace_once(
    path,
    '''    repair_contract: generation.repair_contract || shot.repair_contract || {},
''',
    '''    repair_instructions: compact([
      generation.repair_instructions || [],
      shot.repair_instructions || [],
      generation.repair_contract?.instructions || [],
      shot.repair_contract?.instructions || [],
    ]),
''',
)

replace_once(
    path,
    '''      agency_decisions: creative_plan.agency_decisions || [],
''',
    '''      role_decisions:
        creative_plan.role_decisions ||
        creative_plan.agency_decisions ||
        {},
''',
)

replace_once(
    path,
    '''      const requirements = shotRequirements(scene, shot);
      const existingAssets = compact([
        shot.assets || [],
        shot.reference_asset_ids || [],
      ]);
''',
    '''      const requirements = shotRequirements(scene, shot);
      const assignedAssets = compact(shot.assets || []);
      const referenceAssets = compact(shot.reference_asset_ids || []);
      const availableAssets = compact([assignedAssets, referenceAssets]);
''',
)

replace_once(
    path,
    '''            opening_frame: shot.opening_frame || {},
            progression_frames: shot.progression_frames || [],
            closing_frame: shot.closing_frame || {},
''',
    '''            opening_frame:
              shot.frame_plan?.opening_frame ||
              shot.opening_frame ||
              {},
            progression_frames:
              shot.frame_plan?.progression_frames ||
              shot.frame_plan?.progression ||
              shot.progression_frames ||
              [],
            closing_frame:
              shot.frame_plan?.closing_frame ||
              shot.closing_frame ||
              {},
''',
)

replace_once(
    path,
    '''          assets: existingAssets,
          generation: generationContract(scene, shot, existingAssets),
''',
    '''          assets: assignedAssets,
          generation: generationContract(scene, shot, assignedAssets),
''',
)

replace_once(
    path,
    '''            provider_prompt: shot.provider_prompt || null,
            provider_parameters: shot.provider_parameters || {},
            repair_contract: shot.repair_contract || {},
            frame_contract: {
              opening_frame: shot.opening_frame || {},
              progression_frames: shot.progression_frames || [],
              closing_frame: shot.closing_frame || {},
            },
''',
    '''            provider_prompt:
              shot.generation?.provider_prompt ||
              shot.provider_prompt ||
              null,
            provider_parameters:
              shot.generation?.provider_parameters ||
              shot.provider_parameters ||
              {},
            repair_instructions: compact([
              shot.generation?.repair_instructions || [],
              shot.repair_instructions || [],
              shot.generation?.repair_contract?.instructions || [],
              shot.repair_contract?.instructions || [],
            ]),
            frame_plan: {
              opening_frame:
                shot.frame_plan?.opening_frame ||
                shot.opening_frame ||
                {},
              progression_frames:
                shot.frame_plan?.progression_frames ||
                shot.frame_plan?.progression ||
                shot.progression_frames ||
                [],
              closing_frame:
                shot.frame_plan?.closing_frame ||
                shot.closing_frame ||
                {},
            },
            reference_asset_ids: referenceAssets,
            available_asset_ids: availableAssets,
''',
)

Path("scripts/agent-production-schema-convergence.py").unlink()
Path(".github/workflows/agent-production-schema-convergence.yml").unlink()
