"use client";

import { useCreativeEditor } from "./hooks/useCreativeEditor";
import { useCreativeOrchestration } from "./hooks/useCreativeOrchestration";
import {
  resolveCreativeCommands,
} from "@/lib/creative/studio/commands/CreativeCommandResolver";

import CreativeWorkspaceLayout from "./layout/CreativeWorkspaceLayout";
import Header from "./layout/Header";
import Sidebar from "./layout/Sidebar";
import Canvas from "./layout/Canvas";
import Inspector from "./layout/Inspector";
import BottomDock from "./layout/BottomDock";

export default function ProductionStudio({
  runtime,
}) {
  const editor = useCreativeEditor(runtime);
  const orchestration = useCreativeOrchestration(runtime);
  const reviewPhase = orchestration.current?.phases?.find(
    (phase) => phase.id === "review",
  ) || null;

  const governedEditor = {
    ...editor,
    setActiveWorkspace(nextWorkspace) {
      if (
        nextWorkspace === "render" &&
        reviewPhase &&
        reviewPhase.status !== "COMPLETE"
      ) {
        editor.setActiveWorkspace("review");
        return;
      }
      editor.setActiveWorkspace(nextWorkspace);
    },
  };

  const refresh = async () => {
    editor.refresh();
    await orchestration.refresh({ quiet: true });
  };

  const liveRuntime = {
    ...runtime,
    orchestrationRuntime: orchestration,
    commands: resolveCreativeCommands({
      commands: runtime.commands || [],
      runtime: {
        ...runtime,
        refresh,
      },
      editor: governedEditor,
    }),
    refresh,
    refreshing: editor.refreshing || orchestration.loading,
  };

  const activeWorkspace =
    runtime.workspaces?.find(
      (workspace) => workspace.id === editor.activeWorkspace,
    ) || runtime.workspace || null;
  const layout = activeWorkspace?.layout || {};

  return (
    <CreativeWorkspaceLayout
      header={
        <Header
          runtime={liveRuntime}
          editor={governedEditor}
        />
      }
      sidebar={
        <Sidebar
          runtime={liveRuntime}
          editor={governedEditor}
        />
      }
      canvas={
        <Canvas
          runtime={liveRuntime}
          editor={governedEditor}
        />
      }
      showInspector={layout.inspector !== false}
      showDock={layout.dock === true}
      inspector={
        <Inspector
          runtime={liveRuntime}
          editor={governedEditor}
        />
      }
      dock={
        <BottomDock
          runtime={liveRuntime}
          editor={governedEditor}
        />
      }
    />
  );
}
