import { MissionEngine } from "./engines/MissionEngine";
import { DirectorEngine } from "./engines/DirectorEngine";
import { ResearchEngine } from "./engines/ResearchEngine";
import { PlanningEngine } from "./engines/PlanningEngine";
import { ActorEngine } from "./engines/ActorEngine";
import { AssetEngine } from "./engines/AssetEngine";
import { VoiceEngine } from "./engines/VoiceEngine";
import { MusicEngine } from "./engines/MusicEngine";
import { SceneEngine } from "./engines/SceneEngine";
import { ShotEngine } from "./engines/ShotEngine";
import { TimelineEngine } from "./engines/TimelineEngine";
import { RenderEngine } from "./engines/RenderEngine";
import { QAEngine } from "./engines/QAEngine";
import { PublishingEngine } from "./engines/PublishingEngine";
import { LearningEngine } from "./engines/LearningEngine";

export const CreativeRuntime = {

  domain: "creative",

  name: "Creative Studio",

  version: "1.0.0",

  capabilities: {
    studio: {
      prepareProject: () =>
        import(
          "@/lib/creative/studio/capabilities/prepareStudioProject"
        ),
      inspectProject: () =>
        import(
          "@/lib/creative/studio/capabilities/inspectStudioProject"
        ),
      inspectDirection: () =>
        import(
          "@/lib/creative/studio/capabilities/inspectStudioDirection"
        ),
      reviseShot: () =>
        import(
          "@/lib/creative/studio/capabilities/reviseStudioShot"
        ),
      planShotSetRevision: () =>
        import(
          "@/lib/creative/studio/capabilities/planStudioShotSetRevision"
        ),
      reviseShotSet: () =>
        import(
          "@/lib/creative/studio/capabilities/reviseStudioShotSet"
        ),
      restoreShotSetRevision: () =>
        import(
          "@/lib/creative/studio/capabilities/restoreStudioShotSetRevision"
        ),
    },
    production: {
      inspect: () =>
        import(
          "@/lib/creative/production/capabilities/inspectCreativeProduction"
        ),
      run: () =>
        import(
          "@/lib/creative/production/capabilities/runCreativeProduction"
        ),
    },
  },

  engines: {
    mission: MissionEngine,
    director: DirectorEngine,
    research: ResearchEngine,
    planning: PlanningEngine,
    actor: ActorEngine,
    asset: AssetEngine,
    voice: VoiceEngine,
    music: MusicEngine,
    scene: SceneEngine,
    shot: ShotEngine,
    timeline: TimelineEngine,
    render: RenderEngine,
    qa: QAEngine,
    publishing: PublishingEngine,
    learning: LearningEngine,
  },

  get(name) {
    return this.engines[name];
  },

  all() {
    return this.engines;
  }

};