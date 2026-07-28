#!/usr/bin/env node

throw new Error(
  [
    "UNSAFE_LEGACY_MASTER_RENDER_DISABLED",
    "This renderer selected local shortlist ranges without mandatory durable semantic verification and editorial approval.",
    "Use CreativeMasterVideoRenderRuntime v4 through the canonical Creative Studio production flow.",
  ].join(":"),
);
