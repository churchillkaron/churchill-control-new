"use client";

import { useMemo } from "react";

import { useCreativeEditor } from "./hooks/useCreativeEditor";
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
  const editor =
    useCreativeEditor(runtime);

  const activeWorkspace = useMemo(() => (
    (runtime.workspaces || []).find(
      (workspace) =>
        workspace.id === editor.activeWorkspace,
    ) ||
    runtime.workspace ||
    null
  ), [
    editor.activeWorkspace,
    runtime.workspace,
    runtime.workspaces,
  ]);

  const liveRuntime = {
    ...runtime,
    workspace: activeWorkspace,
    commands: resolveCreativeCommands({
      commands: runtime.commands || [],
      runtime: {
        ...runtime,
        workspace: activeWorkspace,
        refresh: editor.refresh,
      },
      editor,
    }),
    refresh: editor.refresh,
    refreshing: editor.refreshing,
  };

  const layout =
    activeWorkspace?.layout || {};

  const isProduction =
    activeWorkspace?.id === "production";

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
      showInspector={
        isProduction
          ? false
          : layout.inspector !== false
      }
      showDock={
        isProduction
          ? true
          : layout.dock === true
      }
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
