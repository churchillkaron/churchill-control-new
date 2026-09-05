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
      editor,
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
          editor={editor}
        />
      }
      sidebar={
        <Sidebar
          runtime={liveRuntime}
          editor={editor}
        />
      }
      canvas={
        <Canvas
          runtime={liveRuntime}
          editor={editor}
        />
      }
      showInspector={layout.inspector !== false}
      showDock={layout.dock === true}
      inspector={
        <Inspector
          runtime={liveRuntime}
          editor={editor}
        />
      }
      dock={
        <BottomDock
          runtime={liveRuntime}
          editor={editor}
        />
      }
    />
  );
}
