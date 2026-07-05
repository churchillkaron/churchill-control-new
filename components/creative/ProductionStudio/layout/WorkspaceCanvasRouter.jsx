"use client";

import ProductionGraph from "../canvas/ProductionGraph";
import TimelinePanel from "../timeline/TimelinePanel";
import AssetBrowser from "../assets/AssetBrowser";

import MissionWorkspace from "../workspaces/MissionWorkspace";
import BriefWorkspace from "../workspaces/BriefWorkspace";
import ResearchWorkspace from "../workspaces/ResearchWorkspace";
import StrategyWorkspace from "../workspaces/StrategyWorkspace";
import ConceptWorkspace from "../workspaces/ConceptWorkspace";
import StoryboardWorkspace from "../workspaces/StoryboardWorkspace";
import PublishingWorkspace from "../workspaces/PublishingWorkspace";
import RenderWorkspace from "../workspaces/RenderWorkspace";

export default function WorkspaceCanvasRouter({
  runtime,
  editor,
}) {

  switch (editor.activeWorkspace) {

    case "mission_control":
      return (
        <MissionWorkspace
          runtime={runtime}
          editor={editor}
        />
      );

    case "brief":
      return (
        <BriefWorkspace
          runtime={runtime}
          editor={editor}
        />
      );

    case "research":
      return (
        <ResearchWorkspace
          runtime={runtime}
          editor={editor}
        />
      );

    case "strategy":
      return (
        <StrategyWorkspace
          runtime={runtime}
          editor={editor}
        />
      );

    case "concept":
      return (
        <ConceptWorkspace
          runtime={runtime}
          editor={editor}
        />
      );

    case "storyboard":
      return (
        <StoryboardWorkspace
          runtime={runtime}
          editor={editor}
        />
      );

    case "timeline":
      return (
        <TimelinePanel
          runtime={runtime}
          editor={editor}
        />
      );

    case "assets":
      return (
        <AssetBrowser
          runtime={runtime}
          editor={editor}
        />
      );

    case "render":
      return (
        <RenderWorkspace
          runtime={runtime}
          editor={editor}
        />
      );

    case "publish":
      return (
        <PublishingWorkspace
          runtime={runtime}
          editor={editor}
        />
      );

    case "production":
    default:
      return (
        <ProductionGraph
          runtime={runtime}
          editor={editor}
        />
      );

  }

}
