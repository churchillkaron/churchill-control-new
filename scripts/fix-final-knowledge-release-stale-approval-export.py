from pathlib import Path

# One-time exact-anchor repair for the removed global release approval switch.
path = Path("lib/intelligence/runtime/AvantiqoFinalKnowledgeReleaseRuntime.js")
source = path.read_text()
stale = "  approval_env: RELEASE_APPROVAL_ENV,\n"
if stale in source:
    if source.count(stale) != 1:
        raise SystemExit(f"expected exactly one stale approval export, found {source.count(stale)}")
    source = source.replace(stale, "", 1)
    path.write_text(source)
    print("AVANTIQO_STALE_RELEASE_APPROVAL_EXPORT_REMOVED")
else:
    print("AVANTIQO_STALE_RELEASE_APPROVAL_EXPORT_ALREADY_REMOVED")
