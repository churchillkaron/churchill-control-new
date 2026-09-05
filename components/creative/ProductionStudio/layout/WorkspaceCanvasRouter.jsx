"use client";

import MissionWorkspace from "../workspaces/MissionWorkspace";
import BriefWorkspace from "../workspaces/BriefWorkspace";
import ResearchWorkspace from "../workspaces/ResearchWorkspace";
import StrategyWorkspace from "../workspaces/StrategyWorkspace";
import ConceptWorkspace from "../workspaces/ConceptWorkspace";
import StoryboardWorkspace from "../workspaces/StoryboardWorkspace";
import ProductionWorkspace from "../workspaces/ProductionWorkspace";
import MusicStudioWorkspace from "../workspaces/MusicStudioWorkspace";
import AssetsWorkspace from "../workspaces/AssetsWorkspace";
import TimelineWorkspace from "../workspaces/TimelineWorkspace";
import ReviewWorkspace from "../workspaces/ReviewWorkspace";
import LearningWorkspace from "../workspaces/LearningWorkspace";
import RenderWorkspace from "../workspaces/RenderWorkspace";
import PublishingWorkspace from "../workspaces/PublishingWorkspace";
import DocumentsWorkspace from "../workspaces/DocumentsWorkspace";

const WORKSPACES = {
  mission: MissionWorkspace,
  brief: BriefWorkspace,
  research: ResearchWorkspace,
  strategy: StrategyWorkspace,
  concept: ConceptWorkspace,
  storyboard: StoryboardWorkspace,
  production: ProductionWorkspace,
  music: MusicStudioWorkspace,
  assets: AssetsWorkspace,
  timeline: TimelineWorkspace,
  review: ReviewWorkspace,
  learning: LearningWorkspace,
  render: RenderWorkspace,
  documents: DocumentsWorkspace,
  publishing: PublishingWorkspace,
};

export default function WorkspaceCanvasRouter({
  runtime,
  editor,
}) {

  const workspaceId =
    editor.activeWorkspace ||
    runtime.workspace?.id ||
    "mission";

  const Workspace =
    WORKSPACES[workspaceId] ||
    MissionWorkspace;

  return (
    <div className="h-full overflow-auto">
      <Workspace
        runtime={runtime}
        editor={editor}
      />
    </div>
  );
}
