from pathlib import Path

path = Path("lib/intelligence/runtime/AvantiqoFinalKnowledgeReleaseRuntime.js")
source = path.read_text()

def replace_exact(before, after, label):
    global source
    count = source.count(before)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one anchor, found {count}")
    source = source.replace(before, after, 1)

replace_exact(
'''  approvalReason,
  releaseNote,
  nowIso,
}) {''',
'''  approvalReason,
  authorizationConsumption,
  releaseNote,
  nowIso,
}) {''',
"knowledge row authorization consumption argument")

replace_exact(
'''    approvalReason,
    releaseNote: release_note,
    nowIso,
  });''',
'''    approvalReason,
    authorizationConsumption,
    releaseNote: release_note,
    nowIso,
  });''',
"knowledge row authorization consumption call")

path.write_text(source)
print("AVANTIQO_FINAL_RELEASE_AUTHORIZATION_CONSUMPTION_WIRING_FIXED")
