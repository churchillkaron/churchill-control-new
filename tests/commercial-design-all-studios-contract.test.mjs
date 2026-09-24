import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { applyCreativeWorkspaceRegistry } from "../lib/creative/registry/applyCreativeWorkspaceRegistry.js";

function fixture() {
  return {
    domains: [],
    workspaces: {
      commercial: {
        description: "Commercial",
        groups: [
          {
            id: "marketing",
            name: "Marketing",
            items: [
              { id: "campaigns", name: "Campaigns", route: "/commercial/marketing", status: "active" },
              {
                id: "design_studio",
                name: "Design Studio",
                route: "/commercial/design",
                status: "active",
                workspaces: [],
                engines: [],
              },
            ],
          },
        ],
      },
    },
  };
}

test("Commercial keeps Design as the visible canonical all-studios entry point", () => {
  const registry = applyCreativeWorkspaceRegistry(fixture());
  const marketing = registry.workspaces.commercial.groups.find((group) => group.id === "marketing");
  const design = marketing?.items?.find((item) => item.id === "design_studio");

  assert.ok(marketing, "Commercial Marketing group must remain present");
  assert.ok(design, "Commercial Design must remain visible");
  assert.equal(design.route, "/commercial/design");
  assert.equal(design.status, "active");
  assert.equal(design.hidden, false);
  assert.match(design.description, /Image, Video, Voice, Music, Code, Marketing and Web/);
});

test("/commercial/design root renders the all-studios hub while deep workspaces keep the runtime", () => {
  const source = fs.readFileSync(
    "app/(system)/workspace/[organizationId]/commercial/design/[[...workspace]]/page.jsx",
    "utf8",
  );

  assert.match(source, /CreativeStudioHub/);
  assert.match(source, /workspace.length === 0/);
  assert.match(source, /CreativeWorkspaceRenderer/);
  assert.match(source, /resolveCreativeStudioRuntime/);
});

test("Design hub exposes every governed studio family", () => {
  const source = fs.readFileSync("components/creative/CreativeStudioHub.jsx", "utf8");

  for (const studioId of [
    "image_studio",
    "video_studio",
    "voice_studio",
    "music_studio",
    "code_studio",
    "marketing",
    "web_builder",
  ]) {
    assert.match(source, new RegExp(studioId));
  }

  assert.match(source, /creative_studio/);
  assert.match(source, /All studios in one place/);
});
