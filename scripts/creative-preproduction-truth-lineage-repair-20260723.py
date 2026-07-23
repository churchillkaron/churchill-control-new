from pathlib import Path


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


# ---------------------------------------------------------------------------
# CreativeMissionComposerRuntime
# ---------------------------------------------------------------------------
path = Path("lib/creative/intent/CreativeMissionComposerRuntime.js")
text = path.read_text()

text