export function resolveCreativeCommands({
  commands = [],
  runtime,
  editor,
}) {
  return commands.map((command) => {
    let onClick = null;

    if (command.id === "create_mission") {
      onClick = async () => {
        const intent = window.prompt(
          "What do you want Avantiqo Creative Studio to create?",
        );
        if (!intent?.trim()) return;

        const response = await fetch("/api/creative/create", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            organization_id: runtime.organizationId,
            intent: intent.trim(),
          }),
        });
        const result = await response.json();

        if (!response.ok || result.success === false) {
          throw new Error(
            result.error || "Creative intent creation failed",
          );
        }

        editor.setActiveWorkspace("brief");
        await runtime.refresh?.();
      };
    }

    if (command.id === "start_mission") {
      onClick = async () => {
        const mission = runtime.missionRuntime?.current;
        if (!mission) return;

        const response = await fetch("/api/creative/missions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            organization_id: runtime.organizationId,
            id: mission.id,
            action: "start",
          }),
        });
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "Mission start failed");
        }

        editor.setActiveWorkspace("brief");
        await runtime.refresh?.();
      };
    }

    if (command.id === "open_assets") {
      onClick = () => {
        editor.setActiveWorkspace("assets");
      };
    }

    return {
      ...command,
      onClick,
    };
  });
}
