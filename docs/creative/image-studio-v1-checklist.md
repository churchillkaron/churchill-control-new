# Image Studio Pro Canvas V1 — implementation checklist

1. **Foundation** — canonical `creative_projects`, `creative_assets`, and `creative_execution_jobs` remain authoritative; editor-only tables add artboards, layers, references, comments, versions, and exports.
2. **Route / capability structure** — Image Studio remains inside the Creative capability and existing `CreativeSpecialistStudio` route; no parallel mini-app or tenant bypass is introduced.
3. **Contracts** — `CreativeImageStudioWorkspaceRuntime` owns normalized artboard/layer state plus the prompt-free command vocabulary used by Business Partner and Studio.
4. **Editor state** — Zustand owns ephemeral selection, viewport, active panel/tool, compare state, and dirty state; durable state is persisted through the repository.
5. **Service / action boundary** — `CreativeImageStudioWorkspaceRepository` performs organization-scoped durable reads/writes. Generation remains in canonical Creative execution jobs/provider routing.
6. **V1 workspace UI** — professional shell supports artboards, layers, references, comments, versions, assets, output, selection tooling, compare mode, and deterministic exact-design controls without exposing provider prompts.
7. **Verification** — contract tests must prove prompt-free command validation, normalization, organization/project requirements, panel/tool vocabulary, and migration coverage. Production deployment is not part of this pass.
