# Creative World-Class QA

The Creative world-class benchmark is isolated from the normal production build path.

## Runtime boundary

- UI: `/design/studio/quality`
- API: `POST /api/creative/qa/world-class-benchmark`
- Execution: one benchmark case per authenticated request
- Provider activity: governed reasoning only
- Media generation: forbidden
- Publication: forbidden
- Production graph creation: forbidden
- Production task creation: forbidden

The benchmark uses the application's existing Vercel runtime environment and Service Runtime billing path. It is not executed by `prebuild` or by normal deployments.

Organization-specific benchmark evidence lives only in the Creative test-fixture boundary. The shared quality runtime remains organization- and industry-agnostic.
