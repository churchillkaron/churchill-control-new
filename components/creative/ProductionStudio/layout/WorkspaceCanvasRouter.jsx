"use client";

import MissionWorkspace from "../workspaces/MissionWorkspace";
import BriefWorkspace from "../workspaces/BriefWorkspace";
import ResearchWorkspace from "../workspaces/ResearchWorkspace";
import StrategyWorkspace from "../workspaces/StrategyWorkspace";
import ConceptWorkspace from "../workspaces/ConceptWorkspace";
import StoryboardWorkspace from "../workspaces/StoryboardWorkspace";
import ProductionWorkspace from "../workspaces/ProductionWorkspace";
import RenderWorkspace from "../workspaces/RenderWorkspace";
import PublishingWorkspace from "../workspaces/PublishingWorkspace";

const WORKSPACES = {
  mission: MissionWorkspace,
  brief: BriefWorkspace,
  research: ResearchWorkspace,
  strategy: StrategyWorkspace,
  concept: ConceptWorkspace,
  storyboard: StoryboardWorkspace,
  production: ProductionWorkspace,
  render: RenderWorkspace,
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
