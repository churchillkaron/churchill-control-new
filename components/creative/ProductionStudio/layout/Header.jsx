"use client";

import RunCreativePipelineButton from "../actions/RunCreativePipelineButton";

export default function Header({
  runtime,
  editor,
}) {
  const commands = runtime.commands || [];
  const hasProject = Boolean(runtime.projectRuntime?.current?.id);
  const productionActive = editor?.activeWorkspace === "production";

  function openProductionControl()